import { useState, useEffect as React_useEffect } from 'react'
import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Edit2, Trash2, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, X, Eye, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { energyApi, type EnergyProvider, type EnergyOffer, type RefreshPreview, type SyncStatus } from '@/api/energy'
import { usePermissions } from '@/hooks/usePermissions'
import toast from 'react-hot-toast'

type SortField = 'name' | 'offer_type' | 'subscription_price' | 'base_price'
type SortDirection = 'asc' | 'desc'

// Helper function to safely convert price to number and format
const formatPrice = (price: number | string | undefined | null, decimals: number = 2): string => {
  if (price === undefined || price === null) return '-'
  const num = typeof price === 'string' ? parseFloat(price) : price
  return isNaN(num) ? '-' : num.toFixed(decimals)
}

export default function AdminOffers() {
  const queryClient = useQueryClient()
  const { hasAction } = usePermissions()
  // Use direct token check to avoid timing issues with useAuth hook
  const hasToken = !!localStorage.getItem('access_token')

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

  // Preview modal state
  const [previewData, setPreviewData] = useState<RefreshPreview | null>(null)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewActiveTab, setPreviewActiveTab] = useState<'new' | 'updated' | 'deactivated'>('new')
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(null)

  // Edit scraper URLs modal state
  const [editingScraperUrls, setEditingScraperUrls] = useState<EnergyProvider | null>(null)
  const [scraperUrlsInput, setScraperUrlsInput] = useState<string[]>([])
  const [savingScraperUrls, setSavingScraperUrls] = useState(false)

  // Helper function to check if tariff is older than 6 months
  const isOldTariff = (validFrom: string | undefined) => {
    if (!validFrom) return false
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    return new Date(validFrom) < sixMonthsAgo
  }

  // Fetch providers (includes providers with scrapers not yet in DB)
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers-with-scrapers'],
    queryFn: async () => {
      const response = await energyApi.getProvidersWithScrapers()
      if (response.success && response.data?.providers) {
        return response.data.providers as EnergyProvider[]
      }
      return []
    },
    enabled: hasToken,
    staleTime: 0, // Always refetch on mount to avoid stale cache issues
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
    enabled: hasToken,
    staleTime: 0, // Always refetch on mount to avoid stale cache issues
  })

  // Fetch sync status (poll every second when a sync is in progress or refresh is active)
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: async () => {
      const response = await energyApi.getSyncStatus()
      if (response.success && response.data) {
        return response.data as SyncStatus
      }
      return { sync_in_progress: false, provider: null, started_at: null, current_step: null, steps: [], progress: 0 }
    },
    enabled: hasToken,
    refetchInterval: (query) => {
      // Poll much more frequently when sync is in progress or we're refreshing
      if (refreshingProvider || loadingPreview || query.state.data?.sync_in_progress) {
        return 500 // 500ms for responsive progress updates
      }
      return 10000 // 10s when idle
    },
  })

  // Notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Preview refresh handler
  const handlePreviewRefresh = async (providerId: string, providerName: string) => {
    setLoadingPreview(providerId)
    try {
      const response = await energyApi.previewRefresh(providerName)
      if (response.success && response.data) {
        // Map backend response to frontend format
        const preview = (response.data as any).preview?.[providerName]
        if (preview) {
          const mappedData: RefreshPreview = {
            provider: providerName,
            new_offers: preview.offers_to_create || [],
            updated_offers: preview.offers_to_update || [],
            deactivated_offers: preview.offers_to_deactivate || [],
            total_changes: (preview.offers_to_create?.length || 0) + (preview.offers_to_update?.length || 0) + (preview.offers_to_deactivate?.length || 0),
            last_update: (response.data as any).timestamp,
            used_fallback: preview.used_fallback || false,
            fallback_reason: preview.fallback_reason
          }
          setPreviewData(mappedData)
          setPreviewModalOpen(true)
          // Auto-select first non-empty tab
          if (mappedData.new_offers.length > 0) {
            setPreviewActiveTab('new')
          } else if (mappedData.updated_offers.length > 0) {
            setPreviewActiveTab('updated')
          } else if (mappedData.deactivated_offers.length > 0) {
            setPreviewActiveTab('deactivated')
          }
        } else {
          toast.error('Données de prévisualisation invalides')
        }
      } else {
        // Extract error message from backend response
        const errorMsg = response.error?.message || response.error || 'Impossible de charger la prévisualisation'
        toast.error(`Erreur de scraping : ${errorMsg}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la prévisualisation'
      toast.error(errorMessage)
    } finally {
      setLoadingPreview(null)
    }
  }

  // Refresh offers handler
  const handleRefreshOffers = async (providerId: string, providerName: string, fromPreview = false) => {
    // Close preview modal immediately if coming from preview
    // The sync progress modal will take over (triggered by refreshingProvider)
    // Note: We do NOT reset progress - syncStatus from backend keeps the current progress
    if (fromPreview) {
      setPreviewModalOpen(false)
      setPreviewData(null)
    }

    setRefreshingProvider(providerId)

    // Start polling sync status immediately
    refetchSyncStatus()

    try {
      const response = await energyApi.refreshOffers(providerName)

      if (response.success) {
        await queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
        await queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
        toast.success(`Offres de ${providerName} rafraîchies avec succès`)
      } else {
        toast.error('Échec du rafraîchissement des offres')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du rafraîchissement'
      toast.error(errorMessage)
    } finally {
      setRefreshingProvider(null)
      // Final refresh to clear sync status
      refetchSyncStatus()
    }
  }

  // Edit scraper URLs handlers
  const handleOpenEditScraperUrls = (provider: EnergyProvider) => {
    setEditingScraperUrls(provider)
    setScraperUrlsInput(provider.scraper_urls || [])
  }

  const handleSaveScraperUrls = async () => {
    if (!editingScraperUrls) return

    setSavingScraperUrls(true)
    try {
      const response = await energyApi.updateProvider(editingScraperUrls.id, {
        scraper_urls: scraperUrlsInput.filter(url => url.trim() !== '')
      })

      if (response.success) {
        await queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
        toast.success('URLs du scraper mises à jour avec succès')
        setEditingScraperUrls(null)
        setScraperUrlsInput([])
      } else {
        toast.error('Échec de la mise à jour des URLs')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la mise à jour'
      toast.error(errorMessage)
    } finally {
      setSavingScraperUrls(false)
    }
  }

  const handleUpdateScraperUrl = (index: number, value: string) => {
    const newUrls = [...scraperUrlsInput]
    newUrls[index] = value
    setScraperUrlsInput(newUrls)
  }

  // Purge provider offers handler
  const handlePurgeProvider = async (providerId: string, providerName: string) => {
    // Show confirmation dialog
    setConfirmDialog({
      title: `Purger ${providerName}`,
      message: `Êtes-vous sûr de vouloir supprimer toutes les offres de ${providerName} ? Cette action est irréversible.`,
      confirmText: 'Supprimer tout',
      type: 'danger',
      onConfirm: async () => {
        setRefreshingProvider(providerId)
        try {
          const response = await energyApi.purgeProviderOffers(providerName)
          if (response.success) {
            const deletedCount = (response.data as { deleted_count?: number })?.deleted_count || 0
            await queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
            await queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
            toast.success(`${deletedCount} offre${deletedCount > 1 ? 's' : ''} supprimée${deletedCount > 1 ? 's' : ''} pour ${providerName}`)
          } else {
            toast.error('Échec de la suppression des offres')
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suppression'
          toast.error(errorMessage)
        } finally {
          setRefreshingProvider(null)
          setConfirmDialog(null)
        }
      }
    })
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
      showNotification('error', error.message || 'Une erreur est survenue')
    },
  })

  // Delete provider mutation
  const deleteProviderMutation = useMutation<
    { success: boolean; data?: { deleted_offers_count?: number } },
    Error,
    string
  >({
    mutationFn: async (providerId: string) => {
      const response = await energyApi.deleteProvider(providerId)
      return response as { success: boolean; data?: { deleted_offers_count?: number } }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
      queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
      const count = response.data?.deleted_offers_count || 0
      showNotification('success', `Fournisseur et ${count} offre(s) supprimé(s) avec succès`)
    },
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
  // Defensive check: ensure offersData is an array (can be undefined during loading or corrupted cache)
  const offersArray = Array.isArray(offersData) ? offersData : []
  const filteredAndSortedOffers = offersArray
    .filter((offer) => {
      if (filterProvider !== 'all' && offer.provider_id !== filterProvider) return false
      if (filterType !== 'all' && offer.offer_type !== filterType) return false
      if (filterPower !== 'all' && offer.power_kva?.toString() !== filterPower) return false
      if (searchQuery && !offer.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

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

  // Group by provider (for display in the list - uses filtered offers)
  const offersByProvider = filteredAndSortedOffers?.reduce((acc, offer) => {
    if (!acc[offer.provider_id]) {
      acc[offer.provider_id] = []
    }
    acc[offer.provider_id].push(offer)
    return acc
  }, {} as Record<string, EnergyOffer[]>)

  // Group by provider (for counts - uses ALL offers, not filtered)
  const allOffersByProvider = offersArray.reduce((acc, offer) => {
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

      {/* Sync in progress overlay with blur */}
      {(syncStatus?.sync_in_progress || loadingPreview || refreshingProvider) && (() => {
        // Determine the provider name to display
        const displayProvider = syncStatus?.provider || loadingPreview || refreshingProvider
        // Find the provider name from the ID if needed
        const providerObj = providersData?.find(p => p.id === displayProvider)
        const providerName = providerObj?.name || displayProvider
        // Use syncStatus data if available, otherwise show initial state
        const currentStep = syncStatus?.current_step || (loadingPreview ? 'Connexion au serveur...' : 'Initialisation...')
        const progress = syncStatus?.progress || 0
        const steps = syncStatus?.steps || []

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-lg w-full mx-4 border border-gray-200 dark:border-gray-700 animate-scale-in">
              {/* Header with icon */}
              <div className="text-center mb-6">
                <div className="relative inline-block mb-4">
                  <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
                    <Loader2 className="animate-spin text-primary-600 dark:text-primary-400" size={40} />
                  </div>
                  <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-primary-200 dark:border-primary-800 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                  {loadingPreview ? 'Prévisualisation en cours' : refreshingProvider ? 'Application en cours' : 'Synchronisation en cours'}
                </h3>
                <p className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                  {providerName === 'all' ? 'Tous les fournisseurs' : providerName}
                </p>
              </div>

              {/* Progress bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                  <span>Progression</span>
                  <span className="font-semibold">{progress}%</span>
                </div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Current step */}
              <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Étape en cours</p>
                <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                  <RefreshCw className="animate-spin text-primary-500" size={16} />
                  {currentStep}
                </p>
              </div>

              {/* Steps completed */}
              {steps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Étapes complétées</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {steps.map((step: string, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-2 text-sm ${
                          step === currentStep
                            ? 'text-primary-600 dark:text-primary-400 font-medium'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {step === currentStep ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
                            <span className="text-white text-xs">✓</span>
                          </span>
                        )}
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Start time */}
              {syncStatus?.started_at && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  Démarré à {new Date(syncStatus.started_at).toLocaleTimeString('fr-FR')}
                </p>
              )}
            </div>
          </div>
        )
      })()}

      <div className="space-y-6 w-full">
      {/* Provider Management Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-300 dark:border-gray-700 transition-colors duration-200 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="text-primary-600 dark:text-primary-400" size={20} />
          Gestion des Fournisseurs
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.isArray(providersData) &&
            providersData
              // Filtrer pour n'afficher que les fournisseurs avec un scraper
              .filter((provider) => provider.has_scraper)
              .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
              .map((provider) => {
                const allProviderOffers = allOffersByProvider?.[provider.id] || []
                const activeCount = allProviderOffers.filter(o => o.is_active).length
                const isLoadingPreview = loadingPreview === provider.id
                const isRefreshing = refreshingProvider === provider.id
                const isNotInDatabase = provider.not_in_database === true
                const isSyncInProgress = syncStatus?.sync_in_progress && syncStatus.provider !== provider.name

                // Find the most recent tariff date
                const mostRecentDate = allProviderOffers
                  .filter(o => o.valid_from)
                  .map(o => new Date(o.valid_from!))
                  .sort((a, b) => b.getTime() - a.getTime())[0]

                return (
                  <div
                    key={provider.id}
                    className={`bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 hover:shadow-lg transition-shadow duration-200 ${
                      isNotInDatabase ? 'border-dashed border-2 border-amber-400 dark:border-amber-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {provider.name}
                          </h3>
                          {isNotInDatabase && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                              Non initialisé
                            </span>
                          )}
                        </div>
                        {isNotInDatabase ? (
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            Scraper disponible - Cliquez sur Prévisualiser pour initialiser
                          </p>
                        ) : (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {activeCount} offre{activeCount > 1 ? 's' : ''} active{activeCount > 1 ? 's' : ''}
                          </p>
                        )}
                        {mostRecentDate && (
                          <p className="text-xs text-green-600 dark:text-green-400 font-medium mt-1">
                            Tarif du {mostRecentDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                          </p>
                        )}
                        {provider.updated_at && !isNotInDatabase && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Mise à jour : {new Date(provider.updated_at).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                      {provider.logo_url ? (
                        <div className="w-16 h-16 flex items-center justify-center">
                          <img
                            src={provider.logo_url}
                            alt={`Logo ${provider.name}`}
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                              // Si le logo ne charge pas, afficher l'icône par défaut
                              e.currentTarget.style.display = 'none'
                              const icon = document.createElement('div')
                              icon.innerHTML = '<svg class="text-primary-600 dark:text-primary-400" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>'
                              e.currentTarget.parentElement?.appendChild(icon)
                            }}
                          />
                        </div>
                      ) : (
                        <Zap className="text-primary-600 dark:text-primary-400" size={32} />
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* Boutons d'action */}
                      {(() => {
                        const isDisabled = isLoadingPreview || isRefreshing || isSyncInProgress

                        return (
                          <>
                            {/* Boutons Prévisualiser et Purger côte à côte */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handlePreviewRefresh(provider.id, provider.name)}
                                disabled={isDisabled}
                                className="btn btn-primary flex-1 text-sm flex items-center justify-center gap-2"
                                title="Prévisualiser les changements avant application"
                              >
                                {isLoadingPreview && loadingPreview === provider.id ? (
                                  <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Chargement...
                                  </>
                                ) : (
                                  <>
                                    <Eye size={16} />
                                    Prévisualiser
                                  </>
                                )}
                              </button>

                              {/* Bouton Purger - Uniquement avec permission delete et si le fournisseur existe en base */}
                              {hasAction('offers', 'delete') && !isNotInDatabase && (
                                <button
                                  onClick={() => handlePurgeProvider(provider.id, provider.name)}
                                  disabled={isDisabled}
                                  className="btn bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800 flex-1 text-sm flex items-center justify-center gap-2"
                                >
                                  <Trash2 size={16} />
                                  Purger
                                </button>
                              )}
                            </div>

                            {/* Affichage des sources du scraper */}
                            {provider.scraper_urls && provider.scraper_urls.length > 0 && (() => {
                              // Labels pour les URLs en fonction du fournisseur
                              const urlLabels: Record<string, string[]> = {
                                'EDF': ['Tarif Bleu (réglementé)', 'Zen Week-End (marché)'],
                                'Enercoop': ['Grille tarifaire (PDF officiel)'],
                                'TotalEnergies': ['Offre Essentielle (Eco Electricité)', 'Offre Verte Fixe'],
                                'Priméo Énergie': ['Offre Fixe -20% (PDF)'],
                                'Engie': ['Tarifs Engie (HelloWatt)'],
                                'ALPIQ': ['Électricité Stable -21,5% (PDF)', 'Stable -8% + Référence -4% (PDF)'],
                                'Alterna': ['Électricité verte 100% locale', 'Électricité verte 100% française', 'Électricité verte 100% VE'],
                                'Ekwateur': ['Prix kwh électricité et abonnement'],
                                'Mint Énergie': ['Online & Green (PDF)', 'Classic & Green (PDF)', 'Smart & Green (PDF)']
                              }
                              const labels = urlLabels[provider.name] || []

                              return (
                                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                      Source{provider.scraper_urls.length > 1 ? 's' : ''} du scraper :
                                    </p>
                                    {hasAction('offers', 'edit') && (
                                      <button
                                        onClick={() => handleOpenEditScraperUrls(provider)}
                                        className="text-xs text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
                                        title="Éditer les URLs"
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                    )}
                                  </div>
                                  {provider.scraper_urls.map((url, idx) => (
                                    <div key={idx} className="mb-1">
                                      {labels[idx] && (
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                          {labels[idx]} :{' '}
                                        </span>
                                      )}
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                        title={url}
                                      >
                                        {url.length > 50 ? `${url.substring(0, 47)}...` : url}
                                      </a>
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                )
              })}
        </div>
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
                            <td className="px-2 py-1.5 text-xs text-right">{formatPrice(offer.subscription_price, 2)}</td>
                            <td className="px-2 py-1.5 text-xs text-right">
                              {offer.offer_type === 'BASE' && offer.base_price && (
                                <div className="space-y-0.5">
                                  <div>{formatPrice(offer.base_price, 5)}</div>
                                  {offer.base_price_weekend && (
                                    <div className="text-green-600">WE: {formatPrice(offer.base_price_weekend, 5)}</div>
                                  )}
                                </div>
                              )}
                              {(offer.offer_type === 'HC_HP' || offer.offer_type === 'WEEKEND' || offer.offer_type === 'HC_NUIT_WEEKEND' || offer.offer_type === 'HC_WEEKEND') && (
                                <div className="space-y-0.5">
                                  {offer.hc_price && <div className="text-blue-600">HC: {formatPrice(offer.hc_price, 5)}</div>}
                                  {offer.hp_price && <div className="text-orange-600">HP: {formatPrice(offer.hp_price, 5)}</div>}
                                  {offer.hc_price_weekend && <div className="text-green-600 text-xs">WE-HC: {formatPrice(offer.hc_price_weekend, 5)}</div>}
                                </div>
                              )}
                              {offer.offer_type === 'TEMPO' && (
                                <div className="space-y-0.5">
                                  <div className="text-blue-600">B: {formatPrice(offer.tempo_blue_hc, 5)}/{formatPrice(offer.tempo_blue_hp, 5)}</div>
                                  <div className="text-gray-600">W: {formatPrice(offer.tempo_white_hc, 5)}/{formatPrice(offer.tempo_white_hp, 5)}</div>
                                  <div className="text-red-600">R: {formatPrice(offer.tempo_red_hc, 5)}/{formatPrice(offer.tempo_red_hp, 5)}</div>
                                </div>
                              )}
                              {offer.offer_type === 'EJP' && (
                                <div className="space-y-0.5">
                                  {offer.ejp_normal && <div>N: {formatPrice(offer.ejp_normal, 5)}</div>}
                                  {offer.ejp_peak && <div className="text-red-600">P: {formatPrice(offer.ejp_peak, 5)}</div>}
                                </div>
                              )}
                              {(offer.hc_price_winter || offer.hc_price_summer) && (
                                <div className="space-y-0.5">
                                  <div className="text-blue-600">❄️ {formatPrice(offer.hc_price_winter, 5)}/{formatPrice(offer.hp_price_winter, 5)}</div>
                                  <div className="text-amber-600">☀️ {formatPrice(offer.hc_price_summer, 5)}/{formatPrice(offer.hp_price_summer, 5)}</div>
                                  {offer.peak_day_price && <div className="text-red-600 text-xs">⚡{formatPrice(offer.peak_day_price, 5)}</div>}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-center">
                              {offer.valid_from && (
                                <div className="text-green-600 dark:text-green-400 font-medium" title={`Tarif valide depuis le ${new Date(offer.valid_from).toLocaleDateString('fr-FR')}`}>
                                  {new Date(offer.valid_from).toLocaleDateString('fr-FR', {
                                    month: 'short',
                                    year: 'numeric'
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

                {(editingOffer.offer_type === 'HC_HP' || editingOffer.offer_type === 'WEEKEND' || editingOffer.offer_type === 'HC_NUIT_WEEKEND' || editingOffer.offer_type === 'HC_WEEKEND') && (
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

      {/* Preview Modal */}
      {previewModalOpen && previewData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 animate-slide-up">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-transparent dark:from-primary-900/20 dark:to-transparent">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
                    <Eye className="text-primary-600 dark:text-primary-400" size={22} />
                  </div>
                  <div>
                    <span className="text-gray-900 dark:text-white">Prévisualisation des changements</span>
                    <p className="text-sm font-normal text-primary-600 dark:text-primary-400">{previewData.provider}</p>
                  </div>
                </h2>
                <button
                  onClick={() => {
                    setPreviewModalOpen(false)
                    setPreviewData(null)
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-all duration-200 hover:rotate-90"
                >
                  <X size={24} />
                </button>
              </div>

              {previewData.last_update && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Dernière mise à jour : {new Date(previewData.last_update).toLocaleString('fr-FR')}
                </p>
              )}

              {/* Fallback Warning */}
              {previewData.used_fallback && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={24} />
                    <div>
                      <h4 className="font-semibold text-amber-800 dark:text-amber-200">
                        ⚠️ Données de secours utilisées
                      </h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Le téléchargement des tarifs a échoué. Les données affichées proviennent d'une sauvegarde manuelle
                        et peuvent être obsolètes.
                      </p>
                      {previewData.fallback_reason && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 font-mono bg-amber-100 dark:bg-amber-900/50 p-2 rounded">
                          Raison : {previewData.fallback_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-2 mt-4 border-b border-gray-300 dark:border-gray-700">
                <button
                  onClick={() => setPreviewActiveTab('new')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    previewActiveTab === 'new'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  Nouvelles offres ({previewData.new_offers?.length || 0})
                </button>
                <button
                  onClick={() => setPreviewActiveTab('updated')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    previewActiveTab === 'updated'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  Mises à jour ({previewData.updated_offers?.length || 0})
                </button>
                <button
                  onClick={() => setPreviewActiveTab('deactivated')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    previewActiveTab === 'deactivated'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  Désactivations ({previewData.deactivated_offers?.length || 0})
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {previewActiveTab === 'new' && (
                <div>
                  {previewData.new_offers && previewData.new_offers.length > 0 ? (
                    <div className="space-y-3">
                      {previewData.new_offers.map((offer: any, index) => (
                        <div
                          key={index}
                          className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">
                                {offer.name}
                              </h3>
                              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded">
                                  {offer.offer_type}
                                </span>
                                {offer.power_kva && (
                                  <span>{offer.power_kva} kVA</span>
                                )}
                                {offer.valid_from && (
                                  <span className="text-xs italic">
                                    Tarif du {new Date(offer.valid_from).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              {offer.subscription_price && (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  Abo: {formatPrice(offer.subscription_price, 2)} €/mois
                                </div>
                              )}

                              {/* BASE simple (sans week-end) */}
                              {offer.base_price && !offer.base_price_weekend && (
                                <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                                  {formatPrice(offer.base_price, 5)} €/kWh
                                </div>
                              )}

                              {/* BASE WEEKEND - afficher les 2 prix */}
                              {offer.base_price && offer.base_price_weekend && (
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    Semaine: {formatPrice(offer.base_price, 5)} €
                                  </div>
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    Week-end: {formatPrice(offer.base_price_weekend, 5)} €
                                  </div>
                                </div>
                              )}

                              {/* HC/HP simple */}
                              {offer.hp_price && offer.hc_price && !offer.hp_price_weekend && (
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    HP: {formatPrice(offer.hp_price, 5)} €
                                  </div>
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    HC: {formatPrice(offer.hc_price, 5)} €
                                  </div>
                                </div>
                              )}

                              {/* HC/HP WEEKEND - afficher les 4 prix */}
                              {offer.hp_price && offer.hc_price && offer.hp_price_weekend && offer.hc_price_weekend && (
                                <div className="space-y-1">
                                  <div className="text-xs font-semibold text-green-700 dark:text-green-300">
                                    HP Sem: {formatPrice(offer.hp_price, 5)} €
                                  </div>
                                  <div className="text-xs font-semibold text-green-700 dark:text-green-300">
                                    HC Sem: {formatPrice(offer.hc_price, 5)} €
                                  </div>
                                  <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                                    HP WE: {formatPrice(offer.hp_price_weekend, 5)} €
                                  </div>
                                  <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                                    HC WE: {formatPrice(offer.hc_price_weekend, 5)} €
                                  </div>
                                </div>
                              )}

                              {/* TEMPO */}
                              {offer.tempo_blue_hp && (
                                <div className="text-xs space-y-1">
                                  <div className="text-blue-600 dark:text-blue-400">
                                    Bleu HP/HC: {formatPrice(offer.tempo_blue_hp, 5)} / {formatPrice(offer.tempo_blue_hc, 5)} €
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400">
                                    Blanc HP/HC: {formatPrice(offer.tempo_white_hp, 5)} / {formatPrice(offer.tempo_white_hc, 5)} €
                                  </div>
                                  <div className="text-red-600 dark:text-red-400">
                                    Rouge HP/HC: {formatPrice(offer.tempo_red_hp, 5)} / {formatPrice(offer.tempo_red_hc, 5)} €
                                  </div>
                                </div>
                              )}

                              {/* SEASONAL (Flex) */}
                              {offer.hc_price_winter && offer.hp_price_winter && (
                                <div className="text-xs space-y-1">
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    HC Éco: {formatPrice(offer.hc_price_winter, 5)} €
                                  </div>
                                  <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                                    HP Éco: {formatPrice(offer.hp_price_winter, 5)} €
                                  </div>
                                  {offer.hc_price_summer && offer.hp_price_summer && (
                                    <>
                                      <div className="text-xs text-orange-600 dark:text-orange-400">
                                        HC Sobriété: {formatPrice(offer.hc_price_summer, 5)} €
                                      </div>
                                      <div className="text-xs text-red-600 dark:text-red-400">
                                        HP Sobriété: {formatPrice(offer.hp_price_summer, 5)} €
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Aucune nouvelle offre
                    </div>
                  )}
                </div>
              )}

              {previewActiveTab === 'updated' && (
                <div>
                  {previewData.updated_offers && previewData.updated_offers.length > 0 ? (
                    <div className="space-y-4">
                      {previewData.updated_offers.map((offer: any, index) => (
                        <div
                          key={index}
                          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
                        >
                          <div className="mb-3">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {offer.name}
                            </h3>
                            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                              <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded">
                                {offer.offer_type}
                              </span>
                              {offer.power_kva && (
                                <span>{offer.power_kva} kVA</span>
                              )}
                            </div>
                          </div>

                          {/* Changements détaillés */}
                          {offer.changes && Object.keys(offer.changes).length > 0 && (
                            <div className="space-y-2 mt-3 pl-4 border-l-2 border-blue-300 dark:border-blue-700">
                              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Changements détectés :
                              </div>
                              {Object.entries(offer.changes).map(([field, change]: [string, any]) => {
                                const oldValue = change.old
                                const newValue = change.new

                                // Nom de champ en français
                                const fieldNames: Record<string, string> = {
                                  'subscription_price': 'Abonnement',
                                  'base_price': 'Prix BASE',
                                  'hp_price': 'Prix HP',
                                  'hc_price': 'Prix HC',
                                  'tempo_blue_hc': 'Tempo Bleu HC',
                                  'tempo_blue_hp': 'Tempo Bleu HP',
                                  'tempo_white_hc': 'Tempo Blanc HC',
                                  'tempo_white_hp': 'Tempo Blanc HP',
                                  'tempo_red_hc': 'Tempo Rouge HC',
                                  'tempo_red_hp': 'Tempo Rouge HP',
                                  'description': 'Description',
                                }

                                // Check if it's a numeric field
                                const isNumeric = typeof oldValue === 'number' && typeof newValue === 'number'
                                const percentChange = isNumeric ? ((newValue - oldValue) / oldValue) * 100 : 0
                                const isIncrease = newValue > oldValue

                                return (
                                  <div key={field} className="text-sm">
                                    <div className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                                      {fieldNames[field] || field}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {isNumeric ? (
                                        <>
                                          <span className="text-gray-500 dark:text-gray-400 line-through">
                                            {formatPrice(oldValue, 5)} €
                                          </span>
                                          <span className="text-gray-400 dark:text-gray-600">→</span>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                                            {formatPrice(newValue, 5)} €
                                          </span>
                                          {Math.abs(percentChange) > 0.01 && (
                                            <span className={`text-xs font-medium ${
                                              isIncrease
                                                ? 'text-red-600 dark:text-red-400'
                                                : 'text-green-600 dark:text-green-400'
                                            }`}>
                                              {isIncrease ? '↗' : '↘'} {Math.abs(percentChange).toFixed(1)}%
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-gray-500 dark:text-gray-400 line-through text-xs">
                                            {String(oldValue)}
                                          </span>
                                          <span className="text-gray-400 dark:text-gray-600">→</span>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">
                                            {String(newValue)}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Aucune mise à jour
                    </div>
                  )}
                </div>
              )}

              {previewActiveTab === 'deactivated' && (
                <div>
                  {previewData.deactivated_offers && previewData.deactivated_offers.length > 0 ? (
                    <div className="space-y-3">
                      {previewData.deactivated_offers.map((offer: any, index) => {
                        // Extract current offer data
                        const currentOffer = offer as any

                        return (
                          <div
                            key={index}
                            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                  {currentOffer.name || currentOffer.offer_name}
                                </h3>
                                <div className="flex items-center gap-3 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                  <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded">
                                    {currentOffer.offer_type}
                                  </span>
                                  {currentOffer.power_kva && (
                                    <span>{currentOffer.power_kva} kVA</span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-red-600 dark:text-red-400 font-semibold">
                                  Sera désactivée
                                </div>
                              </div>
                            </div>

                            {/* Current offer details */}
                            <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                              <div className="text-sm text-gray-700 dark:text-gray-300">
                                <div className="font-semibold mb-2">Tarifs actuels :</div>
                                <div className="grid grid-cols-2 gap-2">
                                  {currentOffer.subscription_price && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">Abonnement :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.subscription_price, 2)} €/mois</span>
                                    </div>
                                  )}

                                  {/* BASE pricing */}
                                  {currentOffer.base_price && !currentOffer.base_price_weekend && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">Prix base :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.base_price, 5)} €/kWh</span>
                                    </div>
                                  )}

                                  {/* BASE Weekend pricing - show both semaine and weekend */}
                                  {currentOffer.base_price && currentOffer.base_price_weekend && (
                                    <>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Heures semaine :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.base_price, 5)} €/kWh</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Heures week-end :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.base_price_weekend, 5)} €/kWh</span>
                                      </div>
                                    </>
                                  )}

                                  {/* HC/HP pricing */}
                                  {currentOffer.hp_price && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">HP :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.hp_price, 5)} €/kWh</span>
                                    </div>
                                  )}
                                  {currentOffer.hc_price && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">HC :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.hc_price, 5)} €/kWh</span>
                                    </div>
                                  )}

                                  {/* HC/HP Weekend pricing */}
                                  {currentOffer.hp_price_weekend && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">HP week-end :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.hp_price_weekend, 5)} €/kWh</span>
                                    </div>
                                  )}
                                  {currentOffer.hc_price_weekend && (
                                    <div>
                                      <span className="text-gray-600 dark:text-gray-400">HC week-end :</span>{' '}
                                      <span className="font-mono">{formatPrice(currentOffer.hc_price_weekend, 5)} €/kWh</span>
                                    </div>
                                  )}

                                  {/* TEMPO pricing */}
                                  {currentOffer.tempo_blue_hp && (
                                    <>
                                      <div className="col-span-2 font-semibold mt-2">Tarifs TEMPO :</div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Bleu HP/HC :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.tempo_blue_hp, 5)} / {formatPrice(currentOffer.tempo_blue_hc, 5)} €</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Blanc HP/HC :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.tempo_white_hp, 5)} / {formatPrice(currentOffer.tempo_white_hc, 5)} €</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">Rouge HP/HC :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.tempo_red_hp, 5)} / {formatPrice(currentOffer.tempo_red_hc, 5)} €</span>
                                      </div>
                                    </>
                                  )}

                                  {/* Seasonal pricing */}
                                  {currentOffer.hc_price_winter && (
                                    <>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">HC hiver :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.hc_price_winter, 5)} €/kWh</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">HP hiver :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.hp_price_winter, 5)} €/kWh</span>
                                      </div>
                                    </>
                                  )}
                                  {currentOffer.hc_price_summer && (
                                    <>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">HC été :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.hc_price_summer, 5)} €/kWh</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">HP été :</span>{' '}
                                        <span className="font-mono">{formatPrice(currentOffer.hp_price_summer, 5)} €/kWh</span>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {/* Description if available */}
                                {currentOffer.description && (
                                  <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 italic">
                                    {currentOffer.description}
                                  </div>
                                )}

                                {/* Last update info */}
                                {currentOffer.price_updated_at && (
                                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                                    Dernière mise à jour : {new Date(currentOffer.price_updated_at).toLocaleDateString('fr-FR')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Aucune désactivation
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-6 border-t border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total des changements : <span className="font-semibold">{previewData.total_changes}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPreviewModalOpen(false)
                      setPreviewData(null)
                    }}
                    className="btn btn-secondary"
                    disabled={refreshingProvider !== null}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => {
                      const provider = providersData?.find(p => p.name === previewData.provider)
                      if (provider) {
                        handleRefreshOffers(provider.id, provider.name, true)
                      }
                    }}
                    className="btn btn-primary flex items-center gap-2"
                    disabled={refreshingProvider !== null}
                  >
                    {refreshingProvider ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Application...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} />
                        Appliquer les changements
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition des URLs du scraper */}
      {editingScraperUrls && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Éditer les URLs du scraper - {editingScraperUrls.name}
                </h2>
                <button
                  onClick={() => {
                    setEditingScraperUrls(null)
                    setScraperUrlsInput([])
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Les URLs sont utilisées par le scraper pour récupérer automatiquement les tarifs depuis le site du fournisseur.
                </p>

                {(() => {
                  // Labels pour les URLs en fonction du fournisseur
                  const urlLabels: Record<string, string[]> = {
                    'EDF': ['Tarif Bleu (réglementé)', 'Zen Week-End (marché)'],
                    'Enercoop': ['Grille tarifaire (PDF officiel)'],
                    'TotalEnergies': ['Offre Essentielle (Eco Electricité)', 'Offre Verte Fixe'],
                    'Priméo Énergie': ['Offre Fixe -20% (PDF)'],
                    'Engie': ['Tarifs Engie (HelloWatt)'],
                    'ALPIQ': ['Électricité Stable -21,5% (PDF)', 'Stable -8% + Référence -4% (PDF)'],
                    'Alterna': ['Électricité verte 100% locale', 'Électricité verte 100% française', 'Électricité verte 100% VE'],
                    'Ekwateur': ['Prix kwh électricité et abonnement'],
                    'Mint Énergie': ['Online & Green (PDF)', 'Classic & Green (PDF)', 'Smart & Green (PDF)']
                  }
                  const labels = urlLabels[editingScraperUrls?.name || ''] || []

                  return scraperUrlsInput.map((url, index) => (
                    <div key={index} className="space-y-1">
                      {labels[index] && (
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          {labels[index]}
                        </label>
                      )}
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => handleUpdateScraperUrl(index, e.target.value)}
                        placeholder="https://..."
                        className="input w-full"
                      />
                    </div>
                  ))
                })()}
              </div>

              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setEditingScraperUrls(null)
                    setScraperUrlsInput([])
                  }}
                  className="btn btn-secondary flex-1"
                  disabled={savingScraperUrls}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveScraperUrls}
                  className="btn btn-primary flex-1"
                  disabled={savingScraperUrls}
                >
                  {savingScraperUrls ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Enregistrement...
                    </>
                  ) : (
                    'Enregistrer'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
