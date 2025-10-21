import { apiClient } from './client'
import type { PDL, PDLCreate } from '@/types/api'

export const pdlApi = {
  list: async () => {
    return apiClient.get<PDL[]>('pdl')
  },

  create: async (data: PDLCreate) => {
    return apiClient.post<PDL>('pdl', data)
  },

  get: async (id: string) => {
    return apiClient.get<PDL>(`pdl/${id}`)
  },

  delete: async (id: string) => {
    return apiClient.delete(`pdl/${id}`)
  },

  updateContract: async (id: string, data: { subscribed_power?: number; offpeak_hours?: string[] | Record<string, string> }) => {
    return apiClient.patch<PDL>(`pdl/${id}/contract`, data)
  },

  updateName: async (id: string, name: string) => {
    return apiClient.patch<PDL>(`pdl/${id}/name`, { name })
  },

  updateType: async (id: string, has_consumption: boolean, has_production: boolean) => {
    return apiClient.patch<PDL>(`pdl/${id}/type`, { has_consumption, has_production })
  },

  toggleActive: async (id: string, is_active: boolean) => {
    return apiClient.patch<PDL>(`pdl/${id}/active`, { is_active })
  },

  reorderPdls: async (pdlOrders: Array<{ id: string; order: number }>) => {
    return apiClient.patch<{ message: string }>(`pdl/reorder`, { pdl_orders: pdlOrders })
  },

  fetchContract: async (id: string) => {
    return apiClient.post<PDL>(`pdl/${id}/fetch-contract`, {})
  },

  // Admin-only endpoints
  adminAddPdl: async (data: { user_email: string; usage_point_id: string; name?: string }) => {
    return apiClient.post<PDL>('pdl/admin/add', data)
  },
}
