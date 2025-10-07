import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tempoApi } from '@/api/tempo'
import { RefreshCw, Calendar, CheckCircle, XCircle } from 'lucide-react'

// Helper to capitalize first letter
const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Helper to format date with capitalized day
const formatDate = (dateStr: string, options: Intl.DateTimeFormatOptions) => {
  const formatted = new Date(dateStr).toLocaleDateString('fr-FR', options)
  return capitalizeFirstLetter(formatted)
}

export default function AdminTempo() {
  const queryClient = useQueryClient()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)

  // Load TEMPO data on mount
  const { data: tempoWeekData } = useQuery({
    queryKey: ['tempo-week'],
    queryFn: () => tempoApi.getWeek(),
    refetchInterval: 300000, // Refresh every 5 minutes
  })

  const refreshTempoMutation = useMutation({
    mutationFn: async () => {
      const response = await tempoApi.refreshCache()
      return response
    },
    onSuccess: (response) => {
      if (response.success) {
        const data = response.data as any
        setNotification({
          type: 'success',
          message: `Cache TEMPO mis à jour : ${data.updated_count || 0} jours récupérés`
        })
        // Refresh the week data after successful update
        queryClient.invalidateQueries({ queryKey: ['tempo-week'] })
        setTimeout(() => setNotification(null), 5000)
      } else {
        // Handle API errors returned as success: false
        const errorMsg = response.error?.message || 'Erreur lors de la mise à jour du cache TEMPO'
        setNotification({
          type: 'error',
          message: errorMsg
        })
        setTimeout(() => setNotification(null), 8000)
      }
    },
    onError: (error: any) => {
      const errorMsg = error?.message || 'Erreur lors de la mise à jour du cache TEMPO'
      setNotification({
        type: 'error',
        message: errorMsg
      })
      setTimeout(() => setNotification(null), 8000)
    }
  })

  // Get TEMPO days (last 7 + tomorrow if available), sorted by date descending
  const allTempoData = tempoWeekData?.success && Array.isArray(tempoWeekData.data)
    ? [...tempoWeekData.data].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : []

  // Separate today, tomorrow and historical data
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayData = allTempoData.find((day: any) => {
    const dayDate = new Date(day.date)
    dayDate.setHours(0, 0, 0, 0)
    return dayDate.getTime() === today.getTime()
  })

  const tomorrowData = allTempoData.find((day: any) => {
    const dayDate = new Date(day.date)
    dayDate.setHours(0, 0, 0, 0)
    return dayDate.getTime() === tomorrow.getTime()
  })

  const historicalData = allTempoData
    .filter((day: any) => {
      const dayDate = new Date(day.date)
      dayDate.setHours(0, 0, 0, 0)
      return dayDate.getTime() < today.getTime()
    })
    .slice(0, 7)

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
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Calendar className="text-primary-600 dark:text-primary-400" size={32} />
          Gestion Tempo
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez le cache des données Tempo EDF
        </p>
      </div>

      {/* Tempo Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="text-primary-600 dark:text-primary-400" size={24} />
            <h2 className="text-xl font-semibold">Cache Tempo EDF</h2>
          </div>
          <button
            onClick={() => refreshTempoMutation.mutate()}
            disabled={refreshTempoMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            <RefreshCw size={16} className={refreshTempoMutation.isPending ? 'animate-spin' : ''} />
            {refreshTempoMutation.isPending ? 'Mise à jour...' : 'Rafraîchir le cache'}
          </button>
        </div>

        <div className="mb-4 space-y-2">
          <p className="text-gray-600 dark:text-gray-400">
            Récupération des jours Tempo depuis l'API RTE.
          </p>
          <p className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
            ℹ️ L'information de la couleur du jour suivant est généralement disponible tous les matins à partir de 7h.
          </p>
        </div>

        {todayData || tomorrowData || historicalData.length > 0 ? (
          <div className="mt-4 space-y-6">
            {/* Today and Tomorrow - Side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Today - Highlighted */}
              {todayData && (
                <div className="flex flex-col h-full">
                  <h3 className="font-semibold mb-3 text-lg">Aujourd'hui :</h3>
                  <div
                    className={`p-4 rounded-lg border-4 shadow-lg flex-1 flex items-center ${
                      todayData.color === 'BLUE'
                        ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600'
                        : todayData.color === 'WHITE'
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600'
                        : 'bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div>
                        <span className="font-bold text-lg">
                          {formatDate(todayData.date, {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long'
                          })}
                        </span>
                      </div>
                      <span
                        className={`px-4 py-2 rounded-lg text-base font-bold ${
                          todayData.color === 'BLUE'
                            ? 'bg-blue-600 text-white'
                            : todayData.color === 'WHITE'
                            ? 'bg-gray-700 text-white'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {todayData.color}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tomorrow - Highlighted (always show, even if pending) */}
              <div className="flex flex-col h-full">
                <h3 className="font-semibold mb-3 text-lg">Demain :</h3>
                <div
                  className={`p-4 rounded-lg border-4 shadow-lg flex-1 flex items-center ${
                    tomorrowData
                      ? tomorrowData.color === 'BLUE'
                        ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600'
                        : tomorrowData.color === 'WHITE'
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600'
                        : 'bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600'
                      : 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <span className="font-bold text-lg">
                        {tomorrowData
                          ? formatDate(tomorrowData.date, {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long'
                            })
                          : formatDate(tomorrow.toISOString(), {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long'
                            })}
                      </span>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {tomorrowData ? 'Disponible à partir de la veille 7h' : 'En attente de RTE'}
                      </p>
                    </div>
                    <span
                      className={`px-4 py-2 rounded-lg text-base font-bold ${
                        tomorrowData
                          ? tomorrowData.color === 'BLUE'
                            ? 'bg-blue-600 text-white'
                            : tomorrowData.color === 'WHITE'
                            ? 'bg-gray-700 text-white'
                            : 'bg-red-600 text-white'
                          : 'bg-gray-500 text-white'
                      }`}
                    >
                      {tomorrowData ? tomorrowData.color : '?'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Historical data - Last 7 days */}
            {historicalData.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Historique (7 derniers jours) :</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {historicalData.map((day: any) => (
                    <div
                      key={day.date}
                      className={`p-3 rounded-lg border-2 ${
                        day.color === 'BLUE'
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : day.color === 'WHITE'
                          ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {formatDate(day.date, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                          })}
                        </span>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            day.color === 'BLUE'
                              ? 'bg-blue-600 text-white'
                              : day.color === 'WHITE'
                              ? 'bg-gray-600 text-white'
                              : 'bg-red-600 text-white'
                          }`}
                        >
                          {day.color}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Aucune donnée TEMPO disponible. Cliquez sur "Rafraîchir le cache" pour récupérer les données.
          </div>
        )}
      </div>
    </div>
  )
}
