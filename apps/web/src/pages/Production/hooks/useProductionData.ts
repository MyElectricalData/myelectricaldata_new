import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { pdlApi } from '@/api/pdl'
import { enedisApi } from '@/api/enedis'
import type { PDL } from '@/types/api'
import type { DateRange } from '../types/production.types'

export function useProductionData(selectedPDL: string, dateRange: DateRange | null, detailDateRange: DateRange | null) {
  const queryClient = useQueryClient()

  // Fetch PDLs
  const { data: pdlsData } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
  })

  const pdls = Array.isArray(pdlsData) ? pdlsData : []

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

      // Calculate the total date range in days
      const startDate = new Date(dateRange.start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getProductionDaily(selectedPDL, {
          start: dateRange.start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Split into yearly chunks (max 365 days per call)
      const yearlyChunks: { start: string; end: string }[] = []
      let currentStart = new Date(startDate)

      while (currentStart <= endDate) {
        let currentEnd = new Date(currentStart)
        currentEnd.setUTCFullYear(currentEnd.getUTCFullYear() + 1)
        currentEnd.setUTCDate(currentEnd.getUTCDate() - 1)

        if (currentEnd > endDate) {
          currentEnd = new Date(endDate)
        }

        const chunkStart = currentStart.getUTCFullYear() + '-' +
                          String(currentStart.getUTCMonth() + 1).padStart(2, '0') + '-' +
                          String(currentStart.getUTCDate()).padStart(2, '0')
        const chunkEnd = currentEnd.getUTCFullYear() + '-' +
                        String(currentEnd.getUTCMonth() + 1).padStart(2, '0') + '-' +
                        String(currentEnd.getUTCDate()).padStart(2, '0')

        yearlyChunks.push({ start: chunkStart, end: chunkEnd })

        currentStart = new Date(currentEnd)
        currentStart.setUTCDate(currentStart.getUTCDate() + 1)
      }

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

      // Combine all interval_reading arrays
      const allReadings: any[] = []
      for (const result of chunkResults) {
        if (result?.success && (result as any)?.data?.meter_reading?.interval_reading) {
          allReadings.push(...(result as any).data.meter_reading.interval_reading)
        }
      }

      return {
        ...firstSuccess,
        data: {
          ...(firstSuccess.data as any),
          meter_reading: {
            ...(firstSuccess.data as any)?.meter_reading,
            interval_reading: allReadings
          }
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
