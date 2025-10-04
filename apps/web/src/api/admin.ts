import { apiClient } from './client'

export const adminApi = {
  listUsers: async () => {
    return apiClient.get('admin/users')
  },

  resetUserQuota: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/reset-quota`)
  },

  getGlobalStats: async () => {
    return apiClient.get('admin/stats')
  },
}
