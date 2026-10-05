// Sélecteur de fournisseur : grille de boutons avec compteurs, export JSON, suppression
// + bouton "Proposer un nouveau fournisseur"

import { Building2, Plus, Copy, Trash2, Undo2 } from 'lucide-react'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface ProviderSelectorProps {
  state: AllOffersState
  showAIMode: boolean
}

export default function ProviderSelector({ state, showAIMode }: ProviderSelectorProps) {
  const {
    sortedProviders,
    activeOffersArray,
    offersArray,
    filterProvider, setFilterProvider,
    setFilterOfferType,
    isEditMode,
    providersToRemove, setProvidersToRemove,
    isAddingProvider, setIsAddingProvider,
    setNewProviderName,
    setNewProviderWebsite,
    confirmOrExecute,
    copyJsonToClipboard,
    buildOfferExportJson,
  } = state

  return (
    <div>
      <div className="mb-3">
        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Fournisseurs</label>
        <div className="mt-1 h-0.5 w-full bg-primary-500 rounded-full" />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {sortedProviders.map((provider) => {
          const isSelected = filterProvider === provider.id
          const providerOffersCount = activeOffersArray.filter(o => o.provider_id === provider.id).length
          const isMarkedForRemoval = providersToRemove.includes(provider.id)
          // Masquer les fournisseurs sans offre en mode lecture (vérifier aussi les offres expirées)
          if (!isEditMode && providerOffersCount === 0 && !offersArray.some(o => o.provider_id === provider.id)) return null
          return (
            <div
              key={provider.id}
              onClick={() => {
                if (!isMarkedForRemoval && provider.id !== filterProvider) {
                  confirmOrExecute(() => setFilterProvider(provider.id))
                }
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 flex-1 min-w-[calc((100%-0.5rem)/2)] sm:min-w-[calc((100%-1rem)/3)] md:min-w-[calc((100%-2rem)/5)] ${
                isMarkedForRemoval ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${
                isMarkedForRemoval
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 opacity-60'
                  : isSelected
                    ? 'bg-primary-600 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
              }`}
            >
              <span className={`px-1.5 py-0.5 text-xs rounded-full shrink-0 ${
                  isMarkedForRemoval
                    ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300'
                    : isSelected
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                }`}>
                  {providerOffersCount}
              </span>
              <span
                className={`flex-1 text-center ${isMarkedForRemoval ? 'line-through' : ''}`}
              >
                {provider.name}
              </span>
              <span className="flex items-center gap-1 shrink-0">
              {/* Bouton export JSON */}
              {providerOffersCount > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const providerOffers = offersArray.filter(o => o.provider_id === provider.id && o.is_active !== false)
                    const exportData = buildOfferExportJson(providerOffers, provider.name)
                    copyJsonToClipboard(exportData, `${providerOffersCount} offre(s) ${provider.name} copiées dans le presse-papier`)
                  }}
                  className={`p-1 rounded transition-all ${
                    isSelected
                      ? 'text-white/70 hover:text-white hover:bg-white/20'
                      : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title="Copier les offres en JSON"
                >
                  <Copy size={14} />
                </button>
              )}
              {/* Icône supprimer/restaurer (uniquement en mode édition, masqué en mode IA) */}
              {isEditMode && !showAIMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isMarkedForRemoval) {
                      setProvidersToRemove(prev => prev.filter(id => id !== provider.id))
                    } else {
                      setProvidersToRemove(prev => [...prev, provider.id])
                      // Si le fournisseur supprimé était sélectionné, désélectionner
                      if (isSelected) {
                        setFilterProvider('')
                        setFilterOfferType('all')
                      }
                    }
                  }}
                  className={`p-1 rounded transition-all ${
                    isMarkedForRemoval
                      ? 'text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/50'
                      : isSelected
                        ? 'text-white/70 hover:text-white hover:bg-white/20'
                        : 'text-red-400 dark:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50'
                  }`}
                  title={isMarkedForRemoval ? 'Annuler la suppression' : 'Proposer la suppression'}
                >
                  {isMarkedForRemoval ? <Undo2 size={14} /> : <Trash2 size={14} />}
                </button>
              )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Bouton ajouter un nouveau fournisseur (masqué en mode IA) */}
      {isEditMode && !isAddingProvider && !showAIMode && (
        <button
          onClick={() => {
            setIsAddingProvider(true)
            setNewProviderName('')
            setNewProviderWebsite('')
            setFilterProvider('')
            setFilterOfferType('all')
          }}
          className="w-full mt-3 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600"
          title="Proposer un nouveau fournisseur"
        >
          <Building2 size={16} />
          <Plus size={14} />
          <span>Proposer un nouveau fournisseur</span>
        </button>
      )}
    </div>
  )
}
