import { apiClient } from './client'
import type { CacheDeleteResponse } from '@/types/api'

export interface EnedisDataParams extends Record<string, unknown> {
  start: string
  end: string
  use_cache?: boolean
}

export const enedisApi = {
  getConsumptionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get(`enedis/consumption/daily/${usagePointId}`, params)
  },

  getConsumptionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get(`enedis/consumption/detail/${usagePointId}`, params)
  },

  getMaxPower: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get(`enedis/power/${usagePointId}`, params)
  },

  getProductionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get(`enedis/production/daily/${usagePointId}`, params)
  },

  getProductionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get(`enedis/production/detail/${usagePointId}`, params)
  },

  getContract: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get(`enedis/contract/${usagePointId}`, { use_cache: useCache })
  },

  getAddress: async (usagePointId: string, useCache?: boolean) => {
    return apiClient.get(`enedis/address/${usagePointId}`, { use_cache: useCache })
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
