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
  tempo_blue_hc?: number
  tempo_blue_hp?: number
  tempo_white_hc?: number
  tempo_white_hp?: number
  tempo_red_hc?: number
  tempo_red_hp?: number
  ejp_normal?: number
  ejp_peak?: number
  hc_schedules?: Record<string, string>
  price_updated_at?: string
  created_at?: string
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
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    ejp_normal?: number
    ejp_peak?: number
  }
  hc_schedules?: Record<string, string>
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
}
