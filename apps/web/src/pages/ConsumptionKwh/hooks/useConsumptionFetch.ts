import { useCallback } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { adminApi } from '@/api/admin'
import { pdlApi } from '@/api/pdl'
import { logger } from '@/utils/logger'
import { toast } from '@/stores/notificationStore'
import type { PDL } from '@/types/api'
import type { DateRange, LoadingProgress } from '../types/consumption.types'

export interface UseConsumptionFetchParams {
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  setDateRange: (value: DateRange | null) => void
  setIsChartSectionExpanded: (value: boolean) => void
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
}

export function useConsumptionFetch({
  selectedPDL,
  selectedPDLDetails,
  setDateRange,
  setIsChartSectionExpanded,
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
}: UseConsumptionFetchParams) {
  const queryClient = useQueryClient()

  // Get the list of PDLs to find production PDL details
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: pdlApi.list,
  })
  const allPDLs: PDL[] = Array.isArray(pdlsResponse) ? pdlsResponse : []

  const fetchConsumptionData = useCallback(async () => {
    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Invalidate existing queries to force refetch
    queryClient.invalidateQueries({ queryKey: ['consumption', selectedPDL] })
    queryClient.invalidateQueries({ queryKey: ['maxPower', selectedPDL] })

    // Collapse all sections before fetching new data
    setIsChartSectionExpanded(false)
    setIsDetailSectionExpanded(false)
    setIsStatsSectionExpanded(false)
    setIsPowerSectionExpanded(false)
    setHcHpCalculationComplete(false)
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)

    // Calculate dates for consumption and power (3 years max - 1095 days)
    // Use yesterday as end date because Enedis data is only available in J-1
    // IMPORTANT: Use LOCAL time to determine "today" and "yesterday" (user's perspective)
    // The API expects YYYY-MM-DD format, so timezone doesn't matter for the date itself
    const now = new Date()

    // Get yesterday in LOCAL time (end date)
    // This ensures that at 0h30 local time, "yesterday" is still the previous calendar day
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12, 0, 0, 0  // Use noon to avoid any DST edge cases
    )

    // Start date: 1095 days before yesterday (Enedis API max limit for daily data - 3 years)
    let startDate_obj = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate() - 1095,
      12, 0, 0, 0
    )

    // Apply limits: never go before oldest_available_data_date or activation_date
    logger.log('PDL Details:', {
      selectedPDL,
      oldest_available_data_date: selectedPDLDetails?.oldest_available_data_date,
      activation_date: selectedPDLDetails?.activation_date,
      calculatedStartDate: startDate_obj.toISOString().split('T')[0]
    })

    // For now, don't apply oldest_available_data_date or activation_date limits
    // Let the API handle the error and we'll display it to the user
    // TODO: Implement proper retry logic with progressive date advancement
    logger.log(`Daily consumption: Requesting full 3 years (API will return error if too old)`)

    // Format dates as YYYY-MM-DD using LOCAL time (user's perspective)
    const startDate = startDate_obj.getFullYear() + '-' +
                      String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getDate()).padStart(2, '0')
    const endDate = yesterday.getFullYear() + '-' +
                    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
                    String(yesterday.getDate()).padStart(2, '0')

    logger.log(`Final date range for API: ${startDate} → ${endDate}`)

    // Setting dateRange will trigger React Query to fetch data
    setDateRange({ start: startDate, end: endDate })

    // Pre-fetch detailed data for 2 years (730 days) using the new batch endpoint
    // The backend handles all the chunking and caching logic
    if (selectedPDLDetails?.is_active && selectedPDLDetails?.has_consumption) {
      setIsLoadingDetailed(true)

      // Calculate 2 years back from TODAY (not yesterday) - 729 days
      // Start: today - 2 years, End: yesterday (J-1)
      // Use LOCAL time for user's perspective
      const todayLocal = new Date()
      const today = new Date(
        todayLocal.getFullYear(),
        todayLocal.getMonth(),
        todayLocal.getDate(),
        12, 0, 0, 0  // Use noon to avoid DST edge cases
      )

      const twoYearsAgo = new Date(
        today.getFullYear() - 2,
        today.getMonth(),
        today.getDate(),
        12, 0, 0, 0
      )

      const startDate = twoYearsAgo.getFullYear() + '-' +
                       String(twoYearsAgo.getMonth() + 1).padStart(2, '0') + '-' +
                       String(twoYearsAgo.getDate()).padStart(2, '0')

      const endDate = yesterday.getFullYear() + '-' +
                     String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
                     String(yesterday.getDate()).padStart(2, '0')

      logger.log(`Detailed data: Requesting 2 years via batch endpoint (${startDate} to ${endDate}) - 729 days`)

      try {
        // Single batch call to get all detailed data for 2 years
        setLoadingProgress({ current: 0, total: 1, currentRange: `${startDate} → ${endDate}` })

        const batchData = await enedisApi.getConsumptionDetailBatch(selectedPDL, {
          start: startDate,
          end: endDate,
          use_cache: true,
        })

        logger.log(`Batch response:`, {
          success: batchData?.success,
          hasError: !!batchData?.error,
          errorCode: batchData?.error?.code,
          dataPoints: (batchData as any)?.data?.meter_reading?.interval_reading?.length || 0
        })

        if (batchData?.success && (batchData as any)?.data?.meter_reading?.interval_reading) {
          const readings = (batchData as any).data.meter_reading.interval_reading

          // Deduplicate readings using a Map with timestamp as key
          const uniqueReadingsMap = new Map()
          readings.forEach((point: any) => {
            uniqueReadingsMap.set(point.date, point)
          })
          const uniqueReadings = Array.from(uniqueReadingsMap.values())

          // Store ALL detail data in a SINGLE cache key (not per day!)
          // This avoids creating 730+ cache entries that overload IndexedDB
          queryClient.setQueryData(['consumptionDetail', selectedPDL], {
            success: true,
            data: {
              meter_reading: {
                interval_reading: uniqueReadings
              }
            }
          })

          // Calculate day count for display
          const dates = new Set(uniqueReadings.map((p: any) => p.date.split(' ')[0].split('T')[0]))
          const dayCount = dates.size
          const years = Math.floor(dayCount / 365)
          const remainingDays = dayCount % 365
          const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
          const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
          const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

          toast.success(`Historique chargé avec succès (${periodText} de données, ${readings.length} points)`, {
            duration: 4000,
          })

          // Show cache persistence indicator
          const persistToast = toast.loading('💾 Mise en cache des données...', { duration: 2000 })
          setTimeout(() => {
            toast.dismiss(persistToast)
            setLoadingProgress({ current: 1, total: 1, currentRange: 'Terminé !' })

            // Expand all sections to show the data
            setIsChartSectionExpanded(true)
            setIsDetailSectionExpanded(true)
            setIsStatsSectionExpanded(true)
            setIsPowerSectionExpanded(true)
            setDailyLoadingComplete(true)
            setPowerLoadingComplete(true)
            setAllLoadingComplete(true)
          }, 1500)
        } else if (batchData?.error) {
          // Handle partial data or errors
          const errorMsg = batchData.error.message || 'Erreur lors du chargement des données détaillées'

          if (batchData.error.code === 'PARTIAL_DATA') {
            toast.warning(errorMsg, { duration: 4000 })
          } else {
            toast.error(errorMsg, { duration: 6000 })
          }
        }

        // Invalidate the detail query to force it to re-fetch from cache
        queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })

        // Trigger HC/HP calculation now that all data is loaded
        setHcHpCalculationTrigger(prev => prev + 1)
      } catch (error: any) {
        console.error('Error fetching detailed data via batch:', error)

        const errorMsg = error?.response?.data?.error?.message ||
                        error?.message ||
                        'Erreur lors du chargement des données détaillées'
        toast.error(errorMsg)
      } finally {
        setIsLoadingDetailed(false)
        // Don't reset loadingProgress here - keep the final state (1/1 for success)
      }
    }

    // If this consumption PDL is linked to a production PDL, fetch production data too
    if (selectedPDLDetails?.linked_production_pdl_id) {
      const productionPDL = allPDLs.find(p => p.id === selectedPDLDetails.linked_production_pdl_id)

      if (!productionPDL) {
        logger.log(`Production PDL not found in list: ${selectedPDLDetails.linked_production_pdl_id}`)
        return
      }

      const productionPdlUsagePointId = productionPDL.usage_point_id
      logger.log(`Linked production PDL detected: ${productionPdlUsagePointId}, fetching production data...`)

      try {
        // Invalidate production queries to force refetch
        queryClient.invalidateQueries({ queryKey: ['production', productionPdlUsagePointId] })

        // Fetch production daily data (3 years)
        // Use LOCAL time for user's perspective
        const nowLocal = new Date()
        const yesterdayLocal = new Date(
          nowLocal.getFullYear(),
          nowLocal.getMonth(),
          nowLocal.getDate() - 1,
          12, 0, 0, 0  // Use noon to avoid DST edge cases
        )

        const threeYearsAgo = new Date(
          yesterdayLocal.getFullYear(),
          yesterdayLocal.getMonth(),
          yesterdayLocal.getDate() - 1095,
          12, 0, 0, 0
        )

        const startDate3y = threeYearsAgo.getFullYear() + '-' +
                           String(threeYearsAgo.getMonth() + 1).padStart(2, '0') + '-' +
                           String(threeYearsAgo.getDate()).padStart(2, '0')
        const endDate = yesterdayLocal.getFullYear() + '-' +
                       String(yesterdayLocal.getMonth() + 1).padStart(2, '0') + '-' +
                       String(yesterdayLocal.getDate()).padStart(2, '0')

        logger.log(`Fetching production daily data: ${startDate3y} → ${endDate}`)

        // Note: We don't await these - they will be fetched and cached in background
        // The production page will use the cached data when the user navigates to it
        enedisApi.getProductionDaily(productionPdlUsagePointId, {
          start: startDate3y,
          end: endDate,
          use_cache: true,
        }).then(dailyData => {
          if (dailyData?.success) {
            queryClient.setQueryData(
              ['production', productionPdlUsagePointId, startDate3y, endDate],
              dailyData
            )
            logger.log('Production daily data cached successfully')
          }
        }).catch(err => {
          logger.log('Error fetching production daily data:', err)
        })

        // Fetch production detailed data (2 years) via batch endpoint
        // Use LOCAL time for user's perspective
        const todayLocal = new Date(
          nowLocal.getFullYear(),
          nowLocal.getMonth(),
          nowLocal.getDate(),
          12, 0, 0, 0
        )

        const twoYearsAgo = new Date(
          todayLocal.getFullYear() - 2,
          todayLocal.getMonth(),
          todayLocal.getDate(),
          12, 0, 0, 0
        )

        const startDate2y = twoYearsAgo.getFullYear() + '-' +
                           String(twoYearsAgo.getMonth() + 1).padStart(2, '0') + '-' +
                           String(twoYearsAgo.getDate()).padStart(2, '0')

        logger.log(`Fetching production detail batch: ${startDate2y} → ${endDate}`)

        enedisApi.getProductionDetailBatch(productionPdlUsagePointId, {
          start: startDate2y,
          end: endDate,
          use_cache: true,
        }).then(batchData => {
          if (batchData?.success && (batchData as any)?.data?.meter_reading?.interval_reading) {
            const readings = (batchData as any).data.meter_reading.interval_reading

            // Deduplicate readings using a Map with timestamp as key
            const uniqueReadingsMap = new Map()
            readings.forEach((point: any) => {
              uniqueReadingsMap.set(point.date, point)
            })
            const uniqueReadings = Array.from(uniqueReadingsMap.values())

            // Store ALL detail data in a SINGLE cache key (not per day!)
            // This avoids creating 730+ cache entries that overload IndexedDB
            queryClient.setQueryData(['productionDetail', productionPdlUsagePointId], {
              success: true,
              data: {
                meter_reading: {
                  interval_reading: uniqueReadings
                }
              }
            })

            const dates = new Set(uniqueReadings.map((p: any) => p.date.split(' ')[0].split('T')[0]))
            logger.log(`Production detail data cached successfully: ${dates.size} days, ${uniqueReadings.length} points`)

            // Invalidate the detail query to make it available
            queryClient.invalidateQueries({ queryKey: ['productionDetail'] })
          }
        }).catch(err => {
          logger.log('Error fetching production detail batch:', err)
        })

        logger.log('Production data fetch initiated in background')
      } catch (error: any) {
        logger.log('Error initiating production data fetch:', error)
        // Don't show error to user - this is a background operation
      }
    }
  }, [
    selectedPDL,
    selectedPDLDetails,
    allPDLs,
    setDateRange,
    setIsChartSectionExpanded,
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
    queryClient
  ])

  const clearCache = useCallback(async () => {
    try {
      // Clear server-side cache for all consumption data FIRST
      await adminApi.clearAllConsumptionCache()

      // Clear React Query cache
      queryClient.clear()

      // Clear React Query persister to prevent cache restoration on reload
      localStorage.removeItem('myelectricaldata-query-cache')

      // Clear IndexedDB if it exists
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases()
        for (const db of databases) {
          if (db.name) {
            await indexedDB.deleteDatabase(db.name)
          }
        }
      }

      toast.success('Cache vidé avec succès')

      // Reload the page to start fresh
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: any) {
      toast.error(`Erreur lors de la suppression du cache: ${error.message}`)
    }
  }, [queryClient])

  return {
    fetchConsumptionData,
    clearCache
  }
}