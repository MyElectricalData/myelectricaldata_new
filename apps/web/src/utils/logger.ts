/**
 * Custom logger that respects user debug_mode setting
 * Only logs to console if user has debug_mode enabled or if VITE_DEBUG is true
 */

/**
 * Update debug mode setting (should be called when user data is fetched)
 */
export function setDebugMode(enabled: boolean) {
  try {
    localStorage.setItem('debug_mode', enabled.toString())
  } catch (error) {
    // Ignore localStorage errors
  }
}

/**
 * Check if debug mode is enabled (checks dynamically each time)
 */
export function isDebugEnabled(): boolean {
  // Always enable if VITE_DEBUG is true
  const envDebug = import.meta.env.VITE_DEBUG === 'true'

  // Check localStorage for user debug setting (dynamically)
  let userDebugMode = false
  try {
    const storedDebugMode = localStorage.getItem('debug_mode')
    if (storedDebugMode) {
      userDebugMode = storedDebugMode === 'true'
    }
  } catch (error) {
    // Ignore localStorage errors
  }

  return envDebug || userDebugMode
}

/**
 * Custom logger object that only logs when debug is enabled
 */
export const logger = {
  log(...args: any[]) {
    if (isDebugEnabled()) {
      console.log(...args)
    }
  },

  debug(...args: any[]) {
    if (isDebugEnabled()) {
      console.debug(...args)
    }
  },

  info(...args: any[]) {
    if (isDebugEnabled()) {
      console.info(...args)
    }
  },

  warn(...args: any[]) {
    if (isDebugEnabled()) {
      console.warn(...args)
    }
  },

  error(...args: any[]) {
    // Always log errors
    console.error(...args)
  },
}

export default logger
