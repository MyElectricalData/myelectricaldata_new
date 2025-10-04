import axios, { AxiosError, AxiosInstance } from 'axios'
import type { APIResponse } from '@/types/api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const DEBUG = import.meta.env.VITE_DEBUG === 'true'

// Force HTTPS for production
if (typeof window !== 'undefined' && window.location.protocol === 'https:' && API_BASE_URL.startsWith('http://')) {
  console.error('WARNING: API_BASE_URL is HTTP but page is HTTPS. This will cause Mixed Content errors.')
}

class APIClient {
  private client: AxiosInstance

  constructor() {
    // Debug mode: print configuration
    if (DEBUG) {
      console.log('=' .repeat(60))
      console.log('🔧 Frontend API Configuration (DEBUG MODE)')
      console.log('=' .repeat(60))
      console.log('API Base URL:', API_BASE_URL)
      console.log('Turnstile Site Key:', import.meta.env.VITE_TURNSTILE_SITE_KEY || 'Not configured')
      console.log('=' .repeat(60))
    }

    // Ensure HTTPS in production
    let finalBaseURL = API_BASE_URL.startsWith('/') && typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}${API_BASE_URL}`
      : API_BASE_URL

    // Ensure baseURL ends with / for proper URL joining
    if (!finalBaseURL.endsWith('/')) {
      finalBaseURL += '/'
    }

    this.client = axios.create({
      baseURL: finalBaseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('access_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      // Debug: log the full URL being called
      if (DEBUG) {
        console.log('[API Client] Request URL:', (config.baseURL || '') + (config.url || ''))
        console.log('[API Client] Base URL:', config.baseURL)
        console.log('[API Client] Relative URL:', config.url)
      }
      return config
    })

    // Response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<APIResponse>) => {
        if (error.response?.status === 401) {
          // Token expired, clear storage and redirect to login
          localStorage.removeItem('access_token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  async get<T>(url: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const DEBUG = import.meta.env.VITE_DEBUG === 'true'
    if (DEBUG) {
      console.log('[API Client GET] About to call:', this.client.defaults.baseURL + url)
      console.log('[API Client GET] Axios config:', {
        baseURL: this.client.defaults.baseURL,
        url: url,
        fullUrl: this.client.defaults.baseURL + url
      })
    }
    const response = await this.client.get<APIResponse<T>>(url, { params })
    return response.data
  }

  async post<T>(url: string, data?: unknown): Promise<APIResponse<T>> {
    const response = await this.client.post<APIResponse<T>>(url, data)
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

  async delete<T>(url: string): Promise<APIResponse<T>> {
    const response = await this.client.delete<APIResponse<T>>(url)
    return response.data
  }
}

export const apiClient = new APIClient()
