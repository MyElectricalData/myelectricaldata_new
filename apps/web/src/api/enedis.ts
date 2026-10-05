import { apiClient } from './client'
import type { CacheDeleteResponse, EnedisAddress, EnedisContract, EnedisMeasure } from '@/types/api'

export interface EnedisDataParams extends Record<string, unknown> {
  start: string
  end: string
  use_cache?: boolean
}

/**
 * L'interface manipule des périodes à fin INCLUSE (« jusqu'à hier »), l'API à fin EXCLUE comme dateFin
 * Enedis Data Connect : on envoie le lendemain de la date de fin (calcul en UTC, insensible à l'heure d'été).
 */
export const toExclusiveEnd = (params: EnedisDataParams): EnedisDataParams => {
  const next = new Date(`${params.end}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return { ...params, end: next.toISOString().slice(0, 10) }
}

export const enedisApi = {
  getConsumptionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/daily/${usagePointId}`, toExclusiveEnd(params))
  },

  getConsumptionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/detail/${usagePointId}`, toExclusiveEnd(params))
  },

  getConsumptionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/detail/batch/${usagePointId}`, toExclusiveEnd(params))
  },

  getMaxPower: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/power/${usagePointId}`, toExclusiveEnd(params))
  },

  getProductionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/daily/${usagePointId}`, toExclusiveEnd(params))
  },

  getProductionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/detail/${usagePointId}`, toExclusiveEnd(params))
  },

  getProductionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/detail/batch/${usagePointId}`, toExclusiveEnd(params))
  },

  getContract: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get<EnedisContract>(`enedis/contract/${usagePointId}`, { use_cache: useCache })
  },

  getAddress: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get<EnedisAddress>(`enedis/address/${usagePointId}`, { use_cache: useCache })
  },

  getCustomer: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get(`enedis/customer/${usagePointId}`, { use_cache: useCache })
  },

  getContact: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get(`enedis/contact/${usagePointId}`, { use_cache: useCache })
  },

  deleteCache: async (usagePointId: string) => {
    return apiClient.delete<CacheDeleteResponse>(`enedis/cache/${usagePointId}`)
  },
}
