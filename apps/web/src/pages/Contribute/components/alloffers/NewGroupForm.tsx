// Formulaire de création d'un nouveau groupe d'offres
// Contient : en-tête (nom + dates) + lignes de puissance avec PriceFieldsEditor
// Utilisé 2 fois dans AllOffers : quand le type est vide et quand des offres existent déjà

import { Plus, Trash2, X, AlertCircle, Package } from 'lucide-react'
import { SingleDatePicker } from '@/components/SingleDatePicker'
import PriceFieldsEditor from './PriceFieldsEditor'
import { getFieldKeysForOfferType, isNewPowerComplete, periodsOverlap } from '../../utils/offerPricing'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface NewGroupFormProps {
  state: AllOffersState
  groupIndex: number
}

export default function NewGroupForm({ state, groupIndex }: NewGroupFormProps) {
  const {
    newGroups, setNewGroups,
    filterOfferType,
    existingPowers,
    dynamicPriceFields,
  } = state

  const group = newGroups[groupIndex]
  if (!group || group.alreadyInDb) return null

  const effectiveOfferType = group.offer_type || filterOfferType

  const updateGroup = (updates: Partial<typeof group>) => {
    setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, ...updates } : g))
  }

  const updatePowerField = (powerIndex: number, key: string, value: string) => {
    setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
      ...g,
      powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, [key]: value } } : p)
    } : g))
  }

  const updatePowerKva = (powerIndex: number, kva: number) => {
    setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
      ...g,
      powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, power: kva } : p)
    } : g))
  }

  const removePower = (powerIndex: number) => {
    setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
      ...g,
      powers: g.powers.filter((_, pi) => pi !== powerIndex)
    } : g))
  }

  const removeGroup = () => {
    setNewGroups(prev => prev.filter((_, i) => i !== groupIndex))
  }

  const addPower = () => {
    const lastPower = group.powers[group.powers.length - 1]
    const requiredFields = getFieldKeysForOfferType(effectiveOfferType)
    // Copier les prix kWh de la dernière puissance (pas l'abonnement ni la puissance)
    const copiedFields: Record<string, string> = {}
    if (lastPower) {
      for (const key of requiredFields) {
        if (lastPower.fields[key]) copiedFields[key] = lastPower.fields[key]
      }
    }
    setNewGroups(prev => prev.map((g, gi) => gi === groupIndex
      ? { ...g, powers: [...g.powers, { power: 0, fields: copiedFields }] }
      : g
    ))
  }

  // Vérifier si la dernière puissance est complète (pour activer le bouton "ajouter")
  const lastPower = group.powers[group.powers.length - 1]
  const isLastComplete = !lastPower || isNewPowerComplete(lastPower, effectiveOfferType)

  return (
    <div className="space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-dashed border-blue-400 dark:border-blue-600">
      {/* En-tête du nouveau groupe */}
      <div className="flex items-center gap-3 pb-2 border-b border-blue-300 dark:border-blue-700">
        <Plus size={16} className="text-blue-600 dark:text-blue-400" />
        <input
          type="text"
          value={group.name}
          onChange={(e) => updateGroup({ name: e.target.value })}
          placeholder="Nom de l'offre (ex: Vert Fixe, Stable...)"
          data-new-group-name
          className="flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        {/* Dates de validité */}
        <div className="flex items-center gap-2">
          <SingleDatePicker
            value={group.validFrom}
            onChange={(date: string) => updateGroup({ validFrom: date })}
            minDate="2020-01-01"
            required
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">→</span>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={group.validTo}
              onChange={(e) => updateGroup({ validTo: e.target.value })}
              min={group.validFrom || '2020-01-01'}
              placeholder="jj/mm/aaaa"
              className="px-2 py-1.5 text-sm rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none [color-scheme:dark] dark:[color-scheme:dark]"
            />
            {group.validTo && (
              <button
                onClick={() => updateGroup({ validTo: '' })}
                className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300"
                title="Effacer la date de fin (offre active)"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {group.offer_type && (
          <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">{group.offer_type}</span>
        )}
        <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">Nouveau groupe</span>
        <button
          onClick={removeGroup}
          className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          title="Supprimer ce groupe"
        >
          <X size={16} />
        </button>
      </div>

      {/* Puissances du nouveau groupe */}
      {group.powers.map((power, powerIndex) => (
        <NewGroupPowerRow
          key={`new-group-${groupIndex}-power-${powerIndex}`}
          power={power}
          powerIndex={powerIndex}
          offerType={effectiveOfferType}
          groupValidFrom={group.validFrom}
          groupValidTo={group.validTo}
          existingPowers={existingPowers}
          dynamicPriceFields={dynamicPriceFields}
          onUpdateField={(key, value) => updatePowerField(powerIndex, key, value)}
          onUpdatePower={(kva) => updatePowerKva(powerIndex, kva)}
          onRemove={() => removePower(powerIndex)}
        />
      ))}

      {/* Bouton ajouter une puissance */}
      <button
        onClick={addPower}
        disabled={!isLastComplete}
        className={`w-full rounded-lg p-3 border-2 transition-all flex items-center justify-center gap-2 shadow-sm ${
          isLastComplete
            ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-400 dark:border-primary-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/50'
            : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
        }`}
      >
        <Plus size={18} className={isLastComplete ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'} />
        <span className={`font-semibold text-sm ${isLastComplete ? 'text-primary-700 dark:text-primary-300' : 'text-gray-400'}`}>Ajouter une puissance à ce groupe</span>
      </button>
    </div>
  )
}

// --- Ligne de puissance dans un nouveau groupe ---

interface NewGroupPowerRowProps {
  power: { power: number; fields: Record<string, string> }
  powerIndex: number
  offerType: string
  groupValidFrom: string
  groupValidTo: string
  existingPowers: { power: number; offer_type: string; valid_from?: string; valid_to?: string }[]
  dynamicPriceFields: { key: string; label: string; color?: string }[]
  onUpdateField: (key: string, value: string) => void
  onUpdatePower: (kva: number) => void
  onRemove: () => void
}

function NewGroupPowerRow({
  power,
  offerType,
  groupValidFrom,
  groupValidTo,
  existingPowers,
  dynamicPriceFields,
  onUpdateField,
  onUpdatePower,
  onRemove,
}: NewGroupPowerRowProps) {
  const isIncomplete = !power.power || power.power <= 0 || !power.fields.subscription_price
  const isDuplicateInDb = power.power > 0 && existingPowers.some(ep =>
    ep.power === power.power &&
    ep.offer_type === offerType &&
    periodsOverlap(groupValidFrom || undefined, groupValidTo || undefined, ep.valid_from, ep.valid_to)
  )

  return (
    <div
      className={`rounded-lg p-3 border transition-all ${
        isDuplicateInDb
          ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
          : isIncomplete
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
            : 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600'
      }`}
    >
      {isDuplicateInDb && (
        <div className="text-xs text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
          <AlertCircle size={12} />
          <span>Cette puissance existe déjà pour ce type d'offre sur une période qui chevauche</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {/* Puissance */}
        <div className="w-20 shrink-0">
          <input
            type="number"
            min="1"
            max="100"
            value={power.power || ''}
            onChange={(e) => onUpdatePower(e.target.value ? parseInt(e.target.value) : 0)}
            placeholder="kVA"
            className={`w-full px-2 py-1 text-sm font-medium text-center border rounded bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
              !power.power || power.power <= 0
                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
            }`}
          />
        </div>

        {/* Abonnement */}
        <div className="flex items-center gap-2 w-[200px]">
          <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Abo.<span className="text-red-500">*</span></span>
          <input
            type="number"
            step="0.01"
            value={power.fields.subscription_price ?? ''}
            onChange={(e) => onUpdateField('subscription_price', e.target.value)}
            placeholder="0.00"
            className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
              !power.fields.subscription_price
                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
            }`}
          />
          <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/mois</span>
        </div>

        {/* Tarifs — rendu data-driven via PriceFieldsEditor */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">
          <PriceFieldsEditor
            offerType={offerType}
            fields={power.fields}
            onChange={(key, value) => onUpdateField(key, value)}
            dynamicFields={dynamicPriceFields}
          />
        </div>

        {/* Bouton supprimer la puissance */}
        <button
          onClick={onRemove}
          className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
          title="Supprimer cette puissance"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// --- Bouton pour créer un nouveau groupe ---

export function AddNewGroupButton({ state }: { state: AllOffersState }) {
  const { setNewGroups } = state

  return (
    <button
      onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])}
      className="w-full rounded-lg p-3 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-2"
    >
      <Package size={18} />
      <Plus size={14} className="-ml-1" />
      <span className="font-medium text-sm">Créer un nouveau groupe d'offres</span>
    </button>
  )
}

// --- Message quand aucune offre pour le type sélectionné ---

export function EmptyTypeMessage({ state }: { state: AllOffersState }) {
  const { filterOfferType, filterProvider, isEditMode, visibleGroupNames, newGroups, setNewGroups } = state

  // Ne rien afficher si : pas en mode édition, pas de fournisseur sélectionné,
  // des groupes existent déjà, ou des nouveaux groupes sont en cours de création
  if (!isEditMode || !filterProvider || visibleGroupNames.length > 0 || newGroups.length > 0) return null

  return (
    <div className="text-center py-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700">
      <Package size={32} className="mx-auto mb-3 text-blue-500" />
      <p className="text-lg font-medium text-blue-700 dark:text-blue-300 mb-2">
        Aucune offre {filterOfferType} pour ce fournisseur
      </p>
      <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
        Créez un nouveau groupe d'offres pour proposer des tarifs
      </p>
      <button
        onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
      >
        <Package size={18} />
        <Plus size={14} className="-ml-1" />
        <span>Créer un nouveau groupe d'offres</span>
      </button>
    </div>
  )
}
