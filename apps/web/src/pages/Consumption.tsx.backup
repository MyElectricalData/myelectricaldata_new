import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, Loader2, AlertCircle, Download, Trash2, BarChart3, Calendar, Info } from 'lucide-react'
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

export default function Consumption() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
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
  const [detailWeekOffset, setDetailWeekOffset] = useState<number>(0) // 0 = most recent week, 1 = previous week, 2 = 2 weeks ago, etc.
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const selectedDate = new Date(yesterday)
    selectedDate.setDate(yesterday.getDate() - (0 * 7) - 0) // Initial values for detailWeekOffset=0, selectedDetailDay=0
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

    // Watch for changes
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [])

  // Fetch PDLs
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

  const pdls = Array.isArray(pdlsData) ? pdlsData : []

  // Filter only active PDLs (if is_active is undefined, consider it as active)
  const activePdls = pdls.filter(p => p.is_active !== false)

  // Get selected PDL details
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // Fetch consumption data with React Query
  const { data: consumptionResponse, isLoading: isLoadingConsumption } = useQuery({
    queryKey: ['consumption', selectedPDL, dateRange?.start, dateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !dateRange) return null
      return enedisApi.getConsumptionDaily(selectedPDL, {
        start: dateRange.start,
        end: dateRange.end,
        use_cache: true,
      })
    },
    enabled: !!selectedPDL && !!dateRange,
    staleTime: 1000 * 60 * 60, // 1 hour - data is considered fresh
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
  })

  // Fetch max power data with React Query
  const { data: maxPowerResponse, isLoading: isLoadingPower } = useQuery({
    queryKey: ['maxPower', selectedPDL, dateRange?.start, dateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !dateRange) return null
      return enedisApi.getMaxPower(selectedPDL, {
        start: dateRange.start,
        end: dateRange.end,
        use_cache: true,
      })
    },
    enabled: !!selectedPDL && !!dateRange,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Calculate date range for detailed data (max 7 days - API limit)
  const detailDateRange = useMemo(() => {
    if (!dateRange) return null

    // Use UTC date for Enedis API (RFC 3339 format)
    const todayUTC = new Date()
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterday = yesterdayUTC

    // Apply week offset: 0 = most recent week (yesterday and 6 days before)
    // 1 = previous week (7-13 days ago), 2 = 2 weeks ago (14-20 days ago), etc.
    // Each offset moves back by 7 days into history
    const offsetDays = detailWeekOffset * 7

    // End date: yesterday - offset (most recent day of the week we want to display)
    // But never go beyond yesterday (Enedis data is available up to J-1)
    let endDate_obj = new Date(Date.UTC(
      yesterday.getUTCFullYear(),
      yesterday.getUTCMonth(),
      yesterday.getUTCDate() - offsetDays,
      0, 0, 0, 0
    ))

    // Cap the end date to yesterday if it goes into the future
    if (endDate_obj > yesterday) {
      endDate_obj = new Date(yesterday)
    }

    // Start: 6 days before end date (7 days total - API maximum) in UTC
    const startDate_obj = new Date(Date.UTC(
      endDate_obj.getUTCFullYear(),
      endDate_obj.getUTCMonth(),
      endDate_obj.getUTCDate() - 6,
      0, 0, 0, 0
    ))

    // Format dates as YYYY-MM-DD in UTC
    const startDate = startDate_obj.getUTCFullYear() + '-' +
                      String(startDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getUTCDate()).padStart(2, '0')
    const endDate = endDate_obj.getUTCFullYear() + '-' +
                    String(endDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(endDate_obj.getUTCDate()).padStart(2, '0')

    return { start: startDate, end: endDate }
  }, [dateRange, detailWeekOffset])

  // Fetch detailed consumption data (load curve - 30min intervals)
  // Only fetch if PDL is active and has consumption enabled
  const shouldFetchDetail = !!selectedPDL &&
                           !!detailDateRange &&
                           selectedPDLDetails?.is_active &&
                           selectedPDLDetails?.has_consumption

  const { data: detailResponse, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['consumptionDetail', selectedPDL, detailDateRange?.start, detailDateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !detailDateRange) return null

      try {
        // Get all days in the range from cache (day by day)
        const startDate = new Date(detailDateRange.start + 'T00:00:00Z')
        const endDate = new Date(detailDateRange.end + 'T00:00:00Z')
        const allPoints: any[] = []
        const daysChecked: string[] = []
        const daysFound: string[] = []

        // Iterate through each day in the range
        const currentDate = new Date(startDate)
        while (currentDate <= endDate) {
          const dateStr = currentDate.getUTCFullYear() + '-' +
                         String(currentDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                         String(currentDate.getUTCDate()).padStart(2, '0')

          daysChecked.push(dateStr)

          // Try to get this day's data from cache
          const dayData = queryClient.getQueryData(['consumptionDetail', selectedPDL, dateStr, dateStr]) as any

          if (dayData?.data?.meter_reading?.interval_reading) {
            daysFound.push(dateStr)
            allPoints.push(...dayData.data.meter_reading.interval_reading)
          }

          // Move to next day
          currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        }

        // Return combined data in the same format as API response
        return allPoints.length > 0 ? {
          success: true,
          data: {
            meter_reading: {
              interval_reading: allPoints
            }
          }
        } : null
      } catch (error) {
        console.error('❌ Error in detailResponse queryFn:', error)
        return null
      }
    },
    enabled: shouldFetchDetail,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  const consumptionData = consumptionResponse?.success ? consumptionResponse.data : null
  const maxPowerData = maxPowerResponse?.success ? maxPowerResponse.data : null
  const detailData = detailResponse?.success ? detailResponse.data : null
  const isLoading = isLoadingConsumption || isLoadingPower || isLoadingDetail

  // Check if we have data in cache (to change button text)
  const hasDataInCache = !!consumptionData || !!maxPowerData

  // Auto-select first active PDL
  useEffect(() => {
    if (activePdls.length > 0 && !selectedPDL) {
      setSelectedPDL(activePdls[0].usage_point_id)
    }
  }, [activePdls, selectedPDL])

  // Auto-fetch data on mount if cached data exists
  useEffect(() => {
    if (selectedPDL && !hasAttemptedAutoLoad) {
      // Calculate dates for 3 years of history
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)

      const startDate_obj = new Date(yesterday)
      startDate_obj.setDate(yesterday.getDate() - 1095)

      const startDate = startDate_obj.getFullYear() + '-' +
                        String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
                        String(startDate_obj.getDate()).padStart(2, '0')
      const endDate = yesterday.getFullYear() + '-' +
                      String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
                      String(yesterday.getDate()).padStart(2, '0')

      // Check if data is already in cache
      const cachedConsumption = queryClient.getQueryData(['consumption', selectedPDL, startDate, endDate])
      const cachedPower = queryClient.getQueryData(['maxPower', selectedPDL, startDate, endDate])

      // If data is in cache, set date range to display it immediately
      if (cachedConsumption || cachedPower) {
        // Use setTimeout to ensure state updates are batched correctly
        setTimeout(() => {
          setDateRange({ start: startDate, end: endDate })
          setIsChartsExpanded(true) // Auto-expand charts when loading from cache
          setHasAttemptedAutoLoad(true)
        }, 0)
      } else {
        setHasAttemptedAutoLoad(true)
      }
    }
  }, [selectedPDL, hasAttemptedAutoLoad, queryClient])

  // Show warning if PDL has limited data availability
  useEffect(() => {
    if (!selectedPDL || !selectedPDLDetails) {
      setDataLimitWarning(null)
      return
    }

    const today = new Date()
    const threeYearsAgo = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate())

    // Check if we have oldest_available_data_date or activation_date
    const oldestDate = selectedPDLDetails.oldest_available_data_date
    const activationDate = selectedPDLDetails.activation_date
    const limitDate = oldestDate || activationDate

    if (limitDate) {
      const limitDateObj = new Date(limitDate + 'T00:00:00Z')

      // If the limit date is less than 3 years ago, show a warning
      if (limitDateObj > threeYearsAgo) {
        const limitDateFormatted = new Date(limitDate).toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })

        // Build the warning message
        let message = ''

        if (oldestDate && activationDate && oldestDate !== activationDate) {
          // Both dates exist and are different
          const activationDateFormatted = new Date(activationDate).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })

          message = `L'activation du contrat date du ${activationDateFormatted}, mais aucune donnée n'est disponible avant le ${limitDateFormatted}. Les appels API ont donc été limités à partir du ${limitDateFormatted}.`
        } else if (oldestDate) {
          // Only oldest_available_data_date
          message = `Aucune donnée disponible avant le ${limitDateFormatted} (date de mise en service du compteur). Les appels API ont été limités en conséquence.`
        } else {
          // Only activation_date
          message = `Le contrat a été activé le ${limitDateFormatted}. Aucune donnée n'est disponible avant cette date.`
        }

        setDataLimitWarning(message)
      } else {
        setDataLimitWarning(null)
      }
    } else {
      setDataLimitWarning(null)
    }
  }, [selectedPDL, selectedPDLDetails])

  // Mark daily consumption loading as complete (whether success or error)
  useEffect(() => {
    if (dateRange && !isLoadingConsumption && consumptionResponse) {
      setDailyLoadingComplete(true)

      // If error, invalidate PDL cache to get updated oldest_available_data_date
      if (consumptionResponse.success === false) {
        console.log('⚠️ Consumption error detected, refreshing PDL data...')
        queryClient.invalidateQueries({ queryKey: ['pdls'] })
      }
    }
  }, [dateRange, isLoadingConsumption, consumptionResponse, queryClient])

  // Mark power loading as complete (whether success or error)
  useEffect(() => {
    if (dateRange && !isLoadingPower && maxPowerResponse) {
      setPowerLoadingComplete(true)
    }
  }, [dateRange, isLoadingPower, maxPowerResponse])

  // Reset loading states when PDL or date range changes
  useEffect(() => {
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)
  }, [selectedPDL, dateRange])

  // Detect if data is loaded from cache (instant load)
  useEffect(() => {
    if (dateRange && !isLoadingConsumption && !isLoadingPower && !isLoadingDetailed &&
        consumptionResponse && maxPowerResponse) {
      // Data came from cache, mark as complete immediately
      setDailyLoadingComplete(true)
      setPowerLoadingComplete(true)
      setAllLoadingComplete(true)
    }
  }, [dateRange, isLoadingConsumption, isLoadingPower, isLoadingDetailed, consumptionResponse, maxPowerResponse])

  // Mark all loading as complete when everything is done
  useEffect(() => {
    // Check if all loading is complete (daily, power, and detailed if it was started)
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

  // Reset charts when PDL changes
  useEffect(() => {
    setIsChartsExpanded(false)
    setDateRange(null)
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)
    // Use setTimeout to ensure the reset happens before auto-load
    setTimeout(() => {
      setHasAttemptedAutoLoad(false)
    }, 0)
  }, [selectedPDL])

  const fetchConsumptionData = async () => {
    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    // Collapse all sections before fetching new data
    setIsChartsExpanded(false)
    setIsDetailSectionExpanded(false)
    setIsStatsSectionExpanded(false)
    setIsPowerSectionExpanded(false)
    setHcHpCalculationComplete(false)
    setDailyLoadingComplete(false)
    setPowerLoadingComplete(false)
    setAllLoadingComplete(false)

    // Calculate dates for consumption and power (3 years max - 1095 days)
    // Use yesterday as end date because Enedis data is only available in J-1
    // IMPORTANT: Use UTC dates as Enedis API expects RFC 3339 format (UTC)
    const todayUTC = new Date()

    // Get yesterday in UTC (end date) - normalized to midnight UTC
    const yesterdayUTC = new Date(Date.UTC(
      todayUTC.getUTCFullYear(),
      todayUTC.getUTCMonth(),
      todayUTC.getUTCDate() - 1,
      0, 0, 0, 0
    ))

    const yesterday = yesterdayUTC

    // Start date: 1095 days before yesterday (Enedis API max limit for daily data)
    let startDate_obj = new Date(Date.UTC(
      yesterdayUTC.getUTCFullYear(),
      yesterdayUTC.getUTCMonth(),
      yesterdayUTC.getUTCDate() - 1095,
      0, 0, 0, 0
    ))

    // Apply limits: never go before oldest_available_data_date or activation_date
    console.log('🔍 PDL Details:', {
      selectedPDL,
      oldest_available_data_date: selectedPDLDetails?.oldest_available_data_date,
      activation_date: selectedPDLDetails?.activation_date,
      calculatedStartDate: startDate_obj.toISOString().split('T')[0]
    })

    // For now, don't apply oldest_available_data_date or activation_date limits
    // Let the API handle the error and we'll display it to the user
    // TODO: Implement proper retry logic with progressive date advancement
    console.log(`📅 Daily consumption: Requesting full 3 years (API will return error if too old)`)

    // Format dates as YYYY-MM-DD in UTC
    const startDate = startDate_obj.getUTCFullYear() + '-' +
                      String(startDate_obj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                      String(startDate_obj.getUTCDate()).padStart(2, '0')
    const endDate = yesterday.getUTCFullYear() + '-' +
                    String(yesterday.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(yesterday.getUTCDate()).padStart(2, '0')

    console.log(`📊 Final date range for API: ${startDate} → ${endDate}`)

    // Setting dateRange will trigger React Query to fetch data
    setDateRange({ start: startDate, end: endDate })

    // Pre-fetch detailed data for 2 years (730 days, fetched weekly and cached daily)
    // Limitation: Only data from J-1 and up to 2 years back (same as "Courbe de charge détaillée")
    if (selectedPDLDetails?.is_active && selectedPDLDetails?.has_consumption) {
      setIsLoadingDetailed(true)

      // Calculate 2 years back from yesterday in UTC (730 days max)
      let twoYearsAgo = new Date(Date.UTC(
        yesterday.getUTCFullYear() - 2,
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        0, 0, 0, 0
      ))

      // For now, don't apply date limits - let the retry logic handle it
      console.log(`📅 Detailed data: Requesting full 2 years (retry logic will adjust if needed)`)

      // Calculate number of weeks in 2 years (approximately 104 weeks)
      const totalWeeks = Math.ceil(730 / 7)

      // Check which days are already in cache
      const allDates = []
      const currentDate = new Date(twoYearsAgo)
      while (currentDate <= yesterday) {
        const dateStr = currentDate.getUTCFullYear() + '-' +
                       String(currentDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                       String(currentDate.getUTCDate()).padStart(2, '0')
        allDates.push(dateStr)
        currentDate.setUTCDate(currentDate.getUTCDate() + 1)
      }

      // Check cache for each day
      const missingDates = []
      for (const dateStr of allDates) {
        const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPDL, dateStr, dateStr]) as any
        const hasCompleteData = cachedData?.data?.meter_reading?.interval_reading?.length >= 40 // At least 40 points for a complete day
        if (!hasCompleteData) {
          missingDates.push(dateStr)
        }
      }

      console.log(`📊 Cache check: ${allDates.length - missingDates.length}/${allDates.length} days cached, ${missingDates.length} missing`)

      if (missingDates.length === 0) {
        console.log('✅ All data already in cache!')
        const totalDays = allDates.length
        const years = Math.floor(totalDays / 365)
        const remainingDays = totalDays % 365
        const yearsText = years > 0 ? `${years} an${years > 1 ? 's' : ''}` : ''
        const daysText = remainingDays > 0 ? `${remainingDays} jour${remainingDays > 1 ? 's' : ''}` : ''
        const periodText = [yearsText, daysText].filter(Boolean).join(' et ')

        const message = `✓ Historique complet déjà en cache (${periodText} de données)`
        console.log('Toast message:', message)
        toast.success(message, {
          duration: 3000,
        })
        setIsLoadingDetailed(false)
        // Invalidate to refresh the display
        queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })
        return
      }

      // Group missing dates into weeks to fetch
      const weeksToFetch = []

      // Convert missing dates to week ranges
      for (let weekOffset = 0; weekOffset < totalWeeks; weekOffset++) {
        // Calculate offset in days
        const offsetDays = weekOffset * 7

        // End date: yesterday minus offset weeks (never today or future) in UTC
        let weekEndDate = new Date(Date.UTC(
          yesterday.getUTCFullYear(),
          yesterday.getUTCMonth(),
          yesterday.getUTCDate() - offsetDays,
          0, 0, 0, 0
        ))

        // Cap the end date to yesterday if it goes into the future (safety check)
        if (weekEndDate > yesterday) {
          weekEndDate = new Date(yesterday)
        }

        // Start date: 6 days before end date (7 days total) in UTC
        const weekStartDate = new Date(Date.UTC(
          weekEndDate.getUTCFullYear(),
          weekEndDate.getUTCMonth(),
          weekEndDate.getUTCDate() - 6,
          0, 0, 0, 0
        ))

        // Only fetch if:
        // 1. Week end date is not in the future (max = yesterday)
        // 2. Week start date is within the 2-year range (>= 2 years ago from yesterday)
        // 3. At least one day in this week is missing from cache
        if (weekEndDate <= yesterday && weekStartDate >= twoYearsAgo) {
          const weekStart = weekStartDate.getUTCFullYear() + '-' +
                           String(weekStartDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                           String(weekStartDate.getUTCDate()).padStart(2, '0')
          const weekEnd = weekEndDate.getUTCFullYear() + '-' +
                         String(weekEndDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                         String(weekEndDate.getUTCDate()).padStart(2, '0')

          // Check if any day in this week is missing
          const weekDates = []
          const tempDate = new Date(weekStartDate)
          while (tempDate <= weekEndDate) {
            const tempDateStr = tempDate.getUTCFullYear() + '-' +
                               String(tempDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                               String(tempDate.getUTCDate()).padStart(2, '0')
            weekDates.push(tempDateStr)
            tempDate.setUTCDate(tempDate.getUTCDate() + 1)
          }

          // Only add this week if at least one day is missing
          if (weekDates.some(d => missingDates.includes(d))) {
            weeksToFetch.push({ weekStart, weekEnd })
          }
        }
      }

      console.log(`📥 Need to fetch ${weeksToFetch.length} weeks (out of ${totalWeeks} total)`)

      // Fetch weeks sequentially to show progress
      setLoadingProgress({ current: 0, total: weeksToFetch.length, currentRange: 'Démarrage...' })

      try {
        for (let i = 0; i < weeksToFetch.length; i++) {
          const { weekStart, weekEnd } = weeksToFetch[i]

          setLoadingProgress({
            current: i + 1,
            total: weeksToFetch.length,
            currentRange: `${weekStart} → ${weekEnd}`
          })

          // Fetch the weekly data from API with retry mechanism for ADAM-ERR0123
          let weeklyData = null
          let currentStartDate = new Date(weekStart + 'T00:00:00Z')
          const endDateObj = new Date(weekEnd + 'T00:00:00Z')
          let retryCount = 0
          const maxRetries = 7 // Max 7 days to try forward from start

          while (currentStartDate <= endDateObj && retryCount < maxRetries) {
            const currentStartStr = currentStartDate.getUTCFullYear() + '-' +
                                   String(currentStartDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                                   String(currentStartDate.getUTCDate()).padStart(2, '0')

            // IMPORTANT: Add 1 day to get the 23:30 reading of the last day
            // (Enedis returns 23:30 reading with next day's 00:00 timestamp)
            const fetchEndDate = new Date(endDateObj)
            fetchEndDate.setUTCDate(fetchEndDate.getUTCDate() + 1)
            const fetchEndStr = fetchEndDate.getUTCFullYear() + '-' +
                               String(fetchEndDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                               String(fetchEndDate.getUTCDate()).padStart(2, '0')

            try {
              weeklyData = await enedisApi.getConsumptionDetail(selectedPDL, {
                start: currentStartStr,
                end: fetchEndStr,
                use_cache: true,
              })

              console.log(`📦 Response for ${currentStartStr} → ${fetchEndStr}:`, {
                success: weeklyData?.success,
                hasError: !!weeklyData?.error,
                errorCode: weeklyData?.error?.code,
                hasData: !!weeklyData?.data
              })

              // Check for ADAM-ERR0123 error
              if (weeklyData?.success === false && weeklyData?.error?.code === 'ADAM-ERR0123') {
                console.log(`⚠️ Enedis: Data not available for ${currentStartStr} → ${fetchEndStr}, trying later start date...`)

                // Try one day later (advance start date)
                currentStartDate.setUTCDate(currentStartDate.getUTCDate() + 1)
                retryCount++

                // If we've tried all days in the week without success, stop completely
                if (retryCount >= maxRetries || currentStartDate > endDateObj) {
                  console.log(`ℹ️ No data available for this week after ${retryCount} retries - this is expected if before activation date`)

                  // No error toast - this is normal behavior when requesting data before activation
                  // Just log it and continue to the next week or stop gracefully

                  // Invalidate queries to show what we have so far
                  queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })

                  // Stop fetching older data (we've reached the limit)
                  setLoadingProgress({ current: i, total: weeksToFetch.length, currentRange: 'Arrêté - Date limite atteinte' })
                  setIsLoadingDetailed(false)
                  setLoadingProgress({ current: 0, total: 0, currentRange: '' })
                  return
                }

                continue // Try again with earlier date
              }

              // Success! Break out of retry loop
              break

            } catch (error) {
              console.error(`Error fetching ${weekStart} → ${fetchEndStr}:`, error)
              throw error // Re-throw to be caught by outer catch
            }
          }

          // Split the weekly data and cache it day by day
          if (weeklyData?.data?.meter_reading?.interval_reading) {
            // Group data points by date
            const dataByDate: Record<string, any[]> = {}

            weeklyData.data.meter_reading.interval_reading.forEach((point: any) => {
              // Extract YYYY-MM-DD from date (format: "2025-10-14 00:00:00" or "2025-10-14T00:00:00")
              let date = point.date.split(' ')[0].split('T')[0]

              // IMPORTANT: Enedis convention - timestamps at 00:00 represent the 23:30 reading
              // of the PREVIOUS day. We need to adjust the date accordingly.
              const time = point.date.split(' ')[1] || point.date.split('T')[1] || '00:00:00'
              if (time.startsWith('00:00')) {
                // Shift date back by 1 day for 00:00 timestamps
                const dateObj = new Date(date + 'T00:00:00Z')
                dateObj.setUTCDate(dateObj.getUTCDate() - 1)
                date = dateObj.getUTCFullYear() + '-' +
                       String(dateObj.getUTCMonth() + 1).padStart(2, '0') + '-' +
                       String(dateObj.getUTCDate()).padStart(2, '0')
              }

              if (!dataByDate[date]) {
                dataByDate[date] = []
              }
              dataByDate[date].push(point)
            })

            // Cache each day separately
            Object.entries(dataByDate).forEach(([date, points]) => {
              queryClient.setQueryData(
                ['consumptionDetail', selectedPDL, date, date],
                {
                  success: true,
                  data: {
                    meter_reading: {
                      interval_reading: points
                    }
                  }
                }
              )
            })
          }

          // Add a small delay to ensure loading screen is visible even for cached data
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        setLoadingProgress({ current: weeksToFetch.length, total: weeksToFetch.length, currentRange: 'Terminé !' })
        // Add a small delay before showing success message to let user see 100% progress
        await new Promise(resolve => setTimeout(resolve, 300))

        if (weeksToFetch.length > 0) {
          toast.success(`${weeksToFetch.length} semaine${weeksToFetch.length > 1 ? 's' : ''} de nouvelles données chargées avec succès !`)
        }

        // Invalidate the detail query to force it to re-fetch from cache
        queryClient.invalidateQueries({ queryKey: ['consumptionDetail'] })

        // Trigger HC/HP calculation now that all data is loaded
        setHcHpCalculationTrigger(prev => prev + 1)
      } catch (error: any) {
        console.error('Error pre-fetching detailed data:', error)

        // Check if it's an ADAM-ERR0123 error from the API
        if (error?.response?.data?.error?.code === 'ADAM-ERR0123' ||
            error?.error?.code === 'ADAM-ERR0123') {
          const errorMessage = error?.response?.data?.error?.message ||
                              error?.error?.message ||
                              "La période demandée est antérieure à la date d'activation du compteur"
          toast.error(errorMessage, { duration: 6000, icon: '⚠️' })
        } else {
          // Generic error message
          const errorMsg = error?.response?.data?.error?.message ||
                          error?.message ||
                          'Erreur lors du pré-chargement des données détaillées'
          toast.error(errorMsg)
        }
      } finally {
        setIsLoadingDetailed(false)
        setLoadingProgress({ current: 0, total: 0, currentRange: '' })
      }
    }
  }


  const handleClearCacheClick = () => {
    setShowConfirmModal(true)
  }

  const confirmClearCache = async () => {
    setShowConfirmModal(false)
    setIsClearingCache(true)

    try {
      // Clear React Query cache
      queryClient.clear()

      // Clear browser cache (localStorage, sessionStorage, indexedDB)
      localStorage.clear()
      sessionStorage.clear()

      // Clear indexedDB
      const databases = await window.indexedDB.databases()
      databases.forEach(db => {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name)
        }
      })

      // Clear Redis cache via API
      const response = await adminApi.clearAllConsumptionCache()

      if (response.success) {
        const deletedKeys = (response.data as any)?.deleted_keys || 0
        toast.success(`Cache vidé avec succès ! ${deletedKeys} clés Redis supprimées. La page va se recharger.`)

        // Reload page after 2 seconds to apply cache clearing
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        toast.error(response.error?.message || 'Erreur lors du vidage du cache Redis')
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du vidage du cache')
    } finally {
      setIsClearingCache(false)
    }
  }

  // Process consumption data for charts
  const chartData = useMemo(() => {
    if (!consumptionData?.meter_reading?.interval_reading) {
      return { byYear: [], byMonth: [], byMonthComparison: [], total: 0, years: [], unit: 'W' }
    }

    const readings = consumptionData.meter_reading.interval_reading
    const unit = consumptionData.meter_reading.reading_type?.unit || 'W'
    const intervalLength = consumptionData.meter_reading.reading_type?.interval_length || 'P1D'

    // Parse interval length to determine how to handle the values
    // Format: P{number}{unit} where unit can be D (day), H (hour), M (minute)
    // Examples: P1D (1 day), P30M (30 minutes), P15M (15 minutes), P8M (8 minutes)
    //
    // IMPORTANT: Enedis API behavior:
    // - P1D (daily): values are already total energy consumption for the day in Wh → sum directly
    // - P30M/P15M (load curve): values are average power in W over the interval → multiply by duration
    const parseIntervalToDurationInHours = (interval: string): number => {
      // Match pattern P{number}{unit}
      const match = interval.match(/^P(\d+)([DHM])$/)
      if (!match) return 1 // Default to 1 if can't parse

      const value = parseInt(match[1], 10)
      const unit = match[2]

      switch (unit) {
        case 'D': return 1 // Daily values are already total energy, not average power
        case 'H': return value // Hours
        case 'M': return value / 60 // Minutes to hours (e.g., 30M = 0.5h, 15M = 0.25h)
        default: return 1
      }
    }

    const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
      // If already in Wh (energy), no conversion needed regardless of interval
      if (valueUnit === 'Wh' || valueUnit === 'WH') return 1

      // If in W (power), need to convert to energy based on interval duration
      // Exception: P1D values from Enedis are already total daily energy even if unit says W
      if (valueUnit === 'W') {
        return parseIntervalToDurationInHours(interval)
      }

      return 1 // Default: assume values can be summed directly
    }

    const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)

    const monthlyData: Record<string, number> = {}
    const monthYearData: Record<string, Record<string, number>> = {} // month -> {year -> value}
    let totalConsumption = 0

    // Find the most recent date in the actual data (not assumed)
    let mostRecentDate = new Date(0) // Start with epoch
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (dateStr) {
        const readingDate = new Date(dateStr)
        if (readingDate > mostRecentDate) {
          mostRecentDate = readingDate
        }
      }
    })

    // Define 365-day periods (sliding windows)
    const period1End = mostRecentDate
    const period1Start = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2End = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2Start = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3End = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3Start = new Date(mostRecentDate.getTime() - 1095 * 24 * 60 * 60 * 1000)

    const periods = [
      {
        label: String(period1End.getFullYear()),
        startDaysAgo: 0,
        endDaysAgo: 365,
        startDate: period1Start,
        endDate: period1End
      },
      {
        label: String(period2End.getFullYear()),
        startDaysAgo: 365,
        endDaysAgo: 730,
        startDate: period2Start,
        endDate: period2End
      },
      {
        label: String(period3End.getFullYear()),
        startDaysAgo: 730,
        endDaysAgo: 1095,
        startDate: period3Start,
        endDate: period3End
      }
    ]

    // Aggregate by 365-day periods
    const periodData: Record<string, { value: number, startDate: Date, endDate: Date }> = {}

    readings.forEach((reading: any) => {
      const rawValue = parseFloat(reading.value || 0)
      const dateStr = reading.date?.split('T')[0] || reading.date

      if (!dateStr || isNaN(rawValue)) return

      // Apply interval multiplier to convert to Wh if needed
      const value = rawValue * intervalMultiplier

      const readingDate = new Date(dateStr)
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(0, 7) // YYYY-MM
      const monthOnly = dateStr.substring(5, 7) // MM

      // Find which period this reading belongs to
      periods.forEach(period => {
        if (readingDate >= period.startDate && readingDate <= period.endDate) {
          if (!periodData[period.label]) {
            periodData[period.label] = {
              value: 0,
              startDate: period.startDate,
              endDate: period.endDate
            }
          }
          periodData[period.label].value += value
        }
      })

      // Aggregate by month (for monthly chart)
      monthlyData[month] = (monthlyData[month] || 0) + value

      // Aggregate by month for year comparison
      if (!monthYearData[monthOnly]) {
        monthYearData[monthOnly] = {}
      }
      monthYearData[monthOnly][year] = (monthYearData[monthOnly][year] || 0) + value

      totalConsumption += value
    })

    // Convert to chart format
    const byYear = Object.entries(periodData)
      .map(([label, data]) => ({
        year: label,
        consumption: Math.round(data.value),
        consommation: Math.round(data.value),
        startDate: data.startDate,
        endDate: data.endDate
      }))
      .reverse() // Most recent first

    // Get all years for compatibility
    const years = Object.keys(monthYearData).length > 0
      ? Object.keys(readings.reduce((acc: any, r: any) => {
          const year = r.date?.substring(0, 4)
          if (year) acc[year] = true
          return acc
        }, {})).sort()
      : []

    const byMonth = Object.entries(monthlyData)
      .map(([month, value]) => ({
        month,
        monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' }),
        consumption: Math.round(value),
        consommation: Math.round(value),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // Monthly comparison across years
    const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

    const byMonthComparison = monthNames.map((monthNum, idx) => {
      const row: any = {
        month: monthNum,
        monthLabel: monthLabels[idx],
      }

      years.forEach(year => {
        const value = monthYearData[monthNum]?.[year] || 0
        row[year] = Math.round(value)
      })

      return row
    })

    return {
      byYear,
      byMonth,
      byMonthComparison,
      total: Math.round(totalConsumption),
      years,
      unit,
    }
  }, [consumptionData])

  // Process max power data by year
  const powerByYearData = useMemo(() => {
    if (!maxPowerData?.meter_reading?.interval_reading) {
      return []
    }

    const readings = maxPowerData.meter_reading.interval_reading

    // Get the most recent date in the data
    let mostRecentDate = new Date(0)
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (dateStr) {
        const readingDate = new Date(dateStr)
        if (readingDate > mostRecentDate) {
          mostRecentDate = readingDate
        }
      }
    })

    // Define 3 years of 365-day periods
    const period1End = mostRecentDate
    const period1Start = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2End = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2Start = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3End = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3Start = new Date(mostRecentDate.getTime() - 1095 * 24 * 60 * 60 * 1000)

    const periods = [
      { label: String(period1End.getFullYear()), startDate: period1Start, endDate: period1End, data: [] as any[] },
      { label: String(period2End.getFullYear()), startDate: period2Start, endDate: period2End, data: [] as any[] },
      { label: String(period3End.getFullYear()), startDate: period3Start, endDate: period3End, data: [] as any[] },
    ]

    // Group readings by period
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (!dateStr) return

      const readingDate = new Date(dateStr)
      const power = parseFloat(reading.value || 0) / 1000 // Convert W to kW

      // Extract time from date field (format: YYYY-MM-DDTHH:MM:SS or YYYY-MM-DD HH:MM:SS)
      let time = ''
      if (reading.date?.includes('T')) {
        time = reading.date.split('T')[1]?.substring(0, 5) || '' // Get HH:MM
      } else if (reading.date?.includes(' ')) {
        time = reading.date.split(' ')[1]?.substring(0, 5) || '' // Get HH:MM
      }

      periods.forEach(period => {
        if (readingDate >= period.startDate && readingDate <= period.endDate) {
          period.data.push({
            date: dateStr,
            power: power,
            time: time,
            year: period.label
          })
        }
      })
    })

    // Sort data by date within each period
    periods.forEach(period => {
      period.data.sort((a, b) => a.date.localeCompare(b.date))
    })

    return periods.reverse() // Most recent first
  }, [maxPowerData])

  // Set default year to most recent (last index) when power data loads
  useEffect(() => {
    if (powerByYearData.length > 0) {
      setSelectedPowerYear(powerByYearData.length - 1)
    }
  }, [powerByYearData.length])

  // Process detailed consumption data by day (load curve - 30min intervals)
  const detailByDayData = useMemo(() => {
    if (!detailData?.meter_reading?.interval_reading) {
      return []
    }

    const readings = detailData.meter_reading.interval_reading
    const unit = detailData.meter_reading.reading_type?.unit || 'W'
    const intervalLength = detailData.meter_reading.reading_type?.interval_length || 'P30M'

    console.log('🔍 Detail Data Debug:', {
      totalReadings: readings.length,
      intervalLength,
      unit,
      firstReading: readings[0],
      lastReading: readings[readings.length - 1]
    })

    // Parse interval length to determine duration in hours
    // Format: P{number}{unit} where unit can be D (day), H (hour), M (minute)
    // Examples: P30M (30 minutes), P15M (15 minutes), P1H (1 hour)
    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^P(\d+)([DHM])$/)
      if (!match) return 0.5 // Default to 30 minutes (0.5h) if can't parse

      const value = parseInt(match[1], 10)
      const unit = match[2]

      switch (unit) {
        case 'D': return value * 24 // Days to hours
        case 'H': return value // Hours
        case 'M': return value / 60 // Minutes to hours (e.g., 30M = 0.5h, 15M = 0.25h)
        default: return 0.5
      }
    }

    // Get interval multiplier to convert power (W) to energy (Wh)
    // If unit is already Wh, no conversion needed
    // If unit is W (power), multiply by duration to get energy
    const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
      // If already in Wh (energy), no conversion needed
      if (valueUnit === 'Wh' || valueUnit === 'WH') return 1

      // If in W (power), need to convert to energy based on interval duration
      if (valueUnit === 'W') {
        return parseIntervalToDurationInHours(interval)
      }

      return 1 // Default: assume no conversion needed
    }

    const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)
    const intervalDurationHours = parseIntervalToDurationInHours(intervalLength)

    // Calculate interval duration in minutes for offset calculation
    const intervalDurationMinutes = intervalDurationHours * 60

    // Group readings by day
    const dayMap: Record<string, any[]> = {}

    readings.forEach((reading: any) => {
      if (!reading.date) return

      // Parse the API datetime to a Date object
      // Enedis convention: timestamp represents END of measurement interval
      // Example: "2025-10-20 00:00" = measurement from 19/10 23:30 to 20/10 00:00
      // We need to shift back by the interval duration to get the START time
      let apiDateTime: Date

      if (reading.date.includes('T')) {
        apiDateTime = new Date(reading.date)
      } else if (reading.date.includes(' ')) {
        apiDateTime = new Date(reading.date.replace(' ', 'T'))
      } else {
        apiDateTime = new Date(reading.date + 'T00:00:00')
      }

      // Shift backwards by interval duration to get measurement START time
      const actualDateTime = new Date(apiDateTime.getTime() - intervalDurationMinutes * 60 * 1000)

      // Extract date and time from the actual measurement start time
      const year = actualDateTime.getFullYear()
      const month = String(actualDateTime.getMonth() + 1).padStart(2, '0')
      const day = String(actualDateTime.getDate()).padStart(2, '0')
      const hours = String(actualDateTime.getHours()).padStart(2, '0')
      const minutes = String(actualDateTime.getMinutes()).padStart(2, '0')

      const dateStr = `${year}-${month}-${day}`
      const time = `${hours}:${minutes}`

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = []
      }

      const rawValue = parseFloat(reading.value || 0)

      // Apply interval multiplier to get energy in Wh, then convert to kWh
      const energyWh = rawValue * intervalMultiplier
      const energyKwh = energyWh / 1000

      // For display on the graph, show average power in kW
      // Energy (Wh) / Duration (h) = Average Power (W)
      const averagePowerW = intervalDurationHours > 0 ? energyWh / intervalDurationHours : rawValue
      const averagePowerKw = averagePowerW / 1000

      dayMap[dateStr].push({
        time,
        power: averagePowerKw, // Display as average power in kW for the chart
        energyWh, // Store energy for calculations
        energyKwh, // Store energy in kWh
        rawValue, // Store original value
        datetime: actualDateTime.toISOString(), // Store actual measurement start time
        apiDatetime: reading.date // Keep original API datetime for reference
      })
    })

    // Convert to array and sort by date (most recent first)
    const days = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        data: data.sort((a, b) => a.time.localeCompare(b.time)),
        totalEnergyKwh: data.reduce((sum, d) => sum + d.energyKwh, 0)
      }))
      // Filter out incomplete days (less than 40 measurements)
      // A complete day should have 48 measurements (30min intervals)
      // We keep days with at least 40 to allow for some missing data
      .filter(day => day.data.length >= 40)
      .sort((a, b) => b.date.localeCompare(a.date))

    console.log('📊 Processed Detail Data:', {
      totalDays: days.length,
      daysWithCounts: days.map(d => ({
        date: d.date,
        points: d.data.length,
        totalKwh: d.totalEnergyKwh.toFixed(2),
        firstTime: d.data[0]?.time,
        lastTime: d.data[d.data.length - 1]?.time
      }))
    })

    if (days.length > 0 && days[0].data.length === 1) {
      console.error('❌ PROBLÈME: Un seul point par jour détecté! Vérifier le groupement par date.')
      console.error('Premier jour exemple:', {
        date: days[0].date,
        data: days[0].data,
        rawReading: readings[0]
      })
    }

    return days
  }, [detailData])

  // Calculate HC/HP statistics by year from all cached detailed data
  const hcHpByYear = useMemo(() => {
    if (!selectedPDL) {
      console.log('🔍 HC/HP: No PDL selected')
      return []
    }

    // Parse offpeak hours configuration from PDL
    const offpeakRanges = parseOffpeakHours(selectedPDLDetails?.offpeak_hours)
    // console.log('🔍 HC/HP: Offpeak ranges', offpeakRanges)
    // console.log('🔍 HC/HP: PDL offpeak config', selectedPDLDetails?.offpeak_hours)

    // Get all queries from cache that match the pattern ['consumptionDetail', selectedPDL, ...]
    const queryCache = queryClient.getQueryCache()
    const allDetailQueries = queryCache.findAll({
      queryKey: ['consumptionDetail', selectedPDL],
      exact: false,
    })

    console.log(`📊 HC/HP: Found ${allDetailQueries.length} cached detail queries for PDL ${selectedPDL}`)

    // Collect all readings first to find the most recent date
    const allReadings: Array<{ date: Date; energyKwh: number; isHC: boolean }> = []

    let totalReadingsProcessed = 0
    allDetailQueries.forEach((query, queryIndex) => {
      const response = query.state.data as any

      // Unwrap the API response structure {success: true, data: {...}}
      const data = response?.data

      if (!data?.meter_reading?.interval_reading) {
        // Skip logging for performance (too many queries)
        // console.log(`⚠️ HC/HP: Query ${queryIndex} has no interval_reading data`, response)
        return
      }

      const readings = data.meter_reading.interval_reading
      const unit = data.meter_reading.reading_type?.unit || 'W'
      const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

      // Skip excessive logging for performance
      // console.log(`📊 HC/HP: Processing query ${queryIndex}: ${readings.length} readings, unit=${unit}, interval=${intervalLength}`)

      // Parse interval to get multiplier
      const parseIntervalToDurationInHours = (interval: string): number => {
        const match = interval.match(/^P(\d+)([DHM])$/)
        if (!match) return 0.5
        const value = parseInt(match[1], 10)
        const unit = match[2]
        switch (unit) {
          case 'D': return value * 24
          case 'H': return value
          case 'M': return value / 60
          default: return 0.5
        }
      }

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || !reading.value) {
          if (queryIndex === 0 && totalReadingsProcessed < 2) {
            console.log(`⚠️ HC/HP: Skipping reading (no date or value)`, reading)
          }
          return
        }

        totalReadingsProcessed++

        // Parse datetime
        const dateTimeStr = reading.date.includes('T')
          ? reading.date
          : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)

        // Calculate energy in kWh
        const energyWh = parseFloat(reading.value) * intervalMultiplier
        const energyKwh = energyWh / 1000

        // Check if this time is HC or HP
        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        const isHC = isOffpeakTime(hour, minute, offpeakRanges)

        // Add to all readings
        allReadings.push({
          date: apiDateTime,
          energyKwh,
          isHC
        })
      })
    })

    // console.log(`📊 HC/HP: Total readings processed: ${totalReadingsProcessed}`)
    console.log(`📊 HC/HP: Collected ${allReadings.length} readings from ${allDetailQueries.length} queries`)

    if (allReadings.length === 0) {
      console.log('⚠️ HC/HP: No readings collected')
      return []
    }

    // Find the most recent date
    const mostRecentDate = new Date(Math.max(...allReadings.map(r => r.date.getTime())))
    console.log(`📊 HC/HP: Most recent date: ${mostRecentDate.toISOString()}`)

    // Define 3 rolling 365-day periods (most recent first)
    const periods = []
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date(mostRecentDate)
      periodEnd.setDate(mostRecentDate.getDate() - (i * 365))

      const periodStart = new Date(periodEnd)
      periodStart.setDate(periodEnd.getDate() - 364) // 365 days inclusive

      periods.push({
        start: periodStart,
        end: periodEnd,
        label: `${periodStart.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })} - ${periodEnd.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}`
      })
    }

    console.log('📊 HC/HP: Rolling periods defined:', periods)

    // Group readings into periods
    const result = periods.map(period => {
      const periodReadings = allReadings.filter(r => r.date >= period.start && r.date <= period.end)

      const hcKwh = periodReadings.filter(r => r.isHC).reduce((sum, r) => sum + r.energyKwh, 0)
      const hpKwh = periodReadings.filter(r => !r.isHC).reduce((sum, r) => sum + r.energyKwh, 0)
      const totalKwh = hcKwh + hpKwh

      // console.log(`📊 HC/HP: Period ${period.label}: ${periodReadings.length} readings, HC=${hcKwh.toFixed(2)}kWh, HP=${hpKwh.toFixed(2)}kWh`)

      return {
        year: period.label,
        hcKwh,
        hpKwh,
        totalKwh
      }
    }).filter(p => p.totalKwh > 0) // Only include periods with data

    console.log('📊 HC/HP: Final result - years:', result.length)
    return result
  }, [selectedPDL, selectedPDLDetails?.offpeak_hours, hcHpCalculationTrigger, queryClient])

  // Calculate monthly HC/HP data for each rolling year period
  const monthlyHcHpByYear = useMemo(() => {
    if (!selectedPDL || !selectedPDLDetails?.offpeak_hours) {
      return []
    }

    const offpeakRanges = parseOffpeakHours(selectedPDLDetails.offpeak_hours)
    const queryCache = queryClient.getQueryCache()
    const allDetailQueries = queryCache.findAll({
      queryKey: ['consumptionDetail', selectedPDL],
      exact: false,
    })

    if (allDetailQueries.length === 0) {
      return []
    }

    // Collect all readings with date, energy, and HC/HP classification
    const allReadings: Array<{ date: Date; energyKwh: number; isHC: boolean }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as any
      const data = response?.data

      if (!data?.meter_reading?.interval_reading) return

      const readings = data.meter_reading.interval_reading
      const unit = data.meter_reading.reading_type?.unit || 'W'
      const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

      const parseIntervalToDurationInHours = (interval: string): number => {
        const match = interval.match(/^P(\d+)([DHM])$/)
        if (!match) return 0.5
        const value = parseInt(match[1], 10)
        const unit = match[2]
        switch (unit) {
          case 'D': return value * 24
          case 'H': return value
          case 'M': return value / 60
          default: return 0.5
        }
      }

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || !reading.value) return

        const dateTimeStr = reading.date.includes('T') ? reading.date : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)
        const energyWh = parseFloat(reading.value) * intervalMultiplier
        const energyKwh = energyWh / 1000
        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        const isHC = isOffpeakTime(hour, minute, offpeakRanges)

        allReadings.push({ date: apiDateTime, energyKwh, isHC })
      })
    })

    if (allReadings.length === 0) return []

    // Find the most recent date
    const mostRecentDate = new Date(Math.max(...allReadings.map(r => r.date.getTime())))

    // Define 3 rolling 365-day periods
    const periods = []
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date(mostRecentDate)
      periodEnd.setDate(mostRecentDate.getDate() - (i * 365))
      const periodStart = new Date(periodEnd)
      periodStart.setDate(periodEnd.getDate() - 364)

      const endYear = periodEnd.getFullYear()

      periods.push({
        start: periodStart,
        end: periodEnd,
        label: endYear.toString()
      })
    }

    // For each period, group by month
    const result = periods.map(period => {
      const periodReadings = allReadings.filter(r => r.date >= period.start && r.date <= period.end)

      // Group by month (YYYY-MM format)
      const monthlyData: Record<string, { hcKwh: number; hpKwh: number; month: string }> = {}

      periodReadings.forEach(reading => {
        const monthKey = `${reading.date.getFullYear()}-${String(reading.date.getMonth() + 1).padStart(2, '0')}`

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            hcKwh: 0,
            hpKwh: 0,
            month: new Date(reading.date.getFullYear(), reading.date.getMonth(), 1)
              .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
          }
        }

        if (reading.isHC) {
          monthlyData[monthKey].hcKwh += reading.energyKwh
        } else {
          monthlyData[monthKey].hpKwh += reading.energyKwh
        }
      })

      // Convert to array and sort by month
      const months = Object.keys(monthlyData).sort().map(key => ({
        month: monthlyData[key].month,
        hcKwh: monthlyData[key].hcKwh,
        hpKwh: monthlyData[key].hpKwh,
        totalKwh: monthlyData[key].hcKwh + monthlyData[key].hpKwh
      }))

      return {
        year: period.label,
        months
      }
    }).filter(p => p.months.length >= 12) // Only show complete years (12 months)

    return result
  }, [selectedPDL, selectedPDLDetails?.offpeak_hours, hcHpCalculationTrigger, queryClient])

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

  // Auto-expand all sections when data is loaded AND HC/HP simulation is complete
  useEffect(() => {
    if (consumptionData?.meter_reading?.interval_reading && hcHpCalculationComplete) {
      // Wait for HC/HP simulation to complete before expanding all sections
      setIsChartsExpanded(true)
      setIsStatsSectionExpanded(true)
      setIsDetailSectionExpanded(true)
      if (maxPowerData?.meter_reading?.interval_reading) {
        setIsPowerSectionExpanded(true)
      }
    }
  }, [consumptionData, hcHpCalculationComplete, maxPowerData])

  // Adjust selectedDetailDay if it's out of bounds after data changes
  useEffect(() => {
    if (detailByDayData.length > 0 && selectedDetailDay >= detailByDayData.length) {
      // If current selection is out of bounds, select the last available day
      // This happens when navigating to a more recent week (fewer days due to filtering)
      setSelectedDetailDay(detailByDayData.length - 1)
    }
  }, [detailByDayData.length, selectedDetailDay])

  // Update viewMonth when showDatePicker is opened to show the correct month
  useEffect(() => {
    if (showDatePicker) {
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      const selectedDate = new Date(yesterday)
      selectedDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)
      setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
    }
  }, [showDatePicker, detailWeekOffset, selectedDetailDay])

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

      {/* Cache Warning */}
      <div className="mb-6 bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 p-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>⚠️ Information importante :</strong> L'utilisation de la page de consommation active automatiquement le cache. Vos données de consommation seront stockées temporairement sur la passerelle pour améliorer les performances et éviter de solliciter excessivement l'API Enedis. Les données en cache expirent automatiquement après 24 heures.
        </p>
      </div>

      <div className="card space-y-6">
        {/* Configuration Header */}
        <div className="bg-primary-600 text-white px-4 py-3 -mx-6 -mt-6 rounded-t-lg">
          <h2 className="text-xl font-semibold">Configuration</h2>
        </div>

        <div className="space-y-6">
            {/* PDL Selection - Only show if more than one active PDL */}
            {activePdls.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Point de Livraison (PDL)
                </label>
                <select
                  value={selectedPDL}
                  onChange={(e) => setSelectedPDL(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
                >
                  {activePdls.map((pdl: PDL) => (
                    <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                      {pdl.name || pdl.usage_point_id}
                    </option>
                  ))}
                </select>

                {/* Warning if PDL has limited data */}
                {dataLimitWarning && (
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {dataLimitWarning}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* No active PDL message */}
            {activePdls.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Aucun PDL actif disponible. Veuillez en ajouter un depuis votre{' '}
                <a href="/dashboard" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline">
                  tableau de bord
                </a>.
              </div>
            )}

            {/* Warning if PDL has limited data - Show for single PDL too */}
            {activePdls.length === 1 && dataLimitWarning && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
                <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {dataLimitWarning}
                </p>
              </div>
            )}

            {/* Fetch Button - Show if no data in cache OR if user is admin */}
            {(!hasDataInCache || user?.is_admin) && (
              <button
                onClick={fetchConsumptionData}
                disabled={!selectedPDL || isLoading || isLoadingDetailed}
                className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
              >
                {isLoading || isLoadingDetailed ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Récupération en cours...
                  </>
                ) : (
                  <>
                    <Download size={20} />
                    Récupérer l'historique
                  </>
                )}
              </button>
            )}

          {/* Clear Cache Button (Admin only) */}
          {user?.is_admin && (
            <button
              onClick={handleClearCacheClick}
              disabled={isClearingCache}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isClearingCache ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Vidage en cours...
                </>
              ) : (
                <>
                  <Trash2 size={20} />
                  Vider tout le cache (Navigateur + Redis)
                </>
              )}
            </button>
          )}
        </div>

        {/* Loading Progress - Show when fetching, hide when all complete or if data came from cache */}
        {dateRange && !allLoadingComplete && (isLoadingConsumption || isLoadingPower || isLoadingDetailed) ? (
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
            <div className="flex flex-col gap-6">
              {/* Daily consumption data loading */}
              <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Chargement des données quotidiennes (3 ans)
                    </h3>
                    <div className="flex items-center gap-2">
                      {dailyLoadingComplete && !isLoadingConsumption ? (
                        consumptionResponse?.success ? (
                          <>
                            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                              Terminé
                            </span>
                          </>
                        ) : (
                          <>
                            <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                              Erreur
                            </span>
                          </>
                        )
                      ) : (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            En cours...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {consumptionResponse?.success === false && consumptionResponse?.error?.message ? (
                      <span className="text-red-600 dark:text-red-400">{consumptionResponse.error.message}</span>
                    ) : (
                      'Récupération des données de consommation depuis le cache ou l\'API Enedis'
                    )}
                  </p>
                </div>

              {/* Power data loading */}
              <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Chargement de la puissance maximum (3 ans)
                    </h3>
                    <div className="flex items-center gap-2">
                      {powerLoadingComplete && !isLoadingPower ? (
                        maxPowerResponse?.success ? (
                          <>
                            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm font-medium text-green-600 dark:text-green-400">
                              Terminé
                            </span>
                          </>
                        ) : (
                          <>
                            <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                              Erreur
                            </span>
                          </>
                        )
                      ) : (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            En cours...
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {maxPowerResponse?.success === false && maxPowerResponse?.error?.message ? (
                      <span className="text-red-600 dark:text-red-400">{maxPowerResponse.error.message}</span>
                    ) : (
                      'Récupération des données de puissance maximum depuis le cache ou l\'API Enedis'
                    )}
                  </p>
                </div>

              {/* Separator between daily and detailed data */}
              <div className="border-t border-gray-200 dark:border-gray-700"></div>

              {/* Detailed data loading progress */}
              <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Chargement des données détaillées (2 ans)
                    </h3>
                    <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                      {loadingProgress.current} / {loadingProgress.total} semaines
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-8 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-blue-500 transition-all duration-300 ease-out flex items-center justify-end pr-3"
                      style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                    >
                      {loadingProgress.current > 0 && (
                        <span className="text-sm font-bold text-white drop-shadow">
                          {Math.round((loadingProgress.current / loadingProgress.total) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Current range */}
                  {loadingProgress.currentRange && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {loadingProgress.currentRange}
                      </span>
                    </p>
                  )}
                </div>
            </div>
          </div>
        ) : null}

      </div>

      {/* Statistics Summary Section */}
      {allLoadingComplete && (
        <div className={`mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 ${
          isStatsSectionExpanded ? 'p-6' : ''
        }`}>
          <div
            className={`bg-primary-600 text-white px-4 py-3 flex items-center justify-between ${
              isLoading || isLoadingDetailed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              isStatsSectionExpanded ? '-mx-6 -mt-6 rounded-t-lg' : 'rounded-lg'
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
                setIsStatsSectionExpanded(!isStatsSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-3">
              <BarChart3 size={24} />
              <h2 className="text-xl font-semibold">Statistiques de consommation</h2>
            </div>
            <div className="flex items-center gap-2">
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
            <>

          {/* Yearly Breakdown */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Consommation par année
              </h3>
              <button
                onClick={() => {
                  const jsonData = JSON.stringify(chartData.byYear, null, 2)
                  navigator.clipboard.writeText(jsonData)
                  toast.success('Données copiées dans le presse-papier')
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
              >
                <Download size={16} />
                Exporter JSON
              </button>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className={`grid gap-3 ${chartData.byYear.length > 3 ? 'grid-cols-3 min-w-max' : 'grid-cols-' + Math.min(chartData.byYear.length, 3)}`}>
                {chartData.byYear.map((yearData) => {
                // Use the dates from the period data
                const startDateFormatted = yearData.startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                const endDateFormatted = yearData.endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })

                return (
                  <div key={yearData.year} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600 min-w-[300px]">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {yearData.year}
                        </p>
                        <button
                          onClick={() => {
                            const intervalLength = consumptionData?.meter_reading?.reading_type?.interval_length || 'P1D'
                            const unit = consumptionData?.meter_reading?.reading_type?.unit || 'W'

                            // Parse interval to duration in hours
                            const parseIntervalToDurationInHours = (interval: string): number => {
                              const match = interval.match(/^P(\d+)([DHM])$/)
                              if (!match) return 1
                              const value = parseInt(match[1], 10)
                              const unit = match[2]
                              switch (unit) {
                                case 'D': return 1 // Daily values are already total energy
                                case 'H': return value
                                case 'M': return value / 60
                                default: return 1
                              }
                            }

                            // Get interval multiplier for this export
                            const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
                              if (valueUnit === 'Wh' || valueUnit === 'WH') return 1
                              if (valueUnit === 'W') {
                                return parseIntervalToDurationInHours(interval)
                              }
                              return 1
                            }

                            const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)

                            // Filter interval readings for this year and apply multiplier
                            const yearReadings = consumptionData?.meter_reading?.interval_reading?.filter((reading: any) => {
                              const date = reading.date?.split('T')[0] || reading.date
                              return date && date.startsWith(yearData.year)
                            }).map((reading: any) => ({
                              date: reading.date?.split('T')[0] || reading.date,
                              value_raw: parseFloat(reading.value || 0),
                              value_wh: parseFloat(reading.value || 0) * intervalMultiplier
                            })) || []

                            const jsonData = JSON.stringify({
                              year: yearData.year,
                              startDate: startDateFormatted,
                              endDate: endDateFormatted,
                              consommation_kwh: (yearData.consommation / 1000),
                              consommation_wh: yearData.consommation,
                              unit_raw: unit,
                              interval_length: intervalLength,
                              interval_multiplier: intervalMultiplier,
                              interval_readings: yearReadings,
                              total_readings: yearReadings.length
                            }, null, 2)
                            navigator.clipboard.writeText(jsonData)
                            toast.success(`Données ${yearData.year} copiées (${yearReadings.length} lectures)`)
                          }}
                          className="p-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {startDateFormatted} - {endDateFormatted}
                      </p>
                      <div className="mt-2">
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {(yearData.consommation / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {yearData.consommation.toLocaleString('fr-FR')} {chartData.unit === 'W' ? 'W' : 'Wh'}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          </div>

          {/* HC/HP Breakdown by Year */}
          {hcHpByYear.length > 0 && selectedPDLDetails?.offpeak_hours && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Répartition HC/HP par année
                </h3>
                <button
                  onClick={() => {
                    const jsonData = JSON.stringify(hcHpByYear, null, 2)
                    navigator.clipboard.writeText(jsonData)
                    toast.success('Données HC/HP copiées dans le presse-papier')
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                >
                  <Download size={16} />
                  Exporter JSON
                </button>
              </div>
              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                {hcHpByYear.map((yearData, index) => {
                  // Extract the year from the end date (most recent) of the period
                  // Format: "3 janv. 2024 - 2 janv. 2025" -> "2025"
                  const endYear = yearData.year.split(' - ')[1]?.split(' ').pop() || yearData.year

                  return (
                    <button
                      key={yearData.year}
                      onClick={() => setSelectedHcHpPeriod(index)}
                      className={`flex-1 px-4 py-2 font-medium transition-colors ${
                        selectedHcHpPeriod === index
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {endYear}
                    </button>
                  )
                })}
              </div>

              {/* Selected Period Chart */}
              {hcHpByYear[selectedHcHpPeriod] && (() => {
                const yearData = hcHpByYear[selectedHcHpPeriod]
                const hcPercentage = yearData.totalKwh > 0 ? (yearData.hcKwh / yearData.totalKwh) * 100 : 0
                const hpPercentage = yearData.totalKwh > 0 ? (yearData.hpKwh / yearData.totalKwh) * 100 : 0

                const pieData = [
                  { name: 'Heures Creuses (HC)', value: yearData.hcKwh, color: '#3b82f6' },
                  { name: 'Heures Pleines (HP)', value: yearData.hpKwh, color: '#f97316' },
                ]

                return (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                        {yearData.year}
                      </h4>
                      <button
                        onClick={() => {
                          const jsonData = JSON.stringify(yearData, null, 2)
                          navigator.clipboard.writeText(jsonData)
                          toast.success(`Données HC/HP copiées`)
                        }}
                        className="p-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors"
                      >
                        <Download size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Pie Chart */}
                      <div className="flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={300}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }: { name?: string; percent?: number }) =>
                                `${name?.split(' ')[0] || ''} ${((percent || 0) * 100).toFixed(1)}%`
                              }
                              outerRadius={100}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                border: '1px solid #ccc',
                                borderRadius: '8px',
                              }}
                              formatter={(value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Statistics */}
                      <div className="flex flex-col justify-center gap-4">
                        {/* Heures Creuses */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Heures Creuses (HC)</p>
                            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                              {hcPercentage.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {yearData.hcKwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                          </p>
                        </div>

                        {/* Heures Pleines */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Heures Pleines (HP)</p>
                            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                              {hpPercentage.toFixed(1)}%
                            </span>
                          </div>
                          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                            {yearData.hpKwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                          </p>
                        </div>

                        {/* Visual bar */}
                        <div className="mt-2">
                          <div className="w-full h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden flex">
                            <div
                              className="bg-blue-500 dark:bg-blue-400 h-full transition-all"
                              style={{ width: `${hcPercentage}%` }}
                              title={`HC: ${hcPercentage.toFixed(1)}%`}
                            />
                            <div
                              className="bg-orange-500 dark:bg-orange-400 h-full transition-all"
                              style={{ width: `${hpPercentage}%` }}
                              title={`HP: ${hpPercentage.toFixed(1)}%`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Info message */}
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={16} />
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          Le total HC/HP peut différer légèrement de la "Consommation par années".
                          Cette différence est due à une simulation basée sur les plages horaires HC/HP,
                          car Enedis ne fournit pas ces données détaillées.
                          De plus, Enedis transmet les données par paliers de 30 minutes : si le changement d'heure creuse/pleine
                          intervient au milieu d'un intervalle de 30 minutes, la répartition HC/HP sera approximative à 30 minutes près.
                          C'est la <strong>Consommation par années</strong> qui est la plus précise et qui sera facturée par votre fournisseur.
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* Charts Section - Collapsible */}
      {allLoadingComplete && (
        <div className={`mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 ${
          isChartsExpanded ? 'p-6' : ''
        }`}>
          <div
            className={`bg-primary-600 text-white px-4 py-3 flex items-center justify-between ${
              isLoading || isLoadingDetailed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              isChartsExpanded ? '-mx-6 -mt-6 rounded-t-lg' : 'rounded-lg'
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
                setIsChartsExpanded(!isChartsExpanded)
              }
            }}
          >
            <div className="flex items-center gap-3">
              <BarChart3 size={24} />
              <h2 className="text-xl font-semibold">
                Courbe annuelle
              </h2>
            </div>
            <div className="flex items-center gap-2">
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
            <div className="space-y-8 mt-6">
              {/* Yearly Consumption Chart */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Calendar className="text-primary-600 dark:text-primary-400" size={20} />
                    Consommation par année
                  </h3>
                  <button
                    onClick={() => {
                      const intervalLength = consumptionData?.meter_reading?.reading_type?.interval_length || 'P1D'
                      const unit = consumptionData?.meter_reading?.reading_type?.unit || 'W'
                      const jsonData = JSON.stringify({
                        interval_length: intervalLength,
                        unit_raw: unit,
                        data: chartData.byYear
                      }, null, 2)
                      navigator.clipboard.writeText(jsonData)
                      toast.success('Données annuelles copiées dans le presse-papier')
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                  >
                    <Download size={16} />
                    Exporter JSON
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData.byYear}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                      <XAxis
                        dataKey="year"
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                      />
                      <YAxis
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)} kWh`}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F9FAFB'
                        }}
                        formatter={(value: number) => [`${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, 'Consommation']}
                      />
                      <Legend />
                      <Bar
                        dataKey="consommation"
                        fill="#3B82F6"
                        radius={[8, 8, 0, 0]}
                        name="Consommation (kWh)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Comparison Chart */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
                    Comparaison mensuelle par année
                  </h3>
                  <button
                    onClick={() => {
                      const jsonData = JSON.stringify(chartData.byMonthComparison, null, 2)
                      navigator.clipboard.writeText(jsonData)
                      toast.success('Données mensuelles copiées dans le presse-papier')
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                  >
                    <Download size={16} />
                    Exporter JSON
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData.byMonthComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                      <XAxis
                        dataKey="monthLabel"
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                      />
                      <YAxis
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)} kWh`}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F9FAFB'
                        }}
                        formatter={(value: number) => [`${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, 'Consommation']}
                      />
                      <Legend />
                      {chartData.years.map((year, index) => {
                        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
                        return (
                          <Bar
                            key={year}
                            dataKey={year}
                            fill={colors[index % colors.length]}
                            radius={[4, 4, 0, 0]}
                            name={year}
                          />
                        )
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Detailed Consumption Section - Load Curve (30min intervals) */}
      {allLoadingComplete && (
        <div className={`mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 ${
          isDetailSectionExpanded ? 'p-6' : ''
        }`}>
          <div
            className={`bg-primary-600 text-white px-4 py-3 flex items-center justify-between ${
              isLoading || isLoadingDetailed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              isDetailSectionExpanded ? '-mx-6 -mt-6 rounded-t-lg' : 'rounded-lg'
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
                setIsDetailSectionExpanded(!isDetailSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-3">
              <BarChart3 size={24} />
              <h2 className="text-xl font-semibold">Courbe de charge détaillée</h2>
            </div>
            <div className="flex items-center gap-2">
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
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
                    Courbe de charge détaillée
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowDetailYearComparison(!showDetailYearComparison)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      showDetailYearComparison
                        ? 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600'
                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Année -1
                  </button>
                  <button
                    onClick={() => setShowDetailWeekComparison(!showDetailWeekComparison)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      showDetailWeekComparison
                        ? 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600'
                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    Semaine -1
                  </button>
                  <button
                    onClick={() => {
                      const jsonData = JSON.stringify(detailData, null, 2)
                      navigator.clipboard.writeText(jsonData)
                      toast.success('Données détaillées copiées dans le presse-papier')
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                  >
                    <Download size={16} />
                    Exporter JSON
                  </button>
                </div>
              </div>

              {/* Date selector */}
              <div className="mb-4">
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 rounded-xl border border-primary-200 dark:border-primary-800">
                  <Calendar className="text-primary-600 dark:text-primary-400 flex-shrink-0" size={24} />
                  <label className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    Sélectionner une date :
                  </label>
                  <div className="relative flex-1">
                    <button
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="w-80 px-4 py-2.5 rounded-xl border-2 border-primary-300 dark:border-primary-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 cursor-pointer hover:border-primary-400 dark:hover:border-primary-600 text-center"
                    >
                      {(() => {
                        if (!detailDateRange) return 'Sélectionner...'
                        const today = new Date()
                        const yesterday = new Date(today)
                        yesterday.setDate(today.getDate() - 1)
                        const selectedDate = new Date(yesterday)
                        selectedDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)
                        return selectedDate.toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      })()}
                    </button>

                    {/* Custom date picker dropdown - aligned with date button */}
                    {showDatePicker && (
                      <>
                        {/* Overlay to close on outside click */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowDatePicker(false)}
                        />
                        <div className="absolute z-50 mt-2 w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-primary-300 dark:border-primary-700 p-6">
                          {(() => {
                            const today = new Date()
                            const yesterday = new Date(today)
                            yesterday.setDate(today.getDate() - 1)

                            const currentMonth = viewMonth.getMonth()
                            const currentYear = viewMonth.getFullYear()

                            // Get first day of month and calculate offset
                            const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
                            const startingDayOfWeek = firstDayOfMonth.getDay()
                            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

                            // Generate calendar days
                            const calendarDays = []
                            const totalCells = Math.ceil((startingDayOfWeek + daysInMonth) / 7) * 7

                            for (let i = 0; i < totalCells; i++) {
                              const dayNumber = i - startingDayOfWeek + 1
                              const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth
                              const dayDate = isValidDay ? new Date(currentYear, currentMonth, dayNumber) : null

                              // Check if day is in valid range (2 years ago to yesterday)
                              const twoYearsAgo = new Date(yesterday)
                              twoYearsAgo.setFullYear(yesterday.getFullYear() - 2)
                              const isInRange = dayDate && dayDate <= yesterday && dayDate >= twoYearsAgo

                              // Check if it's the selected date
                              const currentSelectedDate = new Date(yesterday)
                              currentSelectedDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)
                              const isSelected = dayDate &&
                                dayDate.getDate() === currentSelectedDate.getDate() &&
                                dayDate.getMonth() === currentSelectedDate.getMonth() &&
                                dayDate.getFullYear() === currentSelectedDate.getFullYear()

                              calendarDays.push({
                                dayNumber,
                                isValidDay,
                                isInRange,
                                isSelected,
                                date: dayDate
                              })
                            }

                            return (
                              <>
                                {/* Close button */}
                                <button
                                  onClick={() => setShowDatePicker(false)}
                                  className="absolute -top-2 -right-2 p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shadow-md"
                                >
                                  <svg className="w-4 h-4 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>

                                {/* Month navigation */}
                                <div className="flex items-center justify-between mb-4">
                            <button
                              onClick={() => setViewMonth(new Date(currentYear, currentMonth - 1, 1))}
                              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                              {viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                            </h3>
                            <button
                              onClick={() => setViewMonth(new Date(currentYear, currentMonth + 1, 1))}
                              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </div>

                          {/* Weekday headers */}
                          <div className="grid grid-cols-7 gap-1 mb-2">
                            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
                              <div key={i} className="text-center text-xs font-bold uppercase text-gray-600 dark:text-gray-400 py-2">
                                {day}
                              </div>
                            ))}
                          </div>

                          {/* Calendar grid */}
                          <div className="grid grid-cols-7 gap-1">
                            {calendarDays.map((day, i) => (
                              <button
                                key={i}
                                disabled={!day.isValidDay || !day.isInRange}
                                onClick={() => {
                                  if (day.date && day.isInRange) {
                                    const daysDiff = Math.floor((yesterday.getTime() - day.date.getTime()) / (1000 * 60 * 60 * 24))
                                    const newWeekOffset = Math.floor(daysDiff / 7)
                                    const newDayIndex = daysDiff % 7
                                    setDetailWeekOffset(newWeekOffset)
                                    setSelectedDetailDay(newDayIndex)
                                    setShowDatePicker(false)
                                    toast.success(`Date sélectionnée : ${day.date.toLocaleDateString('fr-FR')}`)
                                  }
                                }}
                                className={`
                                  aspect-square p-2 rounded-lg text-sm font-medium transition-all duration-200
                                  ${!day.isValidDay ? 'invisible' : ''}
                                  ${day.isValidDay && !day.isInRange ? 'text-gray-300 dark:text-gray-700 cursor-not-allowed' : ''}
                                  ${day.isValidDay && day.isInRange && !day.isSelected ? 'text-gray-700 dark:text-gray-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 cursor-pointer' : ''}
                                  ${day.isSelected ? 'bg-primary-600 text-white font-bold shadow-lg scale-105' : ''}
                                `}
                              >
                                {day.isValidDay ? day.dayNumber : ''}
                              </button>
                            ))}
                          </div>
                              </>
                            )
                          })()}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Quick access buttons - occupying remaining space */}
                  <button
                    onClick={() => {
                      setDetailWeekOffset(0)
                      setSelectedDetailDay(0)
                      toast.success("Retour à aujourd'hui")
                    }}
                    className="flex-1 px-6 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
                  >
                    Aujourd'hui
                  </button>
                  <button
                    onClick={() => {
                      setDetailWeekOffset(1)
                      setSelectedDetailDay(0)
                      toast.success("Semaine dernière sélectionnée")
                    }}
                    className="flex-1 px-6 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
                  >
                    Semaine dernière
                  </button>
                  <button
                    onClick={() => {
                      // Calculate number of weeks for 1 year ago
                      const weeksInYear = 52
                      setDetailWeekOffset(weeksInYear)
                      setSelectedDetailDay(0)
                      toast.success("Il y a un an sélectionné")
                    }}
                    className="flex-1 px-6 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg font-medium border border-gray-300 dark:border-gray-600 transition-colors whitespace-nowrap"
                  >
                    Il y a un an
                  </button>
                </div>
              </div>

              {/* Day selector tabs with navigation */}
              <div className="flex items-center gap-2 mb-4">
                {/* Left button - Go to more recent (future) */}
                <button
                  onClick={() => {
                    // If already at first day (most recent) and not on current week, load next (newer) week
                    if (selectedDetailDay === 0 && detailWeekOffset > 0) {
                      setDetailWeekOffset(prev => Math.max(0, prev - 1))
                      // When going to next week (more recent), select the last available day
                      // Set to a high number, will be auto-adjusted by useEffect to actual last index
                      setSelectedDetailDay(999)
                      toast.success('Chargement de la semaine suivante...')
                    } else if (selectedDetailDay > 0) {
                      setSelectedDetailDay(prev => prev - 1)
                    }
                  }}
                  disabled={(selectedDetailDay === 0 && detailWeekOffset === 0) || isLoadingDetail}
                  className="flex-shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={selectedDetailDay === 0 && detailWeekOffset > 0 ? "Semaine suivante (plus récente)" : "Jour suivant (plus récent)"}
                >
                  {isLoadingDetail && selectedDetailDay === 0 ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  )}
                </button>

                {/* Tabs container */}
                <div className="flex-1 flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-hidden">
                  {detailByDayData.map((dayData, idx) => {
                    const date = new Date(dayData.date)
                    const dayLabel = date.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short'
                    })

                    return (
                      <button
                        key={dayData.date}
                        onClick={() => setSelectedDetailDay(idx)}
                        className={`flex-1 px-4 py-3 font-medium transition-colors rounded-t-lg ${
                          selectedDetailDay === idx
                            ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border-b-2 border-primary-600 dark:border-primary-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/30'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm whitespace-nowrap">{dayLabel}</span>
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                            {dayData.totalEnergyKwh.toFixed(2)} kWh
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Right button - Go to older (past) */}
                <button
                  onClick={() => {
                    // If already at last day (oldest), load previous (older) week
                    if (selectedDetailDay === detailByDayData.length - 1) {
                      setDetailWeekOffset(prev => prev + 1)
                      // When going to previous week (older), select the first day of that week (day just before)
                      setSelectedDetailDay(0)
                    } else {
                      setSelectedDetailDay(prev => prev + 1)
                    }
                  }}
                  disabled={isLoadingDetail}
                  className="flex-shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={selectedDetailDay === detailByDayData.length - 1 ? "Semaine précédente (plus ancienne)" : "Jour précédent (plus ancien)"}
                >
                  {isLoadingDetail && selectedDetailDay === detailByDayData.length - 1 ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Graph for selected day */}
              <div className="relative">
                {/* Always render the graph container to maintain height */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600 min-h-[500px]">
                  {/* Content based on state */}
                  {detailByDayData.length > 0 && detailByDayData[selectedDetailDay] ? (
                    <>
                      <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                        {detailByDayData[selectedDetailDay].data.length} points de mesure pour cette journée
                      </div>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={(() => {
                          const currentData = detailByDayData[selectedDetailDay].data

                          // Prepare comparison data
                          let mergedData = currentData.map(d => ({ ...d }))

                          // Calculate current date
                          const today = new Date()
                          const yesterday = new Date(today)
                          yesterday.setDate(today.getDate() - 1)
                          const currentDate = new Date(yesterday)
                          currentDate.setDate(yesterday.getDate() - (detailWeekOffset * 7) - selectedDetailDay)

                          // Add week -1 comparison data
                          if (showDetailWeekComparison && selectedPDL) {
                            const weekAgoDate = new Date(currentDate)
                            weekAgoDate.setDate(currentDate.getDate() - 7)

                            // Normalize to start of day for comparison
                            weekAgoDate.setHours(0, 0, 0, 0)

                            // Search through all cached queries to find data for this date
                            const queryCache = queryClient.getQueryCache()
                            const allDetailQueries = queryCache.findAll({
                              queryKey: ['consumptionDetail', selectedPDL],
                              exact: false,
                            })

                            console.log(`🔍 Looking for week -1 data: ${weekAgoDate.toISOString()}, found ${allDetailQueries.length} cached queries`)

                            // Find the query that contains data for this specific date
                            for (const query of allDetailQueries) {
                              const response = query.state.data as any
                              const data = response?.data

                              if (!data?.meter_reading?.interval_reading) continue

                              const readings = data.meter_reading.interval_reading
                              if (readings.length === 0) continue

                              // Get the date range of this cached week
                              const firstReading = readings[0]
                              const lastReading = readings[readings.length - 1]

                              const firstDateTimeStr = firstReading.date.includes('T')
                                ? firstReading.date
                                : firstReading.date.replace(' ', 'T')
                              const lastDateTimeStr = lastReading.date.includes('T')
                                ? lastReading.date
                                : lastReading.date.replace(' ', 'T')

                              const weekStart = new Date(firstDateTimeStr)
                              const weekEnd = new Date(lastDateTimeStr)

                              // Normalize to start of day for comparison
                              weekStart.setHours(0, 0, 0, 0)
                              weekEnd.setHours(23, 59, 59, 999)

                              // Check if our target date falls within this week
                              const targetTime = weekAgoDate.getTime()
                              const weekStartTime = weekStart.getTime()
                              const weekEndTime = weekEnd.getTime()

                              if (targetTime >= weekStartTime && targetTime <= weekEndTime) {
                                console.log(`📦 Week -1 cached data: FOUND in week ${weekStart.toISOString()} to ${weekEnd.toISOString()}`)

                                const unit = data.meter_reading.reading_type?.unit || 'W'
                                const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

                                // Parse interval multiplier
                                const parseInterval = (interval: string): number => {
                                  const match = interval.match(/^P(\d+)([DHM])$/)
                                  if (!match) return 0.5
                                  const value = parseInt(match[1], 10)
                                  const unit = match[2]
                                  return unit === 'D' ? value * 24 : unit === 'H' ? value : value / 60
                                }
                                const intervalMultiplier = unit === 'W' ? parseInterval(intervalLength) : 1

                                // Calculate the day offset within the week
                                const daysDiff = Math.floor((weekAgoDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
                                const readingsPerDay = 48 // 30-minute intervals = 48 readings per day
                                const startIdx = daysDiff * readingsPerDay

                                console.log(`  🔢 Week -1: Extracting day ${daysDiff} from cached week (starting at reading index ${startIdx})`)

                                mergedData = mergedData.map((current, idx) => {
                                  const weekAgoReading = readings[startIdx + idx]
                                  const power = weekAgoReading?.value
                                    ? (parseFloat(weekAgoReading.value) * intervalMultiplier) / 1000
                                    : null
                                  return {
                                    ...current,
                                    powerWeekAgo: power
                                  }
                                })
                                break // Found the data, stop searching
                              }
                            }
                          }

                          // Add year -1 comparison data
                          if (showDetailYearComparison && selectedPDL) {
                            const yearAgoDate = new Date(currentDate)
                            yearAgoDate.setFullYear(yearAgoDate.getFullYear() - 1)

                            // Normalize to start of day for comparison
                            yearAgoDate.setHours(0, 0, 0, 0)

                            // Search through all cached queries to find data for this date
                            const queryCache = queryClient.getQueryCache()
                            const allDetailQueries = queryCache.findAll({
                              queryKey: ['consumptionDetail', selectedPDL],
                              exact: false,
                            })

                            console.log(`🔍 Looking for year -1 data: ${yearAgoDate.toISOString()}, found ${allDetailQueries.length} cached queries`)

                            // Find the query that contains data for this specific date
                            for (const query of allDetailQueries) {
                              const response = query.state.data as any
                              const data = response?.data

                              if (!data?.meter_reading?.interval_reading) continue

                              const readings = data.meter_reading.interval_reading
                              if (readings.length === 0) continue

                              // Get the date range of this cached week
                              const firstReading = readings[0]
                              const lastReading = readings[readings.length - 1]

                              const firstDateTimeStr = firstReading.date.includes('T')
                                ? firstReading.date
                                : firstReading.date.replace(' ', 'T')
                              const lastDateTimeStr = lastReading.date.includes('T')
                                ? lastReading.date
                                : lastReading.date.replace(' ', 'T')

                              const weekStart = new Date(firstDateTimeStr)
                              const weekEnd = new Date(lastDateTimeStr)

                              // Normalize to start of day for comparison
                              weekStart.setHours(0, 0, 0, 0)
                              weekEnd.setHours(23, 59, 59, 999)

                              // Check if our target date falls within this week
                              const targetTime = yearAgoDate.getTime()
                              const weekStartTime = weekStart.getTime()
                              const weekEndTime = weekEnd.getTime()

                              if (targetTime >= weekStartTime && targetTime <= weekEndTime) {
                                console.log(`📦 Year -1 cached data: FOUND in week ${weekStart.toISOString()} to ${weekEnd.toISOString()}`)

                                const unit = data.meter_reading.reading_type?.unit || 'W'
                                const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

                                // Parse interval multiplier
                                const parseInterval = (interval: string): number => {
                                  const match = interval.match(/^P(\d+)([DHM])$/)
                                  if (!match) return 0.5
                                  const value = parseInt(match[1], 10)
                                  const unit = match[2]
                                  return unit === 'D' ? value * 24 : unit === 'H' ? value : value / 60
                                }
                                const intervalMultiplier = unit === 'W' ? parseInterval(intervalLength) : 1

                                // Calculate the day offset within the week
                                // currentDate is the day we're viewing, yearAgoDate is the same day last year
                                // We need to find which readings from the cached week correspond to the same time of day
                                const daysDiff = Math.floor((yearAgoDate.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24))
                                const readingsPerDay = 48 // 30-minute intervals = 48 readings per day
                                const startIdx = daysDiff * readingsPerDay

                                console.log(`  🔢 Year -1: Extracting day ${daysDiff} from cached week (starting at reading index ${startIdx})`)

                                mergedData = mergedData.map((current, idx) => {
                                  const yearAgoReading = readings[startIdx + idx]
                                  const power = yearAgoReading?.value
                                    ? (parseFloat(yearAgoReading.value) * intervalMultiplier) / 1000
                                    : null
                                  return {
                                    ...current,
                                    powerYearAgo: power
                                  }
                                })
                                break // Found the data, stop searching
                              }
                            }
                          }

                          return mergedData
                        })()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                          <XAxis
                            dataKey="time"
                            stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                            style={{ fontSize: '11px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                            style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                            label={{ value: 'Puissance (kW)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                            domain={[0, 'auto']}
                          />
                          <Tooltip
                            cursor={{ stroke: '#3B82F6', strokeWidth: 2 }}
                            contentStyle={{
                              backgroundColor: '#1F2937',
                              border: '1px solid #374151',
                              borderRadius: '8px',
                              color: '#F9FAFB'
                            }}
                            formatter={(value: number, _name: string, props: any) => {
                              const dataPoint = props.payload
                              if (!dataPoint) return [`${value.toFixed(3)} kW`, 'Puissance moyenne']

                              return [
                                <div key="tooltip-content" className="flex flex-col gap-1">
                                  <div className="font-semibold">{dataPoint.power.toFixed(3)} kW</div>
                                  <div className="text-xs text-gray-400">
                                    Énergie: {dataPoint.energyKwh.toFixed(4)} kWh
                                  </div>
                                </div>,
                                'Puissance moyenne'
                              ]
                            }}
                            labelFormatter={(label) => `Heure: ${label}`}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="power"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={{ fill: '#3B82F6', r: 3 }}
                            activeDot={{ r: 6 }}
                            name="Consommation (kW)"
                          />
                          {showDetailWeekComparison && (
                            <Line
                              type="monotone"
                              dataKey="powerWeekAgo"
                              stroke="#10B981"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              name="Semaine -1 (kW)"
                            />
                          )}
                          {showDetailYearComparison && (
                            <Line
                              type="monotone"
                              dataKey="powerYearAgo"
                              stroke="#F59E0B"
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              dot={false}
                              name="Année -1 (kW)"
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    // Empty state when no data
                    <div className="flex items-center justify-center h-[468px]">
                      <div className="flex flex-col items-center justify-center gap-4 text-center">
                        <BarChart3 className="text-gray-400 dark:text-gray-600" size={48} />
                        <p className="text-gray-600 dark:text-gray-400">
                          Aucune donnée détaillée disponible pour cette période
                        </p>
                        {detailDateRange && (
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            Période demandée : du {new Date(detailDateRange.start).toLocaleDateString('fr-FR')} au {new Date(detailDateRange.end).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Loading overlay - positioned absolutely on top */}
                {isLoadingDetail && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                    <div className="flex flex-col items-center justify-center gap-4 p-8">
                      <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={48} />
                      <p className="text-gray-900 dark:text-white font-semibold text-center">
                        Chargement des données détaillées...
                      </p>
                      {detailDateRange && (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Du {new Date(detailDateRange.start).toLocaleDateString('fr-FR')} au {new Date(detailDateRange.end).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Monthly HC/HP Chart by Rolling Year */}
              {monthlyHcHpByYear.length > 0 && selectedPDLDetails?.offpeak_hours && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Consommation HC/HP par mois
                    </h3>
                    <div className="flex items-center gap-2">
                      {/* Comparison toggle - only show if current year is selected and previous year exists */}
                      {selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear.length > 1 && (
                        <button
                          onClick={() => setShowYearComparison(!showYearComparison)}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                            showYearComparison
                              ? 'bg-green-600 hover:bg-green-700 text-white dark:bg-green-500 dark:hover:bg-green-600'
                              : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          Année -1
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const jsonData = JSON.stringify(monthlyHcHpByYear, null, 2)
                          navigator.clipboard.writeText(jsonData)
                          toast.success('Données HC/HP mensuelles copiées dans le presse-papier')
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                      >
                        <Download size={16} />
                        Exporter JSON
                      </button>
                    </div>
                  </div>

                  {/* Tabs for year selection */}
                  <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                    {monthlyHcHpByYear.map((yearData, index) => (
                      <button
                        key={yearData.year}
                        onClick={() => setSelectedMonthlyHcHpYear(index)}
                        className={`flex-1 px-4 py-2 font-medium transition-colors ${
                          selectedMonthlyHcHpYear === index
                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        {yearData.year}
                      </button>
                    ))}
                  </div>

                  {/* Display selected year chart */}
                  {monthlyHcHpByYear[selectedMonthlyHcHpYear] && (() => {
                    const yearData = monthlyHcHpByYear[selectedMonthlyHcHpYear]
                    const previousYearData = showYearComparison && selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear[1]
                      ? monthlyHcHpByYear[1]
                      : null

                    // Merge data for comparison if enabled
                    let chartData = yearData.months
                    if (previousYearData) {
                      // Create a map of previous year data by month name (without year)
                      const prevDataMap = new Map(
                        previousYearData.months.map(m => {
                          const monthName = m.month.split(' ')[0] // Extract "janv.", "févr.", etc.
                          return [monthName, { hcKwh: m.hcKwh, hpKwh: m.hpKwh }]
                        })
                      )

                      // Merge with current year data
                      chartData = yearData.months.map(m => {
                        const monthName = m.month.split(' ')[0]
                        const prevData = prevDataMap.get(monthName)
                        return {
                          month: monthName,
                          hcKwh: m.hcKwh,
                          hpKwh: m.hpKwh,
                          prevHcKwh: prevData?.hcKwh || 0,
                          prevHpKwh: prevData?.hpKwh || 0,
                        }
                      })
                    }

                    return (
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
                        <ResponsiveContainer width="100%" height={400}>
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                            <XAxis
                              dataKey="month"
                              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                              tick={{ fill: isDarkMode ? '#FFFFFF' : '#6B7280', fontSize: 12 }}
                            />
                            <YAxis
                              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                              tick={{ fill: isDarkMode ? '#FFFFFF' : '#6B7280', fontSize: 12 }}
                              label={{ value: 'Consommation (kWh)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                            />
                            <Tooltip
                              cursor={{ fill: 'rgba(59, 130, 246, 0.15)' }}
                              contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F9FAFB'
                              }}
                              formatter={(value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' kWh'}
                            />
                            <Legend />
                            {showYearComparison && previousYearData ? (
                              <>
                                <Bar dataKey="hcKwh" name={`HC ${yearData.year}`} stackId="current" fill="#3b82f6" />
                                <Bar dataKey="hpKwh" name={`HP ${yearData.year}`} stackId="current" fill="#f97316" />
                                <Bar dataKey="prevHcKwh" name={`HC ${previousYearData.year}`} stackId="previous" fill="#93c5fd" />
                                <Bar dataKey="prevHpKwh" name={`HP ${previousYearData.year}`} stackId="previous" fill="#fdba74" />
                              </>
                            ) : (
                              <>
                                <Bar dataKey="hcKwh" name="Heures Creuses (HC)" stackId="a" fill="#3b82f6" />
                                <Bar dataKey="hpKwh" name="Heures Pleines (HP)" stackId="a" fill="#f97316" />
                              </>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Info note - only show when we have data */}
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

      {/* Max Power Section - Only show when data is fully loaded and not currently loading */}
      {allLoadingComplete && (
        <div className={`mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 ${
          isPowerSectionExpanded ? 'p-6' : ''
        }`}>
          <div
            className={`bg-primary-600 text-white px-4 py-3 flex items-center justify-between ${
              isLoading || isLoadingDetailed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              isPowerSectionExpanded ? '-mx-6 -mt-6 rounded-t-lg' : 'rounded-lg'
            }`}
            onClick={() => {
              if (!isLoading && !isLoadingDetailed) {
                setIsPowerSectionExpanded(!isPowerSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-3">
              <TrendingUp size={24} />
              <h2 className="text-xl font-semibold">Pics de puissance maximale</h2>
            </div>
            <div className="flex items-center gap-2">
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

          {isPowerSectionExpanded && (
            <div className="mt-6">
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => {
                  const jsonData = JSON.stringify(maxPowerData, null, 2)
                  navigator.clipboard.writeText(jsonData)
                  toast.success('Données de puissance copiées dans le presse-papier')
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
              >
                <Download size={16} />
                Exporter JSON
              </button>
            </div>

            {/* Tabs for year selection */}
            <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
              {[...powerByYearData].reverse().map((yearData, idx) => {
                const originalIdx = powerByYearData.length - 1 - idx
                return (
                  <button
                    key={yearData.label}
                    onClick={() => setSelectedPowerYear(originalIdx)}
                    className={`flex-1 px-4 py-2 font-medium transition-colors ${
                      selectedPowerYear === originalIdx
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    {yearData.label}
                  </button>
                )
              })}
            </div>

            {/* Display selected year graph */}
            {powerByYearData[selectedPowerYear] && (() => {
              const yearData = powerByYearData[selectedPowerYear]
              const colors = ['#EF4444', '#F59E0B', '#10B981']
              const color = colors[selectedPowerYear % colors.length]

              return (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={yearData.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
                      <XAxis
                        dataKey="date"
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '11px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                        tickFormatter={(value) => {
                          const date = new Date(value)
                          return `${date.getDate()}/${date.getMonth() + 1}`
                        }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                        style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                        label={{ value: 'Puissance (kW)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        cursor={{ stroke: color, strokeWidth: 2 }}
                        contentStyle={{
                          backgroundColor: '#1F2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#F9FAFB'
                        }}
                        formatter={(value: number, _name: string, props: any) => {
                          const time = props.payload?.time
                          if (time) {
                            return [`${value.toFixed(2)} kW à ${time}`, 'Puissance max']
                          }
                          return [`${value.toFixed(2)} kW`, 'Puissance max']
                        }}
                        labelFormatter={(label) => {
                          const date = new Date(label)
                          return date.toLocaleDateString('fr-FR')
                        }}
                      />
                      <Legend />

                      {/* Reference line for subscribed power */}
                      {selectedPDLDetails?.subscribed_power && (
                        <ReferenceLine
                          y={selectedPDLDetails.subscribed_power}
                          stroke="#8B5CF6"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{
                            value: `Puissance souscrite: ${selectedPDLDetails.subscribed_power} kVA`,
                            position: 'insideTopRight',
                            fill: '#8B5CF6',
                            fontSize: 12
                          }}
                        />
                      )}

                      <Line
                        type="monotone"
                        dataKey="power"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                        name={`Puissance max ${yearData.label}`}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}

            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>ℹ️ Note :</strong> Ces graphiques montrent les pics de puissance maximale atteints chaque jour sur les 3 dernières années.
                {selectedPDLDetails?.subscribed_power && (
                  <> La ligne violette en pointillés indique votre puissance souscrite ({selectedPDLDetails.subscribed_power} kVA).
                  Le compteur Linky autorise des dépassements temporaires de cette limite, donc un pic ponctuel au-dessus de cette ligne ne provoquera pas nécessairement de disjonction.
                  Cependant, si les pics dépassent régulièrement ou de manière prolongée cette ligne, vous risquez de disjoncter.</>
                )}
              </p>
            </div>
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

      {/* Info Card */}
      <div className="card mt-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-2">Informations</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Les données sont récupérées depuis l'API Enedis Data Connect</li>
                <li>L'endpoint utilisé est <code className="bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">consumption/daily</code> (relevés quotidiens)</li>
                <li>Les données sont mises en cache pour optimiser les performances</li>
                <li>Récupération automatique de 1095 jours d'historique (limite maximale Enedis)</li>
                <li>Les données Enedis ne sont disponibles qu'en J-1 (hier)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Confirmation requise
              </h3>
            </div>

            {/* Modal Content */}
            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Êtes-vous sûr de vouloir vider tout le cache ?
              </p>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>⚠️ Attention :</strong> Cette action va supprimer :
                </p>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 ml-4 list-disc space-y-1">
                  <li>Tout le cache du navigateur (localStorage, sessionStorage, IndexedDB)</li>
                  <li>Toutes les données en cache Redis</li>
                </ul>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-3">
                  Cette action est <strong>irréversible</strong> et la page se rechargera automatiquement.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={confirmClearCache}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium flex items-center gap-2"
              >
                <Trash2 size={18} />
                Vider le cache
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
