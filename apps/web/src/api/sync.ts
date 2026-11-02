/**
 * Sync API client for Client Mode
 *
 * Handles synchronization with the remote MyElectricalData gateway.
 */

import { apiClient } from './client'

interface SyncPdlResult {
  usage_point_id: string
  action: 'created' | 'updated'
}

interface SyncStatus {
  usage_point_id: string
  sync_types: Record<string, {
    status: string
    last_sync_at: string | null
    next_sync_at: string | null
    oldest_data_date: string | null
    newest_data_date: string | null
    total_records: number
    error_message: string | null
  }>
}

interface EnergySyncResult {
  success: boolean
  data: {
    providers: {
      created: number
      updated: number
      unchanged: number
      errors: string[]
    }
    offers: {
      created: number
      updated: number
      unchanged: number
      deactivated: number
      errors: string[]
    }
  }
  message: string
}

interface SyncDataResult {
  created: number
  updated: number
  errors: string[]
}

// Note: apiClient.post<T> returns APIResponse<T>, so T should be the inner data type

/** PDL partagé avec l'admin à la passerelle, et son état de choix dans le client (MED-112) */
export interface SharedPdlChoice {
  usage_point_id: string
  name?: string | null
  owner_email?: string | null
  has_consumption: boolean
  has_production: boolean
  is_active: boolean
  /** synchronisé dans ce client */
  selected: boolean
  /** déjà un PDL du compte : rien à choisir */
  own: boolean
}

export const syncApi = {
  /**
   * PDL partagés avec l'admin à la passerelle (MED-112). 403 si le compte n'est pas admin.
   */
  listSharedPdls: () =>
    apiClient.get<SharedPdlChoice[]>('sync/shared-pdls'),

  /**
   * Ajoute un PDL partagé à la synchro du client (sa synchro démarre en arrière-plan)
   */
  selectSharedPdl: (usagePointId: string) =>
    apiClient.post<{ usage_point_id: string; selected: boolean }>(`sync/shared-pdls/${usagePointId}`),

  /**
   * Retire un PDL partagé de la synchro : ses données locales sont supprimées
   */
  unselectSharedPdl: (usagePointId: string) =>
    apiClient.delete<{ usage_point_id: string; selected: boolean }>(`sync/shared-pdls/${usagePointId}`),

  /**
   * Sync PDL list from remote gateway
   */
  syncPdlList: () =>
    apiClient.post<SyncPdlResult[]>('sync/pdl-list'),

  /**
   * Trigger full sync for all PDLs (data)
   */
  triggerSync: () =>
    apiClient.post<{ status: string; message: string }>('sync/trigger'),

  /**
   * Trigger sync for a specific PDL
   */
  triggerSyncPdl: (usagePointId: string) =>
    apiClient.post<{ status: string; usage_point_id: string; message: string }>(`sync/trigger/${usagePointId}`),

  /**
   * Get sync status for all PDLs
   */
  getStatus: () =>
    apiClient.get<{ pdls: SyncStatus[]; count: number }>('sync/status'),

  /**
   * Get sync status for a specific PDL
   */
  getStatusPdl: (usagePointId: string) =>
    apiClient.get<SyncStatus>(`sync/status/${usagePointId}`),

  /**
   * Sync energy providers and offers from remote gateway (background)
   */
  syncEnergyOffers: () =>
    apiClient.post<{ status: string; message: string }>('sync/energy-offers'),

  /**
   * Sync energy providers and offers from remote gateway (immediate/blocking)
   */
  syncEnergyOffersNow: () =>
    apiClient.post<EnergySyncResult>('sync/energy-offers/now'),

  /**
   * Sync EcoWatt data from remote gateway (background)
   */
  syncEcowatt: () =>
    apiClient.post<{ status: string; message: string }>('sync/ecowatt'),

  /**
   * Sync EcoWatt data from remote gateway (immediate/blocking)
   */
  syncEcowattNow: () =>
    apiClient.post<SyncDataResult>('sync/ecowatt/now'),

  /**
   * Sync Tempo calendar data from remote gateway (background)
   */
  syncTempo: () =>
    apiClient.post<{ status: string; message: string }>('sync/tempo'),

  /**
   * Sync Tempo calendar data from remote gateway (immediate/blocking)
   */
  syncTempoNow: () =>
    apiClient.post<SyncDataResult>('sync/tempo/now'),

  /**
   * Get Tempo sync status (last sync time)
   */
  getTempoStatus: () =>
    apiClient.get<{ last_sync_at: string | null; record_count: number }>('sync/tempo/status'),

  /**
   * Get EcoWatt sync status (last sync time)
   */
  getEcowattStatus: () =>
    apiClient.get<{ last_sync_at: string | null; record_count: number }>('sync/ecowatt/status'),

  /**
   * Sync French national consumption data from remote gateway (background)
   */
  syncConsumptionFrance: () =>
    apiClient.post<{ status: string; message: string }>('sync/consumption-france'),

  /**
   * Sync French national consumption data from remote gateway (immediate/blocking)
   */
  syncConsumptionFranceNow: () =>
    apiClient.post<SyncDataResult>('sync/consumption-france/now'),

  /**
   * Get Consumption France sync status (last sync time)
   */
  getConsumptionFranceStatus: () =>
    apiClient.get<{ last_sync_at: string | null; record_count: number }>('sync/consumption-france/status'),

  /**
   * Sync renewable generation forecast from remote gateway (background)
   */
  syncGenerationForecast: () =>
    apiClient.post<{ status: string; message: string }>('sync/generation-forecast'),

  /**
   * Sync renewable generation forecast from remote gateway (immediate/blocking)
   */
  syncGenerationForecastNow: () =>
    apiClient.post<SyncDataResult>('sync/generation-forecast/now'),

  /**
   * Get Generation Forecast sync status (last sync time)
   */
  getGenerationForecastStatus: () =>
    apiClient.get<{ last_sync_at: string | null; record_count: number }>('sync/generation-forecast/status'),
}
