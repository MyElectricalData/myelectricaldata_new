import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types
export interface PDL {
  usage_point_id: string
  name?: string
  address?: string
  postal_code?: string
  city?: string
  subscribed_power?: string
  tariff_option?: string
  has_production: boolean
  linked_production_usage_point_id?: string
  contract_status?: string
  is_active?: boolean
}

export interface ConsumptionData {
  date: string
  daily_kwh: number
  hc_kwh?: number
  hp_kwh?: number
  max_power_kva?: number
}

export interface ProductionData {
  date: string
  daily_kwh: number
}

export interface SyncStatus {
  last_sync?: string
  last_success?: string
  last_error?: string
  consumption_last_date?: string
  production_last_date?: string
  sync_count: number
  error_count: number
}

export interface Status {
  status: string
  pdl_count: number
  last_sync?: string
  database: string
  integrations: Record<string, boolean>
}

export interface Exporter {
  name: string
  description: string
  version: string
  author: string
  enabled: boolean
  status: string
  last_error?: string
}

// Tempo types
export interface TempoDay {
  date: string
  color: 'BLUE' | 'WHITE' | 'RED'
  updated_at?: string
  rte_updated_date?: string
}

// EcoWatt types
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

// API Functions
export const getStatus = async (): Promise<Status> => {
  const { data } = await api.get('/status')
  return data
}

export const getPDLs = async (): Promise<PDL[]> => {
  const { data } = await api.get('/pdl')
  return data
}

export const getConsumption = async (
  pdl: string,
  startDate?: string,
  endDate?: string
): Promise<ConsumptionData[]> => {
  const params = new URLSearchParams()
  if (startDate) params.append('start', startDate)
  if (endDate) params.append('end', endDate)
  const { data } = await api.get(`/consumption/${pdl}/daily?${params}`)
  return data
}

export const getProduction = async (
  pdl: string,
  startDate?: string,
  endDate?: string
): Promise<ProductionData[]> => {
  const params = new URLSearchParams()
  if (startDate) params.append('start', startDate)
  if (endDate) params.append('end', endDate)
  const { data } = await api.get(`/production/${pdl}/daily?${params}`)
  return data
}

export const getSyncStatus = async (pdl: string): Promise<SyncStatus> => {
  const { data } = await api.get(`/pdl/${pdl}/sync-status`)
  return data
}

export const triggerSync = async (pdl?: string): Promise<void> => {
  if (pdl) {
    await api.post(`/sync/${pdl}`)
  } else {
    await api.post('/sync')
  }
}

export const getExporters = async (): Promise<Exporter[]> => {
  const { data } = await api.get('/exporters')
  return data
}

export const testExporter = async (name: string): Promise<{ success: boolean; error?: string }> => {
  const { data } = await api.post(`/exporters/${name}/test`)
  return data
}

export const reloadExporters = async (): Promise<{ added: string[]; removed: string[]; reloaded: string[] }> => {
  const { data } = await api.post('/exporters/reload')
  return data
}

// Tempo API functions
export const getTempoDays = async (startDate?: string, endDate?: string): Promise<TempoDay[]> => {
  const params = new URLSearchParams()
  if (startDate) params.append('start_date', startDate)
  if (endDate) params.append('end_date', endDate)
  const { data } = await api.get(`/tempo/days?${params}`)
  return Array.isArray(data) ? data : data.data || []
}

export const getTempoToday = async (): Promise<TempoDay | null> => {
  try {
    const { data } = await api.get('/tempo/today')
    return data
  } catch {
    return null
  }
}

// EcoWatt API functions
export const getEcoWattCurrent = async (): Promise<EcoWattSignal | null> => {
  try {
    const { data } = await api.get('/ecowatt/current')
    return data
  } catch {
    return null
  }
}

export const getEcoWattForecast = async (days: number = 4): Promise<EcoWattSignal[]> => {
  try {
    const { data } = await api.get(`/ecowatt/forecast?days=${days}`)
    return Array.isArray(data) ? data : data.data || []
  } catch {
    return []
  }
}

export const getEcoWattStatistics = async (year?: number): Promise<EcoWattStatistics | null> => {
  try {
    const params = year ? `?year=${year}` : ''
    const { data } = await api.get(`/ecowatt/statistics${params}`)
    return data
  } catch {
    return null
  }
}

export default api
