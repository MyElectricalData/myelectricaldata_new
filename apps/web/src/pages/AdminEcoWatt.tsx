import { useState, useEffect } from 'react'
import { Zap, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import { ecowattApi, type EcoWattSignal } from '../api/ecowatt'

export default function AdminEcoWatt() {
  const [signals, setSignals] = useState<EcoWattSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [nextRefreshTime, setNextRefreshTime] = useState<string | null>(null)

  useEffect(() => {
    fetchEcoWattSignals()
    fetchRefreshStatus()
  }, [])

  const fetchEcoWattSignals = async () => {
    setLoading(true)
    try {
      // Fetch recent signals
      const response = await ecowattApi.getForecast(7)
      if (response.success && response.data) {
        setSignals(response.data)

        // Get last update time - use generation_datetime which is when RTE generated the data
        if (response.data.length > 0) {
          const mostRecent = response.data.reduce((prev: EcoWattSignal, curr: EcoWattSignal) =>
            new Date(curr.generation_datetime) > new Date(prev.generation_datetime) ? curr : prev
          )
          setLastUpdate(mostRecent.generation_datetime)
        }
      }
    } catch (error) {
      console.error('Error fetching EcoWatt signals:', error)
      setMessage({ type: 'error', text: 'Erreur lors du chargement des signaux EcoWatt' })
    } finally {
      setLoading(false)
    }
  }

  const fetchRefreshStatus = async () => {
    try {
      const response = await ecowattApi.getRefreshStatus()
      if (response.success && response.data) {
        if (!response.data.can_refresh && response.data.time_remaining_seconds) {
          const nextTime = new Date(Date.now() + response.data.time_remaining_seconds * 1000)
          setNextRefreshTime(nextTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
        } else {
          setNextRefreshTime(null)
        }
      }
    } catch (error) {
      console.error('Error fetching refresh status:', error)
    }
  }

  const updateEcoWattCache = async () => {
    setUpdating(true)
    setMessage(null)
    try {
      const response = await ecowattApi.refreshCache()
      if (response.success) {
        const count = response.data?.updated_count || 0
        setMessage({
          type: 'success',
          text: `Cache EcoWatt mis à jour avec ${count} signaux`
        })
        fetchEcoWattSignals() // Reload data
        fetchRefreshStatus() // Update next refresh time
      } else {
        // Check if it's a permission error
        const isPermissionError = response.error?.code === 'PERMISSION_DENIED' ||
                                  (response as any).statusCode === 403 ||
                                  response.error?.message?.toLowerCase().includes('permission') ||
                                  response.error?.message?.toLowerCase().includes('autorisé')

        const errorMsg = isPermissionError
          ? "Vous n'avez pas la permission de rafraîchir le cache EcoWatt. Contactez un administrateur pour obtenir la permission 'admin.ecowatt.refresh'."
          : response.error?.message || 'Erreur lors de la mise à jour du cache EcoWatt'

        setMessage({
          type: 'error',
          text: errorMsg
        })
      }
    } catch (error: any) {
      console.error('Error updating EcoWatt cache:', error)

      // Check if it's a permission error (403 or specific error message)
      const isPermissionError = error?.response?.status === 403 ||
                                error?.message?.toLowerCase().includes('permission') ||
                                error?.message?.toLowerCase().includes('autorisé')

      const errorMsg = isPermissionError
        ? "Vous n'avez pas la permission de rafraîchir le cache EcoWatt. Contactez un administrateur pour obtenir la permission 'admin.ecowatt.refresh'."
        : error?.message || 'Erreur lors de la mise à jour du cache EcoWatt'

      setMessage({
        type: 'error',
        text: errorMsg
      })
    } finally {
      setUpdating(false)
    }
  }

  // Colors for hourly values (hvalues - 0 to 3)
  const getHourlySignalColor = (value: number) => {
    switch (value) {
      case 0: return 'bg-green-500' // Production décarbonée
      case 1: return 'bg-blue-500' // Consommation normale
      case 2: return 'bg-orange-500'
      case 3: return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  // Colors for daily signal (dvalue - 1 to 3)
  const getDailySignalColor = (value: number) => {
    switch (value) {
      case 1: return 'bg-green-500'
      case 2: return 'bg-orange-500'
      case 3: return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getSignalLabel = (value: number) => {
    switch (value) {
      case 1: return 'Vert'
      case 2: return 'Orange'
      case 3: return 'Rouge'
      default: return 'Inconnu'
    }
  }

  const getHourlySignalInfo = (value: number) => {
    switch (value) {
      case 0: return 'Production décarbonée'
      case 1: return 'Consommation normale'
      case 2: return 'Système électrique tendu'
      case 3: return 'Système électrique très tendu'
      default: return 'Inconnu'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <Zap className="text-primary-600 dark:text-primary-400" size={28} />
          Administration EcoWatt
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérer les données EcoWatt et la synchronisation avec RTE
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg border-l-4 ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
            : 'bg-red-50 dark:bg-red-900/20 border-red-500'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
            ) : (
              <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
            )}
            <span className={message.type === 'success'
              ? 'text-green-800 dark:text-green-200'
              : 'text-red-800 dark:text-red-200'
            }>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Actions</h2>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={updateEcoWattCache}
            disabled={updating}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
            {updating ? 'Mise à jour en cours...' : 'Mettre à jour le cache EcoWatt'}
          </button>

          <div className="flex flex-col gap-2">
            {lastUpdate && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Dernière génération RTE : {new Date(lastUpdate).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            )}
            {nextRefreshTime && (
              <div className="text-sm text-orange-600 dark:text-orange-400">
                Prochain refresh possible : {nextRefreshTime}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note :</strong> Les données EcoWatt sont mises à jour quotidiennement par RTE.
            La synchronisation récupère les signaux pour aujourd'hui et les 2 prochains jours (J+2).
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
            <strong>⚠️ Important :</strong> Un délai de 15 minutes minimum est imposé entre deux actualisations
            pour éviter un bannissement de l'API RTE. Ce délai ne peut pas être forcé.
          </p>
        </div>
      </div>


      {/* Current Signals */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-2">Signaux actuels</h2>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Production décarbonée</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Consommation normale</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Système tendu</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Système très tendu</span>            
          </div>
        </div>

        {signals.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            Aucun signal EcoWatt disponible. Utilisez le bouton ci-dessus pour synchroniser avec RTE.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Signal</th>
                  <th className="text-left py-3 px-4">Message</th>
                  <th className="text-left py-3 px-4">Génération</th>
                  <th className="text-left py-3 px-4">Détail horaire</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {signals.map((signal) => (
                  <tr key={signal.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">
                      {new Date(signal.periode).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${getDailySignalColor(signal.dvalue)}`}>
                        {getSignalLabel(signal.dvalue)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                        signal.dvalue === 1 ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' :
                        signal.dvalue === 2 ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200' :
                        signal.dvalue === 3 ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200' :
                        'bg-gray-50 dark:bg-gray-900/20 text-gray-800 dark:text-gray-200'
                      }`}>
                        {signal.message || 'Pas d\'alerte'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(signal.generation_datetime).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-0.5">
                        {signal.values.slice(0, 24).map((value, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-6 ${getHourlySignalColor(value)} cursor-help`}
                            title={`${idx}h: ${getHourlySignalInfo(value)}`}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Information */}
      <div className="card p-6 bg-gray-50 dark:bg-gray-800">
        <h3 className="font-semibold mb-2">Informations techniques</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• API RTE : https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals</li>
          <li>• Authentification : OAuth2 avec les mêmes credentials que Tempo</li>
          <li>• Fréquence de mise à jour : Quotidienne (recommandé après 7h du matin)</li>
          <li>• Données disponibles : J+2 jours avec détail horaire</li>
          <li>• Valeurs : 1 (Vert), 2 (Orange), 3 (Rouge)</li>
        </ul>
      </div>
    </div>
  )
}
