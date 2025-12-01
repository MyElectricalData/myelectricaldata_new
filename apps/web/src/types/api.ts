// API Types matching backend schemas

export interface APIResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ErrorDetail
  timestamp: string
}

export interface ErrorDetail {
  code: string
  message: string
  field?: string
}

export interface Role {
  id: string
  name: string
  display_name: string
  permissions?: Permission[]
}

export interface Permission {
  id: string
  name: string
  display_name: string
  description?: string
  resource: string
}

export interface RoleWithPermissions extends Role {
  description?: string
  is_system: boolean
  permissions: Permission[]
}

export interface User {
  id: string
  email: string
  client_id: string
  is_active: boolean
  created_at: string
  is_admin?: boolean
  debug_mode?: boolean
  role?: Role
  email_verified?: boolean
  pdl_count?: number
  usage_stats?: {
    cached_requests: number
    cached_limit: number
    no_cache_requests: number
    no_cache_limit: number
  }
}

export interface ClientCredentials {
  client_id: string
  client_secret: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

// Pricing option types for electricity tariffs
export type PricingOption = 'BASE' | 'HC_HP' | 'TEMPO' | 'EJP' | 'WEEKEND' | 'SEASONAL'

export interface PDL {
  id: string
  usage_point_id: string
  name?: string
  created_at: string
  display_order?: number
  subscribed_power?: number
  offpeak_hours?: string[] | Record<string, string> // Array format or legacy object format
  pricing_option?: PricingOption // Tariff type: BASE, HC_HP, TEMPO, EJP, HC_WEEKEND
  has_consumption?: boolean
  has_production?: boolean
  is_active?: boolean
  oldest_available_data_date?: string // ISO date string (YYYY-MM-DD) - Oldest date where Enedis has data
  activation_date?: string // ISO date string (YYYY-MM-DD) - Contract activation date (from Enedis)
  linked_production_pdl_id?: string // Link to production PDL for combined graphs
  selected_offer_id?: string // Selected energy offer ID
}

export interface CacheDeleteResponse {
  success: boolean
  deleted_keys: number
  message: string
}

// Request types
export interface UserCreate {
  email: string
  password: string
  turnstile_token?: string
}

export interface AdminUserCreate {
  email: string
  role_id?: string
}

export interface AdminUserStats {
  total_users: number
  active_users: number
  verified_users: number
  admin_count: number
  users_this_month: number
}

export interface UserLogin {
  email: string
  password: string
}

export interface PDLCreate {
  usage_point_id: string
  name?: string
}

export interface OAuthAuthorizeParams {
  usage_point_id: string
}

export interface OAuthCallbackParams extends Record<string, unknown> {
  code: string
  state: string
}
