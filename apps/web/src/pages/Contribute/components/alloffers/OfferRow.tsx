// Une ligne de puissance dans un groupe d'offres (existante ou nouvelle)
// Affiche : [Puissance] [Abo] [Tarifs...] [Actions]

import { Trash2, Undo2, ArrowDownToLine } from 'lucide-react'
import type { EnergyOffer } from '@/api/energy'
import { getTariffColumns, formatPower, OFFER_TYPE_PRICE_FIELDS, getLabelColor } from '../../utils/offerPricing'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface OfferRowProps {
  offer: EnergyOffer
  groupName: string
  offersInGroup: EnergyOffer[]
  state: AllOffersState
}

export default function OfferRow({ offer, groupName, offersInGroup, state }: OfferRowProps) {
  const {
    isEditMode,
    editedOffers,
    powersToRemove, setPowersToRemove,
    duplicateDropdownId, setDuplicateDropdownId,
    isOfferModified,
    updateField,
    duplicateOfferFields,
  } = state

  const modified = isOfferModified(offer)
  const power = formatPower(offer)
  const powerNum = offer.power_kva || null
  const isMarkedForRemoval = powerNum !== null && powersToRemove.some(p => p.power === powerNum && p.groupName === groupName)
  const cols = getTariffColumns(offer.offer_type)
  const isCompact = cols >= 4
  const gridCols = `70px 1fr ${Array(cols).fill('1fr').join(' ')} ${isEditMode ? '70px' : ''}`

  // Récupérer la config des champs pour ce type d'offre
  const priceFields = OFFER_TYPE_PRICE_FIELDS[offer.offer_type] || []

  // Formater la valeur d'un champ pour l'affichage
  const getFieldValue = (fieldKey: string): string => {
    const editedValue = editedOffers[offer.id]?.[fieldKey]
    if (editedValue !== undefined) return editedValue
    const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
    if (originalValue === undefined || originalValue === null || originalValue === '') return ''
    const num = typeof originalValue === 'string' ? parseFloat(originalValue) : Number(originalValue)
    if (isNaN(num)) return ''
    return num.toString()
  }

  const isFieldModified = (fieldKey: string): boolean => {
    const editedValue = editedOffers[offer.id]?.[fieldKey]
    if (editedValue === undefined) return false
    const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
    return editedValue !== String(originalValue ?? '')
  }

  // Rendu d'un champ éditable (abonnement ou tarif)
  const renderField = (label: string, fieldKey: string, unit: string, compact: boolean) => {
    const displayValue = getFieldValue(fieldKey)
    const fieldModified = isFieldModified(fieldKey)
    const color = getLabelColor(label)

    if (compact) {
      if (!isEditMode) {
        return (
          <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex flex-col items-center min-w-0">
            <span className={`text-xs font-semibold ${color}`}>{label}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{displayValue || '-'}</span>
          </div>
        )
      }
      return (
        <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex flex-col items-center min-w-0 gap-0.5">
          <span className={`text-xs font-semibold ${color}`}>{label}</span>
          <input
            type="number"
            step="0.0001"
            value={displayValue}
            onChange={(e) => updateField(offer.id, fieldKey, e.target.value)}
            className={`w-full min-w-[60px] max-w-[100px] px-2 py-1 text-sm font-bold text-center border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
              fieldModified
                ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
        </div>
      )
    }

    if (!isEditMode) {
      return (
        <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex items-center gap-2 min-w-0">
          <span className={`text-sm font-semibold w-10 shrink-0 text-right ${color}`}>{label}</span>
          <span className="text-base font-bold text-gray-900 dark:text-white truncate">{displayValue || '-'}</span>
          <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">{unit}</span>
        </div>
      )
    }

    return (
      <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`text-sm font-semibold w-10 shrink-0 text-right ${color}`}>{label}</span>
        <input
          type="number"
          step="0.0001"
          value={displayValue}
          onChange={(e) => updateField(offer.id, fieldKey, e.target.value)}
          className={`flex-1 min-w-[80px] max-w-[120px] px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
            fieldModified
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <span className="text-gray-500 dark:text-gray-400 text-sm shrink-0">{unit}</span>
      </div>
    )
  }

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border transition-all ${
        isMarkedForRemoval
          ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 opacity-60'
          : modified
            ? 'border-amber-400 dark:border-amber-600'
            : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="grid items-center gap-x-2 gap-y-1" style={{ gridTemplateColumns: gridCols }}>
        {/* Puissance + Badges */}
        <div className="flex flex-col items-start gap-1">
          <span className={`text-sm font-medium px-2 py-1 rounded ${
            isMarkedForRemoval
              ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 line-through'
              : 'text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700'
          }`}>
            {power || '-'}
          </span>
          {isMarkedForRemoval && (
            <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">À suppr.</span>
          )}
          {modified && !isMarkedForRemoval && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Modifié</span>
          )}
        </div>

        {/* Abonnement */}
        {renderField('Abo.', 'subscription_price', '€/mois', isCompact)}

        {/* Tarifs */}
        {priceFields.map(field =>
          renderField(field.label, field.key, '€/kWh', isCompact)
        )}

        {/* Actions (mode édition) */}
        {isEditMode && powerNum !== null && (
          <div className="flex items-center gap-0.5 justify-center">
            {isMarkedForRemoval ? (
              <button
                onClick={() => setPowersToRemove(prev => prev.filter(p => !(p.power === powerNum && p.groupName === groupName)))}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="Annuler la suppression"
              >
                <Undo2 size={16} />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!powersToRemove.some(p => p.power === powerNum && p.groupName === groupName)) {
                    setPowersToRemove(prev => [...prev, { power: powerNum, groupName }])
                  }
                }}
                className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Proposer la suppression de cette puissance"
              >
                <Trash2 size={16} />
              </button>
            )}
            {/* Dropdown duplication */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDuplicateDropdownId(prev => prev === offer.id ? null : offer.id)
                }}
                className="p-1.5 text-primary-500 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                title="Dupliquer les tarifs"
              >
                <ArrowDownToLine size={16} />
              </button>
              {duplicateDropdownId === offer.id && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-64"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => duplicateOfferFields(offer, 'next', offersInGroup)}
                    disabled={offersInGroup.indexOf(offer) === offersInGroup.length - 1}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Dupliquer vers la ligne suivante
                  </button>
                  <button
                    onClick={() => duplicateOfferFields(offer, 'all', offersInGroup)}
                    disabled={offersInGroup.length <= 1}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Dupliquer vers toutes les lignes
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
