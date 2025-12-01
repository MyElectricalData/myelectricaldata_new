import { Tag } from 'lucide-react'
import type { SelectedOfferWithProvider } from '../types/euro.types'

interface OfferPricingCardProps {
  selectedOffer: SelectedOfferWithProvider
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

export function OfferPricingCard({ selectedOffer }: OfferPricingCardProps) {
  const offerType = selectedOffer.offer_type

  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-800 rounded-lg">
            <Tag className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <div>
            <div className="text-sm text-blue-600 dark:text-blue-400">Offre sélectionnée</div>
            <div className="font-semibold text-blue-900 dark:text-blue-100">
              {selectedOffer.providerName} - {selectedOffer.name}
            </div>
          </div>
        </div>
        <span className="px-3 py-1.5 text-sm font-medium bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-lg">
          {offerType}
        </span>
      </div>

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
          <PriceItem label="Jour Pointe" value={formatPricePerKwh(selectedOffer.ejp_pointe)} highlight="red" />
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
