import { useState, useMemo } from 'react'
import { Database, ArrowRight, AlertTriangle, Info } from 'lucide-react'
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
  const { selectedPdl } = usePdlStore()

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

  // Check if selected PDL is valid for balance view
  const isValidForBalance = useMemo(() => {
    if (!selectedPDLDetails) return false
    return selectedPDLDetails.has_production === true || !!selectedPDLDetails.linked_production_pdl_id
  }, [selectedPDLDetails])

  // No PDLs with production
  if (balancePdls.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-6">
              <AlertTriangle className="w-10 h-10 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Aucun PDL avec production détecté
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour accéder au bilan énergétique, vous devez avoir au moins un PDL avec des données de production.
              Rendez-vous sur la page <span className="font-semibold text-primary-600 dark:text-primary-400">Production</span> pour configurer votre PDL producteur.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Selected PDL is not valid for balance
  if (!isValidForBalance) {
    return (
      <div className="w-full">
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
              <Info className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              PDL sélectionné sans production
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Le PDL actuellement sélectionné n'a pas de données de production.
              Sélectionnez un PDL avec production dans le sélecteur en haut de page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // No data in cache - Empty state similar to ConsumptionKwh
  if (!hasConsumptionData || !hasProductionData) {
    return (
      <div className="w-full">
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-6">
              <Database className="w-10 h-10 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Données non disponibles en cache
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour afficher le bilan énergétique, vous devez d'abord charger les données
              en cliquant sur le bouton
              <span className="font-semibold text-primary-600 dark:text-primary-400"> Récupérer </span>
              en haut à droite de la page.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
              <span>Sélectionnez un PDL</span>
              <ArrowRight className="w-4 h-4" />
              <span>Cliquez sur "Récupérer"</span>
              <ArrowRight className="w-4 h-4" />
              <span>Visualisez votre bilan</span>
            </div>
            {(!hasConsumptionData || !hasProductionData) && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                <p className="mb-1">Données manquantes :</p>
                <ul className="list-disc list-inside">
                  {!hasConsumptionData && <li>Consommation</li>}
                  {!hasProductionData && <li>Production</li>}
                </ul>
              </div>
            )}
            {productionPDL !== selectedPdl && productionPDL && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Note: Ce PDL utilise un PDL de production lié ({productionPDL})
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  // No chart data (calculation error)
  if (!chartData) {
    return (
      <div className="w-full">
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
              <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Erreur de calcul
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md">
              Une erreur est survenue lors du calcul des données de bilan.
              Veuillez recharger les données depuis les pages Consommation et Production.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Main content with data
  return (
    <div className="w-full space-y-6">
      {/* Linked PDL info */}
      {productionPDL !== selectedPdl && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 transition-colors duration-200">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <Info className="inline mr-2" size={16} />
            Production liée au PDL: <strong>{productionPDL}</strong>
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <AnimatedSection delay={0} isVisible={true}>
        <BalanceSummaryCards chartData={chartData} hasDetailedData={hasDetailedData} />
      </AnimatedSection>

      {/* Year filter */}
      {chartData.years.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtrer par année:</span>
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
      <AnimatedSection delay={100} isVisible={true}>
        <MonthlyComparison
          chartData={chartData}
          isDarkMode={isDark}
          selectedYear={selectedYear}
        />
      </AnimatedSection>

      {/* Net Balance Curve */}
      <AnimatedSection delay={200} isVisible={true}>
        <NetBalanceCurve chartData={chartData} isDarkMode={isDark} />
      </AnimatedSection>

      {/* Yearly Table */}
      <AnimatedSection delay={300} isVisible={true}>
        <YearlyTable chartData={chartData} hasDetailedData={hasDetailedData} />
      </AnimatedSection>

      {/* Info about self-consumption calculation */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 transition-colors duration-200">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
          <Info size={18} className="text-gray-500" />
          À propos du taux d'autoconsommation
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {hasDetailedData ? (
            <>
              Le taux d'autoconsommation est calculé précisément à partir des données 30 minutes.
              Il représente la part de votre production solaire que vous consommez directement,
              sans passer par le réseau.
            </>
          ) : (
            <>
              Le taux d'autoconsommation est <strong>estimé</strong> à partir des données journalières.
              Pour un calcul plus précis, chargez les données détaillées (courbe de charge 30min)
              depuis les pages Consommation et Production.
            </>
          )}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
          Formule: Autoconsommation = min(Production, Consommation) / Production × 100
        </p>
      </div>
    </div>
  )
}
