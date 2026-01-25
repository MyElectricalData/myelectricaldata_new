import { apiClient } from './client'

// Type d'offre tarifaire (auto-découvert depuis le backend via OfferRegistry)
export interface OfferType {
  code: string  // BASE, HC_HP, TEMPO, EJP, SEASONAL, HC_NUIT_WEEKEND, WEEKEND
  name: string  // Nom affiché
  description: string
  icon: string  // Icône Lucide (zap, clock, palette, etc.)
  color: string  // Couleur hex (#3B82F6, etc.)
  required_price_fields: string[]
  optional_price_fields: string[]
  display_order: number
}

export interface EnergyProvider {
  id: string
  name: string
  logo_url?: string
  website?: string
  scraper_urls?: string[]
  active_offers_count?: number
  last_update?: string
  has_scraper?: boolean
  not_in_database?: boolean  // True if provider exists only as scraper, not in DB
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface EnergyOffer {
  id: string
  provider_id: string
  name: string
  offer_type: string
  description?: string
  subscription_price: number
  base_price?: number
  hc_price?: number
  hp_price?: number
  // Weekend pricing
  base_price_weekend?: number
  hc_price_weekend?: number
  hp_price_weekend?: number
  tempo_blue_hc?: number
  tempo_blue_hp?: number
  tempo_white_hc?: number
  tempo_white_hp?: number
  tempo_red_hc?: number
  tempo_red_hp?: number
  ejp_normal?: number
  ejp_peak?: number
  // Seasonal pricing (Enercoop Flexi WATT 2 saisons)
  hc_price_winter?: number
  hp_price_winter?: number
  hc_price_summer?: number
  hp_price_summer?: number
  // Peak day pricing (Enercoop Flexi WATT 2 saisons Pointe)
  peak_day_price?: number
  hc_schedules?: Record<string, string>
  power_kva?: number
  price_updated_at?: string
  // Validity period for tariff history
  valid_from?: string
  valid_to?: string
  // Link to offer page
  offer_url?: string
  created_at?: string
  is_active?: boolean
}

// Power variant interface for new multi-power format
export interface PowerVariant {
  power_kva: number  // 3, 6, 9, 12, 15, 18, 24, 30, 36
  subscription_price: number  // Prix abonnement pour cette puissance
  // Prix kWh spécifiques à cette puissance
  pricing_data?: {
    // BASE
    base_price?: number
    // HC/HP
    hc_price?: number
    hp_price?: number
    // TEMPO
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    // EJP
    ejp_normal?: number
    ejp_peak?: number
    // SEASONAL / ZEN_FLEX
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    // Jours de pointe
    peak_day_price?: number
    // Weekend
    base_price_weekend?: number
  }
}

export interface ContributionData {
  contribution_type: 'NEW_PROVIDER' | 'NEW_OFFER' | 'UPDATE_OFFER'
  provider_name?: string
  provider_website?: string
  existing_provider_id?: string
  existing_offer_id?: string
  offer_name: string
  offer_type: string
  description?: string
  // NEW FORMAT: Array of power variants (one contribution = multiple powers)
  power_variants?: PowerVariant[]
  // Prix kWh communs à toutes les variantes de puissance
  pricing_data?: {
    subscription_price?: number  // Used only in legacy format
    base_price?: number
    hc_price?: number
    hp_price?: number
    // Weekend pricing
    base_price_weekend?: number
    hc_price_weekend?: number
    hp_price_weekend?: number
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    ejp_normal?: number
    ejp_peak?: number
    // Seasonal pricing
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    // Peak day pricing
    peak_day_price?: number
  }
  hc_schedules?: Record<string, string>
  power_kva?: number // LEGACY: Power in kVA (use power_variants for new contributions)
  price_sheet_url: string // REQUIRED: Lien vers la fiche des prix
  screenshot_url?: string // OPTIONAL: Screenshot de la fiche des prix
  valid_from: string // REQUIRED: Date de mise en service de l'offre (ISO format)
}

export interface ContributionMessage {
  id: string
  message_type: 'info_request' | 'contributor_response'
  content: string
  is_from_admin: boolean
  sender_email: string
  created_at: string
}

export interface Contribution {
  id: string
  contribution_type: 'NEW_PROVIDER' | 'NEW_OFFER' | 'UPDATE_OFFER'
  status: 'pending' | 'approved' | 'rejected'
  // Provider info
  provider_name?: string
  provider_website?: string
  existing_provider_id?: string
  existing_provider_name?: string
  // Offer info
  offer_name: string
  offer_type: string
  description?: string
  power_kva?: number  // Legacy field
  // Pricing
  power_variants?: PowerVariant[]  // New format: array of power variants
  pricing_data?: {
    subscription_price?: number
    base_price?: number
    hc_price?: number
    hp_price?: number
    base_price_weekend?: number
    hc_price_weekend?: number
    hp_price_weekend?: number
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    ejp_normal?: number
    ejp_peak?: number
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    peak_day_price?: number
  }
  hc_schedules?: Record<string, string>
  // Documentation
  price_sheet_url?: string
  screenshot_url?: string
  valid_from?: string  // Date de mise en service de l'offre
  // Timestamps
  created_at: string
  reviewed_at?: string
  review_comment?: string
  messages?: ContributionMessage[]
}

export interface OfferChange {
  offer_name: string
  offer_type: string
  power_kva?: number
  old_price?: number
  new_price: number
  change_type: 'new' | 'update' | 'deactivate'
  subscription_price?: number
}

export interface RefreshPreview {
  provider: string
  new_offers: OfferChange[]
  updated_offers: OfferChange[]
  deactivated_offers: OfferChange[]
  total_changes: number
  last_update?: string
  used_fallback?: boolean
  fallback_reason?: string
}

export interface SyncStatus {
  sync_in_progress: boolean
  provider: string | null
  started_at: string | null
  current_step: string | null
  steps: string[]
  progress: number
}

export const energyApi = {
  // Public endpoints

  // Récupère les types d'offres disponibles (auto-discovery depuis OfferRegistry)
  getOfferTypes: async () => {
    return apiClient.get<OfferType[]>('energy/offer-types')
  },

  getProviders: async () => {
    return apiClient.get<EnergyProvider[]>('energy/providers')
  },

  // Admin endpoint - includes providers with scrapers not yet in DB
  getProvidersWithScrapers: async () => {
    return apiClient.get<{ providers: EnergyProvider[], total: number }>('admin/providers', { include_missing_scrapers: true })
  },

  // Get list of available scrapers
  getAvailableScrapers: async () => {
    return apiClient.get<{ scrapers: string[], total: number }>('admin/scrapers')
  },

  getOffers: async (providerId?: string) => {
    return apiClient.get<EnergyOffer[]>('energy/offers', providerId ? { provider_id: providerId } : {})
  },

  // User endpoints
  submitContribution: async (data: ContributionData) => {
    return apiClient.post('energy/contribute', data)
  },

  updateContribution: async (contributionId: string, data: ContributionData) => {
    return apiClient.put(`energy/contributions/${contributionId}`, data)
  },

  getMyContributions: async () => {
    return apiClient.get<Contribution[]>('energy/contributions')
  },

  getUnreadContributionsCount: async () => {
    return apiClient.get<{ unread_count: number }>('energy/contributions/unread-count')
  },

  replyToContribution: async (contributionId: string, message: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/reply`, { message })
  },

  deleteContribution: async (contributionId: string) => {
    return apiClient.delete(`energy/contributions/${contributionId}`)
  },

  // Admin endpoints
  getContributionStats: async () => {
    return apiClient.get('energy/contributions/stats')
  },

  getPendingContributions: async () => {
    return apiClient.get('energy/contributions/pending')
  },

  approveContribution: async (contributionId: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/approve`)
  },

  rejectContribution: async (contributionId: string, reason?: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/reject`, { reason })
  },

  requestContributionInfo: async (contributionId: string, message: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/request-info`, { message })
  },

  getContributionMessages: async (contributionId: string) => {
    return apiClient.get(`energy/contributions/${contributionId}/messages`)
  },

  bulkApproveContributions: async (ids: string[]) => {
    return apiClient.post('energy/contributions/bulk-approve', { contribution_ids: ids })
  },

  bulkRejectContributions: async (ids: string[], reason: string) => {
    return apiClient.post('energy/contributions/bulk-reject', { contribution_ids: ids, reason })
  },

  // Admin - Manage offers
  updateOffer: async (offerId: string, data: Partial<EnergyOffer>) => {
    return apiClient.put(`energy/offers/${offerId}`, data)
  },

  deleteOffer: async (offerId: string) => {
    return apiClient.delete(`energy/offers/${offerId}`)
  },

  deleteProvider: async (providerId: string) => {
    return apiClient.delete(`energy/providers/${providerId}`)
  },

  updateProvider: async (providerId: string, data: Partial<EnergyProvider>) => {
    return apiClient.put(`energy/providers/${providerId}`, data)
  },

  // Preview and refresh offers
  previewRefresh: async (provider?: string) => {
    const params = provider ? { provider } : {}
    return apiClient.get('admin/offers/preview', params)
  },

  refreshOffers: async (provider?: string) => {
    // Provider is passed as query parameter, not body
    const url = provider ? `admin/offers/refresh?provider=${encodeURIComponent(provider)}` : 'admin/offers/refresh'
    return apiClient.post(url)
  },

  purgeProviderOffers: async (provider: string) => {
    return apiClient.delete('admin/offers/purge', { provider })
  },

  // Get sync status
  getSyncStatus: async () => {
    return apiClient.get<SyncStatus>('admin/offers/sync-status')
  },
}
