import { useState, useEffect as React_useEffect } from 'react'
import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Edit2, Trash2, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, X } from 'lucide-react'
import { energyApi, type EnergyProvider, type EnergyOffer } from '@/api/energy'
import { usePermissions } from '@/hooks/usePermissions'

type SortField = 'name' | 'offer_type' | 'subscription_price' | 'base_price'
type SortDirection = 'asc' | 'desc'

export default function AdminOffers() {
  const queryClient = useQueryClient()
  const { hasAction } = usePermissions()

  // Filters
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterPower, setFilterPower] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Selection
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)

  // Collapsed providers - Initially all collapsed
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; offer: EnergyOffer } | null>(null)

  // Edit modal state
  const [editingOffer, setEditingOffer] = useState<EnergyOffer | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<EnergyOffer>>({})

  // Notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Edit provider state
  const [editingProvider, setEditingProvider] = useState<EnergyProvider | null>(null)
  const [editProviderName, setEditProviderName] = useState('')

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void
    confirmText?: string
    type?: 'danger' | 'warning'
  } | null>(null)

  // Old tariff warning toggle
  const [showOldTariffWarning, setShowOldTariffWarning] = useState(true)

  // Helper function to check if tariff is older than 6 months
  const isOldTariff = (validFrom: string | undefined) => {
    if (!validFrom) return false
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    return new Date(validFrom) < sixMonthsAgo
  }

  // Fetch providers
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyProvider[]
      }
      return []
    },
  })

  // Fetch all offers
  const { data: offersData, isLoading } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: async () => {
      const response = await energyApi.getOffers()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyOffer[]
      }
      return []
    },
  })

  // Notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Update offer mutation
  const updateMutation = useMutation({
    mutationFn: async ({ offerId, data }: { offerId: string; data: Partial<EnergyOffer> }) => {
      return await energyApi.updateOffer(offerId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      setEditingOffer(null)
      setEditFormData({})
      showNotification('success', 'Offre mise à jour avec succès')
    },
    onError: (error: any) => {
      showNotification('error', error.message || 'Une erreur est survenue')
    },
  })

  // Delete offer mutation
  const deleteMutation = useMutation({
    mutationFn: async (offerId: string) => {
      return await energyApi.deleteOffer(offerId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      showNotification('success', 'Offre supprimée avec succès')
    },
    onError: (error: any) => {
      showNotification('error', error.message || 'Une erreur est survenue')
    },
  })

  // Delete provider mutation
  const deleteProviderMutation = useMutation({
    mutationFn: async (providerId: string) => {
      return await energyApi.deleteProvider(providerId)
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
      const count = response.data?.deleted_offers_count || 0
      showNotification('success', `Fournisseur et ${count} offre(s) supprimé(s) avec succès`)
    },
    onError: (error: any) => {
      showNotification('error', error.message || 'Une erreur est survenue')
    },
  })

  // Update provider mutation
  const updateProviderMutation = useMutation({
    mutationFn: async ({ providerId, name }: { providerId: string; name: string }) => {
      return await energyApi.updateProvider(providerId, { name })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
      setEditingProvider(null)
      setEditProviderName('')
      showNotification('success', 'Fournisseur renommé avec succès')
    },
    onError: (error: any) => {
      showNotification('error', error.message || 'Une erreur est survenue')
    },
  })

  const handleEdit = (offer: EnergyOffer) => {
    setEditingOffer(offer)
    setEditFormData(offer)
  }

  const handleDelete = (offerId: string, offerName: string) => {
    setConfirmDialog({
      title: 'Supprimer l\'offre',
      message: `Êtes-vous sûr de vouloir supprimer l'offre "${offerName}" ?`,
      onConfirm: () => {
        deleteMutation.mutate(offerId)
        setConfirmDialog(null)
      },
      type: 'danger'
    })
  }

  const handleDeleteProvider = (providerId: string, providerName: string, offerCount: number) => {
    setConfirmDialog({
      title: '⚠️ ATTENTION - Suppression de fournisseur',
      message: `Voulez-vous vraiment supprimer le fournisseur "${providerName}" ?\n\nCela supprimera également toutes ses ${offerCount} offre(s) associée(s).\n\nCette action est irréversible !`,
      onConfirm: () => {
        deleteProviderMutation.mutate(providerId)
        setConfirmDialog(null)
      },
      confirmText: 'Supprimer tout',
      type: 'danger'
    })
  }

  const handleSaveEdit = () => {
    if (!editingOffer) return
    updateMutation.mutate({ offerId: editingOffer.id, data: editFormData })
  }

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-50" />
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
  }

  // Selection with SHIFT support
  const toggleSelectOffer = (offerId: string, index: number, event?: React.MouseEvent, allOffers?: EnergyOffer[]) => {
    const newSelected = new Set(selectedOffers)

    // SHIFT+Click: select range
    if (event?.shiftKey && lastSelectedIndex !== null && allOffers) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)

      for (let i = start; i <= end; i++) {
        if (allOffers[i]) {
          newSelected.add(allOffers[i].id)
        }
      }
      setSelectedOffers(newSelected)
      setLastSelectedIndex(index)
    } else {
      // Normal click: toggle single
      if (newSelected.has(offerId)) {
        newSelected.delete(offerId)
      } else {
        newSelected.add(offerId)
      }
      setSelectedOffers(newSelected)
      setLastSelectedIndex(index)
    }

    setSelectAll(false)
  }

  const toggleSelectAll = (providerOffers: EnergyOffer[]) => {
    if (selectAll) {
      setSelectedOffers(new Set())
      setSelectAll(false)
    } else {
      const allIds = providerOffers.map((offer) => offer.id)
      setSelectedOffers(new Set(allIds))
      setSelectAll(true)
    }
  }

  const handleBulkDelete = () => {
    if (selectedOffers.size === 0) return
    setConfirmDialog({
      title: 'Suppression multiple',
      message: `Êtes-vous sûr de vouloir supprimer ${selectedOffers.size} offre(s) sélectionnée(s) ?`,
      onConfirm: () => {
        const count = selectedOffers.size
        // Delete all selected offers
        const deletePromises = Array.from(selectedOffers).map((offerId) => deleteMutation.mutateAsync(offerId))
        Promise.all(deletePromises)
          .then(() => {
            setSelectedOffers(new Set())
            setSelectAll(false)
            showNotification('success', `${count} offre(s) supprimée(s) avec succès`)
          })
          .catch(() => {
            showNotification('error', 'Erreur lors de la suppression des offres')
          })
        setConfirmDialog(null)
      },
      type: 'danger'
    })
  }

  const handleBulkToggleActive = (active: boolean) => {
    if (selectedOffers.size === 0) return
    setConfirmDialog({
      title: active ? 'Activer des offres' : 'Désactiver des offres',
      message: `Êtes-vous sûr de vouloir ${active ? 'activer' : 'désactiver'} ${selectedOffers.size} offre(s) sélectionnée(s) ?`,
      onConfirm: () => {
        const count = selectedOffers.size
        // Update all selected offers
        const updatePromises = Array.from(selectedOffers).map((offerId) =>
          updateMutation.mutateAsync({ offerId, data: { is_active: active } })
        )
        Promise.all(updatePromises)
          .then(() => {
            setSelectedOffers(new Set())
            setSelectAll(false)
            showNotification('success', `${count} offre(s) ${active ? 'activée(s)' : 'désactivée(s)'} avec succès`)
          })
          .catch(() => {
            showNotification('error', `Erreur lors de ${active ? "l'activation" : 'la désactivation'} des offres`)
          })
        setConfirmDialog(null)
      },
      type: 'warning'
    })
  }

  // Filter and sort offers
  const filteredAndSortedOffers = offersData
    ?.filter((offer) => {
      if (filterProvider !== 'all' && offer.provider_id !== filterProvider) return false
      if (filterType !== 'all' && offer.offer_type !== filterType) return false
      if (filterPower !== 'all' && offer.power_kva?.toString() !== filterPower) return false
      if (searchQuery && !offer.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'offer_type':
          aValue = a.offer_type
          bValue = b.offer_type
          break
        case 'subscription_price':
          aValue = a.subscription_price
          bValue = b.subscription_price
          break
        case 'base_price':
          aValue = a.base_price || a.hc_price || a.tempo_blue_hc || a.ejp_normal || 0
          bValue = b.base_price || b.hc_price || b.tempo_blue_hc || b.ejp_normal || 0
          break
        default:
          return 0
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

  // Group by provider
  const offersByProvider = filteredAndSortedOffers?.reduce((acc, offer) => {
    if (!acc[offer.provider_id]) {
      acc[offer.provider_id] = []
    }
    acc[offer.provider_id].push(offer)
    return acc
  }, {} as Record<string, EnergyOffer[]>)

  // Initialize all providers as collapsed on mount
  React_useEffect(() => {
    if (providersData && providersData.length > 0 && collapsedProviders.size === 0) {
      // Collapse all providers initially
      const allProviderIds = providersData.map(p => p.id)
      setCollapsedProviders(new Set(allProviderIds))
    }
  }, [providersData])

  // Auto-collapse all providers except filtered one
  const isProviderExpanded = (providerId: string) => {
    // If a specific provider is selected in filter, only expand that one
    if (filterProvider !== 'all') {
      return providerId === filterProvider
    }
    // Otherwise, respect manual collapse state
    return !collapsedProviders.has(providerId)
  }

  const toggleProvider = (providerId: string) => {
    const newCollapsed = new Set(collapsedProviders)
    if (newCollapsed.has(providerId)) {
      newCollapsed.delete(providerId)
    } else {
      newCollapsed.add(providerId)
    }
    setCollapsedProviders(newCollapsed)
  }

  // Handle row click - open edit modal
  const handleRowClick = (offer: EnergyOffer, event: React.MouseEvent) => {
    // Don't trigger if clicking on checkbox or action buttons
    if (
      (event.target as HTMLElement).closest('button') ||
      (event.target as HTMLElement).closest('.checkbox-cell')
    ) {
      return
    }
    handleEdit(offer)
  }

  // Handle right click - show context menu
  const handleRowContextMenu = (offer: EnergyOffer, event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      offer
    })
  }

  // Close context menu when clicking outside
  const closeContextMenu = () => {
    setContextMenu(null)
  }

  // Add effect to close context menu on click
  React_useEffect(() => {
    if (contextMenu) {
      document.addEventListener('click', closeContextMenu)
      return () => document.removeEventListener('click', closeContextMenu)
    }
  }, [contextMenu])

  return (
    <div className="w-full">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] ${
            notification.type === 'success'
              ? 'bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex-1">
            <p
              className={`font-medium ${
                notification.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}
            >
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className={`text-sm font-medium ${
              notification.type === 'success'
                ? 'text-green-600 hover:text-green-700 dark:text-green-400'
                : 'text-red-600 hover:text-red-700 dark:text-red-400'
            }`}
          >
            ✕
          </button>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Zap className="text-primary-600 dark:text-primary-400" size={32} />
          Gestion des offres
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez les offres d'énergie : éditer, supprimer ou désactiver
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold">Filtres</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Recherche</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
                placeholder="Rechercher une offre..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Fournisseur</label>
            <select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} className="input">
              <option value="all">Tous les fournisseurs</option>
              {Array.isArray(providersData) &&
                providersData.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input">
              <option value="all">Tous les types</option>
              <option value="BASE">BASE</option>
              <option value="BASE_WEEKEND">BASE Week-end</option>
              <option value="HC_HP">HC/HP</option>
              <option value="HC_NUIT_WEEKEND">HC Nuit & Week-end</option>
              <option value="HC_WEEKEND">HC Week-end</option>
              <option value="SEASONAL">SEASONAL (Tarifs saisonniers)</option>
              <option value="TEMPO">TEMPO</option>
              <option value="EJP">EJP</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Puissance (kVA)</label>
            <select value={filterPower} onChange={(e) => setFilterPower(e.target.value)} className="input">
              <option value="all">Toutes les puissances</option>
              <option value="3">3 kVA</option>
              <option value="6">6 kVA</option>
              <option value="9">9 kVA</option>
              <option value="12">12 kVA</option>
              <option value="15">15 kVA</option>
              <option value="18">18 kVA</option>
              <option value="24">24 kVA</option>
              <option value="30">30 kVA</option>
              <option value="36">36 kVA</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {filteredAndSortedOffers?.length || 0} offre(s) trouvée(s)
              {selectedOffers.size > 0 && (
                <span className="ml-2 font-semibold text-primary-600 dark:text-primary-400">
                  • {selectedOffers.size} sélectionnée(s)
                </span>
              )}
            </div>

            {/* Toggle for old tariff warning */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOldTariffWarning}
                onChange={(e) => setShowOldTariffWarning(e.target.checked)}
                className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Afficher les alertes tarifs anciens (&gt; 6 mois)
              </span>
            </label>
          </div>

          {selectedOffers.size > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBulkToggleActive(false)}
                className="btn btn-secondary text-sm"
                disabled={updateMutation.isPending}
              >
                Désactiver ({selectedOffers.size})
              </button>
              <button
                onClick={() => handleBulkToggleActive(true)}
                className="btn btn-secondary text-sm"
                disabled={updateMutation.isPending}
              >
                Activer ({selectedOffers.size})
              </button>
              <button
                onClick={handleBulkDelete}
                className="btn text-sm bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteMutation.isPending}
              >
                Supprimer ({selectedOffers.size})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Offers list */}
      {isLoading ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Chargement des offres...</p>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.isArray(providersData) &&
            providersData
              .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
              .map((provider) => {
              const providerOffers = offersByProvider?.[provider.id] || []
              const isExpanded = isProviderExpanded(provider.id)

              return (
                <div key={provider.id} className={`card py-1.5 ${providerOffers.length === 0 ? 'bg-gray-50 dark:bg-gray-800/30' : ''}`}>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleProvider(provider.id)}
                      className="flex-1 text-left py-1"
                    >
                      <h2 className="text-sm font-bold flex items-center gap-2 hover:text-primary-600 transition-colors">
                        <Zap className="text-primary-600" size={14} />
                        {provider.name}
                        <span className={`text-xs font-normal ${providerOffers.length === 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                          ({providerOffers.length})
                        </span>
                        {providerOffers.length > 0 && (
                          <span className="ml-1 text-gray-400 text-xs">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        )}
                      </h2>
                    </button>
                    <div className="flex items-center gap-0.5">
                      {hasAction('offers', 'edit') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingProvider(provider)
                            setEditProviderName(provider.name)
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                          title="Renommer le fournisseur"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      {hasAction('offers', 'delete') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteProvider(provider.id, provider.name, providerOffers.length)
                          }}
                          disabled={deleteProviderMutation.isPending}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Supprimer le fournisseur et toutes ses offres"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && providerOffers.length > 0 && (
                    <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-2 py-2 text-center w-10">
                            <button
                              onClick={() => toggleSelectAll(providerOffers)}
                              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                              {selectAll && selectedOffers.size === providerOffers.length ? (
                                <CheckSquare size={18} className="text-primary-600" />
                              ) : (
                                <Square size={18} className="text-gray-400" />
                              )}
                            </button>
                          </th>
                          <th
                            className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('name')}
                          >
                            <div className="flex items-center gap-1">
                              Offre
                              {getSortIcon('name')}
                            </div>
                          </th>
                          <th
                            className="px-2 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('offer_type')}
                          >
                            <div className="flex items-center gap-1">
                              Type
                              {getSortIcon('offer_type')}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                            kVA
                          </th>
                          <th
                            className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('subscription_price')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              Abo
                              {getSortIcon('subscription_price')}
                            </div>
                          </th>
                          <th
                            className="px-2 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            onClick={() => handleSort('base_price')}
                          >
                            <div className="flex items-center justify-end gap-1">
                              €/kWh
                              {getSortIcon('base_price')}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                            Date
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                            Act.
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {providerOffers.map((offer, index) => {
                          const isOld = isOldTariff(offer.valid_from)
                          return (
                          <tr
                            key={offer.id}
                            onClick={(e) => handleRowClick(offer, e)}
                            onContextMenu={(e) => handleRowContextMenu(offer, e)}
                            className={`hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer ${
                              selectedOffers.has(offer.id) ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                            } ${isOld && showOldTariffWarning ? 'border-l-2 border-orange-500 bg-orange-50/30 dark:bg-orange-900/10' : ''}`}
                          >
                            <td className="px-2 py-1.5 text-center checkbox-cell">
                              <button
                                onClick={(e) => toggleSelectOffer(offer.id, index, e, providerOffers)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                              >
                                {selectedOffers.has(offer.id) ? (
                                  <CheckSquare size={18} className="text-primary-600" />
                                ) : (
                                  <Square size={18} className="text-gray-400" />
                                )}
                              </button>
                            </td>
                            <td className="px-2 py-1.5 text-xs font-medium">
                              <div className="flex items-center gap-1">
                                <span className="truncate max-w-xs" title={offer.name}>{offer.name}</span>
                                {isOld && showOldTariffWarning && (
                                  <span
                                    className="px-1 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded flex-shrink-0"
                                    title="Tarif ancien (> 6 mois)"
                                  >
                                    ⚠️
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 text-xs">
                              <span className="px-1.5 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded">
                                {offer.offer_type}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-xs text-center">
                              {offer.power_kva ? (
                                <span className="font-medium">{offer.power_kva}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-right">{offer.subscription_price.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-xs text-right">
                              {offer.offer_type === 'BASE' && offer.base_price && (
                                <div className="space-y-0.5">
                                  <div>{offer.base_price.toFixed(4)}</div>
                                  {offer.base_price_weekend && (
                                    <div className="text-green-600">WE: {offer.base_price_weekend.toFixed(4)}</div>
                                  )}
                                </div>
                              )}
                              {offer.offer_type === 'HC_HP' && (
                                <div className="space-y-0.5">
                                  {offer.hc_price && <div className="text-blue-600">HC: {offer.hc_price.toFixed(4)}</div>}
                                  {offer.hp_price && <div className="text-orange-600">HP: {offer.hp_price.toFixed(4)}</div>}
                                  {offer.hc_price_weekend && <div className="text-green-600 text-xs">WE-HC: {offer.hc_price_weekend.toFixed(4)}</div>}
                                </div>
                              )}
                              {offer.offer_type === 'TEMPO' && (
                                <div className="space-y-0.5">
                                  <div className="text-blue-600">B: {offer.tempo_blue_hc?.toFixed(4)}/{offer.tempo_blue_hp?.toFixed(4)}</div>
                                  <div className="text-gray-600">W: {offer.tempo_white_hc?.toFixed(4)}/{offer.tempo_white_hp?.toFixed(4)}</div>
                                  <div className="text-red-600">R: {offer.tempo_red_hc?.toFixed(4)}/{offer.tempo_red_hp?.toFixed(4)}</div>
                                </div>
                              )}
                              {offer.offer_type === 'EJP' && (
                                <div className="space-y-0.5">
                                  {offer.ejp_normal && <div>N: {offer.ejp_normal.toFixed(4)}</div>}
                                  {offer.ejp_peak && <div className="text-red-600">P: {offer.ejp_peak.toFixed(4)}</div>}
                                </div>
                              )}
                              {(offer.hc_price_winter || offer.hc_price_summer) && (
                                <div className="space-y-0.5">
                                  <div className="text-blue-600">❄️ {offer.hc_price_winter?.toFixed(5)}/{offer.hp_price_winter?.toFixed(5)}</div>
                                  <div className="text-amber-600">☀️ {offer.hc_price_summer?.toFixed(5)}/{offer.hp_price_summer?.toFixed(5)}</div>
                                  {offer.peak_day_price && <div className="text-red-600 text-xs">⚡{offer.peak_day_price.toFixed(5)}</div>}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-center">
                              {offer.valid_from && (
                                <div className="text-green-600 dark:text-green-400">
                                  {new Date(offer.valid_from).toLocaleDateString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit'
                                  })}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {hasAction('offers', 'edit') && (
                                  <button
                                    onClick={() => handleEdit(offer)}
                                    className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                    title="Éditer"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                )}
                                {hasAction('offers', 'delete') && (
                                  <button
                                    onClick={() => handleDelete(offer.id, offer.name)}
                                    className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="Supprimer"
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[200px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {hasAction('offers', 'edit') && (
            <button
              onClick={() => {
                handleEdit(contextMenu.offer)
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 text-sm transition-colors"
            >
              <Edit2 size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-gray-700 dark:text-gray-300">Éditer l'offre</span>
            </button>
          )}
          {hasAction('offers', 'edit') && hasAction('offers', 'delete') && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}
          {hasAction('offers', 'delete') && (
            <button
              onClick={() => {
                handleDelete(contextMenu.offer.id, contextMenu.offer.name)
                closeContextMenu()
              }}
              className="w-full px-4 py-2 text-left hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 text-sm transition-colors"
            >
              <Trash2 size={16} className="text-red-600 dark:text-red-400" />
              <span className="text-red-600 dark:text-red-400">Supprimer l'offre</span>
            </button>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className={`text-xl font-bold mb-4 ${
                confirmDialog.type === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
              }`}>
                {confirmDialog.title}
              </h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-6">
                {confirmDialog.message}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                    confirmDialog.type === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {confirmDialog.confirmText || 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingOffer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4">Éditer l'offre</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nom de l'offre</label>
                  <input
                    type="text"
                    value={editFormData.name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Puissance (kVA)</label>
                    <select
                      value={editFormData.power_kva || ''}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, power_kva: e.target.value ? parseInt(e.target.value) : undefined })
                      }
                      className="input"
                    >
                      <option value="">Non spécifié</option>
                      <option value="3">3 kVA</option>
                      <option value="6">6 kVA</option>
                      <option value="9">9 kVA</option>
                      <option value="12">12 kVA</option>
                      <option value="15">15 kVA</option>
                      <option value="18">18 kVA</option>
                      <option value="24">24 kVA</option>
                      <option value="30">30 kVA</option>
                      <option value="36">36 kVA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Abonnement (€/mois)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormData.subscription_price || ''}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, subscription_price: parseFloat(e.target.value) })
                      }
                      className="input"
                    />
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h3 className="font-semibold mb-3 text-blue-700 dark:text-blue-300">Période de validité</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Date d'application</label>
                      <input
                        type="date"
                        value={editFormData.valid_from ? new Date(editFormData.valid_from).toISOString().split('T')[0] : ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, valid_from: e.target.value ? new Date(e.target.value).toISOString() : undefined })
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Fin de validité <span className="text-xs text-gray-500">(optionnel)</span></label>
                      <input
                        type="date"
                        value={editFormData.valid_to ? new Date(editFormData.valid_to).toISOString().split('T')[0] : ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, valid_to: e.target.value ? new Date(e.target.value).toISOString() : undefined })
                        }
                        className="input"
                        placeholder="Laissez vide pour tarif en cours"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    💡 Laissez "Fin de validité" vide pour un tarif actuellement en vigueur
                  </p>
                </div>

                {editingOffer.offer_type === 'BASE' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Prix BASE - Semaine (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.base_price || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, base_price: parseFloat(e.target.value) })
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Prix BASE - Week-end (€/kWh) <span className="text-gray-500 text-xs">(optionnel)</span></label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.base_price_weekend || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, base_price_weekend: e.target.value ? parseFloat(e.target.value) : undefined })
                        }
                        className="input"
                        placeholder="Laisser vide si même tarif"
                      />
                    </div>
                  </div>
                )}

                {editingOffer.offer_type === 'HC_HP' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Tarifs Semaine</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HC (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.hc_price || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, hc_price: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HP (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.hp_price || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, hp_price: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <h3 className="font-semibold mb-3 text-green-700 dark:text-green-300">Tarifs Week-end <span className="text-sm font-normal text-gray-500">(optionnel)</span></h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HC (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.hc_price_weekend || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, hc_price_weekend: e.target.value ? parseFloat(e.target.value) : undefined })
                            }
                            className="input"
                            placeholder="Laisser vide si même tarif"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HP (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.hp_price_weekend || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, hp_price_weekend: e.target.value ? parseFloat(e.target.value) : undefined })
                            }
                            className="input"
                            placeholder="Laisser vide si même tarif"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editingOffer.offer_type === 'TEMPO' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h3 className="font-semibold mb-3 text-blue-700 dark:text-blue-300">Jours Bleus</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HC (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_blue_hc || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_blue_hc: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HP (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_blue_hp || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_blue_hp: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <h3 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Jours Blancs</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HC (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_white_hc || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_white_hc: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HP (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_white_hp || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_white_hp: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <h3 className="font-semibold mb-3 text-red-700 dark:text-red-300">Jours Rouges</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HC (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_red_hc || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_red_hc: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Prix HP (€/kWh)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={editFormData.tempo_red_hp || ''}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, tempo_red_hp: parseFloat(e.target.value) })
                            }
                            className="input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editingOffer.offer_type === 'EJP' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Prix Normal (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.ejp_normal || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, ejp_normal: parseFloat(e.target.value) })
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Prix Pointe (€/kWh)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={editFormData.ejp_peak || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, ejp_peak: parseFloat(e.target.value) })
                        }
                        className="input"
                      />
                    </div>
                  </div>
                )}

                {/* Seasonal Pricing (Enercoop Flexi WATT 2 saisons) */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                  <h3 className="text-sm font-semibold mb-3 text-blue-900 dark:text-blue-100">❄️☀️ Prix saisonniers (Enercoop Flexi WATT 2 saisons)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium mb-2 text-blue-700 dark:text-blue-300">Hiver HC (€/kWh) - Nov-Mars</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editFormData.hc_price_winter || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, hc_price_winter: e.target.value ? parseFloat(e.target.value) : undefined })
                        }
                        className="input text-sm"
                        placeholder="0.00000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2 text-blue-700 dark:text-blue-300">Hiver HP (€/kWh) - Nov-Mars</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editFormData.hp_price_winter || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, hp_price_winter: e.target.value ? parseFloat(e.target.value) : undefined })
                        }
                        className="input text-sm"
                        placeholder="0.00000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2 text-amber-700 dark:text-amber-300">Été HC (€/kWh) - Avr-Oct</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editFormData.hc_price_summer || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, hc_price_summer: e.target.value ? parseFloat(e.target.value) : undefined })
                        }
                        className="input text-sm"
                        placeholder="0.00000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2 text-amber-700 dark:text-amber-300">Été HP (€/kWh) - Avr-Oct</label>
                      <input
                        type="number"
                        step="0.00001"
                        value={editFormData.hp_price_summer || ''}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, hp_price_summer: e.target.value ? parseFloat(e.target.value) : undefined })
                        }
                        className="input text-sm"
                        placeholder="0.00000"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-2 text-red-700 dark:text-red-300">⚡ Jour de pointe (€/kWh) - Option "Jour de pointe"</label>
                    <input
                      type="number"
                      step="0.00001"
                      value={editFormData.peak_day_price || ''}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, peak_day_price: e.target.value ? parseFloat(e.target.value) : undefined })
                      }
                      className="input text-sm"
                      placeholder="0.00000"
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      💡 Pour Flexi WATT 2 saisons Pointe uniquement (15 jours/an max)
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description (optionnelle)</label>
                  <textarea
                    value={editFormData.description || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="input"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => {
                    setEditingOffer(null)
                    setEditFormData({})
                  }}
                  className="btn"
                  disabled={updateMutation.isPending}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="btn btn-primary"
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Provider Modal */}
      {editingProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Renommer le fournisseur</h2>

              <div>
                <label className="block text-sm font-medium mb-2">Nom du fournisseur</label>
                <input
                  type="text"
                  value={editProviderName}
                  onChange={(e) => setEditProviderName(e.target.value)}
                  className="input"
                  placeholder="Ex: EDF, Engie, Total Energies..."
                />
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => {
                    setEditingProvider(null)
                    setEditProviderName('')
                  }}
                  className="btn"
                  disabled={updateProviderMutation.isPending}
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (editProviderName.trim() && editingProvider) {
                      updateProviderMutation.mutate({ providerId: editingProvider.id, name: editProviderName.trim() })
                    }
                  }}
                  className="btn btn-primary"
                  disabled={updateProviderMutation.isPending || !editProviderName.trim()}
                >
                  {updateProviderMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
