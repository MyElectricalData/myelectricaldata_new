import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Database, ChevronDown, ChevronRight, Trash2, Eye } from 'lucide-react'
import { useCacheBroadcast } from '@/hooks/useCacheBroadcast'

/**
 * Composant pour explorer et afficher toutes les données du cache React Query
 */

interface CacheEntry {
  queryKey: readonly unknown[]
  queryHash: string
  state: {
    data?: unknown
    dataUpdatedAt: number
    error?: unknown
    errorUpdatedAt: number
    fetchStatus: string
    status: string
  }
}

export function CacheExplorer() {
  const queryClient = useQueryClient()
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<CacheEntry | null>(null)
  const [showRawData, setShowRawData] = useState(false)
  const [, forceUpdate] = React.useReducer(x => x + 1, 0)
  const [refreshInterval, setRefreshInterval] = useState<number>(2)
  const { subscribe, broadcast } = useCacheBroadcast()

  // Listen to cache changes from React Query
  React.useEffect(() => {
    const cache = queryClient.getQueryCache()

    const unsubscribe = cache.subscribe((event) => {
      // Cache has changed, force re-render if auto-refresh is enabled OR always if event detected
      console.log('[CacheExplorer] Cache event:', event?.type)
      forceUpdate()
    })

    return () => unsubscribe()
  }, [queryClient])

  // Listen to cache updates from other tabs via BroadcastChannel
  React.useEffect(() => {
    const unsubscribe = subscribe(async (message) => {
      console.log('[CacheExplorer] Message from other tab:', message)

      if (message.type === 'CACHE_UPDATED') {
        // Another tab updated the cache in localStorage
        // Read the persisted cache and manually restore it to React Query
        try {
          const persistedCache = localStorage.getItem('myelectricaldata-query-cache')
          if (persistedCache) {
            const { clientState } = JSON.parse(persistedCache)

            if (clientState?.queries) {
              console.log('[CacheExplorer] Restoring', clientState.queries.length, 'queries from localStorage')

              // Restore each query to React Query cache
              clientState.queries.forEach((query: any) => {
                queryClient.setQueryData(query.queryKey, query.state.data)
              })

              // Force re-render to show new data
              forceUpdate()
            }
          }
        } catch (error) {
          console.error('[CacheExplorer] Failed to restore cache from localStorage:', error)
        }
      } else if (message.type === 'CACHE_CLEARED') {
        // Another tab cleared the cache
        queryClient.clear()
        forceUpdate()
      }
    })

    return unsubscribe
  }, [subscribe, queryClient])

  // Auto-refresh with configurable interval as backup
  React.useEffect(() => {
    if (refreshInterval === 0) return // Off

    const interval = setInterval(() => {
      forceUpdate() // Force re-render to re-read cache
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [refreshInterval])

  // Re-read cache on every render
  const cache = queryClient.getQueryCache()
  const queries = cache.getAll()

  // Grouper les requêtes par type
  const groupedQueries = queries.reduce((acc, query) => {
    const queryKey = query.queryKey[0] as string
    if (!acc[queryKey]) {
      acc[queryKey] = []
    }
    acc[queryKey].push({
      queryKey: query.queryKey,
      queryHash: query.queryHash,
      state: {
        data: query.state.data,
        dataUpdatedAt: query.state.dataUpdatedAt,
        error: query.state.error,
        errorUpdatedAt: query.state.errorUpdatedAt,
        fetchStatus: query.state.fetchStatus,
        status: query.state.status,
      }
    })
    return acc
  }, {} as Record<string, CacheEntry[]>)

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedKeys)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedKeys(newExpanded)
  }

  const clearCache = () => {
    if (confirm('Êtes-vous sûr de vouloir vider tout le cache ?')) {
      queryClient.clear()
      setSelectedEntry(null)
      setExpandedKeys(new Set())

      // Broadcast cache clear to other tabs
      broadcast({
        type: 'CACHE_CLEARED',
        timestamp: Date.now(),
        source: 'cache-explorer'
      })
    }
  }

  const clearInvalidKeys = () => {
    const cache = queryClient.getQueryCache()
    const allQueries = cache.getAll()

    // Find queries with null in queryKey or in pending state
    const invalidQueries = allQueries.filter(q => {
      // Check if queryKey contains null, undefined, or 'pending' placeholder
      const hasNullInKey = q.queryKey.some(key => key === null || key === undefined || key === 'pending')
      // Check if query is pending (never resolved)
      const isPending = q.state.fetchStatus === 'idle' && q.state.status === 'pending'
      return hasNullInKey || isPending
    })

    if (invalidQueries.length === 0) {
      alert('Aucune clé invalide trouvée !')
      return
    }

    if (confirm(`Supprimer ${invalidQueries.length} clé(s) invalide(s) ?`)) {
      invalidQueries.forEach(query => {
        queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
      })
      alert(`${invalidQueries.length} clé(s) invalide(s) supprimée(s) !`)
      setSelectedEntry(null)
      setExpandedKeys(new Set())
    }
  }

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Jamais'
    const date = new Date(timestamp)
    return date.toLocaleString('fr-FR')
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getDataSize = (data: unknown): number => {
    try {
      return new Blob([JSON.stringify(data)]).size
    } catch {
      return 0
    }
  }

  const getDataPoints = (entry: CacheEntry): number => {
    try {
      const data = entry.state.data as any
      if (data?.data?.meter_reading?.interval_reading) {
        return data.data.meter_reading.interval_reading.length
      }
      return 0
    } catch {
      return 0
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Database className="text-primary-600 dark:text-primary-400" size={24} />
            Explorateur de cache
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">Refresh:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value={0}>Off</option>
              <option value={1}>1s</option>
              <option value={2}>2s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
            </select>
            {refreshInterval > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 animate-pulse">
                ●
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setExpandedKeys(new Set())
              setSelectedEntry(null)
            }}
            className="btn btn-secondary text-sm"
          >
            Tout réduire
          </button>
          <button
            onClick={clearInvalidKeys}
            className="btn btn-secondary text-sm flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white dark:bg-orange-600 dark:hover:bg-orange-700"
          >
            <Trash2 size={16} />
            Nettoyer les clés invalides
          </button>
          <button
            onClick={clearCache}
            className="btn btn-danger text-sm flex items-center gap-2"
          >
            <Trash2 size={16} />
            Vider tout le cache
          </button>
        </div>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total requêtes</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{queries.length}</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <div className="text-sm text-green-600 dark:text-green-400 font-medium">Types</div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-100">
            {Object.keys(groupedQueries).length}
          </div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Taille totale</div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {formatBytes(queries.reduce((sum, q) => sum + getDataSize(q.state.data), 0))}
          </div>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
          <div className="text-sm text-orange-600 dark:text-orange-400 font-medium">Points de données</div>
          <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
            {queries.reduce((sum, q) => sum + getDataPoints(q as CacheEntry), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Liste des requêtes groupées */}
      <div className="space-y-2">
        {Object.entries(groupedQueries)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([queryType, entries]) => (
            <div key={queryType} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              {/* En-tête du groupe */}
              <button
                onClick={() => toggleExpand(queryType)}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedKeys.has(queryType) ? (
                    <ChevronDown size={20} className="text-gray-600 dark:text-gray-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
                  )}
                  <span className="font-mono font-semibold text-gray-900 dark:text-white">
                    {queryType}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    ({entries.length})
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    {formatBytes(entries.reduce((sum, e) => sum + getDataSize(e.state.data), 0))}
                  </span>
                </div>
              </button>

              {/* Contenu du groupe */}
              {expandedKeys.has(queryType) && (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {entries.map((entry) => {
                    const points = getDataPoints(entry)
                    const size = getDataSize(entry.state.data)

                    return (
                      <div
                        key={entry.queryHash}
                        className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Query key */}
                            <div className="font-mono text-sm text-gray-900 dark:text-white break-all">
                              {JSON.stringify(entry.queryKey)}
                            </div>

                            {/* Métadonnées */}
                            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${
                                  entry.state.status === 'success' ? 'bg-green-500' :
                                  entry.state.status === 'error' ? 'bg-red-500' :
                                  'bg-gray-500'
                                }`} />
                                {entry.state.status}
                              </span>
                              <span>Mis à jour: {formatDate(entry.state.dataUpdatedAt)}</span>
                              <span>Taille: {formatBytes(size)}</span>
                              {points > 0 && <span>Points: {points.toLocaleString()}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <button
                            onClick={() => {
                              setSelectedEntry(entry)
                              setShowRawData(false)
                            }}
                            className="btn btn-secondary btn-sm flex items-center gap-2"
                          >
                            <Eye size={16} />
                            Voir
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* Modal de détails */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h4 className="font-semibold text-gray-900 dark:text-white">Détails de la requête</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRawData(!showRawData)}
                  className="btn btn-secondary btn-sm"
                >
                  {showRawData ? 'Vue formatée' : 'Vue brute'}
                </button>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Fermer
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {showRawData ? (
                <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-xs">
                  {JSON.stringify(selectedEntry.state.data, null, 2)}
                </pre>
              ) : (
                <div className="space-y-4">
                  {/* Query Key */}
                  <div>
                    <h5 className="font-semibold text-gray-900 dark:text-white mb-2">Query Key</h5>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs font-mono">
                      {JSON.stringify(selectedEntry.queryKey, null, 2)}
                    </pre>
                  </div>

                  {/* État */}
                  <div>
                    <h5 className="font-semibold text-gray-900 dark:text-white mb-2">État</h5>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                        <div className="text-xs text-gray-600 dark:text-gray-400">Status</div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {selectedEntry.state.status}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                        <div className="text-xs text-gray-600 dark:text-gray-400">Fetch Status</div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {selectedEntry.state.fetchStatus}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                        <div className="text-xs text-gray-600 dark:text-gray-400">Mis à jour</div>
                        <div className="font-semibold text-gray-900 dark:text-white text-sm">
                          {formatDate(selectedEntry.state.dataUpdatedAt)}
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded">
                        <div className="text-xs text-gray-600 dark:text-gray-400">Taille</div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {formatBytes(getDataSize(selectedEntry.state.data))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Données */}
                  {(() => {
                    try {
                      const data = selectedEntry.state.data as any
                      const points = data?.data?.meter_reading?.interval_reading

                      if (points && Array.isArray(points)) {
                        return (
                          <div>
                            <h5 className="font-semibold text-gray-900 dark:text-white mb-2">
                              Données ({points.length} points)
                            </h5>
                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded space-y-2">
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Premier point:</strong> {points[0]?.date}
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Dernier point:</strong> {points[points.length - 1]?.date}
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <strong>Total kWh:</strong>{' '}
                                {(points.reduce((sum: number, p: any) => sum + (parseFloat(p.value) || 0), 0) / 1000).toFixed(2)}
                              </div>
                              <details className="mt-4">
                                <summary className="cursor-pointer text-sm font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                                  Voir les 10 premiers points
                                </summary>
                                <pre className="mt-2 bg-white dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto">
                                  {JSON.stringify(points.slice(0, 10), null, 2)}
                                </pre>
                              </details>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div>
                          <h5 className="font-semibold text-gray-900 dark:text-white mb-2">Données</h5>
                          <pre className="bg-gray-50 dark:bg-gray-900 p-4 rounded overflow-x-auto text-xs">
                            {JSON.stringify(data, null, 2)}
                          </pre>
                        </div>
                      )
                    } catch {
                      return null
                    }
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
