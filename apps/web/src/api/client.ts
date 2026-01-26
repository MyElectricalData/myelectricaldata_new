import axios, { AxiosError, AxiosInstance } from 'axios'
import type { APIResponse } from '@/types/api'
import { logger, isDebugEnabled } from '@/utils/logger'
import { usePdlStore } from '@/stores/pdlStore'
import { isClientMode } from '@/hooks/useAppMode'

// Window.__ENV__ is declared globally in vite-env.d.ts
const API_BASE_URL = window.__ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'

class APIClient {
  private client: AxiosInstance

  constructor() {
    // Use API_BASE_URL as-is (already contains protocol and port)
    let finalBaseURL = API_BASE_URL

    // Ensure baseURL ends with / for proper URL joining
    if (!finalBaseURL.endsWith('/')) {
      finalBaseURL += '/'
    }

    this.client = axios.create({
      baseURL: finalBaseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      // Enable credentials for httpOnly cookie authentication
      withCredentials: true,
      // Force HTTP adapter to prevent browser from upgrading to HTTPS
      adapter: 'xhr',
    })

    // Request interceptor for impersonation header and debugging
    // Note: Auth is now handled via httpOnly cookie (withCredentials: true)
    this.client.interceptors.request.use((config) => {
      // Add impersonation header if viewing another user's PDL (admin feature)
      const { impersonation } = usePdlStore.getState()
      if (impersonation?.ownerId) {
        config.headers['X-Impersonate-User-Id'] = impersonation.ownerId
      }

      // Debug: log the full URL being called
      if (isDebugEnabled()) {
        logger.log('[API Client] Request:', config.method?.toUpperCase(), (config.baseURL || '') + (config.url || ''))
        if (impersonation) {
          logger.log('[API Client] Impersonating user:', impersonation.ownerEmail)
        }
      }
      return config
    })

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<APIResponse>) => {
        if (error.response?.status === 401) {
          // Don't redirect if:
          // 1. Already on login page (would cause loop)
          // 2. Checking auth status (normal to get 401 if not logged in)
          // 3. Already trying to auto-login
          const isLoginPage = window.location.pathname === '/login'
          const isAuthCheck = error.config?.url?.includes('accounts/me')
          const isAutoLogin = error.config?.url?.includes('accounts/auto-login')

          // In client mode, try auto-login instead of redirecting
          if (isClientMode() && !isAuthCheck && !isAutoLogin) {
            try {
              // Attempt auto-login to refresh the session
              await this.client.post('accounts/auto-login')
              // Retry the original request
              if (error.config) {
                return this.client.request(error.config)
              }
            } catch (autoLoginError) {
              // Auto-login failed, log error but don't redirect
              // (in client mode, there's no login page to redirect to)
              if (isDebugEnabled()) {
                logger.log('[API Client] Auto-login failed:', autoLoginError)
              }
            }
          } else if (!isLoginPage && !isAuthCheck && !isAutoLogin) {
            // Server mode: Session expired during normal use, redirect to login
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const response = await this.client.get<APIResponse<T>>(url, { params })
    return response.data
  }

  async post<T>(url: string, data?: unknown, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const response = await this.client.post<APIResponse<T>>(url, data, { params })
    return response.data
  }

  async put<T>(url: string, data?: unknown): Promise<APIResponse<T>> {
    const response = await this.client.put<APIResponse<T>>(url, data)
    return response.data
  }

  async patch<T>(url: string, data?: unknown): Promise<APIResponse<T>> {
    const response = await this.client.patch<APIResponse<T>>(url, data)
    return response.data
  }

  async delete<T>(url: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const response = await this.client.delete<APIResponse<T>>(url, { params })
    return response.data
  }
}

export const apiClient = new APIClient()
