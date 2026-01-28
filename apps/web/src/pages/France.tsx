import { useState, useEffect } from 'react'
import { Sun, Wind, Info, Leaf, Zap, TrendingUp, BarChart3, RefreshCw, Clock } from 'lucide-react'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  consumptionFranceApi,
  type ConsumptionFranceResponse,
  type ConsumptionFranceCurrent,
} from '../api/consumptionFrance'
import {
  generationForecastApi,
  type RenewableMixResponse,
} from '../api/generationForecast'
import { syncApi } from '../api/sync'
import { useAppMode } from '../hooks/useAppMode'
import { toast } from '../stores/notificationStore'

// Formater la valeur en GW pour l'affichage
const formatMW = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} GW`
  }
  return `${value.toFixed(0)} MW`
}

// Formater l'heure depuis une date ISO
const formatHour = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Couleurs par type de données consommation
const TYPE_COLORS: Record<string, string> = {
  REALISED: '#10b981', // vert (réalisé)
  ID: '#f59e0b', // orange (intraday)
  'D-1': '#3b82f6', // bleu (prévision veille)
}

const TYPE_LABELS: Record<string, string> = {
  REALISED: 'Réalisé',
  ID: 'Intraday',
  'D-1': 'Prévision veille',
}

// Descriptions détaillées des types de données
const TYPE_DESCRIPTIONS: Record<string, string> = {
  REALISED: 'Consommation réelle mesurée, mise à jour toutes les 15 minutes',
  ID: 'Prévision recalculée en continu selon la météo et la consommation observée',
  'D-1': 'Prévision établie la veille, basée sur les prévisions météo',
}

export default function France() {
  const { isClientMode } = useAppMode()

  // État consommation
  const [consumptionData, setConsumptionData] = useState<ConsumptionFranceResponse | null>(null)
  const [currentConsumption, setCurrentConsumption] = useState<ConsumptionFranceCurrent | null>(null)

  // État production
  const [mixData, setMixData] = useState<RenewableMixResponse | null>(null)

  // État commun
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // État synchronisation (mode client uniquement)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncConsumption, setLastSyncConsumption] = useState<string | null>(null)
  const [lastSyncGeneration, setLastSyncGeneration] = useState<string | null>(null)

  // État des courbes visibles (toutes activées par défaut)
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    REALISED: true,
    ID: true,
    'D-1': true,
  })

  // Formatter le temps écoulé depuis la dernière synchronisation
  const formatLastSync = (isoString: string | null | undefined) => {
    if (!isoString) return 'Jamais'
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return 'À l\'instant'
    if (diffMins < 60) return `Il y a ${diffMins} min`
    if (diffHours < 24) return `Il y a ${diffHours}h`
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // Récupérer le statut de synchronisation (mode client uniquement)
  const fetchSyncStatus = async () => {
    if (!isClientMode) return
    try {
      const [consumptionStatus, generationStatus] = await Promise.all([
        syncApi.getConsumptionFranceStatus(),
        syncApi.getGenerationForecastStatus(),
      ])
      if (consumptionStatus.success && consumptionStatus.data) {
        setLastSyncConsumption(consumptionStatus.data.last_sync_at)
      }
      if (generationStatus.success && generationStatus.data) {
        setLastSyncGeneration(generationStatus.data.last_sync_at)
      }
    } catch (err) {
      console.error('Erreur lors de la récupération du statut de synchronisation', err)
    }
  }

  // Synchroniser les données depuis la passerelle (mode client uniquement)
  const handleSync = async () => {
    setSyncing(true)
    const loadingId = toast.loading('Synchronisation des données France...')
    try {
      const [consumptionResult, generationResult] = await Promise.all([
        syncApi.syncConsumptionFranceNow(),
        syncApi.syncGenerationForecastNow(),
      ])

      toast.dismiss(loadingId)

      const consumptionCreated = consumptionResult.data?.created || 0
      const consumptionUpdated = consumptionResult.data?.updated || 0
      const generationCreated = generationResult.data?.created || 0
      const generationUpdated = generationResult.data?.updated || 0

      const totalCreated = consumptionCreated + generationCreated
      const totalUpdated = consumptionUpdated + generationUpdated

      const hasErrors = (consumptionResult.data?.errors?.length || 0) > 0 ||
                        (generationResult.data?.errors?.length || 0) > 0

      if (hasErrors) {
        toast.warning(`Synchronisation partielle : ${totalCreated} créés, ${totalUpdated} mis à jour`)
      } else if (totalCreated > 0 || totalUpdated > 0) {
        toast.success(`Synchronisation réussie : ${totalCreated} créés, ${totalUpdated} mis à jour`)
        // Recharger les données après synchronisation
        await fetchData()
      } else {
        toast.info('Aucune nouvelle donnée à synchroniser')
      }

      // Mettre à jour le statut de synchronisation
      await fetchSyncStatus()
    } catch (err) {
      toast.dismiss(loadingId)
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Échec de la synchronisation : ${errorMessage}`)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
    fetchSyncStatus()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [consumptionResponse, currentResponse, mixResponse] = await Promise.all([
        consumptionFranceApi.getConsumption(),
        consumptionFranceApi.getCurrent(),
        generationForecastApi.getMix(),
      ])

      if (consumptionResponse.success && consumptionResponse.data) {
        setConsumptionData(consumptionResponse.data)
      }

      if (currentResponse.success && currentResponse.data) {
        setCurrentConsumption(currentResponse.data)
      }

      if (mixResponse.success && mixResponse.data) {
        setMixData(mixResponse.data)
      }
    } catch (err) {
      setError('Erreur lors du chargement des données')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Préparer les données pour le graphique consommation
  // Affiche la journée complète (00h00 - 23h59)
  const prepareConsumptionChartData = () => {
    if (!consumptionData) return []

    const dataByTime: Record<string, Record<string, number>> = {}

    for (const typeData of consumptionData.short_term) {
      for (const value of typeData.values) {
        const time = value.start_date
        if (!dataByTime[time]) {
          dataByTime[time] = {}
        }
        dataByTime[time][typeData.type] = value.value
      }
    }

    // Veille 00h00 à aujourd'hui 23h59 (48h de données)
    const now = new Date()
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0)
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const sortedData = Object.entries(dataByTime)
      .map(([time, values]) => ({
        time,
        label: formatHour(time),
        ...values,
      }))
      .filter((item) => {
        const itemTime = new Date(item.time)
        return itemTime >= yesterday && itemTime <= endOfToday
      })
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

    // Ajouter le jour au premier point de chaque journée
    let lastDay: number | null = null
    for (const item of sortedData) {
      const date = new Date(item.time)
      const day = date.getDate()
      if (lastDay !== null && day !== lastDay) {
        item.label = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      }
      lastDay = day
    }

    return sortedData
  }

  // Préparer les données pour le graphique production avec bilan énergétique
  const prepareMixChartData = () => {
    if (!mixData) return []

    // Créer un index de consommation par heure (arrondie)
    const consumptionByHour: Record<string, number> = {}
    if (consumptionData) {
      for (const typeData of consumptionData.short_term) {
        // Utiliser REALISED en priorité, sinon ID
        if (typeData.type === 'REALISED' || (typeData.type === 'ID' && Object.keys(consumptionByHour).length === 0)) {
          for (const value of typeData.values) {
            // Arrondir à l'heure pour matcher avec les données de production (horaires)
            const date = new Date(value.start_date)
            date.setMinutes(0, 0, 0)
            const hourKey = date.toISOString()
            // Garder la valeur la plus récente pour chaque heure
            if (!consumptionByHour[hourKey] || typeData.type === 'REALISED') {
              consumptionByHour[hourKey] = value.value
            }
          }
        }
      }
    }

    // Filtrer sur la même période que le graphique consommation (veille à aujourd'hui)
    const now = new Date()
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0)
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const sortedData = mixData.mix
      .filter((item) => {
        const itemTime = new Date(item.start_date)
        return itemTime >= yesterday && itemTime <= endOfToday
      })
      .map((item) => {
        // Trouver la consommation correspondante
        const date = new Date(item.start_date)
        date.setMinutes(0, 0, 0)
        const hourKey = date.toISOString()
        const consumption = consumptionByHour[hourKey] || 0

        // Bilan = production renouvelable - consommation (négatif = déficit)
        const balance = item.total_renewable - consumption

        return {
          time: item.start_date,
          label: formatHour(item.start_date),
          solar: item.solar,
          wind: item.wind,
          total: item.total_renewable,
          consumption,
          balance,
          // Pourcentage de la consommation couverte par le renouvelable
          coveragePercent: consumption > 0 ? Math.round((item.total_renewable / consumption) * 100) : 0,
        }
      })

    // Ajouter le jour au premier point de chaque journée
    let lastDay: number | null = null
    for (const item of sortedData) {
      const date = new Date(item.time)
      const day = date.getDate()
      if (lastDay !== null && day !== lastDay) {
        item.label = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
      }
      lastDay = day
    }

    return sortedData
  }

  // Calculer les totaux production actuels
  const getCurrentProductionTotals = () => {
    if (!mixData || mixData.mix.length === 0) return null

    const latest = mixData.mix[Math.floor(mixData.mix.length / 2)] || mixData.mix[0]
    return {
      solar: latest.solar,
      wind: latest.wind,
      total: latest.total_renewable,
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
        <button
          onClick={fetchData}
          className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
        >
          Réessayer
        </button>
      </div>
    )
  }

  const consumptionChartData = prepareConsumptionChartData()
  const mixChartData = prepareMixChartData()
  const productionTotals = getCurrentProductionTotals()
  // Filtrer pour n'afficher que les types supportés (exclure D-2)
  const supportedTypes = ['REALISED', 'ID', 'D-1']
  const availableConsumptionTypes = (consumptionData?.short_term.map(d => d.type) || [])
    .filter(type => supportedTypes.includes(type))

  // Calculer le dernier temps de synchronisation (le plus récent des deux)
  const getLastSyncTime = () => {
    if (!lastSyncConsumption && !lastSyncGeneration) return null
    if (!lastSyncConsumption) return lastSyncGeneration
    if (!lastSyncGeneration) return lastSyncConsumption
    return new Date(lastSyncConsumption) > new Date(lastSyncGeneration)
      ? lastSyncConsumption
      : lastSyncGeneration
  }

  return (
    <div className="w-full">
      <div className="space-y-6">
        {/* ===== BLOC RÉSUMÉ TEMPS RÉEL ===== */}
        <div className="card p-6 border-l-4 border-green-500">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Zap className="text-green-600 dark:text-green-400" size={32} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-semibold">Réseau électrique français</h2>
                {/* Bouton de synchronisation (client mode uniquement) */}
                {isClientMode && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatLastSync(getLastSyncTime())}
                    </span>
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Synchronisation...' : 'Synchroniser'}
                    </button>
                  </div>
                )}
              </div>
              <p className="text-lg font-medium text-green-600 dark:text-green-400 mb-2">
                {currentConsumption ? `Consommation : ${formatMW(currentConsumption.value)}` : 'Données en cours de chargement...'}
              </p>
              <p className="text-gray-600 dark:text-gray-400">
                Suivi en temps réel de la consommation et de la production électrique nationale.
              </p>
            </div>
          </div>

          {/* Cartes résumé intégrées */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Consommation actuelle */}
            {currentConsumption && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Zap className="text-green-600 dark:text-green-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Consommation</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMW(currentConsumption.value)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Production solaire */}
            {productionTotals && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                    <Sun className="text-yellow-600 dark:text-yellow-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Solaire</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMW(productionTotals.solar)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Production éolienne */}
            {productionTotals && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Wind className="text-blue-600 dark:text-blue-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Éolien</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMW(productionTotals.wind)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Total renouvelable */}
            {productionTotals && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Leaf className="text-green-600 dark:text-green-400" size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Renouvelable</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{formatMW(productionTotals.total)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Graphique consommation */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
            Consommation nationale
          </h2>

          {consumptionChartData.length > 0 ? (
            <>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={consumptionChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)} GW`}
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatMW(value), TYPE_LABELS[name] || name]}
                      labelFormatter={(label) => `Heure : ${label}`}
                      contentStyle={{
                        backgroundColor: 'rgb(var(--color-gray-800, 31 41 55) / 1)',
                        border: '1px solid rgb(var(--color-gray-700, 55 65 81) / 1)',
                        borderRadius: '0.5rem',
                        color: 'white',
                      }}
                      itemStyle={{ color: 'white' }}
                      labelStyle={{ color: 'white' }}
                    />
                    {availableConsumptionTypes
                      .filter((type) => visibleTypes[type])
                      .map((type) => (
                        <Line
                          key={type}
                          type="monotone"
                          dataKey={type}
                          stroke={TYPE_COLORS[type] || '#6b7280'}
                          strokeWidth={type === 'REALISED' ? 2 : 1}
                          dot={false}
                          name={type}
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Toggles pour activer/désactiver les courbes */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                {availableConsumptionTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))}
                    className={`flex items-start gap-3 text-sm p-3 rounded-lg border transition-all h-full ${
                      visibleTypes[type]
                        ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                        visibleTypes[type] ? 'border-transparent' : 'border-gray-300 dark:border-gray-600'
                      }`}
                      style={{ backgroundColor: visibleTypes[type] ? TYPE_COLORS[type] || '#6b7280' : 'transparent' }}
                    >
                      {visibleTypes[type] && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="text-left flex-1">
                      <span className={`font-medium ${visibleTypes[type] ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                        {TYPE_LABELS[type] || type}
                      </span>
                      <p className="text-gray-500 dark:text-gray-400 text-xs min-h-[2.5rem]">
                        {TYPE_DESCRIPTIONS[type] || ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[350px] text-center">
              <BarChart3 className="text-gray-400 dark:text-gray-500 mb-4" size={48} />
              <p className="text-gray-500 dark:text-gray-400">
                Aucune donnée disponible.
                {isClientMode
                  ? ' Cliquez sur "Synchroniser" pour récupérer les données depuis la passerelle.'
                  : ' Les données seront chargées automatiquement.'}
              </p>
            </div>
          )}
        </div>

        {/* ===== SECTION PRODUCTION ===== */}

        {/* Graphique du mix renouvelable */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
            <Leaf className="text-primary-600 dark:text-primary-400" size={20} />
            Production renouvelable
          </h2>

          {mixChartData.length > 0 ? (
            <>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mixChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-30" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)} GW`}
                      tick={{ fill: 'currentColor', fontSize: 12 }}
                      domain={[0, (dataMax: number) => {
                        // Inclure la consommation dans le calcul du max
                        const maxConsumption = Math.max(...mixChartData.map(d => d.consumption || 0))
                        return Math.max(dataMax, maxConsumption) * 1.05 // +5% de marge
                      }]}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          solar: 'Solaire',
                          wind: 'Éolien',
                          total: 'Total renouvelable',
                          consumption: 'Consommation',
                        }
                        return [formatMW(value), labels[name] || name]
                      }}
                      labelFormatter={(label) => `Heure : ${label}`}
                      contentStyle={{
                        backgroundColor: 'rgb(var(--color-gray-800, 31 41 55) / 1)',
                        border: '1px solid rgb(var(--color-gray-700, 55 65 81) / 1)',
                        borderRadius: '0.5rem',
                        color: 'white',
                      }}
                      itemStyle={{ color: 'white' }}
                      labelStyle={{ color: 'white' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="solar"
                      stackId="1"
                      stroke="#f59e0b"
                      fill="#fcd34d"
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="wind"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#93c5fd"
                      fillOpacity={0.6}
                    />
                    <Line
                      type="monotone"
                      dataKey="consumption"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="5 5"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Indicateur de couverture renouvelable */}
              {mixChartData.length > 0 && mixChartData[Math.floor(mixChartData.length / 2)]?.coveragePercent > 0 && (
                <div className="mt-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Couverture renouvelable actuelle
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Part de la consommation couverte par solaire + éolien
                      </p>
                    </div>
                    <div className={`text-2xl font-bold ${
                      mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent >= 50
                        ? 'text-green-600 dark:text-green-400'
                        : mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent >= 25
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    }`}>
                      {mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent}%
                    </div>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent >= 50
                          ? 'bg-green-500'
                          : mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent >= 25
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, mixChartData[Math.floor(mixChartData.length / 2)].coveragePercent)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Légende explicative */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#fcd34d' }} />
                  <span className="text-gray-600 dark:text-gray-400">Solaire (empilé)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#93c5fd' }} />
                  <span className="text-gray-600 dark:text-gray-400">Éolien (empilé)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 rounded" style={{ backgroundColor: '#ef4444', borderStyle: 'dashed' }} />
                  <span className="text-gray-600 dark:text-gray-400">Consommation (ligne rouge)</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 max-w-md">
                <p className="text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  Données non disponibles
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                  Les données de production renouvelable ne sont pas encore chargées.
                  {isClientMode
                    ? ' Cliquez sur "Synchroniser" pour récupérer les données depuis la passerelle.'
                    : ' Les données seront chargées automatiquement.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Info combinée */}
        <div className="card p-6 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
          <div className="flex items-start gap-3">
            <Info className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" size={20} />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                À propos des données
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm mb-3">
                Ces données proviennent de l'API RTE et sont mises à jour automatiquement.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Consommation</h4>
                  <ul className="text-blue-800 dark:text-blue-200 list-disc list-inside space-y-0.5">
                    <li><strong>Réalisé</strong> : Mesure temps réel (15 min)</li>
                    <li><strong>Intraday</strong> : Prévision horaire</li>
                    <li><strong>D-1</strong> : Prévision de la veille</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">Production renouvelable</h4>
                  <ul className="text-blue-800 dark:text-blue-200 list-disc list-inside space-y-0.5">
                    <li>Solaire centralisé</li>
                    <li>Éolien (onshore + offshore)</li>
                    <li>Granularité : 1 heure</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
