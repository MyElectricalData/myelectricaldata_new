import { useState, useEffect, useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePdlStore } from '@/stores/pdlStore'
import type { PDL } from '@/types/api'
import { useIsDemo } from '@/hooks/useIsDemo'
import { logger } from '@/utils/logger'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'

// Import custom hooks
import { useProductionData } from './hooks/useProductionData'
import { useProductionFetch } from './hooks/useProductionFetch'
import { useProductionCalcs } from './hooks/useProductionCalcs'

// Import components
import { YearlyProductionCards } from './components/YearlyProductionCards'
import { YearlyProduction } from './components/YearlyProduction'
import { AnnualProductionCurve } from './components/AnnualProductionCurve'
import { DetailedProductionCurve } from './components/DetailedProductionCurve'

export default function Production() {
  const isDemo = useIsDemo()
  const { selectedPdl: selectedPDL, setSelectedPdl: setSelectedPDL } = usePdlStore()

  // States
  const [, setIsClearingCache] = useState(false)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false)
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>(null)
  const [hasAttemptedAutoLoad, setHasAttemptedAutoLoad] = useState(false)
  const [isStatsSectionExpanded, setIsStatsSectionExpanded] = useState(true)
  const [isDetailSectionExpanded, setIsDetailSectionExpanded] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, currentRange: '' })
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false)
  const [dailyLoadingComplete, setDailyLoadingComplete] = useState(false)
  const [allLoadingComplete, setAllLoadingComplete] = useState(false)
  const [dataLimitWarning, setDataLimitWarning] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [detailWeekOffset, setDetailWeekOffset] = useState(0)

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
  const detailDateRange = useMemo(() => {
    if (!dateRange) return null

    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterday = yesterdayUTC
    const endDate_obj = yesterday
    const startDate_obj = new Date(Date.UTC(
      endDate_obj.getUTCFullYear(),
      endDate_obj.getUTCMonth(),
      endDate_obj.getUTCDate() - 6,
      0, 0, 0, 0
    ))

    const startDate = startDate_obj.getUTCFullYear() + '-' +
                      String(startDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getUTCDate()).padStart(2, '0')
    const endDate = endDate_obj.getUTCFullYear() + '-' +
                    String(endDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(endDate_obj.getUTCDate()).padStart(2, '0')

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
    isLoading,
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

  const { fetchProductionData } = useProductionFetch({
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

  // NOTE: Fetch function registration is now handled by the unified hook in PageHeader
  // We don't register fetchProductionData here to avoid conflicts and infinite loops
  // The PageHeader component uses useUnifiedDataFetch which fetches all data types

  // Check if ANY production data is in cache (to determine if we should auto-load)
  const hasDataInCache = useMemo(() => {
    const pdlToCheck = actualProductionPDL || selectedPDL
    if (!pdlToCheck) {
      logger.log('[Cache Detection] No PDL selected')
      return false
    }

    logger.log('[Cache Detection] Checking production cache for PDL:', pdlToCheck)

    // Get all queries in cache
    const allQueries = queryClient.getQueryCache().getAll()

    // Find ALL productionDetail queries for this PDL with data
    const detailedQueries = allQueries.filter(q => {
      if (q.queryKey[0] !== 'productionDetail') return false
      if (q.queryKey[1] !== pdlToCheck) return false

      const data = q.state.data as any
      const hasReadings = data?.data?.meter_reading?.interval_reading?.length > 0
      return hasReadings
    })

    logger.log('[Cache Detection] Found', detailedQueries.length, 'detailed production cache entries with data')

    if (detailedQueries.length > 0) {
      // Log first and last dates in cache
      const dates = detailedQueries.map(q => q.queryKey[2] as string).sort()
      logger.log('[Cache Detection] ✓ Production cache found! Date range:', dates[0], 'to', dates[dates.length - 1])
      return true
    }

    logger.log('[Cache Detection] ✗ No production cache found')
    return false
  }, [actualProductionPDL, selectedPDL, queryClient])

  // Auto-set selectedPDL when there's only one available (non-linked) PDL
  useEffect(() => {
    if (availableProductionPdls.length > 0 && !selectedPDL) {
      setSelectedPDL(availableProductionPdls[0].usage_point_id)
    }
  }, [availableProductionPdls, selectedPDL, setSelectedPDL])

  // Check data limits
  useEffect(() => {
    if (selectedPDLDetails) {
      // Don't show warning if PDL has linked production
      const hasLinkedProduction = selectedPDLDetails.has_consumption && selectedPDLDetails.linked_production_pdl_id

      if (!selectedPDLDetails.has_production && !hasLinkedProduction) {
        setDataLimitWarning("Ce PDL n'a pas l'option production activée.")
      } else {
        setDataLimitWarning(null)
      }
    }
  }, [selectedPDLDetails])

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
    }
  }, [dailyLoadingComplete, isLoadingDetailed])

  // Auto-load dateRange from cache when page loads (ALWAYS if cache exists)
  useEffect(() => {
    // Only set dateRange if it's null and we have cache
    if (!dateRange && selectedPDL && hasDataInCache) {
      logger.log('[Auto-load] No dateRange set but cache detected - setting dateRange from cache')

      // Calculate date range (same as in fetchProductionData)
      const todayUTC = new Date()
      const yesterdayUTC = new Date(Date.UTC(
        todayUTC.getUTCFullYear(),
        todayUTC.getUTCMonth(),
        todayUTC.getUTCDate() - 1,
        0, 0, 0, 0
      ))
      const yesterday = yesterdayUTC
      const startDate_obj = new Date(Date.UTC(
        yesterdayUTC.getUTCFullYear(),
        yesterdayUTC.getUTCMonth(),
        yesterdayUTC.getUTCDate() - 1094,
        0, 0, 0, 0
      ))
      const startDate = startDate_obj.toISOString().split('T')[0]
      const endDate = yesterday.toISOString().split('T')[0]

      logger.log('[Auto-load] Setting date range:', startDate, 'to', endDate)

      setDateRange({ start: startDate, end: endDate })
      setDailyLoadingComplete(true)
      setAllLoadingComplete(true)
      setIsChartsExpanded(true)
      setIsStatsSectionExpanded(true)
      setIsDetailSectionExpanded(true)

      logger.log('[Auto-load] All states set - graphs should be visible')
    }
  }, [selectedPDL, hasDataInCache, dateRange])

  // Auto-fetch data on first load only for demo accounts
  useEffect(() => {
    logger.log('[Auto-load] Effect triggered - hasAttemptedAutoLoad:', hasAttemptedAutoLoad, 'selectedPDL:', selectedPDL, 'hasCache:', hasDataInCache, 'isDemo:', isDemo)

    if (!hasAttemptedAutoLoad && selectedPDL) {
      setHasAttemptedAutoLoad(true)
      logger.log('[Auto-load] First load detected')

      // For demo accounts, ALWAYS fetch data to ensure detailed data is loaded
      if (isDemo) {
        logger.log('[Auto-load] Demo account - fetching data')
        fetchProductionData()
      } else if (!hasDataInCache) {
        logger.log('[Auto-load] No cache - user must click button manually')
      }
      // For regular accounts with cache: dateRange is set by the effect above
    }
  }, [selectedPDL, hasDataInCache, hasAttemptedAutoLoad, fetchProductionData, isDemo])

  // Get production response from React Query (needed for status badges)
  const productionResponse = queryClient.getQueryData(['production', actualProductionPDL || selectedPDL, dateRange?.start, dateRange?.end])

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

      {/* Statistics Section */}
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
            <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
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

      {/* Charts Section */}
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

      {/* Detailed Production Curve Section */}
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
            <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
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
            <DetailedProductionCurve
              detailByDayData={detailByDayData}
              selectedPDL={selectedPDL}
              isDarkMode={isDarkMode}
              isLoadingDetail={isLoadingDetail}
              detailDateRange={detailDateRange}
              onWeekOffsetChange={setDetailWeekOffset}
              detailWeekOffset={detailWeekOffset}
            />
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
