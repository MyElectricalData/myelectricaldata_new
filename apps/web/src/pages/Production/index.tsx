import { useState, useEffect, useMemo, useRef } from 'react'
import { Zap, BarChart3, Database, ArrowRight, Info, LineChart } from 'lucide-react'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import type { PDL } from '@/types/api'
import { logger } from '@/utils/logger'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { AnimatedSection } from '@/components/AnimatedSection'
import { useIsDemo } from '@/hooks/useIsDemo'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'

// Import custom hooks
import { useProductionData } from './hooks/useProductionData'
import { useProductionFetch } from './hooks/useProductionFetch'
import { useProductionCalcs } from './hooks/useProductionCalcs'

// Import components
import { YearlyProductionCards } from './components/YearlyProductionCards'
import { YearlyProduction } from './components/YearlyProduction'
import { AnnualProductionCurve } from './components/AnnualProductionCurve'
import { DetailedCurve } from '@/components/DetailedCurve'

export default function Production() {
  const { selectedPdl: selectedPDL, setSelectedPdl: setSelectedPDL } = usePdlStore()
  const { setIsLoading } = useDataFetchStore()
  const isDemo = useIsDemo()
  const demoAutoFetchDone = useRef(false)
  const lastAutoFetchPDL = useRef<string | null>(null)

  // States
  const [, setIsClearingCache] = useState(false)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false)
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>(null)
  const [isStatsSectionExpanded, setIsStatsSectionExpanded] = useState(true)
  const [isDetailSectionExpanded, setIsDetailSectionExpanded] = useState(true)
  const [, setLoadingProgress] = useState({ current: 0, total: 0, currentRange: '' })
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false)
  const [dailyLoadingComplete, setDailyLoadingComplete] = useState(false)
  const [allLoadingComplete, setAllLoadingComplete] = useState(false)
  const [dataLimitWarning, setDataLimitWarning] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [detailWeekOffset, setDetailWeekOffset] = useState(0)
  const [isInitialLoadingFromCache, setIsInitialLoadingFromCache] = useState(false)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const [isInfoSectionExpanded, setIsInfoSectionExpanded] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)

  // Reset all display states when PDL changes
  useEffect(() => {
    logger.log('[Production] PDL changed, resetting display states')
    setIsChartsExpanded(false)
    setIsStatsSectionExpanded(false)
    setIsDetailSectionExpanded(false)
    setDailyLoadingComplete(false)
    setAllLoadingComplete(false)
    setDateRange(null)
    setDetailWeekOffset(0)
    setLoadingProgress({ current: 0, total: 0, currentRange: '' })
    setIsInitialLoadingFromCache(false)
    setIsLoadingExiting(false)
    setIsInfoSectionExpanded(true)
    setIsInitializing(true)
    setDataLimitWarning(null) // Reset warning while loading new PDL
    setHasDataInCache(false) // Reset cache state for new PDL
  }, [selectedPDL])

  // End initialization after cache has time to hydrate
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 100) // Short delay for cache hydration
    return () => clearTimeout(timer)
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

    const startDate_obj = new Date(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate() - 6,
      12, 0, 0, 0
    )

    const startDate = startDate_obj.getFullYear() + '-' +
                      String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getDate()).padStart(2, '0')
    const endDate = yesterday.getFullYear() + '-' +
                    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
                    String(yesterday.getDate()).padStart(2, '0')

    return { start: startDate, end: endDate }
  }, [dateRange])

  // STEP 1: First fetch PDL list to determine actualProductionPDL
  const { data: pdlsData } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
  })
  const pdls: PDL[] = Array.isArray(pdlsData) ? pdlsData : []
  const activePdls = pdls.filter(p => p.is_active !== false && p.has_production === true)
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // STEP 2: Calculate actualProductionPDL BEFORE calling useProductionData
  // Get the actual production PDL usage_point_id to use for fetching data
  // IMPORTANT: linked_production_pdl_id contains the UUID (id), not usage_point_id
  // We need to convert it to usage_point_id for API calls
  const actualProductionPDL = useMemo(() => {
    if (!selectedPDL) return null

    const pdlDetails = pdls.find(p => p.usage_point_id === selectedPDL)
    if (!pdlDetails) return selectedPDL

    // If it's a consumption PDL with linked production
    if (pdlDetails.has_consumption && pdlDetails.linked_production_pdl_id) {
      // linked_production_pdl_id is the UUID (id), need to find the usage_point_id
      const linkedPdl = pdls.find(p => p.id === pdlDetails.linked_production_pdl_id)
      if (linkedPdl) {
        logger.log('[Production] Using linked production PDL:', linkedPdl.usage_point_id, 'for consumption PDL:', selectedPDL)
        return linkedPdl.usage_point_id
      }
    }

    // Otherwise, use the selected PDL as-is (it's already a production PDL)
    return selectedPDL
  }, [selectedPDL, pdls])

  // Check if we're viewing a consumption PDL with linked production
  const isConsumptionPDLWithProduction = useMemo(() => {
    if (!selectedPDL || !pdls.length) return false

    const pdlDetails = pdls.find(p => p.usage_point_id === selectedPDL)
    return !!(pdlDetails?.has_consumption && pdlDetails?.linked_production_pdl_id)
  }, [selectedPDL, pdls])

  // Get the linked production PDL details for display
  const linkedProductionPDLDetails = useMemo(() => {
    if (!isConsumptionPDLWithProduction || !selectedPDLDetails?.linked_production_pdl_id) return null

    // Find the production PDL by its UUID (id)
    return pdls.find(p => p.id === selectedPDLDetails.linked_production_pdl_id)
  }, [isConsumptionPDLWithProduction, selectedPDLDetails, pdls])

  // STEP 3: Now use hooks with actualProductionPDL for fetching data
  const {
    productionData,
    detailData,
    isLoadingProduction,
    isLoadingDetail,
    queryClient
  } = useProductionData(actualProductionPDL || '', dateRange, detailDateRange)

  // On the Production page, show consumption PDLs that have linked production
  // and standalone production PDLs (not linked to any consumption)
  const availableProductionPdls = useMemo(() => {
    if (!pdls.length) return []

    // 1. Get consumption PDLs that have a linked production PDL
    const consumptionWithProduction = pdls.filter(pdl =>
      pdl.has_consumption &&
      pdl.is_active &&
      pdl.linked_production_pdl_id
    )

    // 2. Get production PDLs that are NOT linked to any consumption PDL
    const linkedProductionIds = new Set(
      pdls
        .filter(pdl => pdl.has_consumption && pdl.linked_production_pdl_id)
        .map(pdl => pdl.linked_production_pdl_id)
    )
    const standaloneProductionPdls = activePdls.filter(pdl =>
      pdl.has_production &&
      !linkedProductionIds.has(pdl.usage_point_id)
    )

    // Combine both: consumption PDLs with production + standalone production PDLs
    return [...consumptionWithProduction, ...standaloneProductionPdls]
  }, [activePdls, pdls])

  const {
    chartData,
    detailByDayData,
  } = useProductionCalcs({
    productionData,
    detailData,
  })

  // NOTE: useProductionFetch is called but we don't use fetchProductionData directly
  // Data fetching is handled by useUnifiedDataFetch in PageHeader
  useProductionFetch({
    selectedPDL: actualProductionPDL || '',
    selectedPDLDetails,
    setDateRange,
    setIsChartsExpanded,
    setIsDetailSectionExpanded,
    setIsStatsSectionExpanded,
    setDailyLoadingComplete,
    setAllLoadingComplete,
    setIsLoadingDetailed,
    setLoadingProgress,
    setIsClearingCache,
  })

  // Hook for demo auto-fetch
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL,
    selectedPDLDetails,
    allPDLs: pdls,
    pageContext: 'production',
  })

  // Check if ANY production data is in cache
  // Use state instead of useMemo for proper reactivity to cache updates
  const [hasDataInCache, setHasDataInCache] = useState(false)

  // Check cache on mount and when PDL changes
  // IMPORTANT: Wait for pdls to be loaded so actualProductionPDL is correct
  useEffect(() => {
    // Don't check cache until PDLs are loaded
    if (!pdls.length) {
      logger.log('[Cache Detection] Waiting for PDLs to load...')
      return
    }

    const pdlToCheck = actualProductionPDL || selectedPDL
    if (!pdlToCheck) {
      setHasDataInCache(false)
      return
    }

    logger.log('[Cache Detection] Checking cache for PDL:', pdlToCheck, '(actualProductionPDL:', actualProductionPDL, ', selectedPDL:', selectedPDL, ')')

    const checkCache = () => {
      const cachedData = queryClient.getQueryData(['productionDetail', pdlToCheck]) as any
      if (cachedData?.data?.meter_reading?.interval_reading?.length > 0) {
        const readings = cachedData.data.meter_reading.interval_reading
        logger.log('[Cache Detection] ✓ Production cache found!', readings.length, 'points')
        setHasDataInCache(true)
        return true
      }
      return false
    }

    // Initial check
    if (!checkCache()) {
      logger.log('[Cache Detection] ✗ No production cache found for PDL:', pdlToCheck)
      setHasDataInCache(false)
    }
  }, [actualProductionPDL, selectedPDL, queryClient, pdls.length])

  // Poll for cache updates (catches data fetched by header or demo auto-fetch)
  // IMPORTANT: Wait for pdls to be loaded so actualProductionPDL is correct
  useEffect(() => {
    // Don't poll until PDLs are loaded
    if (!pdls.length) return

    const pdlToCheck = actualProductionPDL || selectedPDL
    if (!pdlToCheck || hasDataInCache) return

    logger.log('[Cache Poll] Starting poll for PDL:', pdlToCheck)

    let pollCount = 0
    const maxPolls = 20 // 10 seconds total

    const interval = setInterval(() => {
      pollCount++

      const cachedData = queryClient.getQueryData(['productionDetail', pdlToCheck]) as any
      if (cachedData?.data?.meter_reading?.interval_reading?.length > 0) {
        logger.log('[Cache Poll] ✓ Production cache now available!')
        setHasDataInCache(true)
        clearInterval(interval)
        return
      }

      if (pollCount >= maxPolls) {
        logger.log('[Cache Poll] Max polls reached, stopping')
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [actualProductionPDL, selectedPDL, queryClient, hasDataInCache, pdls.length])

  // Auto-fetch data for demo account
  useEffect(() => {
    // Reset demoAutoFetchDone when PDL changes
    if (selectedPDL && selectedPDL !== lastAutoFetchPDL.current) {
      demoAutoFetchDone.current = false
    }

    // Wait for PDLs to be loaded before auto-fetching
    if (!pdls.length) return

    if (isDemo && selectedPDL && selectedPDLDetails && !demoAutoFetchDone.current && !hasDataInCache && !isInitializing) {
      logger.log('[DEMO] Auto-fetching production data for demo account, PDL:', selectedPDL, 'actualProductionPDL:', actualProductionPDL)
      demoAutoFetchDone.current = true
      lastAutoFetchPDL.current = selectedPDL
      // Small delay to ensure everything is mounted
      setTimeout(async () => {
        setIsLoading(true)
        try {
          await fetchAllData()
        } finally {
          setIsLoading(false)
        }
      }, 300)
    }
  }, [isDemo, selectedPDL, selectedPDLDetails, hasDataInCache, isInitializing, setIsLoading, fetchAllData, pdls.length, actualProductionPDL])

  // Auto-set selectedPDL when there's only one available (non-linked) PDL
  useEffect(() => {
    if (availableProductionPdls.length > 0 && !selectedPDL) {
      setSelectedPDL(availableProductionPdls[0].usage_point_id)
    }
  }, [availableProductionPdls, selectedPDL, setSelectedPDL])

  // Check data limits - only after PDLs are loaded
  useEffect(() => {
    // Wait for PDLs to be loaded before checking
    if (!pdls.length) return

    if (selectedPDLDetails) {
      // Don't show warning if PDL has linked production
      const hasLinkedProduction = selectedPDLDetails.has_consumption && selectedPDLDetails.linked_production_pdl_id

      logger.log('[Production] Data limits check:', {
        pdl: selectedPDL,
        has_production: selectedPDLDetails.has_production,
        has_consumption: selectedPDLDetails.has_consumption,
        linked_production_pdl_id: selectedPDLDetails.linked_production_pdl_id,
        hasLinkedProduction,
      })

      if (!selectedPDLDetails.has_production && !hasLinkedProduction) {
        setDataLimitWarning("Ce PDL n'a pas l'option production activée.")
      } else {
        setDataLimitWarning(null)
      }
    } else if (selectedPDL) {
      // PDL selected but details not found yet - clear warning while loading
      setDataLimitWarning(null)
    }
  }, [selectedPDLDetails, pdls.length, selectedPDL])

  // Track loading completion
  useEffect(() => {
    if (productionData && !isLoadingProduction) {
      setDailyLoadingComplete(true)
    }
  }, [productionData, isLoadingProduction])

  useEffect(() => {
    if (dailyLoadingComplete && !isLoadingDetailed) {
      setAllLoadingComplete(true)
      setIsChartsExpanded(true)
      setIsStatsSectionExpanded(true)
      setIsDetailSectionExpanded(true)
      setIsInfoSectionExpanded(false) // Collapse info section when data is loaded
    }
  }, [dailyLoadingComplete, isLoadingDetailed])

  // Auto-load dateRange from cache when page loads (ALWAYS if cache exists)
  useEffect(() => {
    // Only set dateRange if it's null and we have cache
    if (!dateRange && selectedPDL && hasDataInCache) {
      logger.log('[Auto-load] No dateRange set but cache detected - setting dateRange from cache')

      // Show loading overlay while hydrating cache data
      setIsInitialLoadingFromCache(true)

      // Calculate date range (same as in fetchProductionData)
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
        setAllLoadingComplete(true)
        setIsChartsExpanded(true)
        setIsStatsSectionExpanded(true)
        setIsDetailSectionExpanded(true)
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
  }, [selectedPDL, hasDataInCache, dateRange])

  // NOTE: Auto-fetch disabled - user must click "Récupérer" button manually
  // The effect above (Auto-load dateRange from cache) still works to display cached data
  // without making any API calls

  // Block rendering during initialization to prevent flash of content
  if (isInitializing) {
    return <div className="pt-6 w-full" />
  }

  // Show loading overlay when loading cached data
  // Display blurred placeholder content behind the loading spinner
  if (isInitialLoadingFromCache) {
    return (
      <div className="pt-6 w-full">
        <LoadingOverlay dataType="production" isExiting={isLoadingExiting}>
          <LoadingPlaceholder type="production" />
        </LoadingOverlay>
      </div>
    )
  }

  return (
    <div className="pt-6 w-full">
      {/* Warning if PDL has limited data */}
      {dataLimitWarning && (
        <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
          <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
          <p className="text-sm text-blue-800 dark:text-blue-200">
            {dataLimitWarning}
          </p>
        </div>
      )}

      {/* Info banner when viewing consumption PDL with linked production */}
      {isConsumptionPDLWithProduction && linkedProductionPDLDetails && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-2 border-green-300 dark:border-green-700 rounded-xl shadow-sm">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                Production liée affichée
              </h3>
              <p className="text-sm text-green-800 dark:text-green-200">
                Vous consultez les données de production du PDL{' '}
                <span className="font-mono font-semibold">
                  {linkedProductionPDLDetails.name || linkedProductionPDLDetails.usage_point_id}
                </span>{' '}
                lié au PDL de consommation{' '}
                <span className="font-mono font-semibold">
                  {selectedPDLDetails?.name || selectedPDL}
                </span>.{' '}
                Une vue combinée consommation/production est également disponible sur la page Consommation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State - No data loaded */}
      {!hasDataInCache && !allLoadingComplete && (
        <div className="mt-2 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6">
              <Database className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Aucune donnée de production
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour afficher vos statistiques et graphiques de production,
              lancez la récupération des données en cliquant sur le bouton
              <span className="font-semibold text-green-600 dark:text-green-400"> Récupérer </span>
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

      {/* Statistics Section */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={0}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
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
              <Zap className="text-amber-500 dark:text-amber-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Statistiques de production
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
            <div className="px-6 pb-6 space-y-6">
              <YearlyProductionCards chartData={chartData} productionData={productionData} />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Charts Section */}
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
              <BarChart3 className="text-emerald-500 dark:text-emerald-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Graphiques de production
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
              <YearlyProduction chartData={chartData} productionData={productionData} isDarkMode={isDarkMode} />
              <AnnualProductionCurve chartData={chartData} isDarkMode={isDarkMode} />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Detailed Production Curve Section */}
      <AnimatedSection isVisible={hasDataInCache || allLoadingComplete} delay={200}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              allLoadingComplete ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (allLoadingComplete) {
                setIsDetailSectionExpanded(!isDetailSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <LineChart className="text-indigo-500 dark:text-indigo-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Courbe de production détaillée
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

        {isDetailSectionExpanded && allLoadingComplete && (
          <div className="px-6 pb-6">
            <DetailedCurve
              cacheKeyPrefix="productionDetail"
              curveName="Production"
              detailByDayData={detailByDayData}
              selectedPDL={actualProductionPDL}
              isDarkMode={isDarkMode}
              isLoadingDetail={isLoadingDetail}
              detailDateRange={detailDateRange}
              onWeekOffsetChange={setDetailWeekOffset}
              detailWeekOffset={detailWeekOffset}
            />
          </div>
        )}
        </div>
      </AnimatedSection>

      {/* Info Block - Always visible, collapsible */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
        <div
          className="flex items-center justify-between p-6 cursor-pointer"
          onClick={() => setIsInfoSectionExpanded(!isInfoSectionExpanded)}
        >
          <div className="flex items-center gap-2">
            <Info className="text-blue-500 dark:text-blue-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Informations importantes
            </h3>
          </div>
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            {isInfoSectionExpanded ? (
              <span className="text-sm">Réduire</span>
            ) : (
              <span className="text-sm">Développer</span>
            )}
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${
                isInfoSectionExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {isInfoSectionExpanded && (
          <div className="px-6 pb-6 space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>💾 Cache automatique :</strong> L'utilisation de la page de production active automatiquement le cache. Vos données de production seront stockées temporairement pour améliorer les performances. Les données en cache expirent automatiquement après <strong>24 heures</strong>.
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                <p><strong>📊 Source des données :</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Les données sont récupérées depuis l'API <strong>Enedis Data Connect</strong></li>
                  <li>Données quotidiennes : <strong>1095 jours</strong> d'historique (3 ans)</li>
                  <li>Données détaillées (30 min) : <strong>730 jours</strong> d'historique (2 ans)</li>
                  <li>Les données Enedis ne sont disponibles qu'en <strong>J-1</strong> (hier)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {dataLimitWarning && (
        <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            <strong>⚠️ Note :</strong> {dataLimitWarning}
          </p>
        </div>
      )}
    </div>
  )
}
