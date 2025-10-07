import { apiClient } from './client'

export interface TempoDay {
  date: string
  color: 'BLUE' | 'WHITE' | 'RED'
  updated_at?: string
  rte_updated_date?: string
}

export const tempoApi = {
  // Get today's TEMPO color
  getToday: async () => {
    return apiClient.get<TempoDay>('tempo/today')
  },

  // Get next 7 days
  getWeek: async () => {
    return apiClient.get<TempoDay[]>('tempo/week')
  },

  // Get custom date range
  getDays: async (startDate?: string, endDate?: string) => {
    const params: Record<string, string> = {}
    if (startDate) params.start_date = startDate
    if (endDate) params.end_date = endDate
    return apiClient.get<TempoDay[]>('tempo/days', params)
  },

  // Manually refresh cache (authenticated)
  // RTE API limitation: only today + tomorrow (after 6am)
  refreshCache: async () => {
    return apiClient.post('tempo/refresh', {})
  },

  // Clear old data (admin only)
  clearOldData: async (daysToKeep: number = 30) => {
    return apiClient.delete(`tempo/clear-old?days_to_keep=${daysToKeep}`)
  },
}
