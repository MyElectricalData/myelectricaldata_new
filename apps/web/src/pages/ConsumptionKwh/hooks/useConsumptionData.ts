import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { pdlApi } from '@/api/pdl'
import { enedisApi, type EnedisData } from '@/api/enedis'
import type { PDL, APIResponse } from '@/types/api'
import type { DateRange } from '../types/consumption.types'

// Full response type for Enedis API
type EnedisApiResponse = APIResponse<EnedisData>

export function useConsumptionData(selectedPDL: string, dateRange: DateRange | null, _detailDateRange: DateRange | null) {
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

      // Calculate the total date range in days
      const startDate = new Date(dateRange.start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getConsumptionDaily(selectedPDL, {
          start: dateRange.start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Split into yearly chunks (max 365 days per call)
      const yearlyChunks: { start: string; end: string }[] = []
      let currentStart = new Date(startDate)

      while (currentStart <= endDate) {
        // Calculate end of this chunk (1 year or less)
        let currentEnd = new Date(currentStart)
        currentEnd.setUTCFullYear(currentEnd.getUTCFullYear() + 1)
        currentEnd.setUTCDate(currentEnd.getUTCDate() - 1) // 365 days max

        // Cap to overall end date if needed
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

        // Move to next chunk (day after current end)
        currentStart = new Date(currentEnd)
        currentStart.setUTCDate(currentStart.getUTCDate() + 1)
      }

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

      // Combine all interval_reading arrays
      const allReadings: Array<{ date: string; value: string | number }> = []
      for (const result of chunkResults) {
        if (result?.success && result?.data?.meter_reading?.interval_reading) {
          allReadings.push(...result.data.meter_reading.interval_reading)
        }
      }

      // Return merged response
      return {
        ...firstSuccess,
        data: {
          ...firstSuccess.data,
          meter_reading: {
            ...firstSuccess.data?.meter_reading,
            interval_reading: allReadings
          }
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

      // Calculate the total date range in days
      const startDate = new Date(dateRange.start + 'T00:00:00Z')
      const endDate = new Date(dateRange.end + 'T00:00:00Z')
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // If the range is <= 365 days, make a single call
      if (totalDays <= 365) {
        return enedisApi.getMaxPower(selectedPDL, {
          start: dateRange.start,
          end: dateRange.end,
          use_cache: true,
        })
      }

      // Split into yearly chunks (max 365 days per call)
      const yearlyChunks: { start: string; end: string }[] = []
      let currentStart = new Date(startDate)

      while (currentStart <= endDate) {
        // Calculate end of this chunk (1 year or less)
        let currentEnd = new Date(currentStart)
        currentEnd.setUTCFullYear(currentEnd.getUTCFullYear() + 1)
        currentEnd.setUTCDate(currentEnd.getUTCDate() - 1) // 365 days max

        // Cap to overall end date if needed
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

        // Move to next chunk (day after current end)
        currentStart = new Date(currentEnd)
        currentStart.setUTCDate(currentStart.getUTCDate() + 1)
      }

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

      // Combine all interval_reading arrays
      const allReadings: Array<{ date: string; value: string | number }> = []
      for (const result of chunkResults) {
        if (result?.success && result?.data?.meter_reading?.interval_reading) {
          allReadings.push(...result.data.meter_reading.interval_reading)
        }
      }

      // Return merged response
      return {
        ...firstSuccess,
        data: {
          ...firstSuccess.data,
          meter_reading: {
            ...firstSuccess.data?.meter_reading,
            interval_reading: allReadings
          }
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