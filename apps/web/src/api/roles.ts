import { apiClient } from './client'
import type { RoleWithPermissions, Permission } from '../types/api'

export const rolesApi = {
  // Get all roles with permissions
  getRoles: async () => {
    return apiClient.get<RoleWithPermissions[]>('admin/roles/')
  },

  // Get all available permissions
  getPermissions: async () => {
    return apiClient.get<Record<string, Permission[]>>('admin/roles/permissions')
  },

  // Update role permissions
  updateRolePermissions: async (roleId: string, permissionIds: string[]) => {
    return apiClient.put(`admin/roles/${roleId}/permissions`, permissionIds)
  },

  // Update user's role
  updateUserRole: async (userId: string, roleId: string) => {
    return apiClient.put(`admin/roles/users/${userId}/role`, { role_id: roleId })
  },
}
