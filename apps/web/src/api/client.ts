import axios, { AxiosError, AxiosInstance } from 'axios'
import type { APIResponse } from '@/types/api'
import { logger, isDebugEnabled } from '@/utils/logger'
import { usePdlStore } from '@/stores/pdlStore'

// Runtime environment from env.js (generated at container startup)
// Falls back to build-time env or default
declare global {
  interface Window {
    __ENV__?: {
      VITE_API_BASE_URL?: string
      VITE_BACKEND_URL?: string
    }
  }
}

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
          const isLoginPage = window.location.pathname === '/login'
          const isAuthCheck = error.config?.url?.includes('accounts/me')

          if (!isLoginPage && !isAuthCheck) {
            // Session expired during normal use, redirect to login
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
