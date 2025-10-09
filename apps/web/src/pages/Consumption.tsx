import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, Calendar, Zap, Clock, AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { enedisApi } from '../api/enedis'
import { pdlApi } from '../api/pdl'
import toast, { Toaster } from 'react-hot-toast'

interface IntervalReading {
  date: string
  value: number
  interval_length?: string
}

// Helper function to check if an hour is in offpeak hours
function isOffpeakHour(hour: number, offpeakConfig?: Record<string, string>): boolean {
  if (!offpeakConfig) {
    // Default: 22h-6h if no config
    return hour >= 22 || hour < 6
  }

  // Parse offpeak hours from config
  // Format can be: {"default": "22h30-06h30"} or {"HC": "22:00-06:00"} or "HC (22H00-6H00)"
  for (const range of Object.values(offpeakConfig)) {
    // Extract hours from various formats: "22h30-06h30", "22:00-06:00", "HC (22H00-6H00)", etc.
    const match = range.match(/(\d{1,2})[hH:]\d{0,2}\s*-\s*(\d{1,2})[hH:]?\d{0,2}/)
    if (match) {
      const startHour = parseInt(match[1])
      const endHour = parseInt(match[2])

      // Handle ranges that cross midnight (e.g., 22h-6h)
      if (startHour > endHour) {
        // e.g., 22-6 means 22:00-23:59 and 0:00-5:59
        if (hour >= startHour || hour < endHour) {
          return true
        }
      } else {
        // Normal range (shouldn't happen for offpeak but handle it)
        if (hour >= startHour && hour < endHour) {
          return true
        }
      }
    }
  }

  // Fallback to default
  return hour >= 22 || hour < 6
}

// Helper function to generate date ranges
function generateDateRanges(startDate: Date, endDate: Date, maxDays: number) {
  const ranges: Array<{ start: string; end: string }> = []
  let current = new Date(startDate)

  while (current <= endDate) {
    const rangeEnd = new Date(current)
    rangeEnd.setDate(rangeEnd.getDate() + maxDays - 1)

    if (rangeEnd > endDate) {
      ranges.push({
        start: current.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      })
      break
    } else {
      ranges.push({
        start: current.toISOString().split('T')[0],
        end: rangeEnd.toISOString().split('T')[0],
      })
      current.setDate(current.getDate() + maxDays)
    }
  }

  return ranges
}

export default function Consumption() {
  const [selectedPDL, setSelectedPDL] = useState<string | null>(null)
  const [fetchStatus, setFetchStatus] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [yearlyData, setYearlyData] = useState<any>({ years: [] })
  const [hchpData, setHCHPData] = useState<any>({ years: [] })
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [selectedHCHPYear, setSelectedHCHPYear] = useState<number>(0) // Index of selected year (0 = most recent)
  const [fetchProgress, setFetchProgress] = useState<{current: number, total: number, phase: string}>({current: 0, total: 0, phase: ''})
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains('dark'))

  // Detect dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Helper function to get conditional tooltip props
  const getTooltipProps = () => {
    if (isDarkMode) {
      return {
        contentStyle: {
          backgroundColor: 'rgb(30, 41, 59)',
          border: '1px solid rgb(51, 65, 85)',
          borderRadius: '0.5rem',
          color: 'rgb(226, 232, 240)'
        },
        labelStyle: { color: 'rgb(226, 232, 240)' }
      }
    }
    return {} // Default Recharts styling in light mode
  }

  // Fetch user's PDLs
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
  })

  const pdls = pdlsResponse?.success && Array.isArray(pdlsResponse.data) ? pdlsResponse.data : []

  // Auto-select first PDL
  useEffect(() => {
    if (pdls.length > 0 && !selectedPDL) {
      setSelectedPDL(pdls[0].usage_point_id)
    }
  }, [pdls, selectedPDL])

  const queryClient = useQueryClient()

  // Mutation to fetch data from Enedis (populate cache)
  const fetchDataMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPDL) throw new Error('No PDL selected')

      // Get PDL configuration for offpeak hours
      const pdl = pdls.find((p: any) => p.usage_point_id === selectedPDL)
      console.log('[Consumption] Selected PDL:', pdl)
      console.log('[Consumption] Offpeak hours config:', pdl?.offpeak_hours)

      setIsLoadingData(true)
      const yearlyResults: any[] = []
      const hchpResults: any[] = []
      let stoppedEarly = false
      let earliestDataDate: string | null = null
      let errorMessage: string | null = null

      try {
        // Fetch yearly data (3 years with daily endpoint - max 365 days per request)
        // Use rolling year: from today to same date last year
        const today = new Date()

        // Calculate total requests for progress bar
        const totalYearlyRequests = 3 // 3 years, ~1 request per year (365 days max)
        const totalDetailRequests = 2 * 52 // 2 years * 52 weeks (7 days per request)
        const totalRequests = totalYearlyRequests + totalDetailRequests
        let currentRequest = 0

        setFetchProgress({ current: 0, total: totalRequests, phase: 'Récupération des données annuelles...' })

        for (let yearOffset = 0; yearOffset < 3; yearOffset++) {
          const endDate = new Date(today)
          endDate.setFullYear(today.getFullYear() - yearOffset)

          const startDate = new Date(endDate)
          startDate.setFullYear(endDate.getFullYear() - 1)
          startDate.setDate(startDate.getDate() + 1) // Start from day after to avoid overlap

          const year = endDate.getFullYear()

          // Generate date ranges (max 365 days per request)
          const dateRanges = generateDateRanges(startDate, endDate, 365)

          let monthlyTotals: any = {}
          let totalYear = 0
          let readingCount = 0

          for (const range of dateRanges) {
            currentRequest++
            setFetchProgress({
              current: currentRequest,
              total: totalRequests,
              phase: `Année ${year} : ${range.start} → ${range.end} (${currentRequest}/${totalRequests})`
            })

            // Check if data is already in React Query cache
            const cacheKey = ['consumption-daily', selectedPDL, range.start, range.end]
            let response = queryClient.getQueryData(cacheKey) as any

            if (!response) {
              // Not in cache, fetch from API and cache it
              response = await queryClient.fetchQuery({
                queryKey: cacheKey,
                queryFn: () => enedisApi.getConsumptionDaily(selectedPDL, {
                  start: range.start,
                  end: range.end,
                  use_cache: true,
                }),
                staleTime: 7 * 24 * 60 * 60 * 1000,
              })
            }

            // Check for Enedis errors first
            if (!response.success) {
              const apiErrorMessage = response.error?.message || ''
              // Check for ADAM-ERR0123 error (period before meter activation)
              if (apiErrorMessage.includes('ADAM-ERR0123') || apiErrorMessage.includes('anterior to the meter')) {
                console.log(`⚠️ Stopping yearly data fetch at ${range.start} - meter not activated yet`)
                stoppedEarly = true
                errorMessage = apiErrorMessage
                if (!earliestDataDate && readingCount > 0) {
                  // Track earliest date with actual data
                  earliestDataDate = range.end
                }
                break // Stop this year's loop but save what we have
              }
            }

            const data = response.data as any

            // Check multiple possible data structures for daily endpoint
            let readings: IntervalReading[] | undefined

            if (data?.meter_reading?.interval_reading) {
              readings = data.meter_reading.interval_reading
            } else if (data?.interval_reading) {
              readings = data.interval_reading
            } else if (Array.isArray(data)) {
              readings = data
            }

            if (!readings || readings.length === 0) {
              console.log('❌ No readings found for daily', range, data)
            }

            if (response.success && readings && readings.length > 0) {
              console.log(`✅ Got ${readings.length} readings for range ${range.start} to ${range.end}`)
              readingCount += readings.length

              readings.forEach((reading: any) => {
                const value = reading.value / 1000 // Wh to kWh
                const date = new Date(reading.date)
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

                if (!monthlyTotals[monthKey]) {
                  monthlyTotals[monthKey] = 0
                }

                monthlyTotals[monthKey] += value
                totalYear += value
              })
            }
          }

          const yearResult = {
            year,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            total_consumption_kwh: Math.round(totalYear * 100) / 100,
            monthly_data: Object.entries(monthlyTotals)
              .map(([month, consumption]) => ({
                month,
                consumption: Math.round((consumption as number) * 100) / 100,
              }))
              .sort((a, b) => a.month.localeCompare(b.month)),
            reading_count: readingCount,
          }

          console.log(`📊 Year ${year} result (${yearResult.start_date} → ${yearResult.end_date}):`, yearResult)
          yearlyResults.push(yearResult)
        }

        // Fetch HC/HP data (2 years with detail endpoint - max 7 days per request)
        // Use rolling year: from today to same date last year
        setFetchProgress({ current: currentRequest, total: totalRequests, phase: 'Récupération des données HC/HP...' })

        for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
          const endDate = new Date(today)
          endDate.setFullYear(today.getFullYear() - yearOffset)

          const startDate = new Date(endDate)
          startDate.setFullYear(endDate.getFullYear() - 1)
          startDate.setDate(startDate.getDate() + 1) // Start from day after to avoid overlap

          const year = endDate.getFullYear()

          // Generate date ranges (max 7 days per request)
          const dateRanges = generateDateRanges(startDate, endDate, 7)

          let totalConsumption = 0
          let hcConsumption = 0
          let hpConsumption = 0
          let monthlyData: any = {}
          let readingCount = 0
          let totalReadingsProcessed = 0

          console.log(`[HC/HP ${year}] Processing ${dateRanges.length} date ranges`)

          for (const range of dateRanges) {
            currentRequest++
            setFetchProgress({
              current: currentRequest,
              total: totalRequests,
              phase: `HC/HP ${year} : ${range.start} → ${range.end} (${currentRequest}/${totalRequests})`
            })

            // Check if data is already in React Query cache
            const cacheKey = ['consumption-detail', selectedPDL, range.start, range.end]
            let response = queryClient.getQueryData(cacheKey) as any

            if (response) {
              console.log(`✅ [Consumption Cache HIT] Using cached data for ${range.start} → ${range.end}`)
            }

            if (!response) {
              console.log(`❌ [Consumption Cache MISS] Fetching from API for ${range.start} → ${range.end}`)
              // Not in cache, fetch from API and cache it
              response = await queryClient.fetchQuery({
                queryKey: cacheKey,
                queryFn: () => enedisApi.getConsumptionDetail(selectedPDL, {
                  start: range.start,
                  end: range.end,
                  use_cache: true,
                }),
                staleTime: 7 * 24 * 60 * 60 * 1000,
              })
            }

            // Check for Enedis errors first
            if (!response.success) {
              const apiErrorMessage = response.error?.message || ''
              // Check for ADAM-ERR0123 error (period before meter activation)
              if (apiErrorMessage.includes('ADAM-ERR0123') || apiErrorMessage.includes('anterior to the meter')) {
                console.log(`⚠️ Stopping HC/HP data fetch at ${range.start} - meter not activated yet`)
                stoppedEarly = true
                errorMessage = apiErrorMessage
                if (!earliestDataDate && readingCount > 0) {
                  // Track earliest date with actual data
                  earliestDataDate = range.end
                }
                break // Stop this year's loop but save what we have
              }
            }

            const data = response.data as any

            // Check multiple possible data structures for detail endpoint
            let readings: IntervalReading[] | undefined
            let globalIntervalLength: string | undefined

            // Log first response structure to understand data format
            if (totalReadingsProcessed === 0 && data) {
              console.log(`[HC/HP ${year}] First API response structure:`, {
                hasMeterReading: !!data.meter_reading,
                hasIntervalReading: !!data.interval_reading,
                isArray: Array.isArray(data),
                keys: Object.keys(data),
                meterReadingKeys: data.meter_reading ? Object.keys(data.meter_reading) : null,
                firstReadingKeys: data.meter_reading?.interval_reading?.[0] ? Object.keys(data.meter_reading.interval_reading[0]) : null
              })
            }

            if (data?.meter_reading?.interval_reading) {
              readings = data.meter_reading.interval_reading
              globalIntervalLength = data.meter_reading.interval_length
            } else if (data?.interval_reading) {
              readings = data.interval_reading
              globalIntervalLength = data.interval_length
            } else if (Array.isArray(data)) {
              readings = data
            }

            if (!readings || readings.length === 0) {
              console.log('❌ No readings found for detail', range, data)
            }

            if (response.success && readings && readings.length > 0) {
              console.log(`✅ Got ${readings.length} detail readings for range ${range.start} to ${range.end}`)
              console.log(`📏 Global interval_length: ${globalIntervalLength}`)
              readingCount += readings.length

              // Log first reading to check interval and value
              if (readings.length > 0 && totalReadingsProcessed === 0) {
                const firstReading = readings[0]
                const firstIntervalLength = firstReading.interval_length || globalIntervalLength || 'PT30M'
                console.log(`[HC/HP ${year}] First reading sample:`, {
                  date: firstReading.date,
                  valueW: firstReading.value,
                  interval_length: firstIntervalLength
                })
              }

              readings.forEach((reading: any) => {
                // Convert W to Wh based on interval length (PT30M = 30 minutes by default)
                // interval_length can be at reading level OR at meter_reading level
                const intervalLength = reading.interval_length || globalIntervalLength || 'PT30M'
                const intervalMatch = intervalLength.match(/PT(\d+)M/)
                const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30

                // Convert W to Wh: value_wh = value_w / (60 / interval_minutes)
                const valueW = parseFloat(reading.value)
                const valueWh = valueW / (60 / intervalMinutes)
                const valueKWh = valueWh / 1000 // Wh to kWh

                totalReadingsProcessed++

                const date = new Date(reading.date)
                const hour = date.getHours()
                const isHC = isOffpeakHour(hour, pdl?.offpeak_hours)

                if (isHC) {
                  hcConsumption += valueKWh
                } else {
                  hpConsumption += valueKWh
                }

                totalConsumption += valueKWh

                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

                if (!monthlyData[monthKey]) {
                  monthlyData[monthKey] = { hc: 0, hp: 0 }
                }

                if (isHC) {
                  monthlyData[monthKey].hc += valueKWh
                } else {
                  monthlyData[monthKey].hp += valueKWh
                }
              })
            }
          }

          const hcPercentage = totalConsumption > 0 ? (hcConsumption / totalConsumption) * 100 : 0
          const hpPercentage = totalConsumption > 0 ? (hpConsumption / totalConsumption) * 100 : 0

          // Find corresponding yearly data to compare totals
          const correspondingYearlyData = yearlyResults.find(y => y.year === year)
          const yearlyTotal = correspondingYearlyData?.total_consumption_kwh || 0
          const detailTotal = totalConsumption
          const dataCompleteness = yearlyTotal > 0 ? (detailTotal / yearlyTotal) * 100 : 100

          console.log(`[HC/HP ${year}] SUMMARY:`, {
            totalReadings: totalReadingsProcessed,
            dateRanges: dateRanges.length,
            totalConsumption: totalConsumption.toFixed(2),
            hcConsumption: hcConsumption.toFixed(2),
            hpConsumption: hpConsumption.toFixed(2),
            hcPercentage: hcPercentage.toFixed(2) + '%',
            hpPercentage: hpPercentage.toFixed(2) + '%',
            yearlyTotal: yearlyTotal.toFixed(2),
            dataCompleteness: dataCompleteness.toFixed(1) + '%',
            missingData: (yearlyTotal - detailTotal).toFixed(2) + ' kWh'
          })

          hchpResults.push({
            year,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            total_consumption_kwh: Math.round(totalConsumption * 100) / 100,
            hc_consumption_kwh: Math.round(hcConsumption * 100) / 100,
            hp_consumption_kwh: Math.round(hpConsumption * 100) / 100,
            hc_percentage: Math.round(hcPercentage * 100) / 100,
            hp_percentage: Math.round(hpPercentage * 100) / 100,
            data_completeness: Math.round(dataCompleteness * 10) / 10,
            missing_kwh: Math.round((yearlyTotal - detailTotal) * 100) / 100,
            monthly_data: Object.entries(monthlyData)
              .map(([month, values]: [string, any]) => ({
                month,
                hc: Math.round(values.hc * 100) / 100,
                hp: Math.round(values.hp * 100) / 100,
              }))
              .sort((a, b) => a.month.localeCompare(b.month)),
            reading_count: readingCount,
          })
        }

        return { yearlyResults, hchpResults, stoppedEarly, earliestDataDate, errorMessage }
      } finally {
        setIsLoadingData(false)
      }
    },
    onSuccess: (data) => {
      console.log('✅ Mutation success - yearlyResults:', data.yearlyResults)
      console.log('✅ Mutation success - hchpResults:', data.hchpResults)

      setYearlyData({ years: data.yearlyResults })
      setHCHPData({ years: data.hchpResults })

      // Check if any data was collected
      const hasData = data.yearlyResults.length > 0 || data.hchpResults.length > 0

      if (!hasData) {
        const toastId = toast.error(
          'Aucune donnée disponible pour la période demandée. Le compteur n\'était peut-être pas encore activé.',
          { duration: 6000 }
        )
        // Add click handler to entire toast with overlay
        setTimeout(() => {
          const toastElements = document.querySelectorAll('[role="status"]')
          toastElements.forEach((el) => {
            if (el.textContent?.includes('Aucune donnée disponible')) {
              const toastEl = el as HTMLElement
              toastEl.style.cursor = 'pointer'
              toastEl.style.position = 'relative'

              // Create overlay to capture all clicks
              const overlay = document.createElement('div')
              overlay.style.position = 'absolute'
              overlay.style.top = '0'
              overlay.style.left = '0'
              overlay.style.width = '100%'
              overlay.style.height = '100%'
              overlay.style.cursor = 'pointer'
              overlay.style.zIndex = '1'
              overlay.onclick = (e) => {
                e.stopPropagation()
                toast.dismiss(toastId)
              }

              toastEl.appendChild(overlay)
            }
          })
        }, 50)
      } else if (data.stoppedEarly) {
        // Import stopped early but got some data
        const dateInfo = data.earliestDataDate
          ? ` Données disponibles à partir du ${new Date(data.earliestDataDate).toLocaleDateString('fr-FR')}.`
          : ''
        const errorInfo = data.errorMessage ? `\n\nErreur rencontrée : ${data.errorMessage}` : ''
        const toastId = toast(
          `Import partiel : ${data.yearlyResults.length} années de consommation et ${data.hchpResults.length} années HC/HP récupérées.${dateInfo}${errorInfo}`,
          {
            duration: 10000,
            icon: '⚠️',
            style: {
              background: '#78350f',
              color: '#fef3c7',
              border: '1px solid #f59e0b',
              cursor: 'pointer',
            },
          }
        )
        // Add click handler to entire toast with overlay
        setTimeout(() => {
          const toastElements = document.querySelectorAll('[role="status"]')
          toastElements.forEach((el) => {
            if (el.textContent?.includes('Import partiel')) {
              const toastEl = el as HTMLElement
              toastEl.style.cursor = 'pointer'
              toastEl.style.position = 'relative'

              // Create overlay to capture all clicks
              const overlay = document.createElement('div')
              overlay.style.position = 'absolute'
              overlay.style.top = '0'
              overlay.style.left = '0'
              overlay.style.width = '100%'
              overlay.style.height = '100%'
              overlay.style.cursor = 'pointer'
              overlay.style.zIndex = '1'
              overlay.onclick = (e) => {
                e.stopPropagation()
                toast.dismiss(toastId)
              }

              toastEl.appendChild(overlay)
            }
          })
        }, 50)
      } else {
        const toastId = toast.success(
          `Données récupérées avec succès : ${data.yearlyResults.length} années de consommation et ${data.hchpResults.length} années de ratio HC/HP mis en cache.`,
          { duration: 5000 }
        )
        // Add click handler to entire toast with overlay
        setTimeout(() => {
          const toastElements = document.querySelectorAll('[role="status"]')
          toastElements.forEach((el) => {
            if (el.textContent?.includes('Données récupérées avec succès')) {
              const toastEl = el as HTMLElement
              toastEl.style.cursor = 'pointer'
              toastEl.style.position = 'relative'

              // Create overlay to capture all clicks
              const overlay = document.createElement('div')
              overlay.style.position = 'absolute'
              overlay.style.top = '0'
              overlay.style.left = '0'
              overlay.style.width = '100%'
              overlay.style.height = '100%'
              overlay.style.cursor = 'pointer'
              overlay.style.zIndex = '1'
              overlay.onclick = (e) => {
                e.stopPropagation()
                toast.dismiss(toastId)
              }

              toastEl.appendChild(overlay)
            }
          })
        }, 50)
      }

      setFetchStatus(null)
    },
    onError: (error: any) => {
      setIsLoadingData(false)
      const toastId = toast.error(
        `Erreur lors de la récupération des données : ${error.message}`,
        { duration: 8000 }
      )
      // Add click handler to entire toast with overlay
      setTimeout(() => {
        const toastElements = document.querySelectorAll('[role="status"]')
        toastElements.forEach((el) => {
          if (el.textContent?.includes('Erreur lors de la récupération')) {
            const toastEl = el as HTMLElement
            toastEl.style.cursor = 'pointer'
            toastEl.style.position = 'relative'

            // Create overlay to capture all clicks
            const overlay = document.createElement('div')
            overlay.style.position = 'absolute'
            overlay.style.top = '0'
            overlay.style.left = '0'
            overlay.style.width = '100%'
            overlay.style.height = '100%'
            overlay.style.cursor = 'pointer'
            overlay.style.zIndex = '1'
            overlay.onclick = (e) => {
              e.stopPropagation()
              toast.dismiss(toastId)
            }

            toastEl.appendChild(overlay)
          }
        })
      }, 50)
      setFetchStatus({
        type: 'error',
        message: error?.message || 'Erreur lors de la récupération des données depuis Enedis'
      })
      setTimeout(() => setFetchStatus(null), 10000)
    }
  })

  const isLoading = isLoadingData
  const hasError = false

  // Prepare data for yearly chart (all years combined)
  const yearlyChartData = yearlyData?.years.flatMap((yearData: any) =>
    yearData.monthly_data.map((item: any) => ({
      month: new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      year: yearData.year,
      consumption: item.consumption,
    }))
  ) || []

  // Prepare data for yearly comparison chart
  const yearlyComparisonData = yearlyData?.years.map((yearData: any) => ({
    year: yearData.year.toString(),
    'Consommation (kWh)': yearData.total_consumption_kwh,
  })) || []

  // Prepare HC/HP pie data (selected year)
  const selectedYearHCHP = hchpData?.years[selectedHCHPYear]
  const hcHpPieData = selectedYearHCHP ? [
    { name: 'Heures Creuses', value: selectedYearHCHP.hc_consumption_kwh, percentage: selectedYearHCHP.hc_percentage },
    { name: 'Heures Pleines', value: selectedYearHCHP.hp_consumption_kwh, percentage: selectedYearHCHP.hp_percentage },
  ] : []

  // Prepare HC/HP monthly chart data (selected year)
  const hchpMonthlyData = selectedYearHCHP?.monthly_data.map((item: any) => ({
    month: new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
    'HC (kWh)': item.hc,
    'HP (kWh)': item.hp,
  })) || []

  const COLORS = {
    hc: '#10b981', // green
    hp: '#f59e0b', // amber
  }

  if (!pdls || pdls.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <TrendingUp className="text-primary-600 dark:text-primary-400" size={28} />
            Consommation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Visualisez vos données de consommation annuelle
          </p>
        </div>
        <div className="card p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Aucun PDL disponible.{' '}
            <a href="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
              Veuillez ajouter un point de livraison depuis votre tableau de bord.
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 5000,
          style: {
            background: '#1f2937',
            color: '#f9fafb',
            border: '1px solid #374151',
            borderRadius: '0.5rem',
            padding: '1rem',
            fontSize: '0.875rem',
            cursor: 'pointer',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#f9fafb',
            },
            style: {
              background: '#064e3b',
              color: '#d1fae5',
              border: '1px solid #10b981',
              cursor: 'pointer',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f9fafb',
            },
            style: {
              background: '#7f1d1d',
              color: '#fee2e2',
              border: '1px solid #ef4444',
              cursor: 'pointer',
            },
          },
        }}
      />
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <TrendingUp className="text-primary-600 dark:text-primary-400" size={28} />
          Consommation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Visualisez vos données de consommation sur plusieurs années</p>
      </div>

      {/* PDL Selector and Fetch Button */}
      <div className="card p-4">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Point de Livraison</label>
            <select
              value={selectedPDL || ''}
              onChange={(e) => setSelectedPDL(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              {pdls.map((pdl: any) => (
                <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                  {pdl.name || pdl.usage_point_id}
                </option>
              ))}
            </select>
          </div>

          {/* Fetch Data Button */}
          <div>
            <button
              onClick={() => fetchDataMutation.mutate()}
              disabled={!selectedPDL || fetchDataMutation.isPending}
              className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${fetchDataMutation.isPending ? 'animate-spin' : ''}`} />
              {fetchDataMutation.isPending ? 'Récupération en cours...' : 'Récupérer les données depuis Enedis'}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Cette action récupère vos données de consommation depuis l'API Enedis et les met en cache pour 7 jours.
              Cela peut prendre quelques minutes (environ 100+ requêtes API).
            </p>
          </div>
        </div>
      </div>

      {/* Fetch Status Notification */}
      {fetchStatus && (
        <div className={`card p-4 border-l-4 ${
          fetchStatus.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
            : 'bg-red-50 dark:bg-red-900/20 border-red-500'
        }`}>
          <div className="flex items-start gap-3">
            {fetchStatus.type === 'success' ? (
              <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={20} />
            ) : (
              <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
            )}
            <div className="flex-1">
              <p className={`text-sm ${
                fetchStatus.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {fetchStatus.message}
              </p>
            </div>
            <button
              onClick={() => setFetchStatus(null)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="card p-8">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
            <p className="text-gray-600 dark:text-gray-400">
              Chargement des données de consommation... Cela peut prendre quelques minutes.
            </p>
            {fetchProgress.total > 0 && (
              <div className="w-full max-w-md">
                <div className="mb-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>{fetchProgress.phase}</span>
                  <span>{Math.round((fetchProgress.current / fetchProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2 text-center">
                  ({fetchProgress.current}/{fetchProgress.total} requêtes API)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error State */}
      {hasError && !isLoading && (
        <div className="card p-6 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
            <p className="text-red-800 dark:text-red-200">
              Erreur lors du chargement des données. Veuillez réessayer plus tard.
            </p>
          </div>
        </div>
      )}

      {/* Yearly Statistics Section */}
      {yearlyData && !isLoading && (
        <>
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="text-primary-600 dark:text-primary-400" size={24} />
              Consommation annuelle (3 dernières années)
            </h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {yearlyData.years.map((yearData: any) => (
                <div key={yearData.year} className="card p-4 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-lg font-semibold">{yearData.year}</h3>
                    <Zap className="text-primary-600 dark:text-primary-400" size={20} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Du {new Date(yearData.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} au {new Date(yearData.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </p>
                  <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">
                    {yearData.total_consumption_kwh.toLocaleString('fr-FR')} kWh
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {yearData.reading_count.toLocaleString('fr-FR')} relevés quotidiens
                  </p>
                </div>
              ))}
            </div>

            {/* Yearly Comparison Chart */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Comparaison annuelle</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={yearlyComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip {...getTooltipProps()} />
                  <Legend />
                  <Bar dataKey="Consommation (kWh)" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Evolution Chart */}
            <div>
              <h3 className="text-lg font-medium mb-3">Évolution mensuelle</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip {...getTooltipProps()} />
                  <Legend />
                  {yearlyData.years.map((yearData: any, index: number) => (
                    <Line
                      key={yearData.year}
                      type="monotone"
                      dataKey="consumption"
                      data={yearlyChartData.filter((d: any) => d.year === yearData.year)}
                      stroke={index === 0 ? '#3b82f6' : index === 1 ? '#8b5cf6' : '#ec4899'}
                      name={`${yearData.year}`}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* HC/HP Statistics Section */}
      {hchpData && selectedYearHCHP && !isLoading && (
        <>
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="text-primary-600 dark:text-primary-400" size={24} />
              Répartition Heures Creuses / Heures Pleines (2 dernières années)
            </h2>

            {/* HC/HP Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {hchpData.years.map((yearData: any) => (
                <div key={yearData.year} className="card p-4">
                  <h3 className="text-lg font-semibold mb-2">{yearData.year}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Du {new Date(yearData.start_date).toLocaleDateString('fr-FR')} au {new Date(yearData.end_date).toLocaleDateString('fr-FR')}
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Heures Creuses</span>
                      <span className="text-lg font-bold text-green-700 dark:text-green-400">
                        {yearData.hc_consumption_kwh.toLocaleString('fr-FR')} kWh ({yearData.hc_percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-amber-700 dark:text-amber-400">Heures Pleines</span>
                      <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                        {yearData.hp_consumption_kwh.toLocaleString('fr-FR')} kWh ({yearData.hp_percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total</span>
                        <span className="text-lg font-bold">
                          {yearData.total_consumption_kwh.toLocaleString('fr-FR')} kWh
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Year Tabs */}
            <div className="flex gap-2 mb-6">
              {hchpData.years.map((yearData: any, index: number) => (
                <button
                  key={yearData.year}
                  onClick={() => setSelectedHCHPYear(index)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedHCHPYear === index
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {yearData.year}
                </button>
              ))}
            </div>

            {/* HC/HP Pie Chart (selected year) */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Répartition {selectedYearHCHP.year}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Du {new Date(selectedYearHCHP.start_date).toLocaleDateString('fr-FR')} au {new Date(selectedYearHCHP.end_date).toLocaleDateString('fr-FR')}
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={hcHpPieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(props: any) => {
                      const dataEntry = hcHpPieData[props.index]
                      return `${dataEntry.name}: ${dataEntry.percentage.toFixed(1)}%`
                    }}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {hcHpPieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? COLORS.hc : COLORS.hp} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value.toFixed(2)} kWh`} {...getTooltipProps()} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* HC/HP Monthly Chart (most recent year) */}
            <div>
              <h3 className="text-lg font-medium mb-2">Détail mensuel {selectedYearHCHP.year}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Du {new Date(selectedYearHCHP.start_date).toLocaleDateString('fr-FR')} au {new Date(selectedYearHCHP.end_date).toLocaleDateString('fr-FR')}
              </p>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={hchpMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip {...getTooltipProps()} />
                  <Legend />
                  <Bar dataKey="HC (kWh)" fill={COLORS.hc} stackId="a" />
                  <Bar dataKey="HP (kWh)" fill={COLORS.hp} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Information */}
      <div className="card p-6 bg-gray-50 dark:bg-gray-800">
        <h3 className="font-semibold mb-2">Informations techniques</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• <strong>Consommation annuelle :</strong> Données issues de l'endpoint <code>consumption/daily</code> (relevés quotidiens) sur 3 ans, max 365 jours par requête</li>
          <li>• <strong>Ratio HC/HP :</strong> Données issues de l'endpoint <code>consumption/detail</code> (relevés horaires) sur 2 ans, max 7 jours par requête</li>
          <li>• <strong>Heures Creuses :</strong> Calculées sur la plage 22h-6h (à affiner selon votre contrat)</li>
          <li>• <strong>Heures Pleines :</strong> Calculées sur la plage 6h-22h</li>
          <li>• <strong>Cache :</strong> Toutes les données sont mises en cache pendant 7 jours pour optimiser les performances</li>
          <li>• <strong>Source :</strong> API Enedis Data Connect</li>
        </ul>
      </div>
    </div>
  )
}
