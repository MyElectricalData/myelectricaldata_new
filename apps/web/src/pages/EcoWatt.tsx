import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, AlertCircle, Calendar } from 'lucide-react'
import { ecowattApi, type EcoWattSignal, type EcoWattStatistics } from '../api/ecowatt'


const getSignalColor = (value: number) => {
  switch (value) {
    case 0:
      return 'green' // Production décarbonée
    case 1:
      return 'blue' // Consommation normale
    case 2:
      return 'orange'
    case 3:
      return 'red'
    default:
      return 'gray'
  }
}

const getHourlySignalInfo = (value: number) => {
  switch (value) {
    case 0:
      return 'Production décarbonée'
    case 1:
      return 'Consommation normale'
    case 2:
      return 'Système électrique tendu'
    case 3:
      return 'Système électrique très tendu'
    default:
      return 'Inconnu'
  }
}

const getSignalInfo = (value: number) => {
  switch (value) {
    case 1:
      return {
        label: 'Consommation normale',
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        borderColor: 'border-green-500',
        description: 'La situation est normale. Vous pouvez consommer normalement.'
      }
    case 2:
      return {
        label: 'Système électrique tendu',
        icon: AlertTriangle,
        color: 'text-orange-600 dark:text-orange-400',
        bgColor: 'bg-orange-100 dark:bg-orange-900/30',
        borderColor: 'border-orange-500',
        description: 'Le système électrique est tendu. Les écogestes sont les bienvenus.'
      }
    case 3:
      return {
        label: 'Système électrique très tendu',
        icon: AlertCircle,
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
        borderColor: 'border-red-500',
        description: 'Le système électrique est très tendu. Des coupures sont possibles si nous ne baissons pas notre consommation.'
      }
    default:
      return {
        label: 'Données non disponibles',
        icon: AlertCircle,
        color: 'text-gray-600 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-900/30',
        borderColor: 'border-gray-500',
        description: 'Les données EcoWatt ne sont pas disponibles pour le moment.'
      }
  }
}

export default function EcoWatt() {
  const [currentSignal, setCurrentSignal] = useState<EcoWattSignal | null>(null)
  const [forecast, setForecast] = useState<EcoWattSignal[]>([])
  const [statistics, setStatistics] = useState<EcoWattStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchEcoWattData()
  }, [])

  const fetchEcoWattData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch 3-day forecast (includes today + 2 days, max J+2 from RTE)
      const forecastResponse = await ecowattApi.getForecast(3)
      if (forecastResponse.success && forecastResponse.data) {
        const data = forecastResponse.data
        // First item is today
        if (data.length > 0) {
          setCurrentSignal(data[0])
        }
        // Remaining items are next 2 days
        setForecast(data.slice(1))
      }

      // Fetch yearly statistics
      const year = new Date().getFullYear()
      const statsResponse = await ecowattApi.getStatistics(year)
      if (statsResponse.success && statsResponse.data) {
        setStatistics(statsResponse.data)
      }
    } catch (err) {
      setError("Erreur lors du chargement des données EcoWatt")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg">
        <p className="text-red-800 dark:text-red-200">{error}</p>
      </div>
    )
  }

  const currentInfo = currentSignal ? getSignalInfo(currentSignal.dvalue) : getSignalInfo(0)

  return (
    <div className="space-y-6">

      {/* Current Signal */}
      <div className={`card p-6 border-l-4 ${currentInfo.borderColor}`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-lg ${currentInfo.bgColor}`}>
            <currentInfo.icon className={currentInfo.color} size={32} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold mb-1">Signal du jour</h2>
            <p className={`text-lg font-medium ${currentInfo.color} mb-2`}>
              {currentInfo.label}
            </p>
            <p className="text-gray-600 dark:text-gray-400">{currentInfo.description}</p>
          </div>
        </div>

        {/* Message box - always displayed */}
        {currentSignal && (
          <div className={`mt-4 p-3 rounded-lg ${
            currentSignal.dvalue === 1 ? 'bg-green-50 dark:bg-green-900/20' :
            currentSignal.dvalue === 2 ? 'bg-orange-50 dark:bg-orange-900/20' :
            currentSignal.dvalue === 3 ? 'bg-red-50 dark:bg-red-900/20' :
            'bg-gray-50 dark:bg-gray-900/20'
          }`}>
            <p className={`text-sm font-medium ${
              currentSignal.dvalue === 1 ? 'text-green-800 dark:text-green-200' :
              currentSignal.dvalue === 2 ? 'text-orange-800 dark:text-orange-200' :
              currentSignal.dvalue === 3 ? 'text-red-800 dark:text-red-200' :
              'text-gray-800 dark:text-gray-200'
            }`}>
              {currentSignal.message || 'Pas d\'alerte'}
            </p>
          </div>
        )}

        {/* Hourly breakdown */}
        {currentSignal && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Prévision heure par heure
            </h3>
            <div className="grid grid-cols-12 gap-1">
              {currentSignal.values.slice(0, 24).map((value, index) => {
                const color = getSignalColor(value)
                const bgClass = color === 'green' ? 'bg-green-500' :
                               color === 'blue' ? 'bg-blue-500' :
                               color === 'orange' ? 'bg-orange-500' :
                               color === 'red' ? 'bg-red-500' : 'bg-gray-500'
                return (
                  <div key={index} className="text-center">
                    <div
                      className={`h-8 rounded ${bgClass} mb-1 cursor-help`}
                      title={`${index}h: ${getHourlySignalInfo(value)}`}
                    ></div>
                    <span className="text-xs text-gray-600 dark:text-gray-400">{index}h</span>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs">
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
          </div>
        )}
      </div>

      {/* Forecast - Next 2 days */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
          <Calendar className="text-primary-600 dark:text-primary-400" size={24} />
          Prévisions sur 2 jours
        </h2>

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

        {forecast.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            Aucune prévision disponible pour les prochains jours.
          </p>
        ) : (
          <div className="space-y-4">
            {forecast.map((signal) => {
              const signalDate = new Date(signal.periode)
              const info = getSignalInfo(signal.dvalue)

              return (
                <div
                  key={signal.id}
                  className={`p-4 rounded-lg border-2 ${info.borderColor} ${info.bgColor}`}
                >
                  {/* Date and signal header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <info.icon className={info.color} size={24} />
                      <div>
                        <h3 className="font-semibold text-lg">
                          {signalDate.toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long'
                          })}
                        </h3>
                        <p className={`text-sm ${info.color}`}>{info.label}</p>
                      </div>
                    </div>
                  </div>

                  {/* Alert message - always displayed with color matching dvalue */}
                  <div className={`mb-4 p-3 rounded-lg ${
                    signal.dvalue === 1 ? 'bg-green-50 dark:bg-green-900/20' :
                    signal.dvalue === 2 ? 'bg-orange-50 dark:bg-orange-900/20' :
                    signal.dvalue === 3 ? 'bg-red-50 dark:bg-red-900/20' :
                    'bg-gray-50 dark:bg-gray-900/20'
                  }`}>
                    <p className={`text-sm font-medium ${
                      signal.dvalue === 1 ? 'text-green-800 dark:text-green-200' :
                      signal.dvalue === 2 ? 'text-orange-800 dark:text-orange-200' :
                      signal.dvalue === 3 ? 'text-red-800 dark:text-red-200' :
                      'text-gray-800 dark:text-gray-200'
                    }`}>
                      {signal.message || 'Pas d\'alerte'}
                    </p>
                  </div>

                  {/* Hourly breakdown */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Détail heure par heure
                    </h4>
                    <div className="grid grid-cols-12 gap-1">
                      {signal.values.slice(0, 24).map((value, index) => {
                        const color = getSignalColor(value)
                        const bgClass = color === 'green' ? 'bg-green-500' :
                                       color === 'blue' ? 'bg-blue-500' :
                                       color === 'orange' ? 'bg-orange-500' :
                                       color === 'red' ? 'bg-red-500' : 'bg-gray-500'
                        return (
                          <div key={index} className="text-center">
                            <div
                              className={`h-6 rounded ${bgClass} mb-1 cursor-help`}
                              title={`${index}h: ${getHourlySignalInfo(value)}`}
                            ></div>
                            <span className="text-xs text-gray-600 dark:text-gray-400">{index}h</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="card p-6">
          <h2 className="text-xl font-semibold mb-4">
            Statistiques {statistics.year}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-800 dark:text-green-200 text-sm">Jours verts</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {statistics.green_days}
                  </p>
                </div>
                <div className="text-green-600 dark:text-green-400 text-xl font-semibold">
                  {statistics.percentage_green}%
                </div>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-800 dark:text-orange-200 text-sm">Jours orange</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {statistics.orange_days}
                  </p>
                </div>
                <div className="text-orange-600 dark:text-orange-400 text-xl font-semibold">
                  {statistics.percentage_orange}%
                </div>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-800 dark:text-red-200 text-sm">Jours rouges</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {statistics.red_days}
                  </p>
                </div>
                <div className="text-red-600 dark:text-red-400 text-xl font-semibold">
                  {statistics.percentage_red}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sur {statistics.total_days} jours de données disponibles
            </p>
          </div>
        </div>
      )}

      {/* Information */}
      <div className="card p-6 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          À propos d'EcoWatt
        </h3>
        <p className="text-blue-800 dark:text-blue-200 mb-3">
          EcoWatt est un dispositif citoyen qui permet de connaître en temps réel le niveau de consommation
          électrique des Français. Lorsque la consommation est trop élevée, une alerte est envoyée pour
          inciter chacun à réduire ou décaler sa consommation.
        </p>
        <p className="text-blue-800 dark:text-blue-200 text-sm">
          Les données sont mises à jour quotidiennement par RTE (Réseau de Transport d'Électricité),
          le gestionnaire du réseau électrique haute tension français. Les prévisions sont disponibles
          pour aujourd'hui et les 2 prochains jours (J+2 maximum).
        </p>
      </div>
    </div>
  )
}