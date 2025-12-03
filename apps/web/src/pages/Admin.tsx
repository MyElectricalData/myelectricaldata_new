import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Users, Activity, CheckCircle, XCircle, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Trash2, AlertTriangle } from 'lucide-react'
import { LoadingOverlay } from '@/components/LoadingOverlay'

type SortField = 'total' | 'cached' | 'no_cache'
type SortDirection = 'asc' | 'desc'

export default function Admin() {
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [showAllEndpoints, setShowAllEndpoints] = useState(false)
  const [sortField, setSortField] = useState<SortField>('total')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showClearCacheModal, setShowClearCacheModal] = useState(false)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, default to desc
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="opacity-40" />
    }
    return sortDirection === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />
  }

  const { data: statsResponse, isLoading, isError } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getGlobalStats(),
    refetchInterval: 30000,
  })

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const clearAllCacheMutation = useMutation({
    mutationFn: () => adminApi.clearAllCache(),
    onSuccess: (response) => {
      const data = response.data as any
      showNotification('success', `Cache vidé : ${data.deleted_keys} clés (${data.total_pdls} PDL)`)
      setShowClearCacheModal(false)
    },
    onError: () => {
      showNotification('error', 'Erreur lors du vidage du cache')
      setShowClearCacheModal(false)
    }
  })

  const stats = statsResponse?.success ? (statsResponse.data as any) : null

  return (
    <div className="w-full">
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

      {/* Clear All Cache Modal */}
      {showClearCacheModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowClearCacheModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Vider tout le cache ?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Cette action va <strong>supprimer tout le cache de consommation ET de production</strong> pour tous les utilisateurs et tous les PDL.
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Les données devront être récupérées à nouveau depuis Enedis lors des prochaines requêtes. Cette opération est <strong>irréversible</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowClearCacheModal(false)}
                disabled={clearAllCacheMutation.isPending}
                className="flex-1 btn btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={() => clearAllCacheMutation.mutate()}
                disabled={clearAllCacheMutation.isPending}
                className="flex-1 btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {clearAllCacheMutation.isPending ? 'Vidage...' : 'Vider le cache'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <LoadingOverlay dataType="admin" />
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="card border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <div className="flex items-center gap-3">
            <XCircle className="text-red-600 dark:text-red-400" size={24} />
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-200">Erreur de chargement</h3>
              <p className="text-sm text-red-700 dark:text-red-300">
                Impossible de charger les statistiques. Vérifiez que le backend est accessible.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* Top Users */}
      {stats && stats.top_users && stats.top_users.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Top 20 utilisateurs (aujourd'hui)</h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Rôle
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Cache
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      No Cache
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {stats.top_users.map((user: any, index: number) => (
                    <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {user.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          {user.role.display_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                          {user.total_calls}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {user.cached_calls}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-orange-600 dark:text-orange-400 font-medium">
                          {user.no_cache_calls}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Endpoint Stats */}
      {stats && stats.endpoint_stats && (
        <div>
          <div className="flex items-center justify-between mb-4 gap-4">
            <h2 className="text-2xl font-bold">Statistiques par endpoint (aujourd'hui)</h2>
            <button
              onClick={() => setShowAllEndpoints(!showAllEndpoints)}
              className="btn-secondary flex items-center gap-2 whitespace-nowrap px-4 py-2"
            >
              {showAllEndpoints ? (
                <>
                  <ChevronUp size={18} />
                  Afficher moins
                </>
              ) : (
                <>
                  <ChevronDown size={18} />
                  Afficher tout ({Object.keys(stats.endpoint_stats).filter(e => e !== 'cached').length})
                </>
              )}
            </button>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Endpoint
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('total')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Total
                        {getSortIcon('total')}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('cached')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Cache
                        {getSortIcon('cached')}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('no_cache')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        No Cache
                        {getSortIcon('no_cache')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                      Ratio Cache
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(stats.endpoint_stats)
                    .filter(([endpoint]) => endpoint !== 'cached')
                    .sort(([, a]: [string, any], [, b]: [string, any]) => {
                      const aValue = a[sortField]
                      const bValue = b[sortField]
                      return sortDirection === 'desc' ? bValue - aValue : aValue - bValue
                    })
                    .slice(0, showAllEndpoints ? undefined : 10)
                    .map(([endpoint, endpointStats]: [string, any]) => {
                      const hasTraffic = endpointStats.total > 0
                      const cacheRatio = hasTraffic ? Math.round((endpointStats.cached / endpointStats.total) * 100) : 0

                      return (
                        <tr
                          key={endpoint}
                          className={`${
                            hasTraffic
                              ? 'hover:bg-gray-50 dark:hover:bg-gray-800'
                              : 'opacity-40'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <code className={`text-sm font-mono ${
                              hasTraffic
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-500 dark:text-gray-600'
                            }`}>
                              {endpoint}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-semibold ${
                              hasTraffic
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-400 dark:text-gray-600'
                            }`}>
                              {endpointStats.total}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              {endpointStats.cached}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-orange-600 dark:text-orange-400 font-medium">
                              {endpointStats.no_cache}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {hasTraffic && (
                              <div className="flex items-center justify-center gap-2">
                                <div className="flex-1 max-w-[120px] bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="bg-green-500 h-full rounded-full transition-all"
                                    style={{ width: `${cacheRatio}%` }}
                                  />
                                </div>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">
                                  {cacheRatio}%
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cache Management - Danger Zone */}
      <div className="card border-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
              Zone dangereuse
            </h3>
            <p className="text-sm text-red-800 dark:text-red-300 mb-2">
              Les actions suivantes sont <strong>irréversibles</strong> et affectent tous les utilisateurs de la plateforme. Utilisez avec précaution.
            </p>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                <strong>ℹ️ Note importante :</strong> Vider le cache Redis ne vide <strong>pas</strong> le cache des navigateurs des utilisateurs (localStorage + React Query).
                Les données réapparaîtront dans Redis dès qu'un utilisateur consultera la page Consommation, car elles seront automatiquement re-fetchées depuis Enedis.
                Chaque utilisateur doit vider son propre cache navigateur via le bouton rouge sur la page Consommation.
              </p>
            </div>
            <button
              onClick={() => setShowClearCacheModal(true)}
              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
            >
              <Trash2 size={18} />
              Vider tout le cache Redis (consommation + production)
            </button>
          </div>
        </div>
      </div>
      </div>

    </div>
  )
}
