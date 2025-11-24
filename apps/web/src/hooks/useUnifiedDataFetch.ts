import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { PDL } from '@/types/api'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useCacheBroadcast } from './useCacheBroadcast'

interface UseUnifiedDataFetchParams {
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  allPDLs: PDL[]
}

export function useUnifiedDataFetch({
  selectedPDL,
  selectedPDLDetails,
  allPDLs,
}: UseUnifiedDataFetchParams) {
  const queryClient = useQueryClient()
  const { updateConsumptionStatus, updateProductionStatus, resetLoadingStatus } = useDataFetchStore()
  const { broadcast } = useCacheBroadcast()

  const fetchAllData = useCallback(async () => {
    if (!selectedPDL || !selectedPDLDetails) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Reset all statuses
    resetLoadingStatus()

    // Calculate dates
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const today = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate(),
      0, 0, 0, 0
    ))

    const threeYearsAgo = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - 1095,
      0, 0, 0, 0
    ))

    const twoYearsAgo = new Date(Date.UTC(
      today.getUTCFullYear() - 2,
      today.getUTCMonth(),
      today.getUTCDate(),
      0, 0, 0, 0
    ))

    const formatDate = (date: Date) => {
      return date.getUTCFullYear() + '-' +
             String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
             String(date.getUTCDate()).padStart(2, '0')
    }

    const endDate = formatDate(yesterdayUTC)
    const startDate3y = formatDate(threeYearsAgo)
    const startDate2y = formatDate(twoYearsAgo)

    logger.log('Starting unified data fetch:', {
      pdl: selectedPDL,
      hasConsumption: selectedPDLDetails.has_consumption,
      hasProduction: selectedPDLDetails.has_production,
      linkedProductionPdl: selectedPDLDetails.linked_production_pdl_id,
    })

    // Prepare all fetch promises to run in parallel
    const fetchPromises: Promise<void>[] = []

    // === CONSUMPTION DATA ===
    if (selectedPDLDetails.has_consumption) {
      // Invalidate existing consumption queries
      queryClient.invalidateQueries({ queryKey: ['consumptionDaily', selectedPDL] })
      queryClient.invalidateQueries({ queryKey: ['maxPower', selectedPDL] })

      // Fetch consumption daily data (3 years)
      updateConsumptionStatus({ daily: 'loading' })
      fetchPromises.push(
        (async () => {
          try {
            logger.log(`Fetching consumption daily: ${startDate3y} → ${endDate}`)
            const dailyData = await enedisApi.getConsumptionDaily(selectedPDL, {
              start: startDate3y,
              end: endDate,
              use_cache: true,
            })

            if (dailyData?.success) {
              queryClient.setQueryData(['consumptionDaily', selectedPDL], dailyData)
              updateConsumptionStatus({ daily: 'success' })
              logger.log('Consumption daily data fetched successfully')
            } else {
              updateConsumptionStatus({ daily: 'error' })
            }
          } catch (error: any) {
            logger.log('Error fetching consumption daily:', error)
            updateConsumptionStatus({ daily: 'error' })
            toast.error(`Erreur données quotidiennes de consommation: ${error?.response?.data?.error?.message || error.message}`)
          }
        })()
      )

      // Fetch max power data (3 years)
      updateConsumptionStatus({ powerMax: 'loading' })
      fetchPromises.push(
        (async () => {
          try {
            logger.log(`Fetching max power: ${startDate3y} → ${endDate}`)
            const powerData = await enedisApi.getMaxPower(selectedPDL, {
              start: startDate3y,
              end: endDate,
              use_cache: true,
            })

            if (powerData?.success) {
              queryClient.setQueryData(['maxPower', selectedPDL], powerData)
              updateConsumptionStatus({ powerMax: 'success' })
              logger.log('Max power data fetched successfully')
            } else {
              updateConsumptionStatus({ powerMax: 'error' })
            }
          } catch (error: any) {
            logger.log('Error fetching max power:', error)
            updateConsumptionStatus({ powerMax: 'error' })
            // Don't show error for power max - it's optional
          }
        })()
      )

      // Fetch consumption detail batch (2 years)
      updateConsumptionStatus({ detail: 'loading', detailProgress: { current: 0, total: 1 } })
      fetchPromises.push(
        (async () => {
          try {
            logger.log(`Fetching consumption detail batch: ${startDate2y} → ${endDate}`)
            const batchData = await enedisApi.getConsumptionDetailBatch(selectedPDL, {
              start: startDate2y,
              end: endDate,
              use_cache: true,
            })

            if (batchData?.success && (batchData as any)?.data?.meter_reading?.interval_reading) {
              const readings = (batchData as any).data.meter_reading.interval_reading

              // Deduplicate readings using a Map with timestamp as key
              const uniqueReadingsMap = new Map()
              readings.forEach((point: any) => {
                uniqueReadingsMap.set(point.date, point)
              })
              const uniqueReadings = Array.from(uniqueReadingsMap.values())

              // Store all detail data in a single cache key
              queryClient.setQueryData(['consumptionDetail', selectedPDL], {
                success: true,
                data: {
                  meter_reading: {
                    interval_reading: uniqueReadings
                  }
                }
              })

              // Calculate period statistics for toast
              const dates = new Set(uniqueReadings.map((p: any) => p.date.split(' ')[0].split('T')[0]))
              const dayCount = dates.size
              const years = Math.floor(dayCount / 365)
              const remainingDays = dayCount % 365
              const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
              const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
              const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

              updateConsumptionStatus({
                detail: 'success',
                detailProgress: { current: 1, total: 1 }
              })

              toast.success(`Consommation détaillée: ${periodText}, ${uniqueReadings.length} points`, { duration: 4000 })
            } else if (batchData?.error) {
              updateConsumptionStatus({ detail: 'error' })
              if (batchData.error.code === 'PARTIAL_DATA') {
                toast.success(batchData.error.message, { duration: 4000, icon: '⚠️' })
              } else {
                toast.error(batchData.error.message || 'Erreur données détaillées de consommation')
              }
            }
          } catch (error: any) {
            logger.log('Error fetching consumption detail batch:', error)
            updateConsumptionStatus({ detail: 'error' })
            toast.error(`Erreur données détaillées de consommation: ${error?.response?.data?.error?.message || error.message}`)
          }
        })()
      )
    }

    // === PRODUCTION DATA ===
    // Check if this PDL has production OR is linked to a production PDL
    let productionPdlUsagePointId: string | null = null

    if (selectedPDLDetails.has_production) {
      productionPdlUsagePointId = selectedPDL
    } else if (selectedPDLDetails.linked_production_pdl_id) {
      // Find the production PDL in the list to get its usage_point_id
      const productionPDL = allPDLs.find(p => p.id === selectedPDLDetails.linked_production_pdl_id)
      if (productionPDL) {
        productionPdlUsagePointId = productionPDL.usage_point_id
      }
    }

    if (productionPdlUsagePointId) {
      logger.log(`Fetching production data for PDL: ${productionPdlUsagePointId}`)

      // Invalidate existing production queries
      queryClient.invalidateQueries({ queryKey: ['productionDaily', productionPdlUsagePointId] })

      // Fetch production daily data (3 years)
      updateProductionStatus({ daily: 'loading' })
      fetchPromises.push(
        (async () => {
          try {
            logger.log(`Fetching production daily: ${startDate3y} → ${endDate}`)
            const dailyData = await enedisApi.getProductionDaily(productionPdlUsagePointId, {
              start: startDate3y,
              end: endDate,
              use_cache: true,
            })

            if (dailyData?.success) {
              queryClient.setQueryData(['productionDaily', productionPdlUsagePointId], dailyData)
              updateProductionStatus({ daily: 'success' })
              logger.log('Production daily data fetched successfully')
            } else {
              updateProductionStatus({ daily: 'error' })
            }
          } catch (error: any) {
            logger.log('Error fetching production daily:', error)
            updateProductionStatus({ daily: 'error' })
            toast.error(`Erreur données quotidiennes de production: ${error?.response?.data?.error?.message || error.message}`)
          }
        })()
      )

      // Fetch production detail batch (2 years)
      updateProductionStatus({ detail: 'loading', detailProgress: { current: 0, total: 1 } })
      fetchPromises.push(
        (async () => {
          try {
            logger.log(`Fetching production detail batch: ${startDate2y} → ${endDate}`)
            const batchData = await enedisApi.getProductionDetailBatch(productionPdlUsagePointId, {
              start: startDate2y,
              end: endDate,
              use_cache: true,
            })

            if (batchData?.success && (batchData as any)?.data?.meter_reading?.interval_reading) {
              const readings = (batchData as any).data.meter_reading.interval_reading

              // Deduplicate readings using a Map with timestamp as key
              const uniqueReadingsMap = new Map()
              readings.forEach((point: any) => {
                uniqueReadingsMap.set(point.date, point)
              })
              const uniqueReadings = Array.from(uniqueReadingsMap.values())

              // Store all detail data in a single cache key
              queryClient.setQueryData(['productionDetail', productionPdlUsagePointId], {
                success: true,
                data: {
                  meter_reading: {
                    interval_reading: uniqueReadings
                  }
                }
              })

              // Calculate period statistics for toast
              const dates = new Set(uniqueReadings.map((p: any) => p.date.split(' ')[0].split('T')[0]))
              const dayCount = dates.size
              const years = Math.floor(dayCount / 365)
              const remainingDays = dayCount % 365
              const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
              const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
              const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

              updateProductionStatus({
                detail: 'success',
                detailProgress: { current: 1, total: 1 }
              })

              toast.success(`Production détaillée: ${periodText}, ${uniqueReadings.length} points`, { duration: 4000 })
            } else if (batchData?.error) {
              updateProductionStatus({ detail: 'error' })
              if (batchData.error.code === 'PARTIAL_DATA') {
                toast.success(batchData.error.message, { duration: 4000, icon: '⚠️' })
              } else {
                toast.error(batchData.error.message || 'Erreur données détaillées de production')
              }
            }
          } catch (error: any) {
            logger.log('Error fetching production detail batch:', error)
            updateProductionStatus({ detail: 'error' })
            toast.error(`Erreur données détaillées de production: ${error?.response?.data?.error?.message || error.message}`)
          }
        })()
      )
    }

    // Wait for all fetch promises to complete in parallel
    await Promise.all(fetchPromises)

    logger.log('Unified data fetch completed')

    // Show a toast to indicate cache persistence is happening
    const persistToast = toast.loading('💾 Mise en cache des données...', { duration: 3000 })

    // Wait a bit for React Query Persist to save to localStorage
    // This gives time for the persistence mechanism to complete
    setTimeout(() => {
      toast.dismiss(persistToast)
      toast.success('✅ Données mises en cache avec succès !', { duration: 3000 })

      // Broadcast cache update to other tabs
      logger.log('[UnifiedFetch] Broadcasting CACHE_UPDATED to other tabs')
      broadcast({
        type: 'CACHE_UPDATED',
        timestamp: Date.now(),
        source: 'unified-fetch'
      })
      logger.log('[UnifiedFetch] Broadcast sent')
    }, 1500)
  }, [selectedPDL, selectedPDLDetails, allPDLs, queryClient, updateConsumptionStatus, updateProductionStatus, resetLoadingStatus, broadcast])

  return {
    fetchAllData,
  }
}
