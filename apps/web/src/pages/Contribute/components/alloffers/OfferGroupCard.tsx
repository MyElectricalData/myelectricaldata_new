// Carte d'un groupe d'offres existant + onglets de navigation + ligne nouvelle puissance
// Composant principal pour le rendu des offres par groupe dans AllOffers

import { Plus, Trash2, Undo2, Calendar, Copy, AlertCircle, X } from 'lucide-react'
import type { EnergyOffer } from '@/api/energy'
import OfferRow from './OfferRow'
import PriceFieldsEditor from './PriceFieldsEditor'
import { getGroupNameWithoutPeriod, getFieldKeysForOfferType } from '../../utils/offerPricing'
import type { AllOffersState } from '../../hooks/useAllOffersState'

// --- Onglets de sélection des groupes (mode lecture uniquement) ---

export function GroupTabs({ state }: { state: AllOffersState }) {
  const {
    activeGroupNames, selectedGroupName, setSelectedGroupName,
    groupedOffers, deprecatedOffers, isEditMode,
    sortedProviders, filterProvider,
    buildOfferExportJson, copyJsonToClipboard,
  } = state

  if (activeGroupNames.length < 1 || isEditMode) return null

  return (
    <div>
      <div className="mb-3">
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Offres</label>
        <div className="mt-1 h-0.5 w-full bg-primary-500 rounded-full" />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {activeGroupNames.map((gName) => {
          const isActive = selectedGroupName === gName
          const count = groupedOffers[gName]?.length || 0
          const cleanName = getGroupNameWithoutPeriod(gName)
          const isDeprecated = deprecatedOffers.some(d =>
            d.offer_name === cleanName && d.offer_type === groupedOffers[gName]?.[0]?.offer_type
          )
          return (
            <button
              key={gName}
              onClick={() => setSelectedGroupName(gName)}
              className={`flex-1 min-w-[calc((100%-1.5rem)/4)] px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                isDeprecated ? 'opacity-50 line-through ' : ''
              }${
                isActive
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
              title={isDeprecated ? 'Offre marquée pour suppression' : undefined}
            >
              <span className={`px-1.5 py-0.5 text-xs rounded-full shrink-0 ${
                isActive ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
              }`}>{count}</span>
              <span className="flex-1 text-center">{cleanName}</span>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const currentProv = sortedProviders.find(p => p.id === filterProvider)
                  if (!currentProv) return
                  const groupOffers = groupedOffers[gName] || []
                  const exportData = buildOfferExportJson(groupOffers, currentProv.name)
                  copyJsonToClipboard(exportData, `${count} offre(s) "${cleanName}" copiées en JSON`)
                }}
                className={`p-1 rounded shrink-0 transition-colors ${
                  isActive
                    ? 'text-white/50 hover:text-white hover:bg-white/20'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-500/50'
                }`}
                title={`Copier "${cleanName}" en JSON`}
              >
                <Copy size={14} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// --- Carte d'un groupe d'offres existant ---

interface OfferGroupCardProps {
  state: AllOffersState
  groupName: string
}

export default function OfferGroupCard({ state, groupName }: OfferGroupCardProps) {
  const {
    groupedOffers, filterOfferType, isEditMode,
    editedOfferNames, setEditedOfferNames,
    editedOffers, setEditedOffers,
    deprecatedOffers, setDeprecatedOffers,
    newPowersData, setNewPowersData,
  } = state

  const offersInGroup = groupedOffers[groupName]
  if (!offersInGroup || offersInGroup.length === 0) return null

  const groupOfferType = offersInGroup[0]?.offer_type || filterOfferType
  const cleanGroupName = getGroupNameWithoutPeriod(groupName)
  const renameKey = `${cleanGroupName}::${groupOfferType}`
  const editedName = editedOfferNames[renameKey]
  const isNameModified = editedName !== undefined && editedName !== cleanGroupName

  // Dates de validité du groupe (la plus récente parmi les offres)
  const groupValidFrom = offersInGroup.reduce((latest, offer) => {
    if (!offer.valid_from) return latest
    if (!latest) return offer.valid_from
    return new Date(offer.valid_from) > new Date(latest) ? offer.valid_from : latest
  }, null as string | null)
  const groupValidTo = offersInGroup.reduce((latest, offer) => {
    if (!offer.valid_to) return latest
    if (!latest) return offer.valid_to
    return new Date(offer.valid_to) > new Date(latest) ? offer.valid_to : latest
  }, null as string | null)

  // la bascule manuelle enregistre la cle du groupe ("nom##periode"), l'import IA le seul nom
  const isGroupDeprecated = deprecatedOffers.some(d =>
    (d.offer_name === groupName || d.offer_name === cleanGroupName) && d.offer_type === groupOfferType
  )

  // Nouvelles puissances pour ce groupe
  const groupNewPowers = newPowersData
    .map((np, i) => ({ data: np, index: i }))
    .filter(({ data }) => data.offer_name === groupName && data.offer_type === groupOfferType)

  // Complétude de la dernière ligne pour activer le bouton "ajouter"
  const requiredFields = getFieldKeysForOfferType(groupOfferType)
  const lastNewPower = groupNewPowers.length > 0 ? groupNewPowers[groupNewPowers.length - 1].data : null
  let isLastComplete = true
  let lastFields: Record<string, string> = {}
  if (lastNewPower) {
    isLastComplete = lastNewPower.power > 0 &&
      !!lastNewPower.fields.subscription_price?.trim() &&
      requiredFields.every(f => !!lastNewPower.fields[f]?.trim())
    lastFields = lastNewPower.fields
  } else if (offersInGroup.length > 0) {
    const lastOffer = offersInGroup[offersInGroup.length - 1] as unknown as Record<string, unknown>
    for (const key of requiredFields) {
      if (lastOffer[key] != null) lastFields[key] = String(lastOffer[key])
    }
  }

  return (
    <div className={`space-y-2 mt-4 ${isGroupDeprecated ? 'opacity-50' : ''}`}>
      {/* En-tête du groupe (mode édition uniquement) */}
      {isEditMode && (
        <div className={`flex items-center gap-3 pb-2 border-b ${isGroupDeprecated ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
          <input
            type="text"
            value={editedName ?? cleanGroupName}
            onChange={(e) => setEditedOfferNames(prev => ({ ...prev, [renameKey]: e.target.value }))}
            className={`flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
              isNameModified
                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
            }`}
            placeholder="Nom de l'offre"
          />
          {/* Dates de validité éditables */}
          <GroupDateEditor
            offersInGroup={offersInGroup}
            groupValidFrom={groupValidFrom}
            groupValidTo={groupValidTo}
            editedOffers={editedOffers}
            setEditedOffers={setEditedOffers}
          />
          {isNameModified && (
            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Nom modifié</span>
          )}
          {isGroupDeprecated && (
            <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded font-medium">Suppression demandée</span>
          )}
          {/* Bouton supprimer/annuler le groupe */}
          <button
            onClick={() => {
              const isAlreadyDeprecated = deprecatedOffers.some(d =>
                d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type
              )
              if (isAlreadyDeprecated) {
                setDeprecatedOffers(prev => prev.filter(d =>
                  !(d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                ))
              } else {
                setDeprecatedOffers(prev => [...prev, {
                  offer_type: offersInGroup[0]?.offer_type || filterOfferType,
                  offer_name: groupName,
                  offer_ids: offersInGroup.map(o => o.id),
                  warning: 'Suppression manuelle demandée par l\'utilisateur.',
                }])
              }
            }}
            className={`p-1.5 rounded transition-colors ${
              deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                : 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20'
            }`}
            title={deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type) ? 'Annuler la suppression' : 'Supprimer cette offre'}
          >
            {deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type) ? <Undo2 size={16} /> : <Trash2 size={16} />}
          </button>
        </div>
      )}

      {/* Offres du groupe */}
      {offersInGroup.map((offer) => (
        <OfferRow
          key={offer.id}
          offer={offer}
          groupName={groupName}
          offersInGroup={offersInGroup}
          state={state}
        />
      ))}

      {/* Nouvelles puissances pour ce groupe (mode édition) */}
      {isEditMode && groupNewPowers.map(({ index }) => (
        <NewPowerRow key={`new-power-${index}`} state={state} index={index} />
      ))}

      {/* Bouton ajouter une puissance (mode édition) */}
      {isEditMode && (
        <button
          onClick={() => {
            const copiedFields: Record<string, string> = {}
            for (const key of requiredFields) {
              if (lastFields[key]) copiedFields[key] = lastFields[key]
            }
            setNewPowersData(prev => [...prev, { power: 0, fields: copiedFields, offer_name: groupName, offer_type: groupOfferType }])
          }}
          disabled={!isLastComplete}
          className={`w-full rounded-lg p-2 border-2 border-dashed transition-all flex items-center justify-center gap-2 ${
            isLastComplete
              ? 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600'
              : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
          }`}
          title={!isLastComplete ? 'Remplissez tous les champs de la ligne précédente avant d\'en ajouter une nouvelle' : undefined}
        >
          <Plus size={16} />
          <span className="font-medium text-xs">Ajouter une puissance</span>
        </button>
      )}

      {/* Dates de validité en bas */}
      {(groupValidFrom || groupValidTo) && (
        <div className="flex justify-end pt-2 gap-2">
          {groupValidFrom && (
            <span
              className="text-sm font-medium px-3 py-1 rounded-lg border text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/40 border-primary-300 dark:border-primary-700"
              title={`Tarif en vigueur depuis le ${new Date(groupValidFrom).toLocaleDateString('fr-FR')}`}
            >
              Depuis le {new Date(groupValidFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
          {groupValidTo && (
            <span
              className="text-sm font-medium px-3 py-1 rounded-lg border text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700"
              title={`Tarif expiré le ${new Date(groupValidTo).toLocaleDateString('fr-FR')}`}
            >
              Jusqu'au {new Date(groupValidTo).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// --- Éditeur de dates au niveau du groupe ---

export function GroupDateEditor({ offersInGroup, groupValidFrom, groupValidTo, editedOffers, setEditedOffers }: {
  offersInGroup: EnergyOffer[]
  groupValidFrom: string | null
  groupValidTo: string | null
  editedOffers: AllOffersState['editedOffers']
  setEditedOffers: AllOffersState['setEditedOffers']
}) {
  // Champs contrôlés : une date posée ailleurs (import IA, reset) doit s'afficher ici
  const firstOfferId = offersInGroup[0]?.id
  const editedGroupDateFrom = editedOffers[firstOfferId]?.valid_from
  const editedGroupDateTo = editedOffers[firstOfferId]?.valid_to
  const groupDateFromYMD = groupValidFrom ? groupValidFrom.split('T')[0] : ''
  const groupDateToYMD = groupValidTo ? groupValidTo.split('T')[0] : ''
  const currentDateFrom = editedGroupDateFrom ?? groupDateFromYMD
  const currentDateTo = editedGroupDateTo ?? groupDateToYMD
  const isDateFromModified = editedGroupDateFrom !== undefined && editedGroupDateFrom !== groupDateFromYMD
  const isDateToModified = editedGroupDateTo !== undefined && editedGroupDateTo !== groupDateToYMD

  // Propager la date à toutes les offres du groupe
  const propagateDate = (field: 'valid_from' | 'valid_to', value: string) => {
    setEditedOffers(prev => {
      const updated = { ...prev }
      for (const o of offersInGroup) {
        updated[o.id] = { ...updated[o.id], [field]: value }
      }
      return updated
    })
  }

  const dateInputClass = (modified: boolean) =>
    `w-[130px] px-2 py-1.5 text-sm rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
      modified
        ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
        : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
    }`

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Calendar size={14} className="text-gray-400 shrink-0" />
      <input
        type="date"
        value={currentDateFrom}
        onChange={(e) => propagateDate('valid_from', e.target.value)}
        className={dateInputClass(isDateFromModified)}
        title="Date de début de validité"
      />
      <span className="text-xs text-gray-400">→</span>
      <input
        type="date"
        value={currentDateTo}
        onChange={(e) => propagateDate('valid_to', e.target.value)}
        className={dateInputClass(isDateToModified)}
        title="Date de fin de validité (vide = offre active)"
        placeholder="Fin"
      />
      {currentDateTo && (
        <button
          type="button"
          onClick={() => propagateDate('valid_to', '')}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
          title="Effacer la date de fin (offre active)"
          aria-label="Effacer la date de fin (offre active)"
        >
          <X size={14} />
        </button>
      )}
      {(isDateFromModified || isDateToModified) && (
        <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded whitespace-nowrap">
          {isDateToModified && !currentDateTo ? 'Réactivée' : 'Date modifiée'}
        </span>
      )}
    </div>
  )
}

// --- Ligne de nouvelle puissance dans un groupe existant ---

function NewPowerRow({ state, index }: { state: AllOffersState; index: number }) {
  const {
    newPowersData, setNewPowersData,
    filterOfferType, dynamicPriceFields,
    isPowerAlreadyUsed, isNewPowerComplete,
  } = state

  const newPower = newPowersData[index]
  if (!newPower) return null

  const effectiveType = newPower.offer_type || filterOfferType
  const isDuplicate = isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name, newPower.valid_from, newPower.valid_to)
  const isIncomplete = !isNewPowerComplete(newPower)
  const hasError = isDuplicate || isIncomplete

  const updateField = (key: string, value: string) => {
    setNewPowersData(prev => prev.map((p, i) =>
      i === index ? { ...p, fields: { ...p.fields, [key]: value } } : p
    ))
  }

  return (
    <div
      className={`rounded-lg p-3 border transition-all ${
        isDuplicate
          ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
          : isIncomplete
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
            : 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
      }`}
    >
      {isDuplicate && (
        <div className="text-xs text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
          <AlertCircle size={12} />
          <span>Cette puissance existe déjà pour ce type d'offre</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {/* En-tête avec badges */}
        <div className="w-64 shrink-0">
          <div className="flex items-center gap-2">
            <Plus size={16} className={hasError ? (isDuplicate ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400') : 'text-green-600 dark:text-green-400'} />
            <h4 className={`font-medium text-sm ${hasError ? (isDuplicate ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300') : 'text-green-700 dark:text-green-300'}`}>Nouvelle puissance</h4>
            {newPower.offer_type && (
              <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded shrink-0">{newPower.offer_type}</span>
            )}
            {isDuplicate ? (
              <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded shrink-0">Existe déjà</span>
            ) : isIncomplete ? (
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded shrink-0">Incomplet</span>
            ) : (
              <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded shrink-0">Nouveau</span>
            )}
          </div>
        </div>

        {/* Puissance */}
        <div className="w-16 text-center shrink-0">
          <input
            type="number"
            min="1"
            max="100"
            value={newPower.power || ''}
            onChange={(e) => {
              const power = e.target.value ? parseInt(e.target.value) : 0
              setNewPowersData(prev => prev.map((p, i) => i === index ? { ...p, power } : p))
            }}
            className={`w-full px-2 py-1 text-xs font-medium text-center border rounded bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
              isDuplicate || !newPower.power || newPower.power <= 0
                ? 'border-red-400 dark:border-red-600 focus:ring-red-500'
                : 'border-green-300 dark:border-green-600 focus:ring-green-500'
            }`}
          />
        </div>

        {/* Abonnement */}
        <div className="flex items-center gap-2 w-[200px] shrink-0">
          <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Abo.<span className="text-red-500">*</span></span>
          <input
            type="number"
            step="0.01"
            value={newPower.fields.subscription_price ?? ''}
            onChange={(e) => updateField('subscription_price', e.target.value)}
            placeholder="0.00"
            className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
              !newPower.fields.subscription_price
                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                : 'border-green-300 dark:border-green-600 focus:ring-green-500'
            }`}
          />
          <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/mois</span>
        </div>

        {/* Tarifs via PriceFieldsEditor */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">
          <PriceFieldsEditor
            offerType={effectiveType}
            fields={newPower.fields}
            onChange={(key, value) => updateField(key, value)}
            dynamicFields={dynamicPriceFields}
          />
        </div>

        {/* Bouton supprimer */}
        <button
          onClick={() => setNewPowersData(prev => prev.filter((_, i) => i !== index))}
          className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors shrink-0"
          title="Supprimer cette puissance"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  )
}

// --- Nouvelles puissances orphelines (sans groupe existant) ---

export function OrphanNewPowers({ state }: { state: AllOffersState }) {
  const { isEditMode, newPowersData, groupNames } = state

  if (!isEditMode) return null

  const orphans = newPowersData
    .map((np, i) => ({ data: np, index: i }))
    .filter(({ data }) => !data.offer_name || !groupNames.includes(data.offer_name))

  if (orphans.length === 0) return null

  return (
    <>
      {orphans.map(({ index }) => (
        <NewPowerRow key={`orphan-power-${index}`} state={state} index={index} />
      ))}
    </>
  )
}
