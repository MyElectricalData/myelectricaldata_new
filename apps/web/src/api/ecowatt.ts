import { apiClient } from './client'
import type { APIResponse } from '@/types/api'

export interface EcoWattSignal {
  id: number
  periode: string
  dvalue: number
  message?: string
  values: number[]
  hdebut: number
  hfin: number
  generation_datetime: string
  created_at?: string
  updated_at?: string
}

export interface EcoWattStatistics {
  year: number
  total_days: number
  green_days: number
  orange_days: number
  red_days: number
  percentage_green: number
  percentage_orange: number
  percentage_red: number
}

export const ecowattApi = {
  async getCurrent(): Promise<APIResponse<EcoWattSignal>> {
    try {
      return await apiClient.get<EcoWattSignal>('ecowatt/current')
    } catch (error) {
      console.error('Error fetching current EcoWatt signal:', error)
      return {
        success: false,
        data: undefined,
        error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération du signal EcoWatt' },
        timestamp: new Date().toISOString()
      }
    }
  },

  async getForecast(days: number = 4): Promise<APIResponse<EcoWattSignal[]>> {
    try {
      return await apiClient.get<EcoWattSignal[]>(`ecowatt/forecast?days=${days}`)
    } catch (error) {
      console.error('Error fetching EcoWatt forecast:', error)
      return {
        success: false,
        data: undefined,
        error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération des prévisions EcoWatt' },
        timestamp: new Date().toISOString()
      }
    }
  },

  async getHistory(startDate: string, endDate: string): Promise<APIResponse<EcoWattSignal[]>> {
    try {
      return await apiClient.get<EcoWattSignal[]>(`ecowatt/history?start_date=${startDate}&end_date=${endDate}`)
    } catch (error) {
      console.error('Error fetching EcoWatt history:', error)
      return {
        success: false,
        data: undefined,
        error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération de l\'historique EcoWatt' },
        timestamp: new Date().toISOString()
      }
    }
  },

  async getStatistics(year?: number): Promise<APIResponse<EcoWattStatistics>> {
    try {
      const params = year ? `?year=${year}` : ''
      return await apiClient.get<EcoWattStatistics>(`ecowatt/statistics${params}`)
    } catch (error) {
      console.error('Error fetching EcoWatt statistics:', error)
      return {
        success: false,
        data: undefined,
        error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération des statistiques EcoWatt' },
        timestamp: new Date().toISOString()
      }
    }
  },

  async refreshCache(): Promise<APIResponse<{ message: string; updated_count: number }>> {
    try {
      return await apiClient.post<{ message: string; updated_count: number }>('ecowatt/refresh')
    } catch (error: any) {
      console.error('Error refreshing EcoWatt cache:', error)

      // Preserve the error information for permission checking
      const errorResponse: APIResponse<{ message: string; updated_count: number }> = {
        success: false,
        data: undefined,
        error: {
          code: error?.response?.status === 403 ? 'PERMISSION_DENIED' : 'FETCH_ERROR',
          message: error?.response?.data?.error?.message || error?.message || 'Erreur lors de la mise à jour du cache EcoWatt'
        },
        timestamp: new Date().toISOString()
      }

      // Attach the original error for detailed checking
      if (error?.response?.status) {
        (errorResponse as any).statusCode = error.response.status
      }

      return errorResponse
    }
  },

  async getRefreshStatus(): Promise<APIResponse<{ can_refresh: boolean; last_refresh?: string; time_remaining_seconds?: number; message: string }>> {
    try {
      return await apiClient.get<{ can_refresh: boolean; last_refresh?: string; time_remaining_seconds?: number; message: string }>('ecowatt/refresh/status')
    } catch (error) {
      console.error('Error fetching refresh status:', error)
      return {
        success: false,
        data: undefined,
        error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération du statut' },
        timestamp: new Date().toISOString()
      }
    }
  }
}