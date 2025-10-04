import { apiClient } from './client'
import type { OAuthCallbackParams } from '@/types/api'

export const oauthApi = {
  getAuthorizeUrl: async () => {
    return apiClient.get<{ authorize_url: string; description: string }>(
      'oauth/authorize'
    )
  },

  handleCallback: async (params: OAuthCallbackParams) => {
    return apiClient.get<{ message: string; usage_point_id: string; expires_at: string }>(
      'oauth/callback',
      params
    )
  },

  refreshToken: async (usagePointId: string) => {
    return apiClient.post<{ message: string; expires_at: string }>(
      `oauth/refresh/${usagePointId}`
    )
  },
}
