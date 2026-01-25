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

export function useAppMode(): AppModeInfo {
  // Client mode is the default (SERVER_MODE not set or false)
  const mode: AppMode = import.meta.env.VITE_SERVER_MODE === 'true' ? 'server' : 'client'

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
  return import.meta.env.VITE_SERVER_MODE === 'true' ? 'server' : 'client'
}

export function isClientMode(): boolean {
  return import.meta.env.VITE_SERVER_MODE !== 'true'
}

export function isServerMode(): boolean {
  return import.meta.env.VITE_SERVER_MODE === 'true'
}
