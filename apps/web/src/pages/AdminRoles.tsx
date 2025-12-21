import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { rolesApi } from '@/api/roles'
import type { CreateRoleRequest } from '@/api/roles'
import { Shield, CheckCircle, Save, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import type { RoleWithPermissions, Permission } from '@/types/api'

export default function AdminRoles() {
  const queryClient = useQueryClient()
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState<RoleWithPermissions | null>(null)
  const [newRole, setNewRole] = useState<CreateRoleRequest>({
    name: '',
    display_name: '',
    description: '',
    permission_ids: []
  })
  const [createPermissions, setCreatePermissions] = useState<Set<string>>(new Set())

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
      toast.success('Permissions mises à jour')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditingRole(null)
    },
    onError: () => {
      toast.error('Erreur lors de la mise à jour')
    }
  })

  const createRoleMutation = useMutation({
    mutationFn: (data: CreateRoleRequest) => rolesApi.createRole(data),
    onSuccess: () => {
      toast.success('Rôle créé avec succès')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setShowCreateModal(false)
      setNewRole({ name: '', display_name: '', description: '', permission_ids: [] })
      setCreatePermissions(new Set())
    },
    onError: (error: Error & { response?: { data?: { error?: { message?: string } } } }) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de la création du rôle'
      toast.error(message)
    }
  })

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) => rolesApi.deleteRole(roleId),
    onSuccess: () => {
      toast.success('Rôle supprimé avec succès')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setShowDeleteModal(null)
    },
    onError: (error: Error & { response?: { data?: { error?: { message?: string } } } }) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de la suppression du rôle'
      toast.error(message)
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
      toast.error('Le rôle Admin ne peut pas être modifié')
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

  const handleCreateRole = () => {
    createRoleMutation.mutate({
      ...newRole,
      permission_ids: Array.from(createPermissions)
    })
  }

  const getResourceName = (resource: string) => {
    const names: Record<string, string> = {
      'admin_dashboard': 'Tableau de bord',
      'users': 'Utilisateurs',
      'tempo': 'Tempo',
      'contributions': 'Contributions',
      'offers': 'Offres',
      'roles': 'Rôles',
      'logs': 'Logs'
    }
    return names[resource] || resource
  }

  const getRoleBadgeColor = (roleName: string, isSystem: boolean) => {
    if (isSystem) {
      switch (roleName) {
        case 'admin':
          return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
        case 'moderator':
          return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        default:
          return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
      }
    }
    return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  }

  const renderPermissionsGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(permissionsByResource).map(([resource, permissions]) => {
        const sortedPermissions = [...permissions].sort((a, b) => {
          const getOrder = (name: string) => {
            if (name.endsWith('.view')) return 0
            if (name.endsWith('.edit')) return 1
            if (name.endsWith('.delete')) return 2
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
  )

  const renderCreatePermissionsGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Object.entries(permissionsByResource).map(([resource, permissions]) => {
        const sortedPermissions = [...permissions].sort((a, b) => {
          const getOrder = (name: string) => {
            if (name.endsWith('.view')) return 0
            if (name.endsWith('.edit')) return 1
            if (name.endsWith('.delete')) return 2
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
              {sortedPermissions.map((permission) => (
                <label
                  key={permission.id}
                  className="flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50"
                >
                  <input
                    type="checkbox"
                    checked={createPermissions.has(permission.id)}
                    onChange={() => {
                      const newSet = new Set(createPermissions)
                      if (newSet.has(permission.id)) {
                        newSet.delete(permission.id)
                      } else {
                        newSet.add(permission.id)
                      }
                      setCreatePermissions(newSet)
                    }}
                    className="mt-1 w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{permission.display_name}</div>
                    {permission.description && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">{permission.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="w-full">
      <div className="space-y-6 w-full">
      {/* Create Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Créer un rôle
        </button>
      </div>

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
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${getRoleBadgeColor(role.name, role.is_system)}`}>
                        {role.name}
                      </span>
                      {role.is_system && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">(système)</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!role.is_system && (
                    <button
                      onClick={() => setShowDeleteModal(role)}
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 p-1"
                      title="Supprimer ce rôle"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {role.name !== 'admin' && (
                    <button
                      onClick={() => startEditing(role)}
                      className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      Modifier
                    </button>
                  )}
                </div>
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
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold">
                Modifier les permissions - {roles.find(r => r.id === editingRole)?.display_name}
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {renderPermissionsGrid()}
            </div>

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

      {/* Create Modal */}
      {showCreateModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Plus size={20} className="text-primary-600 dark:text-primary-400" />
                Créer un nouveau rôle
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Identifiant technique *
                  </label>
                  <input
                    type="text"
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    placeholder="ex: editor, reviewer..."
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Lettres minuscules, chiffres et _ uniquement</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nom d'affichage *
                  </label>
                  <input
                    type="text"
                    value={newRole.display_name}
                    onChange={(e) => setNewRole({ ...newRole, display_name: e.target.value })}
                    placeholder="ex: Éditeur, Relecteur..."
                    className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={newRole.description}
                  onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                  placeholder="Décrivez le rôle et ses responsabilités..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Permissions
                </h4>
                {renderCreatePermissionsGrid()}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex gap-3">
                <button
                  onClick={handleCreateRole}
                  disabled={createRoleMutation.isPending || !newRole.name || !newRole.display_name}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus size={16} />
                  {createRoleMutation.isPending ? 'Création...' : 'Créer le rôle'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewRole({ name: '', display_name: '', description: '', permission_ids: [] })
                    setCreatePermissions(new Set())
                  }}
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={() => setShowDeleteModal(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <AlertTriangle className="text-red-600 dark:text-red-400" size={24} />
                </div>
                <h3 className="text-lg font-semibold">Supprimer le rôle</h3>
              </div>

              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Êtes-vous sûr de vouloir supprimer le rôle <strong>"{showDeleteModal.display_name}"</strong> ?
              </p>

              <p className="text-sm text-red-600 dark:text-red-400 mb-6">
                Cette action est irréversible. Assurez-vous qu'aucun utilisateur n'utilise ce rôle avant de le supprimer.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => deleteRoleMutation.mutate(showDeleteModal.id)}
                  disabled={deleteRoleMutation.isPending}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {deleteRoleMutation.isPending ? 'Suppression...' : 'Supprimer'}
                </button>
                <button
                  onClick={() => setShowDeleteModal(null)}
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
