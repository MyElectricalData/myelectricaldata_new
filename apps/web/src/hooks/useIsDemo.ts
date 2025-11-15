import { useAuth } from './useAuth'

/**
 * Hook to check if the current user is a demo account
 */
export function useIsDemo(): boolean {
  const { user } = useAuth()

  // Check if user email matches demo account
  return user?.email === 'demo@myelectricaldata.fr'
}
