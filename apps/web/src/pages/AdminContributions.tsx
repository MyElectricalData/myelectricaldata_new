import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, CheckCircle, XCircle, Calendar, User, Package, DollarSign, ExternalLink, Image, Zap, MessageCircle, Clock, ArrowUpDown, Award } from 'lucide-react'
import { energyApi } from '@/api/energy'
import ChatWhatsApp, { type ChatMessage } from '@/components/ChatWhatsApp'

interface ExistingProvider {
  id: string
  name: string
  logo_url?: string
  website?: string
}

interface ExistingOffer {
  id: string
  name: string
  offer_type: string
  description?: string
  subscription_price: number
  base_price?: number
  hc_price?: number
  hp_price?: number
  tempo_blue_hc?: number
  tempo_blue_hp?: number
  tempo_white_hc?: number
  tempo_white_hp?: number
  tempo_red_hc?: number
  tempo_red_hp?: number
  ejp_normal?: number
  ejp_peak?: number
  hc_schedules?: Record<string, string>
  power_kva?: number
  valid_from?: string
  valid_to?: string
}

interface PendingContribution {
  id: string
  has_unread_messages?: boolean
  contributor_email: string
  contribution_type: string
  status: string
  provider_name?: string
  provider_website?: string
  existing_provider_id?: string
  existing_provider?: ExistingProvider
  existing_offer_id?: string
  existing_offer?: ExistingOffer
  offer_name: string
  offer_type: string
  description?: string
  pricing_data: {
    subscription_price: number
    base_price?: number
    hc_price?: number
    hp_price?: number
    base_price_weekend?: number
    hc_price_weekend?: number
    hp_price_weekend?: number
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    ejp_normal?: number
    ejp_peak?: number
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    peak_day_price?: number
  }
  hc_schedules?: Record<string, string>
  power_kva?: number
  price_sheet_url: string
  screenshot_url?: string
  created_at: string
}

export default function AdminContributions() {
  const queryClient = useQueryClient()
  const [selectedContribution, setSelectedContribution] = useState<PendingContribution | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [infoRequestMessage, setInfoRequestMessage] = useState('')
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showInfoRequestModal, setShowInfoRequestModal] = useState(false)
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [contributionMessages, setContributionMessages] = useState<Record<string, Array<{id: string, message_type: string, content: string, is_from_admin: boolean, sender_email: string, created_at: string}>>>({})
  const [loadingMessages, setLoadingMessages] = useState<Record<string, boolean>>({})
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const [readContributions, setReadContributions] = useState<Set<string>>(() => {
    // Load from localStorage on init
    try {
      const saved = localStorage.getItem('admin-read-contributions')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [quickReplyMessage, setQuickReplyMessage] = useState<Record<string, string>>({})

  // Filters state
  const [searchFilter, setSearchFilter] = useState<string>('')
  const [offerTypeFilter, setOfferTypeFilter] = useState<string>('all')

  // Sorting state
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false)
  const [bulkRejectReason, setBulkRejectReason] = useState('')

  // Fetch contribution stats
  const { data: statsResponse } = useQuery({
    queryKey: ['admin-contribution-stats'],
    queryFn: async () => {
      const response = await energyApi.getContributionStats()
      return response.data as {pending_count: number, approved_this_month: number, rejected_count: number, approved_count: number, top_contributors: Array<{email: string, count: number}>}
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const stats = statsResponse || { pending_count: 0, approved_this_month: 0, rejected_count: 0, approved_count: 0, top_contributors: [] }

  // Fetch pending contributions
  const { data: contributions, isLoading } = useQuery({
    queryKey: ['admin-pending-contributions'],
    queryFn: async () => {
      const response = await energyApi.getPendingContributions()
      return Array.isArray(response.data) ? (response.data as PendingContribution[]) : []
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  // Filter and sort contributions
  const filteredContributions = contributions?.filter((contribution) => {
    // Search filter (by offer name or contributor email)
    const searchLower = searchFilter.toLowerCase()
    const matchesSearch = !searchFilter ||
      contribution.offer_name.toLowerCase().includes(searchLower) ||
      contribution.contributor_email.toLowerCase().includes(searchLower)

    // Offer type filter
    const matchesOfferType = offerTypeFilter === 'all' || contribution.offer_type === offerTypeFilter

    return matchesSearch && matchesOfferType
  })
  .sort((a, b) => {
    const dateA = new Date(a.created_at).getTime()
    const dateB = new Date(b.created_at).getTime()
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
  }) || []

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (contributionId: string) => {
      return await energyApi.approveContribution(contributionId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-contribution-stats'] })
      setNotification({ type: 'success', message: 'Contribution approuvée avec succès !' })
      setTimeout(() => setNotification(null), 5000)
      setSelectedContribution(null)
      setShowApproveModal(false)
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
      setShowApproveModal(false)
    },
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return await energyApi.rejectContribution(id, reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-contribution-stats'] })
      setNotification({ type: 'success', message: 'Contribution rejetée.' })
      setTimeout(() => setNotification(null), 5000)
      setSelectedContribution(null)
      setRejectReason('')
      setShowRejectModal(false)
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
      setShowRejectModal(false)
    },
  })

  // Info request mutation
  const infoRequestMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      return await energyApi.requestContributionInfo(id, message)
    },
    onSuccess: () => {
      setNotification({ type: 'success', message: 'Demande d\'information envoyée au contributeur.' })
      setTimeout(() => setNotification(null), 5000)
      // Reload messages for this contribution
      if (selectedContribution) {
        loadMessages(selectedContribution.id)
      }
      setSelectedContribution(null)
      setInfoRequestMessage('')
      setShowInfoRequestModal(false)
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
      setShowInfoRequestModal(false)
    },
  })

  // Quick reply mutation (inline in message history)
  const quickReplyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      return await energyApi.requestContributionInfo(id, message)
    },
    onSuccess: (_data, variables) => {
      setNotification({ type: 'success', message: 'Message envoyé au contributeur.' })
      setTimeout(() => setNotification(null), 5000)
      // Reload messages for this contribution
      loadMessages(variables.id)
      // Clear the input
      setQuickReplyMessage(prev => ({ ...prev, [variables.id]: '' }))
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return await energyApi.bulkApproveContributions(ids)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-contribution-stats'] })
      setNotification({ type: 'success', message: `${selectedIds.size} contribution(s) approuvée(s) avec succès !` })
      setTimeout(() => setNotification(null), 5000)
      setSelectedIds(new Set())
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  // Bulk reject mutation
  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      return await energyApi.bulkRejectContributions(ids, reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-contribution-stats'] })
      setNotification({ type: 'success', message: `${selectedIds.size} contribution(s) rejetée(s).` })
      setTimeout(() => setNotification(null), 5000)
      setSelectedIds(new Set())
      setBulkRejectReason('')
      setShowBulkRejectModal(false)
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: `Erreur: ${error.message || 'Une erreur est survenue'}` })
      setTimeout(() => setNotification(null), 5000)
      setShowBulkRejectModal(false)
    },
  })

  // Ref pour éviter les dépendances cycliques dans useCallback
  const loadingMessagesRef = useRef(loadingMessages)
  useEffect(() => {
    loadingMessagesRef.current = loadingMessages
  }, [loadingMessages])

  // Load messages for a contribution
  const loadMessages = useCallback(async (contributionId: string, silent: boolean = false) => {
    if (!silent && loadingMessagesRef.current[contributionId]) return
    if (!silent) {
      setLoadingMessages(prev => ({ ...prev, [contributionId]: true }))
    }
    try {
      const response = await energyApi.getContributionMessages(contributionId)
      if (Array.isArray(response.data)) {
        setContributionMessages(prev => ({ ...prev, [contributionId]: response.data as Array<{id: string, message_type: string, content: string, is_from_admin: boolean, sender_email: string, created_at: string}> }))
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      if (!silent) {
        setLoadingMessages(prev => ({ ...prev, [contributionId]: false }))
      }
    }
  }, [])

  // Ref pour stocker expandedMessages et éviter les dépendances cycliques
  const expandedMessagesRef = useRef(expandedMessages)
  useEffect(() => {
    expandedMessagesRef.current = expandedMessages
  }, [expandedMessages])

  // Auto-refresh messages for expanded contributions every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const expandedIds = Array.from(expandedMessagesRef.current)
      expandedIds.forEach(contributionId => {
        // Silent refresh - don't show loading state
        loadMessages(contributionId, true)
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [loadMessages])

  // Toggle messages visibility
  const toggleMessages = async (contributionId: string) => {
    if (expandedMessages.has(contributionId)) {
      // Collapse
      setExpandedMessages(prev => {
        const next = new Set(prev)
        next.delete(contributionId)
        return next
      })
    } else {
      // Expand - load messages if not already loaded
      if (!contributionMessages[contributionId]) {
        await loadMessages(contributionId)
      }
      setExpandedMessages(prev => new Set(prev).add(contributionId))
      // Mark as read when expanded and persist to localStorage
      setReadContributions(prev => {
        const next = new Set(prev).add(contributionId)
        try {
          localStorage.setItem('admin-read-contributions', JSON.stringify([...next]))
        } catch {
          // Ignore localStorage errors
        }
        return next
      })
    }
  }

  // Check if contribution has unread messages (last message is from contributor, not admin)
  const hasUnreadMessages = (contribution: PendingContribution): boolean => {
    // First check from API response (available before messages are loaded)
    if (contribution.has_unread_messages !== undefined) {
      return contribution.has_unread_messages
    }
    // Fallback to local check if messages are already loaded
    const messages = contributionMessages[contribution.id]
    if (!messages || messages.length === 0) return false
    const lastMessage = messages[messages.length - 1]
    return !lastMessage.is_from_admin
  }

  const handleApprove = () => {
    setShowApproveModal(true)
  }

  const confirmApprove = () => {
    if (selectedContribution) {
      approveMutation.mutate(selectedContribution.id)
    }
  }

  const handleReject = () => {
    setShowRejectModal(true)
  }

  const confirmReject = () => {
    if (selectedContribution) {
      rejectMutation.mutate({ id: selectedContribution.id, reason: rejectReason || undefined })
    }
  }

  const handleInfoRequest = () => {
    setShowInfoRequestModal(true)
  }

  const confirmInfoRequest = () => {
    if (selectedContribution && infoRequestMessage.trim()) {
      infoRequestMutation.mutate({ id: selectedContribution.id, message: infoRequestMessage })
    }
  }

  const handleBulkSelectAll = () => {
    if (selectedIds.size === filteredContributions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredContributions.map(c => c.id)))
    }
  }

  const handleToggleSelection = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleBulkApprove = () => {
    bulkApproveMutation.mutate(Array.from(selectedIds))
  }

  const handleBulkReject = () => {
    setShowBulkRejectModal(true)
  }

  const confirmBulkReject = () => {
    if (bulkRejectReason.trim()) {
      bulkRejectMutation.mutate({ ids: Array.from(selectedIds), reason: bulkRejectReason })
    }
  }

  const formatPrice = (price?: number) => {
    if (price === undefined || price === null) return '-'
    return `${price.toFixed(4)} €/kWh`
  }

  const formatSubscription = (price: number) => {
    return `${price.toFixed(2)} €/mois`
  }

  const getContributionTypeLabel = (type: string) => {
    switch (type) {
      case 'NEW_PROVIDER':
        return 'Nouveau fournisseur + offre'
      case 'NEW_OFFER':
        return 'Nouvelle offre'
      case 'UPDATE_OFFER':
        return 'Mise à jour offre'
      default:
        return type
    }
  }

  const getOfferTypeLabel = (type: string) => {
    switch (type) {
      case 'BASE':
        return 'BASE'
      case 'BASE_WEEKEND':
        return 'BASE avec tarif week-end'
      case 'HC_HP':
        return 'Heures Creuses / Heures Pleines'
      case 'HC_HP_WEEKEND':
        return 'HC/HP avec tarif week-end'
      case 'HC_HP_SEASONAL':
        return 'HC/HP avec tarifs saisonniers'
      case 'TEMPO':
        return 'TEMPO'
      case 'EJP':
        return 'EJP'
      default:
        return type.replace(/_/g, ' ')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Chargement des contributions...</div>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Clock className="text-blue-600 dark:text-blue-400" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">En attente</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending_count}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Validées ce mois</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.approved_this_month}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <XCircle className="text-red-600 dark:text-red-400" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Rejetées</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.rejected_count}</p>
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Users className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total validées</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.approved_count}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Contributors */}
      {stats.top_contributors && stats.top_contributors.length > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="text-yellow-600 dark:text-yellow-400" size={20} />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Top Contributeurs</h3>
          </div>
          <div className="space-y-2">
            {stats.top_contributors.slice(0, 5).map((contributor, index) => {
              const initials = contributor.email
                .split('@')[0]
                .split('.')
                .map(part => part[0]?.toUpperCase())
                .join('')
                .slice(0, 2)

              return (
                <div key={contributor.email} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                  <div className="flex items-center gap-2 flex-1">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">{initials}</span>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{contributor.email}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                      {contributor.count} {contributor.count > 1 ? 'validées' : 'validée'}
                    </span>
                    {index === 0 && (
                      <Award className="text-yellow-500" size={16} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rechercher
            </label>
            <input
              id="search"
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Nom d'offre ou email contributeur..."
              className="input w-full"
            />
          </div>

          {/* Offer Type Filter */}
          <div className="w-full lg:w-64">
            <label htmlFor="offerType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type d'offre
            </label>
            <select
              id="offerType"
              value={offerTypeFilter}
              onChange={(e) => setOfferTypeFilter(e.target.value)}
              className="input w-full"
            >
              <option value="all">Tous les types</option>
              <option value="BASE">BASE</option>
              <option value="HC_HP">HC/HP</option>
              <option value="TEMPO">TEMPO</option>
              <option value="EJP">EJP</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="w-full lg:w-48">
            <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tri par date
            </label>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="input w-full flex items-center justify-between"
            >
              <span>{sortOrder === 'desc' ? 'Plus récent' : 'Plus ancien'}</span>
              <ArrowUpDown size={16} className="text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-300 dark:border-gray-700 p-4 flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkApprove}
              className="btn bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              disabled={bulkApproveMutation.isPending}
            >
              <CheckCircle size={16} />
              Approuver
            </button>
            <button
              onClick={handleBulkReject}
              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
              disabled={bulkRejectMutation.isPending}
            >
              <XCircle size={16} />
              Rejeter
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="btn"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg flex items-center gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400" size={24} />
          )}
          <p className={`flex-1 ${
            notification.type === 'success'
              ? 'text-green-800 dark:text-green-200'
              : 'text-red-800 dark:text-red-200'
          }`}>
            {notification.message}
          </p>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <CheckCircle className="text-green-600 dark:text-green-400" size={24} />
              Approuver la contribution
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Êtes-vous sûr de vouloir approuver cette contribution ? L'offre sera ajoutée/mise à jour dans la base de données.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowApproveModal(false)}
                className="btn"
                disabled={approveMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={confirmApprove}
                className="btn btn-primary"
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending ? 'Approbation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <XCircle className="text-red-600 dark:text-red-400" size={24} />
              Rejeter la contribution
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Êtes-vous sûr de vouloir rejeter cette contribution ? Un email sera envoyé au contributeur.
            </p>

            {/* Quick rejection reasons */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Raisons rapides
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Offre non valide', text: 'L\'offre soumise ne correspond pas à une offre valide du fournisseur.' },
                  { label: 'Lien invalide', text: 'Le lien vers la fiche des prix fourni est invalide ou ne fonctionne plus. Merci de fournir un lien direct vers la fiche tarifaire officielle.' },
                  { label: 'Offre introuvable', text: 'Je ne retrouve pas l\'offre mentionnée sur le site du fournisseur. Merci de fournir un lien précis vers la fiche tarifaire.' },
                  { label: 'Offre expirée', text: 'Cette offre semble avoir expiré ou n\'est plus commercialisée par le fournisseur.' },
                  { label: 'Doublon', text: 'Cette offre existe déjà dans notre base de données.' },
                  { label: 'Données incomplètes', text: 'Les données tarifaires fournies sont incomplètes. Merci de renseigner tous les prix requis pour ce type d\'offre.' },
                ].map((reason) => (
                  <button
                    key={reason.label}
                    type="button"
                    onClick={() => setRejectReason(reason.text)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      rejectReason === reason.text
                        ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                        : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Raison du rejet
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input w-full"
                rows={4}
                placeholder="Expliquez pourquoi cette contribution est rejetée..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Ce message sera envoyé par email au contributeur.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRejectModal(false)
                  setRejectReason('')
                }}
                className="btn"
                disabled={rejectMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={confirmReject}
                className="btn bg-red-600 hover:bg-red-700 text-white"
                disabled={rejectMutation.isPending || !rejectReason.trim()}
              >
                {rejectMutation.isPending ? 'Rejet...' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <XCircle className="text-red-600 dark:text-red-400" size={24} />
              Rejeter {selectedIds.size} contribution{selectedIds.size > 1 ? 's' : ''}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Êtes-vous sûr de vouloir rejeter ces contributions ? Un email sera envoyé à chaque contributeur.
            </p>

            {/* Quick rejection reasons */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Raisons rapides
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Offre non valide', text: 'L\'offre soumise ne correspond pas à une offre valide du fournisseur.' },
                  { label: 'Lien invalide', text: 'Le lien vers la fiche des prix fourni est invalide ou ne fonctionne plus. Merci de fournir un lien direct vers la fiche tarifaire officielle.' },
                  { label: 'Offre introuvable', text: 'Je ne retrouve pas l\'offre mentionnée sur le site du fournisseur. Merci de fournir un lien précis vers la fiche tarifaire.' },
                  { label: 'Données incomplètes', text: 'Les données tarifaires fournies sont incomplètes. Merci de renseigner tous les prix requis pour ce type d\'offre.' },
                ].map((reason) => (
                  <button
                    key={reason.label}
                    type="button"
                    onClick={() => setBulkRejectReason(reason.text)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      bulkRejectReason === reason.text
                        ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                        : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Raison du rejet
              </label>
              <textarea
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                className="input w-full"
                rows={4}
                placeholder="Expliquez pourquoi ces contributions sont rejetées..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Ce message sera envoyé par email à tous les contributeurs concernés.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkRejectModal(false)
                  setBulkRejectReason('')
                }}
                className="btn"
                disabled={bulkRejectMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={confirmBulkReject}
                className="btn bg-red-600 hover:bg-red-700 text-white"
                disabled={bulkRejectMutation.isPending || !bulkRejectReason.trim()}
              >
                {bulkRejectMutation.isPending ? 'Rejet...' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Request Modal */}
      {showInfoRequestModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageCircle className="text-blue-600 dark:text-blue-400" size={24} />
              Demander des informations
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Envoyez un message au contributeur pour demander des précisions. Un email lui sera envoyé.
            </p>

            {/* Quick info request messages */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Messages rapides
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Lien introuvable', text: 'Je ne retrouve pas l\'offre mentionnée à partir du lien fourni. Pourriez-vous me fournir un lien direct vers la fiche tarifaire officielle sur le site du fournisseur ?' },
                  { label: 'Prix manquants', text: 'Certains prix semblent manquants dans votre contribution. Pourriez-vous vérifier et compléter les informations tarifaires ?' },
                  { label: 'Confirmer la puissance', text: 'Pourriez-vous confirmer la puissance (kVA) concernée par cette offre ?' },
                  { label: 'Date de validité', text: 'Quelle est la date de validité de ces tarifs ? Sont-ils actuellement en vigueur ?' },
                ].map((msg) => (
                  <button
                    key={msg.label}
                    type="button"
                    onClick={() => setInfoRequestMessage(msg.text)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      infoRequestMessage === msg.text
                        ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {msg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Votre message
              </label>
              <textarea
                value={infoRequestMessage}
                onChange={(e) => setInfoRequestMessage(e.target.value)}
                className="input w-full"
                rows={4}
                placeholder="Décrivez les informations dont vous avez besoin..."
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Ce message sera envoyé par email au contributeur et conservé dans l'historique.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowInfoRequestModal(false)
                  setInfoRequestMessage('')
                }}
                className="btn"
                disabled={infoRequestMutation.isPending}
              >
                Annuler
              </button>
              <button
                onClick={confirmInfoRequest}
                className="btn bg-blue-600 hover:bg-blue-700 text-white"
                disabled={infoRequestMutation.isPending || !infoRequestMessage.trim()}
              >
                {infoRequestMutation.isPending ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6 w-full">
      {!filteredContributions || filteredContributions.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="mx-auto text-gray-400 mb-4" size={48} />
          <h2 className="text-xl font-semibold mb-2">
            {searchFilter || offerTypeFilter !== 'all' ? 'Aucune contribution ne correspond aux filtres' : 'Aucune contribution en attente'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {searchFilter || offerTypeFilter !== 'all' ? 'Essayez de modifier les filtres de recherche.' : 'Toutes les contributions ont été traitées.'}
          </p>
        </div>
      ) : (
        <>
          {/* Select All Header */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredContributions.length && filteredContributions.length > 0}
              onChange={handleBulkSelectAll}
              className="w-4 h-4 text-primary-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none" onClick={handleBulkSelectAll}>
              Sélectionner tout ({filteredContributions.length})
            </label>
          </div>

          <div className="grid grid-cols-1 gap-6">
          {filteredContributions.map((contribution) => (
            <div key={contribution.id} className="card relative">
              {/* Checkbox */}
              <div className="absolute top-6 left-6">
                <input
                  type="checkbox"
                  checked={selectedIds.has(contribution.id)}
                  onChange={() => handleToggleSelection(contribution.id)}
                  className="w-4 h-4 text-primary-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Header */}
              <div className="flex items-start justify-between mb-6 ml-8">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{contribution.offer_name}</h2>
                  <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <User size={16} />
                      {contribution.contributor_email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={16} />
                      {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {getContributionTypeLabel(contribution.contribution_type)}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Provider Info */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Package size={18} />
                    Informations du fournisseur
                  </h3>
                  <div className="space-y-2 text-sm">
                    {contribution.contribution_type === 'NEW_PROVIDER' && contribution.provider_name ? (
                      <>
                        <div>
                          <span className="font-medium">Nouveau fournisseur :</span>
                          <span className="ml-2">{contribution.provider_name}</span>
                        </div>
                        {contribution.provider_website && (
                          <div>
                            <span className="font-medium">Site web :</span>
                            <a
                              href={contribution.provider_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                            >
                              {contribution.provider_website}
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        )}
                      </>
                    ) : contribution.existing_provider ? (
                      <>
                        <div>
                          <span className="font-medium">Fournisseur existant :</span>
                          <span className="ml-2">{contribution.existing_provider.name}</span>
                        </div>
                        {contribution.existing_provider.website && (
                          <div>
                            <span className="font-medium">Site web :</span>
                            <a
                              href={contribution.existing_provider.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
                            >
                              {contribution.existing_provider.website}
                              <ExternalLink size={14} />
                            </a>
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <span className="font-medium">Fournisseur existant</span>
                        <span className="ml-2 text-gray-500">(ID: {contribution.existing_provider_id})</span>
                      </div>
                    )}
                    {contribution.existing_offer && contribution.contribution_type === 'UPDATE_OFFER' && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-700">
                        <div className="font-medium mb-2">Offre actuelle à modifier :</div>
                        <div className="text-xs space-y-1 text-gray-600 dark:text-gray-400">
                          <div><span className="font-medium">Nom :</span> {contribution.existing_offer.name}</div>
                          {contribution.existing_offer.description && (
                            <div><span className="font-medium">Description :</span> {contribution.existing_offer.description}</div>
                          )}
                          {contribution.existing_offer.power_kva && (
                            <div><span className="font-medium">Puissance :</span> {contribution.existing_offer.power_kva} kVA</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Type d'offre :</span>
                      <span className="ml-2">{getOfferTypeLabel(contribution.offer_type)}</span>
                    </div>
                    {contribution.power_kva && (
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-yellow-600 dark:text-yellow-400" />
                        <span className="font-medium">Puissance souscrite :</span>
                        <span className="ml-2">{contribution.power_kva} kVA</span>
                      </div>
                    )}
                    {contribution.description && (
                      <div>
                        <span className="font-medium">Description :</span>
                        <p className="mt-1 text-gray-600 dark:text-gray-400">{contribution.description}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pricing Info */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <DollarSign size={18} />
                    Tarification proposée
                  </h3>
                  {contribution.contribution_type === 'UPDATE_OFFER' && contribution.existing_offer && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                      <div className="text-xs font-medium mb-2 text-blue-800 dark:text-blue-300">Prix actuels :</div>
                      <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                        <div className="flex justify-between">
                          <span>Abonnement :</span>
                          <span>{formatSubscription(contribution.existing_offer.subscription_price)}</span>
                        </div>
                        {contribution.existing_offer.base_price && (
                          <div className="flex justify-between">
                            <span>Prix BASE :</span>
                            <span>{formatPrice(contribution.existing_offer.base_price)}</span>
                          </div>
                        )}
                        {contribution.existing_offer.hc_price && (
                          <div className="flex justify-between">
                            <span>HC :</span>
                            <span>{formatPrice(contribution.existing_offer.hc_price)}</span>
                          </div>
                        )}
                        {contribution.existing_offer.hp_price && (
                          <div className="flex justify-between">
                            <span>HP :</span>
                            <span>{formatPrice(contribution.existing_offer.hp_price)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Abonnement :</span>
                      <span className={contribution.contribution_type === 'UPDATE_OFFER' && contribution.existing_offer && contribution.existing_offer.subscription_price !== contribution.pricing_data.subscription_price ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                        {formatSubscription(contribution.pricing_data.subscription_price)}
                      </span>
                    </div>

                    {/* BASE pricing - always check data, not just type */}
                    {contribution.pricing_data.base_price && (
                      <>
                        <div className="font-medium mt-2">Semaine :</div>
                        <div className="flex justify-between pl-4">
                          <span>Prix BASE :</span>
                          <span className={contribution.contribution_type === 'UPDATE_OFFER' && contribution.existing_offer && contribution.existing_offer.base_price !== contribution.pricing_data.base_price ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                            {formatPrice(contribution.pricing_data.base_price)}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Weekend pricing for BASE */}
                    {contribution.pricing_data.base_price_weekend && (
                      <>
                        <div className="font-medium mt-2">Week-end :</div>
                        <div className="flex justify-between pl-4">
                          <span>Prix BASE :</span>
                          <span>{formatPrice(contribution.pricing_data.base_price_weekend)}</span>
                        </div>
                      </>
                    )}

                    {/* HC/HP pricing - always check data */}
                    {(contribution.pricing_data.hc_price || contribution.pricing_data.hp_price) && (
                      <>
                        <div className="font-medium mt-2">Semaine :</div>
                        {contribution.pricing_data.hc_price && (
                          <div className="flex justify-between pl-4">
                            <span>Prix Heures Creuses :</span>
                            <span className={contribution.contribution_type === 'UPDATE_OFFER' && contribution.existing_offer && contribution.existing_offer.hc_price !== contribution.pricing_data.hc_price ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                              {formatPrice(contribution.pricing_data.hc_price)}
                            </span>
                          </div>
                        )}
                        {contribution.pricing_data.hp_price && (
                          <div className="flex justify-between pl-4">
                            <span>Prix Heures Pleines :</span>
                            <span className={contribution.contribution_type === 'UPDATE_OFFER' && contribution.existing_offer && contribution.existing_offer.hp_price !== contribution.pricing_data.hp_price ? 'text-orange-600 dark:text-orange-400 font-semibold' : ''}>
                              {formatPrice(contribution.pricing_data.hp_price)}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Weekend pricing for HC/HP */}
                    {(contribution.pricing_data.hc_price_weekend || contribution.pricing_data.hp_price_weekend) && (
                      <>
                        <div className="font-medium mt-2">Week-end :</div>
                        {contribution.pricing_data.hc_price_weekend && (
                          <div className="flex justify-between pl-4">
                            <span>Prix Heures Creuses :</span>
                            <span>{formatPrice(contribution.pricing_data.hc_price_weekend)}</span>
                          </div>
                        )}
                        {contribution.pricing_data.hp_price_weekend && (
                          <div className="flex justify-between pl-4">
                            <span>Prix Heures Pleines :</span>
                            <span>{formatPrice(contribution.pricing_data.hp_price_weekend)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Seasonal pricing - Hiver */}
                    {(contribution.pricing_data.hc_price_winter || contribution.pricing_data.hp_price_winter) && (
                      <>
                        <div className="font-medium mt-2">Hiver :</div>
                        {contribution.pricing_data.hc_price_winter && (
                          <div className="flex justify-between pl-4">
                            <span>Prix HC Hiver :</span>
                            <span>{formatPrice(contribution.pricing_data.hc_price_winter)}</span>
                          </div>
                        )}
                        {contribution.pricing_data.hp_price_winter && (
                          <div className="flex justify-between pl-4">
                            <span>Prix HP Hiver :</span>
                            <span>{formatPrice(contribution.pricing_data.hp_price_winter)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Seasonal pricing - Été */}
                    {(contribution.pricing_data.hc_price_summer || contribution.pricing_data.hp_price_summer) && (
                      <>
                        <div className="font-medium mt-2">Été :</div>
                        {contribution.pricing_data.hc_price_summer && (
                          <div className="flex justify-between pl-4">
                            <span>Prix HC Été :</span>
                            <span>{formatPrice(contribution.pricing_data.hc_price_summer)}</span>
                          </div>
                        )}
                        {contribution.pricing_data.hp_price_summer && (
                          <div className="flex justify-between pl-4">
                            <span>Prix HP Été :</span>
                            <span>{formatPrice(contribution.pricing_data.hp_price_summer)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Peak day pricing */}
                    {contribution.pricing_data.peak_day_price && (
                      <div className="flex justify-between mt-2">
                        <span className="font-medium">Prix jour de pointe :</span>
                        <span>{formatPrice(contribution.pricing_data.peak_day_price)}</span>
                      </div>
                    )}

                    {contribution.offer_type === 'TEMPO' && (
                      <>
                        <div className="font-medium mt-2">Jours Bleus :</div>
                        <div className="flex justify-between pl-4">
                          <span>HC :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_blue_hc)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>HP :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_blue_hp)}</span>
                        </div>
                        <div className="font-medium mt-2">Jours Blancs :</div>
                        <div className="flex justify-between pl-4">
                          <span>HC :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_white_hc)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>HP :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_white_hp)}</span>
                        </div>
                        <div className="font-medium mt-2">Jours Rouges :</div>
                        <div className="flex justify-between pl-4">
                          <span>HC :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_red_hc)}</span>
                        </div>
                        <div className="flex justify-between pl-4">
                          <span>HP :</span>
                          <span>{formatPrice(contribution.pricing_data.tempo_red_hp)}</span>
                        </div>
                      </>
                    )}

                    {contribution.offer_type === 'EJP' && (
                      <>
                        <div className="flex justify-between">
                          <span>Prix Normal :</span>
                          <span>{formatPrice(contribution.pricing_data.ejp_normal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Prix Pointe :</span>
                          <span>{formatPrice(contribution.pricing_data.ejp_peak)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* HC Schedules */}
                  {contribution.hc_schedules && Object.keys(contribution.hc_schedules).length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-sm">Horaires Heures Creuses :</h4>
                      <div className="space-y-1 text-xs">
                        {Object.entries(contribution.hc_schedules).map(([day, schedule]) => (
                          <div key={day} className="flex justify-between">
                            <span className="capitalize">{day} :</span>
                            <span className="text-gray-600 dark:text-gray-400">{schedule}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Documentation Section */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <ExternalLink size={18} />
                  Documentation et preuves
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium">Fiche des prix :</span>
                    <a
                      href={contribution.price_sheet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1 text-sm"
                    >
                      Voir la fiche
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  {contribution.screenshot_url && (
                    <div>
                      <span className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Image size={16} />
                        Capture d'écran :
                      </span>
                      <a
                        href={contribution.screenshot_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={contribution.screenshot_url}
                          alt="Capture d'écran de la fiche des prix"
                          className="max-w-full h-auto rounded-lg border border-gray-300 dark:border-gray-700 hover:opacity-90 transition-opacity"
                          style={{ maxHeight: '300px' }}
                        />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Message History - WhatsApp Style */}
              {expandedMessages.has(contribution.id) && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <MessageCircle size={18} />
                    Historique des échanges
                  </h3>

                  <ChatWhatsApp
                    messages={(contributionMessages[contribution.id] || []) as ChatMessage[]}
                    isAdminView={true}
                    inputValue={quickReplyMessage[contribution.id] || ''}
                    onInputChange={(value) => setQuickReplyMessage(prev => ({ ...prev, [contribution.id]: value }))}
                    onSend={() => {
                      if (quickReplyMessage[contribution.id]?.trim()) {
                        quickReplyMutation.mutate({ id: contribution.id, message: quickReplyMessage[contribution.id] })
                      }
                    }}
                    isSending={quickReplyMutation.isPending}
                    placeholder="Répondre au contributeur..."
                  />
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={() => {
                      setSelectedContribution(contribution)
                      handleApprove()
                    }}
                    className="btn bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle size={18} />
                    Approuver
                  </button>
                  <button
                    onClick={() => {
                      setSelectedContribution(contribution)
                      handleInfoRequest()
                    }}
                    className="btn bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                    disabled={infoRequestMutation.isPending}
                  >
                    <MessageCircle size={18} />
                    Demander des infos
                  </button>
                  <button
                    onClick={() => {
                      setSelectedContribution(contribution)
                      handleReject()
                    }}
                    className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle size={18} />
                    Rejeter
                  </button>
                  <button
                    onClick={() => toggleMessages(contribution.id)}
                    className={`btn flex items-center gap-2 text-sm relative ${
                      hasUnreadMessages(contribution) && !readContributions.has(contribution.id) ? 'ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-gray-800' : ''
                    }`}
                    disabled={loadingMessages[contribution.id]}
                  >
                    <MessageCircle size={16} className={hasUnreadMessages(contribution) && !readContributions.has(contribution.id) ? 'animate-pulse text-orange-500' : ''} />
                    {loadingMessages[contribution.id]
                      ? 'Chargement...'
                      : expandedMessages.has(contribution.id)
                        ? 'Masquer les échanges'
                        : 'Voir les échanges'
                    }
                    {hasUnreadMessages(contribution) && !readContributions.has(contribution.id) && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
        </>
      )}
      </div>
    </div>
  )
}
