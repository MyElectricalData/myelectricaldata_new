import { apiClient } from './client'

export interface EnergyProvider {
  id: string
  name: string
  logo_url?: string
  website?: string
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
  created_at?: string
  is_active?: boolean
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
  pricing_data: {
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
    // Seasonal pricing
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    // Peak day pricing
    peak_day_price?: number
  }
  hc_schedules?: Record<string, string>
  power_kva?: number // Power in kVA (3, 6, 9, 12, 15, 18, 24, 30, 36)
  price_sheet_url: string // REQUIRED: Lien vers la fiche des prix
  screenshot_url?: string // OPTIONAL: Screenshot de la fiche des prix
}

export interface Contribution {
  id: string
  contribution_type: string
  status: 'pending' | 'approved' | 'rejected'
  offer_name: string
  offer_type: string
  created_at: string
  reviewed_at?: string
  review_comment?: string
}

export const energyApi = {
  // Public endpoints
  getProviders: async () => {
    return apiClient.get<EnergyProvider[]>('energy/providers')
  },

  getOffers: async (providerId?: string) => {
    return apiClient.get<EnergyOffer[]>('energy/offers', providerId ? { provider_id: providerId } : {})
  },

  // User endpoints
  submitContribution: async (data: ContributionData) => {
    return apiClient.post('energy/contribute', data)
  },

  getMyContributions: async () => {
    return apiClient.get<Contribution[]>('energy/contributions')
  },

  // Admin endpoints
  getPendingContributions: async () => {
    return apiClient.get('energy/contributions/pending')
  },

  approveContribution: async (contributionId: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/approve`)
  },

  rejectContribution: async (contributionId: string, reason?: string) => {
    return apiClient.post(`energy/contributions/${contributionId}/reject`, { reason })
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
}
