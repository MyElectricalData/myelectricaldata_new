import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi } from '@/api/roles'
import { Shield, CheckCircle, XCircle, Save } from 'lucide-react'
import type { RoleWithPermissions, Permission } from '@/types/api'

export default function AdminRoles() {
  const queryClient = useQueryClient()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())

  const { data: rolesResponse, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.getRoles(),
  })

  const { data: permissionsResponse, isLoading: permissionsLoading } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => rolesApi.getPermissions(),
  })

  const updatePermissionsMutation = useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: string, permissionIds: string[] }) =>
      rolesApi.updateRolePermissions(roleId, permissionIds),
    onSuccess: () => {
      setNotification({ type: 'success', message: 'Permissions mises à jour' })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditingRole(null)
      setTimeout(() => setNotification(null), 5000)
    },
    onError: () => {
      setNotification({ type: 'error', message: 'Erreur lors de la mise à jour' })
      setTimeout(() => setNotification(null), 5000)
    }
  })

  const roles = rolesResponse?.success && Array.isArray(rolesResponse.data)
    ? rolesResponse.data as RoleWithPermissions[]
    : []

  const permissionsByResource = permissionsResponse?.success && typeof permissionsResponse.data === 'object'
    ? permissionsResponse.data as Record<string, Permission[]>
    : {}

  const startEditing = (role: RoleWithPermissions) => {
    if (role.name === 'admin') {
      setNotification({ type: 'error', message: 'Le rôle Admin ne peut pas être modifié' })
      setTimeout(() => setNotification(null), 3000)
      return
    }
    setEditingRole(role.id)
    setSelectedPermissions(new Set(role.permissions.map(p => p.id)))
  }

  const togglePermission = (permissionId: string, permissionName: string, resource: string) => {
    const newSet = new Set(selectedPermissions)

    // Find all permissions for this resource
    const resourcePermissions = permissionsByResource[resource] || []
    const viewPermId = resourcePermissions.find(p => p.name.endsWith('.view'))?.id
    const editPermId = resourcePermissions.find(p => p.name.endsWith('.edit'))?.id
    const deletePermId = resourcePermissions.find(p => p.name.endsWith('.delete'))?.id

    if (newSet.has(permissionId)) {
      // Uncheck logic
      newSet.delete(permissionId)

      // If unchecking View, also uncheck Edit and Delete
      if (permissionName.endsWith('.view')) {
        if (editPermId) newSet.delete(editPermId)
        if (deletePermId) newSet.delete(deletePermId)
      }
      // If unchecking Edit, also uncheck Delete
      else if (permissionName.endsWith('.edit')) {
        if (deletePermId) newSet.delete(deletePermId)
      }
    } else {
      // Check logic
      newSet.add(permissionId)

      // If checking Edit, also check View
      if (permissionName.endsWith('.edit') && viewPermId) {
        newSet.add(viewPermId)
      }
      // If checking Delete, also check View and Edit
      else if (permissionName.endsWith('.delete')) {
        if (viewPermId) newSet.add(viewPermId)
        if (editPermId) newSet.add(editPermId)
      }
    }

    setSelectedPermissions(newSet)
  }

  const isPermissionDisabled = (permissionName: string, resource: string) => {
    const resourcePermissions = permissionsByResource[resource] || []
    const editPermId = resourcePermissions.find(p => p.name.endsWith('.edit'))?.id
    const deletePermId = resourcePermissions.find(p => p.name.endsWith('.delete'))?.id

    // Disable View if Edit is selected
    if (permissionName.endsWith('.view') && editPermId && selectedPermissions.has(editPermId)) {
      return true
    }
    // Disable View and Edit if Delete is selected
    if ((permissionName.endsWith('.view') || permissionName.endsWith('.edit')) && deletePermId && selectedPermissions.has(deletePermId)) {
      return true
    }
    return false
  }

  const savePermissions = () => {
    if (editingRole) {
      updatePermissionsMutation.mutate({
        roleId: editingRole,
        permissionIds: Array.from(selectedPermissions)
      })
    }
  }

  const getResourceName = (resource: string) => {
    const names: Record<string, string> = {
      'admin_dashboard': 'Tableau de bord',
      'users': 'Utilisateurs',
      'tempo': 'Tempo',
      'contributions': 'Contributions',
      'offers': 'Offres',
      'roles': 'Rôles'
    }
    return names[resource] || resource
  }

  const getRoleBadgeColor = (roleName: string) => {
    switch (roleName) {
      case 'admin':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
      case 'moderator':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="w-full">
      <div className="space-y-6 w-full">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Shield className="text-primary-600 dark:text-primary-400" size={28} />
            Gestion des rôles et permissions
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configurez les permissions pour chaque rôle (le rôle Admin ne peut pas être modifié)
          </p>
        </div>

      {/* Notification */}
      {notification && (
        <div className={`p-3 rounded-lg flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400" size={20} />
          )}
          <p className={`text-sm flex-1 ${notification.type === 'success'
            ? 'text-green-800 dark:text-green-200'
            : 'text-red-800 dark:text-red-200'
          }`}>
            {notification.message}
          </p>
          <button onClick={() => setNotification(null)} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
      )}

      {rolesLoading || permissionsLoading ? (
        <div className="card p-4">
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield size={20} className="text-primary-600 dark:text-primary-400" />
                  <div>
                    <h3 className="font-semibold">{role.display_name}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs mt-1 ${getRoleBadgeColor(role.name)}`}>
                      {role.name}
                    </span>
                  </div>
                </div>
                {role.name !== 'admin' && (
                  <button
                    onClick={() => startEditing(role)}
                    className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Modifier
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {role.description}
              </p>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                {role.name === 'admin' ? (
                  <div className="text-xs text-gray-600 dark:text-gray-400 italic">
                    <p>✓ Accès complet à toutes les fonctionnalités</p>
                    <p className="mt-1 text-xs">Les permissions ne sont pas listées car l'administrateur a tous les droits.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Permissions ({role.permissions.length})
                    </p>
                    <div className="space-y-1">
                      {role.permissions.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">Aucune permission</p>
                      ) : (
                        role.permissions.map((perm) => (
                          <div key={perm.id} className="text-xs flex items-start gap-2">
                            <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                            <span>{perm.display_name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingRole && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setEditingRole(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header - Fixed */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold">
                Modifier les permissions - {roles.find(r => r.id === editingRole)?.display_name}
              </h3>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(permissionsByResource).map(([resource, permissions]) => {
                  // Sort permissions by order: View, Edit, Delete
                  const sortedPermissions = [...permissions].sort((a, b) => {
                    const getOrder = (name: string) => {
                      if (name.endsWith('.view')) return 0
                      if (name.endsWith('.edit')) return 1
                      if (name.endsWith('.delete')) return 2
                      // Special cases (e.g., review, dashboard.view)
                      if (name.includes('.review')) return 1.5
                      return 3
                    }
                    return getOrder(a.name) - getOrder(b.name)
                  })

                  return (
                    <div key={resource} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <h4 className="font-medium text-sm mb-3 text-primary-600 dark:text-primary-400">
                        {getResourceName(resource)}
                      </h4>
                      <div className="space-y-2">
                        {sortedPermissions.map((permission) => {
                          const disabled = isPermissionDisabled(permission.name, resource)
                          return (
                            <label
                              key={permission.id}
                              className={`flex items-start gap-3 p-2 rounded ${
                                disabled
                                  ? 'opacity-60 cursor-not-allowed'
                                  : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPermissions.has(permission.id)}
                                onChange={() => !disabled && togglePermission(permission.id, permission.name, resource)}
                                disabled={disabled}
                                className="mt-1 w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                              />
                              <div className="flex-1">
                                <div className="text-sm font-medium">{permission.display_name}</div>
                                {permission.description && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400">{permission.description}</div>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex gap-3">
                <button
                  onClick={savePermissions}
                  disabled={updatePermissionsMutation.isPending}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  Enregistrer
                </button>
                <button
                  onClick={() => setEditingRole(null)}
                  className="flex-1 btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  )
}
