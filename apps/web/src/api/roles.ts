import { apiClient } from './client'
import type { RoleWithPermissions, Permission } from '../types/api'

export interface CreateRoleRequest {
  name: string
  display_name: string
  description?: string
  permission_ids?: string[]
}

export interface UpdateRoleRequest {
  display_name?: string
  description?: string
  permission_ids?: string[]
}

export const rolesApi = {
  // Get all roles with permissions
  getRoles: async () => {
    return apiClient.get<RoleWithPermissions[]>('admin/roles')
  },

  // Get all available permissions
  getPermissions: async () => {
    return apiClient.get<Record<string, Permission[]>>('admin/roles/permissions')
  },

  // Create a new role
  createRole: async (data: CreateRoleRequest) => {
    return apiClient.post<RoleWithPermissions>('admin/roles', data)
  },

  // Update a role
  updateRole: async (roleId: string, data: UpdateRoleRequest) => {
    return apiClient.patch<RoleWithPermissions>(`admin/roles/${roleId}`, data)
  },

  // Delete a role
  deleteRole: async (roleId: string) => {
    return apiClient.delete<{ message: string }>(`admin/roles/${roleId}`)
  },

  // Update role permissions
  updateRolePermissions: async (roleId: string, permissionIds: string[]) => {
    return apiClient.put(`admin/roles/${roleId}/permissions`, { permission_ids: permissionIds })
  },

  // Update user's role
  updateUserRole: async (userId: string, roleId: string) => {
    return apiClient.put(`admin/roles/users/${userId}/role`, { role_id: roleId })
  },
}
