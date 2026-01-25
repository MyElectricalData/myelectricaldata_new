import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, XCircle, List, ChevronDown, ChevronRight, MessageCircle, ExternalLink, Copy, Trash2 } from 'lucide-react'
import { energyApi, type Contribution } from '@/api/energy'
import ChatWhatsApp, { type ChatMessage } from '@/components/ChatWhatsApp'
import { toast } from '@/stores/notificationStore'
import { formatPrice, getOfferTypeLabel } from '../../utils'

interface MyContributionsProps {
  onEditContribution: (contribution: Contribution) => void
}

export default function MyContributions({ onEditContribution }: MyContributionsProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

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

  // State pour la confirmation de suppression
  const [deletingContributionId, setDeletingContributionId] = useState<string | null>(null)

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

  // Reply mutation
  const replyMutation = useMutation({
    mutationFn: async ({ contributionId, message }: { contributionId: string; message: string }) => {
      return await energyApi.replyToContribution(contributionId, message)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      setReplyMessages(prev => ({ ...prev, [variables.contributionId]: '' }))
      setSendingReply(null)
      toast.success('Réponse envoyée avec succès !')
    },
    onError: (error: unknown) => {
      setSendingReply(null)
      const errorMessage = (error as Error)?.message || 'Impossible d\'envoyer la réponse'
      toast.error(`Erreur: ${errorMessage}`)
    },
  })

  const handleSendReply = (contributionId: string) => {
    const message = replyMessages[contributionId]?.trim()
    if (!message) return
    setSendingReply(contributionId)
    replyMutation.mutate({ contributionId, message })
  }

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (contributionId: string) => {
      return await energyApi.deleteContribution(contributionId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      setDeletingContributionId(null)
      toast.success('Contribution supprimée avec succès.')
    },
    onError: (error: unknown) => {
      setDeletingContributionId(null)
      const errorMessage = (error as Error)?.message || 'Impossible de supprimer la contribution'
      toast.error(`Erreur: ${errorMessage}`)
    },
  })

  const handleDeleteContribution = (contributionId: string) => {
    deleteMutation.mutate(contributionId)
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
              <h3 className="font-semibold text-base text-gray-900 dark:text-white truncate">{contribution.offer_name}</h3>
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

      {/* Action buttons - for rejected and pending contributions */}
      {(contribution.status === 'rejected' || contribution.status === 'pending') && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700">
          {deletingContributionId === contribution.id ? (
            // Confirmation de suppression
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                Supprimer cette contribution ?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDeletingContributionId(null)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteContribution(contribution.id)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {deleteMutation.isPending ? 'Suppression...' : 'Confirmer'}
                </button>
              </div>
            </div>
          ) : (
            // Boutons Modifier et Supprimer
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onEditContribution(contribution)
                  navigate('/contribute/offers')
                  toast.success('Mode édition activé - allez sur l\'onglet "Toutes les offres" pour modifier.')
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors focus:outline-none focus:ring-2 ${
                  contribution.status === 'rejected'
                    ? 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-300 focus:ring-orange-500'
                    : 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 focus:ring-blue-500'
                }`}
              >
                <Copy size={12} />
                Modifier
              </button>
              <button
                type="button"
                onClick={() => setDeletingContributionId(contribution.id)}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-500"
                title="Supprimer"
                aria-label="Supprimer cette contribution"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Messages / Conversation - WhatsApp Style */}
      {showMessagesSection && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => {
              if (isWritingMessage || isSendingMessage) return
              setExpandedMessages(prev => ({ ...prev, [contribution.id]: !isMessagesExpanded }))
            }}
            className={`w-full flex items-center justify-between px-3 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset ${
              isWritingMessage || isSendingMessage
                ? 'cursor-default'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            aria-expanded={isMessagesExpanded}
            aria-label={`Échanges avec l'administrateur (${messageCount} messages)`}
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

  return (
    <div className="card">
      {Array.isArray(myContributions) && myContributions.length > 0 ? (
      <div className="space-y-4">
        {/* En attente - déplié par défaut */}
        {contributionsByStatus.pending.length > 0 && (
          <div className="border border-yellow-200 dark:border-yellow-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedStatusSections(prev => ({ ...prev, pending: !prev.pending }))}
              className="w-full flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-inset"
              aria-expanded={expandedStatusSections.pending}
              aria-label={`Contributions en attente (${contributionsByStatus.pending.length})`}
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
              type="button"
              onClick={() => setExpandedStatusSections(prev => ({ ...prev, approved: !prev.approved }))}
              className="w-full flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-inset"
              aria-expanded={expandedStatusSections.approved}
              aria-label={`Contributions approuvées (${contributionsByStatus.approved.length})`}
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
              type="button"
              onClick={() => setExpandedStatusSections(prev => ({ ...prev, rejected: !prev.rejected }))}
              className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-inset"
              aria-expanded={expandedStatusSections.rejected}
              aria-label={`Contributions rejetées (${contributionsByStatus.rejected.length})`}
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
            type="button"
            onClick={() => navigate('/contribute/offers')}
            className="text-primary-600 dark:text-primary-400 hover:underline font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
          >
            Consulter les offres et proposer des modifications
          </button>
        </div>
      )}
    </div>
  )
}
