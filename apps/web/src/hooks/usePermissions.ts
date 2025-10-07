import { useAuth } from './useAuth'

export interface Permission {
  resource: string
  actions: string[]
}

export const usePermissions = () => {
  const { user } = useAuth()

  const hasPermission = (resource: string): boolean => {
    // Admin has all permissions
    if (user?.is_admin) {
      return true
    }

    // Check role name for quick access checks
    const roleName = user?.role?.name || 'visitor'

    // Visitor has no admin permissions
    if (roleName === 'visitor') {
      return false
    }

    // Check if user has permission for this resource based on role permissions
    if (user?.role?.permissions) {
      return user.role.permissions.some(perm => perm.resource === resource)
    }

    return false
  }

  const hasAction = (resource: string, action: 'view' | 'edit' | 'delete' | 'review'): boolean => {
    // Admin has all permissions
    if (user?.is_admin) {
      return true
    }

    // Check role name for quick access checks
    const roleName = user?.role?.name || 'visitor'

    // Visitor has no admin permissions
    if (roleName === 'visitor') {
      return false
    }

    // Check if user has specific action permission for this resource
    if (user?.role?.permissions) {
      const permissionName = `admin.${resource}.${action}`
      return user.role.permissions.some(perm => perm.name === permissionName)
    }

    return false
  }

  const canAccessAdmin = (): boolean => {
    const roleName = user?.role?.name || 'visitor'
    return roleName === 'admin' || roleName === 'moderator'
  }

  const isAdmin = (): boolean => {
    return user?.is_admin || user?.role?.name === 'admin'
  }

  const isModerator = (): boolean => {
    return user?.role?.name === 'moderator'
  }

  const isVisitor = (): boolean => {
    const roleName = user?.role?.name || 'visitor'
    return roleName === 'visitor'
  }

  return {
    hasPermission,
    hasAction,
    canAccessAdmin,
    isAdmin,
    isModerator,
    isVisitor,
  }
}
