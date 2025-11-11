import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { rolesApi } from '@/api/roles'
import {
  RefreshCw, Users, CheckCircle, XCircle, Copy, Trash2, Shield, Bug, Database,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, Search, UserPlus, Key, Power,
  TrendingUp, UserCheck, Mail
} from 'lucide-react'
import type { Role, AdminUserStats } from '@/types/api'

type SortColumn = 'email' | 'created_at' | 'role' | 'pdl_count' | 'is_active'
type SortDirection = 'asc' | 'desc'

export default function AdminUsers() {
  const queryClient = useQueryClient()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [editingRole, setEditingRole] = useState<{userId: string, currentRoleId: string | null} | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createRoleId, setCreateRoleId] = useState<string>('')
  const [deleteConfirm, setDeleteConfirm] = useState<{userId: string, email: string} | null>(null)
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState<{userId: string, email: string} | null>(null)

  const { data: usersResponse, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
    refetchInterval: 30000,
  })

  const { data: statsResponse } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn: () => adminApi.getUserStats(),
    refetchInterval: 60000,
  })

  const { data: rolesResponse } = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.getRoles(),
  })

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const createUserMutation = useMutation({
    mutationFn: (data: { email: string, role_id?: string }) => adminApi.createUser(data),
    onSuccess: () => {
      showNotification('success', 'Utilisateur créé avec succès')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] })
      setShowCreateModal(false)
      setCreateEmail('')
      setCreateRoleId('')
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de la création'
      showNotification('error', message)
    }
  })

  const toggleStatusMutation = useMutation({
    mutationFn: (userId: string) => adminApi.toggleUserStatus(userId),
    onSuccess: () => {
      showNotification('success', 'Statut modifié')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] })
    },
    onError: () => showNotification('error', 'Erreur lors de la modification du statut')
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deleteUser(userId),
    onSuccess: () => {
      showNotification('success', 'Utilisateur supprimé')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] })
      setDeleteConfirm(null)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de la suppression'
      showNotification('error', message)
    }
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetUserPassword(userId),
    onSuccess: () => {
      showNotification('success', 'Mot de passe réinitialisé avec succès')
      setResetPasswordConfirm(null)
    },
    onError: () => showNotification('error', 'Erreur lors de la réinitialisation')
  })

  const resetQuotaMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetUserQuota(userId),
    onSuccess: () => {
      showNotification('success', 'Quota réinitialisé')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => showNotification('error', 'Erreur lors de la réinitialisation')
  })

  const clearCacheMutation = useMutation({
    mutationFn: (userId: string) => adminApi.clearUserCache(userId),
    onSuccess: (response) => {
      const data = response.data as any
      showNotification('success', `Cache vidé : ${data.deleted_keys} clés (${data.pdl_count} PDL)`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => showNotification('error', 'Erreur lors du vidage du cache')
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string, roleId: string }) =>
      rolesApi.updateUserRole(userId, roleId),
    onSuccess: () => {
      showNotification('success', 'Rôle mis à jour')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['admin-users-stats'] })
      setEditingRole(null)
    },
    onError: () => showNotification('error', 'Erreur lors de la mise à jour du rôle')
  })

  const toggleDebugMutation = useMutation({
    mutationFn: (userId: string) => adminApi.toggleUserDebugMode(userId),
    onSuccess: () => {
      showNotification('success', 'Mode debug modifié')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => showNotification('error', 'Erreur lors de la modification du mode debug')
  })

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showNotification('success', `${label} copié`)
    } catch {
      showNotification('error', 'Erreur lors de la copie')
    }
  }

  const users = usersResponse?.success && Array.isArray((usersResponse.data as any)?.users)
    ? (usersResponse.data as any).users
    : []

  const stats = statsResponse?.success && statsResponse.data
    ? statsResponse.data as AdminUserStats
    : null

  const roles = rolesResponse?.success && Array.isArray(rolesResponse.data)
    ? rolesResponse.data as Role[]
    : []

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

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown size={14} className="text-gray-400" />
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-primary-600 dark:text-primary-400" />
      : <ArrowDown size={14} className="text-primary-600 dark:text-primary-400" />
  }

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = [...users]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter((user: any) =>
        user.email.toLowerCase().includes(query) ||
        user.client_id.toLowerCase().includes(query)
      )
    }

    // Apply role filter
    if (filterRole !== 'all') {
      filtered = filtered.filter((user: any) => {
        const userRole = user.role?.name || 'visitor'
        return userRole === filterRole
      })
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') {
        filtered = filtered.filter((user: any) => user.is_active)
      } else if (filterStatus === 'inactive') {
        filtered = filtered.filter((user: any) => !user.is_active)
      } else if (filterStatus === 'verified') {
        filtered = filtered.filter((user: any) => user.email_verified)
      } else if (filterStatus === 'unverified') {
        filtered = filtered.filter((user: any) => !user.email_verified)
      }
    }

    // Apply sorting
    filtered.sort((a: any, b: any) => {
      let aValue: any
      let bValue: any

      switch (sortColumn) {
        case 'email':
          aValue = a.email.toLowerCase()
          bValue = b.email.toLowerCase()
          break
        case 'created_at':
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
          break
        case 'role':
          aValue = a.role?.display_name || 'Visiteur'
          bValue = b.role?.display_name || 'Visiteur'
          break
        case 'pdl_count':
          aValue = a.pdl_count
          bValue = b.pdl_count
          break
        case 'is_active':
          aValue = a.is_active ? 1 : 0
          bValue = b.is_active ? 1 : 0
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [users, filterRole, filterStatus, sortColumn, sortDirection, searchQuery])

  return (
    <div className="w-full">
      <div className="space-y-6 w-full">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Users className="text-primary-600 dark:text-primary-400" size={28} />
            Gestion des utilisateurs
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Gérez les utilisateurs, leurs quotas et leurs rôles
          </p>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total</p>
                  <p className="text-2xl font-bold">{stats.total_users}</p>
                </div>
                <Users className="text-primary-600 dark:text-primary-400" size={24} />
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Actifs</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active_users}</p>
                </div>
                <UserCheck className="text-green-600 dark:text-green-400" size={24} />
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Vérifiés</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.verified_users}</p>
                </div>
                <Mail className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Admins</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.admin_count}</p>
                </div>
                <Shield className="text-purple-600 dark:text-purple-400" size={24} />
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Ce mois</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.users_this_month}</p>
                </div>
                <TrendingUp className="text-orange-600 dark:text-orange-400" size={24} />
              </div>
            </div>
          </div>
        )}

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

      {/* Role Change Modal */}
      {editingRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingRole(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Changer le rôle</h3>
            <div className="space-y-2 mb-4">
              {roles.map((role: any) => (
                <button
                  key={role.id}
                  onClick={() => updateRoleMutation.mutate({ userId: editingRole.userId, roleId: role.id })}
                  className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                    role.id === editingRole.currentRoleId
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                  }`}
                >
                  <div className="font-medium">{role.display_name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{role.description}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => setEditingRole(null)}
              className="w-full btn btn-secondary"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <UserPlus size={20} />
              Créer un utilisateur
            </h3>
            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="input w-full"
                  placeholder="utilisateur@example.com"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rôle (optionnel)</label>
                <select
                  value={createRoleId}
                  onChange={(e) => setCreateRoleId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Visiteur (par défaut)</option>
                  {roles.map((role: any) => (
                    <option key={role.id} value={role.id}>{role.display_name}</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                L'utilisateur recevra un email d'activation pour définir son mot de passe.
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (createEmail.trim()) {
                    createUserMutation.mutate({
                      email: createEmail.trim(),
                      role_id: createRoleId || undefined
                    })
                  }
                }}
                disabled={!createEmail.trim() || createUserMutation.isPending}
                className="flex-1 btn btn-primary"
              >
                Créer
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setCreateEmail('')
                  setCreateRoleId('')
                }}
                className="flex-1 btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
              <Trash2 size={20} />
              Supprimer l'utilisateur
            </h3>
            <p className="text-sm mb-4">
              Êtes-vous sûr de vouloir supprimer l'utilisateur <strong>{deleteConfirm.email}</strong> ?
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 bg-red-50 dark:bg-red-900/20 p-3 rounded mb-4">
              Cette action est irréversible. Toutes les données de l'utilisateur seront définitivement supprimées.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteUserMutation.mutate(deleteConfirm.userId)}
                disabled={deleteUserMutation.isPending}
                className="flex-1 btn bg-red-600 hover:bg-red-700 text-white"
              >
                Supprimer
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Confirmation Modal */}
      {resetPasswordConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setResetPasswordConfirm(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Key size={20} />
              Réinitialiser le mot de passe
            </h3>
            <p className="text-sm mb-4">
              Réinitialiser le mot de passe de <strong>{resetPasswordConfirm.email}</strong> ?
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded mb-4">
              L'utilisateur recevra un email avec un lien pour réinitialiser son mot de passe.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => resetPasswordMutation.mutate(resetPasswordConfirm.userId)}
                disabled={resetPasswordMutation.isPending}
                className="flex-1 btn btn-primary"
              >
                Réinitialiser
              </button>
              <button
                onClick={() => setResetPasswordConfirm(null)}
                className="flex-1 btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Utilisateurs ({filteredAndSortedUsers.length}{filteredAndSortedUsers.length !== users.length && ` / ${users.length}`})
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary text-sm flex items-center gap-2"
          >
            <UserPlus size={16} />
            Créer un utilisateur
          </button>
        </div>

        {/* Search and Filters */}
        <div className="space-y-3 mb-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Rechercher par email ou client ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtres:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">Rôle:</label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="input text-xs py-1 px-2 w-auto"
              >
                <option value="all">Tous</option>
                <option value="admin">Admin</option>
                <option value="moderator">Modérateur</option>
                <option value="visitor">Visiteur</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">Statut:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input text-xs py-1 px-2 w-auto"
              >
                <option value="all">Tous</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
                <option value="verified">Email vérifié</option>
                <option value="unverified">Email non vérifié</option>
              </select>
            </div>

            {(filterRole !== 'all' || filterStatus !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setFilterRole('all')
                  setFilterStatus('all')
                  setSearchQuery('')
                }}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {usersLoading ? (
          <p className="text-sm text-gray-500">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun utilisateur</p>
        ) : filteredAndSortedUsers.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun utilisateur ne correspond aux filtres</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th
                    className="text-left py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('email')}
                  >
                    <div className="flex items-center gap-1">
                      Email
                      {getSortIcon('email')}
                    </div>
                  </th>
                  <th className="text-left py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400">Client ID</th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('role')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Rôle
                      {getSortIcon('role')}
                    </div>
                  </th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('pdl_count')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      PDL
                      {getSortIcon('pdl_count')}
                    </div>
                  </th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400">Cache</th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400">Sans</th>
                  <th
                    className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('is_active')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Statut
                      {getSortIcon('is_active')}
                    </div>
                  </th>
                  <th className="text-center py-2 px-2 text-xs font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedUsers.map((user: any) => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="py-2 px-2">
                      <div>
                        <p className="font-medium text-sm">{user.email}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(user.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </p>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                          {user.client_id.slice(0, 16)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(user.client_id, 'Client ID')}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                          title="Copier"
                        >
                          <Copy size={12} className="text-gray-600 dark:text-gray-400" />
                        </button>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button
                        onClick={() => setEditingRole({ userId: user.id, currentRoleId: user.role?.id || null })}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getRoleBadgeColor(user.role?.name || 'visitor')} hover:opacity-80 transition-opacity`}
                        title="Changer le rôle"
                      >
                        <Shield size={12} />
                        {user.role?.display_name || 'Visiteur'}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                        {user.pdl_count}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center text-xs">
                      <span className="font-medium">{user.usage_stats.cached_requests}</span>
                      <span className="text-gray-500">/{user.usage_stats.cached_limit}</span>
                    </td>
                    <td className="py-2 px-2 text-center text-xs">
                      <span className="font-medium">{user.usage_stats.no_cache_requests}</span>
                      <span className="text-gray-500">/{user.usage_stats.no_cache_limit}</span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                          user.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {user.is_active ? 'Actif' : 'Inactif'}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                          user.email_verified
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                        }`}>
                          {user.email_verified ? '✓' : '✗'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex gap-1 items-center justify-center flex-wrap">
                        <button
                          onClick={() => toggleStatusMutation.mutate(user.id)}
                          disabled={toggleStatusMutation.isPending}
                          className={`p-1.5 rounded transition-colors ${
                            user.is_active
                              ? 'hover:bg-red-50 dark:hover:bg-red-900/20'
                              : 'hover:bg-green-50 dark:hover:bg-green-900/20'
                          }`}
                          title={user.is_active ? "Désactiver" : "Activer"}
                        >
                          <Power size={14} className={user.is_active ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"} />
                        </button>
                        <button
                          onClick={() => toggleDebugMutation.mutate(user.id)}
                          disabled={toggleDebugMutation.isPending}
                          className={`p-1.5 rounded transition-colors ${
                            user.debug_mode
                              ? 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/40'
                              : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
                          }`}
                          title={user.debug_mode ? "Désactiver mode debug" : "Activer mode debug"}
                        >
                          <Bug size={14} className={user.debug_mode ? "text-orange-700 dark:text-orange-400" : "text-gray-600 dark:text-gray-400"} />
                        </button>
                        <button
                          onClick={() => resetQuotaMutation.mutate(user.id)}
                          disabled={resetQuotaMutation.isPending}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title="Reset quota"
                        >
                          <RefreshCw size={14} className="text-blue-600 dark:text-blue-400" />
                        </button>
                        <button
                          onClick={() => clearCacheMutation.mutate(user.id)}
                          disabled={clearCacheMutation.isPending}
                          className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                          title="Vider le cache de consommation"
                        >
                          <Database size={14} className="text-purple-600 dark:text-purple-400" />
                        </button>
                        <button
                          onClick={() => setResetPasswordConfirm({ userId: user.id, email: user.email })}
                          className="p-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded transition-colors"
                          title="Réinitialiser le mot de passe"
                        >
                          <Key size={14} className="text-yellow-600 dark:text-yellow-400" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ userId: user.id, email: user.email })}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Supprimer l'utilisateur"
                        >
                          <Trash2 size={14} className="text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
