import { apiClient } from './client'
import type { UserCreate, UserLogin, User, ClientCredentials, TokenResponse } from '@/types/api'

export const authApi = {
  signup: async (data: UserCreate) => {
    return apiClient.post<ClientCredentials>('accounts/signup', data)
  },

  login: async (data: UserLogin) => {
    return apiClient.post<TokenResponse>('accounts/login', data)
  },

  getMe: async () => {
    try {
      return await apiClient.get<User>('accounts/me')
    } catch {
      // 401 is expected when not logged in - return success: false instead of throwing
      return { success: false, data: null, error: { message: 'Not authenticated' } }
    }
  },

  getCredentials: async () => {
    return apiClient.get<ClientCredentials>('accounts/credentials')
  },

  deleteAccount: async () => {
    return apiClient.delete('accounts/me')
  },

  regenerateSecret: async () => {
    return apiClient.post<ClientCredentials>('accounts/regenerate-secret')
  },

  getUsageStats: async () => {
    return apiClient.get('accounts/usage-stats')
  },

  forgotPassword: async (email: string) => {
    return apiClient.post('accounts/forgot-password', { email })
  },

  resetPassword: async (token: string, new_password: string) => {
    return apiClient.post('accounts/reset-password', { token, new_password })
  },

  changePassword: async (old_password: string, new_password: string) => {
    return apiClient.post('accounts/update-password', { old_password, new_password })
  },

  toggleAdminSharing: async () => {
    return apiClient.post<{ admin_data_sharing: boolean; admin_data_sharing_enabled_at: string | null; message: string }>('accounts/toggle-admin-sharing')
  },
}
