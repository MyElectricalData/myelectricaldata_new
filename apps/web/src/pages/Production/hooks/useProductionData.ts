import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { enedisApi } from '@/api/enedis'
import { resolveHistoryStart } from '@/utils/localSyncStatus'
import { splitYearlyChunks } from '@/utils/historyRange'
import type { EnedisMeasure, MeasureReading } from '@/types/api'
import { buildMeasure, getReadings, getUnit } from '@/utils/enedisMeasure'
import type { DateRange } from '../types/production.types'
import { useAllPdls } from '@/hooks/useAllPdls'

export function useProductionData(selectedPDL: string, dateRange: DateRange | null, _detailDateRange: DateRange | null) {
  const queryClient = useQueryClient()

  // Fetch PDLs - with short staleTime to ensure provider changes are reflected
  // PDL du compte + PDL partagés (admin, MED-112) : en impersonation, les détails du PDL
  // partagé (offre, liaison conso/production) doivent être trouvés comme ceux d'un PDL propre
  const { allPdls: pdls } = useAllPdls()

  // Filter only active PDLs that have production enabled
  const activePdls = pdls.filter(p => p.is_active !== false && p.has_production === true)

  // Get selected PDL details
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // Fetch production data with React Query
  // Use a single cache key per PDL (no date in key to avoid cache fragmentation)
  const { data: productionResponse, isLoading: isLoadingProduction } = useQuery({
    queryKey: ['productionDaily', selectedPDL],
    enabled: !!selectedPDL && !!dateRange,
    queryFn: async () => {
      if (!selectedPDL || !dateRange) return null

      // Mode client : remonter jusqu'à la donnée locale la plus ancienne (import V1, MED-64)
      const start = await resolveHistoryStart(selectedPDL, dateRange.start, 'production_daily')

      // Calculate the total date range in days
      const startDate = new Date(start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getProductionDaily(selectedPDL, {
          start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Morceaux de 365 jours, fin incluse, chacun repris au lendemain du précédent (MED-64)
      const yearlyChunks = splitYearlyChunks(start, dateRange.end)

      // Fetch all chunks in parallel
      const chunkPromises = yearlyChunks.map(chunk =>
        enedisApi.getProductionDaily(selectedPDL, {
          start: chunk.start,
          end: chunk.end,
          use_cache: true,
        })
      )

      const chunkResults = await Promise.all(chunkPromises)

      // Merge all chunks into a single response
      const firstSuccess = chunkResults.find(r => r?.success)
      if (!firstSuccess) {
        return chunkResults[0]
      }

      // Concatène les lectures de tous les morceaux
      const allReadings: MeasureReading[] = []
      for (const result of chunkResults) {
        if (result?.success) {
          allReadings.push(...getReadings(result.data))
        }
      }

      const firstData = firstSuccess.data as EnedisMeasure | undefined
      return {
        ...firstSuccess,
        data: {
          ...firstData,
          ...buildMeasure(allReadings, {
            grandeurMetier: 'PROD',
            unite: getUnit(firstData) ?? 'Wh',
            pas: firstData?.pas,
            start,
            end: dateRange.end,
          }),
        }
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour - data is considered fresh
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
  })

  // Production doesn't have max power data - skip this query

  // Fetch detailed production data (load curve)
  // HYBRID APPROACH: useQuery creates the cache entry for persistence,
  // but we read data via subscription to avoid race conditions

  // 1. Create query entry (needed for React Query Persist)
  // CRITICAL: queryFn reads from cache, making the query "succeed" with persisted data
  useQuery({
    queryKey: ['productionDetail', selectedPDL],
    queryFn: async () => {
      // Read from cache - this makes the query succeed with status: 'success'
      // Data is written to cache via setQueryData in useUnifiedDataFetch
      const cachedData = queryClient.getQueryData(['productionDetail', selectedPDL])
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
    const initialData = queryClient.getQueryData(['productionDetail', selectedPDL])
    if (initialData) {
      setDetailResponse(initialData)
    }

    // Subscribe to future changes (when setQueryData is called)
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'productionDetail' &&
        event?.query?.queryKey?.[1] === selectedPDL
      ) {
        const updatedData = queryClient.getQueryData(['productionDetail', selectedPDL])
        setDetailResponse(updatedData)
      }
    })

    return () => unsubscribe()
  }, [selectedPDL, queryClient])

  const productionData = (productionResponse as any)?.success ? (productionResponse as any).data : null
  const detailData = (detailResponse as any)?.success ? (detailResponse as any).data : null
  const isLoading = isLoadingProduction || isLoadingDetail

  return {
    pdls,
    activePdls,
    selectedPDLDetails,
    productionData,
    detailData,
    isLoading,
    isLoadingProduction,
    isLoadingDetail,
    queryClient
  }
}
