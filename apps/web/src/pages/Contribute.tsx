import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, XCircle, List, FileJson, ChevronDown, ChevronRight, MessageCircle, ExternalLink, Copy, Plus, Package, Send, X } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData, type EnergyOffer, type Contribution } from '@/api/energy'
import ChatWhatsApp, { type ChatMessage } from '@/components/ChatWhatsApp'

type TabType = 'new' | 'mine' | 'offers'

interface ContributeProps {
  initialTab?: TabType
}

export default function Contribute({ initialTab = 'new' }: ContributeProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [showJsonImport, setShowJsonImport] = useState(false)
  const [jsonImportData, setJsonImportData] = useState('')
  const [importProgress, setImportProgress] = useState<{current: number, total: number, errors: string[]} | null>(null)
  // Accordéons par statut : pending déplié par défaut, approved et rejected pliés
  const [expandedStatusSections, setExpandedStatusSections] = useState<Record<string, boolean>>({
    pending: true,
    approved: false,
    rejected: false,
  })
  // State pour les réponses aux messages par contribution
  const [replyMessages, setReplyMessages] = useState<Record<string, string>>({})
  const [sendingReply, setSendingReply] = useState<string | null>(null)
  // State pour afficher les échanges d'une contribution
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({})
  // State pour suivre la contribution en cours d'édition
  const [editingContributionId, setEditingContributionId] = useState<string | null>(null)
  // State pour l'édition inline des offres (toutes les offres sont éditables)
  // Structure: { offerId: { fieldKey: value } }
  const [editedOffers, setEditedOffers] = useState<Record<string, Record<string, string>>>({})
  const [submittingOffers, setSubmittingOffers] = useState(false)
  const [showSubmitRecap, setShowSubmitRecap] = useState(false)

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

  // Fetch user's contributions (with auto-refresh every 10 seconds for pending ones)
  const { data: myContributions } = useQuery({
    queryKey: ['my-contributions'],
    queryFn: async () => {
      const response = await energyApi.getMyContributions()
      if (response.success && Array.isArray(response.data)) {
        return response.data as Contribution[]
      }
      return []
    },
    refetchInterval: 10000, // Rafraîchit toutes les 10 secondes
  })

  // Fetch all offers
  const { data: offersData } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: async () => {
      const response = await energyApi.getOffers()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyOffer[]
      }
      return []
    },
  })

  // Group contributions by status
  const contributionsByStatus = useMemo(() => {
    if (!Array.isArray(myContributions)) return { pending: [] as Contribution[], approved: [] as Contribution[], rejected: [] as Contribution[] }

    const grouped: { pending: Contribution[], approved: Contribution[], rejected: Contribution[] } = {
      pending: [],
      approved: [],
      rejected: [],
    }

    myContributions.forEach((contribution: Contribution) => {
      if (contribution.status === 'approved') {
        grouped.approved.push(contribution)
      } else if (contribution.status === 'rejected') {
        grouped.rejected.push(contribution)
      } else {
        grouped.pending.push(contribution)
      }
    })

    // Trier par date décroissante dans chaque groupe
    const sortByDate = (a: Contribution, b: Contribution) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    grouped.pending.sort(sortByDate)
    grouped.approved.sort(sortByDate)
    grouped.rejected.sort(sortByDate)

    return grouped
  }, [myContributions])

  // Helper to get offer type label
  const getOfferTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'BASE': 'Base',
      'HC_HP': 'Heures Creuses / Heures Pleines',
      'TEMPO': 'Tempo',
      'EJP': 'EJP',
      'BASE_WEEKEND': 'Base + Weekend',
      'HC_WEEKEND': 'HC/HP + Weekend',
      'HC_NUIT_WEEKEND': 'HC Nuit + Weekend',
      'SEASONAL': 'Saisonnier',
      'ZEN_FLEX': 'Zen Flex',
    }
    return labels[type] || type
  }

  // Helper to format price
  const formatPrice = (price: number | undefined) => {
    if (price === undefined || price === null) return '-'
    return `${Number(price).toFixed(4)} €/kWh`
  }

  // Render contribution card with messages
  const renderContributionCard = (contribution: Contribution) => {
    // Check if last message is from admin (unread)
    const lastMessage = contribution.messages?.[contribution.messages.length - 1]
    const hasUnreadMessage = lastMessage?.is_from_admin ?? false
    // Keep expanded if user is writing or sending a message
    const isWritingMessage = !!replyMessages[contribution.id]?.trim()
    const isSendingMessage = sendingReply === contribution.id
    const isMessagesExpanded = expandedMessages[contribution.id] ?? hasUnreadMessage ?? isWritingMessage ?? isSendingMessage
    // Show messages section for pending contributions (can send messages) or if there are existing messages
    const showMessagesSection = contribution.status === 'pending' || (contribution.messages && contribution.messages.length > 0)
    const messageCount = contribution.messages?.length ?? 0

    return (
    <div
      key={contribution.id}
      className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden"
    >
      {/* Compact Header with all key info */}
      <div className="p-3 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base truncate">{contribution.offer_name}</h3>
              <span className="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded shrink-0">
                {getOfferTypeLabel(contribution.offer_type)}
              </span>
              {contribution.power_kva && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded shrink-0">
                  {contribution.power_kva} kVA
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
              <span>
                {contribution.contribution_type === 'NEW_PROVIDER'
                  ? contribution.provider_name
                  : contribution.existing_provider_name || 'Fournisseur existant'}
              </span>
              <span>•</span>
              <span>{new Date(contribution.created_at).toLocaleDateString('fr-FR')}</span>
              {contribution.description && (
                <>
                  <span>•</span>
                  <span className="truncate max-w-[200px]">{contribution.description}</span>
                </>
              )}
            </div>
          </div>
          {/* Documentation links */}
          <div className="flex gap-1 shrink-0">
            {contribution.price_sheet_url && (
              <a
                href={contribution.price_sheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded"
                title="Fiche des prix"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Compact Pricing - inline */}
      {contribution.pricing_data && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 text-xs">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {contribution.pricing_data.subscription_price !== undefined && (
              <span><span className="text-gray-500">Abo:</span> <span className="font-medium">{contribution.pricing_data.subscription_price}€</span></span>
            )}
            {contribution.pricing_data.base_price !== undefined && (
              <span><span className="text-gray-500">Base:</span> <span className="font-medium">{formatPrice(contribution.pricing_data.base_price)}</span></span>
            )}
            {contribution.pricing_data.hc_price !== undefined && (
              <span><span className="text-gray-500">HC:</span> <span className="font-medium">{formatPrice(contribution.pricing_data.hc_price)}</span></span>
            )}
            {contribution.pricing_data.hp_price !== undefined && (
              <span><span className="text-gray-500">HP:</span> <span className="font-medium">{formatPrice(contribution.pricing_data.hp_price)}</span></span>
            )}
            {/* Tempo prices - compact */}
            {contribution.pricing_data.tempo_blue_hc !== undefined && (
              <>
                <span className="text-blue-600 dark:text-blue-400">
                  <span className="font-medium">Bleu</span> {formatPrice(contribution.pricing_data.tempo_blue_hc)}/{formatPrice(contribution.pricing_data.tempo_blue_hp)}
                </span>
                <span>
                  <span className="font-medium">Blanc</span> {formatPrice(contribution.pricing_data.tempo_white_hc)}/{formatPrice(contribution.pricing_data.tempo_white_hp)}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  <span className="font-medium">Rouge</span> {formatPrice(contribution.pricing_data.tempo_red_hc)}/{formatPrice(contribution.pricing_data.tempo_red_hp)}
                </span>
              </>
            )}
            {/* EJP prices */}
            {contribution.pricing_data.ejp_normal !== undefined && (
              <>
                <span><span className="text-gray-500">Normal:</span> <span className="font-medium">{formatPrice(contribution.pricing_data.ejp_normal)}</span></span>
                <span className="text-orange-600 dark:text-orange-400"><span className="font-medium">Pointe:</span> {formatPrice(contribution.pricing_data.ejp_peak)}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit button - compact, for rejected and pending contributions */}
      {(contribution.status === 'rejected' || contribution.status === 'pending') && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => {
              setEditingContributionId(contribution.id)
              navigate('/contribute/new')
              setContributionType(contribution.contribution_type === 'NEW_PROVIDER' ? 'NEW_PROVIDER' : 'NEW_OFFER')
              if (contribution.provider_name) setProviderName(contribution.provider_name)
              if (contribution.provider_website) setProviderWebsite(contribution.provider_website)
              if (contribution.existing_provider_id) setSelectedProviderId(contribution.existing_provider_id)
              setOfferName(contribution.offer_name)
              setOfferType(contribution.offer_type)
              if (contribution.description) setDescription(contribution.description)
              if (contribution.power_kva) setPowerKva(String(contribution.power_kva))
              if (contribution.price_sheet_url) setPriceSheetUrl(contribution.price_sheet_url)
              if (contribution.screenshot_url) setScreenshotUrl(contribution.screenshot_url)
              if (contribution.pricing_data) {
                const p = contribution.pricing_data
                if (p.subscription_price !== undefined) setSubscriptionPrice(String(p.subscription_price))
                if (p.base_price !== undefined) setBasePrice(String(p.base_price))
                if (p.hc_price !== undefined) setHcPrice(String(p.hc_price))
                if (p.hp_price !== undefined) setHpPrice(String(p.hp_price))
                if (p.tempo_blue_hc !== undefined) setTempoBlueHc(String(p.tempo_blue_hc))
                if (p.tempo_blue_hp !== undefined) setTempoBlueHp(String(p.tempo_blue_hp))
                if (p.tempo_white_hc !== undefined) setTempoWhiteHc(String(p.tempo_white_hc))
                if (p.tempo_white_hp !== undefined) setTempoWhiteHp(String(p.tempo_white_hp))
                if (p.tempo_red_hc !== undefined) setTempoRedHc(String(p.tempo_red_hc))
                if (p.tempo_red_hp !== undefined) setTempoRedHp(String(p.tempo_red_hp))
                if (p.ejp_normal !== undefined) setEjpNormal(String(p.ejp_normal))
                if (p.ejp_peak !== undefined) setEjpPeak(String(p.ejp_peak))
              }
              document.getElementById('contribution-form')?.scrollIntoView({ behavior: 'smooth' })
              setNotification({ type: 'success', message: 'Mode édition activé.' })
              setTimeout(() => setNotification(null), 3000)
            }}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              contribution.status === 'rejected'
                ? 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-300'
                : 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300'
            }`}
          >
            <Copy size={12} />
            Modifier
          </button>
        </div>
      )}

      {/* Messages / Conversation - WhatsApp Style */}
      {showMessagesSection && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={() => {
              if (isWritingMessage || isSendingMessage) return
              setExpandedMessages(prev => ({ ...prev, [contribution.id]: !isMessagesExpanded }))
            }}
            className={`w-full flex items-center justify-between px-3 py-2 transition-colors ${
              isWritingMessage || isSendingMessage
                ? 'cursor-default'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <MessageCircle className={hasUnreadMessage ? "text-red-500" : "text-gray-400"} size={14} />
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Échanges {messageCount > 0 && `(${messageCount})`}
              </span>
              {hasUnreadMessage && (
                <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full animate-pulse">
                  Nouveau
                </span>
              )}
            </div>
            {!(isWritingMessage || isSendingMessage) && (
              isMessagesExpanded ? (
                <ChevronDown className="text-gray-400" size={14} />
              ) : (
                <ChevronRight className="text-gray-400" size={14} />
              )
            )}
          </button>
          {(isMessagesExpanded || isWritingMessage || isSendingMessage) && (
            <div className="px-2 pb-2">
              <ChatWhatsApp
                messages={(contribution.messages || []) as ChatMessage[]}
                isAdminView={false}
                inputValue={replyMessages[contribution.id] || ''}
                onInputChange={(value) => setReplyMessages(prev => ({ ...prev, [contribution.id]: value }))}
                onSend={() => handleSendReply(contribution.id)}
                isSending={sendingReply === contribution.id}
                showInput={contribution.status === 'pending'}
                minHeight="120px"
                maxHeight="250px"
              />
            </div>
          )}
        </div>
      )}

      {/* Review comment for rejected - compact */}
      {contribution.status === 'rejected' && contribution.review_comment && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-red-50 dark:bg-red-900/20">
          <p className="text-xs text-red-600 dark:text-red-400">
            <span className="font-medium">Rejet :</span> {contribution.review_comment}
          </p>
        </div>
      )}
    </div>
  )
  }

  // Form state
  const [contributionType, setContributionType] = useState<'NEW_PROVIDER' | 'NEW_OFFER'>('NEW_OFFER')
  const [providerName, setProviderName] = useState('')
  const [providerWebsite, setProviderWebsite] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [offerName, setOfferName] = useState('')
  const [offerType, setOfferType] = useState('BASE')
  const [description, setDescription] = useState('')

  // Filter state - initialisé vide, sera mis à EDF par défaut
  const [filterProvider, setFilterProvider] = useState<string>('')
  const [filterPower, setFilterPower] = useState<string>('all')
  const [filterOfferType, setFilterOfferType] = useState<string>('all')

  // Trier les fournisseurs avec EDF en premier
  const sortedProviders = useMemo(() => {
    if (!Array.isArray(providersData)) return []
    return [...providersData].sort((a, b) => {
      if (a.name.toUpperCase() === 'EDF') return -1
      if (b.name.toUpperCase() === 'EDF') return 1
      return a.name.localeCompare(b.name)
    })
  }, [providersData])

  // Types d'offres disponibles pour le fournisseur sélectionné
  const availableOfferTypes = useMemo(() => {
    if (!filterProvider || !Array.isArray(offersData)) return []
    const providerOffers = offersData.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    // Trier les types dans un ordre logique
    const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC']
    return types.sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [filterProvider, offersData])

  // Extraire les puissances disponibles dynamiquement
  const availablePowers = useMemo(() => {
    if (!filterProvider || !Array.isArray(offersData)) return []
    let filteredOffers = offersData.filter(o => o.provider_id === filterProvider)
    // Filtrer aussi par type d'offre si sélectionné
    if (filterOfferType !== 'all') {
      filteredOffers = filteredOffers.filter(o => o.offer_type === filterOfferType)
    }
    // Extraire les puissances des noms d'offres
    const powers = new Set<number>()
    filteredOffers.forEach(offer => {
      const match = offer.name.match(/(\d+)\s*kVA/i)
      if (match) {
        powers.add(parseInt(match[1]))
      }
    })
    // Trier les puissances
    return Array.from(powers).sort((a, b) => a - b)
  }, [filterProvider, filterOfferType, offersData])

  // Initialiser avec EDF par défaut quand les providers sont chargés
  useEffect(() => {
    if (sortedProviders.length > 0 && !filterProvider) {
      const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
      if (edf) {
        setFilterProvider(edf.id)
      } else {
        setFilterProvider(sortedProviders[0].id)
      }
    }
  }, [sortedProviders, filterProvider])

  // Reset le filtre de type d'offre quand on change de fournisseur
  useEffect(() => {
    // Calculer les types disponibles pour ce fournisseur
    if (!filterProvider || !Array.isArray(offersData)) {
      setFilterOfferType('all')
      setFilterPower('all')
      return
    }
    const providerOffers = offersData.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC']
    const sortedTypes = types.sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    if (sortedTypes.length > 0) {
      setFilterOfferType(sortedTypes[0])
    } else {
      setFilterOfferType('all')
    }
    setFilterPower('all')
  }, [filterProvider, offersData])

  // Reset le filtre de puissance quand on change de type d'offre
  useEffect(() => {
    setFilterPower('all')
  }, [filterOfferType])

  // Pricing
  const [subscriptionPrice, setSubscriptionPrice] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [hcPrice, setHcPrice] = useState('')
  const [hpPrice, setHpPrice] = useState('')

  // TEMPO pricing
  const [tempoBlueHc, setTempoBlueHc] = useState('')
  const [tempoBlueHp, setTempoBlueHp] = useState('')
  const [tempoWhiteHc, setTempoWhiteHc] = useState('')
  const [tempoWhiteHp, setTempoWhiteHp] = useState('')
  const [tempoRedHc, setTempoRedHc] = useState('')
  const [tempoRedHp, setTempoRedHp] = useState('')

  // EJP pricing
  const [ejpNormal, setEjpNormal] = useState('')
  const [ejpPeak, setEjpPeak] = useState('')

  // Seasonal pricing (Enercoop Flexi WATT 2 saisons)
  const [hcPriceWinter, setHcPriceWinter] = useState('')
  const [hpPriceWinter, setHpPriceWinter] = useState('')
  const [hcPriceSummer, setHcPriceSummer] = useState('')
  const [hpPriceSummer, setHpPriceSummer] = useState('')
  const [peakDayPrice, setPeakDayPrice] = useState('')

  // Power
  const [powerKva, setPowerKva] = useState('')

  // Documentation (required)
  const [priceSheetUrl, setPriceSheetUrl] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')

  // Submit mutation (create new contribution)
  const submitMutation = useMutation({
    mutationFn: async (data: ContributionData) => {
      return await energyApi.submitContribution(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      setNotification({
        type: 'success',
        message: 'Contribution soumise avec succès ! Les administrateurs vont la vérifier.'
      })
      setTimeout(() => setNotification(null), 5000)
      resetForm()
    },
    onError: (error: any) => {
      setNotification({
        type: 'error',
        message: `Erreur: ${error.message || 'Une erreur est survenue'}`
      })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  // Update mutation (edit existing contribution)
  const updateMutation = useMutation({
    mutationFn: async ({ contributionId, data }: { contributionId: string; data: ContributionData }) => {
      return await energyApi.updateContribution(contributionId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      setNotification({
        type: 'success',
        message: 'Contribution mise à jour avec succès !'
      })
      setTimeout(() => setNotification(null), 5000)
      resetForm()
      setEditingContributionId(null)
    },
    onError: (error: any) => {
      setNotification({
        type: 'error',
        message: `Erreur: ${error.message || 'Une erreur est survenue'}`
      })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ contributionId, message }: { contributionId: string; message: string }) => {
      return await energyApi.replyToContribution(contributionId, message)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      setReplyMessages(prev => ({ ...prev, [variables.contributionId]: '' }))
      setSendingReply(null)
      setNotification({
        type: 'success',
        message: 'Réponse envoyée avec succès !'
      })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error: any) => {
      setSendingReply(null)
      setNotification({
        type: 'error',
        message: `Erreur: ${error.message || 'Impossible d\'envoyer la réponse'}`
      })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  const handleSendReply = (contributionId: string) => {
    const message = replyMessages[contributionId]?.trim()
    if (!message) return
    setSendingReply(contributionId)
    replyMutation.mutate({ contributionId, message })
  }

  const resetForm = () => {
    setOfferName('')
    setOfferType('BASE')
    setDescription('')
    setSubscriptionPrice('')
    setBasePrice('')
    setHcPrice('')
    setHpPrice('')
    setTempoBlueHc('')
    setTempoBlueHp('')
    setTempoWhiteHc('')
    setTempoWhiteHp('')
    setTempoRedHc('')
    setTempoRedHp('')
    setEjpNormal('')
    setEjpPeak('')
    setHcPriceWinter('')
    setHpPriceWinter('')
    setHcPriceSummer('')
    setHpPriceSummer('')
    setPeakDayPrice('')
    setPowerKva('')
    setPriceSheetUrl('')
    setScreenshotUrl('')
    setProviderName('')
    setProviderWebsite('')
    setSelectedProviderId('')
    setEditingContributionId(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const pricingData: any = {
      subscription_price: parseFloat(subscriptionPrice) || 0,
    }

    // Add pricing based on offer type
    if (offerType === 'BASE') {
      pricingData.base_price = basePrice ? parseFloat(basePrice) : undefined
    } else if (offerType === 'BASE_WEEKEND') {
      pricingData.base_price = basePrice ? parseFloat(basePrice) : undefined
      pricingData.base_price_weekend = hcPrice ? parseFloat(hcPrice) : undefined
    } else if (offerType === 'HC_HP') {
      pricingData.hc_price = hcPrice ? parseFloat(hcPrice) : undefined
      pricingData.hp_price = hpPrice ? parseFloat(hpPrice) : undefined
    } else if (offerType === 'HC_NUIT_WEEKEND' || offerType === 'HC_WEEKEND') {
      // HC + weekend (weekend est déjà inclus dans HC)
      pricingData.hc_price = hcPrice ? parseFloat(hcPrice) : undefined
      pricingData.hp_price = hpPrice ? parseFloat(hpPrice) : undefined
    } else if (offerType === 'SEASONAL') {
      // Seasonal pricing (winter/summer)
      pricingData.hc_price_winter = hcPriceWinter ? parseFloat(hcPriceWinter) : undefined
      pricingData.hp_price_winter = hpPriceWinter ? parseFloat(hpPriceWinter) : undefined
      pricingData.hc_price_summer = hcPriceSummer ? parseFloat(hcPriceSummer) : undefined
      pricingData.hp_price_summer = hpPriceSummer ? parseFloat(hpPriceSummer) : undefined
    } else if (offerType === 'TEMPO') {
      pricingData.tempo_blue_hc = tempoBlueHc ? parseFloat(tempoBlueHc) : undefined
      pricingData.tempo_blue_hp = tempoBlueHp ? parseFloat(tempoBlueHp) : undefined
      pricingData.tempo_white_hc = tempoWhiteHc ? parseFloat(tempoWhiteHc) : undefined
      pricingData.tempo_white_hp = tempoWhiteHp ? parseFloat(tempoWhiteHp) : undefined
      pricingData.tempo_red_hc = tempoRedHc ? parseFloat(tempoRedHc) : undefined
      pricingData.tempo_red_hp = tempoRedHp ? parseFloat(tempoRedHp) : undefined
    } else if (offerType === 'EJP') {
      pricingData.ejp_normal = ejpNormal ? parseFloat(ejpNormal) : undefined
      pricingData.ejp_peak = ejpPeak ? parseFloat(ejpPeak) : undefined
    } else if (offerType === 'ZEN_FLEX') {
      // ZEN_FLEX: Eco days use winter prices, Sobriété days use summer prices
      pricingData.hc_price_winter = hcPriceWinter ? parseFloat(hcPriceWinter) : undefined
      pricingData.hp_price_winter = hpPriceWinter ? parseFloat(hpPriceWinter) : undefined
      pricingData.hc_price_summer = hcPriceSummer ? parseFloat(hcPriceSummer) : undefined
      pricingData.hp_price_summer = hpPriceSummer ? parseFloat(hpPriceSummer) : undefined
    }

    // Add seasonal pricing if provided (for non-ZEN_FLEX/SEASONAL types)
    if (hcPriceWinter) pricingData.hc_price_winter = parseFloat(hcPriceWinter)
    if (hpPriceWinter) pricingData.hp_price_winter = parseFloat(hpPriceWinter)
    if (hcPriceSummer) pricingData.hc_price_summer = parseFloat(hcPriceSummer)
    if (hpPriceSummer) pricingData.hp_price_summer = parseFloat(hpPriceSummer)
    if (peakDayPrice) pricingData.peak_day_price = parseFloat(peakDayPrice)

    const contributionData: ContributionData = {
      contribution_type: contributionType,
      offer_name: offerName,
      offer_type: offerType,
      description: description || undefined,
      pricing_data: pricingData,
      power_kva: powerKva ? parseInt(powerKva) : undefined,
      price_sheet_url: priceSheetUrl,
      screenshot_url: screenshotUrl || undefined,
    }

    if (contributionType === 'NEW_PROVIDER') {
      contributionData.provider_name = providerName
      contributionData.provider_website = providerWebsite || undefined
    } else {
      contributionData.existing_provider_id = selectedProviderId
    }

    // If editing an existing contribution, update it. Otherwise, create a new one.
    if (editingContributionId) {
      updateMutation.mutate({ contributionId: editingContributionId, data: contributionData })
    } else {
      submitMutation.mutate(contributionData)
    }
  }

  const handleJsonImport = async () => {
    try {
      const data = JSON.parse(jsonImportData)
      const contributions = Array.isArray(data) ? data : [data]

      setImportProgress({ current: 0, total: contributions.length, errors: [] })
      const errors: string[] = []

      for (let i = 0; i < contributions.length; i++) {
        try {
          await energyApi.submitContribution(contributions[i])
          setImportProgress({ current: i + 1, total: contributions.length, errors })
        } catch (error: any) {
          const errorMsg = `Offre ${i + 1} (${contributions[i].offer_name}): ${error.message || 'Erreur inconnue'}`
          errors.push(errorMsg)
          setImportProgress({ current: i + 1, total: contributions.length, errors })
        }
      }

      if (errors.length === 0) {
        setNotification({
          type: 'success',
          message: `${contributions.length} contribution(s) importée(s) avec succès !`
        })
      } else {
        setNotification({
          type: 'error',
          message: `Import terminé avec ${errors.length} erreur(s). Vérifiez les détails ci-dessous.`
        })
      }

      setTimeout(() => setNotification(null), 5000)
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })

      if (errors.length === 0) {
        setJsonImportData('')
        setShowJsonImport(false)
      }
    } catch (error: any) {
      setNotification({
        type: 'error',
        message: `Erreur de parsing JSON: ${error.message}`
      })
      setTimeout(() => setNotification(null), 5000)
    }
  }

  return (
    <div className="w-full">
      {/* Notification Toast */}
      {notification && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
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

      {/* Tab Content: Mes contributions */}
      {initialTab === 'mine' && (
        <div className="card">
          {Array.isArray(myContributions) && myContributions.length > 0 ? (
          <div className="space-y-4">
            {/* En attente - déplié par défaut */}
            {contributionsByStatus.pending.length > 0 && (
              <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStatusSections(prev => ({ ...prev, pending: !prev.pending }))}
                  className="w-full flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="text-yellow-600 dark:text-yellow-400" size={20} />
                    <span className="font-semibold text-yellow-800 dark:text-yellow-200">
                      En attente ({contributionsByStatus.pending.length})
                    </span>
                  </div>
                  {expandedStatusSections.pending ? (
                    <ChevronDown className="text-yellow-600 dark:text-yellow-400" size={20} />
                  ) : (
                    <ChevronRight className="text-yellow-600 dark:text-yellow-400" size={20} />
                  )}
                </button>
                {expandedStatusSections.pending && (
                  <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                    {contributionsByStatus.pending.map(renderContributionCard)}
                  </div>
                )}
              </div>
            )}

            {/* Approuvées - plié par défaut */}
            {contributionsByStatus.approved.length > 0 && (
              <div className="border border-green-200 dark:border-green-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStatusSections(prev => ({ ...prev, approved: !prev.approved }))}
                  className="w-full flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
                    <span className="font-semibold text-green-800 dark:text-green-200">
                      Approuvées ({contributionsByStatus.approved.length})
                    </span>
                  </div>
                  {expandedStatusSections.approved ? (
                    <ChevronDown className="text-green-600 dark:text-green-400" size={20} />
                  ) : (
                    <ChevronRight className="text-green-600 dark:text-green-400" size={20} />
                  )}
                </button>
                {expandedStatusSections.approved && (
                  <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                    {contributionsByStatus.approved.map(renderContributionCard)}
                  </div>
                )}
              </div>
            )}

            {/* Rejetées - plié par défaut */}
            {contributionsByStatus.rejected.length > 0 && (
              <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStatusSections(prev => ({ ...prev, rejected: !prev.rejected }))}
                  className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <XCircle className="text-red-600 dark:text-red-400" size={20} />
                    <span className="font-semibold text-red-800 dark:text-red-200">
                      Rejetées ({contributionsByStatus.rejected.length})
                    </span>
                  </div>
                  {expandedStatusSections.rejected ? (
                    <ChevronDown className="text-red-600 dark:text-red-400" size={20} />
                  ) : (
                    <ChevronRight className="text-red-600 dark:text-red-400" size={20} />
                  )}
                </button>
                {expandedStatusSections.rejected && (
                  <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                    {contributionsByStatus.rejected.map(renderContributionCard)}
                  </div>
                )}
              </div>
            )}
          </div>
          ) : (
            <div className="text-center py-8">
              <List className="mx-auto text-gray-400 dark:text-gray-500 mb-4" size={48} />
              <p className="text-gray-500 dark:text-gray-400 mb-2">Vous n'avez pas encore de contributions</p>
              <button
                onClick={() => navigate('/contribute/new')}
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Proposer une nouvelle offre
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Nouvelle contribution */}
      {initialTab === 'new' && (
      <div id="contribution-form" className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="text-primary-600 dark:text-primary-400" size={20} />
            {editingContributionId ? 'Modifier la contribution' : 'Nouvelle contribution'}
          </h2>
          <div className="flex items-center gap-4">
            {editingContributionId && (
              <button
                type="button"
                onClick={() => {
                  setEditingContributionId(null)
                  resetForm()
                }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Annuler l'édition
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowJsonImport(!showJsonImport)}
              className={`btn flex items-center gap-2 text-sm ${showJsonImport ? 'btn-primary' : 'btn-secondary'}`}
            >
              <FileJson size={16} />
              {showJsonImport ? 'Formulaire' : 'Import JSON'}
            </button>
          </div>
        </div>

        {/* JSON Import Section */}
        {showJsonImport ? (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
              <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">📋 Structure du fichier JSON</h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                Vous pouvez importer une ou plusieurs offres en utilisant un tableau JSON. Voici la structure complète :
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer font-medium mb-2">Voir l'exemple complet</summary>
                <pre className="bg-white dark:bg-gray-900 p-3 rounded overflow-auto text-xs">
{`[
  {
    "contribution_type": "NEW_OFFER",
    "existing_provider_id": "uuid-du-fournisseur",
    "offer_name": "Offre BASE Weekend",
    "offer_type": "BASE_WEEKEND",
    "description": "Description optionnelle",
    "power_kva": 6,
    "pricing_data": {
      "subscription_price": 12.60,
      "base_price": 0.2516,
      "base_price_weekend": 0.2000
    },
    "price_sheet_url": "https://...",
    "screenshot_url": "https://... (optionnel)"
  },
  {
    "contribution_type": "NEW_OFFER",
    "existing_provider_id": "uuid-du-fournisseur",
    "offer_name": "Offre HC/HP",
    "offer_type": "HC_HP",
    "power_kva": 6,
    "pricing_data": {
      "subscription_price": 13.50,
      "hc_price": 0.2068,
      "hp_price": 0.2700
    },
    "price_sheet_url": "https://..."
  }
]`}
                </pre>
              </details>

              <div className="mt-3 space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold">Champs obligatoires :</p>
                <ul className="list-disc list-inside pl-2 space-y-1">
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">contribution_type</code> : "NEW_PROVIDER" ou "NEW_OFFER"</li>
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">offer_name</code> : Nom de l'offre</li>
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">offer_type</code> : BASE, BASE_WEEKEND, HC_HP, HC_NUIT_WEEKEND, HC_WEEKEND, SEASONAL, TEMPO, EJP</li>
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">power_kva</code> : 3, 6, 9, 12, 15, 18, 24, 30 ou 36</li>
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">pricing_data.subscription_price</code> : Prix abonnement (€/mois)</li>
                  <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">price_sheet_url</code> : URL de la fiche des prix</li>
                </ul>

                <p className="font-semibold mt-3">Types de tarification (pricing_data) :</p>
                <ul className="list-disc list-inside pl-2 space-y-1">
                  <li><strong>BASE</strong> : base_price</li>
                  <li><strong>BASE_WEEKEND</strong> : base_price, base_price_weekend</li>
                  <li><strong>HC_HP</strong> : hc_price, hp_price</li>
                  <li><strong>HC_HP avec weekend</strong> : hc_price, hp_price, hc_price_weekend, hp_price_weekend</li>
                  <li><strong>SEASONAL</strong> : hc_price_winter, hp_price_winter, hc_price_summer, hp_price_summer</li>
                  <li><strong>TEMPO</strong> : tempo_blue_hc, tempo_blue_hp, tempo_white_hc, tempo_white_hp, tempo_red_hc, tempo_red_hp</li>
                  <li><strong>EJP</strong> : ejp_normal, ejp_peak</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h3 className="font-semibold mb-2 text-green-900 dark:text-green-100">🤖 Astuce : Utiliser l'IA pour extraire les données</h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-3">
                Vous avez un PDF ou une capture d'écran d'une grille tarifaire ? Utilisez ChatGPT, Claude ou Gemini pour extraire automatiquement les données !
              </p>
              <details className="text-xs" open>
                <summary className="cursor-pointer font-medium mb-2 text-green-900 dark:text-green-100">Voir les détails</summary>
                <div className="mt-3 space-y-3">
                  <div className="text-sm space-y-2 text-green-800 dark:text-green-200">
                    <p className="font-semibold">📸 Étapes :</p>
                    <ol className="list-decimal list-inside pl-2 space-y-1">
                      <li>Prenez une capture d'écran ou ouvrez le PDF de la grille tarifaire</li>
                      <li>Ouvrez ChatGPT, Claude ou Gemini</li>
                      <li>Uploadez l'image/PDF et collez le prompt ci-dessous (il contient déjà tous les IDs des fournisseurs)</li>
                      <li>L'IA va extraire les données et générer le JSON avec le bon <code className="bg-green-100 dark:bg-green-900 px-1 rounded">existing_provider_id</code></li>
                      <li>Copiez le JSON généré</li>
                      <li>Collez-le dans le champ ci-dessous et importez !</li>
                    </ol>
                    <p className="text-xs italic mt-2">
                      💡 Le prompt contient la liste complète des fournisseurs existants avec leurs IDs. L'IA sélectionnera automatiquement le bon ID !
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-900 p-3 rounded">
                    <p className="font-semibold mb-2 text-green-900 dark:text-green-100">📝 Prompt à copier-coller :</p>
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
{`Extrait les données tarifaires de cette grille de prix et formate-les en JSON selon ce format.

STRUCTURE GÉNÉRALE :
{
  "contribution_type": "NEW_OFFER" ou "NEW_PROVIDER",
  "existing_provider_id": "UUID du fournisseur (obligatoire si NEW_OFFER)",
  "provider_name": "Nom du fournisseur (obligatoire si NEW_PROVIDER)",
  "provider_website": "https://site-du-fournisseur.fr (optionnel si NEW_PROVIDER)",
  "offer_name": "Nom exact de l'offre tel qu'affiché par le fournisseur",
  "offer_type": "BASE" | "BASE_WEEKEND" | "HC_HP" | "HC_NUIT_WEEKEND" | "HC_WEEKEND" | "SEASONAL" | "TEMPO" | "EJP",
  "description": "Description optionnelle de l'offre",
  "power_kva": 3 | 6 | 9 | 12 | 15 | 18 | 24 | 30 | 36,
  "pricing_data": { /* Voir exemples ci-dessous selon le type */ },
  "price_sheet_url": "URL officielle de la grille tarifaire (OBLIGATOIRE)",
  "screenshot_url": "URL de capture d'écran ou PDF (optionnel)"
}

VALEURS POSSIBLES DES CHAMPS :

contribution_type :
  - "NEW_OFFER" : Ajouter une offre pour un fournisseur existant
  - "NEW_PROVIDER" : Ajouter un nouveau fournisseur + sa première offre

offer_type :
  - "BASE" : Tarif unique 24h/24, 7j/7
  - "BASE_WEEKEND" : Tarif unique en semaine + tarif réduit le week-end
  - "HC_HP" : Heures Creuses / Heures Pleines (selon configuration PDL)
  - "HC_NUIT_WEEKEND" : HC de 23h à 6h en semaine + tout le week-end en HC
  - "HC_WEEKEND" : HC selon PDL en semaine + tout le week-end en HC
  - "SEASONAL" : Tarifs différents hiver (nov-mars) et été (avr-oct)
  - "TEMPO" : Tarif TEMPO (jours Bleus/Blancs/Rouges)
  - "EJP" : Effacement Jours de Pointe (22 jours/an)

power_kva (puissance souscrite) :
  - 3, 6, 9, 12, 15, 18, 24, 30, 36
  - Créer UNE ENTRÉE PAR PUISSANCE si plusieurs puissances disponibles

existing_provider_id (UNIQUEMENT pour NEW_OFFER) :
${providersData && providersData.length > 0 ? providersData.map(p => `  - "${p.id}" : ${p.name}${p.website ? ` (${p.website})` : ''}`).join('\n') : '  - Aucun fournisseur en base de données'}

EXEMPLES DE pricing_data SELON LE TYPE D'OFFRE :

1. BASE (Tarif unique 24h/24) :
{
  "subscription_price": 12.60,
  "base_price": 0.2516
}

2. BASE_WEEKEND (Tarif unique + tarif week-end réduit) :
{
  "subscription_price": 12.60,
  "base_price": 0.2516,
  "base_price_weekend": 0.2000
}

3. HC_HP (Heures Creuses / Heures Pleines selon config PDL) :
{
  "subscription_price": 13.50,
  "hc_price": 0.2068,
  "hp_price": 0.2700
}

4. HC_NUIT_WEEKEND (HC 23h-6h semaine + tout le week-end) :
{
  "subscription_price": 13.50,
  "hc_price": 0.2068,
  "hp_price": 0.2700
}

5. HC_WEEKEND (HC selon PDL semaine + tout le week-end) :
{
  "subscription_price": 13.50,
  "hc_price": 0.2068,
  "hp_price": 0.2700
}

6. SEASONAL (Tarifs saisonniers hiver/été) :
{
  "subscription_price": 14.00,
  "hc_price_winter": 0.1940,
  "hp_price_winter": 0.1317,
  "hc_price_summer": 0.3113,
  "hp_price_summer": 0.2294,
  "peak_day_price": 0.5193
}
Note: peak_day_price est optionnel (max 15 jours/an)

7. TEMPO (Jours Bleus/Blancs/Rouges) :
{
  "subscription_price": 15.20,
  "tempo_blue_hc": 0.1296,
  "tempo_blue_hp": 0.1609,
  "tempo_white_hc": 0.1486,
  "tempo_white_hp": 0.1894,
  "tempo_red_hc": 0.1568,
  "tempo_red_hp": 0.7562
}

8. EJP (Effacement Jours de Pointe) :
{
  "subscription_price": 13.80,
  "ejp_normal": 0.1234,
  "ejp_peak": 0.6789
}

RÈGLES IMPORTANTES :
- TOUS LES PRIX DOIVENT ÊTRE EN TTC (Toutes Taxes Comprises)
- Les prix doivent être en € (pas en centimes)
- subscription_price en €/mois TTC
- Les prix du kWh en €/kWh TTC (exemple: 0.2516)
- power_kva : 3, 6, 9, 12, 15, 18, 24, 30 ou 36
- Créer une entrée par puissance si plusieurs puissances disponibles
- Retourner un tableau JSON même pour une seule offre : [...]`}
                    </pre>
                  </div>
                </div>
              </details>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Collez votre JSON ici :</label>
              <textarea
                value={jsonImportData}
                onChange={(e) => setJsonImportData(e.target.value)}
                className="input font-mono text-xs"
                rows={15}
                placeholder='[{"contribution_type": "NEW_OFFER", ...}]'
              />
            </div>

            {importProgress && (
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded">
                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progression : {importProgress.current} / {importProgress.total}</span>
                    <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full transition-all"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
                {importProgress.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Erreurs :</p>
                    <ul className="text-xs space-y-1 text-red-600 dark:text-red-400">
                      {importProgress.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleJsonImport}
                className="btn btn-primary"
                disabled={!jsonImportData || importProgress !== null}
              >
                Importer les offres
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Contribution Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Type de contribution</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="NEW_OFFER"
                  checked={contributionType === 'NEW_OFFER'}
                  onChange={(e) => setContributionType(e.target.value as 'NEW_OFFER')}
                  className="cursor-pointer"
                />
                <span>Nouvelle offre (fournisseur existant)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="NEW_PROVIDER"
                  checked={contributionType === 'NEW_PROVIDER'}
                  onChange={(e) => setContributionType(e.target.value as 'NEW_PROVIDER')}
                  className="cursor-pointer"
                />
                <span>Nouveau fournisseur + offre</span>
              </label>
            </div>
          </div>

          {/* Provider Selection or Creation */}
          {contributionType === 'NEW_PROVIDER' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Nom du fournisseur <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  className="input"
                  required
                  placeholder="Ex: EDF, Engie, Total Energies..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Site web (optionnel)</label>
                <input
                  type="url"
                  value={providerWebsite}
                  onChange={(e) => setProviderWebsite(e.target.value)}
                  className="input"
                  placeholder="https://..."
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">
                Fournisseur <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                className="input"
                required
              >
                <option value="">Sélectionnez un fournisseur</option>
                {Array.isArray(providersData) && providersData.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Offer Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Nom de l'offre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={offerName}
                onChange={(e) => setOfferName(e.target.value)}
                className="input"
                required
                placeholder="Ex: Tarif Bleu, Heures Creuses..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Type d'offre <span className="text-red-500">*</span>
              </label>
              <select
                value={offerType}
                onChange={(e) => setOfferType(e.target.value)}
                className="input"
                required
              >
                <option value="BASE">BASE</option>
                <option value="BASE_WEEKEND">BASE Week-end (tarif unique + week-end réduit)</option>
                <option value="HC_HP">Heures Creuses / Heures Pleines</option>
                <option value="HC_NUIT_WEEKEND">HC Nuit & Week-end (23h-6h + week-end)</option>
                <option value="HC_WEEKEND">HC Week-end (HC PDL + week-end)</option>
                <option value="SEASONAL">SEASONAL (Tarifs saisonniers hiver/été)</option>
                <option value="ZEN_FLEX">ZEN FLEX (Éco + Sobriété)</option>
                <option value="TEMPO">TEMPO</option>
                <option value="EJP">EJP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Puissance (kVA) <span className="text-red-600">*</span>
              </label>
              <select
                value={powerKva}
                onChange={(e) => setPowerKva(e.target.value)}
                className="input"
                required
              >
                <option value="">Sélectionnez...</option>
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

          <div>
            <label className="block text-sm font-medium mb-2">Description (optionnelle)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="Décrivez brièvement cette offre..."
            />
          </div>

          {/* Pricing */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Tarification</h3>
              <span className="text-xs font-semibold px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full">
                ⚠️ PRIX TTC UNIQUEMENT
              </span>
            </div>

            {/* Abonnement (toujours affiché) */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Abonnement (€/mois TTC) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={subscriptionPrice}
                onChange={(e) => setSubscriptionPrice(e.target.value)}
                className="input"
                required
                placeholder="12.60"
              />
            </div>

            {/* BASE */}
            {offerType === 'BASE' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Prix BASE (€/kWh TTC) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.00001"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  className="input"
                  required
                  placeholder="0.2516"
                />
              </div>
            )}

            {/* BASE_WEEKEND */}
            {offerType === 'BASE_WEEKEND' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix BASE semaine (€/kWh TTC) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="input"
                    required
                    placeholder="0.2516"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix BASE week-end (€/kWh TTC)
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={hcPrice}
                    onChange={(e) => setHcPrice(e.target.value)}
                    className="input"
                    placeholder="0.2000"
                  />
                  <p className="text-xs text-gray-500 mt-1">Prix réduit pour le week-end</p>
                </div>
              </div>
            )}

            {/* HC_HP */}
            {offerType === 'HC_HP' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix Heures Creuses (€/kWh TTC) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={hcPrice}
                    onChange={(e) => setHcPrice(e.target.value)}
                    className="input"
                    required
                    placeholder="0.2068"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix Heures Pleines (€/kWh TTC) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={hpPrice}
                    onChange={(e) => setHpPrice(e.target.value)}
                    className="input"
                    required
                    placeholder="0.2700"
                  />
                </div>
              </div>
            )}

            {/* HC_NUIT_WEEKEND */}
            {offerType === 'HC_NUIT_WEEKEND' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 HC de nuit (23h-6h) en semaine + tout le week-end en HC
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix HC (€/kWh TTC) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={hcPrice}
                      onChange={(e) => setHcPrice(e.target.value)}
                      className="input"
                      required
                      placeholder="0.2068"
                    />
                    <p className="text-xs text-gray-500 mt-1">23h-6h semaine + tout week-end</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix HP (€/kWh TTC) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={hpPrice}
                      onChange={(e) => setHpPrice(e.target.value)}
                      className="input"
                      required
                      placeholder="0.2700"
                    />
                    <p className="text-xs text-gray-500 mt-1">6h-23h semaine uniquement</p>
                  </div>
                </div>
              </div>
            )}

            {/* HC_WEEKEND */}
            {offerType === 'HC_WEEKEND' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 HC selon configuration PDL en semaine + tout le week-end en HC
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix HC (€/kWh TTC) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={hcPrice}
                      onChange={(e) => setHcPrice(e.target.value)}
                      className="input"
                      required
                      placeholder="0.2068"
                    />
                    <p className="text-xs text-gray-500 mt-1">HC PDL semaine + tout week-end</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix HP (€/kWh TTC) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.00001"
                      value={hpPrice}
                      onChange={(e) => setHpPrice(e.target.value)}
                      className="input"
                      required
                      placeholder="0.2700"
                    />
                    <p className="text-xs text-gray-500 mt-1">HP semaine uniquement</p>
                  </div>
                </div>
              </div>
            )}

            {/* SEASONAL */}
            {offerType === 'SEASONAL' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 Tarifs différents en hiver (nov-mars) et été (avr-oct)
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-blue-700 dark:text-blue-300">❄️ Hiver (Nov-Mars)</h4>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HC Hiver (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hcPriceWinter}
                        onChange={(e) => setHcPriceWinter(e.target.value)}
                        className="input"
                        required
                        placeholder="0.31128"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HP Hiver (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hpPriceWinter}
                        onChange={(e) => setHpPriceWinter(e.target.value)}
                        className="input"
                        required
                        placeholder="0.22942"
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold text-amber-700 dark:text-amber-300">☀️ Été (Avr-Oct)</h4>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HC Été (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hcPriceSummer}
                        onChange={(e) => setHcPriceSummer(e.target.value)}
                        className="input"
                        required
                        placeholder="0.19397"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HP Été (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hpPriceSummer}
                        onChange={(e) => setHpPriceSummer(e.target.value)}
                        className="input"
                        required
                        placeholder="0.13166"
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-2">
                    ⚡ Prix Jour de Pointe (€/kWh TTC) - Optionnel
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={peakDayPrice}
                    onChange={(e) => setPeakDayPrice(e.target.value)}
                    className="input"
                    placeholder="0.51928"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Si l'offre propose une option "jours de pointe" (max 15 jours/an)
                  </p>
                </div>
              </div>
            )}

            {/* ZEN_FLEX */}
            {offerType === 'ZEN_FLEX' && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 <strong>Zen Flex</strong> : Jours Éco (345j/an) avec tarifs réduits + Jours Sobriété (20j/an) avec tarifs majorés. HC de 22h à 6h.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-green-700 dark:text-green-300 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span> Jours Éco (345j/an)
                    </h4>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HC Éco (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hcPriceWinter}
                        onChange={(e) => setHcPriceWinter(e.target.value)}
                        className="input"
                        required
                        placeholder="0.1546"
                      />
                      <p className="text-xs text-gray-500 mt-1">22h-6h les jours Éco</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HP Éco (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hpPriceWinter}
                        onChange={(e) => setHpPriceWinter(e.target.value)}
                        className="input"
                        required
                        placeholder="0.2068"
                      />
                      <p className="text-xs text-gray-500 mt-1">6h-22h les jours Éco</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500"></span> Jours Sobriété (20j/an)
                    </h4>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HC Sobriété (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hcPriceSummer}
                        onChange={(e) => setHcPriceSummer(e.target.value)}
                        className="input"
                        required
                        placeholder="0.1546"
                      />
                      <p className="text-xs text-gray-500 mt-1">22h-6h les jours Sobriété</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        HP Sobriété (€/kWh TTC) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={hpPriceSummer}
                        onChange={(e) => setHpPriceSummer(e.target.value)}
                        className="input"
                        required
                        placeholder="0.6712"
                      />
                      <p className="text-xs text-gray-500 mt-1">6h-22h les jours Sobriété (prix majoré)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {offerType === 'TEMPO' && (
              <div className="mt-4 space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">Jours Bleus (300 jours/an)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Creuses (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoBlueHc}
                        onChange={(e) => setTempoBlueHc(e.target.value)}
                        className="input"
                        placeholder="0.1296"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Pleines (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoBlueHp}
                        onChange={(e) => setTempoBlueHp(e.target.value)}
                        className="input"
                        placeholder="0.1609"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-300 mb-3">Jours Blancs (43 jours/an)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Creuses (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoWhiteHc}
                        onChange={(e) => setTempoWhiteHc(e.target.value)}
                        className="input"
                        placeholder="0.1486"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Pleines (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoWhiteHp}
                        onChange={(e) => setTempoWhiteHp(e.target.value)}
                        className="input"
                        placeholder="0.1894"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-800 dark:text-red-300 mb-3">Jours Rouges (22 jours/an)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Creuses (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoRedHc}
                        onChange={(e) => setTempoRedHc(e.target.value)}
                        className="input"
                        placeholder="0.1568"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Heures Pleines (€/kWh TTC)</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={tempoRedHp}
                        onChange={(e) => setTempoRedHp(e.target.value)}
                        className="input"
                        placeholder="0.7562"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {offerType === 'EJP' && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix Normal (343 jours, €/kWh TTC)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={ejpNormal}
                    onChange={(e) => setEjpNormal(e.target.value)}
                    className="input"
                    placeholder="0.1234"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix Pointe (22 jours, €/kWh TTC)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={ejpPeak}
                    onChange={(e) => setEjpPeak(e.target.value)}
                    className="input"
                    placeholder="0.6789"
                  />
                </div>
              </div>
            )}

          </div>

          {/* Documentation (Required) */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">Documentation <span className="text-red-500">*</span></h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Pour valider votre contribution, nous avons besoin d'une source officielle du fournisseur.
            </p>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Lien vers la fiche des prix <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={priceSheetUrl}
                  onChange={(e) => setPriceSheetUrl(e.target.value)}
                  className="input"
                  required
                  placeholder="https://particulier.edf.fr/tarif-bleu/..."
                />
                <p className="text-xs text-gray-500 mt-1">URL officielle du fournisseur présentant les tarifs</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Screenshot ou PDF (optionnel)
                </label>
                <input
                  type="url"
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className="input"
                  placeholder="https://imgur.com/... ou lien direct vers un screenshot"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Hébergez votre capture d'écran sur Imgur, Dropbox, Google Drive, ou tout autre service et collez le lien direct
                </p>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={resetForm}
              className="btn"
              disabled={submitMutation.isPending}
            >
              Réinitialiser
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitMutation.isPending || updateMutation.isPending}
            >
              {(submitMutation.isPending || updateMutation.isPending)
                ? 'Envoi en cours...'
                : editingContributionId
                  ? 'Mettre à jour la contribution'
                  : 'Soumettre la contribution'
              }
            </button>
          </div>
          </form>
        )}
      </div>
      )}

      {/* Tab Content: Offres disponibles */}
      {initialTab === 'offers' && (
      <div className="card">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Package className="text-primary-600 dark:text-primary-400" size={20} />
          Offres disponibles
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {(() => {
            if (!offersData) return '0 offre'
            // Count filtered offers for selected provider
            const filteredCount = offersData.filter((offer) => {
              if (filterProvider && offer.provider_id !== filterProvider) return false
              if (filterOfferType !== 'all' && offer.offer_type !== filterOfferType) return false
              if (filterPower !== 'all') {
                const match = offer.name.match(/(\d+)\s*kVA/i)
                if (match) {
                  const offerPower = parseInt(match[1])
                  if (offerPower !== parseInt(filterPower)) return false
                } else {
                  return false
                }
              }
              return true
            }).length

            const selectedProvider = sortedProviders.find(p => p.id === filterProvider)
            const typeLabels: Record<string, string> = {
              'BASE': 'Base',
              'HC_HP': 'HC/HP',
              'TEMPO': 'Tempo',
              'EJP': 'EJP',
              'ZEN_FLEX': 'Zen Flex',
              'ZEN_WEEK_END': 'Zen Week-end',
              'ZEN_WEEK_END_HP_HC': 'Zen Week-end HC/HP',
            }
            const typeLabel = filterOfferType !== 'all' ? typeLabels[filterOfferType] || filterOfferType : ''
            return `${filteredCount} offre(s) ${selectedProvider ? `pour ${selectedProvider.name}` : ''}${typeLabel ? ` - ${typeLabel}` : ''}${filterPower !== 'all' ? ` en ${filterPower} kVA` : ''}`
          })()}
        </p>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Fournisseurs - Boutons */}
          <div>
            <label className="block text-sm font-medium mb-3">Sélectionner un fournisseur</label>
            <div className="flex flex-wrap gap-2">
              {sortedProviders.map((provider) => {
                const isSelected = filterProvider === provider.id
                const providerOffersCount = (offersData || []).filter(o => o.provider_id === provider.id).length
                return (
                  <button
                    key={provider.id}
                    onClick={() => setFilterProvider(provider.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {provider.name}
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                      isSelected
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                    }`}>
                      {providerOffersCount}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type d'offre - Boutons dynamiques */}
          {availableOfferTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-3">Type d'offre</label>
              <div className="flex flex-wrap gap-2">
                {availableOfferTypes.map((type) => {
                  const isSelected = filterOfferType === type
                  const typeCount = (offersData || []).filter(o => o.provider_id === filterProvider && o.offer_type === type).length
                  // Labels lisibles pour les types
                  const typeLabels: Record<string, string> = {
                    'BASE': 'Base',
                    'HC_HP': 'HC/HP',
                    'TEMPO': 'Tempo',
                    'EJP': 'EJP',
                    'ZEN_FLEX': 'Zen Flex',
                    'ZEN_WEEK_END': 'Zen Week-end',
                    'ZEN_WEEK_END_HP_HC': 'Zen Week-end HC/HP',
                  }
                  return (
                    <button
                      key={type}
                      onClick={() => setFilterOfferType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {typeLabels[type] || type}
                      <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                        isSelected
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                      }`}>
                        {typeCount}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* Message si pas de fournisseur ou type sélectionné */}
        {(!filterProvider || filterOfferType === 'all') ? (
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
        ) : Array.isArray(offersData) && offersData.length > 0 ? (
          <div className="space-y-6">
            {(() => {
              // Get selected provider
              const provider = sortedProviders.find(p => p.id === filterProvider)
              if (!provider) return null

              // Get provider offers filtered by type (required)
              let providerOffers = (offersData || []).filter((offer) =>
                offer.provider_id === provider.id && offer.offer_type === filterOfferType
              )

              // Filter by power (optional)
              if (filterPower !== 'all') {
                providerOffers = providerOffers.filter((offer) => {
                  const match = offer.name.match(/(\d+)\s*kVA/i)
                  if (match) {
                    const offerPower = parseInt(match[1])
                    return offerPower === parseInt(filterPower)
                  }
                  return false
                })
              }

              if (providerOffers.length === 0) {
                return (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Aucune offre ne correspond aux filtres sélectionnés.
                  </div>
                )
              }

              // Helper pour obtenir la valeur d'un champ (éditée ou originale)
              const getFieldValue = (offer: EnergyOffer, fieldKey: string): string => {
                const edited = editedOffers[offer.id]?.[fieldKey]
                if (edited !== undefined) return edited
                const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
                return String(originalValue ?? '')
              }

              // Helper pour vérifier si une offre a été modifiée
              const isOfferModified = (offer: EnergyOffer): boolean => {
                const edited = editedOffers[offer.id]
                if (!edited) return false
                return Object.entries(edited).some(([key, value]) => {
                  const originalValue = (offer as unknown as Record<string, unknown>)[key]
                  return String(originalValue ?? '') !== value
                })
              }

              // Helper pour mettre à jour un champ
              const updateField = (offerId: string, fieldKey: string, value: string) => {
                setEditedOffers(prev => ({
                  ...prev,
                  [offerId]: {
                    ...prev[offerId],
                    [fieldKey]: value
                  }
                }))
              }

              // Calculer les offres modifiées
              const modifiedOffers = providerOffers.filter(offer => isOfferModified(offer))

              // Labels pour les champs
              const fieldLabels: Record<string, string> = {
                subscription_price: 'Abonnement',
                base_price: 'Prix Base',
                hc_price: 'HC',
                hp_price: 'HP',
                tempo_blue_hc: 'Bleu HC',
                tempo_blue_hp: 'Bleu HP',
                tempo_white_hc: 'Blanc HC',
                tempo_white_hp: 'Blanc HP',
                tempo_red_hc: 'Rouge HC',
                tempo_red_hp: 'Rouge HP',
              }

              // Helper pour soumettre toutes les modifications
              const submitAllModifications = async () => {
                if (modifiedOffers.length === 0) return

                setSubmittingOffers(true)
                setShowSubmitRecap(false)
                let successCount = 0
                let errorCount = 0

                for (const offer of modifiedOffers) {
                  try {
                    const edited = editedOffers[offer.id] || {}
                    const contributionData: ContributionData = {
                      contribution_type: 'UPDATE_OFFER',
                      existing_provider_id: offer.provider_id,
                      existing_offer_id: offer.id,
                      provider_name: provider?.name || '',
                      offer_name: offer.name,
                      offer_type: offer.offer_type,
                      pricing_data: {
                        subscription_price: edited.subscription_price ? parseFloat(edited.subscription_price) : offer.subscription_price,
                        base_price: edited.base_price ? parseFloat(edited.base_price) : offer.base_price,
                        hc_price: edited.hc_price ? parseFloat(edited.hc_price) : offer.hc_price,
                        hp_price: edited.hp_price ? parseFloat(edited.hp_price) : offer.hp_price,
                        tempo_blue_hc: edited.tempo_blue_hc ? parseFloat(edited.tempo_blue_hc) : offer.tempo_blue_hc,
                        tempo_blue_hp: edited.tempo_blue_hp ? parseFloat(edited.tempo_blue_hp) : offer.tempo_blue_hp,
                        tempo_white_hc: edited.tempo_white_hc ? parseFloat(edited.tempo_white_hc) : offer.tempo_white_hc,
                        tempo_white_hp: edited.tempo_white_hp ? parseFloat(edited.tempo_white_hp) : offer.tempo_white_hp,
                        tempo_red_hc: edited.tempo_red_hc ? parseFloat(edited.tempo_red_hc) : offer.tempo_red_hc,
                        tempo_red_hp: edited.tempo_red_hp ? parseFloat(edited.tempo_red_hp) : offer.tempo_red_hp,
                      },
                      price_sheet_url: offer.offer_url || '',
                    }
                    const response = await energyApi.submitContribution(contributionData)
                    if (response.success) {
                      successCount++
                    } else {
                      errorCount++
                    }
                  } catch {
                    errorCount++
                  }
                }

                if (successCount > 0) {
                  setNotification({ type: 'success', message: `${successCount} contribution(s) soumise(s) avec succès !` })
                  setEditedOffers({})
                  queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
                }
                if (errorCount > 0) {
                  setNotification({ type: 'error', message: `${errorCount} erreur(s) lors de l'envoi` })
                }
                setSubmittingOffers(false)
              }

              // Helper pour formater la valeur (retirer les 0 en trop)
              const formatValue = (value: string | number | undefined): string => {
                if (value === undefined || value === null || value === '') return ''
                const num = typeof value === 'string' ? parseFloat(value) : value
                if (isNaN(num)) return ''
                // Retirer les 0 inutiles à la fin
                return num.toString()
              }

              // Helper pour obtenir la couleur du label
              const getLabelColor = (label: string) => {
                if (label === 'HC') return 'text-blue-600 dark:text-blue-400'
                if (label === 'HP') return 'text-red-600 dark:text-red-400'
                return 'text-gray-600 dark:text-gray-400'
              }

              // Helper pour vérifier si un champ est modifié
              const isFieldModified = (offer: EnergyOffer, fieldKey: string) => {
                const currentValue = getFieldValue(offer, fieldKey)
                const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
                return currentValue !== String(originalValue ?? '')
              }

              // Render un champ éditable inline (pas un composant pour éviter perte de focus)
              const renderEditableField = (label: string, fieldKey: string, unit: string, offer: EnergyOffer) => {
                const editedValue = editedOffers[offer.id]?.[fieldKey]
                const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
                // Si édité, utiliser la valeur éditée telle quelle, sinon formater l'originale
                const displayValue = editedValue !== undefined ? editedValue : formatValue(originalValue)
                const isModified = editedValue !== undefined && editedValue !== String(originalValue ?? '')

                return (
                  <div key={`${offer.id}-${fieldKey}`} className="flex items-center gap-2 w-[200px]">
                    <span className={`text-sm font-semibold w-10 shrink-0 text-right ${getLabelColor(label)}`}>{label}</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={displayValue}
                      onChange={(e) => updateField(offer.id, fieldKey, e.target.value)}
                      className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
                        isModified
                          ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    />
                    <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">{unit}</span>
                  </div>
                )
              }

              // Helper pour extraire et nettoyer le nom de l'offre
              const getCleanOfferName = (offerName: string): string => {
                // Retirer la puissance (ex: "3 kVA", "12kVA")
                let name = offerName.replace(/\s*\d+\s*kVA/gi, '')
                // Retirer le type d'offre du nom s'il est présent
                name = name.replace(/\s*-?\s*(BASE|HC[_\s]?HP|TEMPO|EJP)/gi, '')
                // Nettoyer les tirets et espaces en trop
                name = name.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
                // Retirer le tiret final si présent
                name = name.replace(/\s*-\s*$/, '').trim()
                return name || offerName
              }

              // Helper pour extraire la puissance
              const getPower = (offerName: string): string | null => {
                const match = offerName.match(/(\d+)\s*kVA/i)
                return match ? `${match[1]} kVA` : null
              }

              return (
                <>
                  {/* Liste des offres éditables */}
                  <div className="space-y-2">
                    {providerOffers.map((offer) => {
                      const modified = isOfferModified(offer)
                      const cleanName = getCleanOfferName(offer.name)
                      const power = getPower(offer.name)

                      return (
                        <div
                          key={offer.id}
                          className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border transition-all ${
                            modified
                              ? 'border-amber-400 dark:border-amber-600'
                              : 'border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-4">
                            {/* Nom de l'offre (nettoyé) */}
                            <div className="w-64 shrink-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-sm truncate" title={cleanName}>{cleanName}</h4>
                                {modified && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded shrink-0">Modifié</span>
                                )}
                              </div>
                            </div>

                            {/* Puissance */}
                            <div className="w-16 text-center shrink-0">
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                                {power || '-'}
                              </span>
                            </div>

                            {/* Abonnement */}
                            <div className="shrink-0">
                              {renderEditableField('Abo.', 'subscription_price', '€/mois', offer)}
                            </div>

                            {/* Tarifs selon le type */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">

                              {offer.offer_type === 'BASE' && (
                                renderEditableField('Base', 'base_price', '€/kWh', offer)
                              )}

                              {offer.offer_type === 'BASE_WEEKEND' && (
                                <>
                                  {renderEditableField('Base', 'base_price', '€/kWh', offer)}
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-14">Week-end</span>
                                    {renderEditableField('Base', 'base_price_weekend', '€', offer)}
                                  </div>
                                </>
                              )}

                              {offer.offer_type === 'HC_HP' && (
                                <>
                                  {renderEditableField('HC', 'hc_price', '€/kWh', offer)}
                                  {renderEditableField('HP', 'hp_price', '€/kWh', offer)}
                                </>
                              )}

                              {(offer.offer_type === 'HC_WEEKEND' || offer.offer_type === 'HC_NUIT_WEEKEND') && (
                                <>
                                  {renderEditableField('HC', 'hc_price', '€/kWh', offer)}
                                  {renderEditableField('HP', 'hp_price', '€/kWh', offer)}
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-14">Week-end</span>
                                    {renderEditableField('HC', 'hc_price_weekend', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_weekend', '€', offer)}
                                  </div>
                                </>
                              )}

                              {offer.offer_type === 'TEMPO' && (
                                <>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 w-14">Bleus</span>
                                    {renderEditableField('HC', 'tempo_blue_hc', '€', offer)}
                                    {renderEditableField('HP', 'tempo_blue_hp', '€', offer)}
                                  </div>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 w-14">Blancs</span>
                                    {renderEditableField('HC', 'tempo_white_hc', '€', offer)}
                                    {renderEditableField('HP', 'tempo_white_hp', '€', offer)}
                                  </div>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-red-600 dark:text-red-400 w-14">Rouges</span>
                                    {renderEditableField('HC', 'tempo_red_hc', '€', offer)}
                                    {renderEditableField('HP', 'tempo_red_hp', '€', offer)}
                                  </div>
                                </>
                              )}

                              {offer.offer_type === 'ZEN_FLEX' && (
                                <>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-20">Éco</span>
                                    {renderEditableField('HC', 'hc_price_winter', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_winter', '€', offer)}
                                  </div>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-red-600 dark:text-red-400 w-20">Sobriété</span>
                                    {renderEditableField('HC', 'hc_price_summer', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_summer', '€', offer)}
                                  </div>
                                </>
                              )}

                              {offer.offer_type === 'SEASONAL' && (
                                <>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 w-14">Hiver</span>
                                    {renderEditableField('HC', 'hc_price_winter', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_winter', '€', offer)}
                                  </div>
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-14">Été</span>
                                    {renderEditableField('HC', 'hc_price_summer', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_summer', '€', offer)}
                                  </div>
                                </>
                              )}

                              {(offer.offer_type === 'ZEN_WEEK_END' || offer.offer_type === 'ZEN_WEEK_END_HP_HC') && (
                                <>
                                  {renderEditableField('HC', 'hc_price', '€/kWh', offer)}
                                  {renderEditableField('HP', 'hp_price', '€/kWh', offer)}
                                  <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                    <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-14">Week-end</span>
                                    {renderEditableField('HC', 'hc_price_weekend', '€', offer)}
                                    {renderEditableField('HP', 'hp_price_weekend', '€', offer)}
                                  </div>
                                </>
                              )}

                              {offer.offer_type === 'EJP' && (
                                <>
                                  {renderEditableField('Normal', 'ejp_normal', '€/kWh', offer)}
                                  {renderEditableField('Pointe', 'ejp_peak', '€/kWh', offer)}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Bouton de soumission et récapitulatif */}
                  {modifiedOffers.length > 0 && (
                    <div className="mt-6 sticky bottom-4">
                      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
                        {showSubmitRecap ? (
                          <>
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <Send size={16} className="text-primary-600" />
                              Récapitulatif des modifications ({modifiedOffers.length} offre{modifiedOffers.length > 1 ? 's' : ''})
                            </h4>
                            <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                              {modifiedOffers.map(offer => {
                                const edited = editedOffers[offer.id] || {}
                                const changes = Object.entries(edited).filter(([key, value]) => {
                                  const originalValue = (offer as unknown as Record<string, unknown>)[key]
                                  // Comparer en tant que nombres pour éviter les problèmes de formatage
                                  const origNum = Number(originalValue)
                                  const newNum = Number(value)
                                  if (isNaN(origNum) && isNaN(newNum)) return false
                                  if (isNaN(origNum) || isNaN(newNum)) return true
                                  return Math.abs(origNum - newNum) > 0.00001
                                })
                                if (changes.length === 0) return null
                                return (
                                  <div key={offer.id} className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-sm">
                                    <div className="font-medium">{offer.name}</div>
                                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 space-y-0.5">
                                      {changes.map(([key, value]) => {
                                        const originalValue = (offer as unknown as Record<string, unknown>)[key]
                                        const origNum = Number(originalValue)
                                        const newNum = Number(value)
                                        return (
                                          <div key={key} className="flex gap-2">
                                            <span className="w-24">{fieldLabels[key] || key}:</span>
                                            <span className="text-red-500 line-through">{isNaN(origNum) ? '-' : origNum.toFixed(key === 'subscription_price' ? 2 : 4)}</span>
                                            <span className="text-green-600 dark:text-green-400">{isNaN(newNum) ? '-' : newNum.toFixed(key === 'subscription_price' ? 2 : 4)}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowSubmitRecap(false)}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                              >
                                <X size={16} />
                                Annuler
                              </button>
                              <button
                                onClick={submitAllModifications}
                                disabled={submittingOffers}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 rounded-lg transition-colors"
                              >
                                <Send size={16} />
                                {submittingOffers ? 'Envoi en cours...' : 'Confirmer l\'envoi'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="text-sm">
                              <span className="font-medium text-amber-600 dark:text-amber-400">{modifiedOffers.length}</span>
                              <span className="text-gray-600 dark:text-gray-400"> offre{modifiedOffers.length > 1 ? 's' : ''} modifiée{modifiedOffers.length > 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setEditedOffers({})}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                              >
                                <X size={16} />
                                Annuler
                              </button>
                              <button
                                onClick={() => setShowSubmitRecap(true)}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                              >
                                <Send size={16} />
                                Soumettre les modifications
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        ) : null}
      </div>
      )}
    </div>
  )
}
