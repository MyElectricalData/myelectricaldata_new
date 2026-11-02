import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { enedisApi } from '@/api/enedis'
import { resolveHistoryStart } from '@/utils/localSyncStatus'
import { splitYearlyChunks } from '@/utils/historyRange'
import type { APIResponse, EnedisMeasure, MeasureReading } from '@/types/api'
import { buildMeasure, getIntervalLength, getReadings, getUnit } from '@/utils/enedisMeasure'
import type { DateRange } from '../types/consumption.types'
import { useAllPdls } from '@/hooks/useAllPdls'

// Full response type for Enedis API
type EnedisApiResponse = APIResponse<EnedisMeasure>

export function useConsumptionData(selectedPDL: string, dateRange: DateRange | null, _detailDateRange: DateRange | null) {
  const queryClient = useQueryClient()

  // Fetch PDLs - with short staleTime to ensure provider changes are reflected
  // PDL du compte + PDL partagés (admin, MED-112) : en impersonation, les détails du PDL
  // partagé (offre, liaison conso/production) doivent être trouvés comme ceux d'un PDL propre
  const { allPdls: pdls } = useAllPdls()

  // Filter only active PDLs (if is_active is undefined, consider it as active)
  const activePdls = pdls.filter(p => p.is_active !== false)

  // Get selected PDL details
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // Fetch consumption data with React Query
  // Use a single cache key per PDL (no date in key to avoid cache fragmentation)
  const { data: consumptionResponse, isLoading: isLoadingConsumption } = useQuery<EnedisApiResponse | null>({
    queryKey: ['consumptionDaily', selectedPDL],
    enabled: !!selectedPDL && !!dateRange,
    queryFn: async (): Promise<EnedisApiResponse | null> => {
      if (!selectedPDL || !dateRange) return null

      // Mode client : remonter jusqu'à la donnée locale la plus ancienne (import V1, MED-64)
      const start = await resolveHistoryStart(selectedPDL, dateRange.start, 'consumption_daily')

      // Calculate the total date range in days
      const startDate = new Date(start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getConsumptionDaily(selectedPDL, {
          start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Morceaux de 365 jours, fin incluse, chacun repris au lendemain du précédent (MED-64)
      const yearlyChunks = splitYearlyChunks(start, dateRange.end)

      // Fetch all chunks in parallel
      const chunkPromises = yearlyChunks.map(chunk =>
        enedisApi.getConsumptionDaily(selectedPDL, {
          start: chunk.start,
          end: chunk.end,
          use_cache: true,
        })
      )

      const chunkResults = await Promise.all(chunkPromises) as EnedisApiResponse[]

      // Merge all chunks into a single response
      // Take the first successful response as the base
      const firstSuccess = chunkResults.find(r => r?.success)
      if (!firstSuccess) {
        // If no successful response, return the first one (which will be an error)
        return chunkResults[0]
      }

      // Concatène les lectures de tous les morceaux
      const allReadings: MeasureReading[] = []
      for (const result of chunkResults) {
        if (result?.success) {
          allReadings.push(...getReadings(result.data))
        }
      }

      // Return merged response
      return {
        ...firstSuccess,
        data: {
          ...firstSuccess.data,
          ...buildMeasure(allReadings, {
            grandeurMetier: 'CONS',
            unite: getUnit(firstSuccess.data) || 'Wh',
            pas: getIntervalLength(firstSuccess.data),
            start,
            end: dateRange.end,
          }),
        }
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour - data is considered fresh
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
    refetchOnMount: true, // Always refetch on component mount if data is stale
  })

  // Fetch max power data with React Query
  // Use a single cache key per PDL (no date in key to avoid cache fragmentation)
  const { data: maxPowerResponse, isLoading: isLoadingPower } = useQuery<EnedisApiResponse | null>({
    queryKey: ['maxPower', selectedPDL],
    enabled: !!selectedPDL && !!dateRange,
    queryFn: async (): Promise<EnedisApiResponse | null> => {
      if (!selectedPDL || !dateRange) return null

      // Mode client : remonter jusqu'à la donnée locale la plus ancienne (import V1, MED-64)
      const start = await resolveHistoryStart(selectedPDL, dateRange.start, 'max_power_daily')

      // Calculate the total date range in days
      const startDate = new Date(start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getMaxPower(selectedPDL, {
          start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Morceaux de 365 jours, fin incluse, chacun repris au lendemain du précédent (MED-64)
      const yearlyChunks = splitYearlyChunks(start, dateRange.end)

      // Fetch all chunks in parallel
      const chunkPromises = yearlyChunks.map(chunk =>
        enedisApi.getMaxPower(selectedPDL, {
          start: chunk.start,
          end: chunk.end,
          use_cache: true,
        })
      )

      const chunkResults = await Promise.all(chunkPromises) as EnedisApiResponse[]

      // Merge all chunks into a single response
      // Take the first successful response as the base
      const firstSuccess = chunkResults.find(r => r?.success)
      if (!firstSuccess) {
        // If no successful response, return the first one (which will be an error)
        return chunkResults[0]
      }

      // Concatène les lectures de tous les morceaux
      const allReadings: MeasureReading[] = []
      for (const result of chunkResults) {
        if (result?.success) {
          allReadings.push(...getReadings(result.data))
        }
      }

      // Return merged response
      return {
        ...firstSuccess,
        data: {
          ...firstSuccess.data,
          ...buildMeasure(allReadings, {
            grandeurMetier: 'CONS',
            unite: getUnit(firstSuccess.data) || 'VA',
            grandeurPhysique: 'PMA',
            pas: getIntervalLength(firstSuccess.data),
            start,
            end: dateRange.end,
          }),
        }
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnMount: true, // Always refetch on component mount if data is stale
  })

  // Fetch detailed consumption data (load curve - 30min intervals)
  // HYBRID APPROACH: useQuery creates the cache entry for persistence,
  // but we read data via subscription to avoid race conditions

  // 1. Create query entry (needed for React Query Persist)
  // CRITICAL: queryFn reads from cache, making the query "succeed" with persisted data
  useQuery({
    queryKey: ['consumptionDetail', selectedPDL],
    queryFn: async () => {
      // Read from cache - this makes the query succeed with status: 'success'
      // Data is written to cache via setQueryData in useUnifiedDataFetch
      const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPDL])
      return cachedData || null
    },
    enabled: !!selectedPDL, // Run once when PDL is set (reads persisted data)
    staleTime: Infinity, // Never refetch - data only comes from setQueryData
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // 2. Read data via direct cache access + subscription (avoids race conditions)
  const [detailResponse, setDetailResponse] = useState<any>(null)
  const [isLoadingDetail] = useState(false)

  useEffect(() => {
    if (!selectedPDL) {
      setDetailResponse(null)
      return
    }

    // Read current data from cache (includes persisted data)
    const initialData = queryClient.getQueryData(['consumptionDetail', selectedPDL])
    if (initialData) {
      setDetailResponse(initialData)
    }

    // Subscribe to future changes (when setQueryData is called)
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'consumptionDetail' &&
        event?.query?.queryKey?.[1] === selectedPDL
      ) {
        const updatedData = queryClient.getQueryData(['consumptionDetail', selectedPDL])
        setDetailResponse(updatedData)
      }
    })

    return () => unsubscribe()
  }, [selectedPDL, queryClient])

  const consumptionData = consumptionResponse?.success ? consumptionResponse.data ?? null : null
  const maxPowerData = maxPowerResponse?.success ? maxPowerResponse.data ?? null : null
  const detailData = (detailResponse as EnedisApiResponse | null)?.success
    ? (detailResponse as EnedisApiResponse).data ?? null
    : null
  const isLoading = isLoadingConsumption || isLoadingPower || isLoadingDetail

  return {
    pdls,
    activePdls,
    selectedPDLDetails,
    consumptionData,
    maxPowerData,
    detailData,
    isLoading,
    isLoadingConsumption,
    isLoadingPower,
    isLoadingDetail,
    queryClient
  }
}