import { useState, useEffect, useMemo } from 'react'
import { Sun, BarChart3 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import type { PDL } from '@/types/api'
import { useIsDemo } from '@/hooks/useIsDemo'
import { logger } from '@/utils/logger'

// Import custom hooks
import { useProductionData } from './hooks/useProductionData'
import { useProductionFetch } from './hooks/useProductionFetch'
import { useProductionCalcs } from './hooks/useProductionCalcs'

// Import components
import { PDLSelector } from './components/PDLSelector'
import { LoadingProgress } from './components/LoadingProgress'
import { YearlyProductionCards } from './components/YearlyProductionCards'
import { YearlyProduction } from './components/YearlyProduction'
import { AnnualProductionCurve } from './components/AnnualProductionCurve'
import { DetailedProductionCurve } from './components/DetailedProductionCurve'

export default function Production() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isDemo = useIsDemo()

  // States
  const [selectedPDL, setSelectedPDL] = useState<string>('')
  const [isClearingCache, setIsClearingCache] = useState(false)
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

  // Get selected PDL details
  const selectedPDLDetails = useMemo(() => {
    return queryClient.getQueryData<PDL[]>(['pdls'])?.find(p => p.usage_point_id === selectedPDL)
  }, [selectedPDL, queryClient])

  // Use custom hooks
  const {
    pdls,
    activePdls,
    productionData,
    detailData,
    isLoading,
    isLoadingProduction,
    isLoadingDetail
  } = useProductionData(selectedPDL, dateRange, detailDateRange, selectedPDLDetails)

  const {
    chartData,
    detailByDayData,
  } = useProductionCalcs({
    productionData,
    detailData,
  })

  const { fetchProductionData, clearCache } = useProductionFetch({
    selectedPDL,
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

  // Check if ANY production data is in cache (to determine if we should auto-load)
  const hasDataInCache = useMemo(() => {
    if (!selectedPDL) {
      logger.log('[Cache Detection] No PDL selected')
      return false
    }

    logger.log('[Cache Detection] Checking production cache for PDL:', selectedPDL)

    // Get all queries in cache
    const allQueries = queryClient.getQueryCache().getAll()

    // Find ALL productionDetail queries for this PDL with data
    const detailedQueries = allQueries.filter(q => {
      if (q.queryKey[0] !== 'productionDetail') return false
      if (q.queryKey[1] !== selectedPDL) return false

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
  }, [selectedPDL, queryClient])

  // Auto-set selectedPDL when there's only one active PDL
  useEffect(() => {
    if (activePdls.length > 0 && !selectedPDL) {
      setSelectedPDL(activePdls[0].usage_point_id)
    }
  }, [activePdls, selectedPDL])

  // Check data limits
  useEffect(() => {
    if (selectedPDLDetails) {
      if (!selectedPDLDetails.has_production) {
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

  // Auto-fetch data on first load only for demo accounts or if cache has data
  useEffect(() => {
    if (!hasAttemptedAutoLoad && selectedPDL) {
      setHasAttemptedAutoLoad(true)

      if (isDemo) {
        fetchProductionData()
      } else if (hasDataInCache) {
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

        setDateRange({ start: startDate, end: endDate })
        setDailyLoadingComplete(true)
        setAllLoadingComplete(true)
        setIsChartsExpanded(true)
        setIsStatsSectionExpanded(true)
        setIsDetailSectionExpanded(true)
      }
    }
  }, [selectedPDL, hasDataInCache, hasAttemptedAutoLoad, fetchProductionData, isDemo])

  // Get production response from React Query
  const productionResponse = queryClient.getQueryData(['production', selectedPDL, dateRange?.start, dateRange?.end])

  return (
    <div className="pt-6 w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Sun className="text-yellow-600 dark:text-yellow-400" size={32} />
          Production
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Visualisez et analysez votre production d'énergie solaire
        </p>
      </div>

      {/* PDL Selector Component with Loading Progress inside */}
      <PDLSelector
        pdls={pdls}
        activePdls={activePdls}
        selectedPDL={selectedPDL}
        selectedPDLDetails={selectedPDLDetails}
        onPDLSelect={setSelectedPDL}
        onFetchData={fetchProductionData}
        onClearCache={clearCache}
        isClearingCache={isClearingCache}
        isLoading={isLoading}
        isLoadingDetailed={isLoadingDetailed}
        hasDataInCache={hasDataInCache}
        dataLimitWarning={dataLimitWarning}
        user={user}
      >
        <LoadingProgress
          isLoadingDetailed={isLoadingDetailed}
          dailyLoadingComplete={dailyLoadingComplete}
          loadingProgress={loadingProgress}
          allLoadingComplete={allLoadingComplete}
          dateRange={dateRange}
          isLoadingProduction={isLoadingProduction}
          productionResponse={productionResponse}
          hasDataInCache={hasDataInCache}
        />
      </PDLSelector>

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
