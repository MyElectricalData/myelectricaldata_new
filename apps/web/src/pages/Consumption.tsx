import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, Calendar, Zap, Clock, AlertCircle, RefreshCw, CheckCircle, XCircle, Copy, Download, Database } from 'lucide-react'
import { enedisApi } from '../api/enedis'
import { pdlApi } from '../api/pdl'
import toast from 'react-hot-toast'

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

    if (rangeEnd >= endDate) {
      // Last range: always request at least 7 days (maxDays)
      // For Enedis API, to get data for date X, we need to request from X-1 to X
      const rangeStart = new Date(endDate)
      rangeStart.setDate(rangeStart.getDate() - (maxDays - 1)) // Go back maxDays-1 (e.g., 6 days for maxDays=7)

      // Make sure rangeStart is not before current (the loop start position)
      const finalStart = rangeStart >= current ? rangeStart : current
      const finalStartStr = finalStart.toISOString().split('T')[0]
      const finalEndStr = endDate.toISOString().split('T')[0]

      // SAFETY CHECK: Never allow start=end, always request at least 1 day before
      if (finalStartStr === finalEndStr) {
        const safeStart = new Date(endDate)
        safeStart.setDate(safeStart.getDate() - 1)
        ranges.push({
          start: safeStart.toISOString().split('T')[0],
          end: finalEndStr,
        })
      } else {
        ranges.push({
          start: finalStartStr,
          end: finalEndStr,
        })
      }
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

  // Hourly data state
  const [hourlyStartDate, setHourlyStartDate] = useState<string>('')
  const [hourlyEndDate, setHourlyEndDate] = useState<string>('')
  const [hourlyData, setHourlyData] = useState<any[]>([])
  const [isLoadingHourly, setIsLoadingHourly] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('this-week')
  const [comparingDays, setComparingDays] = useState<Set<string>>(new Set())
  const [weekOffset, setWeekOffset] = useState<number>(0) // For week navigation
  const [hourlyFetchProgress, setHourlyFetchProgress] = useState<{message: string, percentage: number} | null>(null)
  const [hiddenYears, setHiddenYears] = useState<Set<string>>(new Set())
  const [selectedDayTab, setSelectedDayTab] = useState<number>(0) // For day tabs
  const [isHourlySectionExpanded, setIsHourlySectionExpanded] = useState<boolean>(false) // Track if hourly section is expanded
  const [isYearlySectionExpanded, setIsYearlySectionExpanded] = useState<boolean>(false) // Track if yearly section is expanded
  const [isHCHPSectionExpanded, setIsHCHPSectionExpanded] = useState<boolean>(false) // Track if HC/HP section is expanded

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
          color: 'rgb(255, 255, 255)' // white text
        },
        labelStyle: { color: 'rgb(255, 255, 255)' }, // white text for labels
        itemStyle: { color: 'rgb(255, 255, 255)' }, // white text for items
        cursor: { fill: 'rgb(29, 51, 70)', opacity: 0.8, cursor: 'pointer' }
      }
    }
    return {
      cursor: { fill: 'rgb(249, 250, 251)', opacity: 0.8, cursor: 'pointer' }
    }
  }

  // Helper function to get CartesianGrid props
  const getGridProps = () => {
    if (isDarkMode) {
      return {
        strokeDasharray: "3 3",
        stroke: 'rgb(75, 85, 99)', // gray-600
        opacity: 0.8
      }
    }
    return {
      strokeDasharray: "3 3",
      stroke: 'rgb(209, 213, 219)', // gray-300
      opacity: 0.8
    }
  }

  // Helper function to get axis props (XAxis, YAxis)
  const getAxisProps = () => {
    if (isDarkMode) {
      return {
        tick: { fill: 'rgb(255, 255, 255)' }, // white text in dark mode
        stroke: 'rgb(75, 85, 99)' // gray-600 for axis line
      }
    }
    return {
      tick: { fill: 'rgb(55, 65, 81)' } // gray-700 in light mode
    }
  }

  // Fetch user's PDLs
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
  })

  const pdls = pdlsResponse?.success && Array.isArray(pdlsResponse.data) ? pdlsResponse.data : []

  // Function to set period dates
  const setPeriodDates = (period: string, customWeekOffset?: number) => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, etc.
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Get to Monday

    let startDate: Date
    let endDate: Date

    // Use custom week offset for navigation or default to 0
    const navOffset = customWeekOffset !== undefined ? customWeekOffset : weekOffset

    switch (period) {
      case 'this-week':
        // Monday to today (or Sunday if navigating back)
        startDate = new Date(today)
        startDate.setDate(today.getDate() + mondayOffset - (navOffset * 7))

        if (navOffset === 0) {
          endDate = new Date(today)
        } else {
          endDate = new Date(startDate)
          endDate.setDate(startDate.getDate() + 6)
        }
        break

      case 'last-month':
        // Last 7 days of previous month
        const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0)
        endDate = lastDayPrevMonth
        startDate = new Date(lastDayPrevMonth)
        startDate.setDate(lastDayPrevMonth.getDate() - 6)
        break

      case 'last-year':
        // Same week last year (full week from Monday to Sunday)
        const lastYearDate = new Date(today)
        lastYearDate.setFullYear(today.getFullYear() - 1)
        const lastYearDayOfWeek = lastYearDate.getDay()
        const lastYearMondayOffset = lastYearDayOfWeek === 0 ? -6 : 1 - lastYearDayOfWeek

        startDate = new Date(lastYearDate)
        startDate.setDate(lastYearDate.getDate() + lastYearMondayOffset)
        endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)
        break

      default:
        return
    }

    setHourlyStartDate(startDate.toISOString().split('T')[0])
    setHourlyEndDate(endDate.toISOString().split('T')[0])
    setSelectedPeriod(period)

    if (customWeekOffset !== undefined) {
      setWeekOffset(customWeekOffset)
    }
  }

  // Navigate weeks
  const navigateWeek = (direction: 'prev' | 'next') => {
    const newOffset = direction === 'prev' ? weekOffset + 1 : weekOffset - 1

    // Don't go to future weeks
    if (newOffset < 0) return

    setWeekOffset(newOffset)
    setPeriodDates(selectedPeriod, newOffset)
    setSelectedDayTab(0) // Reset to first tab
  }

  // Auto-select first PDL and set default dates for hourly view
  useEffect(() => {
    if (pdls.length > 0 && !selectedPDL) {
      setSelectedPDL(pdls[0].usage_point_id)
    }
    if (!hourlyStartDate && !hourlyEndDate) {
      setPeriodDates('this-week')
    }
  }, [pdls, selectedPDL, hourlyStartDate, hourlyEndDate])

  // Auto-reload when period buttons are clicked (but not on first load)
  useEffect(() => {
    if (selectedPDL && hourlyStartDate && hourlyEndDate && selectedPeriod !== 'custom' && hourlyData.length > 0) {
      fetchHourlyData()
    }
  }, [selectedPeriod])

  // Auto-reload when dates change (for week navigation)
  useEffect(() => {
    if (selectedPDL && hourlyStartDate && hourlyEndDate) {
      fetchHourlyData()
    }
  }, [hourlyStartDate, hourlyEndDate])

  const queryClient = useQueryClient()

  // Load cached data from localStorage on component mount
  useEffect(() => {
    if (selectedPDL) {
      try {
        // Try to load yearly data from localStorage
        const cachedYearly = localStorage.getItem(`yearlyData_${selectedPDL}`)
        if (cachedYearly) {
          const parsed = JSON.parse(cachedYearly)
          setYearlyData(parsed)
        }

        // Try to load HC/HP data from localStorage
        const cachedHCHP = localStorage.getItem(`hchpData_${selectedPDL}`)
        if (cachedHCHP) {
          const parsed = JSON.parse(cachedHCHP)
          setHCHPData(parsed)
        }

        // Try to load hourly data from localStorage
        const cachedHourly = localStorage.getItem(`hourlyData_${selectedPDL}`)
        if (cachedHourly) {
          const parsed = JSON.parse(cachedHourly)
          setHourlyData(parsed)
        }
      } catch (error) {
        console.error('Error loading cached data from localStorage:', error)
      }
    }
  }, [selectedPDL])

  // Save yearly data to localStorage whenever it changes
  useEffect(() => {
    if (selectedPDL && yearlyData) {
      try {
        localStorage.setItem(`yearlyData_${selectedPDL}`, JSON.stringify(yearlyData))
      } catch (error) {
        console.error('Error saving yearly data to localStorage:', error)
      }
    }
  }, [yearlyData, selectedPDL])

  // Save HC/HP data to localStorage whenever it changes
  useEffect(() => {
    if (selectedPDL && hchpData) {
      try {
        localStorage.setItem(`hchpData_${selectedPDL}`, JSON.stringify(hchpData))
      } catch (error) {
        console.error('Error saving HC/HP data to localStorage:', error)
      }
    }
  }, [hchpData, selectedPDL])

  // Save hourly data to localStorage whenever it changes
  useEffect(() => {
    if (selectedPDL && hourlyData.length > 0) {
      try {
        localStorage.setItem(`hourlyData_${selectedPDL}`, JSON.stringify(hourlyData))
      } catch (error) {
        console.error('Error saving hourly data to localStorage:', error)
      }
    }
  }, [hourlyData, selectedPDL])

  // Function to copy day data to clipboard
  const copyDayDataToClipboard = (dayData: any) => {
    const jsonData = {
      date: dayData.day,
      total_kwh: dayData.readings.reduce((sum: number, r: any) => sum + r.value, 0),
      hc_kwh: dayData.readings.filter((r: any) => r.isHC).reduce((sum: number, r: any) => sum + r.value, 0),
      hp_kwh: dayData.readings.filter((r: any) => !r.isHC).reduce((sum: number, r: any) => sum + r.value, 0),
      readings: dayData.readings.map((r: any) => ({
        date: r.date,
        hour: r.hour,
        value_kwh: Math.round(r.value * 1000) / 1000,
        type: r.isHC ? 'HC' : 'HP'
      }))
    }

    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Données copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to export yearly comparison data as JSON
  const exportYearlyComparisonJSON = () => {
    const jsonData = {
      title: "Comparaison annuelle",
      data: yearlyComparisonData,
      generated_at: new Date().toISOString()
    }
    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Données de comparaison annuelle copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to export monthly consumption data as JSON
  const exportMonthlyConsumptionJSON = () => {
    const jsonData = {
      title: "Évolution mensuelle",
      years: yearlyData?.years?.map((y: any) => ({
        year: y.year,
        total: y.total_consumption_kwh,
        monthly_data: y.monthly_data
      })) || [],
      chart_data: yearlyChartData,
      generated_at: new Date().toISOString()
    }
    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Données de consommation mensuelle copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to export HC/HP pie chart data as JSON
  const exportHCHPPieJSON = () => {
    const jsonData = {
      title: 'Répartition HC/HP - Toutes les années',
      all_years: hchpData?.years || [],
      selected_year_index: selectedHCHPYear,
      pdl_info: {
        usage_point_id: selectedPDL?.usage_point_id,
        offpeak_hours: selectedPDL?.offpeak_hours
      },
      generated_at: new Date().toISOString()
    }
    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Données HC/HP détaillées copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to get all page data as JSON object
  const getAllDataJSON = () => {
    return {
      title: 'Export complet - Toutes les données de consommation',
      pdl_info: {
        usage_point_id: selectedPDL,
        pdl_details: pdls.find((p: any) => p.usage_point_id === selectedPDL)
      },
      yearly_data: {
        years: yearlyData?.years || [],
        comparison: yearlyComparisonData || [],
        monthly_evolution: yearlyChartData || []
      },
      hchp_data: {
        years: hchpData?.years || [],
        selected_year_index: selectedHCHPYear
      },
      hourly_data: {
        period: selectedPeriod,
        start_date: hourlyStartDate,
        end_date: hourlyEndDate,
        days: hourlyData || []
      },
      generated_at: new Date().toISOString()
    }
  }

  // Function to export all page data as JSON file
  const exportAllDataJSON = () => {
    const jsonData = getAllDataJSON()

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `consommation-${selectedPDL}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('Fichier JSON téléchargé avec succès')
  }

  // Function to copy all page data to clipboard
  const copyAllDataJSON = () => {
    const jsonData = getAllDataJSON()

    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Toutes les données copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to export HC/HP monthly data as JSON
  const exportHCHPMonthlyJSON = () => {
    const selectedYear = hchpData?.years[selectedHCHPYear]
    const filteredMonthlyData = selectedYear?.monthly_data
      ?.sort((a: any, b: any) => {
        // Sort by month chronologically (YYYY-MM format)
        return a.month.localeCompare(b.month)
      }) || []

    const jsonData = {
      title: `HC/HP par mois - ${selectedYear?.year || 'N/A'}`,
      year: selectedYear?.year,
      period: selectedYear?.period || 'N/A',
      monthly_data: filteredMonthlyData,
      chart_data: hchpMonthlyData,
      generated_at: new Date().toISOString()
    }
    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
      .then(() => {
        toast.success('Données HC/HP mensuelles copiées dans le presse-papier')
      })
      .catch((err) => {
        toast.error('Erreur lors de la copie : ' + err.message)
      })
  }

  // Function to compare with last year
  const compareWithLastYear = async (dayKey: string) => {
    if (comparingDays.has(dayKey)) {
      // Remove comparison
      setComparingDays(prev => {
        const newSet = new Set(prev)
        newSet.delete(dayKey)
        return newSet
      })
      // Clear comparison data from hourlyData
      setHourlyData(prev => {
        const existingDay = prev.find(d => d.day === dayKey)
        if (existingDay) {
          delete existingDay.lastYearReadings
          delete existingDay.lastYearDate
          return [...prev]
        }
        return prev
      })
      return
    }

    // Add comparison - fetch last year data
    const currentDate = new Date(dayKey)
    const lastYearDate = new Date(currentDate)
    lastYearDate.setFullYear(currentDate.getFullYear() - 1)
    const lastYearKey = lastYearDate.toISOString().split('T')[0]

    // First check if we already have this day in hourlyData (from cache)
    const cachedDay = hourlyData.find(d => d.day === lastYearKey)
    if (cachedDay && cachedDay.readings && cachedDay.readings.length > 0) {
      // Use cached data directly
      setHourlyData(prev => {
        const existingDay = prev.find(d => d.day === dayKey)
        if (existingDay) {
          existingDay.lastYearReadings = cachedDay.readings
          existingDay.lastYearDate = lastYearKey
          return [...prev]
        }
        return prev
      })

      setComparingDays(prev => new Set(prev).add(dayKey))
      toast.success(`Comparaison ajoutée avec ${lastYearDate.toLocaleDateString('fr-FR')} (depuis cache)`)
      return
    }

    // Not in local data, fetch from API (which will use server cache if available)
    // Enedis requires a 7-day period for detail endpoint, so we request a week around the target date
    const weekStart = new Date(lastYearDate)
    weekStart.setDate(weekStart.getDate() - 3) // 3 days before
    const weekEnd = new Date(lastYearDate)
    weekEnd.setDate(weekEnd.getDate() + 3) // 3 days after

    const loadingToast = toast.loading(`Récupération des données du ${lastYearDate.toLocaleDateString('fr-FR')}...`)

    try {
      const pdl = pdls.find((p: any) => p.usage_point_id === selectedPDL)
      const response = await enedisApi.getConsumptionDetail(selectedPDL, {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0],
        use_cache: true,
      })

      toast.dismiss(loadingToast)

      if (response.success && response.data) {
        const data = response.data as any
        let readings: IntervalReading[] | undefined
        let globalIntervalLength: string | undefined

        if (data?.meter_reading?.interval_reading) {
          readings = data.meter_reading.interval_reading
          globalIntervalLength = data.meter_reading.interval_length
        } else if (data?.interval_reading) {
          readings = data.interval_reading
          globalIntervalLength = data.interval_length
        } else if (Array.isArray(data)) {
          readings = data
        }

        if (readings && readings.length > 0) {
          // Process readings same way as main data and filter for the target date only
          const lastYearReadings = readings
            .map((reading: any) => {
              const intervalLength = reading.interval_length || globalIntervalLength || 'PT30M'
              const intervalMatch = intervalLength.match(/PT(\d+)M/)
              const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30

              const valueWh = parseFloat(reading.value)
              const valueKWh = valueWh / 1000

              const dateParts = reading.date.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
              if (!dateParts) return null

              const year = parseInt(dateParts[1])
              const month = parseInt(dateParts[2]) - 1
              const day = parseInt(dateParts[3])
              const hour = parseInt(dateParts[4])
              const minute = parseInt(dateParts[5])
              const second = parseInt(dateParts[6])

              const date = new Date(year, month, day, hour, minute, second)
              // Subtract interval to get START time
              date.setMinutes(date.getMinutes() - intervalMinutes)

              // Only keep readings for the target date
              const readingDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              if (readingDateKey !== lastYearKey) {
                return null
              }

              const hourValue = date.getHours()
              const minuteValue = date.getMinutes()
              const isHC = isOffpeakHour(hourValue, pdl?.offpeak_hours)

              return {
                date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(hourValue).padStart(2, '0')}:${String(minuteValue).padStart(2, '0')}:00`,
                hour: hourValue,
                minute: minuteValue,
                value: valueKWh,
                isHC,
              }
            })
            .filter(Boolean)

          // Add to hourlyData with a special marker
          setHourlyData(prev => {
            const existingDay = prev.find(d => d.day === dayKey)
            if (existingDay) {
              existingDay.lastYearReadings = lastYearReadings
              existingDay.lastYearDate = lastYearKey
              return [...prev]
            }
            return prev
          })

          setComparingDays(prev => new Set(prev).add(dayKey))
          toast.success(`Comparaison ajoutée avec ${lastYearDate.toLocaleDateString('fr-FR')}`)
        } else {
          toast.error('Aucune donnée disponible pour cette date l\'année dernière')
        }
      } else {
        // Handle API error response
        const errorMsg = response.error?.message || 'Erreur lors de la récupération des données de l\'année dernière'
        if (errorMsg.includes('technical_error') || errorMsg.includes('Technical error')) {
          toast.error(
            `Erreur technique Enedis pour le ${lastYearDate.toLocaleDateString('fr-FR')}. Réessayez plus tard.`,
            { duration: 5000 }
          )
        } else {
          toast.error(errorMsg, { duration: 5000 })
        }
      }
    } catch (error: any) {
      toast.dismiss(loadingToast)

      // Parse error message
      let errorMessage = error.message || 'Erreur lors de la comparaison'

      // Check for specific error patterns
      if (errorMessage.includes('500') || errorMessage.includes('technical_error')) {
        errorMessage = `Erreur technique Enedis pour le ${lastYearDate.toLocaleDateString('fr-FR')}. Réessayez plus tard.`
      } else if (errorMessage.includes('404')) {
        errorMessage = `Aucune donnée disponible pour le ${lastYearDate.toLocaleDateString('fr-FR')}`
      } else if (errorMessage.includes('403') || errorMessage.includes('401')) {
        errorMessage = 'Accès refusé. Vérifiez vos autorisations.'
      }

      toast.error(errorMessage, { duration: 5000 })
    }
  }

  // Function to fetch hourly data
  const fetchHourlyData = async () => {
    if (!selectedPDL || !hourlyStartDate || !hourlyEndDate) return

    setIsLoadingHourly(true)
    setHourlyFetchProgress({
      message: `Récupération des données du ${new Date(hourlyStartDate).toLocaleDateString('fr-FR')} au ${new Date(hourlyEndDate).toLocaleDateString('fr-FR')}...`,
      percentage: 0
    })

    try {
      const pdl = pdls.find((p: any) => p.usage_point_id === selectedPDL)

      setHourlyFetchProgress({
        message: `Récupération des données du ${new Date(hourlyStartDate).toLocaleDateString('fr-FR')} au ${new Date(hourlyEndDate).toLocaleDateString('fr-FR')}...`,
        percentage: 50
      })

      const response = await enedisApi.getConsumptionDetail(selectedPDL, {
        start: hourlyStartDate,
        end: hourlyEndDate,
        use_cache: true,
      })

      setHourlyFetchProgress({
        message: 'Traitement des données...',
        percentage: 75
      })

      if (response.success && response.data) {
        const data = response.data as any
        let readings: IntervalReading[] | undefined
        let globalIntervalLength: string | undefined

        if (data?.meter_reading?.interval_reading) {
          readings = data.meter_reading.interval_reading
          globalIntervalLength = data.meter_reading.interval_length
        } else if (data?.interval_reading) {
          readings = data.interval_reading
          globalIntervalLength = data.interval_length
        } else if (Array.isArray(data)) {
          readings = data
        }

        if (readings && readings.length > 0) {
          // Group readings by day
          const dailyData: Record<string, any[]> = {}

          readings.forEach((reading: any) => {
            const intervalLength = reading.interval_length || globalIntervalLength || 'PT30M'
            const intervalMatch = intervalLength.match(/PT(\d+)M/)
            const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30

            // Enedis returns Wh directly, not W
            const valueWh = parseFloat(reading.value)
            const valueKWh = valueWh / 1000

            // Enedis returns local time (Europe/Paris) at END of period
            // Parse as local time (not UTC) and subtract interval to get START
            // Date format can be with or without 'T': "2025-10-08T20:00:00" or "2025-10-08 20:00:00"
            const dateParts = reading.date.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
            if (!dateParts) {
              console.warn('Could not parse date:', reading.date)
              return
            }

            const year = parseInt(dateParts[1])
            const month = parseInt(dateParts[2]) - 1 // Month is 0-indexed
            const day = parseInt(dateParts[3])
            const hour = parseInt(dateParts[4])
            const minute = parseInt(dateParts[5])
            const second = parseInt(dateParts[6])

            // Create date in local timezone (at END of period)
            const date = new Date(year, month, day, hour, minute, second)
            // Subtract interval to get START time
            date.setMinutes(date.getMinutes() - intervalMinutes)

            // Format date manually to avoid UTC conversion
            const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            const dateStr = `${dayKey}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`

            const hourValue = date.getHours()
            const minuteValue = date.getMinutes()
            const isHC = isOffpeakHour(hourValue, pdl?.offpeak_hours)

            if (!dailyData[dayKey]) {
              dailyData[dayKey] = []
            }

            dailyData[dayKey].push({
              date: dateStr,
              hour: hourValue,
              minute: minuteValue,
              value: valueKWh,
              isHC,
            })
          })

          console.log('Daily data grouped:', dailyData)

          // Convert to array and sort by date (most recent first)
          const formattedData = Object.entries(dailyData).map(([day, hourlyReadings]) => ({
            day,
            readings: hourlyReadings.sort((a, b) => {
              // Sort by hour first, then by minute
              if (a.hour !== b.hour) return a.hour - b.hour
              return (a.minute || 0) - (b.minute || 0)
            }),
          })).sort((a, b) => b.day.localeCompare(a.day))

          // Set all data at once and reset to first tab
          setHourlyData(formattedData)
          setSelectedDayTab(0)
          toast.success(`Données horaires récupérées : ${readings.length} relevés`)
        } else {
          toast.error('Aucune donnée horaire disponible pour cette période')
          setHourlyData([])
        }
      } else {
        toast.error(response.error?.message || 'Erreur lors de la récupération des données horaires')
        setHourlyData([])
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la récupération des données horaires')
      setHourlyData([])
    } finally {
      setIsLoadingHourly(false)
      setHourlyFetchProgress(null)
    }
  }

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
        const totalDetailRequests = 2 * 52 // 2 years * 52 weeks (full year = ~52 weeks, 7 days per request)
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
        // Use same rolling year as yearly data: from today to same date last year
        setFetchProgress({ current: currentRequest, total: totalRequests, phase: 'Récupération des données HC/HP...' })

        for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
          const periodEndDate = new Date(today)
          periodEndDate.setFullYear(today.getFullYear() - yearOffset)

          // For yearOffset = 0 (current year), use yesterday as end date
          // because today's data is not complete yet
          if (yearOffset === 0) {
            periodEndDate.setDate(periodEndDate.getDate() - 1) // Yesterday
          }

          // For yearOffset > 0, end at the last day of the previous month to avoid duplication
          if (yearOffset > 0) {
            periodEndDate.setMonth(periodEndDate.getMonth() - 1) // Go back one month
            periodEndDate.setDate(1) // First day of that month
            periodEndDate.setDate(0) // Last day of previous month (month before current)
          }

          const periodStartDate = new Date(periodEndDate)
          periodStartDate.setFullYear(periodEndDate.getFullYear() - 1)
          periodStartDate.setDate(periodStartDate.getDate() + 1) // Start from day after to avoid overlap

          const year = periodEndDate.getFullYear()

          // Invalidate cache for the last 3 days to avoid using stale single-day requests
          // This prevents errors when old cache had start=end which Enedis doesn't allow
          for (let daysBack = 0; daysBack < 3; daysBack++) {
            const dateToInvalidate = new Date(periodEndDate)
            dateToInvalidate.setDate(dateToInvalidate.getDate() - daysBack)
            const dateStr = dateToInvalidate.toISOString().split('T')[0]

            const invalidKeys = [
              ['consumption-detail', selectedPDL, dateStr, dateStr],
              ['consumption-daily', selectedPDL, dateStr, dateStr],
            ]
            invalidKeys.forEach(key => {
              queryClient.removeQueries({ queryKey: key })
            })
            console.log(`🗑️ Invalidated cache for single-day requests on ${dateStr}`)
          }

          // Generate date ranges (max 7 days per request)
          const dateRanges = generateDateRanges(periodStartDate, periodEndDate, 7)

          let totalConsumption = 0
          let hcConsumption = 0
          let hpConsumption = 0
          let monthlyData: any = {}
          let readingCount = 0
          let totalReadingsProcessed = 0

          console.log(`[HC/HP ${year}] Processing ${dateRanges.length} date ranges from ${periodStartDate.toISOString().split('T')[0]} to ${periodEndDate.toISOString().split('T')[0]}`)

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
              // interval_length is in each reading, not at meter_reading level
              globalIntervalLength = readings[0]?.interval_length
            } else if (data?.interval_reading) {
              readings = data.interval_reading
              globalIntervalLength = readings[0]?.interval_length || data.interval_length
            } else if (Array.isArray(data)) {
              readings = data
              globalIntervalLength = data[0]?.interval_length
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

              // Capture period dates for use in forEach
              const periodStart = periodStartDate
              const periodEnd = periodEndDate

              readings.forEach((reading: any) => {
                const intervalLength = reading.interval_length || globalIntervalLength || 'PT30M'
                const intervalMatch = intervalLength.match(/PT(\d+)M/)
                const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30

                // Enedis returns energy in Wh for the interval period
                // For 30-min intervals, the value is Wh consumed during those 30 minutes
                const valueWh = parseFloat(reading.value)
                const valueKWh = valueWh / 1000

                totalReadingsProcessed++

                // Enedis returns local time (Europe/Paris) at END of period
                // Parse the date and subtract interval to get START for HC/HP determination
                const dateParts = reading.date.match(/(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2}):(\d{2})/)
                if (!dateParts) {
                  console.warn('Could not parse date:', reading.date)
                  return
                }

                const readingYear = parseInt(dateParts[1])
                const readingMonth = parseInt(dateParts[2]) - 1
                const readingDay = parseInt(dateParts[3])
                const endHour = parseInt(dateParts[4])
                const endMinute = parseInt(dateParts[5])
                const second = parseInt(dateParts[6])

                // Create date at END time and subtract interval to get START
                const readingEndDate = new Date(readingYear, readingMonth, readingDay, endHour, endMinute, second)
                const readingStartDate = new Date(readingEndDate)
                readingStartDate.setMinutes(readingStartDate.getMinutes() - intervalMinutes)

                // Filter: only include readings where END date is within the period
                if (readingEndDate < periodStart || readingEndDate > periodEnd) {
                  // Skip this reading - it's outside the requested period
                  return
                }

                // Use the START hour to determine if it's HC or HP
                const hourValue = readingStartDate.getHours()
                const isHC = isOffpeakHour(hourValue, pdl?.offpeak_hours)

                if (isHC) {
                  hcConsumption += valueKWh
                } else {
                  hpConsumption += valueKWh
                }

                totalConsumption += valueKWh

                // Use END date for month attribution (like Enedis does)
                const monthKey = `${readingEndDate.getFullYear()}-${String(readingEndDate.getMonth() + 1).padStart(2, '0')}`

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
            start_date: periodStartDate.toISOString().split('T')[0],
            end_date: periodEndDate.toISOString().split('T')[0],
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

        // Auto-load hourly data if dates are set
        if (hourlyStartDate && hourlyEndDate) {
          setTimeout(() => {
            fetchHourlyData()
          }, 500)
        }
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

  // Auto-expand sections when data is loaded
  useEffect(() => {
    if (yearlyData && yearlyData.years && yearlyData.years.length > 0 && !isLoading) {
      setIsYearlySectionExpanded(true)
    }
  }, [yearlyData, isLoading])

  useEffect(() => {
    if (hchpData && hchpData.years && hchpData.years.length > 0 && !isLoading) {
      setIsHCHPSectionExpanded(true)
    }
  }, [hchpData, isLoading])

  useEffect(() => {
    if (hourlyData.length > 0 && !isLoadingHourly) {
      setIsHourlySectionExpanded(true)
    }
  }, [hourlyData, isLoadingHourly])

  // Prepare data for monthly evolution chart (rolling years)
  // Collect all monthly data from all years
  const allMonthlyData: Array<{date: string, consumption: number, year: number, monthYear: string}> = []

  yearlyData?.years.forEach((yearData: any) => {
    yearData.monthly_data.forEach((item: any) => {
      const [year, month] = item.month.split('-')
      const monthDate = new Date(item.month + '-01')
      const monthYear = monthDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
      allMonthlyData.push({
        date: item.month,
        consumption: item.consumption,
        year: parseInt(year),
        monthYear: monthYear
      })
    })
  })

  // Also add HC/HP data if available for more complete data
  hchpData?.years?.forEach((yearData: any) => {
    yearData.monthly_data?.forEach((item: any) => {
      const totalConsumption = (item.hc || 0) + (item.hp || 0)
      if (totalConsumption > 0) {
        // Check if this month already exists
        const existingMonth = allMonthlyData.find(d => d.date === item.month)
        if (!existingMonth) {
          const [year, month] = item.month.split('-')
          const monthDate = new Date(item.month + '-01')
          const monthYear = monthDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
          allMonthlyData.push({
            date: item.month,
            consumption: totalConsumption,
            year: parseInt(year),
            monthYear: monthYear
          })
        } else if (existingMonth && !existingMonth.consumption) {
          // Update if existing has no consumption
          existingMonth.consumption = totalConsumption
        }
      }
    })
  })

  // Sort by date
  allMonthlyData.sort((a, b) => a.date.localeCompare(b.date))

  // Group data for 3 rolling years display
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  // Create data structure for chart
  const yearlyChartData: any[] = []
  const monthNames = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

  // For each month position in the rolling 12 months
  for (let i = 0; i < 12; i++) {
    const monthOffset = 11 - i  // Start from 11 months ago
    const targetDate = new Date(today.getFullYear(), today.getMonth() - monthOffset, 1)
    const monthName = monthNames[targetDate.getMonth()]

    const dataPoint: any = {
      month: `${monthName} ${targetDate.getFullYear()}`
    }

    // Get all unique years from the data
    const uniqueYears = [...new Set(allMonthlyData.map(d => d.year))].sort()

    // Get data for the same month in all available years
    for (const year of uniqueYears) {
      const dateKey = `${year}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
      const yearData = allMonthlyData.find(d => d.date === dateKey)
      if (yearData) {
        dataPoint[year.toString()] = yearData.consumption
      }
    }

    yearlyChartData.push(dataPoint)
  }

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

  // Prepare HC/HP monthly chart data based on selected year
  const hchpMonthlyData = selectedYearHCHP?.monthly_data
    ?.sort((a: any, b: any) => {
      // Sort by month chronologically (YYYY-MM format)
      return a.month.localeCompare(b.month)
    })
    .map((item: any) => ({
      month: new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      'HC (kWh)': item.hc,
      'HP (kWh)': item.hp,
    })) || []

  const COLORS = {
    hc: '#10b981', // green-500
    hp: '#f59e0b', // amber-500
    hcDark: '#059669', // green-600 (darker for N-1)
    hpDark: '#d97706', // amber-600 (darker for N-1)
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
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <TrendingUp className="text-primary-600 dark:text-primary-400" size={28} />
            Consommation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Visualisez vos données de consommation sur plusieurs années</p>
        </div>

        {/* Export All Data Buttons - Only show when data is loaded */}
        {((yearlyData && yearlyData.years && yearlyData.years.length > 0) ||
          (hchpData && hchpData.years && hchpData.years.length > 0) ||
          hourlyData.length > 0) && (
          <div className="flex gap-2">
            <button
              onClick={copyAllDataJSON}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
              title="Copier toutes les données dans le presse-papier"
            >
              <Copy size={18} />
              Copier JSON
            </button>
            <button
              onClick={exportAllDataJSON}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
              title="Télécharger toutes les données de la page en JSON"
            >
              <Download size={18} />
              Télécharger JSON
            </button>
          </div>
        )}
      </div>

      {/* PDL Selection and Data Loading Section */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
          <Database className="text-primary-600 dark:text-primary-400" size={24} />
          Chargement des données
        </h2>

        <div className="space-y-4">
          {/* PDL Selector */}
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

          {/* Fetch Status Notification */}
          {fetchStatus && (
            <div className={`p-4 border-l-4 rounded-lg ${
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
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
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
            <div className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
                <p className="text-red-800 dark:text-red-200">
                  Erreur lors du chargement des données. Veuillez réessayer plus tard.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Yearly Statistics Section */}
      <div className="card p-6">
        <div className={`flex items-center gap-2 ${isYearlySectionExpanded ? 'mb-4' : ''}`}>
          <h2
            className={`text-xl font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 ${
              yearlyData && yearlyData.years && yearlyData.years.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (yearlyData && yearlyData.years && yearlyData.years.length > 0) {
                setIsYearlySectionExpanded(!isYearlySectionExpanded)
              }
            }}
          >
            <Calendar className="text-primary-600 dark:text-primary-400" size={24} />
            Consommation annuelle (3 dernières années)
          </h2>
          <span
            className={`text-sm text-gray-500 ${
              yearlyData && yearlyData.years && yearlyData.years.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (yearlyData && yearlyData.years && yearlyData.years.length > 0) {
                setIsYearlySectionExpanded(!isYearlySectionExpanded)
              }
            }}
          >
            {isYearlySectionExpanded ? '▼' : '▶'}
          </span>
        </div>

        {isYearlySectionExpanded ? (
          yearlyData && !isLoading ? (
            <>
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
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-medium">Comparaison annuelle</h3>
                <button
                  onClick={exportYearlyComparisonJSON}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
                  title="Exporter en JSON"
                >
                  <Download size={16} />
                  JSON
                </button>
              </div>
              <ResponsiveContainer width="100%" height={250} style={{ cursor: 'pointer' }}>
                <BarChart data={yearlyComparisonData}>
                  <CartesianGrid {...getGridProps()} />
                  <XAxis dataKey="year" {...getAxisProps()} />
                  <YAxis {...getAxisProps()} />
                  <Tooltip {...getTooltipProps()} />
                  <Legend />
                  <Bar dataKey="Consommation (kWh)" fill="rgb(6, 132, 199)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Evolution Chart */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-medium">Évolution mensuelle</h3>
                <button
                  onClick={exportMonthlyConsumptionJSON}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
                  title="Exporter en JSON"
                >
                  <Download size={16} />
                  JSON
                </button>
              </div>
              <ResponsiveContainer width="100%" height={350} style={{ cursor: 'pointer' }}>
                <LineChart data={yearlyChartData}>
                  <CartesianGrid {...getGridProps()} />
                  <XAxis dataKey="month" {...getAxisProps()} />
                  <YAxis {...getAxisProps()} />
                  <Tooltip
                    {...getTooltipProps()}
                    content={(props: any) => {
                      const { active, payload, label } = props
                      if (!active || !payload || payload.length === 0) return null

                      const tooltipStyle = isDarkMode ? {
                        backgroundColor: 'rgb(30, 41, 59)',
                        border: '1px solid rgb(51, 65, 85)',
                        borderRadius: '0.5rem',
                        padding: '8px 12px',
                        color: 'rgb(255, 255, 255)'
                      } : {
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        padding: '8px 12px'
                      }

                      return (
                        <div style={tooltipStyle}>
                          <p style={{ marginBottom: '6px', fontWeight: 'bold' }}>{label}</p>
                          {payload.map((entry: any, index: number) => (
                            <p key={index} style={{ margin: '4px 0', color: entry.stroke }}>
                              {entry.name}: {entry.value ? `${entry.value.toFixed(2)} kWh` : 'N/A'}
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    onClick={(e: any) => {
                      const year = e.dataKey
                      if (year) {
                        setHiddenYears(prev => {
                          const newSet = new Set(prev)
                          if (newSet.has(year)) {
                            newSet.delete(year)
                          } else {
                            newSet.add(year)
                          }
                          return newSet
                        })
                      }
                    }}
                    wrapperStyle={{ cursor: 'pointer' }}
                  />
                  {/* Generate lines dynamically based on available years */}
                  {(() => {
                    // Get unique years from the data
                    const years = new Set<string>()
                    yearlyChartData.forEach((dataPoint: any) => {
                      Object.keys(dataPoint).forEach(key => {
                        if (key !== 'month' && !isNaN(parseInt(key))) {
                          years.add(key)
                        }
                      })
                    })

                    // Sort years descending
                    const sortedYears = Array.from(years)
                      .sort()
                      .reverse()

                    // Define color palette for multiple years
                    const colors = [
                      'rgb(6, 132, 199)',   // Blue
                      '#8b5cf6',            // Purple
                      '#ec4899',            // Pink
                      '#f97316',            // Orange
                      '#10b981',            // Green
                      '#f59e0b',            // Amber
                      '#6366f1',            // Indigo
                      '#14b8a6',            // Teal
                    ]

                    // Map to Line components with different colors
                    return sortedYears.map((year, index) => (
                      <Line
                        key={year}
                        type="monotone"
                        dataKey={year}
                        stroke={colors[index % colors.length]}
                        name={year}
                        strokeWidth={2}
                        connectNulls={false}  // Don't connect points when there's no data
                        dot={{ r: 3 }}  // Show dots on data points
                        hide={hiddenYears.has(year)}
                        strokeOpacity={hiddenYears.has(year) ? 0.3 : 1}
                      />
                    ))
                  })()}
                </LineChart>
              </ResponsiveContainer>
            </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Chargez les données pour voir les statistiques annuelles
            </div>
          )
        ) : null}
      </div>

      {/* HC/HP Statistics Section */}
      <div className="card p-6">
        <div className={`flex items-center gap-2 ${isHCHPSectionExpanded ? 'mb-4' : ''}`}>
          <h2
            className={`text-xl font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 ${
              hchpData && hchpData.years && hchpData.years.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (hchpData && hchpData.years && hchpData.years.length > 0) {
                setIsHCHPSectionExpanded(!isHCHPSectionExpanded)
              }
            }}
          >
            <Clock className="text-primary-600 dark:text-primary-400" size={24} />
            Répartition Heures Creuses / Heures Pleines (2 dernières années)
          </h2>
          {isHCHPSectionExpanded && (
            <button
              onClick={exportHCHPPieJSON}
              className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
              title="Exporter les données du graphique en JSON"
            >
              <Download size={16} />
              JSON
            </button>
          )}
          <span
            className={`text-sm text-gray-500 ${
              hchpData && hchpData.years && hchpData.years.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (hchpData && hchpData.years && hchpData.years.length > 0) {
                setIsHCHPSectionExpanded(!isHCHPSectionExpanded)
              }
            }}
          >
            {isHCHPSectionExpanded ? '▼' : '▶'}
          </span>
        </div>

        {isHCHPSectionExpanded ? (
          hchpData && selectedYearHCHP && !isLoading ? (
            <>
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
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
              {hchpData.years.map((yearData: any, index: number) => (
                <button
                  key={yearData.year}
                  onClick={() => setSelectedHCHPYear(index)}
                  className={`flex-1 px-4 py-3 text-lg font-bold transition-colors whitespace-nowrap border-b-2 -mb-px ${
                    selectedHCHPYear === index
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
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
              <ResponsiveContainer width="100%" height={300} style={{ cursor: 'pointer' }}>
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
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">Détail mensuel {selectedYearHCHP.year}</h3>
                <button
                  onClick={exportHCHPMonthlyJSON}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
                  title="Exporter en JSON"
                >
                  <Download size={16} />
                  JSON
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Du {new Date(selectedYearHCHP.start_date).toLocaleDateString('fr-FR')} au {new Date(selectedYearHCHP.end_date).toLocaleDateString('fr-FR')}
              </p>
              <ResponsiveContainer width="100%" height={350} style={{ cursor: 'pointer' }}>
                <BarChart data={hchpMonthlyData}>
                  <CartesianGrid {...getGridProps()} />
                  <XAxis dataKey="month" {...getAxisProps()} />
                  <YAxis {...getAxisProps()} />
                  <Tooltip
                    {...getTooltipProps()}
                    content={(props: any) => {
                      const { active, payload, label } = props
                      if (active && payload && payload.length) {
                        const hcValue = payload.find((p: any) => p.dataKey === 'HC (kWh)')?.value || 0
                        const hpValue = payload.find((p: any) => p.dataKey === 'HP (kWh)')?.value || 0
                        const total = hcValue + hpValue

                        const tooltipStyle = isDarkMode ? {
                          backgroundColor: 'rgb(30, 41, 59)',
                          border: '1px solid rgb(51, 65, 85)',
                          borderRadius: '0.5rem',
                          color: 'rgb(226, 232, 240)',
                          padding: '8px 12px'
                        } : {
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.5rem',
                          padding: '8px 12px'
                        }

                        return (
                          <div style={tooltipStyle}>
                            <p style={{ marginBottom: '6px', fontWeight: 'bold' }}>{label}</p>
                            <p style={{ margin: '4px 0', color: COLORS.hc }}>
                              HC : {hcValue.toFixed(2)} kWh
                            </p>
                            <p style={{ margin: '4px 0', color: COLORS.hp }}>
                              HP : {hpValue.toFixed(2)} kWh
                            </p>
                            <p style={{
                              marginTop: '6px',
                              paddingTop: '6px',
                              borderTop: `1px solid ${isDarkMode ? 'rgb(75, 85, 99)' : '#e5e7eb'}`,
                              fontWeight: 'bold'
                            }}>
                              Total : {total.toFixed(2)} kWh
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Legend />
                  <Bar dataKey="HC (kWh)" fill={COLORS.hc} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="HP (kWh)" fill={COLORS.hp} stackId="a" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Chargez les données pour voir les statistiques HC/HP
            </div>
          )
        ) : null}
      </div>

      {/* Hourly Data Section */}
      <div className="card p-6">
        <div className={`flex items-center gap-2 ${isHourlySectionExpanded ? 'mb-4' : ''}`}>
          <h2
            className={`text-xl font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 ${
              hourlyData.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (hourlyData.length > 0) {
                setIsHourlySectionExpanded(!isHourlySectionExpanded)
              }
            }}
          >
            <Clock className="text-primary-600 dark:text-primary-400" size={24} />
            Consommation horaire (détail jour par jour)
          </h2>
          <span
            className={`text-sm text-gray-500 ${
              hourlyData.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
            onClick={() => {
              if (hourlyData.length > 0) {
                setIsHourlySectionExpanded(!isHourlySectionExpanded)
              }
            }}
          >
            {isHourlySectionExpanded ? '▼' : '▶'}
          </span>
        </div>

        {/* Period and Date Range Selector */}
        {isHourlySectionExpanded && (
        <div className="mb-6">
          <div className="flex items-center gap-3 w-full">
            {/* Date inputs */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <input
                type="date"
                value={hourlyStartDate}
                min={(() => {
                  const twoYearsAgo = new Date()
                  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
                  return twoYearsAgo.toISOString().split('T')[0]
                })()}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value)
                  const twoYearsAgo = new Date()
                  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

                  if (selectedDate < twoYearsAgo) {
                    toast.error('Les données ne sont disponibles que sur les 2 dernières années')
                    return
                  }

                  setHourlyStartDate(e.target.value)
                  setSelectedPeriod('custom')
                  // Validate max 7 days
                  if (hourlyEndDate) {
                    const start = new Date(e.target.value)
                    const end = new Date(hourlyEndDate)
                    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                    if (diffDays > 7) {
                      toast.error('La période ne peut pas dépasser 7 jours')
                    }
                  }
                }}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
              />
              <span className="text-gray-500 dark:text-gray-400">→</span>
              <input
                type="date"
                value={hourlyEndDate}
                min={(() => {
                  const twoYearsAgo = new Date()
                  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
                  return twoYearsAgo.toISOString().split('T')[0]
                })()}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  const selectedDate = new Date(e.target.value)
                  const twoYearsAgo = new Date()
                  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

                  if (selectedDate < twoYearsAgo) {
                    toast.error('Les données ne sont disponibles que sur les 2 dernières années')
                    return
                  }

                  setHourlyEndDate(e.target.value)
                  setSelectedPeriod('custom')
                  // Validate max 7 days
                  if (hourlyStartDate) {
                    const start = new Date(hourlyStartDate)
                    const end = new Date(e.target.value)
                    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                    if (diffDays > 7) {
                      toast.error('La période ne peut pas dépasser 7 jours')
                    }
                  }
                }}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
              />
            </div>

            {/* Quick period buttons */}
            <button
              onClick={() => { setWeekOffset(0); setPeriodDates('this-week', 0); }}
              title="Cette semaine (du lundi à aujourd'hui)"
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'this-week'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Cette semaine
            </button>
            <button
              onClick={() => { setWeekOffset(0); setPeriodDates('last-month'); }}
              title="Dernière semaine du mois dernier"
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'last-month'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Le mois dernier
            </button>
            <button
              onClick={() => { setWeekOffset(0); setPeriodDates('last-year'); }}
              title="Cette semaine l'année dernière"
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === 'last-year'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              L'année dernière
            </button>
          </div>
        </div>
        )}

        {/* Loading State */}
        {isLoadingHourly && hourlyFetchProgress && isHourlySectionExpanded && (
          <div className="card p-6 min-h-[400px]">
            <div className="flex flex-col items-center justify-center space-y-4 h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              <p className="text-center text-gray-600 dark:text-gray-400">
                {hourlyFetchProgress.message}
              </p>
              <div className="w-full max-w-md">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${hourlyFetchProgress.percentage}%` }}
                  ></div>
                </div>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {hourlyFetchProgress.percentage}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Week navigation with day tabs in between (only for 'this-week') */}
        {!isLoadingHourly && hourlyData.length > 0 && selectedPeriod === 'this-week' && isHourlySectionExpanded && (
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => navigateWeek('prev')}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium whitespace-nowrap"
                title="Semaine précédente"
              >
                ← Semaine précédente
              </button>

              {/* Day Tabs */}
              <div className="flex-1 flex border-b border-gray-200 dark:border-gray-700">
                {[...hourlyData].reverse().map((dayData, reversedIndex) => {
                  const index = hourlyData.length - 1 - reversedIndex
                  return (
                    <button
                      key={dayData.day}
                      onClick={() => setSelectedDayTab(index)}
                      className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                        selectedDayTab === index
                          ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                          : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {new Date(dayData.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => navigateWeek('next')}
                disabled={weekOffset === 0}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap"
                title="Semaine suivante"
              >
                Semaine suivante →
              </button>
            </div>
          </div>
        )}

        {/* Day Tabs for non-this-week periods */}
        {!isLoadingHourly && hourlyData.length > 0 && selectedPeriod !== 'this-week' && isHourlySectionExpanded && (
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
            {[...hourlyData].reverse().map((dayData, reversedIndex) => {
              const index = hourlyData.length - 1 - reversedIndex
              return (
                <button
                  key={dayData.day}
                  onClick={() => setSelectedDayTab(index)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                    selectedDayTab === index
                      ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {new Date(dayData.day).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                </button>
              )
            })}
          </div>
        )}

        {/* Hourly Data Display */}
        {!isLoadingHourly && isHourlySectionExpanded && (
          <div className="min-h-[400px]">
            {hourlyData.length > 0 && hourlyData[selectedDayTab] && (() => {
              const dayData = hourlyData[selectedDayTab]
              const hasComparison = dayData.lastYearReadings && dayData.lastYearReadings.length > 0

              // Prepare data for the chart - merge current and last year if comparing
              let chartData: any[] = []

              if (hasComparison) {
                // Create a map of hour:minute -> readings for both years
                const currentYearMap = new Map()
                dayData.readings.forEach((reading: any) => {
                  const key = `${reading.hour}:${reading.minute || 0}`
                  currentYearMap.set(key, reading)
                })

                const lastYearMap = new Map()
                dayData.lastYearReadings.forEach((reading: any) => {
                  const key = `${reading.hour}:${reading.minute}`
                  lastYearMap.set(key, reading)
                })

                // Merge both datasets using current year as reference
                chartData = dayData.readings.map((reading: any, index: number) => {
                  const hour = reading.hour
                  const minute = reading.minute || 0
                  const key = `${hour}:${minute}`
                  const lastYearReading = lastYearMap.get(key)

                  return {
                    index,
                    hour: `${hour}h${minute === 0 ? '' : String(minute).padStart(2, '0')}`,
                    hourValue: hour,
                    minuteValue: minute,
                    'Année actuelle (kWh)': Math.round(reading.value * 1000) / 1000,
                    'Année N-1 (kWh)': lastYearReading ? Math.round(lastYearReading.value * 1000) / 1000 : 0,
                    type: reading.isHC ? 'HC' : 'HP',
                    typeLastYear: lastYearReading ? (lastYearReading.isHC ? 'HC' : 'HP') : null,
                  }
                })
              } else {
                // No comparison - single dataset
                chartData = dayData.readings.map((reading: any, index: number) => {
                  const hour = reading.hour
                  const minute = reading.minute || 0

                  return {
                    index,
                    hour: `${hour}h${minute === 0 ? '' : String(minute).padStart(2, '0')}`,
                    hourValue: hour,
                    minuteValue: minute,
                    'Consommation (kWh)': Math.round(reading.value * 1000) / 1000,
                    type: reading.isHC ? 'HC' : 'HP',
                  }
                })
              }

              const totalDay = dayData.readings.reduce((sum: number, r: any) => sum + r.value, 0)
              const totalHC = dayData.readings.filter((r: any) => r.isHC).reduce((sum: number, r: any) => sum + r.value, 0)
              const totalHP = dayData.readings.filter((r: any) => !r.isHC).reduce((sum: number, r: any) => sum + r.value, 0)
              const percentHC = totalDay > 0 ? (totalHC / totalDay * 100) : 0
              const percentHP = totalDay > 0 ? (totalHP / totalDay * 100) : 0

              const totalLastYear = hasComparison
                ? dayData.lastYearReadings.reduce((sum: number, r: any) => sum + r.value, 0)
                : 0
              const totalLastYearHC = hasComparison
                ? dayData.lastYearReadings.filter((r: any) => r.isHC).reduce((sum: number, r: any) => sum + r.value, 0)
                : 0
              const totalLastYearHP = hasComparison
                ? dayData.lastYearReadings.filter((r: any) => !r.isHC).reduce((sum: number, r: any) => sum + r.value, 0)
                : 0
              const percentLastYearHC = totalLastYear > 0 ? (totalLastYearHC / totalLastYear * 100) : 0
              const percentLastYearHP = totalLastYear > 0 ? (totalLastYearHP / totalLastYear * 100) : 0

              return (
                <div key={dayData.day} className="card p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {new Date(dayData.day + 'T12:00:00').toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </h3>
                      {hasComparison && dayData.lastYearDate && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Comparaison avec le {new Date(dayData.lastYearDate + 'T12:00:00').toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex gap-4 text-sm">
                        <div>
                          <div className="font-medium">Année actuelle</div>
                          <div className="flex gap-2">
                            <span className="font-medium">Total: {totalDay.toFixed(2)} kWh</span>
                            <span className="text-green-600 dark:text-green-400">
                              HC: {totalHC.toFixed(2)} ({percentHC.toFixed(1)}%)
                            </span>
                            <span className="text-amber-600 dark:text-amber-400">
                              HP: {totalHP.toFixed(2)} ({percentHP.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        {hasComparison && (
                          <div className="border-l border-gray-300 dark:border-gray-600 pl-4">
                            <div className="font-medium text-orange-600 dark:text-orange-400">Année N-1</div>
                            <div className="flex flex-col gap-1">
                              <div>
                                <span className="font-medium">Total: {totalLastYear.toFixed(2)} kWh</span>
                                <span className={`ml-2 ${totalDay > totalLastYear ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                  ({totalDay > totalLastYear ? '+' : ''}{((totalDay - totalLastYear) / totalLastYear * 100).toFixed(1)}%)
                                </span>
                              </div>
                              <div className="flex gap-2 text-xs">
                                <span className="text-green-600 dark:text-green-400">
                                  HC: {totalLastYearHC.toFixed(2)} ({percentLastYearHC.toFixed(1)}%)
                                </span>
                                <span className="text-amber-600 dark:text-amber-400">
                                  HP: {totalLastYearHP.toFixed(2)} ({percentLastYearHP.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => compareWithLastYear(dayData.day)}
                        className={`px-3 py-1 rounded-lg flex items-center gap-2 text-sm transition-colors ${
                          comparingDays.has(dayData.day)
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                        title={comparingDays.has(dayData.day) ? 'Retirer la comparaison' : 'Comparer avec l\'année dernière'}
                      >
                        <Calendar size={16} />
                        {comparingDays.has(dayData.day) ? 'Retirer N-1' : 'Comparer N-1'}
                      </button>
                      <button
                        onClick={() => copyDayDataToClipboard(dayData)}
                        className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 text-sm transition-colors"
                        title="Copier les données en JSON"
                      >
                        <Copy size={16} />
                        JSON
                      </button>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={350} style={{ cursor: 'pointer' }}>
                    <BarChart data={chartData} margin={{ bottom: 20, left: 10, right: 10 }} barCategoryGap="10%">
                      <CartesianGrid {...getGridProps()} />
                      <XAxis
                        dataKey="index"
                        type="number"
                        domain={[-0.5, chartData.length - 0.5]}
                        ticks={chartData
                          .map((entry, idx) => entry.minuteValue === 0 && entry.hourValue % 4 === 0 ? idx : null)
                          .filter((v): v is number => v !== null)}
                        tickFormatter={(value) => {
                          const entry = chartData[value]
                          return entry ? `${entry.hourValue}h` : ''
                        }}
                        tick={{ fill: isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)', fontSize: 13 }}
                        interval={0}
                      />
                      <YAxis tick={{ dx: -8, ...getAxisProps().tick }} width={50} />
                      <Tooltip
                        {...getTooltipProps()}
                        labelFormatter={(value) => {
                          const entry = chartData[value as number]
                          return entry ? entry.hour : ''
                        }}
                      />
                      <Legend />
                      {hasComparison ? (
                        <>
                          <Bar dataKey="Année actuelle (kWh)" fill="rgb(6, 132, 199)" radius={[8, 8, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-current-${index}`} fill={entry.type === 'HC' ? COLORS.hc : COLORS.hp} />
                            ))}
                          </Bar>
                          <Bar dataKey="Année N-1 (kWh)" fill="#f97316" radius={[8, 8, 0, 0]}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-lastyear-${index}`} fill={entry.typeLastYear === 'HC' ? COLORS.hcDark : entry.typeLastYear === 'HP' ? COLORS.hpDark : '#9ca3af'} />
                            ))}
                          </Bar>
                        </>
                      ) : (
                        <Bar dataKey="Consommation (kWh)" fill="rgb(6, 132, 199)" radius={[8, 8, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.type === 'HC' ? COLORS.hc : COLORS.hp} />
                          ))}
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}
            {hourlyData.length === 0 && hourlyStartDate && hourlyEndDate && (
              <div className="card p-6">
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Aucune donnée disponible pour cette période.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Information */}
      <div className="card p-6 bg-gray-50 dark:bg-gray-800">
        <h3 className="font-semibold mb-2">Informations techniques</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• <strong>Consommation annuelle :</strong> Données issues de l'endpoint <code>consumption/daily</code> (relevés quotidiens) sur 3 ans, max 365 jours par requête</li>
          <li>• <strong>Ratio HC/HP :</strong> Données issues de l'endpoint <code>consumption/detail</code> (relevés horaires) sur 2 ans, max 7 jours par requête</li>
          <li>• <strong>Consommation horaire :</strong> Données issues de l'endpoint <code>consumption/detail</code> (relevés horaires), max 7 jours par requête</li>
          <li>• <strong>Heures Creuses :</strong> Calculées sur la plage 22h-6h (à affiner selon votre contrat)</li>
          <li>• <strong>Heures Pleines :</strong> Calculées sur la plage 6h-22h</li>
          <li>• <strong>Cache :</strong> Toutes les données sont mises en cache pendant 7 jours pour optimiser les performances</li>
          <li>• <strong>Source :</strong> API Enedis Data Connect</li>
        </ul>
      </div>
    </div>
  )
}
