import React, { useState, useMemo, useEffect } from 'react'
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
  // States locaux pour les overrides manuels de l'utilisateur.
  // Quand l'utilisateur change un sélecteur, on stocke son choix ici.
  // Quand une offre est déjà sélectionnée (selectedOfferId), ces valeurs
  // sont ignorées au profit des valeurs dérivées de l'offre.
  const [userProviderId, setUserProviderId] = useState<string | null>(null)
  const [userOfferType, setUserOfferType] = useState<string | null>(null)

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

  // Find selected offer details
  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null
    return allOffers.find(o => o.id === selectedOfferId) || null
  }, [selectedOfferId, allOffers])

  // Valeurs effectives des sélecteurs : dérivées de l'offre sélectionnée
  // si elle existe, sinon des choix manuels de l'utilisateur.
  // Cela élimine le besoin d'un useEffect pour synchroniser les states.
  const effectiveProviderId = useMemo(() => {
    if (selectedOffer) return selectedOffer.provider_id
    return userProviderId
  }, [selectedOffer, userProviderId])

  const effectiveOfferType = useMemo(() => {
    if (selectedOffer) return selectedOffer.offer_type
    return userOfferType
  }, [selectedOffer, userOfferType])

  // Get providers that have offers (after power filtering)
  const availableProviders = useMemo(() => {
    const providerIds = new Set(filteredOffers.map(o => o.provider_id))
    return providers
      .filter(p => providerIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredOffers, providers])

  // Get offer types available for effective provider
  const availableOfferTypes = useMemo(() => {
    if (!effectiveProviderId) return []
    const types = new Set(
      filteredOffers
        .filter(o => o.provider_id === effectiveProviderId)
        .map(o => o.offer_type)
    )
    return Array.from(types).sort()
  }, [filteredOffers, effectiveProviderId])

  // Get offers for effective provider and offer type
  const availableOffers = useMemo(() => {
    if (!effectiveProviderId || !effectiveOfferType) return []
    return filteredOffers
      .filter(o => o.provider_id === effectiveProviderId && o.offer_type === effectiveOfferType)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filteredOffers, effectiveProviderId, effectiveOfferType])

  // Auto-sélection : quand il n'y a qu'une seule offre possible, la sélectionner automatiquement
  useEffect(() => {
    if (availableOffers.length === 1 && availableOffers[0].id !== selectedOfferId) {
      onChange(availableOffers[0].id)
    }
  }, [availableOffers, selectedOfferId, onChange])

  // Reset offer type when provider changes manually
  const handleProviderChange = (providerId: string | null) => {
    setUserProviderId(providerId)
    setUserOfferType(null)
  }

  // Reset offer when type changes manually
  const handleOfferTypeChange = (offerType: string | null) => {
    setUserOfferType(offerType)
  }

  // Handle offer selection
  const handleOfferChange = (offerId: string | null) => {
    onChange(offerId)
  }

  // Clear all selections
  const handleClear = () => {
    setUserProviderId(null)
    setUserOfferType(null)
    onChange(null)
  }

  const isLoading = isLoadingProviders || isLoadingOffers

  // Format price for display (in €/kWh)
  const formatPrice = (price: number | string | undefined | null): string => {
    if (price === undefined || price === null) return '-'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(numPrice)) return '-'
    return `${numPrice.toFixed(4)} €/kWh`
  }

  // Format subscription price
  const formatSubscription = (price: number | string | undefined | null): string => {
    if (price === undefined || price === null) return '-'
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(numPrice)) return '-'
    return `${numPrice.toFixed(2)} €/mois`
  }

  // Get detailed prices for selected offer summary
  const getDetailedPrices = (offer: EnergyOffer): React.ReactNode => {
    const priceRows: React.ReactNode[] = []

    // Base offers
    if (offer.offer_type === 'BASE' && offer.base_price !== undefined && offer.base_price !== null) {
      priceRows.push(
        <div key="base" className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Prix kWh:</span>
          <span className="font-medium">{formatPrice(offer.base_price)}</span>
        </div>
      )
    }

    // HP/HC offers
    if (offer.offer_type === 'HC_HP') {
      if (offer.hp_price !== undefined && offer.hp_price !== null) {
        priceRows.push(
          <div key="hp" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Heures Pleines:</span>
            <span className="font-medium">{formatPrice(offer.hp_price)}</span>
          </div>
        )
      }
      if (offer.hc_price !== undefined && offer.hc_price !== null) {
        priceRows.push(
          <div key="hc" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Heures Creuses:</span>
            <span className="font-medium">{formatPrice(offer.hc_price)}</span>
          </div>
        )
      }
    }

    // Tempo offers
    if (offer.offer_type === 'TEMPO') {
      // Jours Bleus
      if (offer.tempo_blue_hp !== undefined && offer.tempo_blue_hp !== null) {
        priceRows.push(
          <div key="blue-hp" className="flex justify-between">
            <span className="text-blue-600 dark:text-blue-400">Bleu HP:</span>
            <span className="font-medium">{formatPrice(offer.tempo_blue_hp)}</span>
          </div>
        )
      }
      if (offer.tempo_blue_hc !== undefined && offer.tempo_blue_hc !== null) {
        priceRows.push(
          <div key="blue-hc" className="flex justify-between">
            <span className="text-blue-600 dark:text-blue-400">Bleu HC:</span>
            <span className="font-medium">{formatPrice(offer.tempo_blue_hc)}</span>
          </div>
        )
      }
      // Jours Blancs
      if (offer.tempo_white_hp !== undefined && offer.tempo_white_hp !== null) {
        priceRows.push(
          <div key="white-hp" className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Blanc HP:</span>
            <span className="font-medium">{formatPrice(offer.tempo_white_hp)}</span>
          </div>
        )
      }
      if (offer.tempo_white_hc !== undefined && offer.tempo_white_hc !== null) {
        priceRows.push(
          <div key="white-hc" className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300">Blanc HC:</span>
            <span className="font-medium">{formatPrice(offer.tempo_white_hc)}</span>
          </div>
        )
      }
      // Jours Rouges
      if (offer.tempo_red_hp !== undefined && offer.tempo_red_hp !== null) {
        priceRows.push(
          <div key="red-hp" className="flex justify-between">
            <span className="text-red-600 dark:text-red-400">Rouge HP:</span>
            <span className="font-medium">{formatPrice(offer.tempo_red_hp)}</span>
          </div>
        )
      }
      if (offer.tempo_red_hc !== undefined && offer.tempo_red_hc !== null) {
        priceRows.push(
          <div key="red-hc" className="flex justify-between">
            <span className="text-red-600 dark:text-red-400">Rouge HC:</span>
            <span className="font-medium">{formatPrice(offer.tempo_red_hc)}</span>
          </div>
        )
      }
    }

    // EJP offers
    if (offer.offer_type === 'EJP') {
      if (offer.ejp_normal !== undefined && offer.ejp_normal !== null) {
        priceRows.push(
          <div key="ejp-normal" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Jours normaux:</span>
            <span className="font-medium">{formatPrice(offer.ejp_normal)}</span>
          </div>
        )
      }
      if (offer.ejp_peak !== undefined && offer.ejp_peak !== null) {
        priceRows.push(
          <div key="ejp-peak" className="flex justify-between">
            <span className="text-orange-600 dark:text-orange-400">Jours de pointe (EJP):</span>
            <span className="font-medium">{formatPrice(offer.ejp_peak)}</span>
          </div>
        )
      }
    }

    // Weekend offers
    if (offer.offer_type === 'WEEKEND') {
      // Weekday prices
      if (offer.hp_price !== undefined && offer.hp_price !== null) {
        priceRows.push(
          <div key="week-hp" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Semaine HP:</span>
            <span className="font-medium">{formatPrice(offer.hp_price)}</span>
          </div>
        )
      }
      if (offer.hc_price !== undefined && offer.hc_price !== null) {
        priceRows.push(
          <div key="week-hc" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Semaine HC:</span>
            <span className="font-medium">{formatPrice(offer.hc_price)}</span>
          </div>
        )
      }
      // Weekend prices
      if (offer.hp_price_weekend !== undefined && offer.hp_price_weekend !== null) {
        priceRows.push(
          <div key="weekend-hp" className="flex justify-between">
            <span className="text-purple-600 dark:text-purple-400">Week-end HP:</span>
            <span className="font-medium">{formatPrice(offer.hp_price_weekend)}</span>
          </div>
        )
      }
      if (offer.hc_price_weekend !== undefined && offer.hc_price_weekend !== null) {
        priceRows.push(
          <div key="weekend-hc" className="flex justify-between">
            <span className="text-purple-600 dark:text-purple-400">Week-end HC:</span>
            <span className="font-medium">{formatPrice(offer.hc_price_weekend)}</span>
          </div>
        )
      }
      // Base weekend price if exists
      if (offer.base_price_weekend !== undefined && offer.base_price_weekend !== null) {
        priceRows.push(
          <div key="weekend-base" className="flex justify-between">
            <span className="text-purple-600 dark:text-purple-400">Week-end:</span>
            <span className="font-medium">{formatPrice(offer.base_price_weekend)}</span>
          </div>
        )
      }
    }

    // Seasonal offers
    if (offer.offer_type === 'SEASONAL') {
      // Winter prices
      if (offer.hp_price_winter !== undefined && offer.hp_price_winter !== null) {
        priceRows.push(
          <div key="winter-hp" className="flex justify-between">
            <span className="text-cyan-600 dark:text-cyan-400">Hiver HP:</span>
            <span className="font-medium">{formatPrice(offer.hp_price_winter)}</span>
          </div>
        )
      }
      if (offer.hc_price_winter !== undefined && offer.hc_price_winter !== null) {
        priceRows.push(
          <div key="winter-hc" className="flex justify-between">
            <span className="text-cyan-600 dark:text-cyan-400">Hiver HC:</span>
            <span className="font-medium">{formatPrice(offer.hc_price_winter)}</span>
          </div>
        )
      }
      // Summer prices
      if (offer.hp_price_summer !== undefined && offer.hp_price_summer !== null) {
        priceRows.push(
          <div key="summer-hp" className="flex justify-between">
            <span className="text-amber-600 dark:text-amber-400">Été HP:</span>
            <span className="font-medium">{formatPrice(offer.hp_price_summer)}</span>
          </div>
        )
      }
      if (offer.hc_price_summer !== undefined && offer.hc_price_summer !== null) {
        priceRows.push(
          <div key="summer-hc" className="flex justify-between">
            <span className="text-amber-600 dark:text-amber-400">Été HC:</span>
            <span className="font-medium">{formatPrice(offer.hc_price_summer)}</span>
          </div>
        )
      }
      // Peak day price
      if (offer.peak_day_price !== undefined && offer.peak_day_price !== null) {
        priceRows.push(
          <div key="peak-day" className="flex justify-between">
            <span className="text-red-600 dark:text-red-400">Jours de pointe:</span>
            <span className="font-medium">{formatPrice(offer.peak_day_price)}</span>
          </div>
        )
      }
    }

    // If no specific prices found, try generic fallbacks
    if (priceRows.length === 0) {
      if (offer.base_price !== undefined && offer.base_price !== null) {
        priceRows.push(
          <div key="base-fallback" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Prix kWh:</span>
            <span className="font-medium">{formatPrice(offer.base_price)}</span>
          </div>
        )
      }
      if (offer.hp_price !== undefined && offer.hp_price !== null) {
        priceRows.push(
          <div key="hp-fallback" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Heures Pleines:</span>
            <span className="font-medium">{formatPrice(offer.hp_price)}</span>
          </div>
        )
      }
      if (offer.hc_price !== undefined && offer.hc_price !== null) {
        priceRows.push(
          <div key="hc-fallback" className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Heures Creuses:</span>
            <span className="font-medium">{formatPrice(offer.hc_price)}</span>
          </div>
        )
      }
    }

    return priceRows.length > 0 ? priceRows : <span className="text-gray-500">-</span>
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
      {/* Fournisseur + Type sur une ligne */}
      <div className="grid grid-cols-2 gap-2">
        {/* Provider Selector */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Building2 size={12} />
            Fournisseur
          </label>
          <select
            value={effectiveProviderId || ''}
            onChange={(e) => handleProviderChange(e.target.value || null)}
            disabled={disabled || isLoading}
            className={selectClassName}
          >
            <option value="">--</option>
            {availableProviders.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        {/* Offer Type Selector */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Zap size={12} />
            Type
          </label>
          <select
            value={effectiveOfferType || ''}
            onChange={(e) => handleOfferTypeChange(e.target.value || null)}
            disabled={disabled || isLoading || !effectiveProviderId}
            className={selectClassName}
          >
            <option value="">--</option>
            {availableOfferTypes.map(type => (
              <option key={type} value={type}>
                {OFFER_TYPE_LABELS[type] || type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sélecteur d'offre visible uniquement quand plusieurs offres existent pour la combinaison */}
      {availableOffers.length > 1 && (
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Tag size={12} />
            Offre ({availableOffers.length} disponibles)
          </label>
          <select
            value={selectedOfferId || ''}
            onChange={(e) => handleOfferChange(e.target.value || null)}
            disabled={disabled || isLoading}
            className={selectClassName}
          >
            <option value="">--</option>
            {availableOffers.map(offer => (
              <option key={offer.id} value={offer.id}>
                {offer.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selected offer summary */}
      {selectedOffer && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          {/* Header with provider and offer name */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-blue-900 dark:text-blue-100">
                  {providers.find(p => p.id === selectedOffer.provider_id)?.name}
                </span>
                <span className="text-blue-400">-</span>
                <span className="text-blue-700 dark:text-blue-300">
                  {selectedOffer.name}
                </span>
                <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300">
                  {OFFER_TYPE_LABELS[selectedOffer.offer_type] || selectedOffer.offer_type}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="p-1.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800 rounded-lg transition-colors flex-shrink-0"
              title="Effacer la sélection"
            >
              <X size={16} />
            </button>
          </div>

          {/* Subscription price */}
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-blue-200 dark:border-blue-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">Abonnement:</span>
            <span className="font-semibold text-blue-700 dark:text-blue-300">
              {formatSubscription(selectedOffer.subscription_price)}
            </span>
          </div>

          {/* Power if specified */}
          {selectedOffer.power_kva && (
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-blue-200 dark:border-blue-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">Puissance:</span>
              <span className="font-medium text-blue-700 dark:text-blue-300">
                {selectedOffer.power_kva} kVA
              </span>
            </div>
          )}

          {/* Detailed prices */}
          <div className="space-y-1.5 text-sm text-blue-800 dark:text-blue-200">
            {getDetailedPrices(selectedOffer)}
          </div>

          {/* Price update date if available */}
          {selectedOffer.price_updated_at && (
            <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-700">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Tarifs mis à jour le {new Date(selectedOffer.price_updated_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Help text when no offer selected */}
      {!selectedOffer && !isLoading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Sélectionnez un fournisseur et un type d'offre.
          {subscribedPower ? ` L'offre correspondante pour ${subscribedPower} kVA sera automatiquement sélectionnée.` : ' Renseignez aussi la puissance souscrite pour filtrer les offres.'}
        </p>
      )}
    </div>
  )
}
