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

  updateContract: async (id: string, data: { subscribed_power?: number; offpeak_hours?: Record<string, string> }) => {
    return apiClient.patch<PDL>(`pdl/${id}/contract`, data)
  },

  fetchContract: async (id: string) => {
    return apiClient.post<PDL>(`pdl/${id}/fetch-contract`, {})
  },
}
