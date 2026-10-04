// Modale de récapitulatif avant soumission des modifications
// Affiche : offres modifiées, nouvelles puissances, nouveaux groupes, suppressions, renommages
// Permet la sélection/désélection individuelle via checkboxes

import { Send, X, Plus, Trash2, Pencil, AlertCircle, Package, Zap, Link } from 'lucide-react'
import type { EnergyOffer } from '@/api/energy'
import { getFieldKeysForOfferType, getLabelColor, getCleanOfferName, periodsOverlap } from '../../utils/offerPricing'
import { FIELD_LABELS } from '../../types'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface RecapModalProps {
  state: AllOffersState
  submitAllModifications: (directApply?: boolean) => void
  submittingOffers: boolean
}

export default function RecapModal({ state, submitAllModifications, submittingOffers }: RecapModalProps) {
  const {
    offersArray, isPrivilegedUser,
    powersToRemove,
    providersToRemove, deprecatedOffers,
    editedOfferNames,
    sortedProviders,
    showRecapModal, setShowRecapModal,
    priceSheetUrl, setPriceSheetUrl,
    totalModificationsCount, hasModifiedGroupNames,
    hasDuplicatePowers,
    hasIncompletePowers, hasIncompleteGroups, hasGroupDuplicatePowers,
    resetAllModifications,
  } = state

  if (!showRecapModal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRecapModal(false)} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-primary-600 dark:bg-primary-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Send size={20} className="text-white" />
            <h3 className="text-lg font-bold text-white">Récapitulatif</h3>
            <span className="bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
              {totalModificationsCount} modification{totalModificationsCount > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={() => setShowRecapModal(false)}
            className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            aria-label="Fermer"
          >
            <X size={18} className="text-white" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* Checkbox tout sélectionner */}
            <GlobalSelectAll state={state} />

            {/* Offres modifiées (tableau unifié) */}
            <ModifiedOffersSection state={state} />

            {/* Fournisseurs à supprimer */}
            {providersToRemove.length > 0 && (
              <RecapSection
                icon={<Trash2 size={14} />}
                title="Suppression de fournisseurs"
                variant="red"
              >
                {providersToRemove.map(providerId => {
                  const provider = sortedProviders.find(p => p.id === providerId)
                  const count = offersArray.filter(o => o.provider_id === providerId).length
                  return (
                    <div key={providerId} className="px-4 py-2 flex items-center justify-between">
                      <span className="text-sm text-red-700 dark:text-red-300">{provider?.name || 'Fournisseur inconnu'}</span>
                      <span className="text-xs text-red-500 dark:text-red-400">{count} offre{count > 1 ? 's' : ''}</span>
                    </div>
                  )
                })}
              </RecapSection>
            )}

            {/* Offres deprecated */}
            {deprecatedOffers.length > 0 && (
              <RecapSection
                icon={<Trash2 size={14} />}
                title={`Offres obsolètes signalées par l'IA (${deprecatedOffers.reduce((sum, d) => sum + d.offer_ids.length, 0)})`}
                variant="orange"
              >
                {deprecatedOffers.map((dep, index) => (
                  <div key={`deprecated-${index}`} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{dep.offer_name}</span>
                      <span className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">{dep.offer_type}</span>
                      <span className="text-xs text-orange-500 dark:text-orange-400 ml-auto">{dep.offer_ids.length} offre{dep.offer_ids.length > 1 ? 's' : ''}</span>
                    </div>
                    {dep.warning && <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 italic">{dep.warning}</p>}
                  </div>
                ))}
              </RecapSection>
            )}

            {/* Nouvelles puissances (regroupées par offre + période) */}
            <NewPowersSection state={state} />

            {/* Puissances à supprimer */}
            {powersToRemove.length > 0 && (
              <RecapSection icon={<Trash2 size={14} />} title="Suppression de puissances" variant="red">
                {[...powersToRemove].sort((a, b) => a.power - b.power).map(({ power, groupName }) => (
                  <div key={`remove-${groupName}-${power}`} className="px-4 py-2 flex items-center justify-between text-red-600 dark:text-red-400">
                    <span className="text-xs flex items-center gap-1"><Trash2 size={12} /> Supprimer <span className="text-gray-500 dark:text-gray-400">({groupName})</span></span>
                    <span className="text-xs font-semibold">{power} kVA</span>
                  </div>
                ))}
              </RecapSection>
            )}

            {/* Renommages */}
            {hasModifiedGroupNames && (
              <RecapSection icon={<Pencil size={14} />} title="Renommages" variant="amber">
                {Object.entries(editedOfferNames)
                  .filter(([renameKey, newName]) => {
                    const originalName = renameKey.split('::')[0]
                    return newName !== originalName && newName.trim() !== ''
                  })
                  .map(([renameKey, newName]) => {
                    const [originalName, offerType] = renameKey.split('::')
                    return (
                      <div key={`rename-${renameKey}`} className="px-4 py-2 flex items-center gap-2 text-xs">
                        <span className="text-red-500 line-through">{originalName}</span>
                        <span className="text-gray-400">→</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">{newName}</span>
                        {offerType && <span className="text-gray-400 ml-1">({offerType})</span>}
                      </div>
                    )
                  })}
              </RecapSection>
            )}

            {/* Nouveaux groupes */}
            <NewGroupsSection state={state} />

            {/* Avertissement si aucune modification */}
            <NoModificationsWarning state={state} />
          </div>

          {/* Lien fiche tarifaire + erreurs */}
          {totalModificationsCount > 0 && (
            <>
              <div className="mt-6 p-4 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium text-primary-700 dark:text-primary-300 mb-2">
                  <Link size={16} />
                  Lien vers la fiche tarifaire officielle
                  {!isPrivilegedUser && <span className="text-red-500">*</span>}
                  {isPrivilegedUser && <span className="text-gray-500 text-xs font-normal">(optionnel)</span>}
                </label>
                <input
                  type="url"
                  value={priceSheetUrl}
                  onChange={(e) => setPriceSheetUrl(e.target.value)}
                  placeholder="https://www.edf.fr/grille-tarifaire.pdf"
                  className={`w-full px-4 py-2 rounded-lg border ${
                    priceSheetUrl && !priceSheetUrl.startsWith('http')
                      ? 'border-red-400 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none`}
                />
                {!priceSheetUrl && !isPrivilegedUser && (
                  <p className="mt-2 text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Ce champ est obligatoire pour valider vos modifications
                  </p>
                )}
              </div>

              {hasDuplicatePowers && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Certaines puissances que vous souhaitez ajouter existent déjà.
                  </p>
                </div>
              )}

              {(hasIncompletePowers || hasIncompleteGroups) && !hasDuplicatePowers && !hasGroupDuplicatePowers && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Veuillez renseigner tous les champs obligatoires.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
          {totalModificationsCount > 0 ? (
            <>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRecapModal(false)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => { submitAllModifications(); setShowRecapModal(false) }}
                  disabled={submittingOffers || (!isPrivilegedUser && !priceSheetUrl) || (priceSheetUrl.length > 0 && !priceSheetUrl.startsWith('http')) || hasDuplicatePowers || hasIncompletePowers || hasIncompleteGroups || hasGroupDuplicatePowers}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send size={18} />
                  {submittingOffers ? 'Envoi en cours...' : 'Soumettre'}
                </button>
              </div>
              {isPrivilegedUser && (
                <button
                  onClick={() => { submitAllModifications(true); setShowRecapModal(false) }}
                  disabled={submittingOffers || hasDuplicatePowers || hasIncompletePowers || hasIncompleteGroups || hasGroupDuplicatePowers}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Zap size={18} />
                  {submittingOffers ? 'Application en cours...' : 'Appliquer directement (sans validation)'}
                </button>
              )}
              <button
                onClick={() => { resetAllModifications(); setShowRecapModal(false) }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
              >
                <X size={18} />
                Tout annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowRecapModal(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Checkbox tout sélectionner/désélectionner ---

function GlobalSelectAll({ state }: { state: AllOffersState }) {
  const { offersArray, filterProvider, isOfferModified, recapExcludedPowers, setRecapExcludedPowers } = state
  const allModified = offersArray.filter(o => o.provider_id === filterProvider && isOfferModified(o))
  if (allModified.length === 0) return null

  const allSelected = allModified.every(o => !recapExcludedPowers.has(`modified-${o.id}`))
  const noneSelected = allModified.every(o => recapExcludedPowers.has(`modified-${o.id}`))

  return (
    <div className="flex items-center gap-3 px-1">
      <input
        type="checkbox"
        checked={allSelected}
        ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
        onChange={() => {
          setRecapExcludedPowers(prev => {
            const next = new Set(prev)
            if (allSelected) {
              allModified.forEach(o => next.add(`modified-${o.id}`))
            } else {
              allModified.forEach(o => next.delete(`modified-${o.id}`))
            }
            return next
          })
        }}
        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
      />
      <span className="text-sm text-gray-700 dark:text-gray-300">
        {allSelected ? 'Tout désélectionner' : noneSelected ? 'Tout sélectionner' : `${allModified.filter(o => !recapExcludedPowers.has(`modified-${o.id}`)).length}/${allModified.length} sélectionnés`}
      </span>
    </div>
  )
}

// --- Section offres modifiées (tableau par groupe) ---

function ModifiedOffersSection({ state }: { state: AllOffersState }) {
  const {
    offersArray, filterProvider, isOfferModified,
    editedOffers, unchangedOfferIds,
    recapExcludedPowers, setRecapExcludedPowers,
  } = state

  // Toutes les offres concernées (modifiées ou inchangées marquées par l'IA)
  const allRelevant = offersArray
    .filter(o => o.provider_id === filterProvider && o.is_active !== false && (isOfferModified(o) || unchangedOfferIds.has(o.id)))
    .sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))

  if (allRelevant.length === 0) return null

  // Regrouper par (clean name + offer_type)
  const groups: Record<string, typeof allRelevant> = {}
  for (const offer of allRelevant) {
    const cleanName = getCleanOfferName(offer.name)
    const groupKey = `${cleanName}##${offer.offer_type}`
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(offer)
  }

  // Trier : groupes modifiés en premier
  const sortedEntries = Object.entries(groups).sort(([, a], [, b]) => {
    const hasModA = a.some(o => isOfferModified(o))
    const hasModB = b.some(o => isOfferModified(o))
    if (hasModA && !hasModB) return -1
    if (!hasModA && hasModB) return 1
    return 0
  })

  return (
    <>
      {sortedEntries.map(([groupKey, offers]) => {
        const [groupName, groupType] = groupKey.split('##')
        const fieldKeys = getFieldKeysForOfferType(groupType)
        const modifiedOffers = offers.filter(o => isOfferModified(o))
        const allUnchanged = modifiedOffers.length === 0
        const selectedCount = modifiedOffers.filter(o => !recapExcludedPowers.has(`modified-${o.id}`)).length
        const allSelected = selectedCount === modifiedOffers.length
        const noneSelected = selectedCount === 0

        return (
          <div key={groupKey} className={`rounded-lg border overflow-hidden ${allUnchanged ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}>
            {/* En-tête du groupe */}
            <div className={`px-4 py-2.5 font-semibold text-sm border-b flex items-center gap-2 ${allUnchanged ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700'}`}>
              {groupName}
              <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded font-medium">{groupType}</span>
              {allUnchanged ? (
                <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ml-auto">
                  <AlertCircle size={10} /> Déjà en base
                </span>
              ) : (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">{modifiedOffers.length} modif.</span>
                  <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{selectedCount}/{modifiedOffers.length}</span>
                </div>
              )}
            </div>

            {/* Tableau des offres */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={allUnchanged ? 'bg-red-100/50 dark:bg-red-900/20' : 'bg-gray-100/50 dark:bg-gray-800/50'}>
                    <th className="px-2 py-1.5 w-8">
                      {modifiedOffers.length > 0 && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
                          onChange={() => {
                            setRecapExcludedPowers(prev => {
                              const next = new Set(prev)
                              if (allSelected) modifiedOffers.forEach(o => next.add(`modified-${o.id}`))
                              else modifiedOffers.forEach(o => next.delete(`modified-${o.id}`))
                              return next
                            })
                          }}
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                    {fieldKeys.map(k => (
                      <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(FIELD_LABELS[k] || k)}`}>{FIELD_LABELS[k] || k}</th>
                    ))}
                    {offers.some(o => unchangedOfferIds.has(o.id)) && <th className="px-2 py-1.5 w-8"></th>}
                  </tr>
                </thead>
                <tbody className={`divide-y ${allUnchanged ? 'divide-red-200 dark:divide-red-800' : 'divide-gray-200 dark:divide-gray-700'}`}>
                  {offers.map(offer => (
                    <RecapOfferRow
                      key={offer.id}
                      offer={offer}
                      fieldKeys={fieldKeys}
                      isModified={isOfferModified(offer)}
                      isUnchanged={!isOfferModified(offer) && unchangedOfferIds.has(offer.id)}
                      edited={editedOffers[offer.id] || {}}
                      isExcluded={isOfferModified(offer) && recapExcludedPowers.has(`modified-${offer.id}`)}
                      hasUnchangedColumn={offers.some(o => unchangedOfferIds.has(o.id))}
                      onToggle={() => {
                        const key = `modified-${offer.id}`
                        setRecapExcludedPowers(prev => {
                          const next = new Set(prev)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </>
  )
}

// --- Ligne d'offre dans le récap ---

function RecapOfferRow({ offer, fieldKeys, isModified, isUnchanged, edited, isExcluded, hasUnchangedColumn, onToggle }: {
  offer: EnergyOffer
  fieldKeys: string[]
  isModified: boolean
  isUnchanged: boolean
  edited: Record<string, string>
  isExcluded: boolean
  hasUnchangedColumn: boolean
  onToggle: () => void
}) {
  const allFields = ['subscription_price', ...fieldKeys]

  return (
    <tr className={`${isModified && !isExcluded ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''} ${isUnchanged ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isExcluded ? 'opacity-30' : ''}`}>
      <td className="px-2 py-1.5 text-center">
        {isModified ? (
          <input
            type="checkbox"
            checked={!isExcluded}
            onChange={onToggle}
            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
          />
        ) : isUnchanged ? (
          <AlertCircle size={14} className="text-red-500 dark:text-red-400 inline" />
        ) : null}
      </td>
      <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{offer.power_kva || '?'}</td>
      {allFields.map(key => {
        const origVal = Number((offer as unknown as Record<string, unknown>)[key])
        const isSub = key === 'subscription_price'
        const editedVal = edited[key]
        const hasChange = editedVal !== undefined && (() => {
          const next = Number(editedVal)
          if (isNaN(origVal) && isNaN(next)) return false
          if (isNaN(origVal) || isNaN(next)) return true
          return Math.abs(origVal - next) > 0.00001
        })()
        return (
          <td key={key} className={`${isSub ? 'px-3' : 'px-2'} py-1.5 text-right font-mono`}>
            {hasChange ? (
              <span className="flex items-center justify-end gap-1">
                <span className="text-red-500 line-through">{isNaN(origVal) ? '-' : origVal.toFixed(isSub ? 2 : 4)}</span>
                <span className="text-gray-400">→</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">{Number(editedVal).toFixed(isSub ? 2 : 4)}</span>
              </span>
            ) : (
              <span className="text-gray-700 dark:text-gray-300">{isNaN(origVal) ? '-' : origVal.toFixed(isSub ? 2 : 4)}</span>
            )}
          </td>
        )
      })}
      {hasUnchangedColumn && (
        <td className="px-2 py-1.5 text-center">
          {isUnchanged && <AlertCircle size={12} className="text-red-500 inline" />}
        </td>
      )}
    </tr>
  )
}

// --- Section nouvelles puissances (regroupées par offre + période) ---

function NewPowersSection({ state }: { state: AllOffersState }) {
  const { newPowersData, filterOfferType, recapExcludedPowers, setRecapExcludedPowers } = state
  if (newPowersData.length === 0) return null

  // Regrouper par offre + période
  const grouped: Record<string, Array<{ data: typeof newPowersData[0]; globalIndex: number }>> = {}
  for (let i = 0; i < newPowersData.length; i++) {
    const np = newPowersData[i]
    const offerKey = `${np.offer_name || 'Sans nom'} (${np.offer_type || filterOfferType})`
    const periodKey = np.valid_from
      ? (np.valid_to
        ? `${new Date(np.valid_from).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })} → ${new Date(np.valid_to).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}`
        : `Valide depuis ${new Date(np.valid_from).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}`)
      : 'Offre active'
    const groupKey = `${offerKey}##${periodKey}`
    if (!grouped[groupKey]) grouped[groupKey] = []
    grouped[groupKey].push({ data: np, globalIndex: i })
  }

  return (
    <>
      {Object.entries(grouped).map(([groupKey, powersWithIndex]) => {
        const [offerInfo, periodInfo] = groupKey.split('##')
        const fieldKeys = powersWithIndex[0] ? getFieldKeysForOfferType(powersWithIndex[0].data.offer_type || filterOfferType) : []
        const selectedCount = powersWithIndex.filter(p => !recapExcludedPowers.has(`newpower-${p.globalIndex}`)).length
        const allSelected = selectedCount === powersWithIndex.length
        const noneSelected = selectedCount === 0

        return (
          <div key={groupKey} className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 overflow-hidden">
            <div className="px-4 py-2.5 bg-green-100 dark:bg-green-900/40 font-semibold text-sm text-green-800 dark:text-green-300 border-b border-green-200 dark:border-green-700 flex items-center gap-2 flex-wrap">
              <Plus size={14} />
              {offerInfo}
              <span className="text-xs font-normal text-green-600 dark:text-green-400">{periodInfo}</span>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-xs font-normal text-green-600 dark:text-green-400">{selectedCount}/{powersWithIndex.length}</span>
                <button
                  onClick={() => setRecapExcludedPowers(prev => { const next = new Set(prev); powersWithIndex.forEach(p => next.delete(`newpower-${p.globalIndex}`)); return next })}
                  disabled={allSelected}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${allSelected ? 'text-gray-400 dark:text-gray-600 cursor-default' : 'text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/30'}`}
                >Tous</button>
                <button
                  onClick={() => setRecapExcludedPowers(prev => { const next = new Set(prev); powersWithIndex.forEach(p => next.add(`newpower-${p.globalIndex}`)); return next })}
                  disabled={noneSelected}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${noneSelected ? 'text-gray-400 dark:text-gray-600 cursor-default' : 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
                >Aucun</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-green-100/50 dark:bg-green-900/20">
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                    {fieldKeys.map(k => (
                      <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(FIELD_LABELS[k] || k)}`}>{FIELD_LABELS[k] || k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-200 dark:divide-green-800">
                  {powersWithIndex.map(({ data: np, globalIndex }) => {
                    const isExcluded = recapExcludedPowers.has(`newpower-${globalIndex}`)
                    return (
                      <tr key={`add-${globalIndex}`} className={isExcluded ? 'opacity-40' : ''}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={!isExcluded}
                            onChange={() => {
                              setRecapExcludedPowers(prev => {
                                const next = new Set(prev)
                                if (next.has(`newpower-${globalIndex}`)) next.delete(`newpower-${globalIndex}`)
                                else next.add(`newpower-${globalIndex}`)
                                return next
                              })
                            }}
                            className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{np.power}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{np.fields.subscription_price || '-'}</td>
                        {fieldKeys.map(k => (
                          <td key={k} className="px-2 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">{np.fields[k] || '-'}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </>
  )
}

// --- Section nouveaux groupes ---

function NewGroupsSection({ state }: { state: AllOffersState }) {
  const { newGroups, filterOfferType, existingPowers, recapExcludedPowers, setRecapExcludedPowers } = state
  if (newGroups.length === 0) return null

  return (
    <>
      {newGroups.map((group, index) => {
        const groupType = group.offer_type || filterOfferType
        const fieldKeys = getFieldKeysForOfferType(groupType)
        const isAlreadyInDb = group.alreadyInDb === true
        const hasDuplicates = !isAlreadyInDb && group.powers.some(p => p.power > 0 && existingPowers.some(ep =>
          ep.power === p.power && ep.offer_type === groupType &&
          periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
        ))
        const selectedCount = group.powers.filter((_, pi) => !recapExcludedPowers.has(`group-${index}-${pi}`)).length
        const allSelected = selectedCount === group.powers.length
        const noneSelected = selectedCount === 0

        const containerClass = hasDuplicates || isAlreadyInDb
          ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
        const headerClass = hasDuplicates || isAlreadyInDb
          ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700'
          : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700'

        return (
          <div key={`recap-group-${index}`} className={`rounded-lg border overflow-hidden ${containerClass}`}>
            {/* En-tête */}
            <div className={`px-4 py-2.5 font-semibold text-sm border-b flex items-center gap-2 flex-wrap ${headerClass}`}>
              <Package size={14} />
              {group.name || <span className="italic text-gray-400">Sans nom</span>}
              {group.offer_type && (
                <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded font-medium">{group.offer_type}</span>
              )}
              {(group.validFrom || group.validTo) && (
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  {group.validFrom && group.validTo
                    ? `${new Date(group.validFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} → ${new Date(group.validTo).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
                    : group.validFrom ? `Depuis ${new Date(group.validFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                </span>
              )}
              {isAlreadyInDb && (
                <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ml-auto">
                  <AlertCircle size={10} /> Déjà en base
                </span>
              )}
              {hasDuplicates && (
                <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  <AlertCircle size={10} /> Doublons détectés
                </span>
              )}
              {!isAlreadyInDb && <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto">{selectedCount}/{group.powers.length}</span>}
            </div>

            {/* Tableau */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`${hasDuplicates || isAlreadyInDb ? 'bg-red-100/50 dark:bg-red-900/20' : 'bg-blue-100/50 dark:bg-blue-900/20'}`}>
                    <th className="px-2 py-1.5 w-8">
                      {!isAlreadyInDb && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
                          onChange={() => {
                            setRecapExcludedPowers(prev => {
                              const next = new Set(prev)
                              if (allSelected) group.powers.forEach((_, pi) => next.add(`group-${index}-${pi}`))
                              else group.powers.forEach((_, pi) => next.delete(`group-${index}-${pi}`))
                              return next
                            })
                          }}
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                    {fieldKeys.map(k => (
                      <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(FIELD_LABELS[k] || k)}`}>{FIELD_LABELS[k] || k}</th>
                    ))}
                    {hasDuplicates && <th className="px-2 py-1.5 w-8"></th>}
                  </tr>
                </thead>
                <tbody className={`divide-y ${hasDuplicates || isAlreadyInDb ? 'divide-red-200 dark:divide-red-800' : 'divide-blue-200 dark:divide-blue-700'}`}>
                  {group.powers.map((power, powerIndex) => {
                    const isDup = power.power > 0 && existingPowers.some(ep =>
                      ep.power === power.power && ep.offer_type === groupType &&
                      periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
                    )
                    const exclusionKey = `group-${index}-${powerIndex}`
                    const isExcluded = recapExcludedPowers.has(exclusionKey)
                    return (
                      <tr key={`recap-group-${index}-power-${powerIndex}`} className={`${isDup ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isExcluded && !isAlreadyInDb ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5 text-center">
                          {isAlreadyInDb ? (
                            <AlertCircle size={14} className="text-red-500 dark:text-red-400 inline" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => {
                                setRecapExcludedPowers(prev => {
                                  const next = new Set(prev)
                                  if (next.has(exclusionKey)) next.delete(exclusionKey)
                                  else next.add(exclusionKey)
                                  return next
                                })
                              }}
                              className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{power.power || '?'}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{power.fields.subscription_price || '-'}</td>
                        {fieldKeys.map(k => (
                          <td key={k} className="px-2 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">{power.fields[k] || '-'}</td>
                        ))}
                        {hasDuplicates && (
                          <td className="px-2 py-1.5 text-center">
                            {isDup && <AlertCircle size={12} className="text-red-500 inline" />}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </>
  )
}

// --- Avertissement aucune modification ---

function NoModificationsWarning({ state }: { state: AllOffersState }) {
  const {
    offersArray, filterProvider, isOfferModified,
    unchangedOfferIds, newPowersData, powersToRemove,
    providersToRemove, deprecatedOffers, newGroups,
    hasModifiedGroupNames,
  } = state

  const hasAnyContent =
    offersArray.some(o => o.provider_id === filterProvider && isOfferModified(o)) ||
    unchangedOfferIds.size > 0 ||
    newPowersData.length > 0 ||
    powersToRemove.length > 0 ||
    providersToRemove.length > 0 ||
    deprecatedOffers.length > 0 ||
    newGroups.length > 0 ||
    hasModifiedGroupNames

  if (hasAnyContent) return null

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 p-4 flex items-start gap-3">
      <AlertCircle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          Aucune modification significative détectée
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Les valeurs importées sont identiques aux tarifs actuels. Si vous avez utilisé le mode IA, vérifiez que les données de l'IA sont à jour.
        </p>
      </div>
    </div>
  )
}

// --- Conteneur de section récap ---

function RecapSection({ icon, title, variant, children }: {
  icon: React.ReactNode
  title: string
  variant: 'red' | 'orange' | 'amber' | 'green' | 'blue'
  children: React.ReactNode
}) {
  const colors = {
    red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', header: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700', divider: 'divide-red-200 dark:divide-red-800' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', header: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-700', divider: 'divide-orange-200 dark:divide-orange-800' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-700', header: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700', divider: 'divide-amber-200 dark:divide-amber-700' },
    green: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-700', header: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700', divider: 'divide-green-200 dark:divide-green-800' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700', header: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700', divider: 'divide-blue-200 dark:divide-blue-700' },
  }
  const c = colors[variant]

  return (
    <div className={`${c.bg} rounded-lg border ${c.border} overflow-hidden`}>
      <div className={`px-4 py-2.5 font-semibold text-sm border-b ${c.header} flex items-center gap-2`}>
        {icon}
        {title}
      </div>
      <div className={`divide-y ${c.divider}`}>
        {children}
      </div>
    </div>
  )
}
