import { apiClient } from './client'
import type { CacheDeleteResponse } from '@/types/api'

export interface EnedisDataParams extends Record<string, unknown> {
  start: string
  end: string
  use_cache?: boolean
}

// Type for Enedis meter reading data
export interface EnedisMeterReading {
  usage_point_id?: string
  start?: string
  end?: string
  reading_type?: {
    aggregate?: string
    unit?: string
    interval_length?: string
    measurement_kind?: string
  }
  interval_reading?: Array<{
    date: string
    value: string | number
  }>
}

export interface EnedisData {
  meter_reading?: EnedisMeterReading
}

export const enedisApi = {
  getConsumptionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/consumption/daily/${usagePointId}`, params)
  },

  getConsumptionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/consumption/detail/${usagePointId}`, params)
  },

  getConsumptionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/consumption/detail/batch/${usagePointId}`, params)
  },

  getMaxPower: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/power/${usagePointId}`, params)
  },

  getProductionDaily: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/production/daily/${usagePointId}`, params)
  },

  getProductionDetail: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/production/detail/${usagePointId}`, params)
  },

  getProductionDetailBatch: async (usagePointId: string, params: EnedisDataParams) => {
    return apiClient.get<EnedisData>(`enedis/production/detail/batch/${usagePointId}`, params)
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
