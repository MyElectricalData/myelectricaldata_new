import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, CheckCircle, XCircle, Calendar, User, Package, DollarSign } from 'lucide-react'
import { energyApi } from '@/api/energy'

interface PendingContribution {
  id: string
  contributor_email: string
  contribution_type: string
  status: string
  provider_name?: string
  existing_provider_id?: string
  offer_name: string
  offer_type: string
  description?: string
  pricing_data: {
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
  }
  hc_schedules?: Record<string, string>
  created_at: string
}

export default function AdminContributions() {
  const queryClient = useQueryClient()
  const [selectedContribution, setSelectedContribution] = useState<PendingContribution | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Fetch pending contributions
  const { data: contributions, isLoading } = useQuery({
    queryKey: ['admin-pending-contributions'],
    queryFn: async () => {
      const response = await energyApi.getPendingContributions()
      return response.data as PendingContribution[]
    },
  })

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (contributionId: string) => {
      return await energyApi.approveContribution(contributionId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      alert('Contribution approuvée avec succès !')
      setSelectedContribution(null)
    },
    onError: (error: any) => {
      alert(`Erreur: ${error.message || 'Une erreur est survenue'}`)
    },
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return await energyApi.rejectContribution(id, reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-contributions'] })
      alert('Contribution rejetée.')
      setSelectedContribution(null)
      setRejectReason('')
    },
    onError: (error: any) => {
      alert(`Erreur: ${error.message || 'Une erreur est survenue'}`)
    },
  })

  const handleApprove = (contributionId: string) => {
    if (confirm('Êtes-vous sûr de vouloir approuver cette contribution ?')) {
      approveMutation.mutate(contributionId)
    }
  }

  const handleReject = (contributionId: string) => {
    if (confirm('Êtes-vous sûr de vouloir rejeter cette contribution ?')) {
      rejectMutation.mutate({ id: contributionId, reason: rejectReason || undefined })
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
      case 'HC_HP':
        return 'Heures Creuses / Heures Pleines'
      case 'TEMPO':
        return 'TEMPO'
      case 'EJP':
        return 'EJP'
      default:
        return type
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
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Users className="text-primary-600 dark:text-primary-400" size={32} />
          Gestion des contributions
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Approuvez ou rejetez les contributions communautaires en attente.
        </p>
      </div>

      {!contributions || contributions.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="mx-auto text-gray-400 mb-4" size={48} />
          <h2 className="text-xl font-semibold mb-2">Aucune contribution en attente</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Toutes les contributions ont été traitées.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {contributions.map((contribution) => (
            <div key={contribution.id} className="card">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
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
                      <div>
                        <span className="font-medium">Nouveau fournisseur :</span>
                        <span className="ml-2">{contribution.provider_name}</span>
                      </div>
                    ) : (
                      <div>
                        <span className="font-medium">Fournisseur existant</span>
                        <span className="ml-2 text-gray-500">(ID: {contribution.existing_provider_id})</span>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Type d'offre :</span>
                      <span className="ml-2">{getOfferTypeLabel(contribution.offer_type)}</span>
                    </div>
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
                    Tarification
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">Abonnement :</span>
                      <span>{formatSubscription(contribution.pricing_data.subscription_price)}</span>
                    </div>

                    {contribution.offer_type === 'BASE' && (
                      <div className="flex justify-between">
                        <span>Prix BASE :</span>
                        <span>{formatPrice(contribution.pricing_data.base_price)}</span>
                      </div>
                    )}

                    {contribution.offer_type === 'HC_HP' && (
                      <>
                        <div className="flex justify-between">
                          <span>Prix Heures Creuses :</span>
                          <span>{formatPrice(contribution.pricing_data.hc_price)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Prix Heures Pleines :</span>
                          <span>{formatPrice(contribution.pricing_data.hp_price)}</span>
                        </div>
                      </>
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

              {/* Actions */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                {selectedContribution?.id === contribution.id ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Raison du rejet (optionnel)
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="input"
                        rows={3}
                        placeholder="Expliquez pourquoi cette contribution est rejetée..."
                      />
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => handleApprove(contribution.id)}
                        className="btn btn-primary flex items-center gap-2"
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle size={18} />
                        {approveMutation.isPending ? 'Approbation...' : 'Approuver'}
                      </button>
                      <button
                        onClick={() => handleReject(contribution.id)}
                        className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle size={18} />
                        {rejectMutation.isPending ? 'Rejet...' : 'Rejeter'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedContribution(null)
                          setRejectReason('')
                        }}
                        className="btn"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedContribution(contribution)}
                    className="btn btn-primary"
                  >
                    Gérer cette contribution
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
