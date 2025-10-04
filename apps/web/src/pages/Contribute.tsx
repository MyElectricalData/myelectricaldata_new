import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, CheckCircle, Clock, XCircle, List, Zap } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData, type EnergyOffer } from '@/api/energy'
import { pdlApi } from '@/api/pdl'

export default function Contribute() {
  const queryClient = useQueryClient()

  // Fetch providers
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      return response.data as EnergyProvider[]
    },
  })

  // Fetch user's contributions
  const { data: myContributions } = useQuery({
    queryKey: ['my-contributions'],
    queryFn: async () => {
      const response = await energyApi.getMyContributions()
      return response.data
    },
  })

  // Fetch all offers
  const { data: offersData } = useQuery({
    queryKey: ['energy-offers'],
    queryFn: async () => {
      const response = await energyApi.getOffers()
      return Array.isArray(response.data) ? response.data as EnergyOffer[] : []
    },
  })

  // Fetch user's PDLs to get subscribed power
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
  })

  // Form state
  const [contributionType, setContributionType] = useState<'NEW_PROVIDER' | 'NEW_OFFER'>('NEW_OFFER')
  const [providerName, setProviderName] = useState('')
  const [providerWebsite, setProviderWebsite] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [offerName, setOfferName] = useState('')
  const [offerType, setOfferType] = useState('BASE')
  const [description, setDescription] = useState('')

  // Filter state
  const [filterProvider, setFilterProvider] = useState<string>('all')
  const [filterPower, setFilterPower] = useState<string>('all')

  // Auto-set power filter based on user's PDL subscribed power (only once)
  useEffect(() => {
    if (pdlsResponse?.success && filterPower === 'all') {
      const pdls = pdlsResponse.data || []
      if (Array.isArray(pdls) && pdls.length > 0) {
        const firstPdl = pdls[0]
        if (firstPdl.subscribed_power) {
          setFilterPower(firstPdl.subscribed_power.toString())
        }
      }
    }
  }, [pdlsResponse, filterPower])

  // Pricing
  const [subscriptionPrice, setSubscriptionPrice] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [hcPrice, setHcPrice] = useState('')
  const [hpPrice, setHpPrice] = useState('')

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: ContributionData) => {
      return await energyApi.submitContribution(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
      alert('Contribution soumise avec succès ! Les administrateurs vont la vérifier.')
      resetForm()
    },
    onError: (error: any) => {
      alert(`Erreur: ${error.message || 'Une erreur est survenue'}`)
    },
  })

  const resetForm = () => {
    setOfferName('')
    setOfferType('BASE')
    setDescription('')
    setSubscriptionPrice('')
    setBasePrice('')
    setHcPrice('')
    setHpPrice('')
    setProviderName('')
    setProviderWebsite('')
    setSelectedProviderId('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const contributionData: ContributionData = {
      contribution_type: contributionType,
      offer_name: offerName,
      offer_type: offerType,
      description: description || undefined,
      pricing_data: {
        subscription_price: parseFloat(subscriptionPrice) || 0,
        base_price: basePrice ? parseFloat(basePrice) : undefined,
        hc_price: hcPrice ? parseFloat(hcPrice) : undefined,
        hp_price: hpPrice ? parseFloat(hpPrice) : undefined,
      },
    }

    if (contributionType === 'NEW_PROVIDER') {
      contributionData.provider_name = providerName
      contributionData.provider_website = providerWebsite || undefined
    } else {
      contributionData.existing_provider_id = selectedProviderId
    }

    submitMutation.mutate(contributionData)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="text-green-600" size={20} />
      case 'rejected':
        return <XCircle className="text-red-600" size={20} />
      default:
        return <Clock className="text-yellow-600" size={20} />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approuvée'
      case 'rejected':
        return 'Rejetée'
      default:
        return 'En attente'
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Users className="text-primary-600 dark:text-primary-400" size={32} />
          Contribuer à la base de données
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Aidez la communauté en ajoutant ou mettant à jour les offres tarifaires des fournisseurs d'énergie.
          Les administrateurs vérifieront votre contribution avant publication.
        </p>
      </div>

      {/* Contribution Form */}
      <div className="card mb-8">
        <h2 className="text-2xl font-bold mb-6">Nouvelle contribution</h2>

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
                {providersData?.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Offer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <option value="HC_HP">Heures Creuses / Heures Pleines</option>
                <option value="TEMPO">TEMPO</option>
                <option value="EJP">EJP</option>
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
            <h3 className="text-lg font-semibold mb-4">Tarification</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Abonnement (€/mois) <span className="text-red-500">*</span>
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

              {offerType === 'BASE' && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prix BASE (€/kWh)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={basePrice}
                    onChange={(e) => setBasePrice(e.target.value)}
                    className="input"
                    placeholder="0.2516"
                  />
                </div>
              )}

              {offerType === 'HC_HP' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix Heures Creuses (€/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={hcPrice}
                      onChange={(e) => setHcPrice(e.target.value)}
                      className="input"
                      placeholder="0.2068"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Prix Heures Pleines (€/kWh)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={hpPrice}
                      onChange={(e) => setHpPrice(e.target.value)}
                      className="input"
                      placeholder="0.2700"
                    />
                  </div>
                </>
              )}
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
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Envoi en cours...' : 'Soumettre la contribution'}
            </button>
          </div>
        </form>
      </div>

      {/* Available Offers */}
      <div className="card mb-8">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <List className="text-primary-600 dark:text-primary-400" size={24} />
          Offres disponibles
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {(() => {
            if (!offersData) return '0 offre'
            let filteredCount = offersData.length

            // Count filtered offers
            if (filterProvider !== 'all' || filterPower !== 'all') {
              filteredCount = offersData.filter((offer) => {
                if (filterProvider !== 'all' && offer.provider_id !== filterProvider) return false
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
            }

            return `${filteredCount} offre(s) ${filterProvider !== 'all' || filterPower !== 'all' ? 'filtrée(s)' : 'actuellement dans la base de données'}`
          })()}
        </p>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Filtrer par fournisseur</label>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="input"
            >
              <option value="all">Tous les fournisseurs</option>
              {providersData?.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Filtrer par puissance</label>
            <select
              value={filterPower}
              onChange={(e) => setFilterPower(e.target.value)}
              className="input"
            >
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

        {offersData && offersData.length > 0 ? (
          <div className="space-y-6">
            {providersData?.map((provider) => {
              // Filter by provider
              if (filterProvider !== 'all' && provider.id !== filterProvider) {
                return null
              }

              // Get provider offers and filter by power
              let providerOffers = offersData.filter((offer) => offer.provider_id === provider.id)

              // Filter by power
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

              if (providerOffers.length === 0) return null

              return (
                <div key={provider.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Zap className="text-primary-600" size={20} />
                    {provider.name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {providerOffers.map((offer) => (
                      <div
                        key={offer.id}
                        className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                      >
                        <div className="mb-3">
                          <h4 className="font-semibold text-sm mb-1">{offer.name}</h4>
                          <span className="text-xs px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 rounded">
                            {offer.offer_type}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Abonnement :</span>
                            <span className="font-medium">{offer.subscription_price.toFixed(2)} €/mois</span>
                          </div>
                          {offer.offer_type === 'BASE' && offer.base_price && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Prix BASE :</span>
                              <span className="font-medium">{offer.base_price.toFixed(4)} €/kWh</span>
                            </div>
                          )}
                          {offer.offer_type === 'HC_HP' && (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">HC :</span>
                                <span className="font-medium">{offer.hc_price?.toFixed(4)} €/kWh</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">HP :</span>
                                <span className="font-medium">{offer.hp_price?.toFixed(4)} €/kWh</span>
                              </div>
                            </>
                          )}
                          {offer.offer_type === 'TEMPO' && (
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold text-blue-600 dark:text-blue-400 mt-2">Jours Bleus :</div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HC :</span>
                                <span className="font-medium">{offer.tempo_blue_hc?.toFixed(4)} €/kWh</span>
                              </div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HP :</span>
                                <span className="font-medium">{offer.tempo_blue_hp?.toFixed(4)} €/kWh</span>
                              </div>

                              <div className="font-semibold text-white dark:text-gray-300 mt-2">Jours Blancs :</div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HC :</span>
                                <span className="font-medium">{offer.tempo_white_hc?.toFixed(4)} €/kWh</span>
                              </div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HP :</span>
                                <span className="font-medium">{offer.tempo_white_hp?.toFixed(4)} €/kWh</span>
                              </div>

                              <div className="font-semibold text-red-600 dark:text-red-400 mt-2">Jours Rouges :</div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HC :</span>
                                <span className="font-medium">{offer.tempo_red_hc?.toFixed(4)} €/kWh</span>
                              </div>
                              <div className="flex justify-between pl-2">
                                <span className="text-gray-600 dark:text-gray-400">HP :</span>
                                <span className="font-medium">{offer.tempo_red_hp?.toFixed(4)} €/kWh</span>
                              </div>
                            </div>
                          )}
                          {(offer.price_updated_at || offer.created_at) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 space-y-1">
                              {offer.price_updated_at && (
                                <div className="flex justify-between">
                                  <span>Tarifs du fournisseur :</span>
                                  <span>{new Date(offer.price_updated_at).toLocaleDateString('fr-FR')}</span>
                                </div>
                              )}
                              {offer.created_at && (
                                <div className="flex justify-between">
                                  <span>Ajouté le :</span>
                                  <span>{new Date(offer.created_at).toLocaleDateString('fr-FR')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">Aucune offre disponible pour le moment.</p>
        )}
      </div>

      {/* My Contributions */}
      {myContributions && myContributions.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold mb-6">Mes contributions</h2>
          <div className="space-y-4">
            {myContributions.map((contribution: any) => (
              <div
                key={contribution.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(contribution.status)}
                      <h3 className="font-semibold">{contribution.offer_name}</h3>
                      <span className="text-sm text-gray-500">({contribution.offer_type})</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Soumise le {new Date(contribution.created_at).toLocaleDateString('fr-FR')}
                    </p>
                    {contribution.review_comment && (
                      <p className="text-sm mt-2 text-red-600 dark:text-red-400">
                        Commentaire : {contribution.review_comment}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      contribution.status === 'approved'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : contribution.status === 'rejected'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}
                  >
                    {getStatusText(contribution.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
