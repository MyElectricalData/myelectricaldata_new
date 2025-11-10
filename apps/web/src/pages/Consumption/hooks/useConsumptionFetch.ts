import { useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { adminApi } from '@/api/admin'
import toast from 'react-hot-toast'
import type { PDL } from '@/types/api'
import type { DateRange, LoadingProgress } from '../types/consumption.types'

interface UseConsumptionFetchParams {
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  setDateRange: (value: DateRange | null) => void
  setIsChartsExpanded: (value: boolean) => void
  setIsDetailSectionExpanded: (value: boolean) => void
  setIsStatsSectionExpanded: (value: boolean) => void
  setIsPowerSectionExpanded: (value: boolean) => void
  setHcHpCalculationComplete: (value: boolean) => void
  setDailyLoadingComplete: (value: boolean) => void
  setPowerLoadingComplete: (value: boolean) => void
  setAllLoadingComplete: (value: boolean) => void
  setIsLoadingDetailed: (value: boolean) => void
  setLoadingProgress: (value: LoadingProgress) => void
  setHcHpCalculationTrigger: (updater: (prev: number) => number) => void
  setIsClearingCache: (value: boolean) => void
}

export function useConsumptionFetch({
  selectedPDL,
  selectedPDLDetails,
  setDateRange,
  setIsChartsExpanded,
  setIsDetailSectionExpanded,
  setIsStatsSectionExpanded,
  setIsPowerSectionExpanded,
  setHcHpCalculationComplete,
  setDailyLoadingComplete,
  setPowerLoadingComplete,
  setAllLoadingComplete,
  setIsLoadingDetailed,
  setLoadingProgress,
  setHcHpCalculationTrigger,
  setIsClearingCache,
}: UseConsumptionFetchParams) {
  const queryClient = useQueryClient()

  const fetchConsumptionData = async () => {
    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Collapse all sections before fetching new data
    setIsChartsExpanded(false)
    setIsDetailSectionExpanded(false)
    setIsStatsSectionExpanded(false)
    setIsPowerSectionExpanded(false)
    setHcHpCalculationComplete(false)
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)

    // Calculate dates for consumption and power (3 years max - 1095 days)
    // Use yesterday as end date because Enedis data is only available in J-1
    // IMPORTANT: Use UTC dates as Enedis API expects RFC 3339 format (UTC)
    const todayUTC = new Date()

    // Get yesterday in UTC (end date) - normalized to midnight UTC
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterday = yesterdayUTC

    // Start date: 1095 days before yesterday (Enedis API max limit for daily data)
    let startDate_obj = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - 1095,
      0, 0, 0, 0
    ))

    // Apply limits: never go before oldest_available_data_date or activation_date
    console.log('PDL Details:', {
      selectedPDL,
      oldest_available_data_date: selectedPDLDetails?.oldest_available_data_date,
      activation_date: selectedPDLDetails?.activation_date,
      calculatedStartDate: startDate_obj.toISOString().split('T')[0]
    })

    // For now, don't apply oldest_available_data_date or activation_date limits
    // Let the API handle the error and we'll display it to the user
    // TODO: Implement proper retry logic with progressive date advancement
    console.log(`Daily consumption: Requesting full 3 years (API will return error if too old)`)

    // Format dates as YYYY-MM-DD in UTC
    const startDate = startDate_obj.getUTCFullYear() + '-' +
                      String(startDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getUTCDate()).padStart(2, '0')
    const endDate = yesterday.getUTCFullYear() + '-' +
                    String(yesterday.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(yesterday.getUTCDate()).padStart(2, '0')

    console.log(`Final date range for API: ${startDate} → ${endDate}`)

    // Setting dateRange will trigger React Query to fetch data
    setDateRange({ start: startDate, end: endDate })

    // Pre-fetch detailed data for 2 years (730 days, fetched weekly and cached daily)
    // Limitation: Only data from J-1 and up to 2 years back (same as "Courbe de charge détaillée")
    if (selectedPDLDetails?.is_active && selectedPDLDetails?.has_consumption) {
      setIsLoadingDetailed(true)

      // Calculate 2 years back from yesterday in UTC (730 days max)
      let twoYearsAgo = new Date(Date.UTC(
        yesterday.getUTCFullYear() - 2,
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        0, 0, 0, 0
      ))

      // For now, don't apply date limits - let the retry logic handle it
      console.log(`Detailed data: Requesting full 2 years (retry logic will adjust if needed)`)

      // Calculate number of weeks in 2 years (approximately 104 weeks)
      const totalWeeks = Math.ceil(730 / 7)

      // Check which days are already in cache
      const allDates = []
      const currentDate = new Date(twoYearsAgo)
      while (currentDate <= yesterday) {
        const dateStr = currentDate.getUTCFullYear() + '-' +
                       String(currentDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                       String(currentDate.getUTCDate()).padStart(2, '0')
        allDates.push(dateStr)
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }

      // Check cache for each day
      const missingDates: string[] = []
      for (const dateStr of allDates) {
        const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPDL, dateStr, dateStr]) as any
        const hasCompleteData = cachedData?.data?.meter_reading?.interval_reading?.length >= 40 // At least 40 points for a complete day
        if (!hasCompleteData) {
          missingDates.push(dateStr)
        }
      }

      console.log(`Cache check: ${allDates.length - missingDates.length}/${allDates.length} days cached, ${missingDates.length} missing`)

      if (missingDates.length === 0) {
        console.log('All data already in cache!')
        const totalDays = allDates.length
        const years = Math.floor(totalDays / 365)
        const remainingDays = totalDays % 365
        const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
        const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
        const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

        const message = `Historique complet déjà en cache (${periodText} de données)`
        toast.success(message, {
          duration: 3000,
        })
        setIsLoadingDetailed(false)
        // Invalidate to refresh the display
        queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })
        return
      }

      // Group missing dates into weeks to fetch
      const weeksToFetch = []

      // Convert missing dates to week ranges
      for (let weekOffset = 0; weekOffset < totalWeeks; weekOffset++) {
        // Calculate offset in days
        const offsetDays = weekOffset * 7

        // End date: yesterday minus offset weeks (never today or future) in UTC
        let weekEndDate = new Date(Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate() - offsetDays,
          0, 0, 0, 0
        ))

        // Cap the end date to yesterday if it goes into the future (safety check)
        if (weekEndDate > yesterday) {
          weekEndDate = new Date(yesterday)
        }

        // Start date: 6 days before end date (7 days total) in UTC
        const weekStartDate = new Date(Date.UTC(
          weekEndDate.getUTCFullYear(),
          weekEndDate.getUTCMonth(),
          weekEndDate.getUTCDate() - 6,
          0, 0, 0, 0
        ))

        // Only fetch if:
        // 1. Week end date is not in the future (max = yesterday)
        // 2. Week start date is within the 2-year range (>= 2 years ago from yesterday)
        // 3. At least one day in this week is missing from cache
        if (weekEndDate <= yesterday && weekStartDate >= twoYearsAgo) {
          const weekStart = weekStartDate.getUTCFullYear() + '-' +
                           String(weekStartDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                           String(weekStartDate.getUTCDate()).padStart(2, '0')
          const weekEnd = weekEndDate.getUTCFullYear() + '-' +
                         String(weekEndDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                         String(weekEndDate.getUTCDate()).padStart(2, '0')

          // Check if any day in this week is missing
          const weekDates = []
          const tempDate = new Date(weekStartDate)
          while (tempDate <= weekEndDate) {
            const tempDateStr = tempDate.getUTCFullYear() + '-' +
                               String(tempDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                               String(tempDate.getUTCDate()).padStart(2, '0')
            weekDates.push(tempDateStr)
            tempDate.setUTCDate(tempDate.getUTCDate() + 1)
          }

          // Only add this week if at least one day is missing
          if (weekDates.some(d => missingDates.includes(d))) {
            weeksToFetch.push({ weekStart, weekEnd })
          }
        }
      }

      console.log(`Need to fetch ${weeksToFetch.length} weeks (out of ${totalWeeks} total)`)

      // Fetch weeks sequentially to show progress
      setLoadingProgress({ current: 0, total: weeksToFetch.length, currentRange: 'Démarrage...' })

      try {
        for (let i = 0; i < weeksToFetch.length; i++) {
          const { weekStart, weekEnd } = weeksToFetch[i]

          setLoadingProgress({
            current: i + 1,
            total: weeksToFetch.length,
            currentRange: `${weekStart} → ${weekEnd}`
          })

          // Fetch the weekly data from API with retry mechanism for ADAM-ERR0123
          let weeklyData = null
          let currentStartDate = new Date(weekStart + 'T00:00:00Z')
          const endDateObj = new Date(weekEnd + 'T00:00:00Z')
          let retryCount = 0
          const maxRetries = 7 // Max 7 days to try forward from start

          while (currentStartDate <= endDateObj && retryCount < maxRetries) {
            const currentStartStr = currentStartDate.getUTCFullYear() + '-' +
                                   String(currentStartDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                                   String(currentStartDate.getUTCDate()).padStart(2, '0')

            // IMPORTANT: Add 1 day to get the 23:30 reading of the last day
            // (Enedis returns 23:30 reading with next day's 00:00 timestamp)
            const fetchEndDate = new Date(endDateObj)
            fetchEndDate.setUTCDate(fetchEndDate.getUTCDate() + 1)
            const fetchEndStr = fetchEndDate.getUTCFullYear() + '-' +
                               String(fetchEndDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                               String(fetchEndDate.getUTCDate()).padStart(2, '0')

            try {
              weeklyData = await enedisApi.getConsumptionDetail(selectedPDL, {
                start: currentStartStr,
                end: fetchEndStr,
                use_cache: true,
              })

              console.log(`Response for ${currentStartStr} → ${fetchEndStr}:`, {
                success: weeklyData?.success,
                hasError: !!weeklyData?.error,
                errorCode: weeklyData?.error?.code,
                hasData: !!weeklyData?.data
              })

              // Check for ADAM-ERR0123 error
              if (weeklyData?.success === false && weeklyData?.error?.code === 'ADAM-ERR0123') {
                console.log(`Enedis: Data not available for ${currentStartStr} → ${fetchEndStr}, trying later start date...`)

                // Try one day later (advance start date)
                currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1)
                retryCount++

                // If we've tried all days in the week without success, stop completely
                if (retryCount >= maxRetries || currentStartDate > endDateObj) {
                  console.log(`No data available for this week after ${retryCount} retries - this is expected if before activation date`)

                  // No error toast - this is normal behavior when requesting data before activation
                  // Just log it and continue to the next week or stop gracefully

                  // Invalidate queries to show what we have so far
                  queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })

                  // Stop fetching older data (we've reached the limit)
                  setLoadingProgress({ current: i, total: weeksToFetch.length, currentRange: 'Arrêté - Date limite atteinte' })
                  setIsLoadingDetailed(false)
                  setLoadingProgress({ current: 0, total: 0, currentRange: '' })
                  return
                }

                continue // Try again with earlier date
              }

              // Success! Break out of retry loop
              break

            } catch (error) {
              console.error(`Error fetching ${weekStart} → ${fetchEndStr}:`, error)
              throw error // Re-throw to be caught by outer catch
            }
          }

          // Split the weekly data and cache it day by day
          const weeklyDataTyped = weeklyData as any
          if (weeklyDataTyped?.data?.meter_reading?.interval_reading) {
            // Group data points by date
            const dataByDate: Record<string, any[]> = {}

            weeklyDataTyped.data.meter_reading.interval_reading.forEach((point: any) => {
              // Extract YYYY-MM-DD from date (format: "2025-10-14 00:00:00" or "2025-10-14T00:00:00")
              let date = point.date.split(' ')[0].split('T')[0]

              // IMPORTANT: Enedis convention - timestamps at 00:00 represent the 23:30 reading
              // of the PREVIOUS day. We need to adjust the date accordingly.
              const time = point.date.split(' ')[1] || point.date.split('T')[1] || '00:00:00'
              if (time.startsWith('00:00')) {
                // Shift date back by 1 day for 00:00 timestamps
                const dateObj = new Date(date + 'T00:00:00Z')
                dateObj.setUTCDate(dateObj.getUTCDate() - 1)
                date = dateObj.getUTCFullYear() + '-' +
                       String(dateObj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                       String(dateObj.getUTCDate()).padStart(2, '0')
              }

              if (!dataByDate[date]) {
                dataByDate[date] = []
              }
              dataByDate[date].push(point)
            })

            // Cache each day separately
            Object.entries(dataByDate).forEach(([date, points]) => {
              queryClient.setQueryData(
                ['consumptionDetail', selectedPDL, date, date],
                {
                  success: true,
                  data: {
                    meter_reading: {
                      interval_reading: points
                    }
                  }
                }
              )
            })
          }

          // Add a small delay to ensure loading screen is visible even for cached data
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        setLoadingProgress({ current: weeksToFetch.length, total: weeksToFetch.length, currentRange: 'Terminé !' })
        // Add a small delay before showing success message to let user see 100% progress
        await new Promise(resolve => setTimeout(resolve, 300))

        if (weeksToFetch.length > 0) {
          toast.success(`${weeksToFetch.length} semaine${weeksToFetch.length > 1 ? 's' : ''} de nouvelles données chargées avec succès !`)
        }

        // Invalidate the detail query to force it to re-fetch from cache
        queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })

        // Trigger HC/HP calculation now that all data is loaded
        setHcHpCalculationTrigger(prev => prev + 1)
      } catch (error: any) {
        console.error('Error pre-fetching detailed data:', error)

        // Check if it's an ADAM-ERR0123 error from the API
        if (error?.response?.data?.error?.code === 'ADAM-ERR0123' ||
            error?.error?.code === 'ADAM-ERR0123') {
          const errorMessage = error?.response?.data?.error?.message ||
                              error?.error?.message ||
                              "La période demandée est antérieure à la date d'activation du compteur"
          toast.error(errorMessage, { duration: 6000, icon: '⚠️' })
        } else {
          // Generic error message
          const errorMsg = error?.response?.data?.error?.message ||
                          error?.message ||
                          'Erreur lors du pré-chargement des données détaillées'
          toast.error(errorMsg)
        }
      } finally {
        setIsLoadingDetailed(false)
        setLoadingProgress({ current: 0, total: 0, currentRange: '' })
      }
    }
  }

  const clearCache = async () => {
    setIsClearingCache(true)
    try {
      // Clear browser cache
      queryClient.clear()
      localStorage.clear()
      sessionStorage.clear()

      // Clear IndexedDB if it exists
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name) {
            await indexedDB.deleteDatabase(db.name)
          }
        }
      }

      // Clear server-side cache for all consumption data
      await adminApi.clearAllConsumptionCache()

      toast.success('Cache vidé avec succès')

      // Reload the page to start fresh
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: any) {
      toast.error(`Erreur lors de la suppression du cache: ${error.message}`)
    } finally {
      setIsClearingCache(false)
    }
  }

  return {
    fetchConsumptionData,
    clearCache
  }
}