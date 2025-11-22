import { useCallback } from 'react'
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

  const fetchProductionData = useCallback(async () => {
    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Invalidate existing queries to force refetch
    queryClient.invalidateQueries({ queryKey: ['production', selectedPDL] })

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

    // Pre-fetch detailed data for 2 years (730 days) using the new batch endpoint
    // The backend handles all the chunking and caching logic
    if (selectedPDLDetails?.is_active && selectedPDLDetails?.has_production) {
      setIsLoadingDetailed(true)

      // Calculate 2 years back from TODAY (not yesterday) - 729 days
      // Start: today - 2 years, End: yesterday (J-1)
      const todayUTC = new Date()
      const today = new Date(Date.UTC(
        todayUTC.getUTCFullYear(),
        todayUTC.getUTCMonth(),
        todayUTC.getUTCDate(),
        0, 0, 0, 0
      ))

      const twoYearsAgo = new Date(Date.UTC(
        today.getUTCFullYear() - 2,
        today.getUTCMonth(),
        today.getUTCDate(),
        0, 0, 0, 0
      ))

      const startDate = twoYearsAgo.getUTCFullYear() + '-' +
                       String(twoYearsAgo.getUTCMonth() + 1).padStart(2, '0') + '-' +
                       String(twoYearsAgo.getUTCDate()).padStart(2, '0')

      const endDate = yesterday.getUTCFullYear() + '-' +
                     String(yesterday.getUTCMonth() + 1).padStart(2, '0') + '-' +
                     String(yesterday.getUTCDate()).padStart(2, '0')

      logger.log(`Detailed data: Requesting 2 years via batch endpoint (${startDate} to ${endDate}) - 729 days`)

      try {
        // Single batch call to get all detailed data for 2 years
        setLoadingProgress({ current: 0, total: 1, currentRange: `${startDate} → ${endDate}` })

        const batchData = await enedisApi.getProductionDetailBatch(selectedPDL, {
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

          // Group data points by date for caching
          const dataByDate: Record<string, any[]> = {}

          readings.forEach((point: any) => {
            // Extract YYYY-MM-DD from date
            let date = point.date.split(' ')[0].split('T')[0]

            // Handle Enedis convention for 00:00 timestamps
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

          const dayCount = Object.keys(dataByDate).length
          const years = Math.floor(dayCount / 365)
          const remainingDays = dayCount % 365
          const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
          const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
          const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

          toast.success(`Historique de production chargé avec succès (${periodText} de données, ${readings.length} points)`, {
            duration: 4000,
          })

          setLoadingProgress({ current: 1, total: 1, currentRange: 'Terminé !' })
        } else if (batchData?.error) {
          // Handle partial data or errors
          const errorMsg = batchData.error.message || 'Erreur lors du chargement des données de production'

          if (batchData.error.code === 'PARTIAL_DATA') {
            toast.success(errorMsg, { duration: 4000, icon: '⚠️' })
          } else {
            toast.error(errorMsg, { duration: 6000 })
          }
        }

        // Invalidate the detail query to force it to re-fetch from cache
        queryClient.invalidateQueries({ queryKey: ['productionDetail'] })

      } catch (error: any) {
        console.error('Error fetching production data via batch:', error)

        const errorMsg = error?.response?.data?.error?.message ||
                        error?.message ||
                        'Erreur lors du chargement des données de production'
        toast.error(errorMsg)
      } finally {
        setIsLoadingDetailed(false)
        // Don't reset loadingProgress here - keep the final state (1/1 for success)
      }
    }
  }, [
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
    queryClient
  ])

  const clearCache = useCallback(async () => {
    setIsClearingCache(true)
    try {
      // Clear backend production cache (Redis) FIRST
      await adminApi.clearAllProductionCache()

      // Clear React Query cache
      queryClient.clear()

      // Clear React Query persister to prevent cache restoration on reload
      localStorage.removeItem('myelectricaldata-query-cache')

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
  }, [setIsClearingCache, queryClient])

  return {
    fetchProductionData,
    clearCache
  }
}
