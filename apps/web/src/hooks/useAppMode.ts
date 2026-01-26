/**
 * Hook to detect application mode (server vs client)
 *
 * By default, the app runs in CLIENT mode (VITE_SERVER_MODE not set).
 *
 * In CLIENT mode (default):
 * - No login/signup pages
 * - No admin section
 * - No landing page (redirects to dashboard)
 * - Export configuration available
 * - Sync status monitoring
 *
 * In SERVER mode (VITE_SERVER_MODE=true):
 * - Full authentication flow
 * - Admin section
 * - Landing page
 * - No export configuration
 */

export type AppMode = 'server' | 'client'

export interface AppModeInfo {
  mode: AppMode
  isClientMode: boolean
  isServerMode: boolean
}

// Window.__ENV__ is declared globally in vite-env.d.ts

/**
 * Get VITE_SERVER_MODE from runtime env (window.__ENV__) or build-time env
 * Runtime env takes precedence for Docker deployments
 */
function getServerModeValue(): string {
  // Check runtime env first (Docker deployments via env.js)
  if (typeof window !== 'undefined' && window.__ENV__?.VITE_SERVER_MODE) {
    return window.__ENV__.VITE_SERVER_MODE
  }
  // Fallback to build-time env (local development)
  return import.meta.env.VITE_SERVER_MODE || 'false'
}

export function useAppMode(): AppModeInfo {
  // Client mode is the default (SERVER_MODE not set or false)
  const mode: AppMode = getServerModeValue() === 'true' ? 'server' : 'client'

  return {
    mode,
    isClientMode: mode === 'client',
    isServerMode: mode === 'server',
  }
}

/**
 * Get app mode without hook (for use outside React components)
 */
export function getAppMode(): AppMode {
  return getServerModeValue() === 'true' ? 'server' : 'client'
}

export function isClientMode(): boolean {
  return getServerModeValue() !== 'true'
}

export function isServerMode(): boolean {
  return getServerModeValue() === 'true'
}
