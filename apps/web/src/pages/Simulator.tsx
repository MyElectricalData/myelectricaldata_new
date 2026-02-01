import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Calculator, AlertCircle, Loader2, ChevronDown, FileDown, ArrowUpDown, ArrowUp, ArrowDown, Filter, Info, ArrowRight, ExternalLink, Users, X } from 'lucide-react'
import { useQuery, useQueryClient, useIsRestoring } from '@tanstack/react-query'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { AnimatedSection } from '@/components/AnimatedSection'
import { PeriodSelector } from '@/components/PeriodSelector'
import { energyApi, type EnergyProvider, type EnergyOffer } from '@/api/energy'
import { tempoApi, type TempoDay } from '@/api/tempo'
import type { PDL } from '@/types/api'
import jsPDF from 'jspdf'
import { logger } from '@/utils/logger'
import { ModernButton } from './Simulator/components/ModernButton'
import { useIsDemo } from '@/hooks/useIsDemo'
import { usePdlStore } from '@/stores/pdlStore'
import { useDatePreferencesStore, getDateRangeFromPreset, DATE_PRESET_LABELS } from '@/stores/datePreferencesStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'
import { useAllPdls } from '@/hooks/useAllPdls'

// Helper function to check if a date is weekend (Saturday or Sunday)
function isWeekend(dateString: string): boolean {
  const date = new Date(dateString)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6 // 0 = Sunday, 6 = Saturday
}

// Helper function to check if tariff is older than 6 months
function isOldTariff(validFrom: string | undefined): boolean {
  if (!validFrom) return false
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  return new Date(validFrom) < sixMonthsAgo
}

// Helper function to check if a date is in winter season (November to March)
function isWinterSeason(dateString: string): boolean {
  const date = new Date(dateString)
  const month = date.getMonth() // 0 = January, 11 = December
  // Winter: November (10), December (11), January (0), February (1), March (2)
  return month >= 10 || month <= 2
}

// Helper function to determine offpeak hours for specific Enercoop offers
function getEnerocoopOffpeakHours(offerName: string, hour: number, isWeekendOrHoliday: boolean, isWinter: boolean): boolean {
  // Flexi Watt nuit & week-end: 23h-6h en semaine, tout le week-end/jours fériés
  if (offerName.includes('nuit & weekend') || offerName.includes('nuit & week-end')) {
    if (isWeekendOrHoliday) return true
    return hour >= 23 || hour < 6
  }

  // Flexi Watt 2 saisons (et option Jours de pointe):
  // Hiver: 0h-7h et 13h-16h en semaine, tout le week-end/jours fériés
  // Été: 11h-17h en semaine, tout le week-end/jours fériés
  if (offerName.includes('2 saisons') || offerName.includes('Pointe')) {
    if (isWeekendOrHoliday) return true

    if (isWinter) {
      // Hiver: minuit-7h et 13h-16h
      return (hour >= 0 && hour < 7) || (hour >= 13 && hour < 16)
    } else {
      // Été: 11h-17h
      return hour >= 11 && hour < 17
    }
  }

  return false // Not an Enercoop special offer
}

// Helper function to check if an hour is in offpeak hours
function isOffpeakHour(hour: number, offpeakConfig?: Record<string, string | string[]> | string[] | { ranges?: string[] }): boolean {
  if (!offpeakConfig) {
    // Default: 22h-6h if no config
    return hour >= 22 || hour < 6
  }

  // Parse offpeak hours from config
  // Format can be: {"default": "22h30-06h30"} or {"HC": "22:00-06:00"} or "HC (22H00-6H00)" or array of strings
  // Or: {ranges: ["22h30-06h30"]} (new format from PDL config)
  let values: string[] = []

  if (Array.isArray(offpeakConfig)) {
    values = offpeakConfig
  } else if (typeof offpeakConfig === 'object' && offpeakConfig !== null) {
    // Check for {ranges: [...]} format first
    if ('ranges' in offpeakConfig && Array.isArray(offpeakConfig.ranges)) {
      values = offpeakConfig.ranges
    } else {
      // Flatten all values from the object
      values = Object.values(offpeakConfig).flat().filter((v): v is string => typeof v === 'string')
    }
  }

  for (const range of values) {
    // Skip non-string values
    if (typeof range !== 'string') continue

    // Extract hours from various formats: "22h30-06h30", "22:00-06:00", "HC (22H00-6H00)", etc.
    // Match: optional text, then first hour (1-2 digits), separator, then second hour
    const match = range.match(/(\d{1,2})[hH:]\d{0,2}\s*-\s*(\d{1,2})[hH:]?\d{0,2}/)
    if (match) {
      const startHour = parseInt(match[1])
      const endHour = parseInt(match[2])

      // Log the parsed range (only once)
      if (!(isOffpeakHour as any)._logged) {
        logger.log(`[isOffpeakHour] Parsed "${range}" as ${startHour}h-${endHour}h (regex matched: "${match[0]}")`)
        ;(isOffpeakHour as any)._logged = true
      }

      // Handle ranges that cross midnight
      if (startHour > endHour) {
        // e.g., 22-6 means 22:00-23:59 and 0:00-5:59
        if (hour >= startHour || hour < endHour) {
          return true
        }
      } else {
        // Normal range (shouldn't happen for offpeak but handle it)
        if (hour >= startHour && hour < endHour) {
          return true
        }
      }
    }
  }

  // Fallback to default
  return hour >= 22 || hour < 6
}

// Helper function to safely format prices (handles both strings and numbers)
function formatPrice(value: string | number | undefined | null, decimals: number = 5): string {
  if (value === undefined || value === null) return '0'.padEnd(decimals + 2, '0')
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  return isNaN(numValue) ? '0'.padEnd(decimals + 2, '0') : numValue.toFixed(decimals)
}

// Helper function to safely multiply and format (handles string prices)
function calcPrice(quantity: number | undefined, price: string | number | undefined): string {
  const qty = quantity || 0
  const priceNum = typeof price === 'string' ? parseFloat(price) : (price || 0)
  return (qty * priceNum).toFixed(2)
}

export default function Simulator() {
  // const { user } = useAuth() // Unused for now
  const queryClient = useQueryClient()
  const isRestoring = useIsRestoring()
  const isDemo = useIsDemo()
  const { setIsLoading } = useDataFetchStore()
  const demoAutoFetchDone = useRef(false)

  // Fetch user's PDLs + shared PDLs (for admins) - includes selected_offer_id for shared PDLs
  const { allPdls: pdlsData, isLoading: pdlsLoading, userPdlsError: pdlsError } = useAllPdls({
    staleTime: 30 * 1000, // 30 seconds - same as Dashboard for consistency
  })

  // Fetch energy providers and offers
  const { data: providersDataRaw, isLoading: providersLoading } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyProvider[]
      }
      return []
    },
    staleTime: 0,
  })

  // Ensure providersData is always an array
  const providersData = Array.isArray(providersDataRaw) ? providersDataRaw : []

  const { data: offersDataRaw, isLoading: offersLoading } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: async () => {
      const response = await energyApi.getOffers()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyOffer[]
      }
      return []
    },
    staleTime: 0, // Always refetch to ensure fresh data
  })

  // Ensure offersData is always an array
  const offersData = Array.isArray(offersDataRaw) ? offersDataRaw : []

  // Selected PDL from global store + reference offer for shared PDLs
  const { selectedPdl, setSelectedPdl, impersonation, referenceOffers, setReferenceOffer } = usePdlStore()

  // HYBRID APPROACH for consumptionDetail: useQuery creates the cache entry for persistence,
  // but we read data via subscription to avoid race conditions with IndexedDB hydration
  const { isLoading: isConsumptionCacheLoading } = useQuery({
    queryKey: ['consumptionDetail', selectedPdl],
    queryFn: async () => {
      // Read from cache - this makes the query succeed with status: 'success'
      // Data is written to cache via setQueryData in useUnifiedDataFetch
      const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPdl])
      return cachedData || null
    },
    enabled: !!selectedPdl,
    staleTime: Infinity, // Never refetch - data only comes from setQueryData
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // Read consumptionDetail data via direct cache access + subscription
  const [cachedConsumptionData, setCachedConsumptionData] = useState<any>(null)

  // Subscribe to cache updates IMMEDIATELY (don't wait for hydration)
  // This ensures we capture setQueryData events even while hydrating
  useEffect(() => {
    if (!selectedPdl) {
      setCachedConsumptionData(null)
      return
    }

    // Subscribe to future changes (when setQueryData is called)
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Listen to 'updated' events for this query (setQueryData triggers 'updated')
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'consumptionDetail' &&
        event?.query?.queryKey?.[1] === selectedPdl
      ) {
        const updatedData = queryClient.getQueryData(['consumptionDetail', selectedPdl])
        setCachedConsumptionData(updatedData)
      }
    })

    return () => unsubscribe()
  }, [selectedPdl, queryClient])

  // Read initial data from cache AFTER hydration completes
  useEffect(() => {
    if (!selectedPdl || isRestoring) return

    // Hydration complete - read current data from cache
    const initialData = queryClient.getQueryData(['consumptionDetail', selectedPdl])
    if (initialData) {
      setCachedConsumptionData(initialData)
    }
  }, [selectedPdl, queryClient, isRestoring])

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false)
  const [simulationResult, setSimulationResult] = useState<any>(null)
  const [_fetchProgress, setFetchProgress] = useState<{current: number, total: number, phase: string}>({current: 0, total: 0, phase: ''})
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedCalculations, setExpandedCalculations] = useState<Set<string>>(new Set())
  const [hasAutoLaunched, setHasAutoLaunched] = useState(false)
  const [isInitialLoadingFromCache, setIsInitialLoadingFromCache] = useState(false)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const [isInfoSectionExpanded, setIsInfoSectionExpanded] = useState(true)
  const [isInitializing, setIsInitializing] = useState(true)
  // const [isClearingCache, setIsClearingCache] = useState(false) // Unused for now

  // Note: We DO NOT register handleSimulation in the global store
  // because PageHeader already handles the unified fetch function.
  // The Simulator uses its own button to trigger simulation.

  // Filters and sorting state
  const [filterType, setFilterType] = useState<string>('all')
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [showOnlyRecent, setShowOnlyRecent] = useState(false)
  const [sortBy, setSortBy] = useState<'total' | 'subscription' | 'energy'>('total')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Reference offer selector filters (for shared PDLs)
  const [refOfferFilterProvider, setRefOfferFilterProvider] = useState<string>('all')
  const [refOfferFilterType, setRefOfferFilterType] = useState<string>('all')

  // Period selection state - initialise depuis les preferences utilisateur
  type PeriodOption = 'rolling' | '2025' | '2024' | 'profile' | 'custom'
  const { preset: userPreset, customDate: userCustomDate } = useDatePreferencesStore()
  const profileRange = useMemo(() => getDateRangeFromPreset(userPreset, userCustomDate), [userPreset, userCustomDate])
  const profileLabel = DATE_PRESET_LABELS[userPreset]
  // Initialiser sur le profil sauf si le profil est deja "rolling" (doublon avec le raccourci Annee glissante)
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(userPreset === 'rolling' ? 'rolling' : 'profile')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Calculate actual dates based on period selection
  const { simulationStartDate, simulationEndDate, periodLabel } = useMemo(() => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    let startDate: string
    let endDate: string
    let label: string

    // Helper to get year period (Jan 1 to Dec 31 or yesterday if current year)
    const getYearPeriod = (year: number) => {
      const yearStart = `${year}-01-01`
      const yearEnd = year === today.getFullYear() ? yesterdayStr : `${year}-12-31`
      return { start: yearStart, end: yearEnd }
    }

    switch (selectedPeriod) {
      case 'rolling': {
        // Rolling year: yesterday - 364 days to yesterday
        const start = new Date(yesterday)
        start.setDate(start.getDate() - 364)
        startDate = start.toISOString().split('T')[0]
        endDate = yesterdayStr
        label = 'Année glissante'
        break
      }
      case '2025': {
        const period = getYearPeriod(2025)
        startDate = period.start
        endDate = period.end
        label = 'Année 2025'
        break
      }
      case '2024': {
        const period = getYearPeriod(2024)
        startDate = period.start
        endDate = period.end
        label = 'Année 2024'
        break
      }
      case 'profile': {
        startDate = profileRange.start
        const profEnd = new Date(profileRange.end)
        endDate = profEnd > yesterday ? yesterdayStr : profileRange.end
        label = profileLabel
        break
      }
      case 'custom': {
        if (customStartDate && customEndDate) {
          startDate = customStartDate
          const customEnd = new Date(customEndDate)
          // Ensure custom end date is not in the future
          if (customEnd > yesterday) {
            endDate = yesterdayStr
            label = `Du ${customStartDate} au ${yesterdayStr}`
          } else {
            endDate = customEndDate
            label = `Du ${customStartDate} au ${customEndDate}`
          }
          break
        }
        // Fallback to rolling year if custom dates not set
        const start = new Date(yesterday)
        start.setDate(start.getDate() - 364)
        startDate = start.toISOString().split('T')[0]
        endDate = yesterdayStr
        label = 'Année glissante'
        break
      }
      default: {
        const start = new Date(yesterday)
        start.setDate(start.getDate() - 364)
        startDate = start.toISOString().split('T')[0]
        endDate = yesterdayStr
        label = 'Année glissante'
      }
    }

    return { simulationStartDate: startDate, simulationEndDate: endDate, periodLabel: label }
  }, [selectedPeriod, customStartDate, customEndDate, profileRange, profileLabel])

  // Get PDL details for demo auto-fetch
  const allPDLs: PDL[] = Array.isArray(pdlsData) ? pdlsData : []
  const selectedPDLDetails = allPDLs.find(p => p.usage_point_id === selectedPdl)

  // Hook for demo auto-fetch
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL: selectedPdl,
    selectedPDLDetails,
    allPDLs,
    pageContext: 'consumption',
  })

  // Check if data is in cache for auto-fetch logic
  const hasDataInCache = useMemo(() => {
    if (!selectedPdl) return false
    const cachedData = queryClient.getQueryData(['consumptionDetail', selectedPdl]) as any
    return cachedData?.data?.meter_reading?.interval_reading?.length > 0
  }, [selectedPdl, queryClient, cachedConsumptionData])

  // Extract available dates from cached data (dates with consumption data)
  const availableDates = useMemo(() => {
    const dates = new Set<string>()
    if (cachedConsumptionData?.data?.meter_reading?.interval_reading) {
      const readings = cachedConsumptionData.data.meter_reading.interval_reading
      readings.forEach((point: any) => {
        if (point.date) {
          // Extract just the date part (YYYY-MM-DD)
          const dateStr = point.date.split(' ')[0].split('T')[0]
          dates.add(dateStr)
        }
      })
    }
    return dates
  }, [cachedConsumptionData])

  // Set first active PDL as selected by default
  useEffect(() => {
    logger.log('[Simulator] pdlsData in useEffect:', pdlsData, 'isArray:', Array.isArray(pdlsData))
    if (pdlsData && pdlsData.length > 0 && !selectedPdl) {
      // Filter active PDLs (if is_active is undefined, consider it as active)
      const activePdls = pdlsData.filter((pdl) => pdl.is_active !== false)
      if (activePdls.length > 0) {
        setSelectedPdl(activePdls[0].usage_point_id)
      }
    }
  }, [pdlsData, selectedPdl])

  // Track if simulation has been run at least once (to avoid auto-run on mount)
  const hasSimulationRun = useRef(false)

  // Clear simulation result when PDL changes
  useEffect(() => {
    setSimulationResult(null)
    setSimulationError(null)
    setHasAutoLaunched(false)
    setIsInitialLoadingFromCache(false)
    setIsLoadingExiting(false)
    setIsInfoSectionExpanded(true)
    setIsInitializing(true)
    // Reset the simulation run tracker when PDL changes
    hasSimulationRun.current = false
  }, [selectedPdl])

  // Auto-recalculate simulation when period changes (if simulation was already run)
  useEffect(() => {
    if (simulationResult && hasSimulationRun.current && !isSimulating) {
      logger.log('[Simulator] Period changed, re-running simulation...')
      handleSimulation()
    }
  }, [simulationStartDate, simulationEndDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mark simulation as having run when results are set
  useEffect(() => {
    if (simulationResult) {
      hasSimulationRun.current = true
    }
  }, [simulationResult])

  // End initialization when required data is loaded (offers, providers, and cache hydration)
  // This ensures auto-launch can check cache properly before showing empty state
  useEffect(() => {
    // Wait for all data sources to finish loading
    if (!offersLoading && !providersLoading && !isConsumptionCacheLoading) {
      // Small delay to allow any final state updates
      const timer = setTimeout(() => {
        setIsInitializing(false)
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [selectedPdl, offersLoading, providersLoading, isConsumptionCacheLoading])

  // Auto-fetch data for demo account
  useEffect(() => {
    if (isDemo && selectedPdl && selectedPDLDetails && !demoAutoFetchDone.current && !hasDataInCache && !isInitializing) {
      logger.log('[DEMO] Auto-fetching data for demo account on Simulator')
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

  // Auto-collapse info section when simulation results are available
  useEffect(() => {
    if (simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0) {
      setIsInfoSectionExpanded(false)
    }
  }, [simulationResult])

  const handleSimulation = useCallback(async () => {
    if (!selectedPdl) {
      setSimulationError('Veuillez sélectionner un PDL')
      return
    }

    setIsSimulating(true)
    // Trigger exit animation before clearing loading overlay
    setIsLoadingExiting(true)
    setTimeout(() => {
      setIsInitialLoadingFromCache(false)
      setIsLoadingExiting(false)
    }, 300)
    // Ne pas reset simulationResult ici : garder les anciens resultats visibles pendant le recalcul
    setFetchProgress({current: 0, total: 0, phase: ''})
    setSimulationError(null)

    try {
      // Get selected PDL configuration
      const pdl = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
      logger.log('Selected PDL:', pdl)
      logger.log('Offpeak hours config:', pdl?.offpeak_hours)
      // Récupérer les consommations horaires pour la période sélectionnée
      // La date de fin doit être antérieure à la date actuelle selon Enedis
      const startDate = simulationStartDate
      const endDate = simulationEndDate

      setFetchProgress({ current: 0, total: 1, phase: `Chargement des données depuis le cache (${periodLabel})...` })

      logger.log(`Loading consumption data from cache: ${startDate} to ${endDate}`)

      // Use cachedConsumptionData from state (already hydrated from IndexedDB via subscription)
      let allPoints: any[] = []

      if (cachedConsumptionData?.data?.meter_reading?.interval_reading) {
        const readings = cachedConsumptionData.data.meter_reading.interval_reading

        // Filter readings to the desired date range (rolling year)
        allPoints = readings.filter((point: any) => {
          const pointDate = point.date.split(' ')[0].split('T')[0]
          return pointDate >= startDate && pointDate <= endDate
        })

        logger.log(`[Simulator] Filtered ${allPoints.length} points from ${readings.length} total (${startDate} to ${endDate})`)
      }

      logger.log(`Cache response: ${allPoints.length} points for ${startDate} to ${endDate}`)

      if (allPoints.length === 0) {
        throw new Error(`Aucune donnée en cache pour la période ${startDate} - ${endDate}. Veuillez d'abord récupérer les données depuis la page Consommation.`)
      }

      // Create response structure compatible with the rest of the code
      const response = {
        success: true,
        data: {
          meter_reading: {
            interval_reading: allPoints
          }
        }
      }

      const allData = [response.data]

      setFetchProgress({ current: 1, total: 1, phase: 'Calcul des simulations en cours...' })

      // Fetch TEMPO colors for the period
      let tempoColors: TempoDay[] = []
      try {
        const tempoResponse = await tempoApi.getDays(startDate, endDate)
        logger.log('[TEMPO API] Response:', tempoResponse)
        if (tempoResponse.success && Array.isArray(tempoResponse.data)) {
          tempoColors = tempoResponse.data
          logger.log('[TEMPO API] First 3 days:', JSON.stringify(tempoColors.slice(0, 3), null, 2))
        }
      } catch (error) {
        logger.warn('Could not fetch TEMPO colors:', error)
      }

      // Get subscribed power from selected PDL
      const selectedPdlData = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
      const subscribedPower = selectedPdlData?.subscribed_power

      // Ensure offersData is an array
      const offersArray = Array.isArray(offersData) ? offersData : []

      // Filter offers by subscribed power if available
      const filteredOffers = subscribedPower && offersArray.length > 0
        ? offersArray.filter((offer) => {
            const match = offer.name.match(/(\d+)\s*kVA/i)
            if (match) {
              const offerPower = parseInt(match[1])
              return offerPower === subscribedPower
            }
            return true
          })
        : offersArray

      if (offersArray.length === 0) {
        throw new Error('Aucune offre disponible. Veuillez patienter le temps du chargement des offres.')
      }

      if (filteredOffers.length === 0) {
        throw new Error(`Aucune offre disponible pour la puissance souscrite de ${subscribedPower} kVA`)
      }

      // Calculer les simulations pour chaque offre
      const result = calculateSimulationsForAllOffers(allData, filteredOffers, providersData || [], tempoColors, pdl)

      logger.log('Simulation result:', result)

      if (!result || result.length === 0) {
        throw new Error('Aucun résultat de simulation généré')
      }

      setSimulationResult(result)
    } catch (error: any) {
      console.error('Simulation error:', error)
      const errorMessage = error.message || 'Erreur inconnue'
      setSimulationError(`Erreur lors de la simulation: ${errorMessage}`)
    } finally {
      setIsSimulating(false)
    }
  }, [selectedPdl, pdlsData, offersData, providersData, cachedConsumptionData, simulationStartDate, simulationEndDate, periodLabel])

  const calculateSimulationsForAllOffers = (consumptionData: any[], offers: EnergyOffer[], providers: EnergyProvider[], tempoColors: TempoDay[], pdl?: PDL) => {
    // Create a map of date -> TEMPO color for fast lookup
    const tempoColorMap = new Map<string, 'BLUE' | 'WHITE' | 'RED'>()
    if (Array.isArray(tempoColors)) {
      tempoColors.forEach((day) => {
        // day.date is now in YYYY-MM-DD format directly (no need to split)
        tempoColorMap.set(day.date, day.color)
      })
    }

    logger.log(`TEMPO colors loaded: ${tempoColorMap.size} days`)
    logger.log('Sample TEMPO dates:', Array.from(tempoColorMap.keys()).slice(0, 5))

    // Extract all consumption values
    const allConsumption: { date: string; dateOnly: string; value: number; hour?: number }[] = []

    consumptionData.forEach((periodData: any) => {
      if (periodData?.meter_reading?.interval_reading) {
        periodData.meter_reading.interval_reading.forEach((reading: any) => {
          if (reading.value && reading.date) {
            // Extract date part (YYYY-MM-DD) - handle both "2024-10-04T01:00:00" and "2024-10-04 01:00:00"
            const dateOnly = reading.date.includes('T')
              ? reading.date.split('T')[0]
              : reading.date.split(' ')[0]

            // Extract hour from date string (format can be "2024-10-04T01:00:00" or "2024-10-04 01:00:00")
            const timePart = reading.date.includes('T')
              ? reading.date.split('T')[1]
              : reading.date.split(' ')[1]
            const hour = timePart ? parseInt(timePart.split(':')[0]) : 0

            // Get interval_length for this reading (PT30M, PT60M, etc.)
            const intervalLength = reading.interval_length || 'sont à '
            const intervalMatch = intervalLength.match(/PT(\d+)M/)
            const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30

            // Convert W to Wh: value_wh = value_w * (interval_minutes / 60)
            // Equivalent to: value_wh = value_w / (60 / interval_minutes)
            const valueW = parseFloat(reading.value)
            const valueWh = valueW / (60 / intervalMinutes)

            allConsumption.push({
              date: reading.date,
              dateOnly,
              value: valueWh,
              hour,
            })
          }
        })
      }
    })

    // Check for duplicates
    const uniqueDates = new Set(allConsumption.map(item => item.date))
    const hasDuplicates = uniqueDates.size !== allConsumption.length

    logger.log('Total consumption points (before deduplication):', allConsumption.length)
    logger.log('Unique dates:', uniqueDates.size)
    logger.log('Has duplicates?', hasDuplicates)

    if (hasDuplicates) {
      logger.warn(`⚠️ DUPLICATE DETECTED: ${allConsumption.length - uniqueDates.size} duplicate points found! Filtering duplicates...`)
    }

    // Filter duplicates: keep only first occurrence of each date
    const seenDates = new Set<string>()
    const dedupedConsumption = allConsumption.filter(item => {
      if (seenDates.has(item.date)) {
        return false // Skip duplicate
      }
      seenDates.add(item.date)
      return true // Keep first occurrence
    })

    logger.log('Total consumption points (after deduplication):', dedupedConsumption.length)

    // Use deduplicated data for calculations
    const allConsumptionFinal = dedupedConsumption

    // Calculate total kWh
    const totalKwh = allConsumptionFinal.reduce((sum, item) => sum + (item.value / 1000), 0) // Convert Wh to kWh

    logger.log('Total kWh for year:', totalKwh)
    logger.log('First 3 consumption samples:', JSON.stringify(allConsumptionFinal.slice(0, 3), null, 2))

    // Calculer le nombre de mois de la plage pour proratiser l'abonnement
    const uniqueDays = new Set(allConsumptionFinal.map(item => item.dateOnly))
    const periodDays = uniqueDays.size
    const periodMonths = periodDays / 30.44 // Nombre moyen de jours par mois

    // Simulate each offer
    const results = offers.map((offer) => {
      const provider = providers.find((p) => p.id === offer.provider_id)
      const subscriptionCostYear = offer.subscription_price * periodMonths

      let energyCost = 0

      // Declare all breakdown variables at the top
      let hcKwh = 0, hpKwh = 0
      let hcWeekendKwh = 0, hpWeekendKwh = 0, baseWeekendKwh = 0, baseWeekdayKwh = 0
      let hcWinterKwh = 0, hpWinterKwh = 0, hcSummerKwh = 0, hpSummerKwh = 0
      let blueHcKwh = 0, blueHpKwh = 0
      let whiteHcKwh = 0, whiteHpKwh = 0
      let redHcKwh = 0, redHpKwh = 0
      let peakDayKwh = 0
      // ZEN_FLEX breakdown: Eco days (normal) vs Sobriété days (peak pricing)
      let zenFlexEcoHcKwh = 0, zenFlexEcoHpKwh = 0
      let zenFlexSobrietyHcKwh = 0, zenFlexSobrietyHpKwh = 0

      if ((offer.offer_type === 'BASE' || offer.offer_type === 'BASE_WEEKEND') && offer.base_price) {
        // BASE calculation with weekend pricing support
        if (offer.base_price_weekend) {
          // Separate weekday and weekend consumption
          allConsumptionFinal.forEach((item) => {
            const kwh = item.value / 1000
            if (isWeekend(item.date)) {
              baseWeekendKwh += kwh
            } else {
              baseWeekdayKwh += kwh
            }
          })
          energyCost = (baseWeekdayKwh * offer.base_price) + (baseWeekendKwh * offer.base_price_weekend)
          logger.log(`BASE with weekend pricing for ${offer.name}:`, {
            baseWeekdayKwh: baseWeekdayKwh.toFixed(2),
            baseWeekendKwh: baseWeekendKwh.toFixed(2),
            weekdayPrice: offer.base_price,
            weekendPrice: offer.base_price_weekend,
            energyCost: energyCost.toFixed(2)
          })
        } else {
          // Standard BASE pricing
          energyCost = totalKwh * offer.base_price
        }
      } else if (offer.offer_type === 'SEASONAL' && offer.hc_price_winter && offer.hp_price_winter) {
        // SEASONAL calculation (Enercoop Flexi WATT 2 saisons)
        logger.log(`[SIMULATOR] SEASONAL calculation for ${offer.name}`)
        logger.log(`[SIMULATOR] Seasonal prices:`, {
          hc_price_winter: offer.hc_price_winter,
          hp_price_winter: offer.hp_price_winter,
          hc_price_summer: offer.hc_price_summer,
          hp_price_summer: offer.hp_price_summer,
          peak_day_price: offer.peak_day_price
        })

        // Reset seasonal variables
        hcWinterKwh = 0
        hpWinterKwh = 0
        hcSummerKwh = 0
        hpSummerKwh = 0
        peakDayKwh = 0

        // Check if this offer has peak day pricing (Flexi WATT 2 saisons Pointe)
        const hasPeakDayPricing = offer.peak_day_price !== null && offer.peak_day_price !== undefined && offer.peak_day_price > 0

        // Check if this is an Enercoop offer with special offpeak rules
        const isEnerocoopSpecialOffer = offer.name.includes('Flexi WATT') &&
          (offer.name.includes('nuit & weekend') || offer.name.includes('2 saisons') || offer.name.includes('Pointe'))

        allConsumptionFinal.forEach((item) => {
          const hour = item.hour || 0
          const kwh = item.value / 1000
          const itemIsWinter = isWinterSeason(item.date)
          const tempoColor = tempoColorMap.get(item.dateOnly)
          const isRedDay = tempoColor === 'RED'
          const itemIsWeekend = isWeekend(item.date)

          // For offers with peak day pricing, use RED TEMPO days as approximation for peak days
          if (hasPeakDayPricing && isRedDay) {
            // On peak days (jours de pointe), use peak day pricing
            peakDayKwh += kwh
          } else {
            // Normal seasonal pricing
            let isOffpeak: boolean

            // Use Enercoop-specific offpeak logic if applicable
            if (isEnerocoopSpecialOffer) {
              isOffpeak = getEnerocoopOffpeakHours(offer.name, hour, itemIsWeekend, itemIsWinter)
            } else {
              // Use standard PDL offpeak configuration
              isOffpeak = isOffpeakHour(hour, pdl?.offpeak_hours)
            }

            if (isOffpeak) {
              // Heures Creuses
              if (itemIsWinter) {
                hcWinterKwh += kwh
              } else {
                hcSummerKwh += kwh
              }
            } else {
              // Heures Pleines
              if (itemIsWinter) {
                hpWinterKwh += kwh
              } else {
                hpSummerKwh += kwh
              }
            }
          }
        })

        const winterCost = (hcWinterKwh * offer.hc_price_winter) + (hpWinterKwh * offer.hp_price_winter)
        const summerCost = (hcSummerKwh * (offer.hc_price_summer || 0)) + (hpSummerKwh * (offer.hp_price_summer || 0))
        const peakDayCost = hasPeakDayPricing ? (peakDayKwh * offer.peak_day_price!) : 0
        energyCost = winterCost + summerCost + peakDayCost

        logger.log(`[SIMULATOR] SEASONAL result for ${offer.name}:`, {
          winter: { hcKwh: hcWinterKwh.toFixed(2), hpKwh: hpWinterKwh.toFixed(2), cost: winterCost.toFixed(2) },
          summer: { hcKwh: hcSummerKwh.toFixed(2), hpKwh: hpSummerKwh.toFixed(2), cost: summerCost.toFixed(2) },
          peakDay: hasPeakDayPricing ? { kwh: peakDayKwh.toFixed(2), cost: peakDayCost.toFixed(2) } : null,
          totalEnergyCost: energyCost.toFixed(2)
        })
      } else if ((offer.offer_type === 'HC_HP' || offer.offer_type === 'WEEKEND' || offer.offer_type === 'HC_NUIT_WEEKEND' || offer.offer_type === 'HC_WEEKEND') && offer.hc_price && offer.hp_price) {
        // HC/HP calculation using PDL offpeak hours configuration
        logger.log(`[SIMULATOR] ${offer.offer_type} calculation for ${offer.name}`)

        let hcCount = 0
        let hpCount = 0
        const hourSamples = new Set<number>()
        const hasWeekendPricing = !!(offer.hc_price_weekend || offer.hp_price_weekend)

        // Check if this is a special HC type
        // Note: 'WEEKEND' (Enercoop) has same behavior as 'HC_NUIT_WEEKEND': 23h-6h weekday + all weekend
        const isHcNuitWeekend = offer.offer_type === 'HC_NUIT_WEEKEND' || offer.offer_type === 'WEEKEND'
        const isHcWeekend = offer.offer_type === 'HC_WEEKEND'

        allConsumptionFinal.forEach((item, index) => {
          const hour = item.hour || 0
          const kwh = item.value / 1000
          const itemIsWeekend = isWeekend(item.date)

          // Collect hour samples for first 10 items
          if (index < 10) {
            hourSamples.add(hour)
          }

          let isOffpeak: boolean

          // Handle special HC types
          if (isHcNuitWeekend) {
            // HC Nuit & Weekend: 23h-6h en semaine + tout le weekend
            if (itemIsWeekend) {
              hcWeekendKwh += kwh  // All weekend is HC
            } else {
              // Weekday follows 23h-6h rule
              if (hour >= 23 || hour < 6) {
                hcKwh += kwh
              } else {
                hpKwh += kwh
              }
            }
          } else if (isHcWeekend) {
            // HC Weekend: tout le weekend + heures PDL en semaine
            if (itemIsWeekend) {
              hcWeekendKwh += kwh  // All weekend is HC
            } else {
              // Weekday follows PDL config
              isOffpeak = isOffpeakHour(hour, pdl?.offpeak_hours)
              if (isOffpeak) {
                hcKwh += kwh
              } else {
                hpKwh += kwh
              }
            }
          } else {
            // Standard HC/HP
            isOffpeak = isOffpeakHour(hour, pdl?.offpeak_hours)

            if (isOffpeak) {
              if (hasWeekendPricing && itemIsWeekend) {
                hcWeekendKwh += kwh
              } else {
                hcKwh += kwh
              }
              hcCount++
            } else {
              if (hasWeekendPricing && itemIsWeekend) {
                hpWeekendKwh += kwh
              } else {
                hpKwh += kwh
              }
              hpCount++
            }
          }
        })

        // Calculate energy cost with weekend pricing if available
        const weekdayCost = (hcKwh * offer.hc_price) + (hpKwh * offer.hp_price)
        let weekendCost = 0

        // For HC_NUIT_WEEKEND and WEEKEND offers, weekend kWh are stored in hcWeekendKwh
        // and should be billed at HC price (since all weekend is considered off-peak)
        if (hasWeekendPricing) {
          weekendCost = (hcWeekendKwh * (offer.hc_price_weekend || offer.hc_price)) +
                        (hpWeekendKwh * (offer.hp_price_weekend || offer.hp_price))
        } else if (isHcNuitWeekend || isHcWeekend) {
          // For HC_NUIT_WEEKEND/WEEKEND/HC_WEEKEND without specific weekend pricing,
          // bill weekend HC kWh at the regular HC price
          weekendCost = hcWeekendKwh * offer.hc_price
        }

        energyCost = weekdayCost + weekendCost

        logger.log(`HC/HP result for ${offer.name}:`, {
          weekday: {
            hcKwh: hcKwh.toFixed(2),
            hpKwh: hpKwh.toFixed(2),
            cost: weekdayCost.toFixed(2)
          },
          ...((hasWeekendPricing || isHcNuitWeekend || isHcWeekend) && {
            weekend: {
              hcKwh: hcWeekendKwh.toFixed(2),
              hpKwh: hpWeekendKwh.toFixed(2),
              cost: weekendCost.toFixed(2)
            }
          }),
          totalEnergyCost: energyCost.toFixed(2),
          hcCount,
          hpCount,
          firstHoursSample: Array.from(hourSamples).sort((a, b) => a - b)
        })
      } else if (offer.offer_type === 'TEMPO') {
        // TEMPO calculation with real colors from RTE
        const colorStats = { BLUE: 0, WHITE: 0, RED: 0, UNKNOWN: 0 }

        allConsumptionFinal.forEach((item, index) => {
          const hour = item.hour || 0
          const kwh = item.value / 1000
          const color = tempoColorMap.get(item.dateOnly)

          // Debug first 5 items
          if (index < 5) {
            logger.log(`[TEMPO] Item ${index}: dateOnly="${item.dateOnly}", color="${color}"`)
          }

          // Determine if HC or HP (22:00-06:00 = HC)
          const isHC = hour >= 22 || hour < 6

          if (color === 'BLUE') {
            colorStats.BLUE++
            if (isHC) blueHcKwh += kwh
            else blueHpKwh += kwh
          } else if (color === 'WHITE') {
            colorStats.WHITE++
            if (isHC) whiteHcKwh += kwh
            else whiteHpKwh += kwh
          } else if (color === 'RED') {
            colorStats.RED++
            if (isHC) redHcKwh += kwh
            else redHpKwh += kwh
          } else {
            colorStats.UNKNOWN++
            // Fallback: if color not found, distribute evenly
            // (should not happen if TEMPO data is complete)
            if (isHC) blueHcKwh += kwh / 3
            else blueHpKwh += kwh / 3
          }
        })

        logger.log(`[TEMPO] Color distribution:`, colorStats)

        energyCost = (
          (blueHcKwh * (offer.tempo_blue_hc || 0)) +
          (blueHpKwh * (offer.tempo_blue_hp || 0)) +
          (whiteHcKwh * (offer.tempo_white_hc || 0)) +
          (whiteHpKwh * (offer.tempo_white_hp || 0)) +
          (redHcKwh * (offer.tempo_red_hc || 0)) +
          (redHpKwh * (offer.tempo_red_hp || 0))
        )

        logger.log(`TEMPO calculation for ${offer.name}:`, {
          blueHcKwh: blueHcKwh.toFixed(2),
          blueHpKwh: blueHpKwh.toFixed(2),
          whiteHcKwh: whiteHcKwh.toFixed(2),
          whiteHpKwh: whiteHpKwh.toFixed(2),
          redHcKwh: redHcKwh.toFixed(2),
          redHpKwh: redHpKwh.toFixed(2),
          energyCost: energyCost.toFixed(2)
        })
      } else if (offer.offer_type === 'ZEN_FLEX' && offer.hc_price_winter && offer.hp_price_winter) {
        // ZEN_FLEX calculation: EDF Zen Week-End - Option Flex
        // - 345 "Eco" days: normal HC/HP pricing (hc_price_winter/hp_price_winter)
        // - 20 "Sobriété" days: HP price is much higher (hp_price_summer used for this)
        // - Weekends are ALWAYS Eco days
        // - Sobriété days are the 20 coldest weekdays (approximated using TEMPO RED days in January)
        logger.log(`[SIMULATOR] ZEN_FLEX calculation for ${offer.name}`)
        logger.log(`[SIMULATOR] ZEN_FLEX prices:`, {
          hc_price_eco: offer.hc_price_winter,
          hp_price_eco: offer.hp_price_winter,
          hc_price_sobriety: offer.hc_price_summer,
          hp_price_sobriety: offer.hp_price_summer,
        })

        // Identify the 20 coldest weekdays using TEMPO RED days (mostly in January)
        // First, collect all unique weekdays in the consumption data
        const allWeekdays = new Set<string>()
        allConsumptionFinal.forEach((item) => {
          if (!isWeekend(item.date)) {
            allWeekdays.add(item.dateOnly)
          }
        })

        // Get RED days that are weekdays, sorted by date (January first = coldest)
        const redWeekdays: string[] = []
        allConsumptionFinal.forEach((item) => {
          const color = tempoColorMap.get(item.dateOnly)
          if (color === 'RED' && !isWeekend(item.date) && !redWeekdays.includes(item.dateOnly)) {
            redWeekdays.push(item.dateOnly)
          }
        })

        // Sort by date to prioritize January (coldest month)
        redWeekdays.sort((a, b) => {
          const dateA = new Date(a)
          const dateB = new Date(b)
          // Prioritize by month (January = 0 = coldest)
          const monthA = dateA.getMonth()
          const monthB = dateB.getMonth()
          // Transform months so winter months come first: Jan=0, Feb=1, Dec=2, Nov=3, ...
          const winterOrder = (m: number) => m <= 2 ? m : (12 - m + 3)
          return winterOrder(monthA) - winterOrder(monthB)
        })

        // Select up to 20 Sobriété days
        const sobrietyDays = new Set(redWeekdays.slice(0, 20))

        logger.log(`[ZEN_FLEX] Found ${redWeekdays.length} RED weekdays, using ${sobrietyDays.size} as Sobriété days`)
        logger.log(`[ZEN_FLEX] Sobriété days:`, Array.from(sobrietyDays))

        allConsumptionFinal.forEach((item) => {
          const hour = item.hour || 0
          const kwh = item.value / 1000
          const itemIsWeekend = isWeekend(item.date)

          // Determine if HC or HP (22:00-06:00 = HC for Zen Flex)
          const isHC = hour >= 22 || hour < 6

          // Weekends are always Eco days
          if (itemIsWeekend) {
            if (isHC) {
              zenFlexEcoHcKwh += kwh
            } else {
              zenFlexEcoHpKwh += kwh
            }
          } else {
            // Weekday: check if Sobriété day
            if (sobrietyDays.has(item.dateOnly)) {
              // Sobriété day: higher prices
              if (isHC) {
                zenFlexSobrietyHcKwh += kwh
              } else {
                zenFlexSobrietyHpKwh += kwh
              }
            } else {
              // Eco day: normal prices
              if (isHC) {
                zenFlexEcoHcKwh += kwh
              } else {
                zenFlexEcoHpKwh += kwh
              }
            }
          }
        })

        // Calculate costs
        // Eco days use hc_price_winter/hp_price_winter
        // Sobriété days use hc_price_summer/hp_price_summer (which are the higher "sobriété" prices)
        const ecoCost = (zenFlexEcoHcKwh * offer.hc_price_winter) + (zenFlexEcoHpKwh * offer.hp_price_winter)
        const sobrietyCost = (zenFlexSobrietyHcKwh * (offer.hc_price_summer || offer.hc_price_winter)) +
                            (zenFlexSobrietyHpKwh * (offer.hp_price_summer || offer.hp_price_winter))
        energyCost = ecoCost + sobrietyCost

        logger.log(`[ZEN_FLEX] Result for ${offer.name}:`, {
          eco: { hcKwh: zenFlexEcoHcKwh.toFixed(2), hpKwh: zenFlexEcoHpKwh.toFixed(2), cost: ecoCost.toFixed(2) },
          sobriety: { hcKwh: zenFlexSobrietyHcKwh.toFixed(2), hpKwh: zenFlexSobrietyHpKwh.toFixed(2), cost: sobrietyCost.toFixed(2) },
          sobrietyDaysCount: sobrietyDays.size,
          totalEnergyCost: energyCost.toFixed(2)
        })
      }

      const totalCost = subscriptionCostYear + energyCost

      // Prepare detailed breakdown by offer type
      let breakdown: any = {}
      if (offer.offer_type === 'SEASONAL') {
        breakdown = { hcWinterKwh, hpWinterKwh, hcSummerKwh, hpSummerKwh, peakDayKwh }
      } else if (offer.offer_type === 'HC_HP' || offer.offer_type === 'WEEKEND' || offer.offer_type === 'HC_NUIT_WEEKEND' || offer.offer_type === 'HC_WEEKEND') {
        breakdown = { hcKwh, hpKwh, hcWeekendKwh, hpWeekendKwh }
      } else if (offer.offer_type === 'TEMPO') {
        breakdown = { blueHcKwh, blueHpKwh, whiteHcKwh, whiteHpKwh, redHcKwh, redHpKwh }
      } else if (offer.offer_type === 'BASE' || offer.offer_type === 'BASE_WEEKEND') {
        breakdown = { baseWeekdayKwh, baseWeekendKwh }
      } else if (offer.offer_type === 'ZEN_FLEX') {
        breakdown = { zenFlexEcoHcKwh, zenFlexEcoHpKwh, zenFlexSobrietyHcKwh, zenFlexSobrietyHpKwh }
      }

      // Remove power (kVA) from offer name for cleaner display
      const offerNameWithoutPower = offer.name.replace(/\s*\d+\s*kVA\s*/i, '').trim()

      return {
        offerId: offer.id,
        offerName: offerNameWithoutPower,
        offerType: offer.offer_type,
        providerName: provider?.name || 'Inconnu',
        subscriptionCost: subscriptionCostYear,
        energyCost,
        totalCost,
        totalKwh,
        breakdown,
        validFrom: offer.valid_from,
        offer, // Include full offer object for detailed view
      }
    })

    // Sort by total cost (cheapest first)
    results.sort((a, b) => a.totalCost - b.totalCost)

    return results
  }

  // Auto-launch simulation if cache data exists
  // IMPORTANT: This hook must be before any early returns to respect React's rules of hooks
  useEffect(() => {
    // Don't auto-launch if already launched, simulating, or have results
    if (!selectedPdl || isSimulating || simulationResult || hasAutoLaunched) return

    // Don't auto-launch while data is still loading (including cache hydration)
    if (offersLoading || providersLoading || isConsumptionCacheLoading) return

    // Don't auto-launch if PDL data, offers, or providers are not loaded yet
    if (!pdlsData || offersData.length === 0 || providersData.length === 0) return

    // Use cachedConsumptionData from state (populated via subscription, handles IndexedDB hydration)
    if (!cachedConsumptionData?.data?.meter_reading?.interval_reading?.length) return

    const readings = cachedConsumptionData.data.meter_reading.interval_reading
    const totalPoints = readings.length

    // Check if we have enough data (at least 30 days worth = ~1440 points at 30min intervals)
    const minRequiredPoints = 30 * 48 // 30 days * 48 half-hours

    if (totalPoints >= minRequiredPoints) {
      setHasAutoLaunched(true)
      // Show loading overlay while preparing simulation
      setIsInitialLoadingFromCache(true)

      // Use setTimeout to avoid calling during render
      setTimeout(() => {
        handleSimulation()
      }, 100)
    }
  }, [selectedPdl, isSimulating, simulationResult, hasAutoLaunched, isDemo, pdlsData, offersData, providersData, offersLoading, providersLoading, isConsumptionCacheLoading, cachedConsumptionData, handleSimulation])

  // Filter and sort simulation results
  // IMPORTANT: This hook must be before any early returns to respect React's rules of hooks
  const filteredAndSortedResults = useMemo(() => {
    if (!simulationResult || !Array.isArray(simulationResult)) return []

    let filtered = [...simulationResult]

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter((result) => result.offerType === filterType)
    }

    // Filter by provider
    if (filterProvider !== 'all') {
      filtered = filtered.filter((result) => result.providerName === filterProvider)
    }

    // Filter by recency (tariffs < 6 months old)
    if (showOnlyRecent) {
      filtered = filtered.filter((result) => !isOldTariff(result.validFrom))
    }

    // Sort by selected criteria
    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'subscription':
          comparison = a.subscriptionCost - b.subscriptionCost
          break
        case 'energy':
          comparison = a.energyCost - b.energyCost
          break
        case 'total':
        default:
          comparison = a.totalCost - b.totalCost
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [simulationResult, filterType, filterProvider, showOnlyRecent, sortBy, sortOrder])

  // Check if viewing a shared PDL (impersonation mode)
  const isSharedPdl = !!impersonation

  // Get reference offer for shared PDLs (admin-defined temporary offer)
  // Note: We subscribe to referenceOffers directly (not via getReferenceOffer function)
  // to ensure the memo re-evaluates when the store state changes
  const referenceOffer = useMemo(() => {
    if (!selectedPdl) return null
    return referenceOffers[selectedPdl] || null
  }, [selectedPdl, referenceOffers])

  // Find the current offer (the one selected by the user for this PDL)
  // For shared PDLs: use reference offer if defined, otherwise fall back to owner's selected offer
  // Note: We search in ALL simulation results (not just filtered) so the reference offer
  // is found even when table filters (Type, Provider) hide it
  const currentOfferResult = useMemo(() => {
    if (!simulationResult || !Array.isArray(simulationResult) || !simulationResult.length) return null

    // For shared PDLs, prioritize the reference offer set by admin
    // Search in ALL results, not just filtered ones
    if (isSharedPdl && referenceOffer) {
      return simulationResult.find((r) => r.offerId === referenceOffer.offerId) || null
    }

    // Get the current PDL to find its selected offer
    const currentPdl = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
    if (!currentPdl?.selected_offer_id) return null

    // Find the result matching the selected offer ID (search in all results)
    return simulationResult.find((r) => r.offerId === currentPdl.selected_offer_id) || null
  }, [simulationResult, pdlsData, selectedPdl, isSharedPdl, referenceOffer])

  // Get unique providers and types for filter options
  // IMPORTANT: These hooks must be before any early returns to respect React's rules of hooks
  const availableProviders = useMemo(() => {
    if (!simulationResult || !Array.isArray(simulationResult)) return []
    const providers = new Set(simulationResult.map((r) => r.providerName))
    return Array.from(providers).sort()
  }, [simulationResult])

  const availableTypes = useMemo(() => {
    if (!simulationResult || !Array.isArray(simulationResult)) return []
    const types = new Set(simulationResult.map((r) => r.offerType))
    return Array.from(types).sort()
  }, [simulationResult])

  // Get the subscribed power for the selected PDL (used to filter reference offers)
  const selectedPdlPower = useMemo(() => {
    if (!selectedPdl || !Array.isArray(pdlsData)) return null
    const pdl = pdlsData.find((p) => p.usage_point_id === selectedPdl)
    return pdl?.subscribed_power || null
  }, [selectedPdl, pdlsData])

  // Offers filtered by PDL power (only offers matching the PDL's subscribed power)
  const offersForPdlPower = useMemo(() => {
    if (!offersData.length || !selectedPdlPower) return offersData
    return offersData.filter((o) => o.power_kva === selectedPdlPower)
  }, [offersData, selectedPdlPower])

  // Available providers and types for reference offer selector (from offers matching PDL power)
  const refOfferProviders = useMemo(() => {
    if (!offersForPdlPower.length || !providersData.length) return []
    const providerIds = new Set(offersForPdlPower.map((o) => o.provider_id))
    return providersData
      .filter((p) => providerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [offersForPdlPower, providersData])

  const refOfferTypes = useMemo(() => {
    if (!offersForPdlPower.length) return []
    const types = new Set(offersForPdlPower.map((o) => o.offer_type))
    return Array.from(types).sort()
  }, [offersForPdlPower])

  // Filtered offers for reference offer selector
  // Only shows offers matching the PDL's subscribed power
  const filteredRefOffers = useMemo(() => {
    let filtered = offersForPdlPower
    if (refOfferFilterProvider !== 'all') {
      filtered = filtered.filter((o) => o.provider_id === refOfferFilterProvider)
    }
    if (refOfferFilterType !== 'all') {
      filtered = filtered.filter((o) => o.offer_type === refOfferFilterType)
    }

    // If there's a selected reference offer that's not in the filtered list, add it at the top
    if (referenceOffer) {
      const isInFilteredList = filtered.some((o) => o.id === referenceOffer.offerId)
      if (!isInFilteredList) {
        const selectedOffer = offersForPdlPower.find((o) => o.id === referenceOffer.offerId)
        if (selectedOffer) {
          filtered = [selectedOffer, ...filtered]
        }
      }
    }

    return filtered
  }, [offersForPdlPower, refOfferFilterProvider, refOfferFilterType, referenceOffer])

  // ==================== EARLY RETURNS (after all hooks) ====================
  // These must come AFTER all hooks to respect React's rules of hooks

  if (pdlsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={32} />
      </div>
    )
  }

  if (pdlsError) {
    return (
      <div className="w-full">
        <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-red-600 dark:text-red-400" size={24} />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-300">Erreur</h3>
              <p className="text-red-700 dark:text-red-400">
                Impossible de charger vos points de livraison. Veuillez réessayer.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!pdlsData || pdlsData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            Aucun point de livraison disponible.{' '}
            <a href="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
              Veuillez en ajouter un depuis votre tableau de bord.
            </a>
          </p>
        </div>
      </div>
    )
  }

  // ==================== HELPER FUNCTIONS (after early returns) ====================

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BASE':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      case 'BASE_WEEKEND':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      case 'HC_HP':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
      case 'WEEKEND':
      case 'HC_NUIT_WEEKEND':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300'
      case 'HC_WEEKEND':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
      case 'SEASONAL':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300'
      case 'ZEN_FLEX':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300'
      case 'TEMPO':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
      case 'EJP':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'BASE':
        return 'Base'
      case 'BASE_WEEKEND':
        return 'Base Week-end'
      case 'HC_HP':
        return 'HC/HP'
      case 'WEEKEND':
      case 'HC_NUIT_WEEKEND':
        return 'HC Nuit & Week-end'
      case 'HC_WEEKEND':
        return 'HC Week-end'
      case 'SEASONAL':
        return 'Saisonnier'
      case 'ZEN_FLEX':
        return 'Zen Flex'
      case 'TEMPO':
        return 'Tempo'
      case 'EJP':
        return 'EJP'
      default:
        return type
    }
  }

  const toggleRowExpansion = (offerId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(offerId)) {
        newSet.delete(offerId)
      } else {
        newSet.add(offerId)
      }
      return newSet
    })
  }

  const toggleCalculationsExpansion = (offerId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row collapse
    setExpandedCalculations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(offerId)) {
        newSet.delete(offerId)
      } else {
        newSet.add(offerId)
      }
      return newSet
    })
  }

  const handleSort = (column: 'total' | 'subscription' | 'energy') => {
    if (sortBy === column) {
      // Toggle sort order if clicking the same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      // Set new column and default to ascending
      setSortBy(column)
      setSortOrder('asc')
    }
  }

  const getSortIcon = (column: 'total' | 'subscription' | 'energy') => {
    if (sortBy !== column) {
      return <ArrowUpDown size={14} className="opacity-40" />
    }
    return sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
  }

  // Clear cache function (admin only) - Unused for now as cache clearing is in the sidebar
  /*
  const confirmClearCache = async () => {
    if (!selectedPdl) {
      toast.error('Aucun PDL sélectionné')
      return
    }

    setIsClearingCache(true)

    try {
      // 1. Clear React Query cache
      queryClient.removeQueries({ queryKey: ['consumptionDetail'] })
      queryClient.removeQueries({ queryKey: ['consumption'] })
      queryClient.removeQueries({ queryKey: ['maxPower'] })

      // 2. Clear localStorage
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && (
          key.includes('consumptionDetail') ||
          key.includes('consumption') ||
          key.includes('maxPower') ||
          key.includes('REACT_QUERY_OFFLINE_CACHE')
        )) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))

      // 3. Clear IndexedDB
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name?.includes('react-query') || db.name?.includes('myelectricaldata')) {
          indexedDB.deleteDatabase(db.name)
        }
      }

      // 4. Clear Redis cache via API
      const response = await adminApi.clearAllConsumptionCache()
      if (!response.success) {
        throw new Error(response.error || 'Échec du vidage du cache Redis')
      }

      toast.success('Cache vidé avec succès (Navigateur + Redis)')

      // Reset simulation state
      setSimulationResult(null)
      setSimulationError(null)
      setFetchProgress({current: 0, total: 0, phase: ''})

    } catch (error) {
      console.error('Error clearing cache:', error)
      toast.error('Erreur lors du vidage du cache')
    } finally {
      setIsClearingCache(false)
    }
  }
  */

  const exportToPDF = async () => {
    if (!simulationResult || simulationResult.length === 0) return

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    let currentPage = 1

    // Get PDL object from selectedPdl string
    const currentPdl = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined

    // Helper function to add footer
    const addFooter = () => {
      pdf.setFontSize(8)
      pdf.setTextColor(107, 114, 128)
      const footerY = pageHeight - 10
      pdf.text('Généré par myelectricaldata.fr', margin, footerY)
      pdf.text(`Page ${currentPage}`, pageWidth - margin - 15, footerY)
    }

    // ===== PAGE 1: HEADER AND SUMMARY =====
    // Header
    pdf.setFontSize(18)
    pdf.setTextColor(37, 99, 235)
    pdf.text('Comparaison des offres d\'énergie', margin, 20)

    // PDL Info
    pdf.setFontSize(10)
    pdf.setTextColor(75, 85, 99)
    let infoY = 30
    pdf.text(`PDL: ${currentPdl?.usage_point_id || selectedPdl || 'N/A'}`, margin, infoY)
    infoY += 5
    if (currentPdl?.name) {
      pdf.text(`Nom: ${currentPdl.name}`, margin, infoY)
      infoY += 5
    }
    if (currentPdl?.subscribed_power) {
      pdf.text(`Puissance souscrite: ${currentPdl.subscribed_power} kVA`, margin, infoY)
      infoY += 5
    }
    pdf.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')}`, margin, infoY)
    infoY += 10

    // Summary Box
    pdf.setFontSize(11)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Résumé de la simulation', margin, infoY)
    infoY += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)

    const totalKwh = simulationResult[0]?.totalKwh || 0
    const bestOffer = simulationResult[0]
    const worstOffer = simulationResult[simulationResult.length - 1]
    const savings = worstOffer.totalCost - bestOffer.totalCost

    pdf.text(`• Consommation totale analysée: ${totalKwh.toFixed(2)} kWh`, margin + 3, infoY)
    infoY += 5
    pdf.text(`• Nombre d'offres comparées: ${simulationResult.length}`, margin + 3, infoY)
    infoY += 5
    pdf.text(`• Meilleure offre: ${bestOffer.providerName} - ${bestOffer.offerName}`, margin + 3, infoY)
    infoY += 5
    pdf.text(`  Coût annuel: ${bestOffer.totalCost.toFixed(2)} €`, margin + 3, infoY)
    infoY += 5
    pdf.text(`• Économie potentielle: ${savings.toFixed(2)} € / an`, margin + 3, infoY)
    infoY += 5
    pdf.text(`  (entre la meilleure et la pire offre)`, margin + 3, infoY)
    infoY += 8

    // Current offer section (if user has a selected offer)
    if (currentOfferResult) {
      const currentOfferRank = simulationResult.findIndex((r: any) => r.offerId === currentOfferResult.offerId) + 1
      const savingsVsCurrent = currentOfferResult.totalCost - bestOffer.totalCost

      pdf.setFillColor(254, 243, 199) // Yellow background
      pdf.rect(margin, infoY - 2, pageWidth - 2 * margin, 22, 'F')
      pdf.setDrawColor(251, 191, 36) // Yellow border
      pdf.rect(margin, infoY - 2, pageWidth - 2 * margin, 22, 'S')

      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(146, 64, 14) // Amber-800
      pdf.text('>> Votre offre actuelle', margin + 3, infoY + 3)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text(`${currentOfferResult.providerName} - ${currentOfferResult.offerName}`, margin + 3, infoY + 8)
      pdf.text(`Cout: ${currentOfferResult.totalCost.toFixed(2)} EUR / an  |  Rang: ${currentOfferRank}/${simulationResult.length}`, margin + 3, infoY + 13)
      if (savingsVsCurrent > 0) {
        pdf.setTextColor(22, 163, 74) // Green
        pdf.text(`-> Economie possible: ${savingsVsCurrent.toFixed(2)} EUR / an en passant a la meilleure offre`, margin + 3, infoY + 18)
      } else {
        pdf.setTextColor(22, 163, 74) // Green
        pdf.text(`Vous avez deja la meilleure offre !`, margin + 3, infoY + 18)
      }
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(9)
      infoY += 26
    } else {
      infoY += 2
    }

    // All offers table (compact)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`Classement des ${simulationResult.length} offres`, margin, infoY)
    infoY += 6

    // Table headers
    pdf.setFontSize(7)
    pdf.text('Rang', margin, infoY)
    pdf.text('Fournisseur', margin + 12, infoY)
    pdf.text('Offre', margin + 40, infoY)
    pdf.text('Type', margin + 85, infoY)
    pdf.text('Abo/an', margin + 105, infoY)
    pdf.text('Énergie/an', margin + 122, infoY)
    pdf.text('Total/an', margin + 145, infoY)
    pdf.text(currentOfferResult ? 'Écart (vs actuelle)' : 'Écart', margin + 165, infoY)
    infoY += 4

    // Table content
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)

    // Reference for calculating difference: current offer if exists, otherwise best offer
    const referenceOffer = currentOfferResult || simulationResult[0]

    simulationResult.forEach((result: any, index: number) => {
      if (infoY > pageHeight - 25) {
        addFooter()
        pdf.addPage()
        currentPage++
        infoY = 20
      }

      const isCurrentOffer = currentOfferResult?.offerId === result.offerId
      const isBestOffer = index === 0
      const costDifference = result.totalCost - referenceOffer.totalCost

      // Highlight current offer with yellow background
      if (isCurrentOffer) {
        pdf.setFillColor(254, 243, 199) // Yellow background
        pdf.rect(margin - 2, infoY - 2.5, pageWidth - 2 * margin + 4, 4, 'F')
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(146, 64, 14) // Amber-800
      } else if (isBestOffer) {
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(0, 0, 0)
      } else {
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(0, 0, 0)
      }

      const rankLabel = isBestOffer ? `${index + 1} *` : isCurrentOffer ? `${index + 1} >>` : `${index + 1}`
      pdf.text(rankLabel, margin, infoY)
      pdf.text(result.providerName.substring(0, 14), margin + 12, infoY)
      pdf.text(result.offerName.substring(0, 24), margin + 40, infoY)
      pdf.text(getTypeLabel(result.offerType).substring(0, 8), margin + 85, infoY)
      pdf.text(`${result.subscriptionCost.toFixed(0)} €`, margin + 105, infoY)
      pdf.text(`${result.energyCost.toFixed(0)} €`, margin + 122, infoY)
      pdf.text(`${result.totalCost.toFixed(0)} €`, margin + 145, infoY)

      // Écart column with color
      if (isCurrentOffer) {
        pdf.text('Actuelle', margin + 165, infoY)
      } else if (costDifference === 0) {
        pdf.setTextColor(22, 163, 74) // Green
        pdf.text('Meilleur', margin + 165, infoY)
      } else if (costDifference < 0) {
        pdf.setTextColor(22, 163, 74) // Green for savings
        pdf.text(`${costDifference.toFixed(0)} €`, margin + 165, infoY)
      } else {
        pdf.setTextColor(239, 68, 68) // Red for more expensive
        pdf.text(`+${costDifference.toFixed(0)} €`, margin + 165, infoY)
      }

      // Reset styles
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(0, 0, 0)

      infoY += 4
    })

    addFooter()

    // ===== DETAILED BREAKDOWN FOR ALL OFFERS =====
    simulationResult.forEach((result: any, index: number) => {
      pdf.addPage()
      currentPage++
      let detailY = 20

      const isCurrentOffer = currentOfferResult?.offerId === result.offerId

      // Current offer banner
      if (isCurrentOffer) {
        pdf.setFillColor(254, 243, 199) // Yellow background
        pdf.rect(margin, detailY - 5, pageWidth - 2 * margin, 10, 'F')
        pdf.setDrawColor(251, 191, 36) // Yellow border
        pdf.rect(margin, detailY - 5, pageWidth - 2 * margin, 10, 'S')
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(146, 64, 14) // Amber-800
        pdf.text('>> VOTRE OFFRE ACTUELLE', margin + 3, detailY + 1)
        pdf.setTextColor(0, 0, 0)
        detailY += 12
      }

      // Offer title
      pdf.setFontSize(14)
      pdf.setTextColor(37, 99, 235)
      pdf.text(`${index + 1}. ${result.providerName}`, margin, detailY)
      detailY += 7
      pdf.setFontSize(11)
      pdf.setTextColor(0, 0, 0)
      pdf.text(result.offerName, margin, detailY)
      detailY += 10

      // Cost summary box
      pdf.setFillColor(isCurrentOffer ? 254 : 240, isCurrentOffer ? 243 : 240, isCurrentOffer ? 199 : 240)
      pdf.rect(margin, detailY - 3, pageWidth - 2 * margin, 25, 'F')

      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Coût total annuel', margin + 3, detailY + 3)
      pdf.setFontSize(16)
      pdf.setTextColor(37, 99, 235)
      pdf.text(`${result.totalCost.toFixed(2)} €`, margin + 3, detailY + 10)

      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Abonnement: ${result.subscriptionCost.toFixed(2)} € / an`, margin + 3, detailY + 16)
      pdf.text(`Énergie: ${result.energyCost.toFixed(2)} € / an`, margin + 3, detailY + 20)

      if (index > 0) {
        const firstResult = simulationResult[0]
        const diff = result.totalCost - firstResult.totalCost
        const pct = ((diff / firstResult.totalCost) * 100).toFixed(1)
        pdf.text(`Écart vs. meilleure: +${diff.toFixed(2)} € (+${pct}%)`, margin + 90, detailY + 16)
      }

      detailY += 30

      // Offer details
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Détails de l\'offre', margin, detailY)
      detailY += 6

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Type: ${getTypeLabel(result.offerType)}`, margin + 3, detailY)
      detailY += 5

      if (result.offer?.power_kva) {
        pdf.text(`Puissance: ${result.offer.power_kva} kVA`, margin + 3, detailY)
        detailY += 5
      }

      pdf.text(`Abonnement: ${formatPrice(result.offer?.subscription_price, 2)} € / mois`, margin + 3, detailY)
      detailY += 5

      if (result.offer?.valid_from) {
        pdf.text(`Tarif valable depuis: ${new Date(result.offer.valid_from).toLocaleDateString('fr-FR')}`, margin + 3, detailY)
        detailY += 5
      }

      detailY += 3

      // Pricing details based on offer type
      pdf.setFont('helvetica', 'bold')
      pdf.text('Grille tarifaire', margin, detailY)
      detailY += 6
      pdf.setFont('helvetica', 'normal')

      if (result.offerType === 'BASE' || result.offerType === 'BASE_WEEKEND') {
        if (result.offer?.base_price_weekend) {
          pdf.text(`Prix Base (semaine): ${formatPrice(result.offer.base_price, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
          pdf.text(`Prix Base (week-end): ${formatPrice(result.offer.base_price_weekend, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        } else {
          pdf.text(`Prix Base: ${formatPrice(result.offer?.base_price, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') {
        pdf.text(`Prix Heures Creuses: ${formatPrice(result.offer?.hc_price, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`Prix Heures Pleines: ${formatPrice(result.offer?.hp_price, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        if (result.offer?.hc_price_weekend) {
          pdf.text(`Prix HC Week-end: ${formatPrice(result.offer.hc_price_weekend, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
        if (result.offer?.hp_price_weekend) {
          pdf.text(`Prix HP Week-end: ${formatPrice(result.offer.hp_price_weekend, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'SEASONAL') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Hiver (nov-mars):', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${formatPrice(result.offer?.hc_price_winter, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${formatPrice(result.offer?.hp_price_winter, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Été (avr-oct):', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${formatPrice(result.offer?.hc_price_summer, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${formatPrice(result.offer?.hp_price_summer, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        if (result.offer?.peak_day_price) {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours de pointe:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  ${formatPrice(result.offer.peak_day_price, 5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'TEMPO') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Bleus:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${formatPrice(result.offer?.tempo_blue_hc, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${formatPrice(result.offer?.tempo_blue_hp, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Blancs:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${formatPrice(result.offer?.tempo_white_hc, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${formatPrice(result.offer?.tempo_white_hp, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Rouges:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${formatPrice(result.offer?.tempo_red_hc, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${formatPrice(result.offer?.tempo_red_hp, 5)} € / kWh`, margin + 3, detailY)
        detailY += 5
      }

      detailY += 3

      // Consumption breakdown
      if (result.breakdown) {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Répartition de votre consommation', margin, detailY)
        detailY += 6
        pdf.setFont('helvetica', 'normal')

        if (result.offerType === 'BASE' || result.offerType === 'BASE_WEEKEND') {
          if (result.breakdown.baseWeekendKwh > 0) {
            pdf.text(`Semaine: ${result.breakdown.baseWeekdayKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.base_price, 5)} € = ${calcPrice(result.breakdown.baseWeekdayKwh, result.offer.base_price)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`Week-end: ${result.breakdown.baseWeekendKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.base_price_weekend, 5)} € = ${calcPrice(result.breakdown.baseWeekendKwh, result.offer.base_price_weekend)} €`, margin + 3, detailY)
            detailY += 5
          } else {
            pdf.text(`Total: ${result.totalKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.base_price, 5)} € = ${result.energyCost.toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') {
          if (result.breakdown.hcWeekendKwh > 0) {
            pdf.setFont('helvetica', 'bold')
            pdf.text('Semaine:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            pdf.text(`  HC: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price, 5)} € = ${calcPrice(result.breakdown.hcKwh, result.offer.hc_price)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`  HP: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price, 5)} € = ${calcPrice(result.breakdown.hpKwh, result.offer.hp_price)} €`, margin + 3, detailY)
            detailY += 5
            pdf.setFont('helvetica', 'bold')
            pdf.text('Week-end:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            const weekendPrice = result.offer.hc_price_weekend || result.offer.hc_price
            pdf.text(`  ${result.breakdown.hcWeekendKwh?.toFixed(0)} kWh × ${formatPrice(weekendPrice, 5)} € = ${calcPrice(result.breakdown.hcWeekendKwh, weekendPrice)} €`, margin + 3, detailY)
            detailY += 5
          } else {
            pdf.text(`HC: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price, 5)} € = ${calcPrice(result.breakdown.hcKwh, result.offer.hc_price)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`HP: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price, 5)} € = ${calcPrice(result.breakdown.hpKwh, result.offer.hp_price)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'SEASONAL') {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Hiver:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.hcWinterKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_winter, 5)} € = ${calcPrice(result.breakdown.hcWinterKwh, result.offer.hc_price_winter)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.hpWinterKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_winter, 5)} € = ${calcPrice(result.breakdown.hpWinterKwh, result.offer.hp_price_winter)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Été:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.hcSummerKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_summer, 5)} € = ${calcPrice(result.breakdown.hcSummerKwh, result.offer.hc_price_summer)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.hpSummerKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_summer, 5)} € = ${calcPrice(result.breakdown.hpSummerKwh, result.offer.hp_price_summer)} €`, margin + 3, detailY)
          detailY += 5
          if (result.breakdown.peakDayKwh > 0) {
            pdf.setFont('helvetica', 'bold')
            pdf.text('Jours de pointe:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            pdf.text(`  ${result.breakdown.peakDayKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.peak_day_price, 5)} € = ${calcPrice(result.breakdown.peakDayKwh, result.offer.peak_day_price)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'TEMPO') {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Bleus:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.blueHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_blue_hc, 5)} € = ${calcPrice(result.breakdown.blueHcKwh, result.offer.tempo_blue_hc)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.blueHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_blue_hp, 5)} € = ${calcPrice(result.breakdown.blueHpKwh, result.offer.tempo_blue_hp)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Blancs:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.whiteHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_white_hc, 5)} € = ${calcPrice(result.breakdown.whiteHcKwh, result.offer.tempo_white_hc)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.whiteHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_white_hp, 5)} € = ${calcPrice(result.breakdown.whiteHpKwh, result.offer.tempo_white_hp)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Rouges:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.redHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_red_hc, 5)} € = ${calcPrice(result.breakdown.redHcKwh, result.offer.tempo_red_hc)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.redHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_red_hp, 5)} € = ${calcPrice(result.breakdown.redHpKwh, result.offer.tempo_red_hp)} €`, margin + 3, detailY)
          detailY += 5
        }
      }

      addFooter()
    })

    // Save PDF
    const fileName = `comparatif-offres-${currentPdl?.usage_point_id || 'export'}-${new Date().toISOString().split('T')[0]}.pdf`
    pdf.save(fileName)
  }

  // Export a single offer to PDF with detailed calculations
  const exportSingleOfferToPDF = async (result: any, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row collapse

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    let y = 20

    // Get PDL object from selectedPdl string
    const currentPdl = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined

    // Helper function to add footer
    const addFooter = (pageNum: number) => {
      pdf.setFontSize(8)
      pdf.setTextColor(107, 114, 128)
      const footerY = pageHeight - 10
      pdf.text('Généré par myelectricaldata.fr', margin, footerY)
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 15, footerY)
    }

    // Helper to check if we need a new page
    const checkNewPage = (neededSpace: number, currentPage: number): number => {
      if (y + neededSpace > pageHeight - 20) {
        addFooter(currentPage)
        pdf.addPage()
        y = 20
        return currentPage + 1
      }
      return currentPage
    }

    let currentPage = 1

    // ===== HEADER =====
    pdf.setFontSize(16)
    pdf.setTextColor(37, 99, 235)
    pdf.text('Détail de l\'offre', margin, y)
    y += 8

    pdf.setFontSize(12)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${result.providerName} - ${result.offerName}`, margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 10

    // ===== PDL INFO =====
    pdf.setFontSize(9)
    pdf.setTextColor(75, 85, 99)
    pdf.text(`PDL: ${currentPdl?.usage_point_id || selectedPdl || 'N/A'}`, margin, y)
    y += 4
    if (currentPdl?.subscribed_power) {
      pdf.text(`Puissance souscrite: ${currentPdl.subscribed_power} kVA`, margin, y)
      y += 4
    }
    pdf.text(`Periode analysee: ${simulationStartDate} - ${simulationEndDate}`, margin, y)
    y += 4
    pdf.text(`Date de génération: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, y)
    y += 8

    // ===== COST SUMMARY BOX =====
    pdf.setFillColor(240, 249, 244) // Light green background
    pdf.rect(margin, y - 2, pageWidth - 2 * margin, 28, 'F')
    pdf.setDrawColor(34, 197, 94)
    pdf.rect(margin, y - 2, pageWidth - 2 * margin, 28, 'S')

    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('COÛT TOTAL ANNUEL ESTIMÉ', margin + 5, y + 5)

    pdf.setFontSize(20)
    pdf.setTextColor(22, 163, 74) // Green
    pdf.text(`${result.totalCost.toFixed(2)} €`, margin + 5, y + 16)

    pdf.setFontSize(9)
    pdf.setTextColor(75, 85, 99)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Abonnement: ${result.subscriptionCost.toFixed(2)} €/an  |  Énergie: ${result.energyCost.toFixed(2)} €/an`, margin + 5, y + 23)
    y += 35

    // ===== SECTION: DÉTAIL DU CALCUL DE L'ABONNEMENT =====
    currentPage = checkNewPage(40, currentPage)

    pdf.setFontSize(11)
    pdf.setTextColor(37, 99, 235)
    pdf.setFont('helvetica', 'bold')
    pdf.text('1. CALCUL DE L\'ABONNEMENT', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 7

    pdf.setFontSize(9)
    pdf.setTextColor(0, 0, 0)
    const monthlySubscription = result.offer?.subscription_price || 0
    pdf.text(`Prix mensuel de l'abonnement: ${formatPrice(monthlySubscription, 2)} €/mois`, margin + 3, y)
    y += 5
    pdf.text(`Calcul: ${formatPrice(monthlySubscription, 2)} € × 12 mois = ${result.subscriptionCost.toFixed(2)} €/an`, margin + 3, y)
    y += 8

    // ===== SECTION: DÉTAIL DU CALCUL DE L'ÉNERGIE =====
    currentPage = checkNewPage(60, currentPage)

    pdf.setFontSize(11)
    pdf.setTextColor(37, 99, 235)
    pdf.setFont('helvetica', 'bold')
    pdf.text('2. CALCUL DU COÛT ÉNERGÉTIQUE', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 7

    pdf.setFontSize(9)
    pdf.setTextColor(75, 85, 99)
    pdf.text(`Consommation totale sur la période: ${result.totalKwh?.toFixed(2) || 0} kWh`, margin + 3, y)
    y += 6

    pdf.setTextColor(0, 0, 0)

    // Detailed breakdown based on offer type
    if (result.breakdown) {
      if (result.offerType === 'BASE' || result.offerType === 'BASE_WEEKEND') {
        if (result.offer?.base_price_weekend && result.breakdown.baseWeekendKwh > 0) {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Tarif Base avec différenciation Semaine/Week-end:', margin + 3, y)
          pdf.setFont('helvetica', 'normal')
          y += 6

          const weekdayCost = result.breakdown.baseWeekdayKwh * result.offer.base_price
          pdf.text(`  -> Semaine: ${result.breakdown.baseWeekdayKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.base_price, 5)} €/kWh = ${weekdayCost.toFixed(2)} €`, margin + 3, y)
          y += 5

          const weekendCost = result.breakdown.baseWeekendKwh * result.offer.base_price_weekend
          pdf.text(`  -> Week-end: ${result.breakdown.baseWeekendKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.base_price_weekend, 5)} €/kWh = ${weekendCost.toFixed(2)} €`, margin + 3, y)
          y += 5

          pdf.setFont('helvetica', 'bold')
          pdf.text(`  TOTAL ÉNERGIE: ${weekdayCost.toFixed(2)} € + ${weekendCost.toFixed(2)} € = ${result.energyCost.toFixed(2)} €`, margin + 3, y)
          pdf.setFont('helvetica', 'normal')
          y += 8
        } else {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Tarif Base unique:', margin + 3, y)
          pdf.setFont('helvetica', 'normal')
          y += 6

          pdf.text(`  -> ${result.totalKwh?.toFixed(0)} kWh × ${formatPrice(result.offer?.base_price, 5)} €/kWh = ${result.energyCost.toFixed(2)} €`, margin + 3, y)
          y += 8
        }
      } else if (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Tarif Heures Creuses / Heures Pleines:', margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 6

        if (result.breakdown.hcWeekendKwh > 0) {
          // With weekend differentiation
          pdf.text('  📅 SEMAINE:', margin + 3, y)
          y += 5

          const hcCost = result.breakdown.hcKwh * result.offer.hc_price
          pdf.text(`    -> Heures Creuses: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price, 5)} €/kWh = ${hcCost.toFixed(2)} €`, margin + 3, y)
          y += 5

          const hpCost = result.breakdown.hpKwh * result.offer.hp_price
          pdf.text(`    -> Heures Pleines: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price, 5)} €/kWh = ${hpCost.toFixed(2)} €`, margin + 3, y)
          y += 6

          pdf.text('  🌴 WEEK-END (tout en HC):', margin + 3, y)
          y += 5

          const weekendPrice = result.offer.hc_price_weekend || result.offer.hc_price
          const weekendCost = result.breakdown.hcWeekendKwh * weekendPrice
          pdf.text(`    -> ${result.breakdown.hcWeekendKwh?.toFixed(0)} kWh × ${formatPrice(weekendPrice, 5)} €/kWh = ${weekendCost.toFixed(2)} €`, margin + 3, y)
          y += 6

          pdf.setFont('helvetica', 'bold')
          pdf.text(`  TOTAL ÉNERGIE: ${hcCost.toFixed(2)} + ${hpCost.toFixed(2)} + ${weekendCost.toFixed(2)} = ${result.energyCost.toFixed(2)} €`, margin + 3, y)
          pdf.setFont('helvetica', 'normal')
          y += 8
        } else {
          const hcCost = result.breakdown.hcKwh * result.offer.hc_price
          pdf.text(`  -> Heures Creuses: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price, 5)} €/kWh = ${hcCost.toFixed(2)} €`, margin + 3, y)
          y += 5

          const hpCost = result.breakdown.hpKwh * result.offer.hp_price
          pdf.text(`  -> Heures Pleines: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price, 5)} €/kWh = ${hpCost.toFixed(2)} €`, margin + 3, y)
          y += 6

          pdf.setFont('helvetica', 'bold')
          pdf.text(`  TOTAL ÉNERGIE: ${hcCost.toFixed(2)} € + ${hpCost.toFixed(2)} € = ${result.energyCost.toFixed(2)} €`, margin + 3, y)
          pdf.setFont('helvetica', 'normal')
          y += 8
        }
      } else if (result.offerType === 'SEASONAL') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Tarif Saisonnier (Hiver/Été):', margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 6

        pdf.text('  ❄️ HIVER (novembre à mars):', margin + 3, y)
        y += 5

        const hcWinterCost = result.breakdown.hcWinterKwh * result.offer.hc_price_winter
        pdf.text(`    -> HC: ${result.breakdown.hcWinterKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_winter, 5)} €/kWh = ${hcWinterCost.toFixed(2)} €`, margin + 3, y)
        y += 5

        const hpWinterCost = result.breakdown.hpWinterKwh * result.offer.hp_price_winter
        pdf.text(`    -> HP: ${result.breakdown.hpWinterKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_winter, 5)} €/kWh = ${hpWinterCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.text('  ☀️ ÉTÉ (avril à octobre):', margin + 3, y)
        y += 5

        const hcSummerCost = result.breakdown.hcSummerKwh * result.offer.hc_price_summer
        pdf.text(`    -> HC: ${result.breakdown.hcSummerKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_summer, 5)} €/kWh = ${hcSummerCost.toFixed(2)} €`, margin + 3, y)
        y += 5

        const hpSummerCost = result.breakdown.hpSummerKwh * result.offer.hp_price_summer
        pdf.text(`    -> HP: ${result.breakdown.hpSummerKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_summer, 5)} €/kWh = ${hpSummerCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        let totalEnergy = hcWinterCost + hpWinterCost + hcSummerCost + hpSummerCost
        let peakCost = 0
        if (result.breakdown.peakDayKwh > 0 && result.offer.peak_day_price) {
          pdf.text('  ** JOURS DE POINTE:', margin + 3, y)
          y += 5
          peakCost = result.breakdown.peakDayKwh * result.offer.peak_day_price
          pdf.text(`    -> ${result.breakdown.peakDayKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.peak_day_price, 5)} €/kWh = ${peakCost.toFixed(2)} €`, margin + 3, y)
          y += 6
          totalEnergy += peakCost
        }

        pdf.setFont('helvetica', 'bold')
        pdf.text(`  TOTAL ÉNERGIE: ${result.energyCost.toFixed(2)} €`, margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 8
      } else if (result.offerType === 'TEMPO') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Tarif TEMPO (3 couleurs de jours):', margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 6

        currentPage = checkNewPage(50, currentPage)

        pdf.text('  🔵 JOURS BLEUS (~300 jours/an - les moins chers):', margin + 3, y)
        y += 5
        const blueHcCost = result.breakdown.blueHcKwh * result.offer.tempo_blue_hc
        pdf.text(`    -> HC: ${result.breakdown.blueHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_blue_hc, 5)} €/kWh = ${blueHcCost.toFixed(2)} €`, margin + 3, y)
        y += 5
        const blueHpCost = result.breakdown.blueHpKwh * result.offer.tempo_blue_hp
        pdf.text(`    -> HP: ${result.breakdown.blueHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_blue_hp, 5)} €/kWh = ${blueHpCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.text('  ⚪ JOURS BLANCS (~43 jours/an - tarif intermédiaire):', margin + 3, y)
        y += 5
        const whiteHcCost = result.breakdown.whiteHcKwh * result.offer.tempo_white_hc
        pdf.text(`    -> HC: ${result.breakdown.whiteHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_white_hc, 5)} €/kWh = ${whiteHcCost.toFixed(2)} €`, margin + 3, y)
        y += 5
        const whiteHpCost = result.breakdown.whiteHpKwh * result.offer.tempo_white_hp
        pdf.text(`    -> HP: ${result.breakdown.whiteHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_white_hp, 5)} €/kWh = ${whiteHpCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.text('  🔴 JOURS ROUGES (22 jours/an - les plus chers):', margin + 3, y)
        y += 5
        const redHcCost = result.breakdown.redHcKwh * result.offer.tempo_red_hc
        pdf.text(`    -> HC: ${result.breakdown.redHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_red_hc, 5)} €/kWh = ${redHcCost.toFixed(2)} €`, margin + 3, y)
        y += 5
        const redHpCost = result.breakdown.redHpKwh * result.offer.tempo_red_hp
        pdf.text(`    -> HP: ${result.breakdown.redHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.tempo_red_hp, 5)} €/kWh = ${redHpCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.setFont('helvetica', 'bold')
        pdf.text(`  TOTAL ÉNERGIE: ${result.energyCost.toFixed(2)} €`, margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 8
      } else if (result.offerType === 'ZEN_FLEX') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Tarif ZEN FLEX (Jours Éco / Jours Sobriété):', margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 6

        pdf.text('  🌿 JOURS ÉCO (~345 jours/an - tarif normal):', margin + 3, y)
        y += 5
        const ecoHcCost = result.breakdown.zenFlexEcoHcKwh * result.offer.hc_price_winter
        pdf.text(`    -> HC: ${result.breakdown.zenFlexEcoHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_winter, 5)} €/kWh = ${ecoHcCost.toFixed(2)} €`, margin + 3, y)
        y += 5
        const ecoHpCost = result.breakdown.zenFlexEcoHpKwh * result.offer.hp_price_winter
        pdf.text(`    -> HP: ${result.breakdown.zenFlexEcoHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_winter, 5)} €/kWh = ${ecoHpCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.text('  ** JOURS SOBRIETE (~20 jours/an - tarif majore):', margin + 3, y)
        y += 5
        const sobrietyHcCost = result.breakdown.zenFlexSobrietyHcKwh * result.offer.hc_price_summer
        pdf.text(`    -> HC: ${result.breakdown.zenFlexSobrietyHcKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hc_price_summer, 5)} €/kWh = ${sobrietyHcCost.toFixed(2)} €`, margin + 3, y)
        y += 5
        const sobrietyHpCost = result.breakdown.zenFlexSobrietyHpKwh * result.offer.hp_price_summer
        pdf.text(`    -> HP: ${result.breakdown.zenFlexSobrietyHpKwh?.toFixed(0)} kWh × ${formatPrice(result.offer.hp_price_summer, 5)} €/kWh = ${sobrietyHpCost.toFixed(2)} €`, margin + 3, y)
        y += 6

        pdf.setFont('helvetica', 'bold')
        pdf.text(`  TOTAL ÉNERGIE: ${result.energyCost.toFixed(2)} €`, margin + 3, y)
        pdf.setFont('helvetica', 'normal')
        y += 8
      }
    }

    // ===== SECTION: RÉCAPITULATIF FINAL =====
    currentPage = checkNewPage(35, currentPage)

    pdf.setFontSize(11)
    pdf.setTextColor(37, 99, 235)
    pdf.setFont('helvetica', 'bold')
    pdf.text('3. RÉCAPITULATIF FINAL', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 8

    pdf.setFontSize(9)
    pdf.setTextColor(0, 0, 0)

    // Draw a summary box
    pdf.setFillColor(249, 250, 251)
    pdf.rect(margin, y - 2, pageWidth - 2 * margin, 22, 'F')

    pdf.text(`Abonnement annuel:`, margin + 5, y + 4)
    pdf.text(`${result.subscriptionCost.toFixed(2)} €`, pageWidth - margin - 25, y + 4)

    pdf.text(`Coût énergétique:`, margin + 5, y + 10)
    pdf.text(`${result.energyCost.toFixed(2)} €`, pageWidth - margin - 25, y + 10)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(`TOTAL ANNUEL:`, margin + 5, y + 17)
    pdf.setTextColor(22, 163, 74)
    pdf.text(`${result.totalCost.toFixed(2)} €`, pageWidth - margin - 25, y + 17)
    pdf.setFont('helvetica', 'normal')
    y += 28

    // ===== SECTION: GRILLE TARIFAIRE =====
    currentPage = checkNewPage(50, currentPage)

    pdf.setFontSize(11)
    pdf.setTextColor(37, 99, 235)
    pdf.setFont('helvetica', 'bold')
    pdf.text('4. GRILLE TARIFAIRE DE L\'OFFRE', margin, y)
    pdf.setFont('helvetica', 'normal')
    y += 8

    pdf.setFontSize(9)
    pdf.setTextColor(0, 0, 0)

    if (result.offer) {
      pdf.text(`Type d'offre: ${getTypeLabel(result.offerType)}`, margin + 3, y)
      y += 5
      if (result.offer.power_kva) {
        pdf.text(`Puissance: ${result.offer.power_kva} kVA`, margin + 3, y)
        y += 5
      }
      pdf.text(`Abonnement mensuel: ${formatPrice(result.offer.subscription_price, 2)} €/mois`, margin + 3, y)
      y += 6

      // Price table based on offer type
      if (result.offer.base_price) {
        pdf.text(`Prix Base: ${formatPrice(result.offer.base_price, 5)} €/kWh`, margin + 3, y)
        y += 5
        if (result.offer.base_price_weekend) {
          pdf.text(`Prix Base Week-end: ${formatPrice(result.offer.base_price_weekend, 5)} €/kWh`, margin + 3, y)
          y += 5
        }
      }

      if (result.offer.hc_price && result.offer.hp_price) {
        pdf.text(`Prix Heures Creuses: ${formatPrice(result.offer.hc_price, 5)} €/kWh`, margin + 3, y)
        y += 5
        pdf.text(`Prix Heures Pleines: ${formatPrice(result.offer.hp_price, 5)} €/kWh`, margin + 3, y)
        y += 5
      }

      if (result.offerType === 'TEMPO') {
        pdf.text(`Bleu HC: ${formatPrice(result.offer.tempo_blue_hc, 5)} €  |  Bleu HP: ${formatPrice(result.offer.tempo_blue_hp, 5)} €`, margin + 3, y)
        y += 5
        pdf.text(`Blanc HC: ${formatPrice(result.offer.tempo_white_hc, 5)} €  |  Blanc HP: ${formatPrice(result.offer.tempo_white_hp, 5)} €`, margin + 3, y)
        y += 5
        pdf.text(`Rouge HC: ${formatPrice(result.offer.tempo_red_hc, 5)} €  |  Rouge HP: ${formatPrice(result.offer.tempo_red_hp, 5)} €`, margin + 3, y)
        y += 5
      }

      if (result.offer.valid_from) {
        y += 3
        pdf.setTextColor(107, 114, 128)
        pdf.text(`Tarif valable depuis: ${new Date(result.offer.valid_from).toLocaleDateString('fr-FR')}`, margin + 3, y)
      }
    }

    // Add footer
    addFooter(currentPage)

    // Save PDF
    const safeProviderName = result.providerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20)
    const safeOfferName = result.offerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    const fileName = `offre-${safeProviderName}-${safeOfferName}-${new Date().toISOString().split('T')[0]}.pdf`
    pdf.save(fileName)
  }

  // Block rendering during initialization to prevent flash of content
  if (isInitializing) {
    return <div className="w-full" />
  }

  // Show loading overlay when loading cached data (integrated in JSX to avoid hook ordering issues)
  // Display blurred placeholder content behind the loading spinner
  if (isInitialLoadingFromCache) {
    return (
      <div className="w-full">
        <LoadingOverlay dataType="simulation" isExiting={isLoadingExiting}>
          <LoadingPlaceholder type="simulation" />
        </LoadingOverlay>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Error Banner */}
      {simulationError && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-semibold text-red-800 dark:text-red-200">
                Erreur de simulation
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                {simulationError}
              </p>
            </div>
            <button
              onClick={() => setSimulationError(null)}
              className="ml-3 flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-300"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Demo mode info */}
      {isDemo && (
        <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Mode Démo :</strong> Le compte démo dispose déjà de 3 ans de données fictives pré-chargées.
            Le simulateur fonctionne avec ces données.
          </p>
        </div>
      )}

      {/* Shared PDL info with reference offer selector */}
      {isSharedPdl && (
        <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Users className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200 mb-3">
                PDL partagé par {impersonation?.ownerEmail}
              </p>

              {/* All filters and selector on one line in desktop */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                {/* Fournisseur filter */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    Fournisseur :
                  </label>
                  <select
                    value={refOfferFilterProvider}
                    onChange={(e) => setRefOfferFilterProvider(e.target.value)}
                    className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tous</option>
                    {refOfferProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type filter */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    Type :
                  </label>
                  <select
                    value={refOfferFilterType}
                    onChange={(e) => setRefOfferFilterType(e.target.value)}
                    className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tous</option>
                    {refOfferTypes.map((type) => (
                      <option key={type} value={type}>
                        {type === 'BASE' ? 'Base' :
                         type === 'HC_HP' ? 'HC/HP' :
                         type === 'TEMPO' ? 'Tempo' :
                         type === 'EJP' ? 'EJP' :
                         type === 'ZEN_FLEX' ? 'Zen Flex' :
                         type === 'HC_WEEKEND' ? 'HC Week-end' :
                         type === 'HC_NUIT_WEEKEND' ? 'HC Nuit & Week-end' :
                         type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Offer selector */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <label className="text-xs text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                    Offre de référence :
                  </label>
                  <select
                    value={referenceOffer?.offerId || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      const selectedOffer = offersData.find((o) => o.id === value)
                      if (selectedOffer) {
                        setReferenceOffer(selectedPdl, {
                          offerId: selectedOffer.id,
                          offerName: selectedOffer.name,
                        })
                      } else {
                        setReferenceOffer(selectedPdl, null)
                      }
                    }}
                    className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
                  >
                    <option value="">Sélectionner ({filteredRefOffers.length})...</option>
                    {filteredRefOffers.map((offer) => {
                      const provider = providersData.find((p) => p.id === offer.provider_id)
                      return (
                        <option key={offer.id} value={offer.id}>
                          {provider?.name ? `${provider.name} - ` : ''}{offer.name}
                        </option>
                      )
                    })}
                  </select>
                  {referenceOffer && (
                    <button
                      onClick={() => setReferenceOffer(selectedPdl, null)}
                      className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors flex-shrink-0"
                      title="Supprimer l'offre de référence"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Reset button */}
                {(refOfferFilterProvider !== 'all' || refOfferFilterType !== 'all') && (
                  <button
                    onClick={() => {
                      setRefOfferFilterProvider('all')
                      setRefOfferFilterType('all')
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline whitespace-nowrap"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>

              {referenceOffer && (
                <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                  ✓ L'offre « {referenceOffer.offerName} » sera utilisée comme référence pour calculer les écarts.
                </p>
              )}
              {!referenceOffer && (
                <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                  💡 Sélectionnez une offre pour comparer les résultats par rapport à cette référence.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {simulationError && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
          <p className="text-sm text-red-800 dark:text-red-200">
            {simulationError}
          </p>
        </div>
      )}

      {/* Empty State - No simulation yet */}
      {!(simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0) && !isSimulating && (
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-6">
              <Calculator className="w-10 h-10 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Aucune simulation en cours
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour comparer les offres d'électricité basées sur votre consommation réelle,
              lancez une simulation en cliquant sur le bouton
              <span className="font-semibold text-purple-600 dark:text-purple-400"> Récupérer </span>
              en haut à droite de la page.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Sélectionnez un point de livraison</span>
              <ArrowRight className="w-4 h-4" />
              <span>Cliquez sur "Récupérer"</span>
              <ArrowRight className="w-4 h-4" />
              <span>Comparez les offres</span>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Results */}
      <AnimatedSection isVisible={simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0} delay={0}>
        <div className={`rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-all duration-300 ${isSimulating ? 'opacity-60 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-2">
              {isSimulating ? (
                <Loader2 className="text-primary-600 dark:text-primary-400 animate-spin" size={20} />
              ) : (
                <Calculator className="text-primary-600 dark:text-primary-400" size={20} />
              )}
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isSimulating
                  ? 'Recalcul en cours…'
                  : simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0
                    ? `Comparaison des offres (${filteredAndSortedResults.length} résultat${filteredAndSortedResults.length > 1 ? 's' : ''})`
                    : 'Comparaison des offres'
                }
              </h2>
            </div>
            {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0 && (
              <ModernButton
                variant="primary"
                size="sm"
                icon={FileDown}
                iconPosition="left"
                onClick={exportToPDF}
                className="!shadow-none hover:!shadow-none"
              >
                Exporter en PDF
              </ModernButton>
            )}
          </div>

          {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0 && (
            <>

            {/* Period Selector */}
            <div className="mx-6 mb-4">
              <PeriodSelector
                startDate={simulationStartDate}
                endDate={simulationEndDate}
                onRangeChange={(start, end) => {
                  setSelectedPeriod('custom')
                  setCustomStartDate(start)
                  setCustomEndDate(end)
                }}
                minDate={selectedPDLDetails?.oldest_available_data_date || selectedPDLDetails?.activation_date}
                availableDates={availableDates}
                shortcuts={[
                  ...(userPreset !== 'rolling' ? [{
                    label: `Mon profil (${profileLabel})`,
                    onClick: () => setSelectedPeriod('profile'),
                    active: selectedPeriod === 'profile'
                  }] : []),
                  {
                    label: 'Année glissante',
                    onClick: () => setSelectedPeriod('rolling'),
                    active: selectedPeriod === 'rolling'
                  },
                  {
                    label: '2025',
                    onClick: () => setSelectedPeriod('2025'),
                    active: selectedPeriod === '2025'
                  },
                  {
                    label: '2024',
                    onClick: () => setSelectedPeriod('2024'),
                    active: selectedPeriod === '2024'
                  }
                ]}
              />
            </div>

            {/* Filters */}
            <div className="px-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtres:</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400">Type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="input text-xs py-1 px-2 w-auto"
                  >
                    <option value="all">Tous</option>
                    {availableTypes.map((type) => (
                      <option key={type} value={type}>
                        {getTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 dark:text-gray-400">Fournisseur:</label>
                  <select
                    value={filterProvider}
                    onChange={(e) => setFilterProvider(e.target.value)}
                    className="input text-xs py-1 px-2 w-auto"
                  >
                    <option value="all">Tous</option>
                    {availableProviders.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={showOnlyRecent}
                      onChange={(e) => setShowOnlyRecent(e.target.checked)}
                      className="w-3 h-3 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span>Récentes uniquement</span>
                  </label>
                  <div className="relative group">
                    <Info
                      size={14}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help transition-colors"
                    />
                    <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg z-10">
                      <div className="text-left">
                        Affiche uniquement les offres avec des tarifs mis à jour il y a moins de 6 mois. Les offres plus anciennes sont marquées du badge "⚠️ Ancien".
                      </div>
                      <div className="absolute top-full left-4 -mt-1">
                        <div className="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {(filterType !== 'all' || filterProvider !== 'all' || showOnlyRecent) && (
                  <button
                    onClick={() => {
                      setFilterType('all')
                      setFilterProvider('all')
                      setShowOnlyRecent(false)
                    }}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline ml-auto transition-colors"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 pb-6">

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="p-3 w-8"></th>
                    <th className="p-3 text-left font-semibold">Rang</th>
                    <th className="p-3 text-left font-semibold">Fournisseur</th>
                    <th className="p-3 text-center font-semibold">Type</th>
                    <th className="p-3 text-left font-semibold">Offre</th>
                    <th
                      className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('subscription')}
                      title="Cliquez pour trier"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Abo.</span>
                        {getSortIcon('subscription')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('energy')}
                      title="Cliquez pour trier"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Énergie</span>
                        {getSortIcon('energy')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('total')}
                      title="Cliquez pour trier"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Total</span>
                        {getSortIcon('total')}
                      </div>
                    </th>
                    <th className="p-3 text-right font-semibold" title={currentOfferResult ? "Écart par rapport à votre offre actuelle" : "Écart par rapport à la meilleure offre"}>
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedResults.map((result, index) => {
                    const isExpanded = expandedRows.has(result.offerId)
                    // Check if this is the user's current offer
                    const isCurrentOffer = currentOfferResult?.offerId === result.offerId
                    // Calculate difference from current offer (if exists) or best offer
                    const referenceResult = currentOfferResult || filteredAndSortedResults[0]
                    const costDifferenceFromReference = result.totalCost - referenceResult.totalCost

                    return (
                      <React.Fragment key={result.offerId}>
                        <tr
                          onClick={() => toggleRowExpansion(result.offerId)}
                          className={`border-t border-gray-200 dark:border-gray-700 cursor-pointer transition-all duration-200 group ${
                            isCurrentOffer
                              ? 'bg-gradient-to-r from-primary-50 to-blue-50/50 dark:from-primary-900/20 dark:to-blue-900/10 hover:from-primary-100 hover:to-blue-100/50 dark:hover:from-primary-900/30 dark:hover:to-blue-900/20 ring-2 ring-primary-400 dark:ring-primary-500 ring-inset'
                              : index === 0
                                ? 'bg-gradient-to-r from-green-50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/10 hover:from-green-100 hover:to-emerald-100/50 dark:hover:from-green-900/30 dark:hover:to-emerald-900/20'
                                : index % 2 === 1
                                  ? 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                        >
                          <td className="p-2 w-8">
                            <div className={`flex items-center justify-center transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              <ChevronDown size={16} className="text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
                            </div>
                          </td>
                          <td className="p-2 w-12">
                            {index === 0 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-white text-xs font-bold shadow-sm">
                                1
                              </span>
                            ) : index < 3 ? (
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold">
                                {index + 1}
                              </span>
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400 text-sm pl-2">{index + 1}</span>
                            )}
                          </td>
                          <td className="p-2 text-sm font-medium text-gray-700 dark:text-gray-300">{result.providerName}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${getTypeColor(result.offerType)}`}>
                              {getTypeLabel(result.offerType)}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800 dark:text-gray-200">{result.offerName}</span>
                              {result.offer?.description?.startsWith('⚠️') && (
                                <span
                                  className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded"
                                  title={result.offer.description.split('.')[0]}
                                >
                                  ⚠️
                                </span>
                              )}
                              {isOldTariff(result.validFrom) && (
                                <span
                                  className="px-1.5 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded"
                                  title="Tarif ancien (> 6 mois) - Potentiellement non à jour"
                                >
                                  Ancien
                                </span>
                              )}
                            </div>
                            {result.validFrom && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                Tarif du {new Date(result.validFrom).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-400">{result.subscriptionCost.toFixed(0)} €</td>
                          <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-400">{result.energyCost.toFixed(0)} €</td>
                          <td className="p-2 text-right">
                            <span className={`text-base font-bold ${index === 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                              {result.totalCost.toFixed(0)} €
                            </span>
                          </td>
                          <td className="p-2 text-right w-28">
                            {isCurrentOffer ? (
                              <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full font-medium">
                                Offre actuelle
                              </span>
                            ) : costDifferenceFromReference === 0 ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Meilleur</span>
                            ) : costDifferenceFromReference < 0 ? (
                              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                                {costDifferenceFromReference.toFixed(0)} €
                              </span>
                            ) : (
                              <span className="text-sm text-red-500 dark:text-red-400 font-medium">
                                +{costDifferenceFromReference.toFixed(0)} €
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${result.offerId}-details`} className={`border-t border-dashed border-gray-300 dark:border-gray-600 ${
                            isCurrentOffer
                              ? 'bg-primary-50/50 dark:bg-primary-900/10'
                              : index === 0
                                ? 'bg-green-50/50 dark:bg-green-900/10'
                                : index % 2 === 1
                                  ? 'bg-gray-100 dark:bg-gray-700/30'
                                  : 'bg-gray-50 dark:bg-gray-800/30'
                          }`}>
                            <td colSpan={9} className="p-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50">
                              {/* Warning message if present */}
                              {result.offer?.description?.startsWith('⚠️') && (
                                <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-3 rounded-lg shadow-sm">
                                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                                    {result.offer.description.split('.')[0]}
                                  </p>
                                </div>
                              )}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Breakdown by tariff */}
                                {result.breakdown && (result.offerType === 'BASE' || result.offerType === 'BASE_WEEKEND') && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">⚡</span>
                                        Détail de consommation
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {result.offer.base_price_weekend ? (
                                        <>
                                          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                                            <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
                                              <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                                              Semaine
                                            </span>
                                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{result.breakdown.baseWeekdayKwh?.toFixed(0)} kWh → {calcPrice(result.breakdown.baseWeekdayKwh, result.offer.base_price)} €</span>
                                          </div>
                                          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                                            <span className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                              Week-end
                                            </span>
                                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{result.breakdown.baseWeekendKwh?.toFixed(0)} kWh → {calcPrice(result.breakdown.baseWeekendKwh, result.offer.base_price_weekend)} €</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                                          <span className="text-sm text-emerald-700 dark:text-emerald-300">Consommation totale</span>
                                          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{result.totalKwh?.toFixed(0)} kWh → {result.energyCost.toFixed(2)} €</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.breakdown && (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">⚡</span>
                                        Détail de consommation
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {result.breakdown.hcWeekendKwh > 0 ? (
                                        <>
                                          {/* Semaine */}
                                          <div className="space-y-2">
                                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">📅 Semaine</div>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                                                <div className="text-xs text-sky-600 dark:text-sky-400 font-medium">Heures Creuses</div>
                                                <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{result.breakdown.hcKwh?.toFixed(0)} kWh</div>
                                                <div className="text-xs text-sky-600 dark:text-sky-400">{calcPrice(result.breakdown.hcKwh, result.offer.hc_price)} €</div>
                                              </div>
                                              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                                <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Heures Pleines</div>
                                                <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{result.breakdown.hpKwh?.toFixed(0)} kWh</div>
                                                <div className="text-xs text-orange-600 dark:text-orange-400">{calcPrice(result.breakdown.hpKwh, result.offer.hp_price)} €</div>
                                              </div>
                                            </div>
                                          </div>
                                          {/* Week-end */}
                                          <div className="space-y-2">
                                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">🌴 Week-end (tout HC)</div>
                                            <div className="p-2 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800">
                                              <div className="flex justify-between items-center">
                                                <div>
                                                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Consommation</div>
                                                  <div className="text-sm font-bold text-amber-800 dark:text-amber-200">{result.breakdown.hcWeekendKwh?.toFixed(0)} kWh</div>
                                                </div>
                                                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{calcPrice(result.breakdown.hcWeekendKwh, result.offer.hc_price_weekend || result.offer.hc_price)} €</div>
                                              </div>
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                                            <div className="text-xs text-sky-600 dark:text-sky-400 font-medium">Heures Creuses</div>
                                            <div className="text-lg font-bold text-sky-800 dark:text-sky-200">{result.breakdown.hcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-sm font-semibold text-sky-600 dark:text-sky-400">{calcPrice(result.breakdown.hcKwh, result.offer.hc_price)} €</div>
                                          </div>
                                          <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Heures Pleines</div>
                                            <div className="text-lg font-bold text-orange-800 dark:text-orange-200">{result.breakdown.hpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">{calcPrice(result.breakdown.hpKwh, result.offer.hp_price)} €</div>
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.breakdown && result.offerType === 'SEASONAL' && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">🌡️</span>
                                        Détail de consommation
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {/* Hiver */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
                                          <span>❄️</span> Hiver (nov-mars)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                                            <div className="text-xs text-sky-600 dark:text-sky-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{result.breakdown.hcWinterKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-sky-600 dark:text-sky-400">{calcPrice(result.breakdown.hcWinterKwh, result.offer.hc_price_winter)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{result.breakdown.hpWinterKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400">{calcPrice(result.breakdown.hpWinterKwh, result.offer.hp_price_winter)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Été */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                                          <span>☀️</span> Été (avr-oct)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                                            <div className="text-xs text-sky-600 dark:text-sky-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{result.breakdown.hcSummerKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-sky-600 dark:text-sky-400">{calcPrice(result.breakdown.hcSummerKwh, result.offer.hc_price_summer)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{result.breakdown.hpSummerKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400">{calcPrice(result.breakdown.hpSummerKwh, result.offer.hp_price_summer)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {result.breakdown.peakDayKwh > 0 && (
                                        <div className="space-y-2">
                                          <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                                            <span>⚡</span> Jours de pointe
                                          </div>
                                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <div className="flex justify-between items-center">
                                              <div>
                                                <div className="text-xs text-red-600 dark:text-red-400 font-medium">Consommation</div>
                                                <div className="text-sm font-bold text-red-800 dark:text-red-200">{result.breakdown.peakDayKwh?.toFixed(0)} kWh</div>
                                              </div>
                                              <div className="text-lg font-bold text-red-700 dark:text-red-300">{calcPrice(result.breakdown.peakDayKwh, result.offer.peak_day_price)} €</div>
                                            </div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 text-xs text-amber-700 dark:text-amber-300">
                                            <strong>⚠️ Note :</strong> Simulation basée sur les jours rouges Tempo.
                                          </div>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.breakdown && result.offerType === 'TEMPO' && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">🎨</span>
                                        Détail de consommation
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {/* Jours Bleus */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-full bg-blue-500"></span> Jours Bleus (300j)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-blue-800 dark:text-blue-200">{result.breakdown.blueHcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-blue-600 dark:text-blue-400">{calcPrice(result.breakdown.blueHcKwh, result.offer.tempo_blue_hc)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-blue-800 dark:text-blue-200">{result.breakdown.blueHpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-blue-600 dark:text-blue-400">{calcPrice(result.breakdown.blueHpKwh, result.offer.tempo_blue_hp)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Jours Blancs */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-500"></span> Jours Blancs (43j)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600">
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{result.breakdown.whiteHcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{calcPrice(result.breakdown.whiteHcKwh, result.offer.tempo_white_hc)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600">
                                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{result.breakdown.whiteHpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">{calcPrice(result.breakdown.whiteHpKwh, result.offer.tempo_white_hp)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Jours Rouges */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-full bg-red-500"></span> Jours Rouges (22j)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <div className="text-xs text-red-600 dark:text-red-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-red-800 dark:text-red-200">{result.breakdown.redHcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-red-600 dark:text-red-400">{calcPrice(result.breakdown.redHcKwh, result.offer.tempo_red_hc)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <div className="text-xs text-red-600 dark:text-red-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-red-800 dark:text-red-200">{result.breakdown.redHpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-red-600 dark:text-red-400">{calcPrice(result.breakdown.redHpKwh, result.offer.tempo_red_hp)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Info about Tempo optimization */}
                                      <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400">
                                        <div className="flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300">
                                          <span className="flex-shrink-0 text-base">💡</span>
                                          <div>
                                            <strong>Simulation basée sur votre consommation actuelle.</strong> En réduisant votre consommation les 22 jours rouges (HP à {formatPrice(result.offer.tempo_red_hp, 4)} €/kWh), vous pouvez significativement diminuer votre facture avec cette offre.
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.breakdown && result.offerType === 'ZEN_FLEX' && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">🌿</span>
                                        Détail de consommation
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {/* Jours Éco */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-full bg-green-500"></span> Jours Éco (345j/an)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-green-800 dark:text-green-200">{result.breakdown.zenFlexEcoHcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-green-600 dark:text-green-400">{calcPrice(result.breakdown.zenFlexEcoHcKwh, result.offer.hc_price_winter)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-green-800 dark:text-green-200">{result.breakdown.zenFlexEcoHpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-green-600 dark:text-green-400">{calcPrice(result.breakdown.zenFlexEcoHpKwh, result.offer.hp_price_winter)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Jours Sobriété */}
                                      <div className="space-y-2">
                                        <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                                          <span className="w-3 h-3 rounded-full bg-red-500"></span> Jours Sobriété (20j/an)
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <div className="text-xs text-red-600 dark:text-red-400 font-medium">HC</div>
                                            <div className="text-sm font-bold text-red-800 dark:text-red-200">{result.breakdown.zenFlexSobrietyHcKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-red-600 dark:text-red-400">{calcPrice(result.breakdown.zenFlexSobrietyHcKwh, result.offer.hc_price_summer)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <div className="text-xs text-red-600 dark:text-red-400 font-medium">HP</div>
                                            <div className="text-sm font-bold text-red-800 dark:text-red-200">{result.breakdown.zenFlexSobrietyHpKwh?.toFixed(0)} kWh</div>
                                            <div className="text-xs text-red-600 dark:text-red-400">{calcPrice(result.breakdown.zenFlexSobrietyHpKwh, result.offer.hp_price_summer)} €</div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* Warning about Sobriété days estimation */}
                                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400">
                                        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                                          <span className="flex-shrink-0 text-base">⚠️</span>
                                          <div>
                                            <strong>Estimation des jours Sobriété :</strong> Les 20 jours de sobriété sont estimés à partir des jours Tempo Rouge les plus fréquents (statistiquement les plus froids). Les jours réels sont définis par EDF et ne sont pas récupérables automatiquement.
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-teal-600 dark:text-teal-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Pricing details */}
                                {result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">💰</span>
                                        Tarifs de l'offre
                                      </h4>
                                    </div>
                                    <div className="p-4 space-y-3">
                                      {/* Abonnement & Puissance */}
                                      <div className="flex gap-2">
                                        <div className="flex-1 p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-center">
                                          <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Abonnement</div>
                                          <div className="text-lg font-bold text-purple-800 dark:text-purple-200">{formatPrice(result.offer.subscription_price, 2)} €</div>
                                          <div className="text-xs text-purple-500 dark:text-purple-400">/mois</div>
                                        </div>
                                        {result.offer.power_kva && (
                                          <div className="flex-1 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-center">
                                            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Puissance</div>
                                            <div className="text-lg font-bold text-indigo-800 dark:text-indigo-200">{result.offer.power_kva}</div>
                                            <div className="text-xs text-indigo-500 dark:text-indigo-400">kVA</div>
                                          </div>
                                        )}
                                      </div>

                                      {/* BASE price */}
                                      {result.offer.base_price && (
                                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                                          <div className="flex justify-between items-center">
                                            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Prix Base</span>
                                            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{formatPrice(result.offer.base_price, 5)} €/kWh</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* HC/HP prices */}
                                      {result.offer.hc_price && result.offer.hp_price && (result.offerType === 'HC_HP' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'WEEKEND' || result.offerType === 'HC_WEEKEND') && (
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-center">
                                            <div className="text-xs text-sky-600 dark:text-sky-400 font-medium">Heures Creuses</div>
                                            <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{formatPrice(result.offer.hc_price, 5)} €</div>
                                          </div>
                                          <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-center">
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Heures Pleines</div>
                                            <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{formatPrice(result.offer.hp_price, 5)} €</div>
                                          </div>
                                        </div>
                                      )}

                                      {/* SEASONAL prices */}
                                      {result.offerType === 'SEASONAL' && (
                                        <div className="space-y-2">
                                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">❄️ Hiver</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-center">
                                              <div className="text-xs text-sky-600 dark:text-sky-400">HC</div>
                                              <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{formatPrice(result.offer.hc_price_winter, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-center">
                                              <div className="text-xs text-orange-600 dark:text-orange-400">HP</div>
                                              <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{formatPrice(result.offer.hp_price_winter, 5)} €</div>
                                            </div>
                                          </div>
                                          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">☀️ Été</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-center">
                                              <div className="text-xs text-sky-600 dark:text-sky-400">HC</div>
                                              <div className="text-sm font-bold text-sky-800 dark:text-sky-200">{formatPrice(result.offer.hc_price_summer, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 text-center">
                                              <div className="text-xs text-orange-600 dark:text-orange-400">HP</div>
                                              <div className="text-sm font-bold text-orange-800 dark:text-orange-200">{formatPrice(result.offer.hp_price_summer, 5)} €</div>
                                            </div>
                                          </div>
                                          {result.offer.peak_day_price && (
                                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                              <div className="flex justify-between items-center">
                                                <span className="text-sm text-red-600 dark:text-red-400 font-medium">⚡ Jours de pointe</span>
                                                <span className="text-sm font-bold text-red-800 dark:text-red-200">{formatPrice(result.offer.peak_day_price, 5)} €/kWh</span>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* ZEN_FLEX prices */}
                                      {result.offerType === 'ZEN_FLEX' && (
                                        <div className="space-y-2">
                                          <div className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">🌿 Jours Éco (345j)</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                                              <div className="text-xs text-green-600 dark:text-green-400">HC</div>
                                              <div className="text-sm font-bold text-green-800 dark:text-green-200">{formatPrice(result.offer.hc_price_winter, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
                                              <div className="text-xs text-green-600 dark:text-green-400">HP</div>
                                              <div className="text-sm font-bold text-green-800 dark:text-green-200">{formatPrice(result.offer.hp_price_winter, 5)} €</div>
                                            </div>
                                          </div>
                                          <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">⚡ Jours Sobriété (20j)</div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                                              <div className="text-xs text-red-600 dark:text-red-400">HC</div>
                                              <div className="text-sm font-bold text-red-800 dark:text-red-200">{formatPrice(result.offer.hc_price_summer, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                                              <div className="text-xs text-red-600 dark:text-red-400">HP</div>
                                              <div className="text-sm font-bold text-red-800 dark:text-red-200">{formatPrice(result.offer.hp_price_summer, 5)} €</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* TEMPO prices */}
                                      {result.offerType === 'TEMPO' && result.offer.tempo_blue_hc && (
                                        <div className="space-y-2">
                                          {/* Jours Bleus */}
                                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span> Jours Bleus (300j)
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                                              <div className="text-xs text-blue-600 dark:text-blue-400">HC</div>
                                              <div className="text-sm font-bold text-blue-800 dark:text-blue-200">{formatPrice(result.offer.tempo_blue_hc, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                                              <div className="text-xs text-blue-600 dark:text-blue-400">HP</div>
                                              <div className="text-sm font-bold text-blue-800 dark:text-blue-200">{formatPrice(result.offer.tempo_blue_hp, 5)} €</div>
                                            </div>
                                          </div>
                                          {/* Jours Blancs */}
                                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-gray-400"></span> Jours Blancs (43j)
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-center">
                                              <div className="text-xs text-gray-500 dark:text-gray-400">HC</div>
                                              <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatPrice(result.offer.tempo_white_hc, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-center">
                                              <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                                              <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatPrice(result.offer.tempo_white_hp, 5)} €</div>
                                            </div>
                                          </div>
                                          {/* Jours Rouges */}
                                          <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-red-500"></span> Jours Rouges (22j)
                                          </div>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                                              <div className="text-xs text-red-600 dark:text-red-400">HC</div>
                                              <div className="text-sm font-bold text-red-800 dark:text-red-200">{formatPrice(result.offer.tempo_red_hc, 5)} €</div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                                              <div className="text-xs text-red-600 dark:text-red-400">HP</div>
                                              <div className="text-sm font-bold text-red-800 dark:text-red-200">{formatPrice(result.offer.tempo_red_hp, 5)} €</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Link to offer */}
                                      {result.offer.offer_url && (
                                        <a
                                          href={result.offer.offer_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex items-center justify-center gap-2 w-full py-2 px-4 mt-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors font-medium text-sm"
                                        >
                                          <ExternalLink size={16} />
                                          Voir l'offre officielle
                                        </a>
                                      )}

                                      {/* Export PDF button */}
                                      <button
                                        onClick={(e) => exportSingleOfferToPDF(result, e)}
                                        className="flex items-center justify-center gap-2 w-full py-2 px-4 mt-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 font-medium text-sm transition-colors"
                                      >
                                        <FileDown size={16} />
                                        Exporter en PDF (détails complets)
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {/* Calculation explanation block - collapsible */}
                                {result.breakdown && (
                                  <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <button
                                      onClick={(e) => toggleCalculationsExpansion(result.offerId, e)}
                                      className="w-full flex items-center justify-between bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-4 py-2 transition-colors border-b border-gray-200 dark:border-gray-600"
                                    >
                                      <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                                        <span className="text-lg">📚</span>
                                        Comprendre les calculs
                                      </h4>
                                      <ChevronDown
                                        size={18}
                                        className={`text-gray-500 dark:text-gray-400 transition-transform duration-200 ${expandedCalculations.has(result.offerId) ? 'rotate-180' : ''}`}
                                      />
                                    </button>

                                    {expandedCalculations.has(result.offerId) && (
                                      <div className="p-4 space-y-4 text-sm">
                                        {/* Section 1: Subscription explanation */}
                                        <div className="space-y-2">
                                          <h5 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-xs font-bold">1</span>
                                            Calcul de l'abonnement annuel
                                          </h5>
                                          <div className="ml-8 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                            <p className="text-gray-700 dark:text-gray-300">
                                              L'abonnement est facturé mensuellement par votre fournisseur, indépendamment de votre consommation.
                                            </p>
                                            <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded border border-purple-300 dark:border-purple-700 font-mono text-xs">
                                              <span className="text-purple-600 dark:text-purple-400">{formatPrice(result.offer?.subscription_price, 2)} €/mois</span>
                                              <span className="text-gray-500"> × </span>
                                              <span className="text-purple-600 dark:text-purple-400">12 mois</span>
                                              <span className="text-gray-500"> = </span>
                                              <span className="font-bold text-purple-700 dark:text-purple-300">{result.subscriptionCost.toFixed(2)} €/an</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Section 2: Energy cost explanation */}
                                        <div className="space-y-2">
                                          <h5 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">2</span>
                                            Calcul du coût énergétique
                                          </h5>
                                          <div className="ml-8 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-3">
                                            <p className="text-gray-700 dark:text-gray-300">
                                              Le coût énergétique dépend de votre consommation réelle ({result.totalKwh?.toFixed(0)} kWh sur la période)
                                              et des tarifs appliqués selon le type d'offre (<strong>{getTypeLabel(result.offerType)}</strong>).
                                            </p>

                                            {/* Detailed formula based on offer type */}
                                            {(result.offerType === 'BASE' || result.offerType === 'BASE_WEEKEND') && (
                                              <div className="space-y-2">
                                                {result.offer?.base_price_weekend && result.breakdown.baseWeekendKwh > 0 ? (
                                                  <>
                                                    <div className="p-2 bg-white dark:bg-gray-800 rounded border border-emerald-300 dark:border-emerald-700 font-mono text-xs">
                                                      <div className="text-gray-600 dark:text-gray-400 mb-1">Semaine :</div>
                                                      <span className="text-emerald-600 dark:text-emerald-400">{result.breakdown.baseWeekdayKwh?.toFixed(0)} kWh</span>
                                                      <span className="text-gray-500"> × </span>
                                                      <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(result.offer.base_price, 5)} €</span>
                                                      <span className="text-gray-500"> = </span>
                                                      <span className="font-bold">{calcPrice(result.breakdown.baseWeekdayKwh, result.offer.base_price)} €</span>
                                                    </div>
                                                    <div className="p-2 bg-white dark:bg-gray-800 rounded border border-amber-300 dark:border-amber-700 font-mono text-xs">
                                                      <div className="text-gray-600 dark:text-gray-400 mb-1">Week-end :</div>
                                                      <span className="text-amber-600 dark:text-amber-400">{result.breakdown.baseWeekendKwh?.toFixed(0)} kWh</span>
                                                      <span className="text-gray-500"> × </span>
                                                      <span className="text-amber-600 dark:text-amber-400">{formatPrice(result.offer.base_price_weekend, 5)} €</span>
                                                      <span className="text-gray-500"> = </span>
                                                      <span className="font-bold">{calcPrice(result.breakdown.baseWeekendKwh, result.offer.base_price_weekend)} €</span>
                                                    </div>
                                                  </>
                                                ) : (
                                                  <div className="p-2 bg-white dark:bg-gray-800 rounded border border-emerald-300 dark:border-emerald-700 font-mono text-xs">
                                                    <span className="text-emerald-600 dark:text-emerald-400">{result.totalKwh?.toFixed(0)} kWh</span>
                                                    <span className="text-gray-500"> × </span>
                                                    <span className="text-emerald-600 dark:text-emerald-400">{formatPrice(result.offer?.base_price, 5)} €/kWh</span>
                                                    <span className="text-gray-500"> = </span>
                                                    <span className="font-bold text-emerald-700 dark:text-emerald-300">{result.energyCost.toFixed(2)} €</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {(result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') && (
                                              <div className="space-y-2">
                                                <div className="p-2 bg-white dark:bg-gray-800 rounded border border-sky-300 dark:border-sky-700 font-mono text-xs">
                                                  <div className="text-gray-600 dark:text-gray-400 mb-1">Heures Creuses (tarif réduit) :</div>
                                                  <span className="text-sky-600 dark:text-sky-400">{result.breakdown.hcKwh?.toFixed(0)} kWh</span>
                                                  <span className="text-gray-500"> × </span>
                                                  <span className="text-sky-600 dark:text-sky-400">{formatPrice(result.offer?.hc_price, 5)} €</span>
                                                  <span className="text-gray-500"> = </span>
                                                  <span className="font-bold">{calcPrice(result.breakdown.hcKwh, result.offer?.hc_price)} €</span>
                                                </div>
                                                <div className="p-2 bg-white dark:bg-gray-800 rounded border border-orange-300 dark:border-orange-700 font-mono text-xs">
                                                  <div className="text-gray-600 dark:text-gray-400 mb-1">Heures Pleines (tarif normal) :</div>
                                                  <span className="text-orange-600 dark:text-orange-400">{result.breakdown.hpKwh?.toFixed(0)} kWh</span>
                                                  <span className="text-gray-500"> × </span>
                                                  <span className="text-orange-600 dark:text-orange-400">{formatPrice(result.offer?.hp_price, 5)} €</span>
                                                  <span className="text-gray-500"> = </span>
                                                  <span className="font-bold">{calcPrice(result.breakdown.hpKwh, result.offer?.hp_price)} €</span>
                                                </div>
                                                {result.breakdown.hcWeekendKwh > 0 && (
                                                  <div className="p-2 bg-white dark:bg-gray-800 rounded border border-amber-300 dark:border-amber-700 font-mono text-xs">
                                                    <div className="text-gray-600 dark:text-gray-400 mb-1">Week-end (tout en HC) :</div>
                                                    <span className="text-amber-600 dark:text-amber-400">{result.breakdown.hcWeekendKwh?.toFixed(0)} kWh</span>
                                                    <span className="text-gray-500"> × </span>
                                                    <span className="text-amber-600 dark:text-amber-400">{formatPrice(result.offer?.hc_price_weekend || result.offer?.hc_price, 5)} €</span>
                                                    <span className="text-gray-500"> = </span>
                                                    <span className="font-bold">{calcPrice(result.breakdown.hcWeekendKwh, result.offer?.hc_price_weekend || result.offer?.hc_price)} €</span>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {result.offerType === 'TEMPO' && (
                                              <div className="space-y-2">
                                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                                  Le tarif Tempo applique des prix différents selon la couleur du jour (Bleu, Blanc, Rouge) et l'heure (HC/HP).
                                                </p>
                                                <div className="grid grid-cols-1 gap-2">
                                                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                                                    <div className="text-blue-700 dark:text-blue-300 font-semibold mb-1">🔵 Jours Bleus (~300j/an)</div>
                                                    <div>HC: {result.breakdown.blueHcKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_blue_hc, 5)} € = {calcPrice(result.breakdown.blueHcKwh, result.offer?.tempo_blue_hc)} €</div>
                                                    <div>HP: {result.breakdown.blueHpKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_blue_hp, 5)} € = {calcPrice(result.breakdown.blueHpKwh, result.offer?.tempo_blue_hp)} €</div>
                                                  </div>
                                                  <div className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded border border-gray-300 dark:border-gray-600 font-mono text-xs">
                                                    <div className="text-gray-700 dark:text-gray-300 font-semibold mb-1">⚪ Jours Blancs (~43j/an)</div>
                                                    <div>HC: {result.breakdown.whiteHcKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_white_hc, 5)} € = {calcPrice(result.breakdown.whiteHcKwh, result.offer?.tempo_white_hc)} €</div>
                                                    <div>HP: {result.breakdown.whiteHpKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_white_hp, 5)} € = {calcPrice(result.breakdown.whiteHpKwh, result.offer?.tempo_white_hp)} €</div>
                                                  </div>
                                                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-300 dark:border-red-700 font-mono text-xs">
                                                    <div className="text-red-700 dark:text-red-300 font-semibold mb-1">🔴 Jours Rouges (22j/an)</div>
                                                    <div>HC: {result.breakdown.redHcKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_red_hc, 5)} € = {calcPrice(result.breakdown.redHcKwh, result.offer?.tempo_red_hc)} €</div>
                                                    <div>HP: {result.breakdown.redHpKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.tempo_red_hp, 5)} € = {calcPrice(result.breakdown.redHpKwh, result.offer?.tempo_red_hp)} €</div>
                                                  </div>
                                                </div>
                                              </div>
                                            )}

                                            {result.offerType === 'SEASONAL' && (
                                              <div className="space-y-2">
                                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                                  Le tarif saisonnier applique des prix différents selon la saison (Hiver/Été) et l'heure (HC/HP).
                                                </p>
                                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-300 dark:border-blue-700 font-mono text-xs">
                                                  <div className="text-blue-700 dark:text-blue-300 font-semibold mb-1">❄️ Hiver (nov-mars)</div>
                                                  <div>HC: {result.breakdown.hcWinterKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hc_price_winter, 5)} € = {calcPrice(result.breakdown.hcWinterKwh, result.offer?.hc_price_winter)} €</div>
                                                  <div>HP: {result.breakdown.hpWinterKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hp_price_winter, 5)} € = {calcPrice(result.breakdown.hpWinterKwh, result.offer?.hp_price_winter)} €</div>
                                                </div>
                                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-300 dark:border-amber-700 font-mono text-xs">
                                                  <div className="text-amber-700 dark:text-amber-300 font-semibold mb-1">☀️ Été (avr-oct)</div>
                                                  <div>HC: {result.breakdown.hcSummerKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hc_price_summer, 5)} € = {calcPrice(result.breakdown.hcSummerKwh, result.offer?.hc_price_summer)} €</div>
                                                  <div>HP: {result.breakdown.hpSummerKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hp_price_summer, 5)} € = {calcPrice(result.breakdown.hpSummerKwh, result.offer?.hp_price_summer)} €</div>
                                                </div>
                                                {result.breakdown.peakDayKwh > 0 && (
                                                  <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-300 dark:border-red-700 font-mono text-xs">
                                                    <div className="text-red-700 dark:text-red-300 font-semibold mb-1">⚡ Jours de pointe</div>
                                                    <div>{result.breakdown.peakDayKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.peak_day_price, 5)} € = {calcPrice(result.breakdown.peakDayKwh, result.offer?.peak_day_price)} €</div>
                                                  </div>
                                                )}
                                              </div>
                                            )}

                                            {result.offerType === 'ZEN_FLEX' && (
                                              <div className="space-y-2">
                                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                                  Zen Flex propose des tarifs avantageux ~345 jours/an (Éco), mais majorés ~20 jours/an (Sobriété).
                                                </p>
                                                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-300 dark:border-green-700 font-mono text-xs">
                                                  <div className="text-green-700 dark:text-green-300 font-semibold mb-1">🌿 Jours Éco (~345j)</div>
                                                  <div>HC: {result.breakdown.zenFlexEcoHcKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hc_price_winter, 5)} € = {calcPrice(result.breakdown.zenFlexEcoHcKwh, result.offer?.hc_price_winter)} €</div>
                                                  <div>HP: {result.breakdown.zenFlexEcoHpKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hp_price_winter, 5)} € = {calcPrice(result.breakdown.zenFlexEcoHpKwh, result.offer?.hp_price_winter)} €</div>
                                                </div>
                                                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-300 dark:border-red-700 font-mono text-xs">
                                                  <div className="text-red-700 dark:text-red-300 font-semibold mb-1">⚡ Jours Sobriété (~20j)</div>
                                                  <div>HC: {result.breakdown.zenFlexSobrietyHcKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hc_price_summer, 5)} € = {calcPrice(result.breakdown.zenFlexSobrietyHcKwh, result.offer?.hc_price_summer)} €</div>
                                                  <div>HP: {result.breakdown.zenFlexSobrietyHpKwh?.toFixed(0)} kWh × {formatPrice(result.offer?.hp_price_summer, 5)} € = {calcPrice(result.breakdown.zenFlexSobrietyHpKwh, result.offer?.hp_price_summer)} €</div>
                                                </div>
                                              </div>
                                            )}

                                            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded border border-emerald-400 dark:border-emerald-600 font-mono text-xs font-bold">
                                              <span className="text-gray-600 dark:text-gray-400">Total énergie = </span>
                                              <span className="text-emerald-700 dark:text-emerald-300">{result.energyCost.toFixed(2)} €</span>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Section 3: Total */}
                                        <div className="space-y-2">
                                          <h5 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold">3</span>
                                            Total annuel
                                          </h5>
                                          <div className="ml-8 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <div className="p-3 bg-white dark:bg-gray-800 rounded border-2 border-blue-400 dark:border-blue-600 font-mono text-sm">
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-600 dark:text-gray-400">Abonnement</span>
                                                <span className="text-purple-600 dark:text-purple-400">{result.subscriptionCost.toFixed(2)} €</span>
                                              </div>
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-600 dark:text-gray-400">+ Énergie</span>
                                                <span className="text-emerald-600 dark:text-emerald-400">{result.energyCost.toFixed(2)} €</span>
                                              </div>
                                              <div className="border-t border-gray-300 dark:border-gray-600 mt-2 pt-2 flex items-center justify-between">
                                                <span className="font-bold text-gray-800 dark:text-gray-200">= TOTAL</span>
                                                <span className="font-bold text-xl text-blue-600 dark:text-blue-400">{result.totalCost.toFixed(2)} €/an</span>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {filteredAndSortedResults.length > 0 && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  📊 Consommation totale sur la période : <strong>{simulationResult[0].totalKwh.toFixed(2)} kWh</strong>
                </p>
                {filteredAndSortedResults.length > 1 && (
                  <p className="mt-1">
                    💡 {filterType !== 'all' || filterProvider !== 'all' || showOnlyRecent ? 'Parmi les offres affichées, l' : 'L'}'offre la moins chère vous permet d'économiser{' '}
                    <strong className="text-green-600 dark:text-green-400">
                      {(filteredAndSortedResults[filteredAndSortedResults.length - 1].totalCost - filteredAndSortedResults[0].totalCost).toFixed(2)} €
                    </strong>
                    {' '}par an par rapport à l'offre la plus chère{filterType !== 'all' || filterProvider !== 'all' || showOnlyRecent ? ' (affichée)' : ''}.
                  </p>
                )}
              </div>
            )}

            {/* No results message */}
            {filteredAndSortedResults.length === 0 && simulationResult.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Aucune offre ne correspond à vos critères de filtrage. Essayez de modifier les filtres ou de les réinitialiser.
                </p>
              </div>
            )}

            {/* Information banner - À propos de cette simulation */}
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                  <span className="text-xl">💡</span>
                </div>
                <div className="flex-1 text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-semibold mb-1">À propos de cette simulation</p>
                  <p className="text-blue-700 dark:text-blue-300 leading-relaxed">
                    Cette simulation est basée sur <strong>votre consommation réelle sur les {periodLabel}</strong> ({simulationStartDate} → {simulationEndDate}).
                    Certaines offres comme <strong>Tempo</strong> ou <strong>Zen Flex</strong> appliquent des tarifs majorés sur quelques jours spécifiques
                    (22 jours rouges pour Tempo, 20 jours de sobriété pour Zen Flex).
                  </p>
                  <p className="text-blue-600 dark:text-blue-400 mt-2 font-medium">
                    🎯 En réduisant simplement votre consommation ces quelques jours dans l'année, vous pouvez significativement diminuer votre facture avec ces offres.
                  </p>
                  <p className="text-blue-600 dark:text-blue-400 mt-2">
                    💬 Votre fournisseur n'est pas listé ? <a href="/contribute" className="font-semibold underline hover:text-blue-800 dark:hover:text-blue-200">Contribuez au simulateur</a> en demandant son ajout !
                  </p>
                </div>
              </div>
            </div>
            </div>
            </>
          )}
        </div>
      </AnimatedSection>

      {/* Information Block - Collapsible */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
        {/* Collapsible Header */}
        <div
          className="flex items-center justify-between p-6 cursor-pointer"
          onClick={() => setIsInfoSectionExpanded(!isInfoSectionExpanded)}
        >
          <div className="flex items-center gap-2">
            <Info className="text-primary-600 dark:text-primary-400" size={20} />
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

        {/* Collapsible Content */}
        {isInfoSectionExpanded && (
          <div className="px-6 pb-6 space-y-4">
            {/* Cache Warning */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠️ Cache automatique :</strong> Vos données de consommation sont mises en cache pour améliorer les performances. Le cache expire après 24 heures.
              </p>
            </div>

            {/* Features Block - Period + Export */}
            <div className="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                <p className="font-semibold text-gray-800 dark:text-gray-200">🛠️ Fonctionnalités</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="font-medium mb-1">📅 Choix de la période</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2 text-gray-600 dark:text-gray-400">
                      <li><strong>Année glissante</strong> : 365 derniers jours</li>
                      <li><strong>Année civile</strong> : année complète</li>
                      <li><strong>Personnalisée</strong> : dates au choix</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">📄 Export et détails</p>
                    <ul className="list-disc list-inside space-y-0.5 ml-2 text-gray-600 dark:text-gray-400">
                      <li><strong>PDF global</strong> : comparatif complet</li>
                      <li><strong>PDF par offre</strong> : détail des calculs</li>
                      <li><strong>Formules</strong> : section "Comprendre les calculs"</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* How it works Block */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-3">
                <p className="font-semibold">ℹ️ Comment ça marche</p>
                <div className="space-y-2 text-blue-700 dark:text-blue-300">
                  <p>
                    <strong>🔍 Comparaison :</strong> Toutes les offres correspondant à votre puissance souscrite
                    {(() => {
                      const selectedPdlData = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
                      const subscribedPower = selectedPdlData?.subscribed_power
                      return subscribedPower ? (
                        <> (<strong>{subscribedPower} kVA</strong>)</>
                      ) : null
                    })()} sont automatiquement simulées.
                  </p>
                  <p>
                    <strong>📊 Source :</strong> Données via API Enedis Data Connect (historique jusqu'à 3 ans, disponible en J-1).
                  </p>
                  <p>
                    <strong>💰 Tarifs :</strong> Base MyElectricalData mise à jour régulièrement. Calculs HC/HP selon vos plages horaires. Offres spéciales (Tempo, Zen Flex) : détection automatique.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
