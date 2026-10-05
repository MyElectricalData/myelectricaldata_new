// Orchestrateur AllOffers — compose hooks + composants pour la page de gestion des offres
// Toute la logique est dans useAllOffersState, useAIImport, useOfferSubmission
// Le JSX est réparti dans les composants alloffers/

import { Package, Send, Eye, Pencil, Sparkles, Info } from 'lucide-react'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { useAllOffersState } from '../../hooks/useAllOffersState'
import { useAIImport } from '../../hooks/useAIImport'
import { useOfferSubmission } from '../../hooks/useOfferSubmission'
import ProviderSelector from '../alloffers/ProviderSelector'
import OfferTypeSelector from '../alloffers/OfferTypeSelector'
import AIImportPanel from '../alloffers/AIImportPanel'
import NewProviderForm from '../alloffers/NewProviderForm'
import NewGroupForm, { AddNewGroupButton, EmptyTypeMessage } from '../alloffers/NewGroupForm'
import OfferGroupCard, { GroupTabs, OrphanNewPowers } from '../alloffers/OfferGroupCard'
import ExpiredOffersSection from '../alloffers/ExpiredOffersSection'
import RecapModal from '../alloffers/RecapModal'
import ConfirmDialog from '../alloffers/ConfirmDialog'

export default function AllOffers() {
  const state = useAllOffersState()
  const { importAIJson } = useAIImport(state)
  const { submitAllModifications } = useOfferSubmission(state)

  const {
    isEditMode, setIsEditMode,
    filterProvider,
    filterOfferType,
    isAddingProvider,
    showAIMode, setShowAIMode,
    showRecapModal,
    confirmDialog, setConfirmDialog,
    activeOffersArray,
    sortedProviders,
    totalModificationsCount,
    hasAnyModifications,
    submittingOffers,
    confirmOrExecute,
    resetAllModifications,
    openRecapModal,
    newGroups,
    visibleGroupNames,
    selectedGroupName,
    setAiImportResult,
    setAiJsonInput,
    setShowExpiredSection,
  } = state

  // Overlay de chargement pendant la soumission
  if (submittingOffers) {
    return (
      <LoadingOverlay
        message="Envoi des contributions"
        subMessage="Veuillez patienter pendant l'envoi de vos modifications..."
      />
    )
  }

  return (
    <div className="card">
      {/* En-tête : titre + compteur + boutons mode */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="text-primary-600 dark:text-primary-400" size={20} />
            Offres disponibles
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {(() => {
              if (activeOffersArray.length === 0) return '0 offre'
              const selectedProvider = sortedProviders.find(p => p.id === filterProvider)
              const totalCount = filterProvider
                ? activeOffersArray.filter(o => o.provider_id === filterProvider).length
                : activeOffersArray.length
              return `${totalCount} offre(s)${selectedProvider ? ` pour ${selectedProvider.name}` : ''}`
            })()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isEditMode && filterProvider && (
            <button
              onClick={() => {
                setShowAIMode(!showAIMode)
                setAiImportResult(null)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showAIMode
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700'
              }`}
            >
              <Sparkles size={16} />
              Mode IA
            </button>
          )}
          <button
            onClick={() => {
              if (isEditMode) {
                confirmOrExecute(() => {
                  resetAllModifications()
                  setShowAIMode(false)
                  setAiJsonInput('')
                  setAiImportResult(null)
                  setIsEditMode(false)
                })
                return
              }
              setShowExpiredSection(false)
              setIsEditMode(true)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isEditMode
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {isEditMode ? (
              <>
                <Eye size={16} />
                Mode lecture
              </>
            ) : (
              <>
                <Pencil size={16} />
                Proposer des modifications
              </>
            )}
          </button>
        </div>
      </div>

      {/* Encadré d'information en mode édition */}
      {isEditMode && <EditModeInfo />}

      {/* Filtres : fournisseur, import IA, nouveau fournisseur, type d'offre */}
      <div className="mb-6 space-y-4">
        <ProviderSelector state={state} showAIMode={showAIMode} />
        {showAIMode && isEditMode && filterProvider && (
          <AIImportPanel state={state} importAIJson={importAIJson} />
        )}
        {isAddingProvider && <NewProviderForm state={state} />}
        {!isAddingProvider && !showAIMode && filterProvider && (
          <OfferTypeSelector state={state} />
        )}
      </div>

      {/* Sans fournisseur ou sans type choisi : inviter à sélectionner (ni groupes ni création) */}
      {!showAIMode && (!filterProvider || filterOfferType === 'all') && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
          <p className="text-lg mb-2">
            {!filterProvider
              ? 'Sélectionnez un fournisseur pour voir les offres disponibles'
              : 'Sélectionnez un type d\'offre pour afficher les tarifs'}
          </p>
          <p className="text-sm">
            Vous pourrez ensuite modifier les tarifs et soumettre vos contributions.
          </p>
        </div>
      )}

      {/* Contenu principal (masqué en mode IA) */}
      {!showAIMode && filterProvider && filterOfferType !== 'all' && (
        <>
          {/* Onglets de groupes d'offres (mode lecture) */}
          <GroupTabs state={state} />

          {/* Groupes d'offres existants */}
          {(isEditMode ? visibleGroupNames : visibleGroupNames.filter(g => g === selectedGroupName)).map((groupName) => (
            <OfferGroupCard key={`group-${groupName}`} state={state} groupName={groupName} />
          ))}

          {/* Nouveaux groupes d'offres */}
          {newGroups.map((_, idx) => (
            <NewGroupForm key={`new-group-${idx}`} state={state} groupIndex={idx} />
          ))}

          {/* Bouton créer un nouveau groupe (mode édition) */}
          {isEditMode && filterProvider && <AddNewGroupButton state={state} />}

          {/* Nouvelles puissances orphelines (non rattachées à un groupe) */}
          <OrphanNewPowers state={state} />

          {/* Message quand aucune offre pour le type sélectionné */}
          <EmptyTypeMessage state={state} />

          {/* Section offres expirées */}
          <ExpiredOffersSection state={state} />

          {/* Spacer pour le bouton flottant (après la dernière section, pour ne rien masquer) */}
          {isEditMode && hasAnyModifications && <div className="h-16" />}
        </>
      )}

      {/* Bouton flottant de soumission */}
      {isEditMode && hasAnyModifications && !showRecapModal && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-gradient-to-t from-gray-900/90 via-gray-900/70 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <button
              onClick={() => openRecapModal()}
              className="w-full rounded-xl p-3.5 bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/30 hover:shadow-primary-600/50 transition-all flex items-center justify-center gap-3"
            >
              <Send size={20} />
              <span className="font-semibold">Voir le récapitulatif et soumettre</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {totalModificationsCount}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Modale de récapitulatif */}
      {showRecapModal && (
        <RecapModal
          state={state}
          submitAllModifications={submitAllModifications}
          submittingOffers={submittingOffers}
        />
      )}

      {/* Modale de confirmation avant perte de modifications */}
      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          onClose={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}

// --- Encadré d'information mode édition ---

function EditModeInfo() {
  return (
    <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-start gap-3">
        <Info size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-medium mb-2">Mode édition activé</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Sélectionnez <strong>un fournisseur</strong> et <strong>un type d'offre</strong> pour proposer des modifications.</li>
            <li>Chaque soumission concerne <strong>un seul fournisseur</strong> et <strong>un seul type d'offre</strong> à la fois.</li>
            <li>Vos modifications seront <strong>vérifiées et validées</strong> par un administrateur ou modérateur avant publication.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
