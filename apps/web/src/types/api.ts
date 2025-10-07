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
  role?: Role
}

export interface ClientCredentials {
  client_id: string
  client_secret: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}

export interface PDL {
  id: string
  usage_point_id: string
  name?: string
  created_at: string
  display_order?: number
  subscribed_power?: number
  offpeak_hours?: Record<string, string>
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
