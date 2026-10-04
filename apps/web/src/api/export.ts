/**
 * Export API client for Client Mode
 *
 * Handles CRUD operations for export configurations (Home Assistant, MQTT, VictoriaMetrics)
 */

import { apiClient } from './client'

export type ExportType = 'home_assistant' | 'mqtt' | 'victoriametrics'

export interface HomeAssistantConfig {
  // MQTT Discovery mode
  mqtt_broker?: string
  mqtt_port?: number
  mqtt_username?: string
  mqtt_password?: string
  mqtt_use_tls?: boolean
  entity_prefix?: string
  discovery_prefix?: string
  // WebSocket API mode (Energy Dashboard statistics)
  ha_url?: string
  ha_token?: string
  statistic_id_prefix?: string
  // Energy Dashboard import settings
  sync_delay_ms?: number
  chunk_size?: number
  incremental_import?: boolean
  // Activation indépendante MQTT / Energy Dashboard
  mqtt_enabled?: boolean
  energy_enabled?: boolean
  // Energy Dashboard scheduling (indépendant du MQTT)
  energy_interval_minutes?: number | null
}

export interface MQTTConfig {
  broker: string
  port?: number
  username?: string
  password?: string
  use_tls?: boolean
  topic_prefix?: string
  qos?: number
  retain?: boolean
}

export interface VictoriaMetricsConfig {
  url: string
  database: string
  username?: string
  password?: string
}

export type ExportConfigData = HomeAssistantConfig | MQTTConfig | VictoriaMetricsConfig

export interface ExportConfig {
  id: string
  name: string
  export_type: ExportType
  config?: ExportConfigData
  usage_point_ids?: string[] | null
  is_enabled: boolean
  export_consumption: boolean
  export_production: boolean
  export_detailed: boolean
  export_interval_minutes?: number | null
  next_export_at?: string | null
  last_export_at?: string | null
  last_export_status?: string | null
  last_export_error?: string | null
  export_count: number
}

export interface ExportConfigCreate {
  name: string
  export_type: ExportType
  config: ExportConfigData
  usage_point_ids?: string[] | null
  is_enabled?: boolean
  export_consumption?: boolean
  export_production?: boolean
  export_detailed?: boolean
  export_interval_minutes?: number | null
}

export interface ExportConfigUpdate {
  name?: string
  config?: ExportConfigData
  usage_point_ids?: string[] | null
  is_enabled?: boolean
  export_consumption?: boolean
  export_production?: boolean
  export_detailed?: boolean
  export_interval_minutes?: number | null
}

export interface ExportConfigListResponse {
  configs: ExportConfig[]
  count: number
}

export interface ExportConfigCreateResponse {
  id: string
  name: string
  export_type: string
  is_enabled: boolean
  message: string
}

export interface ExportTestResponse {
  success: boolean
  message: string
}

export interface ExportRunResponse {
  message: string
  status: string
}

export interface ExportMetric {
  // Communs
  category: string
  pdl?: string | null

  // Pour MQTT
  topic?: string
  value?: unknown
  retained?: boolean

  // Pour VictoriaMetrics
  name?: string
  timestamp?: string
  tags?: Record<string, string>

  // Pour Home Assistant
  entity?: string
  state?: unknown
  attributes?: Record<string, unknown>

  // Nouveaux champs pour HA Discovery (msg_type = config, state, attributes)
  msg_type?: 'config' | 'state' | 'attributes'
  unit?: string
  device_class?: string
  icon?: string
  device?: string
  raw_config?: Record<string, unknown>
}

export interface ExportMetricsData {
  success: boolean
  message: string
  metrics: ExportMetric[]
  errors: string[]
  // Infos de connexion (optionnel selon le type)
  broker?: string
  url?: string
  topic_prefix?: string
  entity_prefix?: string
  database?: string
}

// Note: ExportMetricsResponse n'est plus nécessaire car le backend
// retourne directement ExportMetricsData dans le champ data de APIResponse

// Home Assistant Statistics API (Energy Dashboard)
export interface HAStatisticsListResponse {
  success: boolean
  message: string
  statistic_ids: string[]
  details?: Array<{
    statistic_id: string
    source?: string
    unit_of_measurement?: string
  }>
}

export interface HAStatisticsClearResponse {
  success: boolean
  message: string
  cleared_count?: number
  statistic_ids?: string[]
}

export interface HAStatisticsImportResponse {
  success: boolean
  message: string
  consumption: number
  cost: number
  production: number
  errors: string[]
}

export interface HAImportProgressEvent {
  step: number
  total_steps: number
  percent: number
  message: string
  consumption: number
  cost: number
  production: number
}

export interface ExportRunProgressEvent {
  step: number
  total_steps: number
  percent: number
  message: string
  status: string
  consumption: number
  production: number
  tempo: number
  ecowatt: number
  linky_card: number
}

export interface ExportRunEDProgressEvent {
  step: number
  total_steps: number
  percent: number
  message: string
  ed_consumption: number
  ed_cost: number
  ed_production: number
}

export interface ExportRunCompleteEvent {
  success: boolean
  message: string
  consumption: number
  production: number
  tempo: number
  ecowatt: number
  linky_card: number
  energy_dashboard?: {
    success: boolean
    consumption: number
    cost: number
    production: number
  }
  errors?: string[] | null
}

export const exportApi = {
  /**
   * List all export configurations
   */
  listConfigs: () => {
    return apiClient.get<ExportConfigListResponse>('/export/configs')
  },

  /**
   * Get a specific export configuration with full details
   */
  getConfig: (configId: string) => {
    return apiClient.get<ExportConfig>(`/export/configs/${configId}`)
  },

  /**
   * Create a new export configuration
   */
  createConfig: (data: ExportConfigCreate) => {
    return apiClient.post<ExportConfigCreateResponse>('/export/configs', data)
  },

  /**
   * Update an export configuration
   */
  updateConfig: (configId: string, data: ExportConfigUpdate) => {
    return apiClient.put<ExportConfigCreateResponse>(`/export/configs/${configId}`, data)
  },

  /**
   * Delete an export configuration
   */
  deleteConfig: (configId: string) => {
    return apiClient.delete<{ message: string }>(`/export/configs/${configId}`)
  },

  /**
   * Test an export configuration connection
   */
  testConfig: (configId: string) => {
    return apiClient.post<ExportTestResponse>(`/export/configs/${configId}/test`)
  },

  /**
   * Manually run an export
   */
  runExport: (configId: string) => {
    return apiClient.post<ExportRunResponse>(`/export/configs/${configId}/run`)
  },

  /**
   * Run export with SSE progress streaming
   */
  runExportWithProgress: (
    configId: string,
    onProgress: (event: ExportRunProgressEvent) => void,
    onComplete: (result: ExportRunCompleteEvent) => void,
    onError: (error: string) => void,
    onEDProgress?: (event: ExportRunEDProgressEvent) => void,
  ): EventSource => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
    const url = `${baseUrl}/export/configs/${configId}/run/stream`

    const eventSource = new EventSource(url)

    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data) as ExportRunProgressEvent
        onProgress(data)
      } catch (err) {
        console.error('Failed to parse progress event:', err)
      }
    })

    eventSource.addEventListener('energy_dashboard_progress', (event) => {
      try {
        const data = JSON.parse(event.data) as ExportRunEDProgressEvent
        if (onEDProgress) onEDProgress(data)
      } catch (err) {
        console.error('Failed to parse energy dashboard progress event:', err)
      }
    })

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data) as ExportRunCompleteEvent
        onComplete(data)
        eventSource.close()
      } catch (err) {
        console.error('Failed to parse complete event:', err)
        onError('Erreur lors de la lecture du résultat')
        eventSource.close()
      }
    })

    eventSource.addEventListener('error', (event) => {
      if (event instanceof MessageEvent && event.data) {
        try {
          const data = JSON.parse(event.data) as { message: string }
          onError(data.message)
        } catch {
          onError('Erreur de connexion')
        }
      } else {
        onError('Connexion perdue')
      }
      eventSource.close()
    })

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return
      onError('Erreur de connexion au serveur')
      eventSource.close()
    }

    return eventSource
  },

  /**
   * Read metrics from export destination
   */
  readMetrics: (configId: string) => {
    return apiClient.get<ExportMetricsData>(`/export/configs/${configId}/metrics`)
  },

  // Home Assistant Statistics API (Energy Dashboard)

  /**
   * List Home Assistant statistics matching the configured prefix
   */
  listHAStatistics: (configId: string) => {
    return apiClient.get<HAStatisticsListResponse>(`/export/configs/${configId}/ha-statistics`)
  },

  /**
   * Clear all Home Assistant statistics matching the configured prefix
   */
  clearHAStatistics: (configId: string) => {
    return apiClient.post<HAStatisticsClearResponse>(`/export/configs/${configId}/ha-statistics/clear`)
  },

  /**
   * Import consumption/production statistics to Home Assistant Energy Dashboard
   */
  importHAStatistics: (configId: string, clearFirst: boolean = true, incremental: boolean = false) => {
    return apiClient.post<HAStatisticsImportResponse>(
      `/export/configs/${configId}/ha-statistics/import`,
      {},
      { params: { clear_first: clearFirst, incremental } }
    )
  },

  /**
   * Import HA statistics with SSE progress streaming
   * Returns an EventSource that emits progress events
   *
   * @param configId - Export configuration ID
   * @param clearFirst - Clear existing statistics before import
   * @param syncDelayMs - Delay in ms between imports to let HA ingest data (default 10s)
   * @param chunkSize - Number of statistics records per WebSocket message (default 500)
   * @param incremental - If true, only import new data since last import (faster)
   * @param onProgress - Callback for progress events
   * @param onComplete - Callback when import completes
   * @param onError - Callback for errors
   */
  importHAStatisticsWithProgress: (
    configId: string,
    clearFirst: boolean = true,
    syncDelayMs: number = 500,
    chunkSize: number = 2000,
    incremental: boolean = false,
    onProgress: (event: HAImportProgressEvent) => void,
    onComplete: (result: HAStatisticsImportResponse) => void,
    onError: (error: string) => void
  ): EventSource => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
    const url = `${baseUrl}/export/configs/${configId}/ha-statistics/import/stream?clear_first=${clearFirst}&sync_delay_ms=${syncDelayMs}&chunk_size=${chunkSize}&incremental=${incremental}`

    const eventSource = new EventSource(url)

    eventSource.addEventListener('progress', (event) => {
      try {
        const data = JSON.parse(event.data) as HAImportProgressEvent
        onProgress(data)
      } catch (err) {
        console.error('Failed to parse progress event:', err)
      }
    })

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data) as HAStatisticsImportResponse
        onComplete(data)
        eventSource.close()
      } catch (err) {
        console.error('Failed to parse complete event:', err)
        onError('Erreur lors de la lecture du résultat')
        eventSource.close()
      }
    })

    eventSource.addEventListener('error', (event) => {
      // Check if it's an SSE error event with data
      if (event instanceof MessageEvent && event.data) {
        try {
          const data = JSON.parse(event.data) as { message: string }
          onError(data.message)
        } catch {
          onError('Erreur de connexion')
        }
      } else {
        onError('Connexion perdue')
      }
      eventSource.close()
    })

    eventSource.onerror = () => {
      // Generic connection error
      if (eventSource.readyState === EventSource.CLOSED) {
        // Connection was closed normally, ignore
        return
      }
      onError('Erreur de connexion au serveur')
      eventSource.close()
    }

    return eventSource
  },
}

export default exportApi
