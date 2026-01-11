import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { adminApi } from '@/api/admin'
import { usePermissions } from './usePermissions'
import type { PDL } from '@/types/api'

/**
 * Extended PDL type with owner info for shared PDLs (admin feature)
 */
export interface SharedPDL extends PDL {
  owner_id?: string
  owner_email?: string
  isShared?: boolean
}

interface UseAllPdlsOptions {
  /** Short staleTime for pages that need fresh data (e.g., after changing selected_offer_id) */
  staleTime?: number
}

interface UseAllPdlsReturn {
  /** All PDLs (user's own + shared PDLs for admins) */
  allPdls: SharedPDL[]
  /** Only user's own PDLs */
  userPdls: PDL[]
  /** Only shared PDLs (admin only) */
  sharedPdls: SharedPDL[]
  /** Loading state for user PDLs */
  isUserPdlsLoading: boolean
  /** Loading state for shared PDLs (always false for non-admins) */
  isSharedPdlsLoading: boolean
  /** Combined loading state */
  isLoading: boolean
  /** Error from user PDLs query */
  userPdlsError: Error | null
  /** Find a PDL by usage_point_id in allPdls */
  findPdl: (usagePointId: string) => SharedPDL | undefined
}

/**
 * Hook to fetch and merge user PDLs with shared PDLs (for admins).
 *
 * This hook centralizes PDL fetching logic to avoid duplication between
 * PageHeader and pages like Simulator that need access to shared PDL data.
 *
 * For non-admins, only returns user's own PDLs.
 * For admins, merges user PDLs with shared PDLs from users who enabled data sharing.
 */
export function useAllPdls(options: UseAllPdlsOptions = {}): UseAllPdlsReturn {
  const { staleTime = 30 * 1000 } = options // Default 30s like Dashboard
  const { isAdmin } = usePermissions()

  // Fetch user's own PDLs
  const {
    data: userPdlsResponse,
    isLoading: isUserPdlsLoading,
    error: userPdlsError,
  } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
    staleTime,
  })

  // Fetch shared PDLs (admin only)
  const { data: sharedPdlsResponse, isLoading: isSharedPdlsLoading } = useQuery({
    queryKey: ['admin-shared-pdls'],
    queryFn: async () => {
      const response = await adminApi.getAllSharedPdls()
      if (response.success && (response.data as { pdls: SharedPDL[] })?.pdls) {
        return (response.data as { pdls: SharedPDL[] }).pdls
      }
      return []
    },
    enabled: isAdmin(),
    staleTime: 60000, // Cache shared PDLs for 1 minute
  })

  const userPdls: PDL[] = useMemo(
    () => (Array.isArray(userPdlsResponse) ? userPdlsResponse : []),
    [userPdlsResponse]
  )
  const sharedPdls: SharedPDL[] = useMemo(
    () => (Array.isArray(sharedPdlsResponse) ? sharedPdlsResponse : []),
    [sharedPdlsResponse]
  )

  // Merge user PDLs with shared PDLs, marking shared ones
  const allPdls: SharedPDL[] = useMemo(() => {
    const userPdlIds = new Set(userPdls.map((p) => p.usage_point_id))
    const markedSharedPdls = sharedPdls
      .filter((p) => !userPdlIds.has(p.usage_point_id)) // Exclude PDLs the user already owns
      .map((p) => ({ ...p, isShared: true }))
    return [...userPdls, ...markedSharedPdls]
  }, [userPdls, sharedPdls])

  // Helper to find a PDL by usage_point_id
  const findPdl = useMemo(() => {
    return (usagePointId: string): SharedPDL | undefined => {
      return allPdls.find((p) => p.usage_point_id === usagePointId)
    }
  }, [allPdls])

  return {
    allPdls,
    userPdls,
    sharedPdls,
    isUserPdlsLoading,
    isSharedPdlsLoading: isAdmin() ? isSharedPdlsLoading : false,
    isLoading: isUserPdlsLoading || (isAdmin() && isSharedPdlsLoading),
    userPdlsError: userPdlsError as Error | null,
    findPdl,
  }
}
