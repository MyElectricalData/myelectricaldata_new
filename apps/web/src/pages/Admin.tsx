import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi } from '@/api/admin'
import { Users, Activity, FileText, Zap, Calendar, CheckCircle, XCircle } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'

export default function Admin() {
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const { hasPermission } = usePermissions()

  const { data: statsResponse } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getGlobalStats(),
    refetchInterval: 30000,
  })

  const stats = statsResponse?.success ? (statsResponse.data as any) : null

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
        <h1 className="text-3xl font-bold mb-2">Tableau de bord Administration</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Vue d'ensemble et statistiques de la plateforme
        </p>
      </div>

      {/* Admin Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {hasPermission('users') && (
          <Link
            to="/admin/users"
            className="card hover:shadow-lg transition-shadow border-2 border-blue-200 dark:border-blue-800"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="text-blue-600 dark:text-blue-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Utilisateurs</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Gérer les quotas
                </p>
              </div>
            </div>
          </Link>
        )}

        {hasPermission('users') && (
          <Link
            to="/admin/add-pdl"
            className="card hover:shadow-lg transition-shadow border-2 border-amber-200 dark:border-amber-800"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Activity className="text-amber-600 dark:text-amber-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Ajouter PDL</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sans consentement
                </p>
              </div>
            </div>
          </Link>
        )}

        {hasPermission('tempo') && (
          <Link
            to="/admin/tempo"
            className="card hover:shadow-lg transition-shadow border-2 border-purple-200 dark:border-purple-800"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Calendar className="text-purple-600 dark:text-purple-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">TEMPO</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Cache RTE
                </p>
              </div>
            </div>
          </Link>
        )}

        {hasPermission('contributions') && (
          <Link
            to="/admin/contributions"
            className="card hover:shadow-lg transition-shadow border-2 border-primary-200 dark:border-primary-800"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <FileText className="text-primary-600 dark:text-primary-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Contributions</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Valider les offres
                </p>
              </div>
            </div>
          </Link>
        )}

        {hasPermission('offers') && (
          <Link
            to="/admin/offers"
            className="card hover:shadow-lg transition-shadow border-2 border-green-200 dark:border-green-800"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Zap className="text-green-600 dark:text-green-400" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Offres</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Éditer/Supprimer
                </p>
              </div>
            </div>
          </Link>
        )}
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

    </div>
  )
}
