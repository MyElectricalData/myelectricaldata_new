import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Euro, BarChart3, Database, ArrowRight, AlertCircle, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { pdlApi } from '@/api/pdl'
import { energyApi } from '@/api/energy'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { LoadingPlaceholder } from '@/components/LoadingPlaceholder'
import { AnimatedSection } from '@/components/AnimatedSection'
import { useIsDemo } from '@/hooks/useIsDemo'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'
import { logger } from '@/utils/logger'
import OfferSelector from '@/components/OfferSelector'
import type { PDL } from '@/types/api'

// Import hooks and components
import { useConsumptionEuroCalcs } from './hooks/useConsumptionEuroCalcs'
import { EuroCostCards } from './components/EuroCostCards'
import { EuroYearlyChart } from './components/EuroYearlyChart'
import { EuroMonthlyBreakdown } from './components/EuroMonthlyBreakdown'
import { OfferPricingCard } from './components/OfferPricingCard'
import { InfoBlock } from './components/InfoBlock'
import type { SelectedOfferWithProvider } from './types/euro.types'

export default function ConsumptionEuro() {
  const { selectedPdl: selectedPDL } = usePdlStore()
  const { setIsLoading } = useDataFetchStore()
  const queryClient = useQueryClient()
  const isDemo = useIsDemo()
  const demoAutoFetchDone = useRef(false)
  const lastAutoFetchPDL = useRef<string | null>(null)

  // States
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null)
  const [isStatsSectionExpanded, setIsStatsSectionExpanded] = useState(true)
  const [isChartSectionExpanded, setIsChartSectionExpanded] = useState(true)
  const [isBreakdownSectionExpanded, setIsBreakdownSectionExpanded] = useState(true)
  const [isInfoExpanded, setIsInfoExpanded] = useState(false)
  const [hcHpCalculationTrigger, setHcHpCalculationTrigger] = useState(0)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isInitialLoadingFromCache, setIsInitialLoadingFromCache] = useState(false)
  const [isLoadingExiting, setIsLoadingExiting] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [hasDataInCache, setHasDataInCache] = useState(false)
  const [comparisonOfferId, setComparisonOfferId] = useState<string | null>(null)

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

  // End initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 100)
    return () => clearTimeout(timer)
  }, [selectedPDL])

  // Fetch PDLs - with short staleTime to ensure provider changes are reflected
  const { data: pdlsData } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
    staleTime: 30 * 1000, // 30 seconds - same as Dashboard for consistency
  })

  const pdls = Array.isArray(pdlsData) ? pdlsData : []
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // Hook for demo auto-fetch - uses the same unified fetch as the header
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL,
    selectedPDLDetails,
    allPDLs: pdls,
    pageContext: 'consumption',
  })

  // Fetch providers
  const { data: providersResponse } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: energyApi.getProviders,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch all offers
  const { data: offersResponse, isLoading: isLoadingOffers } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: () => energyApi.getOffers(),
    staleTime: 5 * 60 * 1000,
  })

  const providers = useMemo(() => providersResponse?.data || [], [providersResponse?.data])
  const allOffers = useMemo(() => offersResponse?.data || [], [offersResponse?.data])

  // Get selected offer with provider name
  const selectedOfferWithProvider = useMemo((): SelectedOfferWithProvider | null => {
    if (!selectedPDLDetails?.selected_offer_id) return null

    const offer = allOffers.find(o => o.id === selectedPDLDetails.selected_offer_id)
    if (!offer) return null

    const provider = providers.find(p => p.id === offer.provider_id)

    return {
      ...offer,
      providerName: provider?.name || 'Fournisseur inconnu'
    }
  }, [selectedPDLDetails?.selected_offer_id, allOffers, providers])

  // Get comparison offer (for display only, doesn't change PDL's main offer)
  const comparisonOfferWithProvider = useMemo((): SelectedOfferWithProvider | null => {
    if (!comparisonOfferId) return null

    const offer = allOffers.find(o => o.id === comparisonOfferId)
    if (!offer) return null

    const provider = providers.find(p => p.id === offer.provider_id)

    return {
      ...offer,
      providerName: provider?.name || 'Fournisseur inconnu'
    }
  }, [comparisonOfferId, allOffers, providers])

  // The offer used for calculations (comparison if selected, otherwise the PDL's main offer)
  const displayOffer = comparisonOfferWithProvider || selectedOfferWithProvider

  // Filter compatible offers for comparison (same power_kva as selected offer)
  const compatibleOffers = useMemo(() => {
    if (!selectedOfferWithProvider?.power_kva) return allOffers
    return allOffers.filter(o => o.power_kva === selectedOfferWithProvider.power_kva)
  }, [allOffers, selectedOfferWithProvider?.power_kva])

  // Check for cached detail data
  // Type for cache data
  interface CacheData {
    data?: {
      meter_reading?: {
        interval_reading?: Array<{ date: string; value: string | number }>
      }
    }
  }

  useEffect(() => {
    if (!selectedPDL) {
      setHasDataInCache(false)
      return
    }

    const detailQuery = queryClient.getQueryCache().find({
      queryKey: ['consumptionDetail', selectedPDL],
    })

    if (detailQuery?.state.data) {
      const data = detailQuery.state.data as CacheData
      const readings = data?.data?.meter_reading?.interval_reading
      if (readings && readings.length > 0) {
        setHasDataInCache(true)
        return
      }
    }

    setHasDataInCache(false)
  }, [selectedPDL, queryClient])

  // Auto-load dateRange from cache
  useEffect(() => {
    if (!dateRange && selectedPDL && hasDataInCache) {
      setIsInitialLoadingFromCache(true)

      const now = new Date()
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0)
      const startDate_obj = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() - 1094, 12, 0, 0, 0)

      const startDate = startDate_obj.getFullYear() + '-' +
        String(startDate_obj.getMonth() + 1).padStart(2, '0') + '-' +
        String(startDate_obj.getDate()).padStart(2, '0')
      const endDate = yesterday.getFullYear() + '-' +
        String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
        String(yesterday.getDate()).padStart(2, '0')

      setDateRange({ start: startDate, end: endDate })

      setTimeout(() => {
        setHcHpCalculationTrigger(prev => prev + 1)
        setIsLoadingExiting(true)
        setTimeout(() => {
          setIsInitialLoadingFromCache(false)
          setIsLoadingExiting(false)
        }, 300)
      }, 500)
    }
  }, [selectedPDL, hasDataInCache, dateRange])

  // Expand info block when no data, collapse when data is available
  useEffect(() => {
    setIsInfoExpanded(!hasDataInCache)
  }, [hasDataInCache])

  // Poll for cache updates
  useEffect(() => {
    let pollCount = 0
    const maxPolls = 10

    const interval = setInterval(() => {
      pollCount++

      const detailQuery = queryClient.getQueryCache().find({
        queryKey: ['consumptionDetail', selectedPDL],
      })

      if (detailQuery?.state.data) {
        const data = detailQuery.state.data as CacheData
        const readings = data?.data?.meter_reading?.interval_reading
        if (readings && readings.length > 0) {
          setHasDataInCache(true)
          clearInterval(interval)
          return
        }
      }

      if (pollCount >= maxPolls) {
        clearInterval(interval)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [selectedPDL, queryClient])

  // Auto-fetch data for demo account
  useEffect(() => {
    // Reset demoAutoFetchDone when PDL changes
    if (selectedPDL && selectedPDL !== lastAutoFetchPDL.current) {
      demoAutoFetchDone.current = false
    }

    if (isDemo && selectedPDL && selectedPDLDetails && !demoAutoFetchDone.current && !hasDataInCache && !isInitializing) {
      logger.log('[DEMO] Auto-fetching consumption data for ConsumptionEuro')
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
  }, [isDemo, selectedPDL, selectedPDLDetails, hasDataInCache, isInitializing, setIsLoading, fetchAllData])

  // Use euro calculation hook - uses displayOffer for comparison feature
  const { yearlyCosts } = useConsumptionEuroCalcs({
    selectedPDL,
    selectedPDLDetails,
    selectedOffer: displayOffer,
    hcHpCalculationTrigger
  })

  const hasOffer = !!selectedOfferWithProvider
  const hasCostData = yearlyCosts.length > 0

  // Mutation to update selected offer
  const updateSelectedOfferMutation = useMutation({
    mutationFn: (selected_offer_id: string | null) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      if (!selectedPDLDetails) {
        return Promise.reject(new Error('Aucun PDL sélectionné'))
      }
      return pdlApi.updateSelectedOffer(selectedPDLDetails.id, selected_offer_id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      toast.success('Offre tarifaire mise à jour')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour de l\'offre')
    },
  })

  // Block rendering during initialization
  if (isInitializing) {
    return <div className="w-full" />
  }

  // Show loading overlay
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
      {/* Offer selector when no offer selected */}
      {!hasOffer && hasDataInCache && (
        <div className="mb-6 p-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <Tag className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Sélectionnez votre offre tarifaire
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pour calculer vos coûts en euros, choisissez votre offre d'électricité actuelle.
              </p>
            </div>
          </div>
          <OfferSelector
            selectedOfferId={selectedPDLDetails?.selected_offer_id || null}
            subscribedPower={selectedPDLDetails?.subscribed_power}
            onChange={(offerId) => {
              updateSelectedOfferMutation.mutate(offerId)
            }}
            disabled={updateSelectedOfferMutation.isPending || isDemo}
          />
          {isDemo && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic">
              La sélection d'offre est désactivée en mode démo.
            </p>
          )}
        </div>
      )}

      {/* Empty State - No data loaded */}
      {!hasDataInCache && (
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-6">
              <Database className="w-10 h-10 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Aucune donnée de consommation
            </h3>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mb-6">
              Pour calculer vos coûts en euros, vous devez d'abord récupérer vos données de consommation
              détaillées en cliquant sur le bouton
              <span className="font-semibold text-primary-600 dark:text-primary-400"> Récupérer </span>
              en haut à droite de la page.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Récupérez les données</span>
              <ArrowRight className="w-4 h-4" />
              <span>Sélectionnez une offre</span>
              <ArrowRight className="w-4 h-4" />
              <span>Visualisez vos coûts</span>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Section */}
      <AnimatedSection isVisible={hasDataInCache && hasOffer} delay={0}>
        <div className="rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className={`flex items-center justify-between p-6 ${
              hasCostData ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
            }`}
            onClick={() => {
              if (hasCostData) {
                setIsStatsSectionExpanded(!isStatsSectionExpanded)
              }
            }}
          >
            <div className="flex items-center gap-2">
              <Euro className="text-emerald-500 dark:text-emerald-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Statistiques de coûts
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

          {isStatsSectionExpanded && hasCostData && (
            <div className="px-6 pb-6">
              <EuroCostCards
                yearlyCosts={yearlyCosts}
                selectedOffer={displayOffer}
                isLoading={isLoadingOffers}
              />
            </div>
          )}

          {isStatsSectionExpanded && !hasCostData && hasOffer && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400">
                <AlertCircle size={20} className="mr-2" />
                <span>Calcul des coûts en cours... Les données détaillées sont nécessaires.</span>
              </div>
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Current offer info with pricing details - now below statistics with comparison selector */}
      {hasDataInCache && hasOffer && displayOffer && (
        <AnimatedSection isVisible={true} delay={50}>
          <div className="mt-6 relative z-20">
            <OfferPricingCard
              selectedOffer={displayOffer}
              isComparison={!!comparisonOfferId}
              originalOffer={selectedOfferWithProvider}
              compatibleOffers={compatibleOffers}
              providers={providers}
              onComparisonChange={setComparisonOfferId}
              comparisonOfferId={comparisonOfferId}
            />
          </div>
        </AnimatedSection>
      )}

      {/* Charts Section */}
      <AnimatedSection isVisible={hasDataInCache && hasOffer && hasCostData} delay={100}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200 relative z-10">
          <div
            className="flex items-center justify-between p-6 cursor-pointer"
            onClick={() => setIsChartSectionExpanded(!isChartSectionExpanded)}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Graphiques de coûts mensuels
              </h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isChartSectionExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isChartSectionExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isChartSectionExpanded && (
            <div className="px-6 pb-6">
              <EuroYearlyChart
                yearlyCosts={yearlyCosts}
                isDarkMode={isDarkMode}
              />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Monthly Breakdown Section */}
      <AnimatedSection isVisible={hasDataInCache && hasOffer && hasCostData} delay={200}>
        <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
          <div
            className="flex items-center justify-between p-6 cursor-pointer"
            onClick={() => setIsBreakdownSectionExpanded(!isBreakdownSectionExpanded)}
          >
            <div className="flex items-center gap-2">
              <Euro className="text-primary-600 dark:text-primary-400" size={20} />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Détail et comparaison
              </h2>
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              {isBreakdownSectionExpanded ? (
                <span className="text-sm">Réduire</span>
              ) : (
                <span className="text-sm">Développer</span>
              )}
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${
                  isBreakdownSectionExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {isBreakdownSectionExpanded && (
            <div className="px-6 pb-6">
              <EuroMonthlyBreakdown
                yearlyCosts={yearlyCosts}
                isDarkMode={isDarkMode}
              />
            </div>
          )}
        </div>
      </AnimatedSection>

      {/* Info block - Always visible like in Consumption kWh page */}
      <InfoBlock
        isExpanded={isInfoExpanded}
        onToggle={() => setIsInfoExpanded(!isInfoExpanded)}
      />
    </div>
  )
}
