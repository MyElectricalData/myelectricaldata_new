// Section pliable des offres expirées avec réactivation et suppression
// Gère : accordéon, rendu lecture/édition, appels API réactivation, modale suppression

import { ChevronDown, ChevronRight, Clock, Trash2, RotateCcw } from 'lucide-react'
import { energyApi, type EnergyOffer } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import OfferRow from './OfferRow'
import { getGroupNameWithoutPeriod, getGroupPeriodLabel, OFFER_TYPE_PRICE_FIELDS } from '../../utils/offerPricing'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface ExpiredOffersSectionProps {
  state: AllOffersState
}

export default function ExpiredOffersSection({ state }: ExpiredOffersSectionProps) {
  const {
    expiredGroupNames, groupedOffers,
    showExpiredSection, setShowExpiredSection,
    reactivatingGroups, setReactivatingGroups,
    setDeletingGroups,
    deleteConfirm, setDeleteConfirm,
    isPrivilegedUser,
    sortedProviders, filterProvider,
    queryClient,
  } = state

  if (expiredGroupNames.length === 0) return null

  // Trier les groupes expirés : plus récent d'abord, puis alphabétique
  const sortedExpired = [...expiredGroupNames].sort((a, b) => {
    const offersA = groupedOffers[a] || []
    const offersB = groupedOffers[b] || []
    const maxDateA = offersA.reduce((m, o) => o.valid_to && (!m || o.valid_to > m) ? o.valid_to : m, '' as string)
    const maxDateB = offersB.reduce((m, o) => o.valid_to && (!m || o.valid_to > m) ? o.valid_to : m, '' as string)
    if (maxDateA !== maxDateB) return maxDateB.localeCompare(maxDateA)
    return getGroupNameWithoutPeriod(a).localeCompare(getGroupNameWithoutPeriod(b))
  })

  // Réactiver un groupe (admin : API directe, utilisateur : contribution)
  const handleReactivate = async (gName: string, offers: EnergyOffer[]) => {
    if (reactivatingGroups.has(gName)) return
    setReactivatingGroups(prev => new Set(prev).add(gName))
    const cleanName = getGroupNameWithoutPeriod(gName)
    const periodLabel = getGroupPeriodLabel(gName)
    try {
      if (isPrivilegedUser) {
        for (const offer of offers) {
          await energyApi.updateOffer(offer.id, { valid_to: null, is_active: true } as unknown as Partial<EnergyOffer>)
        }
        toast.success(`${cleanName}${periodLabel ? ` (${periodLabel})` : ''} réactivé`)
        queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      } else {
        const provider = sortedProviders.find(p => p.id === filterProvider)
        const contributions = offers.map(offer => ({
          contribution_type: 'UPDATE_OFFER' as const,
          existing_provider_id: filterProvider,
          existing_offer_id: offer.id,
          provider_name: provider?.name || '',
          offer_name: `[REACTIVATION] ${offer.name}`,
          offer_type: offer.offer_type,
          description: `Demande de réactivation de l'offre ${cleanName}${periodLabel ? ` (${periodLabel})` : ''} (${offer.power_kva || '?'} kVA)`,
          power_kva: offer.power_kva || 0,
          price_sheet_url: '',
          valid_from: new Date().toISOString().split('T')[0],
        }))
        await energyApi.submitContributionBatch(contributions, '')
        toast.success(`Demande de réactivation soumise pour ${cleanName}${periodLabel ? ` (${periodLabel})` : ''}`)
        queryClient.invalidateQueries({ queryKey: ['contributions'] })
      }
    } catch {
      toast.error('Erreur lors de la réactivation')
    } finally {
      setReactivatingGroups(prev => {
        const next = new Set(prev)
        next.delete(gName)
        return next
      })
    }
  }

  // Supprimer un groupe (admin uniquement, après confirmation)
  const handleDelete = async (gName: string, offers: EnergyOffer[]) => {
    setDeleteConfirm(null)
    setDeletingGroups(prev => new Set(prev).add(gName))
    const cleanName = getGroupNameWithoutPeriod(gName)
    const periodLabel = getGroupPeriodLabel(gName)
    try {
      for (const offer of offers) {
        await energyApi.deleteOffer(offer.id)
      }
      toast.success(`${offers.length} offre${offers.length > 1 ? 's' : ''} supprimée${offers.length > 1 ? 's' : ''} (${cleanName}${periodLabel ? ` - ${periodLabel}` : ''})`)
      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeletingGroups(prev => {
        const next = new Set(prev)
        next.delete(gName)
        return next
      })
    }
  }

  return (
    <>
      <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-700 overflow-hidden">
        {/* Bouton accordéon */}
        <button
          onClick={() => setShowExpiredSection(!showExpiredSection)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors cursor-pointer"
        >
          {showExpiredSection ? <ChevronDown size={16} className="text-amber-500" /> : <ChevronRight size={16} className="text-amber-500" />}
          <Clock size={16} className="text-amber-500" />
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Offres expirées</span>
          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-200 dark:bg-amber-800 px-2 py-0.5 rounded-full">{expiredGroupNames.length}</span>
        </button>

        {/* Contenu accordéon */}
        {showExpiredSection && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {sortedExpired.map((gName) => {
              const offers = groupedOffers[gName]
              if (!offers) return null
              return (
                <ExpiredGroupRow
                  key={gName}
                  gName={gName}
                  offers={offers}
                  state={state}
                  onReactivate={() => handleReactivate(gName, offers)}
                  onDeleteRequest={() => setDeleteConfirm({ groupName: gName, offers })}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Modale de confirmation de suppression */}
      {deleteConfirm && (
        <DeleteConfirmModal
          deleteConfirm={deleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm.groupName, deleteConfirm.offers)}
        />
      )}
    </>
  )
}

// --- Ligne d'un groupe expiré ---

function ExpiredGroupRow({ gName, offers, state, onReactivate, onDeleteRequest }: {
  gName: string
  offers: EnergyOffer[]
  state: AllOffersState
  onReactivate: () => void
  onDeleteRequest: () => void
}) {
  const {
    isEditMode, isPrivilegedUser,
    reactivatingGroups, deletingGroups,
  } = state

  const cleanName = getGroupNameWithoutPeriod(gName)
  const latestValidTo = offers.reduce((latest, offer) => {
    if (!offer.valid_to) return latest
    if (!latest) return offer.valid_to
    return new Date(offer.valid_to) > new Date(latest) ? offer.valid_to : latest
  }, null as string | null)

  return (
    <div className="opacity-80">
      {/* En-tête */}
      <div className="px-4 py-2 bg-amber-50/50 dark:bg-amber-900/10 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{cleanName}</span>
        <div className="flex items-center gap-2">
          {latestValidTo && (
            <span className="text-xs text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-600 px-2 py-0.5 rounded">
              Expiré le {new Date(latestValidTo).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onReactivate() }}
            disabled={reactivatingGroups.has(gName)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-300 dark:border-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw size={12} className={reactivatingGroups.has(gName) ? 'animate-spin' : ''} />
            {reactivatingGroups.has(gName) ? 'Envoi...' : 'Réactiver'}
          </button>
          {isPrivilegedUser && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteRequest() }}
              disabled={deletingGroups.has(gName)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 border border-red-300 dark:border-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Trash2 size={12} className={deletingGroups.has(gName) ? 'animate-pulse' : ''} />
              {deletingGroups.has(gName) ? 'Suppression...' : 'Supprimer'}
            </button>
          )}
        </div>
      </div>

      {/* Offres du groupe */}
      <div className={isEditMode ? 'space-y-2 p-3' : 'divide-y divide-gray-200 dark:divide-gray-700'}>
        {offers.sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0)).map((offer) => {
          if (!isEditMode) {
            return <ExpiredOfferReadOnly key={offer.id} offer={offer} />
          }
          // Mode édition : utiliser OfferRow (sans actions de suppression)
          return (
            <OfferRow
              key={offer.id}
              offer={offer}
              groupName={gName}
              offersInGroup={offers}
              state={state}
              hideActions
            />
          )
        })}
      </div>
    </div>
  )
}

// --- Offre expirée en mode lecture ---

function ExpiredOfferReadOnly({ offer }: { offer: EnergyOffer }) {
  const priceFields = OFFER_TYPE_PRICE_FIELDS[offer.offer_type] || []

  return (
    <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">
        {offer.power_kva || '?'} kVA
      </span>
      <span className="text-gray-500 dark:text-gray-400 text-xs">
        Abo. <span className="font-semibold text-gray-700 dark:text-gray-300">{offer.subscription_price}</span> €/mois
      </span>
      {priceFields.map(field => {
        const value = (offer as unknown as Record<string, unknown>)[field.key]
        if (value == null) return null
        return (
          <span key={field.key} className="text-gray-500 dark:text-gray-400 text-xs">
            {field.label} <span className="font-semibold text-gray-700 dark:text-gray-300">{String(value)}</span> €/kWh
          </span>
        )
      })}
    </div>
  )
}

// --- Modale de confirmation de suppression ---

function DeleteConfirmModal({ deleteConfirm, onCancel, onConfirm }: {
  deleteConfirm: { groupName: string; offers: EnergyOffer[] }
  onCancel: () => void
  onConfirm: () => void
}) {
  const cleanName = getGroupNameWithoutPeriod(deleteConfirm.groupName)
  const periodLabel = getGroupPeriodLabel(deleteConfirm.groupName)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <Trash2 className="text-red-600 dark:text-red-400" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Supprimer définitivement</h3>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          Supprimer le groupe <strong>{cleanName}</strong>{periodLabel ? ` (${periodLabel})` : ''} ?
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {deleteConfirm.offers.length} offre{deleteConfirm.offers.length > 1 ? 's' : ''} ({deleteConfirm.offers.map(o => `${o.power_kva} kVA`).join(', ')}) seront supprimées de la base de données. Cette action est irréversible.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium flex items-center gap-2 text-sm"
          >
            <Trash2 size={16} />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}
