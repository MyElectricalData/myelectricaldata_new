import { Tag, ArrowLeftRight, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useMemo } from 'react'
import type { SelectedOfferWithProvider } from '../types/euro.types'

interface EnergyOffer {
  id: string
  name: string
  provider_id: string
  offer_type: string
  power_kva?: number
  base_price?: number | string | null
  hc_price?: number | string | null
  hp_price?: number | string | null
  subscription_price: number | string
}

interface EnergyProvider {
  id: string
  name: string
}

interface OfferPricingCardProps {
  selectedOffer: SelectedOfferWithProvider
  isComparison?: boolean
  originalOffer?: SelectedOfferWithProvider | null
  compatibleOffers?: EnergyOffer[]
  providers?: EnergyProvider[]
  onComparisonChange?: (offerId: string | null) => void
  comparisonOfferId?: string | null
  defaultExpanded?: boolean
}

// Format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

// Format price per kWh
const formatPricePerKwh = (value: number | string | undefined | null): string => {
  if (value === undefined || value === null) return '-'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue) || numValue === 0) return '-'
  return `${(numValue * 100).toFixed(2)} c€`
}

export function OfferPricingCard({
  selectedOffer,
  isComparison = false,
  originalOffer,
  compatibleOffers = [],
  providers = [],
  onComparisonChange,
  comparisonOfferId,
  defaultExpanded = false
}: OfferPricingCardProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const offerType = selectedOffer.offer_type

  // Format subscription for compact view
  const subscriptionValue = typeof selectedOffer.subscription_price === 'string'
    ? parseFloat(selectedOffer.subscription_price)
    : selectedOffer.subscription_price

  // Group offers by provider for the dropdown
  const offersByProvider = useMemo(() => {
    const grouped = new Map<string, { provider: EnergyProvider; offers: EnergyOffer[] }>()

    compatibleOffers.forEach(offer => {
      const provider = providers.find(p => p.id === offer.provider_id)
      if (!provider) return

      if (!grouped.has(provider.id)) {
        grouped.set(provider.id, { provider, offers: [] })
      }
      grouped.get(provider.id)!.offers.push(offer)
    })

    return Array.from(grouped.values()).sort((a, b) => a.provider.name.localeCompare(b.provider.name))
  }, [compatibleOffers, providers])

  const handleSelectOffer = (offerId: string) => {
    if (offerId === originalOffer?.id) {
      onComparisonChange?.(null)
    } else {
      onComparisonChange?.(offerId)
    }
    setIsDropdownOpen(false)
  }

  const handleResetComparison = () => {
    onComparisonChange?.(null)
  }

  return (
    <div className={`rounded-xl border-2 ${
      isComparison
        ? 'bg-gray-50 dark:bg-gray-800/80 border-amber-500'
        : 'bg-gray-50 dark:bg-gray-800/80 border-blue-500'
    }`}>
      {/* Compact Header - Always visible */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer transition-opacity hover:opacity-80 rounded-t-xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isComparison ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
            <Tag className={isComparison ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'} size={20} />
          </div>
          <div>
            <div className={`text-sm ${isComparison ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {isComparison ? 'Comparaison avec' : 'Offre sélectionnée'}
            </div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {selectedOffer.providerName} - {selectedOffer.name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Compact info when collapsed */}
          {!isExpanded && (
            <div className="hidden sm:flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <span>{selectedOffer.power_kva} kVA</span>
              <span>•</span>
              <span>{formatCurrency(subscriptionValue)}/mois</span>
            </div>
          )}
          <span className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
            isComparison
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
          }`}>
            {offerType}
          </span>
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <span className="text-sm">{isExpanded ? 'Réduire' : 'Détails'}</span>
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4">

      {/* Comparison info banner */}
      {isComparison && originalOffer && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <ArrowLeftRight size={16} />
            <span>Mode comparaison actif - Offre principale : <strong>{originalOffer.providerName} - {originalOffer.name}</strong></span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleResetComparison()
            }}
            className="p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors"
            title="Revenir à l'offre principale"
          >
            <X size={16} className="text-amber-600 dark:text-amber-400" />
          </button>
        </div>
      )}

      {/* Pricing Grid */}
      {offerType === 'BASE' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <PriceItem label="Prix kWh" value={formatPricePerKwh(selectedOffer.base_price)} />
          <PriceItem
            label="Abonnement"
            value={`${formatCurrency(typeof selectedOffer.subscription_price === 'string' ? parseFloat(selectedOffer.subscription_price) : selectedOffer.subscription_price)}/mois`}
          />
          {selectedOffer.power_kva && (
            <PriceItem label="Puissance" value={`${selectedOffer.power_kva} kVA`} />
          )}
        </div>
      )}

      {offerType === 'HC_HP' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PriceItem label="Heures Creuses" value={formatPricePerKwh(selectedOffer.hc_price)} highlight="purple" />
          <PriceItem label="Heures Pleines" value={formatPricePerKwh(selectedOffer.hp_price)} highlight="pink" />
          <PriceItem
            label="Abonnement"
            value={`${formatCurrency(typeof selectedOffer.subscription_price === 'string' ? parseFloat(selectedOffer.subscription_price) : selectedOffer.subscription_price)}/mois`}
          />
          {selectedOffer.power_kva && (
            <PriceItem label="Puissance" value={`${selectedOffer.power_kva} kVA`} />
          )}
        </div>
      )}

      {offerType === 'TEMPO' && (
        <div className="space-y-4">
          {/* Tempo day prices */}
          <div className="grid grid-cols-3 gap-3">
            {/* Blue day */}
            <div className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded-lg">
              <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Jour Bleu</div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HC</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_blue_hc)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HP</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_blue_hp)}</span>
              </div>
            </div>
            {/* White day */}
            <div className="bg-white dark:bg-gray-700/40 p-3 rounded-lg border border-gray-200 dark:border-gray-600">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Jour Blanc</div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HC</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_white_hc)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HP</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_white_hp)}</span>
              </div>
            </div>
            {/* Red day */}
            <div className="bg-red-100 dark:bg-red-900/40 p-3 rounded-lg">
              <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">Jour Rouge</div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HC</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_red_hc)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">HP</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{formatPricePerKwh(selectedOffer.tempo_red_hp)}</span>
              </div>
            </div>
          </div>
          {/* Subscription */}
          <div className="flex gap-4 pt-2 border-t border-blue-200 dark:border-blue-700">
            <PriceItem
              label="Abonnement"
              value={`${formatCurrency(typeof selectedOffer.subscription_price === 'string' ? parseFloat(selectedOffer.subscription_price) : selectedOffer.subscription_price)}/mois`}
            />
            {selectedOffer.power_kva && (
              <PriceItem label="Puissance" value={`${selectedOffer.power_kva} kVA`} />
            )}
          </div>
          <p className="text-xs text-green-600 dark:text-green-400">
            Les calculs utilisent les tarifs réels selon la couleur de chaque jour (données RTE).
          </p>
        </div>
      )}

      {offerType === 'EJP' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PriceItem label="Jour Normal" value={formatPricePerKwh(selectedOffer.ejp_normal)} />
          <PriceItem label="Jour Pointe" value={formatPricePerKwh(selectedOffer.ejp_peak)} highlight="red" />
          <PriceItem
            label="Abonnement"
            value={`${formatCurrency(typeof selectedOffer.subscription_price === 'string' ? parseFloat(selectedOffer.subscription_price) : selectedOffer.subscription_price)}/mois`}
          />
          {selectedOffer.power_kva && (
            <PriceItem label="Puissance" value={`${selectedOffer.power_kva} kVA`} />
          )}
        </div>
      )}

      {/* Fallback for other types */}
      {!['BASE', 'HC_HP', 'TEMPO', 'EJP'].includes(offerType) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {selectedOffer.hc_price && <PriceItem label="Heures Creuses" value={formatPricePerKwh(selectedOffer.hc_price)} />}
          {selectedOffer.hp_price && <PriceItem label="Heures Pleines" value={formatPricePerKwh(selectedOffer.hp_price)} />}
          {selectedOffer.base_price && <PriceItem label="Prix Base" value={formatPricePerKwh(selectedOffer.base_price)} />}
          <PriceItem
            label="Abonnement"
            value={`${formatCurrency(typeof selectedOffer.subscription_price === 'string' ? parseFloat(selectedOffer.subscription_price) : selectedOffer.subscription_price)}/mois`}
          />
          {selectedOffer.power_kva && (
            <PriceItem label="Puissance" value={`${selectedOffer.power_kva} kVA`} />
          )}
        </div>
      )}

      {/* Comparison selector */}
          {onComparisonChange && compatibleOffers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDropdownOpen(!isDropdownOpen)
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ArrowLeftRight size={18} className="text-blue-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Comparer avec une autre offre
                  </span>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Offer list - inline within the card */}
              {isDropdownOpen && (
                <div className="mt-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg max-h-64 overflow-y-auto">
                  {offersByProvider.map(({ provider, offers }) => (
                    <div key={provider.id}>
                      <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700/50 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide sticky top-0">
                        {provider.name}
                      </div>
                      {offers.map(offer => {
                        const isSelected = offer.id === comparisonOfferId
                        const isOriginal = offer.id === originalOffer?.id
                        return (
                          <button
                            key={offer.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectOffer(offer.id)
                            }}
                            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                            }`}
                          >
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {offer.name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {offer.offer_type} - {offer.power_kva} kVA
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isOriginal && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">
                                  Actuelle
                                </span>
                              )}
                              {isSelected && !isOriginal && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                                  Comparaison
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper component for price items
function PriceItem({
  label,
  value,
  highlight
}: {
  label: string
  value: string
  highlight?: 'purple' | 'pink' | 'red' | 'green'
}) {
  const highlightColors = {
    purple: 'text-purple-600 dark:text-purple-400',
    pink: 'text-pink-600 dark:text-pink-400',
    red: 'text-red-600 dark:text-red-400',
    green: 'text-green-600 dark:text-green-400',
  }

  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? highlightColors[highlight] : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </div>
    </div>
  )
}
