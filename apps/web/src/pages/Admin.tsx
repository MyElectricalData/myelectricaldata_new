import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi } from '@/api/admin'
import { RefreshCw, Users, Activity, CheckCircle, XCircle, Copy, FileText } from 'lucide-react'

export default function Admin() {
  const queryClient = useQueryClient()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)

  const { data: usersResponse, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: statsResponse } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getGlobalStats(),
    refetchInterval: 30000,
  })

  const resetQuotaMutation = useMutation({
    mutationFn: (userId: string) => adminApi.resetUserQuota(userId),
    onSuccess: (response) => {
      if (response.success) {
        setNotification({
          type: 'success',
          message: `Quota réinitialisé avec succès`
        })
        queryClient.invalidateQueries({ queryKey: ['admin-users'] })
        setTimeout(() => setNotification(null), 5000)
      }
    },
    onError: () => {
      setNotification({
        type: 'error',
        message: 'Erreur lors de la réinitialisation du quota'
      })
      setTimeout(() => setNotification(null), 5000)
    }
  })

  const users = usersResponse?.success ? (usersResponse.data as any)?.users || [] : []
  const stats = statsResponse?.success ? (statsResponse.data as any) : null

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setNotification({
        type: 'success',
        message: `${label} copié dans le presse-papier`
      })
      setTimeout(() => setNotification(null), 3000)
    } catch (err) {
      setNotification({
        type: 'error',
        message: 'Erreur lors de la copie'
      })
      setTimeout(() => setNotification(null), 3000)
    }
  }

  return (
    <div className="space-y-8 w-full">
      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={24} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={24} />
          )}
          <div className="flex-1">
            <p className={notification.type === 'success'
              ? 'text-green-800 dark:text-green-200 font-medium'
              : 'text-red-800 dark:text-red-200 font-medium'
            }>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold mb-2">Administration</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestion des utilisateurs et statistiques de la plateforme
        </p>
      </div>

      {/* Admin Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/admin/contributions"
          className="card hover:shadow-lg transition-shadow border-2 border-primary-200 dark:border-primary-800"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <FileText className="text-primary-600 dark:text-primary-400" size={32} />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-1">Contributions communautaires</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Gérer les contributions des utilisateurs pour les offres d'énergie
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Global Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-blue-600 dark:text-blue-400" size={20} />
              <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400">Utilisateurs totaux</h3>
            </div>
            <p className="text-3xl font-bold">{stats.total_users}</p>
            <p className="text-sm text-gray-500 mt-1">{stats.active_users} vérifiés</p>
          </div>

          <div className="card border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-green-600 dark:text-green-400" size={20} />
              <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400">PDL totaux</h3>
            </div>
            <p className="text-3xl font-bold">{stats.total_pdls}</p>
          </div>

          <div className="card border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-purple-600 dark:text-purple-400" size={20} />
              <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400">Appels API (aujourd'hui)</h3>
            </div>
            <p className="text-3xl font-bold">{stats.today_api_calls.total}</p>
            <p className="text-sm text-gray-500 mt-1">
              {stats.today_api_calls.cached} avec cache, {stats.today_api_calls.no_cache} sans cache
            </p>
          </div>

          <div className="card border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-gray-600 dark:text-gray-400" size={20} />
              <h3 className="font-semibold text-sm text-gray-600 dark:text-gray-400">Date</h3>
            </div>
            <p className="text-xl font-bold">{stats.date}</p>
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Utilisateurs ({users.length})</h2>

        {usersLoading ? (
          <p className="text-gray-500">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500">Aucun utilisateur</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Email</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Client ID</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">PDL</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Cache</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Sans cache</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Statut</th>
                  <th className="text-center py-3 px-2 text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: any) => (
                  <tr key={user.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900">
                    <td className="py-3 px-2">
                      <div>
                        <p className="font-medium">{user.email}</p>
                        <p className="text-xs text-gray-500">
                          Créé le {new Date(user.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {user.client_id.slice(0, 20)}...
                        </code>
                        <button
                          onClick={() => copyToClipboard(user.client_id, 'Client ID')}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          title="Copier le Client ID"
                        >
                          <Copy size={14} className="text-gray-600 dark:text-gray-400" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">
                        {user.pdl_count}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="text-sm">
                        <p className="font-medium">{user.usage_stats.cached_requests}</p>
                        <p className="text-xs text-gray-500">/ {user.usage_stats.cached_limit}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="text-sm">
                        <p className="font-medium">{user.usage_stats.no_cache_requests}</p>
                        <p className="text-xs text-gray-500">/ {user.usage_stats.no_cache_limit}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {user.is_active ? (
                          <span className="inline-flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs">
                            Inactif
                          </span>
                        )}
                        {user.email_verified ? (
                          <span className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">
                            Vérifié
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                            Non vérifié
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <button
                        onClick={() => resetQuotaMutation.mutate(user.id)}
                        disabled={resetQuotaMutation.isPending}
                        className="btn btn-secondary text-sm flex items-center gap-1 mx-auto"
                        title="Réinitialiser le quota"
                      >
                        <RefreshCw size={14} />
                        Reset quota
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
