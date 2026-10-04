import { apiClient } from './client'
import type { CacheDeleteResponse, EnedisAddress, EnedisContract, EnedisMeasure } from '@/types/api'

export interface EnedisDataParams extends Record<string, unknown> {
  start: string
  end: string
  use_cache?: boolean
}

export const enedisApi = {
  getConsumptionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/daily/${usagePointId}`, params)
  },

  getConsumptionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/detail/${usagePointId}`, params)
  },

  getConsumptionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/consumption/detail/batch/${usagePointId}`, params)
  },

  getMaxPower: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/power/${usagePointId}`, params)
  },

  getProductionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/daily/${usagePointId}`, params)
  },

  getProductionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/detail/${usagePointId}`, params)
  },

  getProductionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisMeasure>(`enedis/production/detail/batch/${usagePointId}`, params)
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
