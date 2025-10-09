import { useQuery, useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'

/**
 * Centralized consumption data cache hook
 * Uses a shared queryKey to cache consumption data across pages
 */

interface ConsumptionParams {
  pdlId: string
  start: string
  end: string
  use_cache?: boolean
}

/**
 * Hook to fetch consumption data with shared cache
 * Any component calling this with the same pdlId/start/end will share the cached result
 */
export function useConsumptionDaily(params: ConsumptionParams) {
  return useQuery({
    queryKey: ['consumption-daily', params.pdlId, params.start, params.end],
    queryFn: () => enedisApi.getConsumptionDaily(params.pdlId, {
      start: params.start,
      end: params.end,
      use_cache: params.use_cache ?? true,
    }),
    enabled: !!params.pdlId && !!params.start && !!params.end,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days - match backend cache
    gcTime: 7 * 24 * 60 * 60 * 1000, // Keep in cache for 7 days
  })
}

/**
 * Hook to fetch detailed consumption data (hourly) with shared cache
 */
export function useConsumptionDetail(params: ConsumptionParams) {
  return useQuery({
    queryKey: ['consumption-detail', params.pdlId, params.start, params.end],
    queryFn: () => enedisApi.getConsumptionDetail(params.pdlId, {
      start: params.start,
      end: params.end,
      use_cache: params.use_cache ?? true,
    }),
    enabled: !!params.pdlId && !!params.start && !!params.end,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    gcTime: 7 * 24 * 60 * 60 * 1000,
  })
}

/**
 * Hook to manually fetch and cache consumption data
 * Useful for preloading data before running simulations
 */
export function usePrefetchConsumption() {
  const queryClient = useQueryClient()

  const prefetchDaily = async (params: ConsumptionParams) => {
    await queryClient.prefetchQuery({
      queryKey: ['consumption-daily', params.pdlId, params.start, params.end],
      queryFn: () => enedisApi.getConsumptionDaily(params.pdlId, {
        start: params.start,
        end: params.end,
        use_cache: params.use_cache ?? true,
      }),
      staleTime: 7 * 24 * 60 * 60 * 1000,
    })
  }

  const prefetchDetail = async (params: ConsumptionParams) => {
    await queryClient.prefetchQuery({
      queryKey: ['consumption-detail', params.pdlId, params.start, params.end],
      queryFn: () => enedisApi.getConsumptionDetail(params.pdlId, {
        start: params.start,
        end: params.end,
        use_cache: params.use_cache ?? true,
      }),
      staleTime: 7 * 24 * 60 * 60 * 1000,
    })
  }

  return { prefetchDaily, prefetchDetail }
}

/**
 * Hook to check if consumption data is cached
 */
export function useIsConsumptionCached(pdlId: string, start: string, end: string) {
  const queryClient = useQueryClient()

  const isDailyCached = queryClient.getQueryData(['consumption-daily', pdlId, start, end]) !== undefined
  const isDetailCached = queryClient.getQueryData(['consumption-detail', pdlId, start, end]) !== undefined

  return { isDailyCached, isDetailCached }
}
