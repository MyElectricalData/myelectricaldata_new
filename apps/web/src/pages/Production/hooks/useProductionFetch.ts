import { useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { adminApi } from '@/api/admin'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { PDL } from '@/types/api'
import type { DateRange, LoadingProgress } from '../types/production.types'

interface UseProductionFetchParams {
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  setDateRange: (value: DateRange | null) => void
  setIsChartsExpanded: (value: boolean) => void
  setIsDetailSectionExpanded: (value: boolean) => void
  setIsStatsSectionExpanded: (value: boolean) => void
  setDailyLoadingComplete: (value: boolean) => void
  setAllLoadingComplete: (value: boolean) => void
  setIsLoadingDetailed: (value: boolean) => void
  setLoadingProgress: (value: LoadingProgress) => void
  setIsClearingCache: (value: boolean) => void
}

export function useProductionFetch({
  selectedPDL,
  selectedPDLDetails,
  setDateRange,
  setIsChartsExpanded,
  setIsDetailSectionExpanded,
  setIsStatsSectionExpanded,
  setDailyLoadingComplete,
  setAllLoadingComplete,
  setIsLoadingDetailed,
  setLoadingProgress,
  setIsClearingCache,
}: UseProductionFetchParams) {
  const queryClient = useQueryClient()

  const fetchProductionData = async () => {
    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Collapse all sections before fetching new data
    setIsChartsExpanded(false)
    setIsDetailSectionExpanded(false)
    setIsStatsSectionExpanded(false)
    setDailyLoadingComplete(false)
    setAllLoadingComplete(false)

    // Calculate dates for production and power (3 years max - 1095 days)
    const todayUTC = new Date()

    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterday = yesterdayUTC

    // Start date: 1095 days before yesterday (3 years)
    let startDate_obj = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - 1095,
      0, 0, 0, 0
    ))

    logger.log('PDL Details:', {
      selectedPDL,
      oldest_available_data_date: selectedPDLDetails?.oldest_available_data_date,
      activation_date: selectedPDLDetails?.activation_date,
      calculatedStartDate: startDate_obj.toISOString().split('T')[0]
    })

    logger.log(`Daily production: Requesting full 3 years (API will return error if too old)`)

    // Format dates as YYYY-MM-DD in UTC
    const startDate = startDate_obj.getUTCFullYear() + '-' +
                      String(startDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getUTCDate()).padStart(2, '0')
    const endDate = yesterday.getUTCFullYear() + '-' +
                    String(yesterday.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(yesterday.getUTCDate()).padStart(2, '0')

    logger.log(`Final date range for API: ${startDate} → ${endDate}`)

    // Setting dateRange will trigger React Query to fetch data
    setDateRange({ start: startDate, end: endDate })

    // Pre-fetch detailed data for 2 years (730 days)
    if (selectedPDLDetails?.is_active && selectedPDLDetails?.has_production) {
      setIsLoadingDetailed(true)

      // Calculate 2 years back from yesterday in UTC (730 days max)
      let twoYearsAgo = new Date(Date.UTC(
        yesterday.getUTCFullYear() - 2,
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        0, 0, 0, 0
      ))

      logger.log(`Detailed data: Requesting full 2 years (retry logic will adjust if needed)`)

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
        const cachedData = queryClient.getQueryData(['productionDetail', selectedPDL, dateStr, dateStr]) as any
        const hasCompleteData = cachedData?.data?.meter_reading?.interval_reading?.length >= 40
        if (!hasCompleteData) {
          missingDates.push(dateStr)
        }
      }

      logger.log(`Cache check: ${allDates.length - missingDates.length}/${allDates.length} days cached, ${missingDates.length} missing`)

      if (missingDates.length === 0) {
        logger.log('All data already in cache!')
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
        queryClient.invalidateQueries({ queryKey: ['productionDetail'] })
        return
      }

      // Group missing dates into weeks to fetch
      const weeksToFetch = []

      for (let weekOffset = 0; weekOffset < totalWeeks; weekOffset++) {
        const offsetDays = weekOffset * 7

        let weekEndDate = new Date(Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate() - offsetDays,
          0, 0, 0, 0
        ))

        if (weekEndDate > yesterday) {
          weekEndDate = new Date(yesterday)
        }

        const weekStartDate = new Date(Date.UTC(
          weekEndDate.getUTCFullYear(),
          weekEndDate.getUTCMonth(),
          weekEndDate.getUTCDate() - 6,
          0, 0, 0, 0
        ))

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

          if (weekDates.some(d => missingDates.includes(d))) {
            weeksToFetch.push({ weekStart, weekEnd })
          }
        }
      }

      logger.log(`Need to fetch ${weeksToFetch.length} weeks (out of ${totalWeeks} total)`)

      setLoadingProgress({ current: 0, total: weeksToFetch.length, currentRange: 'Démarrage...' })

      try {
        for (let i = 0; i < weeksToFetch.length; i++) {
          const { weekStart, weekEnd } = weeksToFetch[i]

          setLoadingProgress({
            current: i + 1,
            total: weeksToFetch.length,
            currentRange: `${weekStart} → ${weekEnd}`
          })

          let weeklyData = null
          let currentStartDate = new Date(weekStart + 'T00:00:00Z')
          const endDateObj = new Date(weekEnd + 'T00:00:00Z')
          let retryCount = 0
          const maxRetries = 7

          while (currentStartDate <= endDateObj && retryCount < maxRetries) {
            const currentStartStr = currentStartDate.getUTCFullYear() + '-' +
                                   String(currentStartDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                                   String(currentStartDate.getUTCDate()).padStart(2, '0')

            const fetchEndDate = new Date(endDateObj)
            fetchEndDate.setUTCDate(fetchEndDate.getUTCDate() + 1)
            const fetchEndStr = fetchEndDate.getUTCFullYear() + '-' +
                               String(fetchEndDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                               String(fetchEndDate.getUTCDate()).padStart(2, '0')

            try {
              weeklyData = await enedisApi.getProductionDetail(selectedPDL, {
                start: currentStartStr,
                end: fetchEndStr,
                use_cache: true,
              })

              logger.log(`Response for ${currentStartStr} → ${fetchEndStr}:`, {
                success: weeklyData?.success,
                hasError: !!weeklyData?.error,
                errorCode: weeklyData?.error?.code,
                hasData: !!weeklyData?.data
              })

              // Check for ADAM-ERR0123 error
              if (weeklyData?.success === false && weeklyData?.error?.code === 'ADAM-ERR0123') {
                logger.log(`Enedis: Data not available for ${currentStartStr} → ${fetchEndStr}, trying later start date...`)

                currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1)
                retryCount++

                if (retryCount >= maxRetries || currentStartDate > endDateObj) {
                  logger.log(`No data available for this week after ${retryCount} retries`)
                  queryClient.invalidateQueries({ queryKey: ['productionDetail'] })
                  setLoadingProgress({ current: i, total: weeksToFetch.length, currentRange: 'Arrêté - Date limite atteinte' })
                  setIsLoadingDetailed(false)
                  setLoadingProgress({ current: 0, total: 0, currentRange: '' })
                  return
                }

                continue
              }

              break

            } catch (error) {
              console.error(`Error fetching ${weekStart} → ${fetchEndStr}:`, error)
              throw error
            }
          }

          // Split the weekly data and cache it day by day
          const weeklyDataTyped = weeklyData as any
          if (weeklyDataTyped?.data?.meter_reading?.interval_reading) {
            const dataByDate: Record<string, any[]> = {}

            weeklyDataTyped.data.meter_reading.interval_reading.forEach((point: any) => {
              let date = point.date.split(' ')[0].split('T')[0]

              const time = point.date.split(' ')[1] || point.date.split('T')[1] || '00:00:00'
              if (time.startsWith('00:00')) {
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
                ['productionDetail', selectedPDL, date, date],
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

          await new Promise(resolve => setTimeout(resolve, 50))
        }

        setLoadingProgress({ current: weeksToFetch.length, total: weeksToFetch.length, currentRange: 'Terminé !' })
        await new Promise(resolve => setTimeout(resolve, 300))

        if (weeksToFetch.length > 0) {
          toast.success(`${weeksToFetch.length} semaine${weeksToFetch.length > 1 ? 's' : ''} de nouvelles données chargées avec succès !`)
        }

        queryClient.invalidateQueries({ queryKey: ['productionDetail'] })

      } catch (error: any) {
        console.error('Error pre-fetching detailed data:', error)

        if (error?.response?.data?.error?.code === 'ADAM-ERR0123' ||
            error?.error?.code === 'ADAM-ERR0123') {
          const errorMessage = error?.response?.data?.error?.message ||
                              error?.error?.message ||
                              "La période demandée est antérieure à la date d'activation du compteur"
          toast.error(errorMessage, { duration: 6000, icon: '⚠️' })
        } else {
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
      // Clear backend production cache (Redis) FIRST
      await adminApi.clearAllProductionCache()

      // Clear ALL React Query cache (includes production, productionDetail, and pdls)
      queryClient.clear()

      // IMPORTANT: Remove React Query persister key to prevent cache restoration on reload
      localStorage.removeItem('myelectricaldata-query-cache')

      // Clear localStorage and sessionStorage
      localStorage.clear()
      sessionStorage.clear()

      // Clear IndexedDB
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name) {
            await indexedDB.deleteDatabase(db.name)
          }
        }
      }

      toast.success('Cache de production vidé avec succès')

      // Reload immediately - cache should be completely empty now
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
    fetchProductionData,
    clearCache
  }
}
