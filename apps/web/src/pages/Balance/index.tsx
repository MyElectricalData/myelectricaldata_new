import { useState, useMemo, useEffect, useRef } from 'react'
import { Database, ArrowRight, AlertTriangle, Info } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useBalanceData } from './hooks/useBalanceData'
import { useBalanceCalcs } from './hooks/useBalanceCalcs'
import { useIsDemo } from '@/hooks/useIsDemo'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import type { PDL } from '@/types/api'
import { logger } from '@/utils/logger'
import { BalanceSummaryCards } from './components/BalanceSummaryCards'
import { MonthlyComparison } from './components/MonthlyComparison'
import { NetBalanceCurve } from './components/NetBalanceCurve'
import { YearlyTable } from './components/YearlyTable'
import { InfoBlock } from './components/InfoBlock'
import { AnimatedSection } from '@/components/AnimatedSection'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import type { DateRange } from './types/balance.types'

export default function Balance() {
  const { isDark } = useThemeStore()
  const { selectedPdl } = usePdlStore()
  const { setIsLoading } = useDataFetchStore()
  const isDemo = useIsDemo()
  const demoAutoFetchDone = useRef(false)

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
  const [selectedYears, setSelectedYears] = useState<string[]>([])
  const [isInitialLoadingFromCache, setIsInitialLoadingFromCache] = useState(false)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isInfoExpanded, setIsInfoExpanded] = useState(false)

  // Fetch data from cache
  const {
    balancePdls,
    selectedPDLDetails,
    productionPDL,
    productionPDLDetails,
    consumptionData,
    productionData,
    consumptionDetailData,
    productionDetailData,
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

  // Get PDL list for unified fetch
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
  })
  const allPDLs: PDL[] = Array.isArray(pdlsResponse) ? pdlsResponse : []

  // Hook for demo auto-fetch
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL: selectedPdl,
    selectedPDLDetails,
    allPDLs,
    pageContext: 'all',
  })

  // Check if data is in cache
  const hasDataInCache = hasConsumptionData && hasProductionData

  // Reset loading states when PDL changes
  useEffect(() => {
    setIsInitialLoadingFromCache(false)
    setIsLoadingExiting(false)
    setIsInitializing(true)
  }, [selectedPdl])

  // End initialization after cache has time to hydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 100) // Short delay for cache hydration
    return () => clearTimeout(timer)
  }, [selectedPdl])

  // Auto-fetch data for demo account
  useEffect(() => {
    if (isDemo && selectedPdl && selectedPDLDetails && !demoAutoFetchDone.current && !hasDataInCache && !isInitializing) {
      logger.log('[DEMO] Auto-fetching data for demo account on Balance')
      demoAutoFetchDone.current = true
      setTimeout(async () => {
        setIsLoading(true)
        try {
          await fetchAllData()
        } finally {
          setIsLoading(false)
        }
      }, 300)
    }
  }, [isDemo, selectedPdl, selectedPDLDetails, hasDataInCache, isInitializing, setIsLoading, fetchAllData])

  // Initialize selected years when chartData becomes available
  useEffect(() => {
    if (chartData?.years?.length && selectedYears.length === 0) {
      setSelectedYears(chartData.years)
    }
  }, [chartData?.years, selectedYears.length])

  // Detect cache data and show loading overlay
  // Note: Intentionally not including isInitialLoadingFromCache and isLoadingExiting
  // in deps to prevent infinite loops (this is a "run once when data arrives" effect)
  useEffect(() => {
    // Only trigger if we have data in cache and initialization is complete
    if (!isInitializing && hasConsumptionData && hasProductionData && !isInitialLoadingFromCache && !isLoadingExiting) {
      // Show loading overlay while hydrating cache data
      setIsInitialLoadingFromCache(true)

      // Trigger exit animation after short delay
      setTimeout(() => {
        setIsLoadingExiting(true)
        // Hide loading overlay after exit animation completes (300ms)
        setTimeout(() => {
          setIsInitialLoadingFromCache(false)
          setIsLoadingExiting(false)
        }, 300)
      }, 500) // Small delay to show loading state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing, hasConsumptionData, hasProductionData])

  // Check if selected PDL is valid for balance view
  const isValidForBalance = useMemo(() => {
    if (!selectedPDLDetails) return false
    return selectedPDLDetails.has_production === true || !!selectedPDLDetails.linked_production_pdl_id
  }, [selectedPDLDetails])

  // Block rendering during initialization to prevent flash of content
  if (isInitializing) {
    return <div className="pt-6 w-full" />
  }

  // Show loading overlay when loading cached data
  if (isInitialLoadingFromCache) {
    return (
      <div className="pt-6 w-full">
        <LoadingOverlay dataType="balance" isExiting={isLoadingExiting}>
          <LoadingPlaceholder type="balance" />
        </LoadingOverlay>
      </div>
    )
  }

  // No PDLs with production
  if (balancePdls.length === 0) {
    return (
      <div className="pt-6 w-full">
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
      <div className="pt-6 w-full">
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
      <div className="pt-6 w-full">
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
            {productionPDL !== selectedPdl && productionPDLDetails && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                Note: Ce PDL utilise un PDL de production lié ({productionPDLDetails.name || productionPDLDetails.usage_point_id})
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // No chart data (calculation error)
  if (!chartData) {
    return (
      <div className="pt-6 w-full">
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
    <div className="pt-6 w-full space-y-6">
      {/* Info banner when viewing consumption PDL with linked production */}
      {productionPDL !== selectedPdl && productionPDLDetails && (
        <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl shadow-sm transition-colors duration-200">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                Production liée utilisée
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200">
                Le bilan énergétique utilise les données de production du PDL{' '}
                <span className="font-mono font-semibold">
                  {productionPDLDetails.name || productionPDLDetails.usage_point_id}
                </span>{' '}
                lié au PDL de consommation{' '}
                <span className="font-mono font-semibold">
                  {selectedPDLDetails?.name || selectedPdl}
                </span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <AnimatedSection delay={0} isVisible={true}>
        <BalanceSummaryCards chartData={chartData} hasDetailedData={hasDetailedData} />
      </AnimatedSection>

      {/* Year filter */}
      {chartData.years.length > 1 && (
        <div className="flex gap-4">
          {[...chartData.years].reverse().map((year, index) => {
            const isSelected = selectedYears.includes(year)
            const yearData = chartData.byYear.find(y => y.year === year)
            const productionKwh = yearData ? (yearData.production / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '0'
            // Couleurs correspondant au graphique avec fond semi-transparent
            const styles = [
              { border: 'rgb(16, 185, 129)', bg: 'rgba(16, 185, 129, 0.125)', text: 'text-emerald-400', dot: 'bg-emerald-400' },
              { border: 'rgb(99, 102, 241)', bg: 'rgba(99, 102, 241, 0.125)', text: 'text-indigo-400', dot: 'bg-indigo-400' },
              { border: 'rgb(96, 165, 250)', bg: 'rgba(96, 165, 250, 0.125)', text: 'text-blue-400', dot: 'bg-blue-400' }
            ]
            const style = styles[index % styles.length]
            return (
              <button
                key={year}
                onClick={() => {
                  if (isSelected && selectedYears.length > 1) {
                    setSelectedYears(selectedYears.filter(y => y !== year))
                  } else if (!isSelected) {
                    setSelectedYears([...selectedYears, year])
                  }
                }}
                className={`relative flex-1 px-5 py-4 rounded-xl transition-all text-left border-2 ${
                  isSelected
                    ? style.text
                    : 'border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                style={isSelected ? { backgroundColor: style.bg, borderColor: style.border } : undefined}
              >
                <div className="text-xl font-bold">{year}</div>
                <div className={`text-sm font-medium ${isSelected ? 'opacity-80' : 'opacity-60'}`}>
                  Production : {productionKwh} kWh
                </div>
                {/* Indicateur de sélection */}
                <span className={`absolute top-3 right-3 w-3 h-3 rounded-full transition-all ${
                  isSelected
                    ? style.dot
                    : 'bg-gray-400 dark:bg-gray-600'
                }`} />
              </button>
            )
          })}
        </div>
      )}

      {/* Monthly Comparison Chart */}
      <AnimatedSection delay={100} isVisible={true}>
        <MonthlyComparison
          chartData={chartData}
          isDarkMode={isDark}
          selectedYears={selectedYears}
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

      {/* Info Block */}
      <InfoBlock isExpanded={isInfoExpanded} onToggle={() => setIsInfoExpanded(!isInfoExpanded)} />
    </div>
  )
}
