import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Loader2, AlertCircle, Download, Trash2, BarChart3, Calendar, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { enedisApi } from '@/api/enedis'
import { adminApi } from '@/api/admin'
import { useAuth } from '@/hooks/useAuth'
import type { PDL } from '@/types/api'
import toast from 'react-hot-toast'
import { parseOffpeakHours, isOffpeakTime } from '@/utils/offpeakHours'
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
import { PDLSelector } from './components/PDLSelector'
import { LoadingProgress } from './components/LoadingProgress'
import { InfoBlock } from './components/InfoBlock'
import { ConfirmModal } from './components/ConfirmModal'
import { YearlyConsumption } from './components/YearlyConsumption'
import { HcHpDistribution } from './components/HcHpDistribution'
import { YearlyStatCards } from './components/YearlyStatCards'
import { AnnualCurve } from './components/AnnualCurve'
import { DetailedLoadCurve } from './components/DetailedLoadCurve'
import { MonthlyHcHp } from './components/MonthlyHcHp'
import { PowerPeaks } from './components/PowerPeaks'

// Re-export as default for backwards compatibility
export default function Consumption() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // States
  const [selectedPDL, setSelectedPDL] = useState<string>('')
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

  // Get selected PDL details
  const selectedPDLDetails = useMemo(() => {
    return queryClient.getQueryData<PDL[]>(['pdls'])?.find(p => p.usage_point_id === selectedPDL)
  }, [selectedPDL, queryClient])

  // Use custom hooks
  const {
    pdls,
    activePdls,
    consumptionData,
    maxPowerData,
    detailData,
    isLoading,
    isLoadingConsumption,
    isLoadingPower,
    isLoadingDetail
  } = useConsumptionData(selectedPDL, dateRange, detailDateRange, selectedPDLDetails)

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
    hcHpCalculationTrigger
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

  // Check if there's data in cache for the selected PDL
  const hasDataInCache = useMemo(() => {
    if (!selectedPDL) return false
    const queries = queryClient.getQueryCache().getAll()
    return queries.some(q =>
      q.queryKey[0] === 'consumption' &&
      q.queryKey[1] === selectedPDL &&
      q.state.data
    )
  }, [selectedPDL, queryClient])

  // Check if yesterday's data is in cache (to determine if we need to auto-fetch)
  const hasYesterdayDataInCache = useMemo(() => {
    if (!selectedPDL) return false

    // Calculate yesterday's date in UTC
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterdayStr = yesterdayUTC.getUTCFullYear() + '-' +
                        String(yesterdayUTC.getUTCMonth() + 1).padStart(2, '0') + '-' +
                        String(yesterdayUTC.getUTCDate()).padStart(2, '0')

    // Check if we have consumption data that includes yesterday
    const consumptionQuery = queryClient.getQueryCache().find({
      queryKey: ['consumption', selectedPDL],
      exact: false,
    })

    if (!consumptionQuery?.state.data) return false

    const data = consumptionQuery.state.data as any
    const readings = data?.data?.meter_reading?.interval_reading

    if (!readings || readings.length === 0) return false

    // Check if any reading matches yesterday's date
    return readings.some((reading: any) => {
      const readingDate = reading.date?.split('T')[0]
      return readingDate === yesterdayStr
    })
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

  // Auto-fetch data on first load only if yesterday's data is NOT in cache
  useEffect(() => {
    if (!hasAttemptedAutoLoad && selectedPDL) {
      setHasAttemptedAutoLoad(true)

      // Only fetch if we DON'T have yesterday's data in cache
      // This prevents unnecessary fetches when returning to the page with cached data
      if (!hasYesterdayDataInCache) {
        fetchConsumptionData()
      } else {
        // Data is already in cache and up-to-date, set states to show cached data
        setDailyLoadingComplete(true)
        setPowerLoadingComplete(true)
        setAllLoadingComplete(true)
        setIsChartsExpanded(true)
        setIsStatsSectionExpanded(true)
        setIsDetailSectionExpanded(true)
        setIsPowerSectionExpanded(true)
      }
    }
  }, [selectedPDL, hasYesterdayDataInCache, hasAttemptedAutoLoad, fetchConsumptionData])

  // Mark daily consumption loading as complete (whether success or error)
  useEffect(() => {
    if (dateRange && !isLoadingConsumption && consumptionData) {
      setDailyLoadingComplete(true)
    }
  }, [dateRange, isLoadingConsumption, consumptionData])

  // Mark power loading as complete
  useEffect(() => {
    if (dateRange && !isLoadingPower && maxPowerData) {
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
    if (allLoadingComplete) {
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

  // Get consumption response from React Query
  const consumptionResponse = queryClient.getQueryData(['consumption', selectedPDL, dateRange?.start, dateRange?.end])
  const maxPowerResponse = queryClient.getQueryData(['maxPower', selectedPDL, dateRange?.start, dateRange?.end])

  // For now, return the simplified version with working components
  // The rest of the components will be added incrementally
  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
          Consommation
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Visualisez et analysez votre consommation électrique
        </p>
      </div>

      {/* PDL Selector Component with Loading Progress inside */}
      <PDLSelector
        pdls={pdls}
        activePdls={activePdls}
        selectedPDL={selectedPDL}
        selectedPDLDetails={selectedPDLDetails}
        onPDLSelect={setSelectedPDL}
        onFetchData={fetchConsumptionData}
        onClearCache={handleClearCacheClick}
        isClearingCache={isClearingCache}
        isLoading={isLoading}
        isLoadingDetailed={isLoadingDetailed}
        hasDataInCache={hasDataInCache}
        dataLimitWarning={dataLimitWarning}
        user={user}
      >
        {/* Loading Progress Component as child */}
        <LoadingProgress
          isLoadingDaily={isLoadingDaily}
          isLoadingDetailed={isLoadingDetailed}
          dailyLoadingComplete={dailyLoadingComplete}
          powerLoadingComplete={powerLoadingComplete}
          loadingProgress={loadingProgress}
          hcHpCalculationComplete={hcHpCalculationComplete}
          hcHpCalculationTrigger={hcHpCalculationTrigger}
          allLoadingComplete={allLoadingComplete}
          dateRange={dateRange}
          isLoadingConsumption={isLoadingConsumption}
          isLoadingPower={isLoadingPower}
          consumptionResponse={consumptionResponse}
          maxPowerResponse={maxPowerResponse}
        />
      </PDLSelector>

      {/* Statistics Section - Collapsible */}
      {allLoadingComplete && (
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 cursor-pointer ${
              isLoading || isLoadingDetailed ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
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

          {isStatsSectionExpanded && (
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
      )}

      {/* Charts Section - Annual Curve */}
      {allLoadingComplete && (
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 cursor-pointer ${
              isLoading || isLoadingDetailed ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
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

          {isChartsExpanded && (
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
      )}

      {/* Detailed Consumption Section */}
      {allLoadingComplete && (
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 cursor-pointer ${
              isLoading || isLoadingDetailed ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
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

          {isDetailSectionExpanded && (
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
      )}

      {/* Max Power Section */}
      {allLoadingComplete && (
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 cursor-pointer ${
              isLoading || isLoadingDetailed ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
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

          {isPowerSectionExpanded && powerByYearData.length > 0 && (
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
      )}

      {/* Empty State */}
      {!consumptionData && !isLoading && !dailyLoadingComplete && !powerLoadingComplete && (
        <div className="card mt-6 p-12 text-center">
          <TrendingUp className="mx-auto text-gray-400 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Aucune donnée à afficher
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Sélectionnez un PDL et cliquez sur "Récupérer 3 ans d'historique depuis Enedis"
          </p>
        </div>
      )}

      {/* Info Block Component */}
      <InfoBlock dataLimitWarning={dataLimitWarning} />

      {/* Confirm Modal Component */}
      <ConfirmModal
        showConfirmModal={showConfirmModal}
        setShowConfirmModal={setShowConfirmModal}
        confirmClearCache={confirmClearCache}
      />
    </div>
  )
}