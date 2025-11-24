import axios, { AxiosError, AxiosInstance } from 'axios'
import type { APIResponse } from '@/types/api'
import { logger, isDebugEnabled } from '@/utils/logger'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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
      // Force HTTP adapter to prevent browser from upgrading to HTTPS
      adapter: 'xhr',
    })

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('access_token')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
      // Debug: log the full URL being called
      if (isDebugEnabled()) {
        logger.log('[API Client] Request:', config.method?.toUpperCase(), (config.baseURL || '') + (config.url || ''))
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

  async delete<T>(url: string, params?: Record<string, unknown>): Promise<APIResponse<T>> {
    const response = await this.client.delete<APIResponse<T>>(url, { params })
    return response.data
  }
}

export const apiClient = new APIClient()
