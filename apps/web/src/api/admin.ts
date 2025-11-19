import { apiClient } from './client'
import type { AdminUserCreate } from '@/types/api'

export const adminApi = {
  listUsers: async () => {
    return apiClient.get('admin/users')
  },

  getUserStats: async () => {
    return apiClient.get('admin/users/stats')
  },

  createUser: async (data: AdminUserCreate) => {
    return apiClient.post('admin/users', data)
  },

  toggleUserStatus: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/toggle-status`)
  },

  deleteUser: async (userId: string) => {
    return apiClient.delete(`admin/users/${userId}`)
  },

  resetUserPassword: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/reset-password`)
  },

  resetUserQuota: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/reset-quota`)
  },

  clearUserCache: async (userId: string) => {
    return apiClient.delete(`admin/users/${userId}/clear-cache`)
  },

  clearAllConsumptionCache: async () => {
    return apiClient.delete('admin/cache/consumption/clear-all')
  },

  clearAllProductionCache: async () => {
    return apiClient.delete('admin/cache/production/clear-all')
  },

  toggleUserDebugMode: async (userId: string) => {
    return apiClient.post(`admin/users/${userId}/toggle-debug`)
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
