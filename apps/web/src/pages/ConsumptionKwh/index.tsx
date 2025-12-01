import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, BarChart3, Database, ArrowRight } from 'lucide-react'
import { usePdlStore } from '@/stores/pdlStore'
import { logger } from '@/utils/logger'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { AnimatedSection } from '@/components/AnimatedSection'

// Import custom hooks
import { useConsumptionData } from './hooks/useConsumptionData'
import { useConsumptionFetch } from './hooks/useConsumptionFetch'
import { useConsumptionCalcs } from './hooks/useConsumptionCalcs'

// Import components
import { InfoBlock } from './components/InfoBlock'
import { ConfirmModal } from './components/ConfirmModal'
import { YearlyConsumption } from './components/YearlyConsumption'
import { HcHpDistribution } from './components/HcHpDistribution'
import { YearlyStatCards } from './components/YearlyStatCards'
import { AnnualCurve } from './components/AnnualCurve'
import { DetailedCurve } from '@/components/DetailedCurve'
import { MonthlyHcHp } from './components/MonthlyHcHp'
import { PowerPeaks } from './components/PowerPeaks'

// Renamed from Consumption to ConsumptionKwh
export default function ConsumptionKwh() {
  const { selectedPdl: selectedPDL, setSelectedPdl: setSelectedPDL } = usePdlStore()

  // States
  const [, setIsClearingCache] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false)
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>(null)
  const [isPowerSectionExpanded, setIsPowerSectionExpanded] = useState(true)
  const [isStatsSectionExpanded, setIsStatsSectionExpanded] = useState(true)
  const [isDetailSectionExpanded, setIsDetailSectionExpanded] = useState(true)
  const [detailWeekOffset, setDetailWeekOffset] = useState<number>(0)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, currentRange: '' })
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false)
  const [, setIsLoadingDaily] = useState(false)
  const [dailyLoadingComplete, setDailyLoadingComplete] = useState(false)
  const [powerLoadingComplete, setPowerLoadingComplete] = useState(false)
  const [allLoadingComplete, setAllLoadingComplete] = useState(false)
  const [hcHpCalculationTrigger, setHcHpCalculationTrigger] = useState(0)
  const [, setHcHpCalculationComplete] = useState(false)
  const [dataLimitWarning, setDataLimitWarning] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isInitialLoadingFromCache, setIsInitialLoadingFromCache] = useState(false)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const [isInfoSectionExpanded, setIsInfoSectionExpanded] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)

  // Reset all display states when PDL changes
  useEffect(() => {
    logger.log('[Consumption] PDL changed, resetting display states')
    setIsChartsExpanded(false)
    setIsStatsSectionExpanded(false)
    setIsDetailSectionExpanded(false)
    setIsPowerSectionExpanded(false)
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)
    setDateRange(null)
    setDetailWeekOffset(0)
    setLoadingProgress({ current: 0, total: 0, currentRange: '' })
    setIsInitialLoadingFromCache(false)
    setIsLoadingExiting(false)
    setIsInfoSectionExpanded(true)
    setIsInitializing(true)
  }, [selectedPDL])

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    }
    checkDarkMode()
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    return () => observer.disconnect()
  }, [])

  // End initialization after cache has time to hydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 100) // Short delay for cache hydration
    return () => clearTimeout(timer)
  }, [selectedPDL])

  // Calculate detail date range
  // Use LOCAL time for user's perspective (France timezone)
  const detailDateRange = useMemo(() => {
    if (!dateRange) return null

    const now = new Date()
    const yesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      12, 0, 0, 0  // Use noon to avoid DST edge cases
    )

    const offsetDays = detailWeekOffset * 7

    let endDate_obj = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate() - offsetDays,
      12, 0, 0, 0
    )

    if (endDate_obj > yesterday) {
      endDate_obj = new Date(yesterday)
    }

    const startDate_obj = new Date(
      endDate_obj.getFullYear(),
      endDate_obj.getMonth(),
      endDate_obj.getDate() - 6,
      12, 0, 0, 0
    )

    const startDate = startDate_obj.getFullYear() + '-' +
                      String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getDate()).padStart(2, '0')
    const endDate = endDate_obj.getFullYear() + '-' +
                    String(endDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                    String(endDate_obj.getDate()).padStart(2, '0')

    return { start: startDate, end: endDate }
  }, [dateRange, detailWeekOffset])

  // Use custom hooks
  const {
    activePdls: allActivePdls,
    selectedPDLDetails,
    consumptionData,
    maxPowerData,
    detailData,
    isLoadingConsumption,
    isLoadingPower,
    isLoadingDetail,
    queryClient
  } = useConsumptionData(selectedPDL, dateRange, detailDateRange)

  // Filter PDLs to only show those with consumption capability
  const activePdls = useMemo(() => {
    return allActivePdls.filter(pdl => pdl.has_consumption === true)
  }, [allActivePdls])

  const {
    chartData,
    powerByYearData,
    detailByDayData,
    hcHpByYear,
    monthlyHcHpByYear
  } = useConsumptionCalcs({
    consumptionData,
    maxPowerData,
    detailData,
    selectedPDL,
    selectedPDLDetails,
    hcHpCalculationTrigger,
    detailDateRange
  })

  const { clearCache } = useConsumptionFetch({
    selectedPDL,
    selectedPDLDetails,
    setDateRange,
    setIsChartsExpanded,
    setIsDetailSectionExpanded,
    setIsStatsSectionExpanded,
    setIsPowerSectionExpanded,
    setHcHpCalculationComplete,
    setDailyLoadingComplete,
    setPowerLoadingComplete,
    setAllLoadingComplete,
    setIsLoadingDetailed,
    setLoadingProgress,
    setHcHpCalculationTrigger,
    setIsClearingCache,
  })

  // NOTE: Fetch function registration is now handled by the unified hook in PageHeader
  // We don't register fetchConsumptionData here to avoid conflicts and infinite loops
  // The PageHeader component uses useUnifiedDataFetch which fetches all data types

  // Check if ANY consumption data is in cache (to determine if we should auto-load)
  // Use state to track cache instead of useMemo for better reactivity
  const [cacheCheckTrigger, setCacheCheckTrigger] = useState(0)

  const hasDataInCache = useMemo(() => {
    // Force recalculation by depending on cacheCheckTrigger
    void cacheCheckTrigger

    if (!selectedPDL) return false

    // Check for consumptionDetail data (unified cache key)
    const detailQuery = queryClient.getQueryCache().find({
      queryKey: ['consumptionDetail', selectedPDL],
    })

    if (detailQuery?.state.data) {
      const data = detailQuery.state.data as any
      const readings = data?.data?.meter_reading?.interval_reading
      if (readings && readings.length > 0) {
        logger.log('[Cache] ✓ Found consumptionDetail:', readings.length, 'points')
        return true
      }
    }

    // Also check daily consumption data (unified cache key)
    const dailyQuery = queryClient.getQueryCache().find({
      queryKey: ['consumptionDaily', selectedPDL],
    })

    if (dailyQuery?.state.data) {
      const data = dailyQuery.state.data as any
      const readings = data?.data?.meter_reading?.interval_reading
      if (readings && readings.length > 0) {
        logger.log('[Cache] ✓ Found consumptionDaily:', readings.length, 'days')
        return true
      }
    }

    return false
  }, [selectedPDL, queryClient, cacheCheckTrigger])

  // Poll for cache updates every 500ms for 5 seconds after component mount
  // This catches data fetched by the header button
  useEffect(() => {
    let pollCount = 0
    const maxPolls = 10 // 5 seconds total

    const interval = setInterval(() => {
      pollCount++
      setCacheCheckTrigger(prev => prev + 1)

      if (pollCount >= maxPolls || hasDataInCache) {
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [selectedPDL]) // Re-run when PDL changes

  // Auto-set selectedPDL when there's only one active PDL
  useEffect(() => {
    if (activePdls.length > 0 && !selectedPDL) {
      setSelectedPDL(activePdls[0].usage_point_id)
    }
  }, [activePdls, selectedPDL])

  // Check data limits
  useEffect(() => {
    if (selectedPDLDetails) {
      if (!selectedPDLDetails.has_consumption) {
        setDataLimitWarning("Ce PDL n'a pas l'option consommation activée. Seules les données de puissance maximum peuvent être récupérées.")
      } else {
        setDataLimitWarning(null)
      }
    }
  }, [selectedPDLDetails])

  // Track loading completion
  useEffect(() => {
    if (consumptionData && !isLoadingConsumption) {
      setIsLoadingDaily(false)
      setDailyLoadingComplete(true)
    }
  }, [consumptionData, isLoadingConsumption])

  useEffect(() => {
    if (maxPowerData && !isLoadingPower) {
      setPowerLoadingComplete(true)
    }
  }, [maxPowerData, isLoadingPower])

  useEffect(() => {
    if (dailyLoadingComplete && powerLoadingComplete && !isLoadingDetailed) {
      setAllLoadingComplete(true)
      setIsChartsExpanded(true)
      setIsStatsSectionExpanded(true)
      setIsDetailSectionExpanded(true)
      setIsPowerSectionExpanded(true)
    }
  }, [dailyLoadingComplete, powerLoadingComplete, isLoadingDetailed])

  // Trigger HC/HP calculation
  useEffect(() => {
    if (hcHpCalculationTrigger > 0 && selectedPDLDetails?.offpeak_hours) {
      setTimeout(() => {
        setHcHpCalculationComplete(true)
      }, 500)
    }
  }, [hcHpCalculationTrigger, selectedPDLDetails])

  // Auto-load dateRange from cache when page loads (ALWAYS if cache exists)
  // This runs when cache is detected OR when new data arrives
  useEffect(() => {
    // Only set dateRange if it's null and we have cache
    if (!dateRange && selectedPDL && hasDataInCache) {
      logger.log('[Auto-load] No dateRange set but cache detected - setting dateRange from cache')

      // Show loading overlay while hydrating cache data
      setIsInitialLoadingFromCache(true)

      // Calculate date range (same as in fetchConsumptionData)
      // Use LOCAL time for user's perspective
      const now = new Date()
      const yesterday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 1,
        12, 0, 0, 0  // Use noon to avoid DST edge cases
      )
      const startDate_obj = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate() - 1094,
        12, 0, 0, 0
      )
      const startDate = startDate_obj.getFullYear() + '-' +
                        String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                        String(startDate_obj.getDate()).padStart(2, '0')
      const endDate = yesterday.getFullYear() + '-' +
                      String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
                      String(yesterday.getDate()).padStart(2, '0')

      logger.log('[Auto-load] Setting date range:', startDate, 'to', endDate)

      setDateRange({ start: startDate, end: endDate })

      // Set loading states to complete so sections expand
      setTimeout(() => {
        setDailyLoadingComplete(true)
        setPowerLoadingComplete(true)
        setAllLoadingComplete(true)
        setIsChartsExpanded(true)
        setIsStatsSectionExpanded(true)
        setIsDetailSectionExpanded(true)
        setIsPowerSectionExpanded(true)
        // Trigger HC/HP calculation for cached data
        setHcHpCalculationTrigger(prev => prev + 1)
        // Trigger exit animation
        setIsLoadingExiting(true)
        // Hide loading overlay after exit animation completes (300ms)
        setTimeout(() => {
          setIsInitialLoadingFromCache(false)
          setIsLoadingExiting(false)
        }, 300)

        logger.log('[Auto-load] All states set - graphs should be visible')
      }, 500) // Small delay to let React Query hydrate and show loading state
    }
  }, [selectedPDL, hasDataInCache, dateRange, queryClient])

  // NOTE: Auto-fetch disabled - user must click "Récupérer" button manually
  // The effect above (Auto-load dateRange from cache) still works to display cached data
  // without making any API calls

  // Mark daily consumption loading as complete (whether success or error)
  useEffect(() => {
    logger.log('[Loading Check] Daily:', { dateRange: !!dateRange, isLoading: isLoadingConsumption, hasData: !!consumptionData })
    if (dateRange && !isLoadingConsumption && consumptionData) {
      logger.log('[Loading] ✓ Daily consumption complete')
      setDailyLoadingComplete(true)
    }
  }, [dateRange, isLoadingConsumption, consumptionData])

  // Mark power loading as complete
  useEffect(() => {
    logger.log('[Loading Check] Power:', { dateRange: !!dateRange, isLoading: isLoadingPower, hasData: !!maxPowerData })
    if (dateRange && !isLoadingPower && maxPowerData) {
      logger.log('[Loading] ✓ Power complete')
      setPowerLoadingComplete(true)
    }
  }, [dateRange, isLoadingPower, maxPowerData])

  // Check if data came from cache, mark as complete immediately
  useEffect(() => {
    if (dateRange && !isLoadingConsumption && !isLoadingPower && !isLoadingDetailed &&
        consumptionData && maxPowerData) {
      // Data came from cache, mark as complete immediately
      setDailyLoadingComplete(true)
      setPowerLoadingComplete(true)
      setAllLoadingComplete(true)
    }
  }, [dateRange, isLoadingConsumption, isLoadingPower, isLoadingDetailed, consumptionData, maxPowerData])

  // Check if all loading is complete (daily, power, and detailed if it was started)
  useEffect(() => {
    const dailyAndPowerDone = dailyLoadingComplete && powerLoadingComplete
    const detailedDone = !isLoadingDetailed || loadingProgress.total === 0

    if (dailyAndPowerDone && detailedDone) {
      // Wait a bit to show the completed status before hiding
      const timer = setTimeout(() => {
        setAllLoadingComplete(true)
      }, 1000) // 1 second delay
      return () => clearTimeout(timer)
    }
  }, [dailyLoadingComplete, powerLoadingComplete, isLoadingDetailed, loadingProgress.total])

  // Auto-expand all sections when loading is complete (and collapse info section)
  useEffect(() => {
    logger.log('[Loading] allLoadingComplete changed:', allLoadingComplete)
    if (allLoadingComplete) {
      logger.log('[Loading] ✓ All loading complete - expanding sections, collapsing info')
      setIsStatsSectionExpanded(true)
      setIsChartsExpanded(true)
      setIsDetailSectionExpanded(true)
      setIsPowerSectionExpanded(true)
      setIsInfoSectionExpanded(false) // Collapse info section when data is loaded
    }
  }, [allLoadingComplete])

  // Mark HC/HP calculation as complete when data is ready
  useEffect(() => {
    if (!isLoadingDetailed && hcHpByYear.length > 0) {
      // Give a small delay to ensure the calculation is fully rendered
      const timer = setTimeout(() => {
        setHcHpCalculationComplete(true)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      setHcHpCalculationComplete(false)
    }
  }, [isLoadingDetailed, hcHpByYear.length])

  const confirmClearCache = async () => {
    setShowConfirmModal(false)
    await clearCache()
  }

  // For now, return the simplified version with working components
  // The rest of the components will be added incrementally

  // Block rendering during initialization to prevent flash of content
  if (isInitializing) {
    return <div className="w-full" />
  }

  // Show loading overlay when loading cached data
  // Display blurred placeholder content behind the loading spinner
  if (isInitialLoadingFromCache) {
    return (
      <div className="w-full">
        <LoadingOverlay dataType="consumption" isExiting={isLoadingExiting}>
          <LoadingPlaceholder type="consumption" />
        </LoadingOverlay>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Warning if PDL has limited data */}
      {dataLimitWarning && (
        <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {dataLimitWarning}
          </p>
        </div>
      )}

      {/* Empty State - No data loaded */}
      {!hasDataInCache && !allLoadingComplete && (
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-6">
              <Database className="w-10 h-10 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Aucune donnée de consommation
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour afficher vos statistiques et graphiques de consommation,
              lancez la récupération des données en cliquant sur le bouton
              <span className="font-semibold text-primary-600 dark:text-primary-400"> Récupérer </span>
              en haut à droite de la page.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Sélectionnez un PDL</span>
              <ArrowRight className="w-4 h-4" />
              <span>Cliquez sur "Récupérer"</span>
              <ArrowRight className="w-4 h-4" />
              <span>Visualisez vos données</span>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Section - Collapsible (only show if data is available) */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={0}>
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (allLoadingComplete) {
                setIsStatsSectionExpanded(!isStatsSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Statistiques de consommation
              </h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isStatsSectionExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isStatsSectionExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isStatsSectionExpanded && allLoadingComplete && (
            <div className="px-6 pb-6">
              {/* Yearly Statistics Cards */}
              <YearlyStatCards
                chartData={chartData}
                consumptionData={consumptionData}
              />

              {/* HC/HP Distribution */}
              <HcHpDistribution
                hcHpByYear={hcHpByYear}
                selectedPDLDetails={selectedPDLDetails}
              />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Charts Section - Annual Curve */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={100}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (allLoadingComplete) {
                setIsChartsExpanded(!isChartsExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Graphiques de consommation
              </h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isChartsExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isChartsExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isChartsExpanded && allLoadingComplete && (
            <div className="px-6 pb-6 space-y-8">
              {/* Yearly Consumption by Month */}
              <YearlyConsumption
                chartData={chartData}
                consumptionData={consumptionData}
                isDarkMode={isDarkMode}
              />

              {/* Annual Curve */}
              <AnnualCurve
                chartData={chartData}
                isDarkMode={isDarkMode}
              />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Detailed Consumption Section */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={200}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              allLoadingComplete && detailByDayData.length > 0 ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (allLoadingComplete && detailByDayData.length > 0) {
                setIsDetailSectionExpanded(!isDetailSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Courbe de charge détaillée
              </h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isDetailSectionExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isDetailSectionExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isDetailSectionExpanded && allLoadingComplete && detailByDayData.length > 0 && (
            <div className="px-6 pb-6 space-y-8">
              {/* Detailed Load Curve */}
              <DetailedCurve
                cacheKeyPrefix="consumptionDetail"
                curveName="Consommation"
                detailByDayData={detailByDayData}
                selectedPDL={selectedPDL}
                isDarkMode={isDarkMode}
                isLoadingDetail={isLoadingDetail}
                detailDateRange={detailDateRange}
                onWeekOffsetChange={setDetailWeekOffset}
                detailWeekOffset={detailWeekOffset}
              />

              {/* Monthly HC/HP */}
              <MonthlyHcHp
                monthlyHcHpByYear={monthlyHcHpByYear}
                selectedPDLDetails={selectedPDLDetails}
                isDarkMode={isDarkMode}
              />

              {/* Info note */}
              {detailByDayData.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>ℹ️ Note :</strong> Ces graphiques montrent votre consommation électrique détaillée avec des mesures à intervalles réguliers
                    ({detailData?.meter_reading?.reading_type?.interval_length === 'P30M' ? '30 minutes' :
                      detailData?.meter_reading?.reading_type?.interval_length === 'P15M' ? '15 minutes' :
                      detailData?.meter_reading?.reading_type?.interval_length || 'variables'})
                    pour les 7 derniers jours.
                    Cela vous permet d'identifier précisément vos pics de consommation et d'optimiser votre utilisation.
                    <br/><br/>
                    <strong>💡 Calcul :</strong> Les valeurs sont en puissance moyenne (kW) pour chaque intervalle.
                    L'énergie consommée pendant l'intervalle est calculée en tenant compte de la durée
                    (Énergie = Puissance × Durée). Le total journalier affiché dans les onglets correspond à la somme
                    de tous les intervalles de la journée.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Max Power Section */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={300}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (allLoadingComplete) {
                setIsPowerSectionExpanded(!isPowerSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pics de puissance maximale</h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isPowerSectionExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isPowerSectionExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isPowerSectionExpanded && allLoadingComplete && powerByYearData.length > 0 && (
            <div className="px-6 pb-6">
              <PowerPeaks
                powerByYearData={powerByYearData}
                selectedPDLDetails={selectedPDLDetails}
                isDarkMode={isDarkMode}
              />
            </div>
          )}
        </div>
      </AnimatedSection>


      {/* Info Block Component - Always visible, collapsible */}
      <InfoBlock
        isExpanded={isInfoSectionExpanded}
        onToggle={() => setIsInfoSectionExpanded(!isInfoSectionExpanded)}
      />

      {/* Confirm Modal Component */}
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        setShowConfirmModal={setShowConfirmModal}
        confirmClearCache={confirmClearCache}
      />
    </div>
  )
}