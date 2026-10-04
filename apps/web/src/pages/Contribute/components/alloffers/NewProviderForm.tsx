// Formulaire de création d'un nouveau fournisseur
// Inline dans la zone des fournisseurs, avec champs nom + site web

import { Building2, Plus, X } from 'lucide-react'
import { energyApi } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import type { AllOffersState } from '../../hooks/useAllOffersState'

interface NewProviderFormProps {
  state: AllOffersState
}

export default function NewProviderForm({ state }: NewProviderFormProps) {
  const {
    sortedProviders,
    queryClient,
    isAddingProvider, setIsAddingProvider,
    newProviderName, setNewProviderName,
    newProviderWebsite, setNewProviderWebsite,
    creatingProvider, setCreatingProvider,
    setFilterProvider,
  } = state

  const handleCancel = () => {
    setIsAddingProvider(false)
    setNewProviderName('')
    setNewProviderWebsite('')
    const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
    if (edf) {
      setFilterProvider(edf.id)
    } else if (sortedProviders.length > 0) {
      setFilterProvider(sortedProviders[0].id)
    }
  }

  const handleCreate = async () => {
    if (!newProviderName.trim()) {
      toast.error('Veuillez renseigner le nom du fournisseur')
      return
    }
    setCreatingProvider(true)
    try {
      const response = await energyApi.createProvider({
        name: newProviderName.trim(),
        website: newProviderWebsite.trim() || undefined,
      })
      if (response.success && response.data) {
        toast.success(`Fournisseur "${newProviderName.trim()}" créé`)
        queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
        setIsAddingProvider(false)
        setNewProviderName('')
        setNewProviderWebsite('')
        setFilterProvider(response.data.id)
      } else {
        toast.error(response.error?.message || 'Erreur lors de la création')
      }
    } catch {
      toast.error('Erreur lors de la création du fournisseur')
    }
    setCreatingProvider(false)
  }

  if (!isAddingProvider) return null

  return (
    <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
          <Building2 size={18} />
          Nouveau fournisseur
        </h3>
        <button
          onClick={handleCancel}
          className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          title="Annuler"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Nom du fournisseur <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={newProviderName}
            onChange={(e) => setNewProviderName(e.target.value)}
            placeholder="Ex: OHM Energie, Mint Energie..."
            className="w-full px-4 py-2 rounded-lg border-2 border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:outline-none"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Site web
          </label>
          <input
            type="text"
            value={newProviderWebsite}
            onChange={(e) => setNewProviderWebsite(e.target.value)}
            placeholder="Ex: https://www.edf.fr"
            className="w-full px-4 py-2 rounded-lg border-2 border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={handleCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors"
        >
          <X size={16} />
          Annuler
        </button>
        <button
          onClick={handleCreate}
          disabled={creatingProvider || !newProviderName.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          <Plus size={16} />
          {creatingProvider ? 'Création...' : 'Créer le fournisseur'}
        </button>
      </div>
    </div>
  )
}
