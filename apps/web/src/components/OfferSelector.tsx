import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Zap, Tag, X } from 'lucide-react'
import { energyApi, EnergyOffer } from '@/api/energy'

interface OfferSelectorProps {
  selectedOfferId: string | null | undefined
  subscribedPower: number | null | undefined
  onChange: (offerId: string | null) => void
  disabled?: boolean
  className?: string
}

// Mapping from offer_type to French label
const OFFER_TYPE_LABELS: Record<string, string> = {
  'BASE': 'Base',
  'HC_HP': 'Heures Creuses',
  'TEMPO': 'Tempo',
  'EJP': 'EJP',
  'WEEKEND': 'Nuit & Week-end',
  'SEASONAL': 'Saisonnier',
}

export default function OfferSelector({
  selectedOfferId,
  subscribedPower,
  onChange,
  disabled = false,
  className = '',
}: OfferSelectorProps) {
  // Local state for cascading selectors
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedOfferType, setSelectedOfferType] = useState<string | null>(null)

  // Fetch providers
  const { data: providersResponse, isLoading: isLoadingProviders } = useQuery({
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

  // Stabilize providers and offers arrays
  const providers = useMemo(() => providersResponse?.data || [], [providersResponse?.data])
  const allOffers = useMemo(() => offersResponse?.data || [], [offersResponse?.data])

  // Filter offers by subscribed power
  const filteredOffers = useMemo(() => {
    if (!subscribedPower) {
      return allOffers.filter(o => o.is_active !== false)
    }
    return allOffers.filter(offer => {
      if (offer.is_active === false) return false
      if (offer.power_kva && offer.power_kva !== subscribedPower) return false
      return true
    })
  }, [allOffers, subscribedPower])

  // Get providers that have offers (after power filtering)
  const availableProviders = useMemo(() => {
    const providerIds = new Set(filteredOffers.map(o => o.provider_id))
    return providers
      .filter(p => providerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredOffers, providers])

  // Get offer types available for selected provider
  const availableOfferTypes = useMemo(() => {
    if (!selectedProviderId) return []
    const types = new Set(
      filteredOffers
        .filter(o => o.provider_id === selectedProviderId)
        .map(o => o.offer_type)
    )
    return Array.from(types).sort()
  }, [filteredOffers, selectedProviderId])

  // Get offers for selected provider and offer type
  const availableOffers = useMemo(() => {
    if (!selectedProviderId || !selectedOfferType) return []
    return filteredOffers
      .filter(o => o.provider_id === selectedProviderId && o.offer_type === selectedOfferType)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredOffers, selectedProviderId, selectedOfferType])

  // Find selected offer details
  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null
    return allOffers.find(o => o.id === selectedOfferId) || null
  }, [selectedOfferId, allOffers])

  // Initialize selectors from selected offer
  useEffect(() => {
    if (selectedOffer) {
      setSelectedProviderId(selectedOffer.provider_id)
      setSelectedOfferType(selectedOffer.offer_type)
    }
  }, [selectedOffer])

  // Reset offer type when provider changes
  const handleProviderChange = (providerId: string | null) => {
    setSelectedProviderId(providerId)
    setSelectedOfferType(null)
    // Don't clear the selected offer yet - let user pick new one
  }

  // Reset offer when type changes
  const handleOfferTypeChange = (offerType: string | null) => {
    setSelectedOfferType(offerType)
    // Don't clear the selected offer yet - let user pick new one
  }

  // Handle offer selection
  const handleOfferChange = (offerId: string | null) => {
    onChange(offerId)
  }

  // Clear all selections
  const handleClear = () => {
    setSelectedProviderId(null)
    setSelectedOfferType(null)
    onChange(null)
  }

  const isLoading = isLoadingProviders || isLoadingOffers

  // Format price for display
  const formatPrice = (price: number | string | undefined | null): string => {
    if (price === undefined || price === null) return '-'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(numPrice)) return '-'
    return `${(numPrice * 100).toFixed(2)} c/kWh`
  }

  // Format subscription price
  const formatSubscription = (price: number | string | undefined | null): string => {
    if (price === undefined || price === null) return '-'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(numPrice)) return '-'
    return `${numPrice.toFixed(2)} €/mois`
  }

  // Get main price to display
  const getMainPrice = (offer: EnergyOffer): string => {
    if (offer.base_price !== undefined && offer.base_price !== null) {
      return formatPrice(offer.base_price)
    }
    if (offer.hp_price !== undefined && offer.hp_price !== null) {
      return `HP: ${formatPrice(offer.hp_price)}`
    }
    return '-'
  }

  const selectClassName = `
    w-full px-3 py-2 text-sm
    bg-white dark:bg-gray-800
    border-2 border-blue-300 dark:border-blue-700
    rounded-lg text-gray-900 dark:text-gray-100
    focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
    focus:border-blue-500 dark:focus:border-blue-400
    transition-all shadow-sm hover:shadow
    disabled:opacity-50 disabled:cursor-not-allowed
    cursor-pointer
  `

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Row 1: Provider and Offer Type side by side */}
      <div className="grid grid-cols-2 gap-3">
        {/* Provider Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Building2 size={12} />
            Fournisseur
          </label>
          <select
            value={selectedProviderId || ''}
            onChange={(e) => handleProviderChange(e.target.value || null)}
            disabled={disabled || isLoading}
            className={selectClassName}
          >
            <option value="">Sélectionner...</option>
            {availableProviders.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        {/* Offer Type Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Zap size={12} />
            Type d'offre
          </label>
          <select
            value={selectedOfferType || ''}
            onChange={(e) => handleOfferTypeChange(e.target.value || null)}
            disabled={disabled || isLoading || !selectedProviderId}
            className={selectClassName}
          >
            <option value="">Sélectionner...</option>
            {availableOfferTypes.map(type => (
              <option key={type} value={type}>
                {OFFER_TYPE_LABELS[type] || type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Offer Selector */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          <Tag size={12} />
          Offre
        </label>
        <select
          value={selectedOfferId || ''}
          onChange={(e) => handleOfferChange(e.target.value || null)}
          disabled={disabled || isLoading || !selectedProviderId || !selectedOfferType}
          className={selectClassName}
        >
          <option value="">Sélectionner une offre...</option>
          {availableOffers.map(offer => (
            <option key={offer.id} value={offer.id}>
              {offer.name} - {getMainPrice(offer)} - {formatSubscription(offer.subscription_price)}
              {offer.power_kva ? ` (${offer.power_kva} kVA)` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Selected offer summary */}
      {selectedOffer && (
        <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-blue-900 dark:text-blue-100 truncate">
                {providers.find(p => p.id === selectedOffer.provider_id)?.name}
              </span>
              <span className="text-blue-400">-</span>
              <span className="text-blue-700 dark:text-blue-300 truncate">
                {selectedOffer.name}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm">
              <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">
                {OFFER_TYPE_LABELS[selectedOffer.offer_type] || selectedOffer.offer_type}
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {getMainPrice(selectedOffer)}
              </span>
              <span className="text-blue-500 dark:text-blue-400">
                {formatSubscription(selectedOffer.subscription_price)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="p-1.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg transition-colors"
            title="Effacer la sélection"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Help text when no offer selected */}
      {!selectedOffer && !isLoading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sélectionnez un fournisseur, puis un type d'offre pour voir les offres disponibles
          {subscribedPower && ` pour ${subscribedPower} kVA`}.
        </p>
      )}
    </div>
  )
}
