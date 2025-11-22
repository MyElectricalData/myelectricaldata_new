import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { PDL } from '@/types/api'
import { useDataFetchStore } from '@/stores/dataFetchStore'

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
      queryClient.invalidateQueries({ queryKey: ['consumption', selectedPDL] })
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
              queryClient.setQueryData(['consumption', selectedPDL, startDate3y, endDate], dailyData)
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
              queryClient.setQueryData(['maxPower', selectedPDL, startDate3y, endDate], powerData)
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
              const dataByDate: Record<string, any[]> = {}

              readings.forEach((point: any) => {
                let date = point.date.split(' ')[0].split('T')[0]
                const time = point.date.split(' ')[1] || point.date.split('T')[1] || '00:00:00'
                if (time.startsWith('00:00')) {
                  const dateObj = new Date(date + 'T00:00:00Z')
                  dateObj.setUTCDate(dateObj.getUTCDate() - 1)
                  date = formatDate(dateObj)
                }
                if (!dataByDate[date]) dataByDate[date] = []
                dataByDate[date].push(point)
              })

              Object.entries(dataByDate).forEach(([date, points]) => {
                queryClient.setQueryData(['consumptionDetail', selectedPDL, date, date], {
                  success: true,
                  data: { meter_reading: { interval_reading: points } }
                })
              })

              const dayCount = Object.keys(dataByDate).length
              updateConsumptionStatus({
                detail: 'success',
                detailProgress: { current: 1, total: 1 }
              })

              const years = Math.floor(dayCount / 365)
              const remainingDays = dayCount % 365
              const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
              const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
              const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

              toast.success(`Consommation détaillée: ${periodText}, ${readings.length} points`, { duration: 4000 })
              queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })
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
      queryClient.invalidateQueries({ queryKey: ['production', productionPdlUsagePointId] })

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
              queryClient.setQueryData(['production', productionPdlUsagePointId, startDate3y, endDate], dailyData)
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
              const dataByDate: Record<string, any[]> = {}

              readings.forEach((point: any) => {
                let date = point.date.split(' ')[0].split('T')[0]
                const time = point.date.split(' ')[1] || point.date.split('T')[1] || '00:00:00'
                if (time.startsWith('00:00')) {
                  const dateObj = new Date(date + 'T00:00:00Z')
                  dateObj.setUTCDate(dateObj.getUTCDate() - 1)
                  date = formatDate(dateObj)
                }
                if (!dataByDate[date]) dataByDate[date] = []
                dataByDate[date].push(point)
              })

              Object.entries(dataByDate).forEach(([date, points]) => {
                queryClient.setQueryData(['productionDetail', productionPdlUsagePointId, date, date], {
                  success: true,
                  data: { meter_reading: { interval_reading: points } }
                })
              })

              const dayCount = Object.keys(dataByDate).length
              updateProductionStatus({
                detail: 'success',
                detailProgress: { current: 1, total: 1 }
              })

              const years = Math.floor(dayCount / 365)
              const remainingDays = dayCount % 365
              const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
              const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
              const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

              toast.success(`Production détaillée: ${periodText}, ${readings.length} points`, { duration: 4000 })
              queryClient.invalidateQueries({ queryKey: ['productionDetail'] })
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
  }, [selectedPDL, selectedPDLDetails, allPDLs, queryClient, updateConsumptionStatus, updateProductionStatus, resetLoadingStatus])

  return {
    fetchAllData,
  }
}
