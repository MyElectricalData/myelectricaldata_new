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
    return apiClient.get<User>('accounts/me')
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
}
