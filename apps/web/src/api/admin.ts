import { apiClient } from './client'

export const adminApi = {
  listUsers: async () => {
    return apiClient.get('admin/users')
  },

  resetUserQuota: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/reset-quota`)
  },

  clearUserCache: async (userId: string) => {
    return apiClient.delete(`admin/users/${userId}/clear-cache`)
  },

  getGlobalStats: async () => {
    return apiClient.get('admin/stats')
  },

  getLogs: async (level?: string, lines?: number) => {
    const params: Record<string, string | number> = {}
    if (level) params.level = level
    if (lines) params.lines = lines
    return apiClient.get('admin/logs', params)
  },
}

export const getAdminLogs = async (level?: string, lines?: number) => {
  const response = await adminApi.getLogs(level, lines)
  return response.data
}
