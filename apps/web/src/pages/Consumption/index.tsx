import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Loader2, AlertCircle, Download, Trash2, BarChart3, Calendar, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { enedisApi } from '@/api/enedis'
import { adminApi } from '@/api/admin'
import { useAuth } from '@/hooks/useAuth'
import { usePdlStore } from '@/stores/pdlStore'
import type { PDL } from '@/types/api'
import toast from 'react-hot-toast'
import { parseOffpeakHours, isOffpeakTime } from '@/utils/offpeakHours'
import { logger } from '@/utils/logger'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

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
import { DetailedLoadCurve } from './components/DetailedLoadCurve'
import { MonthlyHcHp } from './components/MonthlyHcHp'
import { PowerPeaks } from './components/PowerPeaks'
import { useIsDemo } from '@/hooks/useIsDemo'

// Re-export as default for backwards compatibility
export default function Consumption() {
  const { user } = useAuth()
  const isDemo = useIsDemo()
  const { selectedPdl: selectedPDL, setSelectedPdl: setSelectedPDL } = usePdlStore()

  // States
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isChartsExpanded, setIsChartsExpanded] = useState(false)
  const [dateRange, setDateRange] = useState<{start: string, end: string} | null>(null)
  const [selectedPowerYear, setSelectedPowerYear] = useState<number>(0)
  const [hasAttemptedAutoLoad, setHasAttemptedAutoLoad] = useState(false)
  const [isPowerSectionExpanded, setIsPowerSectionExpanded] = useState(true)
  const [isStatsSectionExpanded, setIsStatsSectionExpanded] = useState(true)
  const [isDetailSectionExpanded, setIsDetailSectionExpanded] = useState(true)
  const [selectedDetailDay, setSelectedDetailDay] = useState<number>(0)
  const [detailWeekOffset, setDetailWeekOffset] = useState<number>(0)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const selectedDate = new Date(yesterday)
    selectedDate.setDate(yesterday.getDate() - (0 * 7) - 0)
    return new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  })
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, currentRange: '' })
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false)
  const [isLoadingDaily, setIsLoadingDaily] = useState(false)
  const [dailyLoadingComplete, setDailyLoadingComplete] = useState(false)
  const [powerLoadingComplete, setPowerLoadingComplete] = useState(false)
  const [allLoadingComplete, setAllLoadingComplete] = useState(false)
  const [hcHpCalculationTrigger, setHcHpCalculationTrigger] = useState(0)
  const [hcHpCalculationComplete, setHcHpCalculationComplete] = useState(false)
  const [selectedHcHpPeriod, setSelectedHcHpPeriod] = useState(0)
  const [dataLimitWarning, setDataLimitWarning] = useState<string | null>(null)
  const [selectedMonthlyHcHpYear, setSelectedMonthlyHcHpYear] = useState(0)
  const [showYearComparison, setShowYearComparison] = useState(false)
  const [showDetailYearComparison, setShowDetailYearComparison] = useState(false)
  const [showDetailWeekComparison, setShowDetailWeekComparison] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)

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
    const offsetDays = detailWeekOffset * 7

    let endDate_obj = new Date(Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate() - offsetDays,
      0, 0, 0, 0
    ))

    if (endDate_obj > yesterday) {
      endDate_obj = new Date(yesterday)
    }

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
  }, [dateRange, detailWeekOffset])

  // Use custom hooks
  const {
    pdls,
    activePdls: allActivePdls,
    selectedPDLDetails,
    consumptionData,
    maxPowerData,
    detailData,
    isLoading,
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
    selectedPowerYear: calcSelectedPowerYear,
    setSelectedPowerYear: setCalcSelectedPowerYear,
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

  // Sync power year selection
  useEffect(() => {
    setSelectedPowerYear(calcSelectedPowerYear)
  }, [calcSelectedPowerYear])

  const { fetchConsumptionData, clearCache } = useConsumptionFetch({
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

      // Calculate date range (same as in fetchConsumptionData)
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

        logger.log('[Auto-load] All states set - graphs should be visible')
      }, 100) // Small delay to let React Query hydrate
    }
  }, [selectedPDL, hasDataInCache, dateRange, queryClient])

  // Auto-fetch data on first load only for demo accounts
  useEffect(() => {
    logger.log('[Auto-load] Effect triggered - hasAttemptedAutoLoad:', hasAttemptedAutoLoad, 'selectedPDL:', selectedPDL, 'hasCache:', hasDataInCache, 'isDemo:', isDemo)

    if (!hasAttemptedAutoLoad && selectedPDL) {
      setHasAttemptedAutoLoad(true)
      logger.log('[Auto-load] First load detected')

      // For demo accounts, ALWAYS fetch data to ensure detailed data is loaded for HC/HP calculations
      if (isDemo) {
        logger.log('[Auto-load] Demo account - fetching data')
        fetchConsumptionData()
      } else if (!hasDataInCache) {
        logger.log('[Auto-load] No cache - user must click button manually')
      }
      // For regular accounts with cache: dateRange is set by the effect above
    }
  }, [selectedPDL, hasDataInCache, hasAttemptedAutoLoad, fetchConsumptionData, isDemo])

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

  // Auto-expand all sections when loading is complete
  useEffect(() => {
    logger.log('[Loading] allLoadingComplete changed:', allLoadingComplete)
    if (allLoadingComplete) {
      logger.log('[Loading] ✓ All loading complete - expanding sections')
      setIsStatsSectionExpanded(true)
      setIsChartsExpanded(true)
      setIsDetailSectionExpanded(true)
      setIsPowerSectionExpanded(true)
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

  // Keyboard navigation for detail days (Arrow Left/Right)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDetailSectionExpanded || detailByDayData.length === 0) return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        // Arrow left = go to more recent day (previous index since data is sorted newest first)
        // If already at first day (most recent), load next week (if not on current week)
        if (selectedDetailDay === 0 && detailWeekOffset > 0) {
          setDetailWeekOffset(prev => Math.max(0, prev - 1))
          // When going to next week (more recent), select the last available day
          setSelectedDetailDay(999)
          toast.success('Chargement de la semaine suivante...')
        } else if (selectedDetailDay > 0) {
          setSelectedDetailDay(prev => prev - 1)
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        // Arrow right = go to older day (next index since data is sorted newest first)
        // If already at last day (oldest), load previous week
        if (selectedDetailDay === detailByDayData.length - 1) {
          setDetailWeekOffset(prev => prev + 1)
          // When going to previous week (older), select the first day of that week
          setSelectedDetailDay(0)
        } else {
          setSelectedDetailDay(prev => prev + 1)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDetailSectionExpanded, detailByDayData.length, selectedDetailDay, detailWeekOffset])

  const handleClearCacheClick = () => {
    setShowConfirmModal(true)
  }

  const confirmClearCache = async () => {
    setShowConfirmModal(false)
    await clearCache()
  }

  // For now, return the simplified version with working components
  // The rest of the components will be added incrementally
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

      {/* Statistics Section - Collapsible */}
      <div className="mt-2 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
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

      {/* Charts Section - Annual Curve */}
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

      {/* Detailed Consumption Section */}
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
            <DetailedLoadCurve
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

      {/* Max Power Section */}
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
              maxPowerData={maxPowerData}
              isDarkMode={isDarkMode}
            />
          </div>
        )}
      </div>


      {/* Info Block Component */}
      <InfoBlock />

      {/* Confirm Modal Component */}
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        setShowConfirmModal={setShowConfirmModal}
        confirmClearCache={confirmClearCache}
      />
    </div>
  )
}