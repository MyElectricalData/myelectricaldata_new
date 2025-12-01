import { useState, useEffect, useMemo } from 'react'
import { Scale, AlertTriangle, Info } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { usePdlStore } from '@/stores/pdlStore'
import { useBalanceData } from './hooks/useBalanceData'
import { useBalanceCalcs } from './hooks/useBalanceCalcs'
import { BalanceSummaryCards } from './components/BalanceSummaryCards'
import { MonthlyComparison } from './components/MonthlyComparison'
import { NetBalanceCurve } from './components/NetBalanceCurve'
import { YearlyTable } from './components/YearlyTable'
import { AnimatedSection } from '@/components/AnimatedSection'
import type { DateRange } from './types/balance.types'

export default function Balance() {
  const { isDark } = useThemeStore()
  const { selectedPdl, setSelectedPdl } = usePdlStore()

  // Default date range: 3 years back
  const defaultDateRange = useMemo((): DateRange => {
    const end = new Date()
    const start = new Date()
    start.setFullYear(start.getFullYear() - 3)
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    }
  }, [])

  const [dateRange] = useState<DateRange>(defaultDateRange)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)

  // Fetch data from cache
  const {
    balancePdls,
    selectedPDLDetails,
    productionPDL,
    consumptionData,
    productionData,
    consumptionDetailData,
    productionDetailData,
    isLoading,
    hasConsumptionData,
    hasProductionData,
    hasDetailedData
  } = useBalanceData(selectedPdl, dateRange)

  // Calculate balance data
  const chartData = useBalanceCalcs(
    consumptionData,
    productionData,
    consumptionDetailData,
    productionDetailData
  )

  // Auto-select first balance PDL if none selected
  useEffect(() => {
    if (!selectedPdl && balancePdls.length > 0) {
      setSelectedPdl(balancePdls[0].usage_point_id)
    }
  }, [selectedPdl, balancePdls, setSelectedPdl])

  // Check if selected PDL is valid for balance view
  const isValidForBalance = useMemo(() => {
    if (!selectedPDLDetails) return false
    return selectedPDLDetails.has_production === true || !!selectedPDLDetails.linked_production_pdl_id
  }, [selectedPDLDetails])

  // No PDLs with production
  if (balancePdls.length === 0) {
    return (
      <div className="pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Production vs Consommation</p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                Aucun PDL avec production detecte
              </h3>
              <p className="text-yellow-700 dark:text-yellow-300 text-sm">
                Pour acceder au bilan energetique, vous devez avoir au moins un PDL avec des donnees de production.
                Rendez-vous sur la page <strong>Production</strong> pour configurer votre PDL producteur.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Selected PDL is not valid for balance
  if (!isValidForBalance) {
    return (
      <div className="pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Production vs Consommation</p>
        </div>

        {/* PDL Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Selectionner un PDL avec production
          </label>
          <select
            value={selectedPdl}
            onChange={(e) => setSelectedPdl(e.target.value)}
            className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {balancePdls.map((pdl) => (
              <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                {pdl.usage_point_id} {pdl.alias ? `(${pdl.alias})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                PDL selectionne sans production
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-sm">
                Le PDL actuellement selectionne n'a pas de donnees de production.
                Selectionnez un PDL avec production dans la liste ci-dessus.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No data in cache
  if (!hasConsumptionData || !hasProductionData) {
    return (
      <div className="pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Production vs Consommation</p>
        </div>

        {/* PDL Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            PDL selectionne
          </label>
          <select
            value={selectedPdl}
            onChange={(e) => setSelectedPdl(e.target.value)}
            className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {balancePdls.map((pdl) => (
              <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                {pdl.usage_point_id} {pdl.alias ? `(${pdl.alias})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={24} />
            <div>
              <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
                Donnees non disponibles en cache
              </h3>
              <p className="text-blue-700 dark:text-blue-300 text-sm mb-3">
                Pour afficher le bilan energetique, vous devez d'abord charger les donnees :
              </p>
              <ul className="text-blue-700 dark:text-blue-300 text-sm list-disc list-inside space-y-1">
                {!hasConsumptionData && (
                  <li>Rendez-vous sur la page <strong>Consommation</strong> et cliquez sur "Recuperer les donnees"</li>
                )}
                {!hasProductionData && (
                  <li>Rendez-vous sur la page <strong>Production</strong> et cliquez sur "Recuperer les donnees"</li>
                )}
              </ul>
              {productionPDL !== selectedPdl && (
                <p className="text-blue-600 dark:text-blue-400 text-xs mt-3">
                  Note: Ce PDL utilise un PDL de production lie ({productionPDL})
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Production vs Consommation</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  // No chart data
  if (!chartData) {
    return (
      <div className="pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Production vs Consommation</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <p className="text-red-700 dark:text-red-300">
            Erreur lors du calcul des donnees de bilan.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Scale className="text-primary-600 dark:text-primary-400" size={32} />
            Bilan Energetique
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Production vs Consommation - PDL {selectedPdl}
          </p>
        </div>

        {/* PDL Selector */}
        {balancePdls.length > 1 && (
          <select
            value={selectedPdl}
            onChange={(e) => setSelectedPdl(e.target.value)}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {balancePdls.map((pdl) => (
              <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                {pdl.usage_point_id} {pdl.alias ? `(${pdl.alias})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Linked PDL info */}
      {productionPDL !== selectedPdl && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <Info className="inline mr-2" size={16} />
            Production liee au PDL: <strong>{productionPDL}</strong>
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <AnimatedSection delay={0}>
        <BalanceSummaryCards chartData={chartData} hasDetailedData={hasDetailedData} />
      </AnimatedSection>

      {/* Year filter */}
      {chartData.years.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtrer par annee:</span>
          <button
            onClick={() => setSelectedYear(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedYear === null
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Toutes
          </button>
          {chartData.years.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedYear === year
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {/* Monthly Comparison Chart */}
      <AnimatedSection delay={100}>
        <MonthlyComparison
          chartData={chartData}
          isDarkMode={isDark}
          selectedYear={selectedYear}
        />
      </AnimatedSection>

      {/* Net Balance Curve */}
      <AnimatedSection delay={200}>
        <NetBalanceCurve chartData={chartData} isDarkMode={isDark} />
      </AnimatedSection>

      {/* Yearly Table */}
      <AnimatedSection delay={300}>
        <YearlyTable chartData={chartData} hasDetailedData={hasDetailedData} />
      </AnimatedSection>

      {/* Info about self-consumption calculation */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Info size={18} className="text-gray-500" />
          A propos du taux d'autoconsommation
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {hasDetailedData ? (
            <>
              Le taux d'autoconsommation est calcule precisement a partir des donnees 30 minutes.
              Il represente la part de votre production solaire que vous consommez directement,
              sans passer par le reseau.
            </>
          ) : (
            <>
              Le taux d'autoconsommation est <strong>estime</strong> a partir des donnees journalieres.
              Pour un calcul plus precis, chargez les donnees detaillees (courbe de charge 30min)
              depuis les pages Consommation et Production.
            </>
          )}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Formule: Autoconsommation = min(Production, Consommation) / Production x 100
        </p>
      </div>
    </div>
  )
}
