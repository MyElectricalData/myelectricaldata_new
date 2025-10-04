import { useState, useEffect } from 'react'
import { Calculator, AlertCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { enedisApi } from '@/api/enedis'
import { energyApi, type EnergyProvider, type EnergyOffer } from '@/api/energy'
import type { PDL } from '@/types/api'

export default function Simulator() {
  // Fetch user's PDLs
  const { data: pdlsData, isLoading: pdlsLoading, error: pdlsError } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      return Array.isArray(response.data) ? response.data as PDL[] : []
    },
  })

  // Fetch energy providers and offers
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      return Array.isArray(response.data) ? response.data as EnergyProvider[] : []
    },
  })

  const { data: offersData } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: async () => {
      const response = await energyApi.getOffers()
      return Array.isArray(response.data) ? response.data as EnergyOffer[] : []
    },
  })

  // Selected PDL
  const [selectedPdl, setSelectedPdl] = useState<string>('')

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState<string[]>([])
  const [currentProgress, setCurrentProgress] = useState({ current: 0, total: 0 })
  const [simulationError, setSimulationError] = useState<string | null>(null)

  // Set first PDL as selected by default
  useEffect(() => {
    if (pdlsData && pdlsData.length > 0 && !selectedPdl) {
      setSelectedPdl(pdlsData[0].usage_point_id)
    }
  }, [pdlsData, selectedPdl])

  const handleSimulation = async () => {
    if (!selectedPdl) {
      setSimulationError('Veuillez sélectionner un PDL')
      return
    }

    setIsSimulating(true)
    setSimulationResult(null)
    setLoadingProgress([])
    setCurrentProgress({ current: 0, total: 0 })
    setSimulationError(null)

    try {
      // Récupérer les consommations horaires des 12 derniers mois (année glissante)
      // La date de fin doit être antérieure à la date actuelle selon Enedis
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      // Année glissante : de aujourd'hui - 365 jours jusqu'à hier
      const yearStart = new Date(today)
      yearStart.setDate(yearStart.getDate() - 365)
      const endDate = yesterday

      // Générer les périodes de 7 jours
      const periods: { start: string; end: string }[] = []
      let currentStart = new Date(yearStart)

      while (currentStart < endDate) {
        const currentEnd = new Date(currentStart)
        currentEnd.setDate(currentEnd.getDate() + 6) // 7 jours (jour de départ inclus)

        // Si la date de fin dépasse la date limite, on ajuste
        if (currentEnd > endDate) {
          periods.push({
            start: currentStart.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0],
          })
          break
        } else {
          periods.push({
            start: currentStart.toISOString().split('T')[0],
            end: currentEnd.toISOString().split('T')[0],
          })
          currentStart.setDate(currentStart.getDate() + 7)
        }
      }

      setCurrentProgress({ current: 0, total: periods.length })
      setLoadingProgress((prev) => [...prev, `📊 ${periods.length} périodes de 7 jours à récupérer`])

      console.log(`Fetching ${periods.length} periods of consumption data`)

      // Récupérer les données pour chaque période
      const allData: any[] = []
      for (let i = 0; i < periods.length; i++) {
        const period = periods[i]
        const progressMsg = `⏳ Récupération période ${i + 1}/${periods.length} (${period.start} → ${period.end})`
        setLoadingProgress((prev) => [...prev, progressMsg])
        setCurrentProgress({ current: i + 1, total: periods.length })

        console.log(`Fetching period ${i + 1}/${periods.length}: ${period.start} to ${period.end}`)

        const response = await enedisApi.getConsumptionDetail(selectedPdl, {
          start: period.start,
          end: period.end,
          use_cache: true,
        })

        if (!response.success || !response.data) {
          // Check if it's a rate limit error
          const errorCode = response.error?.code
          if (errorCode === 'RATE_LIMIT_EXCEEDED') {
            throw new Error(`Quota d'appels API dépassé. Vous avez atteint la limite quotidienne d'appels à l'API Enedis. Veuillez réessayer demain ou contactez l'administrateur pour augmenter votre quota.`)
          }
          throw new Error(`Impossible de récupérer les données pour la période ${period.start} - ${period.end}. ${response.error?.message || ''}`)
        }

        allData.push(response.data)
        setLoadingProgress((prev) => [...prev, `✅ Période ${i + 1}/${periods.length} récupérée`])
      }

      setLoadingProgress((prev) => [...prev, '🧮 Calcul des simulations en cours...'])

      // Get subscribed power from selected PDL
      const selectedPdlData = pdlsData?.find((p) => p.usage_point_id === selectedPdl)
      const subscribedPower = selectedPdlData?.subscribed_power

      // Filter offers by subscribed power if available
      const filteredOffers = subscribedPower && offersData
        ? offersData.filter((offer) => {
            const match = offer.name.match(/(\d+)\s*kVA/i)
            if (match) {
              const offerPower = parseInt(match[1])
              return offerPower === subscribedPower
            }
            return true
          })
        : offersData || []

      setLoadingProgress((prev) => [...prev, `📋 ${filteredOffers.length} offres à simuler`])

      if (filteredOffers.length === 0) {
        throw new Error('Aucune offre disponible pour la puissance souscrite de votre PDL')
      }

      // Calculer les simulations pour chaque offre
      const result = calculateSimulationsForAllOffers(allData, filteredOffers, providersData || [])

      console.log('Simulation result:', result)

      if (!result || result.length === 0) {
        throw new Error('Aucun résultat de simulation généré')
      }

      setLoadingProgress((prev) => [...prev, '✅ Simulation terminée !'])
      setSimulationResult(result)
    } catch (error: any) {
      console.error('Simulation error:', error)
      const errorMessage = error.message || 'Erreur inconnue'
      setLoadingProgress((prev) => [...prev, `❌ Erreur: ${errorMessage}`])
      setSimulationError(`Erreur lors de la simulation: ${errorMessage}`)
    } finally {
      setIsSimulating(false)
    }
  }

  const calculateSimulationsForAllOffers = (consumptionData: any[], offers: EnergyOffer[], providers: EnergyProvider[]) => {
    // Extract all consumption values
    const allConsumption: { date: string; value: number; hour?: number }[] = []

    consumptionData.forEach((periodData: any) => {
      if (periodData?.meter_reading?.interval_reading) {
        periodData.meter_reading.interval_reading.forEach((reading: any) => {
          if (reading.value && reading.date) {
            allConsumption.push({
              date: reading.date,
              value: parseFloat(reading.value),
              hour: reading.date ? parseInt(reading.date.split('T')[1]?.split(':')[0] || '0') : 0,
            })
          }
        })
      }
    })

    console.log('Total consumption points:', allConsumption.length)

    // Calculate total kWh
    const totalKwh = allConsumption.reduce((sum, item) => sum + (item.value / 1000), 0) // Convert Wh to kWh

    console.log('Total kWh for year:', totalKwh)

    // Simulate each offer
    const results = offers.map((offer) => {
      const provider = providers.find((p) => p.id === offer.provider_id)
      const subscriptionCostYear = offer.subscription_price * 12

      let energyCost = 0

      if (offer.offer_type === 'BASE' && offer.base_price) {
        energyCost = totalKwh * offer.base_price
      } else if (offer.offer_type === 'HC_HP' && offer.hc_price && offer.hp_price) {
        // Simple HC/HP calculation (assuming 8h HC per day, 22:00-06:00)
        let hcKwh = 0
        let hpKwh = 0

        allConsumption.forEach((item) => {
          const hour = item.hour || 0
          if (hour >= 22 || hour < 6) {
            hcKwh += item.value / 1000
          } else {
            hpKwh += item.value / 1000
          }
        })

        energyCost = (hcKwh * offer.hc_price) + (hpKwh * offer.hp_price)
      } else if (offer.offer_type === 'TEMPO') {
        // Simplified TEMPO calculation (use average of all tempo prices)
        const avgTempoPrice = (
          (offer.tempo_blue_hc || 0) + (offer.tempo_blue_hp || 0) +
          (offer.tempo_white_hc || 0) + (offer.tempo_white_hp || 0) +
          (offer.tempo_red_hc || 0) + (offer.tempo_red_hp || 0)
        ) / 6
        energyCost = totalKwh * avgTempoPrice
      }

      const totalCost = subscriptionCostYear + energyCost

      return {
        offerId: offer.id,
        offerName: offer.name,
        offerType: offer.offer_type,
        providerName: provider?.name || 'Inconnu',
        subscriptionCost: subscriptionCostYear,
        energyCost,
        totalCost,
        totalKwh,
      }
    })

    // Sort by total cost (cheapest first)
    results.sort((a, b) => a.totalCost - b.totalCost)

    return results
  }

  if (pdlsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary-600" size={48} />
      </div>
    )
  }

  if (pdlsError) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">Erreur</h3>
              <p className="text-red-700 dark:text-red-400">
                Impossible de charger vos points de livraison. Veuillez réessayer.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!pdlsData || pdlsData.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-700 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-yellow-600 dark:text-yellow-400" size={24} />
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-300">Aucun PDL configuré</h3>
              <p className="text-yellow-700 dark:text-yellow-400">
                Vous devez d'abord ajouter un point de livraison (PDL) depuis votre tableau de bord.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Calculator className="text-primary-600 dark:text-primary-400" size={32} />
          Comparateur des abonnements par fournisseur
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Cet outil vous permet de comparer automatiquement le coût de toutes les offres disponibles
          en utilisant vos données de consommation réelles récupérées chez Enedis sur les 12 derniers mois.
        </p>
      </div>

      {/* Error Banner */}
      {simulationError && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
                Erreur de simulation
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {simulationError}
              </p>
            </div>
            <button
              onClick={() => setSimulationError(null)}
              className="ml-3 flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-300"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="card space-y-6">
        {/* Configuration Header */}
        <div className="bg-primary-600 text-white px-4 py-3 -mx-6 -mt-6 rounded-t-lg">
          <h2 className="text-xl font-semibold">Configuration</h2>
        </div>

        {/* Warning */}
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 p-4 space-y-2">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Dernière mise à jour des tarifs :</strong> 1er février 2024
          </p>
        </div>

        {/* Cache Warning */}
        <div className="bg-blue-100 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>ℹ️ Information importante :</strong> L'utilisation du simulateur active automatiquement le cache.
            Vos données de consommation seront stockées temporairement sur la passerelle pour améliorer les performances
            et éviter de solliciter excessivement l'API Enedis. Les données en cache expirent automatiquement après 24 heures.
          </p>
        </div>

        {/* PDL Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Point de livraison (PDL) <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedPdl}
            onChange={(e) => setSelectedPdl(e.target.value)}
            className="input max-w-md"
            required
          >
            {pdlsData.map((pdl) => (
              <option key={pdl.id} value={pdl.usage_point_id}>
                {pdl.usage_point_id}
              </option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Sélectionnez le PDL pour lequel vous souhaitez effectuer la simulation
          </p>
        </div>

        {/* Info about automatic simulation */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            ℹ️ La simulation comparera automatiquement <strong>toutes les offres disponibles</strong> dans la base de données
            {(() => {
              const selectedPdlData = pdlsData?.find((p) => p.usage_point_id === selectedPdl)
              const subscribedPower = selectedPdlData?.subscribed_power
              return subscribedPower ? (
                <> correspondant à votre puissance souscrite de <strong>{subscribedPower} kVA</strong></>
              ) : null
            })()}
          </p>
        </div>


        {/* Big kiss to @Grimmlink */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Big kiss to{' '}
          <a
            href="https://github.com/Grimmlink"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            @Grimmlink
          </a>{' '}
          {'<3'}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSimulation}
          disabled={isSimulating || !selectedPdl}
          className="btn btn-primary w-full py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSimulating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={20} />
              {currentProgress.total > 0
                ? `Chargement ${currentProgress.current}/${currentProgress.total}...`
                : 'Simulation en cours...'}
            </span>
          ) : (
            'Lancer la simulation'
          )}
        </button>

        {/* Loading Progress */}
        {isSimulating && loadingProgress.length > 0 && (
          <div className="mt-6 card bg-gray-50 dark:bg-gray-800/50">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Loader2 className="animate-spin text-primary-600" size={20} />
              Progression du chargement
            </h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {[...loadingProgress].reverse().map((message, index) => (
                <div
                  key={index}
                  className="text-sm text-gray-700 dark:text-gray-300 font-mono py-1"
                >
                  {message}
                </div>
              ))}
            </div>
            {currentProgress.total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progression</span>
                  <span className="font-medium">
                    {Math.round((currentProgress.current / currentProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: `${(currentProgress.current / currentProgress.total) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Simulation Results */}
        {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0 && (
          <div className="mt-8 space-y-4">
            <h3 className="text-2xl font-bold mb-4">Comparaison des offres (classées par coût total)</h3>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="p-3 text-left font-semibold">Rang</th>
                    <th className="p-3 text-left font-semibold">Fournisseur</th>
                    <th className="p-3 text-left font-semibold">Offre</th>
                    <th className="p-3 text-right font-semibold">Abonnement/an</th>
                    <th className="p-3 text-right font-semibold">Énergie/an</th>
                    <th className="p-3 text-right font-semibold">Total annuel</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResult.map((result, index) => (
                    <tr
                      key={result.offerId}
                      className={`border-t border-gray-200 dark:border-gray-700 ${
                        index === 0 ? 'bg-green-50 dark:bg-green-900/20 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <td className="p-3">
                        {index === 0 ? (
                          <span className="flex items-center gap-2">
                            🏆 {index + 1}
                          </span>
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </td>
                      <td className="p-3">{result.providerName}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span>{result.offerName}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {result.offerType}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right">{result.subscriptionCost.toFixed(2)} €</td>
                      <td className="p-3 text-right">{result.energyCost.toFixed(2)} €</td>
                      <td className="p-3 text-right font-bold text-primary-600 dark:text-primary-400">
                        {result.totalCost.toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {simulationResult.length > 0 && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  📊 Consommation totale sur la période : <strong>{simulationResult[0].totalKwh.toFixed(2)} kWh</strong>
                </p>
                {simulationResult.length > 1 && (
                  <p className="mt-1">
                    💡 L'offre la moins chère vous permet d'économiser{' '}
                    <strong className="text-green-600 dark:text-green-400">
                      {(simulationResult[simulationResult.length - 1].totalCost - simulationResult[0].totalCost).toFixed(2)} €
                    </strong>
                    {' '}par an par rapport à l'offre la plus chère.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
