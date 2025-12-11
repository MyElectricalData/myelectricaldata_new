import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Calculator, AlertCircle, Loader2, ChevronDown, ChevronUp, FileDown, ArrowUpDown, ArrowUp, ArrowDown, Filter, Info, ArrowRight, ExternalLink } from 'lucide-react'
import { useQuery, useQueryClient, useIsRestoring } from '@tanstack/react-query'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { AnimatedSection } from '@/components/AnimatedSection'
import { pdlApi } from '@/api/pdl'
import { energyApi, type EnergyProvider, type EnergyOffer } from '@/api/energy'
import { tempoApi, type TempoDay } from '@/api/tempo'
import type { PDL } from '@/types/api'
import jsPDF from 'jspdf'
import { logger } from '@/utils/logger'
import { ModernButton } from './Simulator/components/ModernButton'
import { useIsDemo } from '@/hooks/useIsDemo'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'

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
function isOffpeakHour(hour: number, offpeakConfig?: Record<string, string> | string[]): boolean {
  if (!offpeakConfig) {
    // Default: 22h-6h if no config
    return hour >= 22 || hour < 6
  }

  // Parse offpeak hours from config
  // Format can be: {"default": "22h30-06h30"} or {"HC": "22:00-06:00"} or "HC (22H00-6H00)" or array of strings
  const values = Array.isArray(offpeakConfig) ? offpeakConfig : Object.values(offpeakConfig)
  for (const range of values) {
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

  // Fetch user's PDLs - with short staleTime to ensure provider changes are reflected
  const { data: pdlsData, isLoading: pdlsLoading, error: pdlsError } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      logger.log('[Simulator] PDL API response:', response)
      logger.log('[Simulator] response.data type:', typeof response.data, 'isArray:', Array.isArray(response.data))
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      logger.warn('[Simulator] Returning empty array, response was:', response)
      return []
    },
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

  // Selected PDL from global store
  const { selectedPdl, setSelectedPdl } = usePdlStore()

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

  // Clear simulation result when PDL changes
  useEffect(() => {
    setSimulationResult(null)
    setSimulationError(null)
    setHasAutoLaunched(false)
    setIsInitialLoadingFromCache(false)
    setIsLoadingExiting(false)
    setIsInfoSectionExpanded(true)
    setIsInitializing(true)
  }, [selectedPdl])

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
    setSimulationResult(null)
    setFetchProgress({current: 0, total: 0, phase: ''})
    setSimulationError(null)

    try {
      // Get selected PDL configuration
      const pdl = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
      logger.log('Selected PDL:', pdl)
      logger.log('Offpeak hours config:', pdl?.offpeak_hours)
      // Récupérer les consommations horaires des 12 derniers mois (année glissante)
      // La date de fin doit être antérieure à la date actuelle selon Enedis
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      // Année glissante : de aujourd'hui - 365 jours jusqu'à hier
      const yearStart = new Date(today)
      yearStart.setDate(yearStart.getDate() - 365)
      const startDate = yearStart.toISOString().split('T')[0]
      const endDate = yesterday.toISOString().split('T')[0]

      setFetchProgress({ current: 0, total: 1, phase: 'Chargement des données depuis le cache (année glissante)...' })

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
  }, [selectedPdl, pdlsData, offersData, providersData, cachedConsumptionData])

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

    // Simulate each offer
    const results = offers.map((offer) => {
      const provider = providers.find((p) => p.id === offer.provider_id)
      const subscriptionCostYear = offer.subscription_price * 12

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
        let weekdayCost = (hcKwh * offer.hc_price) + (hpKwh * offer.hp_price)
        let weekendCost = 0

        if (hasWeekendPricing) {
          weekendCost = (hcWeekendKwh * (offer.hc_price_weekend || offer.hc_price)) +
                        (hpWeekendKwh * (offer.hp_price_weekend || offer.hp_price))
        }

        energyCost = weekdayCost + weekendCost

        logger.log(`HC/HP result for ${offer.name}:`, {
          weekday: {
            hcKwh: hcKwh.toFixed(2),
            hpKwh: hpKwh.toFixed(2),
            cost: weekdayCost.toFixed(2)
          },
          ...(hasWeekendPricing && {
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
        let colorStats = { BLUE: 0, WHITE: 0, RED: 0, UNKNOWN: 0 }

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
            Aucun PDL disponible.{' '}
            <a href="/dashboard" className="text-primary-600 dark:text-primary-400 hover:underline">
              Veuillez ajouter un point de livraison depuis votre tableau de bord.
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
    infoY += 10

    // Top 10 offers table (compact)
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Top 10 des meilleures offres', margin, infoY)
    infoY += 6

    // Table headers
    pdf.setFontSize(7)
    pdf.text('Rang', margin, infoY)
    pdf.text('Fournisseur', margin + 12, infoY)
    pdf.text('Offre', margin + 45, infoY)
    pdf.text('Type', margin + 95, infoY)
    pdf.text('Abo/an', margin + 115, infoY)
    pdf.text('Énergie/an', margin + 135, infoY)
    pdf.text('Total/an', margin + 160, infoY)
    infoY += 4

    // Table content
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.5)

    simulationResult.slice(0, 10).forEach((result: any, index: number) => {
      if (infoY > pageHeight - 25) {
        addFooter()
        pdf.addPage()
        currentPage++
        infoY = 20
      }

      if (index === 0) {
        pdf.setFont('helvetica', 'bold')
      }

      pdf.text(`${index + 1}${index === 0 ? ' 🏆' : ''}`, margin, infoY)
      pdf.text(result.providerName.substring(0, 16), margin + 12, infoY)
      pdf.text(result.offerName.substring(0, 28), margin + 45, infoY)
      pdf.text(getTypeLabel(result.offerType).substring(0, 10), margin + 95, infoY)
      pdf.text(`${result.subscriptionCost.toFixed(0)} €`, margin + 115, infoY)
      pdf.text(`${result.energyCost.toFixed(0)} €`, margin + 135, infoY)
      pdf.text(`${result.totalCost.toFixed(2)} €`, margin + 160, infoY)

      if (index === 0) {
        pdf.setFont('helvetica', 'normal')
      }

      infoY += 4
    })

    addFooter()

    // ===== PAGE 2+: DETAILED BREAKDOWN FOR TOP 10 =====
    simulationResult.slice(0, 10).forEach((result: any, index: number) => {
      pdf.addPage()
      currentPage++
      let detailY = 20

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
      pdf.setFillColor(240, 240, 240)
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

      pdf.text(`Abonnement: ${result.offer?.subscription_price?.toFixed(2)} € / mois`, margin + 3, detailY)
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
          pdf.text(`Prix Base (semaine): ${result.offer.base_price?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
          pdf.text(`Prix Base (week-end): ${result.offer.base_price_weekend?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        } else {
          pdf.text(`Prix Base: ${result.offer?.base_price?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') {
        pdf.text(`Prix Heures Creuses: ${result.offer?.hc_price?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`Prix Heures Pleines: ${result.offer?.hp_price?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        if (result.offer?.hc_price_weekend) {
          pdf.text(`Prix HC Week-end: ${result.offer.hc_price_weekend?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
        if (result.offer?.hp_price_weekend) {
          pdf.text(`Prix HP Week-end: ${result.offer.hp_price_weekend?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'SEASONAL') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Hiver (nov-mars):', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${result.offer?.hc_price_winter?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${result.offer?.hp_price_winter?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Été (avr-oct):', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${result.offer?.hc_price_summer?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${result.offer?.hp_price_summer?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        if (result.offer?.peak_day_price) {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours de pointe:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  ${result.offer.peak_day_price?.toFixed(5)} € / kWh`, margin + 3, detailY)
          detailY += 5
        }
      } else if (result.offerType === 'TEMPO') {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Bleus:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${result.offer?.tempo_blue_hc?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${result.offer?.tempo_blue_hp?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Blancs:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${result.offer?.tempo_white_hc?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${result.offer?.tempo_white_hp?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Jours Rouges:', margin + 3, detailY)
        pdf.setFont('helvetica', 'normal')
        detailY += 5
        pdf.text(`  HC: ${result.offer?.tempo_red_hc?.toFixed(5)} € / kWh`, margin + 3, detailY)
        detailY += 5
        pdf.text(`  HP: ${result.offer?.tempo_red_hp?.toFixed(5)} € / kWh`, margin + 3, detailY)
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
            pdf.text(`Semaine: ${result.breakdown.baseWeekdayKwh?.toFixed(0)} kWh × ${result.offer.base_price?.toFixed(5)} € = ${(result.breakdown.baseWeekdayKwh * result.offer.base_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`Week-end: ${result.breakdown.baseWeekendKwh?.toFixed(0)} kWh × ${result.offer.base_price_weekend?.toFixed(5)} € = ${(result.breakdown.baseWeekendKwh * result.offer.base_price_weekend).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          } else {
            pdf.text(`Total: ${result.totalKwh?.toFixed(0)} kWh × ${result.offer.base_price?.toFixed(5)} € = ${result.energyCost.toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'HC_HP' || result.offerType === 'WEEKEND' || result.offerType === 'HC_NUIT_WEEKEND' || result.offerType === 'HC_WEEKEND') {
          if (result.breakdown.hcWeekendKwh > 0) {
            pdf.setFont('helvetica', 'bold')
            pdf.text('Semaine:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            pdf.text(`  HC: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${result.offer.hc_price?.toFixed(5)} € = ${(result.breakdown.hcKwh * result.offer.hc_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`  HP: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${result.offer.hp_price?.toFixed(5)} € = ${(result.breakdown.hpKwh * result.offer.hp_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
            pdf.setFont('helvetica', 'bold')
            pdf.text('Week-end:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            pdf.text(`  ${result.breakdown.hcWeekendKwh?.toFixed(0)} kWh × ${(result.offer.hc_price_weekend || result.offer.hc_price)?.toFixed(5)} € = ${(result.breakdown.hcWeekendKwh * (result.offer.hc_price_weekend || result.offer.hc_price)).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          } else {
            pdf.text(`HC: ${result.breakdown.hcKwh?.toFixed(0)} kWh × ${result.offer.hc_price?.toFixed(5)} € = ${(result.breakdown.hcKwh * result.offer.hc_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
            pdf.text(`HP: ${result.breakdown.hpKwh?.toFixed(0)} kWh × ${result.offer.hp_price?.toFixed(5)} € = ${(result.breakdown.hpKwh * result.offer.hp_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'SEASONAL') {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Hiver:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.hcWinterKwh?.toFixed(0)} kWh × ${result.offer.hc_price_winter?.toFixed(5)} € = ${(result.breakdown.hcWinterKwh * result.offer.hc_price_winter).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.hpWinterKwh?.toFixed(0)} kWh × ${result.offer.hp_price_winter?.toFixed(5)} € = ${(result.breakdown.hpWinterKwh * result.offer.hp_price_winter).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Été:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.hcSummerKwh?.toFixed(0)} kWh × ${result.offer.hc_price_summer?.toFixed(5)} € = ${(result.breakdown.hcSummerKwh * result.offer.hc_price_summer).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.hpSummerKwh?.toFixed(0)} kWh × ${result.offer.hp_price_summer?.toFixed(5)} € = ${(result.breakdown.hpSummerKwh * result.offer.hp_price_summer).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          if (result.breakdown.peakDayKwh > 0) {
            pdf.setFont('helvetica', 'bold')
            pdf.text('Jours de pointe:', margin + 3, detailY)
            pdf.setFont('helvetica', 'normal')
            detailY += 5
            pdf.text(`  ${result.breakdown.peakDayKwh?.toFixed(0)} kWh × ${result.offer.peak_day_price?.toFixed(5)} € = ${(result.breakdown.peakDayKwh * result.offer.peak_day_price).toFixed(2)} €`, margin + 3, detailY)
            detailY += 5
          }
        } else if (result.offerType === 'TEMPO') {
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Bleus:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.blueHcKwh?.toFixed(0)} kWh × ${result.offer.tempo_blue_hc?.toFixed(5)} € = ${(result.breakdown.blueHcKwh * result.offer.tempo_blue_hc).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.blueHpKwh?.toFixed(0)} kWh × ${result.offer.tempo_blue_hp?.toFixed(5)} € = ${(result.breakdown.blueHpKwh * result.offer.tempo_blue_hp).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Blancs:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.whiteHcKwh?.toFixed(0)} kWh × ${result.offer.tempo_white_hc?.toFixed(5)} € = ${(result.breakdown.whiteHcKwh * result.offer.tempo_white_hc).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.whiteHpKwh?.toFixed(0)} kWh × ${result.offer.tempo_white_hp?.toFixed(5)} € = ${(result.breakdown.whiteHpKwh * result.offer.tempo_white_hp).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.setFont('helvetica', 'bold')
          pdf.text('Jours Rouges:', margin + 3, detailY)
          pdf.setFont('helvetica', 'normal')
          detailY += 5
          pdf.text(`  HC: ${result.breakdown.redHcKwh?.toFixed(0)} kWh × ${result.offer.tempo_red_hc?.toFixed(5)} € = ${(result.breakdown.redHcKwh * result.offer.tempo_red_hc).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
          pdf.text(`  HP: ${result.breakdown.redHpKwh?.toFixed(0)} kWh × ${result.offer.tempo_red_hp?.toFixed(5)} € = ${(result.breakdown.redHpKwh * result.offer.tempo_red_hp).toFixed(2)} €`, margin + 3, detailY)
          detailY += 5
        }
      }

      addFooter()
    })

    // Save PDF
    const fileName = `comparatif-offres-${currentPdl?.usage_point_id || 'export'}-${new Date().toISOString().split('T')[0]}.pdf`
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
              <span>Sélectionnez un PDL</span>
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
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex items-center justify-between p-6">
            <div className="flex items-center gap-2">
              <Calculator className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0
                  ? `Comparaison des offres (${filteredAndSortedResults.length} résultat${filteredAndSortedResults.length > 1 ? 's' : ''})`
                  : 'Comparaison des offres'
                }
              </h2>
            </div>
            {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0 && (
              <ModernButton
                variant="gradient"
                size="sm"
                icon={FileDown}
                iconPosition="left"
                onClick={exportToPDF}
              >
                Exporter en PDF
              </ModernButton>
            )}
          </div>

          {simulationResult && Array.isArray(simulationResult) && simulationResult.length > 0 && (
            <>

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
                        <span>Abonnement/an</span>
                        {getSortIcon('subscription')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('energy')}
                      title="Cliquez pour trier"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Énergie/an</span>
                        {getSortIcon('energy')}
                      </div>
                    </th>
                    <th
                      className="p-3 text-right font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors select-none"
                      onClick={() => handleSort('total')}
                      title="Cliquez pour trier"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Total annuel</span>
                        {getSortIcon('total')}
                      </div>
                    </th>
                    <th className="p-3 text-right font-semibold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedResults.map((result, index) => {
                    const isExpanded = expandedRows.has(result.offerId)
                    // Calculate difference from first offer (best offer)
                    const firstResult = filteredAndSortedResults[0]
                    const costDifferenceFromFirst = index > 0 ? result.totalCost - firstResult.totalCost : 0
                    const percentDifferenceFromFirst = index > 0 ? ((result.totalCost - firstResult.totalCost) / firstResult.totalCost) * 100 : 0

                    // Calculate difference from previous offer
                    const previousResult = index > 0 ? filteredAndSortedResults[index - 1] : null
                    const costDifferenceFromPrevious = previousResult ? result.totalCost - previousResult.totalCost : 0
                    const percentDifferenceFromPrevious = previousResult ? ((result.totalCost - previousResult.totalCost) / previousResult.totalCost) * 100 : 0

                    return (
                      <React.Fragment key={result.offerId}>
                        <tr
                          onClick={() => toggleRowExpansion(result.offerId)}
                          className={`border-t border-gray-200 dark:border-gray-700 cursor-pointer transition-all duration-200 group ${
                            index === 0
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
                          </td>
                          <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-400">{result.subscriptionCost.toFixed(0)} €</td>
                          <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-400">{result.energyCost.toFixed(0)} €</td>
                          <td className="p-2 text-right">
                            <span className={`text-base font-bold ${index === 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                              {result.totalCost.toFixed(0)} €
                            </span>
                          </td>
                          <td className="p-2 text-right w-24">
                            {index === 0 ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Meilleur</span>
                            ) : (
                              <span className="text-sm text-red-500 dark:text-red-400 font-medium">
                                +{costDifferenceFromFirst.toFixed(0)} €
                              </span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${result.offerId}-details`} className={`border-t border-dashed border-gray-300 dark:border-gray-600 ${
                            index === 0
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
                                    <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                    <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                    <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                      <div className="flex justify-between pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total énergie</span>
                                        <span className="text-lg font-bold text-violet-600 dark:text-violet-400">{result.energyCost.toFixed(2)} €</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.breakdown && result.offerType === 'ZEN_FLEX' && result.offer && (
                                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gradient-to-r from-teal-500 to-emerald-600 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                    <div className="bg-gradient-to-r from-gray-600 to-gray-700 px-4 py-2">
                                      <h4 className="font-semibold text-sm text-white flex items-center gap-2">
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
                                    </div>
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
            {/* Cache Information */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>⚠️ Cache automatique :</strong> L'utilisation du simulateur active automatiquement le cache. Vos données de consommation seront stockées temporairement sur la passerelle pour améliorer les performances et éviter de solliciter excessivement l'API Enedis. Les données en cache expirent automatiquement après 24 heures.
              </p>
            </div>

            {/* Simulation Information */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>🔍 Comparaison automatique :</strong> La simulation comparera automatiquement <strong>toutes les offres disponibles</strong> dans la base de données
                {(() => {
                  const selectedPdlData = Array.isArray(pdlsData) ? pdlsData.find((p) => p.usage_point_id === selectedPdl) : undefined
                  const subscribedPower = selectedPdlData?.subscribed_power
                  return subscribedPower ? (
                    <> correspondant à votre puissance souscrite de <strong>{subscribedPower} kVA</strong></>
                  ) : null
                })()}.
              </p>
            </div>

            {/* Data Source Information */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                <p>
                  <strong>📊 Source des données :</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Les données sont récupérées depuis l'API <strong>Enedis Data Connect</strong></li>
                  <li>Endpoint utilisé : <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">consumption/daily</code> (relevés quotidiens)</li>
                  <li>Les données sont mises en cache pour optimiser les performances</li>
                  <li>Récupération automatique de <strong>1095 jours d'historique</strong> (limite maximale Enedis)</li>
                  <li>Les données Enedis ne sont disponibles qu'en <strong>J-1</strong> (hier)</li>
                </ul>
              </div>
            </div>

            {/* Tariff Information */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                <p>
                  <strong>💰 À propos des tarifs :</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Les tarifs sont issus de la base de données MyElectricalData</li>
                  <li>Les calculs HC/HP sont basés sur vos plages horaires configurées dans votre PDL</li>
                  <li>Pour les offres Enercoop spécifiques (Flexi Watt), les plages HC/HP sont détectées automatiquement</li>
                  <li>Les économies affichées sont calculées sur la base de votre consommation réelle sur 12 mois</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
