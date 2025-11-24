import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'

interface PermissionRouteProps {
  children: React.ReactNode
  resource: string
}

/**
 * Route wrapper that checks if user has permission for a specific resource
 * Redirects to /forbidden if user lacks permission
 */
export default function PermissionRoute({ children, resource }: PermissionRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { hasPermission } = usePermissions()

  // Wait for both authentication and user data to load
  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Chargement...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!hasPermission(resource)) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}
