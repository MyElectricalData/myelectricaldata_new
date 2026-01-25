import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Send, X, Link, AlertCircle, Plus, Trash2, Undo2, Eye, Pencil, Info, Building2 } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData, type EnergyOffer } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { usePermissions } from '@/hooks/usePermissions'

export default function AllOffers() {
  const queryClient = useQueryClient()
  const { isAdmin, isModerator } = usePermissions()

  // Les admins et modérateurs n'ont pas besoin de fournir l'URL de la fiche tarifaire
  const isPrivilegedUser = isAdmin() || isModerator()

  // Mode lecture (par défaut) ou édition
  const [isEditMode, setIsEditMode] = useState(false)

  // Filter state
  const [filterProvider, setFilterProvider] = useState<string>('')
  const [filterOfferType, setFilterOfferType] = useState<string>('all')

  // State pour l'édition inline des offres
  const [editedOffers, setEditedOffers] = useState<Record<string, Record<string, string>>>({})
  const [submittingOffers, setSubmittingOffers] = useState(false)
  const [priceSheetUrl, setPriceSheetUrl] = useState('')
  const recapRef = useRef<HTMLDivElement>(null)

  // State pour les propositions d'ajout/suppression de puissances
  const [powersToRemove, setPowersToRemove] = useState<number[]>([])
  // Nouvelles puissances à ajouter avec leurs tarifs (liste)
  const [newPowersData, setNewPowersData] = useState<Array<{
    power: number
    fields: Record<string, string>
  }>>([])

  // Formulaire inline pour créer un nouveau fournisseur
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderOfferType, setNewProviderOfferType] = useState('')

  // Fournisseurs marqués pour suppression
  const [providersToRemove, setProvidersToRemove] = useState<string[]>([])

  // Formulaire inline pour ajouter une nouvelle offre à un fournisseur existant
  const [isAddingOffer, setIsAddingOffer] = useState(false)
  const [newOfferType, setNewOfferType] = useState('')

  // Édition des noms d'offres (clé = nom original clean, valeur = nouveau nom)
  const [editedOfferNames, setEditedOfferNames] = useState<Record<string, string>>({})

  // Nouveaux groupes d'offres à créer (nom du groupe + puissances avec tarifs)
  const [newGroups, setNewGroups] = useState<Array<{
    name: string
    powers: Array<{
      power: number
      fields: Record<string, string>
    }>
  }>>([])

  // Modal du récapitulatif
  const [showRecapModal, setShowRecapModal] = useState(false)

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

  // Normaliser offersData en tableau (protection contre les données corrompues du cache)
  const offersArray = useMemo(() => {
    return Array.isArray(offersData) ? offersData : []
  }, [offersData])

  // Trier les fournisseurs avec EDF en premier
  const sortedProviders = useMemo(() => {
    if (!Array.isArray(providersData)) return []
    return [...providersData].sort((a, b) => {
      if (a.name.toUpperCase() === 'EDF') return -1
      if (b.name.toUpperCase() === 'EDF') return 1
      return a.name.localeCompare(b.name)
    })
  }, [providersData])

  // Ordre de tri des types d'offres
  const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC', 'SEASONAL', 'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND']

  // Types d'offres disponibles pour le fournisseur sélectionné
  const availableOfferTypes = useMemo(() => {
    if (!filterProvider || offersArray.length === 0) return []
    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    return types.sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [filterProvider, offersArray])

  // Tous les types d'offres disponibles dans la base (pour nouveau fournisseur)
  const allOfferTypes = useMemo(() => {
    if (offersArray.length === 0) return []
    const types = [...new Set(offersArray.map(o => o.offer_type))]
    return types.sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
  }, [offersArray])

  // Types d'offres non encore utilisés par le fournisseur sélectionné (pour ajout d'offre)
  const unusedOfferTypes = useMemo(() => {
    if (!filterProvider) return typeOrder
    const usedTypes = new Set(offersArray.filter(o => o.provider_id === filterProvider).map(o => o.offer_type))
    return typeOrder.filter(type => !usedTypes.has(type))
  }, [filterProvider, offersArray])

  // Initialiser avec EDF par défaut
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

  // Reset le filtre de type d'offre et les propositions de puissances quand on change de fournisseur
  useEffect(() => {
    if (!filterProvider || offersArray.length === 0) {
      setFilterOfferType('all')
      setPowersToRemove([])
      setNewPowersData([])
      setNewGroups([])
      setIsAddingOffer(false)
      setNewOfferType('')
      return
    }
    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
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
    // Reset les propositions de puissances et le mode ajout d'offre
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
    setIsAddingOffer(false)
    setNewOfferType('')
  }, [filterProvider, offersArray])

  // Reset les propositions de puissances quand on change de type d'offre
  useEffect(() => {
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
  }, [filterOfferType])


  // Helper pour vérifier si une offre a été modifiée
  const isOfferModified = (offer: EnergyOffer): boolean => {
    const edited = editedOffers[offer.id]
    if (!edited) return false
    return Object.entries(edited).some(([key, value]) => {
      const originalValue = (offer as unknown as Record<string, unknown>)[key]
      return String(originalValue ?? '') !== value
    })
  }

  // Helper pour vérifier s'il y a des noms de groupes modifiés
  const hasModifiedGroupNames = Object.entries(editedOfferNames).some(
    ([originalName, newName]) => newName !== originalName && newName.trim() !== ''
  )

  // Calculer le nombre total de modifications pour le badge
  const totalModificationsCount = useMemo(() => {
    const modifiedOffersCount = offersArray.filter(offer => isOfferModified(offer)).length
    const renamedGroupsCount = Object.entries(editedOfferNames).filter(
      ([originalName, newName]) => newName !== originalName && newName.trim() !== ''
    ).length
    return modifiedOffersCount + newPowersData.length + powersToRemove.length + providersToRemove.length + newGroups.length + renamedGroupsCount
  }, [offersArray, editedOffers, editedOfferNames, newPowersData, powersToRemove, providersToRemove, newGroups])

  // Vérifier s'il y a des modifications à afficher
  const hasAnyModifications = totalModificationsCount > 0

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

  // Helper pour formater la valeur
  const formatValue = (value: string | number | undefined): string => {
    if (value === undefined || value === null || value === '') return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return num.toString()
  }

  // Helper pour obtenir la couleur du label
  const getLabelColor = (label: string) => {
    if (label === 'HC') return 'text-blue-600 dark:text-blue-400'
    if (label === 'HP') return 'text-red-600 dark:text-red-400'
    return 'text-gray-600 dark:text-gray-400'
  }

  // Configuration du nombre de colonnes de tarifs par type d'offre
  const getTariffColumns = (offerType: string): number => {
    switch (offerType) {
      case 'BASE':
        return 1  // Base
      case 'HC_HP':
      case 'EJP':
        return 2  // HC/HP ou Normal/Pointe
      case 'TEMPO':
        return 2  // HC/HP par couleur (3 lignes)
      case 'ZEN_FLEX':
      case 'SEASONAL':
        return 2  // HC/HP par saison (2 lignes)
      case 'ZEN_WEEK_END':
        return 1  // Base + Base WE (2 lignes de 1)
      case 'ZEN_WEEK_END_HP_HC':
      case 'HC_WEEKEND':
      case 'HC_NUIT_WEEKEND':
      case 'BASE_WEEKEND':
        return 2  // HC/HP + WE (2 lignes de 2)
      default:
        return 2  // Défaut
    }
  }

  // Render un champ (éditable en mode édition, lecture seule sinon) - utilise flex-1 pour occuper l'espace disponible
  const renderEditableField = (label: string, fieldKey: string, unit: string, offer: EnergyOffer) => {
    const editedValue = editedOffers[offer.id]?.[fieldKey]
    const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
    const displayValue = editedValue !== undefined ? editedValue : formatValue(originalValue as string | number | undefined)
    const isModified = editedValue !== undefined && editedValue !== String(originalValue ?? '')

    // Mode lecture : affichage simple avec flex-1
    if (!isEditMode) {
      return (
        <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex items-center gap-2 min-w-0">
          <span className={`text-sm font-semibold w-10 shrink-0 text-right ${getLabelColor(label)}`}>{label}</span>
          <span className="text-base font-bold text-gray-900 dark:text-white truncate">
            {displayValue || '-'}
          </span>
          <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">{unit}</span>
        </div>
      )
    }

    // Mode édition : champ input avec flex-1
    return (
      <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`text-sm font-semibold w-10 shrink-0 text-right ${getLabelColor(label)}`}>{label}</span>
        <input
          type="number"
          step="0.0001"
          value={displayValue}
          onChange={(e) => updateField(offer.id, fieldKey, e.target.value)}
          className={`flex-1 min-w-[80px] max-w-[120px] px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
            isModified
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        <span className="text-gray-500 dark:text-gray-400 text-sm shrink-0">{unit}</span>
      </div>
    )
  }

  // Helper pour extraire et nettoyer le nom de l'offre
  const getCleanOfferName = (offerName: string): string => {
    let name = offerName.replace(/\s*\d+\s*kVA/gi, '')
    name = name.replace(/\s*-?\s*(BASE|HC[_\s]?HP|TEMPO|EJP)/gi, '')
    name = name.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
    name = name.replace(/\s*-\s*$/, '').trim()
    return name || offerName
  }

  // Helper pour extraire la puissance
  const getPower = (offerName: string): string | null => {
    const match = offerName.match(/(\d+)\s*kVA/i)
    return match ? `${match[1]} kVA` : null
  }

  // Helper pour soumettre toutes les modifications
  const submitAllModifications = async () => {
    const currentProvider = sortedProviders.find(p => p.id === filterProvider)

    // Calcul des modifications liées à un fournisseur spécifique
    const providerOffers = currentProvider ? offersArray.filter((offer) =>
      offer.provider_id === currentProvider.id && offer.offer_type === filterOfferType
    ) : []

    // Récupérer le nom de base des offres existantes (sans la puissance)
    const existingBaseOfferName = providerOffers.length > 0 && currentProvider
      ? getCleanOfferName(providerOffers[0].name)
      : currentProvider ? `${currentProvider.name} - ${filterOfferType}` : ''

    const modifiedOffers = providerOffers.filter(offer => isOfferModified(offer))
    const hasProviderModifications = modifiedOffers.length > 0 || newPowersData.length > 0 || powersToRemove.length > 0 || newGroups.length > 0 || hasModifiedGroupNames
    const hasProviderDeletions = providersToRemove.length > 0

    if (!hasProviderModifications && !hasProviderDeletions) return

    setSubmittingOffers(true)
    let successCount = 0
    let errorCount = 0

    // Helper pour parser les valeurs numériques en évitant NaN
    const parsePrice = (editedValue: string | undefined, originalValue: number | undefined): number | undefined => {
      if (editedValue !== undefined && editedValue !== '') {
        const parsed = parseFloat(editedValue)
        return isNaN(parsed) ? originalValue : parsed
      }
      return originalValue
    }

    // Soumettre les modifications de tarifs existants (seulement si un fournisseur est sélectionné)
    if (currentProvider) {
      for (const offer of modifiedOffers) {
        try {
          const edited = editedOffers[offer.id] || {}
          // Extraire la puissance de l'offre depuis son nom (ex: "Tarif Bleu - 6 kVA")
          const powerMatch = offer.name.match(/(\d+)\s*kVA/i)
          const powerKva = powerMatch ? parseInt(powerMatch[1]) : offer.power_kva || 6

          const contributionData: ContributionData = {
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: offer.provider_id,
            existing_offer_id: offer.id,
            provider_name: currentProvider.name,
            offer_name: offer.name,
            offer_type: offer.offer_type,
            power_kva: powerKva,
            pricing_data: {
              subscription_price: parsePrice(edited.subscription_price, offer.subscription_price),
              base_price: parsePrice(edited.base_price, offer.base_price),
              hc_price: parsePrice(edited.hc_price, offer.hc_price),
              hp_price: parsePrice(edited.hp_price, offer.hp_price),
              base_price_weekend: parsePrice(edited.base_price_weekend, offer.base_price_weekend),
              hc_price_weekend: parsePrice(edited.hc_price_weekend, offer.hc_price_weekend),
              hp_price_weekend: parsePrice(edited.hp_price_weekend, offer.hp_price_weekend),
              tempo_blue_hc: parsePrice(edited.tempo_blue_hc, offer.tempo_blue_hc),
              tempo_blue_hp: parsePrice(edited.tempo_blue_hp, offer.tempo_blue_hp),
              tempo_white_hc: parsePrice(edited.tempo_white_hc, offer.tempo_white_hc),
              tempo_white_hp: parsePrice(edited.tempo_white_hp, offer.tempo_white_hp),
              tempo_red_hc: parsePrice(edited.tempo_red_hc, offer.tempo_red_hc),
              tempo_red_hp: parsePrice(edited.tempo_red_hp, offer.tempo_red_hp),
              ejp_normal: parsePrice(edited.ejp_normal, offer.ejp_normal),
              ejp_peak: parsePrice(edited.ejp_peak, offer.ejp_peak),
              hc_price_winter: parsePrice(edited.hc_price_winter, offer.hc_price_winter),
              hp_price_winter: parsePrice(edited.hp_price_winter, offer.hp_price_winter),
              hc_price_summer: parsePrice(edited.hc_price_summer, offer.hc_price_summer),
              hp_price_summer: parsePrice(edited.hp_price_summer, offer.hp_price_summer),
            },
            price_sheet_url: priceSheetUrl,
            valid_from: offer.valid_from || new Date().toISOString().split('T')[0],
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

      // Soumettre les demandes de suppression de puissances (utilise UPDATE_OFFER avec description)
      for (const power of powersToRemove) {
        try {
          const contributionData: ContributionData = {
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: currentProvider.id,
            provider_name: currentProvider.name,
            offer_name: `[SUPPRESSION] ${currentProvider.name} - ${filterOfferType} - ${power} kVA`,
            offer_type: filterOfferType,
            description: `Demande de suppression de la puissance ${power} kVA pour ${currentProvider.name} (${filterOfferType})`,
            power_kva: power,
            price_sheet_url: priceSheetUrl,
            valid_from: new Date().toISOString().split('T')[0],
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

      // Soumettre les demandes d'ajout de puissances (utilise NEW_OFFER)
      for (const newPower of newPowersData) {
        try {
          const contributionData: ContributionData = {
            contribution_type: 'NEW_OFFER',
            existing_provider_id: currentProvider.id,
            provider_name: currentProvider.name,
            offer_name: `${existingBaseOfferName} - ${newPower.power} kVA`,
            offer_type: filterOfferType,
            description: `Ajout de la puissance ${newPower.power} kVA pour ${currentProvider.name} (${filterOfferType})`,
            power_kva: newPower.power,
            pricing_data: {
              subscription_price: parsePrice(newPower.fields.subscription_price, undefined),
              base_price: parsePrice(newPower.fields.base_price, undefined),
              hc_price: parsePrice(newPower.fields.hc_price, undefined),
              hp_price: parsePrice(newPower.fields.hp_price, undefined),
            },
            price_sheet_url: priceSheetUrl,
            valid_from: new Date().toISOString().split('T')[0],
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

      // Soumettre les nouveaux groupes d'offres
      for (const group of newGroups) {
        if (!group.name || group.powers.length === 0) continue

        for (const power of group.powers) {
          if (!power.power || power.power <= 0) continue

          try {
            const contributionData: ContributionData = {
              contribution_type: 'NEW_OFFER',
              existing_provider_id: currentProvider.id,
              provider_name: currentProvider.name,
              offer_name: `${group.name} - ${power.power} kVA`,
              offer_type: filterOfferType,
              description: `Création d'un nouveau groupe d'offres "${group.name}" avec la puissance ${power.power} kVA pour ${currentProvider.name} (${filterOfferType})`,
              power_kva: power.power,
              pricing_data: {
                subscription_price: parsePrice(power.fields.subscription_price, undefined),
                base_price: parsePrice(power.fields.base_price, undefined),
                hc_price: parsePrice(power.fields.hc_price, undefined),
                hp_price: parsePrice(power.fields.hp_price, undefined),
              },
              price_sheet_url: priceSheetUrl,
              valid_from: new Date().toISOString().split('T')[0],
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
      }

      // Soumettre les renommages de groupes d'offres
      for (const [originalName, newName] of Object.entries(editedOfferNames)) {
        if (newName === originalName || newName.trim() === '') continue

        // Trouver toutes les offres de ce groupe pour les mettre à jour
        const offersInGroup = providerOffers.filter(o => getCleanOfferName(o.name) === originalName)

        for (const offer of offersInGroup) {
          try {
            // Reconstruire le nouveau nom de l'offre avec le nouveau nom de groupe
            const power = getPower(offer.name)
            const newOfferName = power ? `${newName} - ${power}` : newName

            const contributionData: ContributionData = {
              contribution_type: 'UPDATE_OFFER',
              existing_provider_id: currentProvider.id,
              existing_offer_id: offer.id,
              provider_name: currentProvider.name,
              offer_name: `[RENOMMAGE] ${newOfferName}`,
              offer_type: filterOfferType,
              description: `Renommage du groupe d'offres "${originalName}" en "${newName}" pour ${currentProvider.name} (${filterOfferType})`,
              power_kva: offer.power_kva || (power ? parseInt(power) : 6),
              price_sheet_url: priceSheetUrl,
              valid_from: new Date().toISOString().split('T')[0],
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
      }
    }

    // Soumettre les demandes de suppression de fournisseurs
    for (const providerId of providersToRemove) {
      try {
        const providerToDelete = sortedProviders.find(p => p.id === providerId)
        if (!providerToDelete) continue

        const contributionData: ContributionData = {
          contribution_type: 'UPDATE_OFFER',
          existing_provider_id: providerId,
          provider_name: providerToDelete.name,
          offer_name: `[SUPPRESSION FOURNISSEUR] ${providerToDelete.name}`,
          offer_type: 'BASE', // Type par défaut pour la demande
          description: `Demande de suppression du fournisseur "${providerToDelete.name}" et de toutes ses offres.`,
          price_sheet_url: priceSheetUrl || 'N/A',
          valid_from: new Date().toISOString().split('T')[0],
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
      toast.success(`${successCount} contribution(s) soumise(s) avec succès !`)
      setEditedOffers({})
      setEditedOfferNames({})
      setPriceSheetUrl('')
      setPowersToRemove([])
      setNewPowersData([])
      setNewGroups([])
      setProvidersToRemove([])
      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} erreur(s) lors de l'envoi`)
    }
    setSubmittingOffers(false)
  }

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

  // Get provider offers filtered and sorted by power
  const providerOffers = offersArray
    .filter((offer) =>
      offer.provider_id === filterProvider && offer.offer_type === filterOfferType
    )
    .sort((a, b) => {
      const powerA = a.power_kva || parseInt(a.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
      const powerB = b.power_kva || parseInt(b.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
      return powerA - powerB
    })

  const modifiedOffers = providerOffers.filter(offer => isOfferModified(offer))

  // Regrouper les offres par nom (clean name)
  const groupedOffers = useMemo(() => {
    const groups: Record<string, typeof providerOffers> = {}
    for (const offer of providerOffers) {
      const cleanName = getCleanOfferName(offer.name)
      if (!groups[cleanName]) {
        groups[cleanName] = []
      }
      groups[cleanName].push(offer)
    }
    // Trier chaque groupe par puissance
    for (const groupName of Object.keys(groups)) {
      groups[groupName].sort((a, b) => {
        const powerA = a.power_kva || parseInt(a.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
        const powerB = b.power_kva || parseInt(b.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
        return powerA - powerB
      })
    }
    return groups
  }, [providerOffers])

  // Liste des noms de groupes triés
  const groupNames = useMemo(() => {
    return Object.keys(groupedOffers).sort((a, b) => a.localeCompare(b))
  }, [groupedOffers])

  // Calculer les puissances existantes pour ce fournisseur/type
  const existingPowers = useMemo(() => {
    return providerOffers.map(offer => {
      const powerMatch = offer.name.match(/(\d+)\s*kVA/i)
      return powerMatch ? parseInt(powerMatch[1]) : (offer.power_kva || 0)
    }).filter(p => p > 0)
  }, [providerOffers])

  // Vérifier si une puissance est déjà utilisée (existante ou dans les nouvelles puissances ajoutées)
  const isPowerAlreadyUsed = (power: number, currentIndex?: number): boolean => {
    // Vérifier dans les offres existantes (sauf celles marquées pour suppression)
    if (existingPowers.includes(power) && !powersToRemove.includes(power)) {
      return true
    }
    // Vérifier dans les nouvelles puissances ajoutées (sauf l'index courant)
    return newPowersData.some((p, i) => p.power === power && i !== currentIndex)
  }

  // Vérifier s'il y a des doublons dans les nouvelles puissances
  const hasDuplicatePowers = useMemo(() => {
    return newPowersData.some((newPower, index) => isPowerAlreadyUsed(newPower.power, index))
  }, [newPowersData, existingPowers, powersToRemove])

  // Détecter les champs de prix requis pour le type d'offre actuel
  const getRequiredPriceFields = (): string[] => {
    if (filterOfferType === 'BASE') return ['base_price']
    if (filterOfferType === 'HC_HP') return ['hc_price', 'hp_price']
    if (filterOfferType === 'TEMPO') return ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp']
    if (filterOfferType === 'EJP') return ['ejp_normal', 'ejp_peak']
    if (filterOfferType === 'ZEN_FLEX' || filterOfferType === 'SEASONAL') return ['hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter']
    if (filterOfferType === 'ZEN_WEEK_END') return ['base_price', 'base_price_weekend']
    if (filterOfferType === 'ZEN_WEEK_END_HP_HC' || filterOfferType === 'HC_WEEKEND' || filterOfferType === 'HC_NUIT_WEEKEND') return ['hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend']

    // Pour les types non standard, détecter depuis les offres existantes
    const knownPriceFields = [
      'base_price', 'hc_price', 'hp_price',
      'hc_price_winter', 'hp_price_winter', 'hc_price_summer', 'hp_price_summer',
      'peak_day_price', 'base_price_weekend',
      'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp',
      'ejp_normal', 'ejp_peak'
    ]

    const offersOfType = offersArray.filter(o => o.offer_type === filterOfferType)
    if (offersOfType.length === 0) return ['base_price'] // fallback

    const usedFields = new Set<string>()
    offersOfType.forEach(offer => {
      knownPriceFields.forEach(key => {
        const value = offer[key as keyof typeof offer]
        if (value !== undefined && value !== null) {
          usedFields.add(key)
        }
      })
    })

    return usedFields.size > 0 ? Array.from(usedFields) : ['base_price']
  }

  // Vérifier si une nouvelle puissance a tous les champs obligatoires remplis
  const isNewPowerComplete = (newPower: { power: number; fields: Record<string, string> }): boolean => {
    // Puissance doit être > 0
    if (!newPower.power || newPower.power <= 0) return false
    // Abonnement obligatoire
    if (!newPower.fields.subscription_price || newPower.fields.subscription_price === '') return false

    // Vérifier les champs de prix requis pour ce type d'offre
    const requiredFields = getRequiredPriceFields()
    for (const field of requiredFields) {
      if (!newPower.fields[field] || newPower.fields[field] === '') return false
    }

    return true
  }

  // Vérifier si toutes les nouvelles puissances sont complètes
  const hasIncompletePowers = useMemo(() => {
    return newPowersData.length > 0 && newPowersData.some(p => !isNewPowerComplete(p))
  }, [newPowersData, filterOfferType])

  // Vérifier si les nouveaux groupes ont des champs incomplets
  const hasIncompleteGroups = useMemo(() => {
    if (newGroups.length === 0) return false
    return newGroups.some(group => {
      // Le nom du groupe est obligatoire
      if (!group.name || group.name.trim() === '') return true
      // Chaque puissance doit être complète
      return group.powers.some(p => !isNewPowerComplete(p))
    })
  }, [newGroups, filterOfferType])

  // Vérifier s'il y a des doublons dans les nouveaux groupes
  const hasGroupDuplicatePowers = useMemo(() => {
    return newGroups.some(group => {
      const powers = group.powers.map(p => p.power).filter(p => p > 0)
      return powers.length !== new Set(powers).size
    })
  }, [newGroups])

  // Détecter dynamiquement les champs de prix utilisés par les offres existantes du type sélectionné
  const dynamicPriceFields = useMemo(() => {
    // Liste des champs de prix connus avec leurs labels
    const knownFields: Record<string, { label: string; color?: string }> = {
      base_price: { label: 'Base' },
      hc_price: { label: 'HC', color: 'text-blue-600 dark:text-blue-400' },
      hp_price: { label: 'HP', color: 'text-red-600 dark:text-red-400' },
      hc_price_winter: { label: 'HC Hiver', color: 'text-blue-600 dark:text-blue-400' },
      hp_price_winter: { label: 'HP Hiver', color: 'text-red-600 dark:text-red-400' },
      hc_price_summer: { label: 'HC Été', color: 'text-cyan-600 dark:text-cyan-400' },
      hp_price_summer: { label: 'HP Été', color: 'text-orange-600 dark:text-orange-400' },
      peak_day_price: { label: 'Pointe', color: 'text-red-600 dark:text-red-400' },
      base_price_weekend: { label: 'Week-end' },
      tempo_blue_hc: { label: 'Bleu HC', color: 'text-blue-600 dark:text-blue-400' },
      tempo_blue_hp: { label: 'Bleu HP', color: 'text-blue-600 dark:text-blue-400' },
      tempo_white_hc: { label: 'Blanc HC', color: 'text-gray-600 dark:text-gray-400' },
      tempo_white_hp: { label: 'Blanc HP', color: 'text-gray-600 dark:text-gray-400' },
      tempo_red_hc: { label: 'Rouge HC', color: 'text-red-600 dark:text-red-400' },
      tempo_red_hp: { label: 'Rouge HP', color: 'text-red-600 dark:text-red-400' },
      ejp_normal: { label: 'Normal', color: 'text-green-600 dark:text-green-400' },
      ejp_peak: { label: 'Pointe', color: 'text-red-600 dark:text-red-400' },
    }

    // Si type standard ou connu, ne pas utiliser la détection dynamique
    if (['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'SEASONAL', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType)) {
      return []
    }

    // Récupérer les offres du type sélectionné
    const offersOfType = offersArray.filter(o => o.offer_type === filterOfferType)
    if (offersOfType.length === 0) {
      // Aucune offre existante : fallback sur base_price
      return [{ key: 'base_price', label: 'Prix', color: undefined }]
    }

    // Analyser les champs utilisés directement sur l'objet offer
    const usedFields = new Set<string>()
    const priceFieldKeys = Object.keys(knownFields)

    offersOfType.forEach(offer => {
      priceFieldKeys.forEach(key => {
        const value = offer[key as keyof typeof offer]
        if (value !== undefined && value !== null && key !== 'subscription_price') {
          usedFields.add(key)
        }
      })
    })

    // Convertir en tableau avec labels
    const fields = Array.from(usedFields).map(key => ({
      key,
      label: knownFields[key]?.label || key,
      color: knownFields[key]?.color
    }))

    // Si aucun champ trouvé, fallback sur base_price
    return fields.length > 0 ? fields : [{ key: 'base_price', label: 'Prix', color: undefined }]
  }, [filterOfferType, offersArray])

  // Afficher l'overlay de chargement pendant la soumission
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
      {/* Header avec bouton mode */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Package className="text-primary-600 dark:text-primary-400" size={20} />
            Offres disponibles
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {(() => {
              if (offersArray.length === 0) return '0 offre'
              const filteredCount = offersArray.filter((offer) => {
                if (filterProvider && offer.provider_id !== filterProvider) return false
                if (filterOfferType !== 'all' && offer.offer_type !== filterOfferType) return false
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
              return `${filteredCount} offre(s) ${selectedProvider ? `pour ${selectedProvider.name}` : ''}${typeLabel ? ` - ${typeLabel}` : ''}`
            })()}
          </p>
        </div>
        {/* Bouton mode lecture/édition */}
        <button
          onClick={() => {
            if (isEditMode) {
              // Quitter le mode édition : reset des modifications
              setEditedOffers({})
              setPriceSheetUrl('')
              setPowersToRemove([])
              setNewPowersData([])
            }
            setIsEditMode(!isEditMode)
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

      {/* Encadré d'information en mode édition */}
      {isEditMode && (
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
      )}

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Fournisseurs - Boutons */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Sélectionner un fournisseur</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {sortedProviders.map((provider) => {
              const isSelected = filterProvider === provider.id
              const providerOffersCount = offersArray.filter(o => o.provider_id === provider.id).length
              const isMarkedForRemoval = providersToRemove.includes(provider.id)
              return (
                <div
                  key={provider.id}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 w-full ${
                    isMarkedForRemoval
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 opacity-60'
                      : isSelected
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span
                    onClick={() => {
                      if (!isMarkedForRemoval) {
                        setFilterProvider(provider.id)
                      }
                    }}
                    className={`flex-1 ${isMarkedForRemoval ? 'line-through cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {provider.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                      isMarkedForRemoval
                        ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300'
                        : isSelected
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                    }`}>
                      {providerOffersCount}
                    </span>
                  {/* Icône supprimer/restaurer (uniquement en mode édition) */}
                  {isEditMode && (
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

          {/* Bouton/Champ ajouter un nouveau fournisseur (uniquement en mode édition) */}
          {isEditMode && !isAddingProvider && (
            <button
              onClick={() => {
                setIsAddingProvider(true)
                setNewProviderName('')
                setNewProviderOfferType(allOfferTypes[0] || 'BASE')
                setFilterProvider('')
                setFilterOfferType('all')
                setPowersToRemove([])
                setNewPowersData([])
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

        {/* Formulaire nouveau fournisseur (remplace la sélection de type d'offre) */}
        {isAddingProvider && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
                <Building2 size={18} />
                Nouveau fournisseur
              </h3>
              <button
                onClick={() => {
                  setIsAddingProvider(false)
                  setNewProviderName('')
                  setNewProviderOfferType('')
                  setNewPowersData([])
                  // Réinitialiser sur EDF
                  const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
                  if (edf) {
                    setFilterProvider(edf.id)
                  } else if (sortedProviders.length > 0) {
                    setFilterProvider(sortedProviders[0].id)
                  }
                }}
                className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="Annuler"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nom du fournisseur */}
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

              {/* Type d'offre */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Type d'offre <span className="text-red-500">*</span>
                </label>
                <select
                  value={newProviderOfferType}
                  onChange={(e) => setNewProviderOfferType(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border-2 border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:outline-none"
                >
                  {allOfferTypes.map((type) => {
                    const typeLabels: Record<string, string> = {
                      'BASE': 'Base',
                      'HC_HP': 'HC/HP',
                      'TEMPO': 'Tempo',
                      'EJP': 'EJP',
                      'ZEN_FLEX': 'Zen Flex',
                      'ZEN_WEEK_END': 'Zen Week-end',
                      'ZEN_WEEK_END_HP_HC': 'Zen Week-end HC/HP',
                      'SEASONAL': 'Saisonnier',
                      'BASE_WEEKEND': 'Base Week-end',
                      'HC_NUIT_WEEKEND': 'HC Nuit & Week-end',
                      'HC_WEEKEND': 'HC Week-end',
                    }
                    return (
                      <option key={type} value={type}>
                        {typeLabels[type] || type}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <p className="mt-3 text-sm text-green-700 dark:text-green-400">
              Ajoutez les puissances et tarifs ci-dessous, puis soumettez votre contribution.
            </p>
          </div>
        )}

        {/* Type d'offre - Boutons dynamiques (masqué si ajout de fournisseur) */}
        {!isAddingProvider && filterProvider && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Type d'offre</label>

            {/* Formulaire inline pour ajouter une nouvelle offre */}
            {isAddingOffer ? (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-2">
                    <Package size={18} />
                    Proposer une nouvelle offre pour {sortedProviders.find(p => p.id === filterProvider)?.name}
                  </h3>
                  <button
                    onClick={() => {
                      setIsAddingOffer(false)
                      setNewOfferType('')
                      setNewPowersData([])
                    }}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700"
                    title="Annuler"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Sélection du type d'offre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Type d'offre <span className="text-red-500">*</span>
                  </label>
                  {unusedOfferTypes.length > 0 ? (
                    <select
                      value={newOfferType}
                      onChange={(e) => setNewOfferType(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg border-2 border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:outline-none"
                    >
                      <option value="">-- Sélectionner un type --</option>
                      {unusedOfferTypes.map((type) => {
                        const typeLabels: Record<string, string> = {
                          'BASE': 'Base',
                          'HC_HP': 'HC/HP',
                          'TEMPO': 'Tempo',
                          'EJP': 'EJP',
                          'ZEN_FLEX': 'Zen Flex',
                          'ZEN_WEEK_END': 'Zen Week-end',
                          'ZEN_WEEK_END_HP_HC': 'Zen Week-end HC/HP',
                          'SEASONAL': 'Saisonnier',
                          'BASE_WEEKEND': 'Base Week-end',
                          'HC_NUIT_WEEKEND': 'HC Nuit & Week-end',
                          'HC_WEEKEND': 'HC Week-end',
                        }
                        return (
                          <option key={type} value={type}>
                            {typeLabels[type] || type}
                          </option>
                        )
                      })}
                    </select>
                  ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Ce fournisseur possède déjà tous les types d'offres disponibles.
                    </p>
                  )}
                </div>

                {newOfferType && (
                  <p className="mt-3 text-sm text-green-700 dark:text-green-400">
                    Ajoutez les puissances et tarifs ci-dessous, puis soumettez votre contribution.
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Grille des types d'offres (tous les types en mode édition, existants sinon) */}
                {(isEditMode ? typeOrder.length > 0 : availableOfferTypes.length > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {(isEditMode ? typeOrder : availableOfferTypes).map((type) => {
                      const isSelected = filterOfferType === type
                      const typeCount = offersArray.filter(o => o.provider_id === filterProvider && o.offer_type === type).length
                      const isEmpty = typeCount === 0
                      const typeLabels: Record<string, string> = {
                        'BASE': 'Base',
                        'HC_HP': 'HC/HP',
                        'TEMPO': 'Tempo',
                        'EJP': 'EJP',
                        'ZEN_FLEX': 'Zen Flex',
                        'ZEN_WEEK_END': 'Zen Week-end',
                        'ZEN_WEEK_END_HP_HC': 'Zen Week-end HC/HP',
                        'SEASONAL': 'Saisonnier',
                        'BASE_WEEKEND': 'Base Week-end',
                        'HC_NUIT_WEEKEND': 'HC Nuit Week-end',
                        'HC_WEEKEND': 'HC Week-end',
                      }
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            setFilterOfferType(type)
                            // En mode édition, si le type est vide, créer directement un nouveau groupe
                            if (isEditMode && isEmpty) {
                              // Ajouter un nouveau groupe vide si aucun n'existe encore
                              if (newGroups.length === 0) {
                                setNewGroups([{ name: '', powers: [{ power: 0, fields: {} }] }])
                              }
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 w-full ${
                            isSelected
                              ? 'bg-primary-600 text-white shadow-md'
                              : isEmpty && isEditMode
                                ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-500 dark:hover:text-primary-400'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                          title={isEmpty && isEditMode ? `Cliquer pour créer des offres ${typeLabels[type] || type}` : undefined}
                        >
                          {isEmpty && isEditMode && <Plus size={12} className="shrink-0" />}
                          {typeLabels[type] || type}
                          <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                            isSelected
                              ? 'bg-primary-500 text-white'
                              : isEmpty
                                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                          }`}>
                            {typeCount}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* Bloc d'information sur le type d'offre sélectionné */}
      {filterOfferType && filterOfferType !== 'all' && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                {filterOfferType === 'BASE' && 'Offre Base — Tarif unique'}
                {filterOfferType === 'HC_HP' && 'Offre Heures Creuses / Heures Pleines'}
                {filterOfferType === 'TEMPO' && 'Offre Tempo — 6 tarifs selon le jour'}
                {filterOfferType === 'EJP' && 'Offre EJP — Effacement Jour de Pointe'}
                {filterOfferType === 'ZEN_WEEK_END' && 'Offre Zen Week-end — Tarif réduit le week-end'}
                {filterOfferType === 'ZEN_WEEK_END_HP_HC' && 'Offre Zen Week-end HC/HP'}
                {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC'].includes(filterOfferType) && `Offre ${filterOfferType}`}
              </h4>
              <div className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
                {filterOfferType === 'BASE' && (
                  <>
                    <p>Un seul prix du kWh, 24h/24, 7j/7, toute l'année.</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix Base (€/kWh)
                    </p>
                  </>
                )}
                {filterOfferType === 'HC_HP' && (
                  <>
                    <p>Deux prix différents selon l'heure :</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>Heures Creuses (HC)</strong> : 8h par jour (souvent la nuit entre 22h et 6h, parfois le midi). Prix réduit.</li>
                      <li><strong>Heures Pleines (HP)</strong> : les 16h restantes. Prix plus élevé.</li>
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix HC (€/kWh) + Prix HP (€/kWh)
                    </p>
                  </>
                )}
                {filterOfferType === 'TEMPO' && (
                  <>
                    <p>L'année est divisée en 3 types de jours, chacun avec ses tarifs HC/HP :</p>
                    <ul className="list-none ml-2 space-y-1">
                      <li><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2"></span><strong>Jours Bleus</strong> (300 jours/an) : tarif le plus avantageux</li>
                      <li><span className="inline-block w-3 h-3 rounded-full bg-gray-400 mr-2"></span><strong>Jours Blancs</strong> (43 jours/an) : tarif intermédiaire</li>
                      <li><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span><strong>Jours Rouges</strong> (22 jours/an) : tarif très élevé (hiver uniquement)</li>
                    </ul>
                    <p className="mt-1">La couleur du lendemain est annoncée la veille à 17h.</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + 6 prix (Bleu HC, Bleu HP, Blanc HC, Blanc HP, Rouge HC, Rouge HP)
                    </p>
                  </>
                )}
                {filterOfferType === 'EJP' && (
                  <>
                    <p>Offre historique (non commercialisée depuis 1998) avec 2 périodes :</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>Jours Normaux</strong> (343 jours/an) : tarif avantageux</li>
                      <li><strong>Jours de Pointe</strong> (22 jours/an, hiver) : tarif très élevé. Prévenus la veille à 17h.</li>
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + Prix Normal (€/kWh) + Prix Pointe (€/kWh)
                    </p>
                  </>
                )}
                {filterOfferType === 'ZEN_WEEK_END' && (
                  <>
                    <p>Tarif réduit pendant tout le week-end (samedi et dimanche), tarif normal en semaine.</p>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + Prix Semaine (€/kWh) + Prix Week-end (€/kWh)
                    </p>
                  </>
                )}
                {filterOfferType === 'ZEN_WEEK_END_HP_HC' && (
                  <>
                    <p>Combine les avantages HC/HP avec des tarifs week-end réduits :</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>Semaine</strong> : tarifs HC/HP classiques</li>
                      <li><span className="text-green-600 dark:text-green-400 font-semibold">Week-end</span> : tarifs HC/HP réduits (samedi et dimanche)</li>
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + HC Semaine + HP Semaine + HC Week-end + HP Week-end
                    </p>
                  </>
                )}
                {(filterOfferType === 'ZEN_FLEX' || filterOfferType === 'SEASONAL') && (
                  <>
                    <p>Tarification saisonnière avec des prix différents selon la période :</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><span className="text-orange-600 dark:text-orange-400 font-semibold">Été</span> (avril à octobre) : tarifs HC/HP avantageux</li>
                      <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Hiver</span> (novembre à mars) : tarifs HC/HP plus élevés</li>
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + HC Été + HP Été + HC Hiver + HP Hiver (€/kWh)
                    </p>
                  </>
                )}
                {(filterOfferType === 'HC_WEEKEND' || filterOfferType === 'HC_NUIT_WEEKEND') && (
                  <>
                    <p>Tarifs HC/HP avec avantage week-end :</p>
                    <ul className="list-disc list-inside ml-2 space-y-1">
                      <li><strong>Semaine</strong> : tarifs HC/HP classiques</li>
                      <li><span className="text-green-600 dark:text-green-400 font-semibold">Week-end</span> : tarifs HC/HP réduits (samedi et dimanche)</li>
                      {filterOfferType === 'HC_NUIT_WEEKEND' && <li><strong>Nuit</strong> : heures creuses étendues la nuit</li>}
                    </ul>
                    <p className="text-xs text-blue-600 dark:text-blue-500">
                      <strong>Tarifs à renseigner :</strong> Abonnement + HC Semaine + HP Semaine + HC Week-end + HP Week-end
                    </p>
                  </>
                )}
                {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC', 'ZEN_FLEX', 'SEASONAL', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType) && (
                  <>
                    <p>Offre avec tarification spécifique détectée depuis les offres existantes.</p>
                    {dynamicPriceFields.length > 0 && (
                      <p className="text-xs text-blue-600 dark:text-blue-500">
                        <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + {dynamicPriceFields.map(f => f.label).join(' + ')} (€/kWh)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode ajout de nouveau fournisseur ou nouvelle offre : afficher uniquement la zone d'ajout de puissances */}
      {(isAddingProvider || (isAddingOffer && newOfferType)) ? (
        <div className="space-y-6">
          {/* Lignes des nouvelles puissances pour le nouveau fournisseur */}
          {newPowersData.map((newPower, index) => {
            const isDuplicate = newPowersData.filter((p, i) => i !== index && p.power === newPower.power && p.power > 0).length > 0
            const isIncomplete = !newPower.power || newPower.power <= 0 || !newPower.fields.subscription_price
            const hasError = isDuplicate || isIncomplete
            return (
              <div
                key={`new-provider-power-${index}`}
                className={`rounded-lg p-3 border transition-all ${
                  isDuplicate
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                    : isIncomplete
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                      : 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  {/* Label */}
                  <div className="w-48 shrink-0">
                    <div className="flex items-center gap-2">
                      <Plus size={16} className={hasError ? (isDuplicate ? 'text-red-600' : 'text-amber-600') : 'text-green-600'} />
                      <span className={`font-medium text-sm ${hasError ? (isDuplicate ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300') : 'text-green-700 dark:text-green-300'}`}>
                        Nouvelle puissance
                      </span>
                      {isDuplicate && <span className="text-xs text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Doublon</span>}
                    </div>
                  </div>

                  {/* Puissance */}
                  <div className="w-20 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={newPower.power || ''}
                      onChange={(e) => {
                        const power = e.target.value ? parseInt(e.target.value) : 0
                        setNewPowersData(prev => prev.map((p, i) => i === index ? { ...p, power } : p))
                      }}
                      placeholder="kVA"
                      className={`w-full px-2 py-1.5 text-sm font-medium text-center border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                        !newPower.power || newPower.power <= 0 || isDuplicate
                          ? 'border-red-400 focus:ring-red-500'
                          : 'border-green-300 focus:ring-green-500'
                      }`}
                    />
                  </div>

                  {/* Abonnement */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Abo.</span>
                    <input
                      type="number"
                      step="0.01"
                      value={newPower.fields.subscription_price ?? ''}
                      onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                        i === index ? { ...p, fields: { ...p.fields, subscription_price: e.target.value } } : p
                      ))}
                      placeholder="€/mois"
                      className={`w-24 px-2 py-1.5 text-sm border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                        !newPower.fields.subscription_price
                          ? 'border-amber-400 focus:ring-amber-500'
                          : 'border-green-300 focus:ring-green-500'
                      }`}
                    />
                  </div>

                  {/* Tarifs selon le type */}
                  {newProviderOfferType === 'BASE' && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Base</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={newPower.fields.base_price ?? ''}
                        onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                          i === index ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p
                        ))}
                        placeholder="€/kWh"
                        className="w-24 px-2 py-1.5 text-sm border-2 border-green-300 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-green-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {newProviderOfferType === 'HC_HP' && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-blue-600">HC</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={newPower.fields.hc_price ?? ''}
                          onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                            i === index ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p
                          ))}
                          placeholder="€/kWh"
                          className="w-24 px-2 py-1.5 text-sm border-2 border-green-300 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-green-500 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-red-600">HP</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={newPower.fields.hp_price ?? ''}
                          onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                            i === index ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p
                          ))}
                          placeholder="€/kWh"
                          className="w-24 px-2 py-1.5 text-sm border-2 border-green-300 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-green-500 focus:outline-none"
                        />
                      </div>
                    </>
                  )}

                  {(newProviderOfferType !== 'BASE' && newProviderOfferType !== 'HC_HP') && (
                    <span className="text-sm text-gray-500 italic">Tarifs spécifiques après validation</span>
                  )}

                  {/* Bouton supprimer */}
                  <button
                    onClick={() => setNewPowersData(prev => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors ml-auto"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Bouton ajouter une puissance */}
          <button
            onClick={() => setNewPowersData(prev => [...prev, { power: 0, fields: {} }])}
            className="w-full rounded-lg p-3 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            <span className="font-medium text-sm">Ajouter une puissance</span>
          </button>

          {/* Récapitulatif et soumission pour nouveau fournisseur ou nouvelle offre */}
          {newPowersData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Send size={18} className="text-primary-600 dark:text-primary-400" />
                Récapitulatif - {isAddingProvider ? 'Nouveau fournisseur' : 'Nouvelle offre'}
              </h4>

              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  {isAddingProvider ? (
                    <>
                      <strong>{newProviderName || '(Nom à renseigner)'}</strong> - {(() => {
                        const labels: Record<string, string> = { 'BASE': 'Base', 'HC_HP': 'HC/HP', 'TEMPO': 'Tempo', 'EJP': 'EJP', 'ZEN_FLEX': 'Zen Flex', 'ZEN_WEEK_END': 'Zen Week-end', 'SEASONAL': 'Saisonnier' }
                        return labels[newProviderOfferType] || newProviderOfferType
                      })()} - {newPowersData.length} puissance(s)
                    </>
                  ) : (
                    <>
                      <strong>{sortedProviders.find(p => p.id === filterProvider)?.name}</strong> - {(() => {
                        const labels: Record<string, string> = { 'BASE': 'Base', 'HC_HP': 'HC/HP', 'TEMPO': 'Tempo', 'EJP': 'EJP', 'ZEN_FLEX': 'Zen Flex', 'ZEN_WEEK_END': 'Zen Week-end', 'SEASONAL': 'Saisonnier' }
                        return labels[newOfferType] || newOfferType
                      })()} (nouvelle offre) - {newPowersData.length} puissance(s)
                    </>
                  )}
                </p>
              </div>

              {/* Champ lien fiche tarifaire */}
              <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  <Link size={16} />
                  Lien vers la fiche tarifaire officielle
                  {!isPrivilegedUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="url"
                  value={priceSheetUrl}
                  onChange={(e) => setPriceSheetUrl(e.target.value)}
                  placeholder="https://www.fournisseur.fr/grille-tarifaire.pdf"
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              {/* Validation pour nouveau fournisseur */}
              {isAddingProvider && !newProviderName.trim() && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Veuillez renseigner le nom du fournisseur.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (isAddingProvider) {
                      setIsAddingProvider(false)
                      setNewProviderName('')
                      setNewProviderOfferType('')
                      const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
                      if (edf) setFilterProvider(edf.id)
                      else if (sortedProviders.length > 0) setFilterProvider(sortedProviders[0].id)
                    } else {
                      setIsAddingOffer(false)
                      setNewOfferType('')
                    }
                    setNewPowersData([])
                    setPriceSheetUrl('')
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    if (isAddingProvider && !newProviderName.trim()) {
                      toast.error('Veuillez renseigner le nom du fournisseur')
                      return
                    }
                    if (newPowersData.length === 0) {
                      toast.error('Ajoutez au moins une puissance')
                      return
                    }
                    if (!isPrivilegedUser && !priceSheetUrl) {
                      toast.error('Veuillez fournir le lien vers la fiche tarifaire')
                      return
                    }

                    setSubmittingOffers(true)
                    let successCount = 0
                    let errorCount = 0

                    const providerName = isAddingProvider ? newProviderName.trim() : sortedProviders.find(p => p.id === filterProvider)?.name || ''
                    const offerType = isAddingProvider ? newProviderOfferType : newOfferType

                    for (const newPower of newPowersData) {
                      try {
                        const contributionData: ContributionData = {
                          contribution_type: isAddingProvider ? 'NEW_PROVIDER' : 'NEW_OFFER',
                          ...(isAddingProvider ? { provider_name: providerName } : { existing_provider_id: filterProvider }),
                          offer_name: `${providerName} - ${offerType} - ${newPower.power} kVA`,
                          offer_type: offerType,
                          power_kva: newPower.power,
                          pricing_data: {
                            subscription_price: newPower.fields.subscription_price ? parseFloat(newPower.fields.subscription_price) : undefined,
                            base_price: newPower.fields.base_price ? parseFloat(newPower.fields.base_price) : undefined,
                            hc_price: newPower.fields.hc_price ? parseFloat(newPower.fields.hc_price) : undefined,
                            hp_price: newPower.fields.hp_price ? parseFloat(newPower.fields.hp_price) : undefined,
                          },
                          price_sheet_url: priceSheetUrl,
                          valid_from: new Date().toISOString().split('T')[0],
                        }
                        const response = await energyApi.submitContribution(contributionData)
                        if (response.success) successCount++
                        else errorCount++
                      } catch {
                        errorCount++
                      }
                    }

                    if (successCount > 0) {
                      toast.success(`${successCount} contribution(s) soumise(s) pour ${providerName}`)
                      queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
                      queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
                      queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
                      if (isAddingProvider) {
                        setIsAddingProvider(false)
                        setNewProviderName('')
                        setNewProviderOfferType('')
                        const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
                        if (edf) setFilterProvider(edf.id)
                        else if (sortedProviders.length > 0) setFilterProvider(sortedProviders[0].id)
                      } else {
                        setIsAddingOffer(false)
                        setNewOfferType('')
                      }
                      setNewPowersData([])
                      setPriceSheetUrl('')
                    }
                    if (errorCount > 0) {
                      toast.error(`${errorCount} erreur(s) lors de l'envoi`)
                    }
                    setSubmittingOffers(false)
                  }}
                  disabled={submittingOffers || (isAddingProvider && !newProviderName.trim()) || newPowersData.length === 0 || (!isPrivilegedUser && !priceSheetUrl)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send size={18} />
                  {submittingOffers ? 'Envoi...' : 'Soumettre'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (!filterProvider || filterOfferType === 'all') ? (
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
      ) : offersArray.length > 0 && providerOffers.length === 0 ? (
        isEditMode ? (
          // En mode édition avec type vide : afficher directement les groupes ou un message si aucun groupe
          <div className="space-y-6">
            {/* Message uniquement si aucun groupe n'existe encore */}
            {newGroups.length === 0 && (
              <div className="text-center py-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700">
                <Package size={32} className="mx-auto mb-3 text-blue-500" />
                <p className="text-lg font-medium text-blue-700 dark:text-blue-300 mb-2">
                  Aucune offre {filterOfferType} pour ce fournisseur
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
                  Créez un nouveau groupe d'offres pour proposer des tarifs
                </p>
                <button
                  onClick={() => setNewGroups(prev => [...prev, { name: '', powers: [{ power: 0, fields: {} }] }])}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
                >
                  <Package size={18} />
                  <Plus size={14} className="-ml-1" />
                  <span>Créer un nouveau groupe d'offres</span>
                </button>
              </div>
            )}

            {/* Afficher les nouveaux groupes - design bleu cohérent avec le contexte "type vide" */}
            {newGroups.map((group, groupIndex) => (
              <div key={`new-group-empty-${groupIndex}`} className="space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-dashed border-blue-400 dark:border-blue-600">
                {/* En-tête du nouveau groupe */}
                <div className="flex items-center gap-3 pb-2 border-b border-blue-300 dark:border-blue-700">
                  <Plus size={16} className="text-blue-600 dark:text-blue-400" />
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, name: e.target.value } : g))}
                    placeholder="Nom de l'offre (ex: Vert Fixe, Stable...)"
                    className="flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">Nouveau groupe</span>
                  <button
                    onClick={() => setNewGroups(prev => prev.filter((_, i) => i !== groupIndex))}
                    className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Supprimer ce groupe"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Puissances du nouveau groupe */}
                {group.powers.map((power, powerIndex) => {
                  const isIncomplete = !power.power || power.power <= 0 || !power.fields.subscription_price
                  return (
                    <div
                      key={`new-group-empty-${groupIndex}-power-${powerIndex}`}
                      className={`rounded-lg p-3 border transition-all ${
                        isIncomplete
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                          : 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Puissance - input numérique au lieu de select */}
                        <div className="w-20 shrink-0">
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={power.power || ''}
                            onChange={(e) => {
                              const newPower = e.target.value ? parseInt(e.target.value) : 0
                              setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                ...g,
                                powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, power: newPower } : p)
                              } : g))
                            }}
                            placeholder="kVA"
                            className={`w-full px-2 py-1 text-sm font-medium text-center border rounded bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                              !power.power || power.power <= 0
                                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                                : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
                            }`}
                          />
                        </div>

                        {/* Abonnement */}
                        <div className="flex items-center gap-2 w-[200px]">
                          <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Abo.<span className="text-red-500">*</span></span>
                          <input
                            type="number"
                            step="0.01"
                            value={power.fields.subscription_price ?? ''}
                            onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                              ...g,
                              powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, subscription_price: e.target.value } } : p)
                            } : g))}
                            placeholder="0.00"
                            className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                              !power.fields.subscription_price
                                ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                                : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
                            }`}
                          />
                          <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/mois</span>
                        </div>

                        {/* Tarifs selon le type d'offre */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">
                          {filterOfferType === 'BASE' && (
                            <div className="flex items-center gap-2 w-[200px]">
                              <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Base<span className="text-red-500">*</span></span>
                              <input
                                type="number"
                                step="0.0001"
                                value={power.fields.base_price ?? ''}
                                onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                  ...g,
                                  powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p)
                                } : g))}
                                placeholder="0.0000"
                                className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                            </div>
                          )}

                          {filterOfferType === 'HC_HP' && (
                            <>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-10 shrink-0 text-right text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={power.fields.hc_price ?? ''}
                                  onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                    ...g,
                                    powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p)
                                  } : g))}
                                  placeholder="0.0000"
                                  className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-10 shrink-0 text-right text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={power.fields.hp_price ?? ''}
                                  onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                    ...g,
                                    powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p)
                                  } : g))}
                                  placeholder="0.0000"
                                  className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                              </div>
                            </>
                          )}

                          {filterOfferType === 'TEMPO' && (
                            <>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-blue-600 dark:text-blue-400">Bleu HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_blue_hc ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_blue_hc: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-blue-600 dark:text-blue-400">Bleu HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_blue_hp ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_blue_hp: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-gray-600 dark:text-gray-400">Blanc HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_white_hc ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_white_hc: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-gray-600 dark:text-gray-400">Blanc HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_white_hp ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_white_hp: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-red-600 dark:text-red-400">Rouge HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_red_hc ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_red_hc: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-red-600 dark:text-red-400">Rouge HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.tempo_red_hp ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, tempo_red_hp: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              </div>
                            </>
                          )}

                          {filterOfferType === 'EJP' && (
                            <>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-14 shrink-0 text-right text-green-600 dark:text-green-400">Normal<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.ejp_normal ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, ejp_normal: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                              </div>
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-14 shrink-0 text-right text-red-600 dark:text-red-400">Pointe<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.ejp_peak ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, ejp_peak: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                              </div>
                            </>
                          )}

                          {(filterOfferType === 'ZEN_FLEX' || filterOfferType === 'SEASONAL') && (
                            <>
                              {/* Ligne Été */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-14">Été</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price_summer ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_summer: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price_summer ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_summer: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                              {/* Ligne Hiver */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 w-14">Hiver</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price_winter ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_winter: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price_winter ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_winter: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                            </>
                          )}

                          {filterOfferType === 'ZEN_WEEK_END' && (
                            <>
                              {/* Tarif semaine */}
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-gray-600 dark:text-gray-400">Semaine<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.base_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€/kWh</span>
                              </div>
                              {/* Tarif week-end */}
                              <div className="flex items-center gap-2 w-[200px]">
                                <span className="text-sm font-semibold w-16 shrink-0 text-right text-green-600 dark:text-green-400">Week-end<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.base_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€/kWh</span>
                              </div>
                            </>
                          )}

                          {filterOfferType === 'ZEN_WEEK_END_HP_HC' && (
                            <>
                              {/* Ligne Semaine */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 w-16">Semaine</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                              {/* Ligne Week-end */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-16">Week-end</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                            </>
                          )}

                          {(filterOfferType === 'HC_WEEKEND' || filterOfferType === 'HC_NUIT_WEEKEND') && (
                            <>
                              {/* Ligne Semaine */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 w-16">Semaine</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                              {/* Ligne Week-end */}
                              <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                                <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-16">Week-end</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hc_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                  <input type="number" step="0.0001" value={power.fields.hp_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Champs dynamiques pour les types non standard (détectés depuis les offres existantes) */}
                          {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'SEASONAL', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType) && dynamicPriceFields.map(field => (
                            <div key={field.key} className="flex items-center gap-2 w-[200px]">
                              <span className={`text-sm font-semibold w-16 shrink-0 text-right ${field.color || 'text-gray-600 dark:text-gray-400'}`}>
                                {field.label}<span className="text-red-500">*</span>
                              </span>
                              <input
                                type="number"
                                step="0.0001"
                                value={power.fields[field.key] ?? ''}
                                onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                  ...g,
                                  powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, [field.key]: e.target.value } } : p)
                                } : g))}
                                placeholder="0.0000"
                                className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                            </div>
                          ))}
                        </div>

                        {/* Bouton supprimer la puissance */}
                        <button
                          onClick={() => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                            ...g,
                            powers: g.powers.filter((_, pi) => pi !== powerIndex)
                          } : g))}
                          className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          title="Supprimer cette puissance"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Bouton ajouter une puissance au nouveau groupe */}
                <button
                  onClick={() => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: [...g.powers, { power: 0, fields: {} }] } : g))}
                  className="w-full bg-primary-50 dark:bg-primary-900/30 rounded-lg p-3 border-2 border-primary-400 dark:border-primary-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Plus size={18} className="text-primary-600 dark:text-primary-400" />
                  <span className="font-semibold text-sm text-primary-700 dark:text-primary-300">Ajouter une puissance à ce groupe</span>
                </button>
              </div>
            ))}

            {/* Bouton pour créer un autre groupe d'offres */}
            {newGroups.length > 0 && (
              <button
                onClick={() => setNewGroups(prev => [...prev, { name: '', powers: [{ power: 0, fields: {} }] }])}
                className="w-full bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all flex items-center justify-center gap-2"
              >
                <Package size={18} className="text-blue-600 dark:text-blue-400" />
                <Plus size={14} className="text-blue-600 dark:text-blue-400 -ml-1" />
                <span className="font-medium text-sm text-blue-700 dark:text-blue-300">Créer un autre groupe d'offres</span>
              </button>
            )}

            {/* Récapitulatif et bouton de soumission pour les nouveaux groupes */}
            {newGroups.length > 0 && (
              <div className="mt-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Send size={18} className="text-primary-600 dark:text-primary-400" />
                    Récapitulatif des modifications
                  </h4>
                  <div className="mb-4">
                    <div className="space-y-4">
                      {/* Nouveaux groupes d'offres */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                        <div className="font-medium text-blue-800 dark:text-blue-300 mb-3 pb-2 border-b border-blue-200 dark:border-blue-700 flex items-center gap-2">
                          <Package size={16} />
                          <span>Nouveaux groupes d'offres ({newGroups.length})</span>
                        </div>
                        <div className="space-y-3">
                          {newGroups.map((group, index) => (
                            <div key={`recap-empty-group-${index}`} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                              <div className="font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                                <Plus size={14} />
                                {group.name || <span className="italic text-gray-400">Nom non défini</span>}
                              </div>
                              <div className="space-y-1">
                                {group.powers.map((power, powerIndex) => (
                                  <div key={`recap-empty-group-${index}-power-${powerIndex}`} className="text-xs flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded px-2 py-1">
                                    <span className="text-blue-600 dark:text-blue-400">
                                      {power.power || '?'} kVA
                                    </span>
                                    <span className="text-blue-700 dark:text-blue-300 font-medium">
                                      {power.fields.subscription_price ? `${power.fields.subscription_price} €/mois` : '-'}
                                      {power.fields.base_price && ` • Base: ${power.fields.base_price} €/kWh`}
                                      {power.fields.hc_price && ` • HC: ${power.fields.hc_price}`}
                                      {power.fields.hp_price && ` • HP: ${power.fields.hp_price}`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Champ lien vers la fiche tarifaire */}
                  <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <label className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                      <Link size={16} />
                      Lien vers la fiche tarifaire officielle
                      {!isPrivilegedUser && <span className="text-red-500">*</span>}
                      {isPrivilegedUser && <span className="text-gray-500 text-xs font-normal">(optionnel)</span>}
                    </label>
                    <input
                      type="url"
                      value={priceSheetUrl}
                      onChange={(e) => setPriceSheetUrl(e.target.value)}
                      placeholder="https://exemple.fr/grille-tarifaire.pdf"
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    {!isPrivilegedUser && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Ce lien permet de vérifier les tarifs proposés. Il doit pointer vers un document officiel du fournisseur.
                      </p>
                    )}
                  </div>

                  {/* Messages d'erreur */}
                  {hasGroupDuplicatePowers && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-300">
                      <AlertCircle size={18} />
                      <span className="text-sm">Certains groupes contiennent des puissances en doublon.</span>
                    </div>
                  )}
                  {hasIncompleteGroups && !hasGroupDuplicatePowers && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <AlertCircle size={18} />
                      <span className="text-sm">Veuillez remplir tous les champs obligatoires (nom du groupe, puissance, abonnement et tarifs).</span>
                    </div>
                  )}

                  {/* Message d'erreur si formulaire incomplet */}
                  {(hasIncompleteGroups || hasGroupDuplicatePowers) && (
                    <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
                      <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <AlertCircle size={16} />
                        {hasIncompleteGroups && 'Veuillez remplir tous les champs obligatoires (nom, kVA, abonnement, tarifs).'}
                        {!hasIncompleteGroups && hasGroupDuplicatePowers && 'Des puissances en doublon ont été détectées dans un groupe.'}
                      </p>
                    </div>
                  )}

                  {/* Bouton de soumission */}
                  <button
                    onClick={submitAllModifications}
                    disabled={submittingOffers || (!isPrivilegedUser && !priceSheetUrl) || hasIncompleteGroups || hasGroupDuplicatePowers}
                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <Send size={18} />
                    {submittingOffers ? 'Envoi en cours...' : 'Soumettre les contributions'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Aucune offre ne correspond aux filtres sélectionnés.
          </div>
        )
      ) : providerOffers.length > 0 ? (
        <div className="space-y-6">
          {/* Liste des offres éditables - Regroupées par nom */}
          {groupNames.map((groupName) => {
            const offersInGroup = groupedOffers[groupName]
            const editedName = editedOfferNames[groupName]
            const isNameModified = editedName !== undefined && editedName !== groupName

            return (
              <div key={groupName} className="space-y-2">
                {/* En-tête du groupe avec nom éditable */}
                <div className="flex items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                  {isEditMode ? (
                    <input
                      type="text"
                      value={editedName ?? groupName}
                      onChange={(e) => setEditedOfferNames(prev => ({ ...prev, [groupName]: e.target.value }))}
                      className={`flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                        isNameModified
                          ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      }`}
                      placeholder="Nom de l'offre"
                    />
                  ) : (
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{groupName}</h4>
                  )}
                  {isNameModified && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Nom modifié</span>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">{offersInGroup.length} puissance(s)</span>
                </div>

                {/* Offres du groupe */}
                {offersInGroup.map((offer) => {
                  const modified = isOfferModified(offer)
                  const power = getPower(offer.name)
                  const powerNum = power ? parseInt(power) : null
                  const isMarkedForRemoval = powerNum !== null && powersToRemove.includes(powerNum)

                  return (
                    <div
                      key={offer.id}
                      className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border transition-all ${
                        isMarkedForRemoval
                          ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 opacity-60'
                          : modified
                            ? 'border-amber-400 dark:border-amber-600'
                            : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Layout CSS Grid adaptatif selon le type d'offre */}
                      {(() => {
                        const cols = getTariffColumns(offer.offer_type)
                        // Grille: [Puissance] [Abo] [Tarif1] [Tarif2?] [Delete?]
                        const gridCols = `70px 1fr ${Array(cols).fill('1fr').join(' ')} ${isEditMode ? '40px' : ''}`

                        return (
                          <div
                            className="grid items-center gap-x-2 gap-y-1"
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            {/* Col 1: Puissance */}
                            <div className="flex flex-col items-start gap-1">
                              <span className={`text-sm font-medium px-2 py-1 rounded ${isMarkedForRemoval ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 line-through' : 'text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700'}`}>
                                {power || '-'}
                              </span>
                              {isMarkedForRemoval && (
                                <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">À suppr.</span>
                              )}
                              {modified && !isMarkedForRemoval && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Modifié</span>
                              )}
                            </div>

                            {/* Col 2: Abonnement */}
                            {renderEditableField('Abo.', 'subscription_price', '€/mois', offer)}

                            {/* Colonnes Tarifs - adaptées au type */}
                            {offer.offer_type === 'BASE' && (
                              renderEditableField('Base', 'base_price', '€/kWh', offer)
                            )}

                            {offer.offer_type === 'BASE_WEEKEND' && (
                              <>
                                {renderEditableField('Base', 'base_price', '€/kWh', offer)}
                                {renderEditableField('WE', 'base_price_weekend', '€/kWh', offer)}
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
                              </>
                            )}

                            {offer.offer_type === 'TEMPO' && (
                              <>
                                {renderEditableField('HC Bleu', 'tempo_blue_hc', '€/kWh', offer)}
                                {renderEditableField('HP Bleu', 'tempo_blue_hp', '€/kWh', offer)}
                              </>
                            )}

                            {(offer.offer_type === 'ZEN_FLEX' || offer.offer_type === 'SEASONAL') && (
                              <>
                                {renderEditableField('HC Été', 'hc_price_summer', '€/kWh', offer)}
                                {renderEditableField('HP Été', 'hp_price_summer', '€/kWh', offer)}
                              </>
                            )}

                            {(offer.offer_type === 'ZEN_WEEK_END' || offer.offer_type === 'ZEN_WEEK_END_HP_HC') && (
                              <>
                                {renderEditableField('HC', 'hc_price', '€/kWh', offer)}
                                {renderEditableField('HP', 'hp_price', '€/kWh', offer)}
                              </>
                            )}

                            {offer.offer_type === 'EJP' && (
                              <>
                                {renderEditableField('Normal', 'ejp_normal', '€/kWh', offer)}
                                {renderEditableField('Pointe', 'ejp_peak', '€/kWh', offer)}
                              </>
                            )}

                            {/* Col Delete - uniquement en mode édition (première ligne) */}
                            {isEditMode && powerNum !== null && (
                              <div className="flex justify-center">
                                {isMarkedForRemoval ? (
                                  <button
                                    onClick={() => setPowersToRemove(prev => prev.filter(p => p !== powerNum))}
                                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Annuler la suppression"
                                  >
                                    <Undo2 size={16} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (!powersToRemove.includes(powerNum)) {
                                        setPowersToRemove(prev => [...prev, powerNum])
                                      }
                                    }}
                                    className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="Proposer la suppression de cette puissance"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Lignes supplémentaires pour types multi-lignes */}
                            {/* TEMPO: Blancs et Rouges */}
                            {offer.offer_type === 'TEMPO' && (
                              <>
                                <div></div>
                                <div></div>
                                {renderEditableField('HC Blanc', 'tempo_white_hc', '€/kWh', offer)}
                                {renderEditableField('HP Blanc', 'tempo_white_hp', '€/kWh', offer)}
                                {isEditMode && <div></div>}

                                <div></div>
                                <div></div>
                                {renderEditableField('HC Rouge', 'tempo_red_hc', '€/kWh', offer)}
                                {renderEditableField('HP Rouge', 'tempo_red_hp', '€/kWh', offer)}
                                {isEditMode && <div></div>}
                              </>
                            )}

                            {/* ZEN_FLEX/SEASONAL: Hiver */}
                            {(offer.offer_type === 'ZEN_FLEX' || offer.offer_type === 'SEASONAL') && (
                              <>
                                <div></div>
                                <div></div>
                                {renderEditableField('HC Hiver', 'hc_price_winter', '€/kWh', offer)}
                                {renderEditableField('HP Hiver', 'hp_price_winter', '€/kWh', offer)}
                                {isEditMode && <div></div>}
                              </>
                            )}

                            {/* HC_WEEKEND/HC_NUIT_WEEKEND: Week-end */}
                            {(offer.offer_type === 'HC_WEEKEND' || offer.offer_type === 'HC_NUIT_WEEKEND') && (
                              <>
                                <div></div>
                                <div></div>
                                {renderEditableField('HC WE', 'hc_price_weekend', '€/kWh', offer)}
                                {renderEditableField('HP WE', 'hp_price_weekend', '€/kWh', offer)}
                                {isEditMode && <div></div>}
                              </>
                            )}

                            {/* ZEN_WEEK_END/ZEN_WEEK_END_HP_HC: Week-end */}
                            {(offer.offer_type === 'ZEN_WEEK_END' || offer.offer_type === 'ZEN_WEEK_END_HP_HC') && (
                              <>
                                <div></div>
                                <div></div>
                                {renderEditableField('HC WE', 'hc_price_weekend', '€/kWh', offer)}
                                {renderEditableField('HP WE', 'hp_price_weekend', '€/kWh', offer)}
                                {isEditMode && <div></div>}
                              </>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Lignes des nouvelles puissances ajoutées (uniquement en mode édition) */}
          {isEditMode && newPowersData.map((newPower, index) => {
            const isDuplicate = isPowerAlreadyUsed(newPower.power, index)
            const isIncomplete = !isNewPowerComplete(newPower)
            const hasError = isDuplicate || isIncomplete
            return (
            <div
              key={`new-power-${index}`}
              className={`rounded-lg p-3 border transition-all ${
                isDuplicate
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                  : isIncomplete
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
              }`}
            >
              <div className="flex flex-wrap items-center gap-4">
                {/* Nom de l'offre */}
                <div className="w-64 shrink-0">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className={hasError ? (isDuplicate ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400') : 'text-green-600 dark:text-green-400'} />
                    <h4 className={`font-medium text-sm ${hasError ? (isDuplicate ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300') : 'text-green-700 dark:text-green-300'}`}>Nouvelle puissance</h4>
                    {isDuplicate ? (
                      <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded shrink-0">Existe déjà</span>
                    ) : isIncomplete ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded shrink-0">Incomplet</span>
                    ) : (
                      <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded shrink-0">Nouveau</span>
                    )}
                  </div>
                </div>

                {/* Puissance */}
                <div className="w-16 text-center shrink-0">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newPower.power}
                    onChange={(e) => {
                      const power = e.target.value ? parseInt(e.target.value) : 0
                      setNewPowersData(prev => prev.map((p, i) => i === index ? { ...p, power } : p))
                    }}
                    className={`w-full px-2 py-1 text-xs font-medium text-center border rounded bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                      isDuplicate || !newPower.power || newPower.power <= 0
                        ? 'border-red-400 dark:border-red-600 focus:ring-red-500'
                        : 'border-green-300 dark:border-green-600 focus:ring-green-500'
                    }`}
                  />
                </div>

                {/* Abonnement (obligatoire) */}
                <div className="shrink-0">
                  <div className="flex items-center gap-2 w-[200px]">
                    <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Abo.<span className="text-red-500">*</span></span>
                    <input
                      type="number"
                      step="0.01"
                      value={newPower.fields.subscription_price ?? ''}
                      onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                        i === index ? { ...p, fields: { ...p.fields, subscription_price: e.target.value } } : p
                      ))}
                      placeholder="0.00"
                      className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                        !newPower.fields.subscription_price || newPower.fields.subscription_price === ''
                          ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                          : 'border-green-300 dark:border-green-600 focus:ring-green-500'
                      }`}
                    />
                    <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/mois</span>
                  </div>
                </div>

                {/* Tarifs selon le type d'offre */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">
                  {filterOfferType === 'BASE' && (
                    <div className="flex items-center gap-2 w-[200px]">
                      <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Base<span className="text-red-500">*</span></span>
                      <input
                        type="number"
                        step="0.0001"
                        value={newPower.fields.base_price ?? ''}
                        onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                          i === index ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p
                        ))}
                        placeholder="0.0000"
                        className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                          !newPower.fields.base_price || newPower.fields.base_price === ''
                            ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                            : 'border-green-300 dark:border-green-600 focus:ring-green-500'
                        }`}
                      />
                      <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                    </div>
                  )}

                  {filterOfferType === 'HC_HP' && (
                    <>
                      <div className="flex items-center gap-2 w-[200px]">
                        <span className="text-sm font-semibold w-10 shrink-0 text-right text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                        <input
                          type="number"
                          step="0.0001"
                          value={newPower.fields.hc_price ?? ''}
                          onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                            i === index ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p
                          ))}
                          placeholder="0.0000"
                          className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            !newPower.fields.hc_price || newPower.fields.hc_price === ''
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-green-300 dark:border-green-600 focus:ring-green-500'
                          }`}
                        />
                        <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                      </div>
                      <div className="flex items-center gap-2 w-[200px]">
                        <span className="text-sm font-semibold w-10 shrink-0 text-right text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                        <input
                          type="number"
                          step="0.0001"
                          value={newPower.fields.hp_price ?? ''}
                          onChange={(e) => setNewPowersData(prev => prev.map((p, i) =>
                            i === index ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p
                          ))}
                          placeholder="0.0000"
                          className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            !newPower.fields.hp_price || newPower.fields.hp_price === ''
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-green-300 dark:border-green-600 focus:ring-green-500'
                          }`}
                        />
                        <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                      </div>
                    </>
                  )}

                  {filterOfferType === 'TEMPO' && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Tarifs Tempo à renseigner après validation
                    </div>
                  )}

                  {(filterOfferType === 'ZEN_WEEK_END' || filterOfferType === 'ZEN_WEEK_END_HP_HC' || filterOfferType === 'ZEN_FLEX' || filterOfferType === 'SEASONAL' || filterOfferType === 'EJP') && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Tarifs spécifiques à renseigner après validation
                    </div>
                  )}
                </div>

                {/* Bouton supprimer */}
                <div className="shrink-0">
                  <button
                    onClick={() => setNewPowersData(prev => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    title="Supprimer cette puissance"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          )})}


          {/* Bouton pour ajouter une nouvelle puissance au groupe existant (uniquement en mode édition et si des offres existent) */}
          {isEditMode && groupNames.length > 0 && (
            <button
              onClick={() => setNewPowersData(prev => [...prev, { power: 0, fields: {} }])}
              className="w-full rounded-lg p-3 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              <span className="font-medium text-sm">Ajouter une puissance</span>
            </button>
          )}

          {/* Nouveaux groupes d'offres (uniquement en mode édition) */}
          {isEditMode && newGroups.map((group, groupIndex) => (
            <div key={`new-group-${groupIndex}`} className="space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-dashed border-blue-400 dark:border-blue-600">
              {/* En-tête du nouveau groupe */}
              <div className="flex items-center gap-3 pb-2 border-b border-blue-300 dark:border-blue-700">
                <Plus size={16} className="text-blue-600 dark:text-blue-400" />
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, name: e.target.value } : g))}
                  placeholder="Nom de l'offre (ex: Vert Fixe, Stable...)"
                  className="flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">Nouveau groupe</span>
                <button
                  onClick={() => setNewGroups(prev => prev.filter((_, i) => i !== groupIndex))}
                  className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Supprimer ce groupe"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Puissances du nouveau groupe */}
              {group.powers.map((power, powerIndex) => {
                const isIncomplete = !power.power || power.power <= 0 || !power.fields.subscription_price
                return (
                  <div
                    key={`new-group-${groupIndex}-power-${powerIndex}`}
                    className={`rounded-lg p-3 border transition-all ${
                      isIncomplete
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                        : 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Puissance */}
                      <div className="w-20 shrink-0">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={power.power || ''}
                          onChange={(e) => {
                            const newPower = e.target.value ? parseInt(e.target.value) : 0
                            setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                              ...g,
                              powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, power: newPower } : p)
                            } : g))
                          }}
                          placeholder="kVA"
                          className={`w-full px-2 py-1 text-sm font-medium text-center border rounded bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            !power.power || power.power <= 0
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
                          }`}
                        />
                      </div>

                      {/* Abonnement */}
                      <div className="flex items-center gap-2 w-[200px]">
                        <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Abo.<span className="text-red-500">*</span></span>
                        <input
                          type="number"
                          step="0.01"
                          value={power.fields.subscription_price ?? ''}
                          onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                            ...g,
                            powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, subscription_price: e.target.value } } : p)
                          } : g))}
                          placeholder="0.00"
                          className={`w-28 px-3 py-2 text-base font-bold border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            !power.fields.subscription_price
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-blue-300 dark:border-blue-600 focus:ring-blue-500'
                          }`}
                        />
                        <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/mois</span>
                      </div>

                      {/* Tarifs selon le type d'offre */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end pr-4 flex-1">
                        {filterOfferType === 'BASE' && (
                          <div className="flex items-center gap-2 w-[200px]">
                            <span className="text-sm font-semibold w-10 shrink-0 text-right text-gray-600 dark:text-gray-400">Base<span className="text-red-500">*</span></span>
                            <input
                              type="number"
                              step="0.0001"
                              value={power.fields.base_price ?? ''}
                              onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                ...g,
                                powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p)
                              } : g))}
                              placeholder="0.0000"
                              className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                          </div>
                        )}

                        {filterOfferType === 'HC_HP' && (
                          <>
                            <div className="flex items-center gap-2 w-[200px]">
                              <span className="text-sm font-semibold w-10 shrink-0 text-right text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                              <input
                                type="number"
                                step="0.0001"
                                value={power.fields.hc_price ?? ''}
                                onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                  ...g,
                                  powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p)
                                } : g))}
                                placeholder="0.0000"
                                className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                            </div>
                            <div className="flex items-center gap-2 w-[200px]">
                              <span className="text-sm font-semibold w-10 shrink-0 text-right text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                              <input
                                type="number"
                                step="0.0001"
                                value={power.fields.hp_price ?? ''}
                                onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                  ...g,
                                  powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p)
                                } : g))}
                                placeholder="0.0000"
                                className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                            </div>
                          </>
                        )}

                        {(filterOfferType === 'ZEN_FLEX' || filterOfferType === 'SEASONAL') && (
                          <>
                            {/* Ligne Été */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 w-14">Été</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price_summer ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_summer: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price_summer ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_summer: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                            {/* Ligne Hiver */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 w-14">Hiver</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price_winter ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_winter: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price_winter ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_winter: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                          </>
                        )}

                        {filterOfferType === 'ZEN_WEEK_END' && (
                          <>
                            {/* Tarif semaine */}
                            <div className="flex items-center gap-2 w-[200px]">
                              <span className="text-sm font-semibold w-16 shrink-0 text-right text-gray-600 dark:text-gray-400">Semaine<span className="text-red-500">*</span></span>
                              <input type="number" step="0.0001" value={power.fields.base_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              <span className="text-gray-500 dark:text-gray-400 text-xs">€/kWh</span>
                            </div>
                            {/* Tarif week-end */}
                            <div className="flex items-center gap-2 w-[200px]">
                              <span className="text-sm font-semibold w-16 shrink-0 text-right text-green-600 dark:text-green-400">Week-end<span className="text-red-500">*</span></span>
                              <input type="number" step="0.0001" value={power.fields.base_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, base_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                              <span className="text-gray-500 dark:text-gray-400 text-xs">€/kWh</span>
                            </div>
                          </>
                        )}

                        {filterOfferType === 'ZEN_WEEK_END_HP_HC' && (
                          <>
                            {/* Ligne Semaine */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 w-16">Semaine</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                            {/* Ligne Week-end */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-16">Week-end</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                          </>
                        )}

                        {(filterOfferType === 'HC_WEEKEND' || filterOfferType === 'HC_NUIT_WEEKEND') && (
                          <>
                            {/* Ligne Semaine */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 w-16">Semaine</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                            {/* Ligne Week-end */}
                            <div className="w-full flex flex-wrap gap-x-3 gap-y-1 items-center justify-end">
                              <span className="text-sm font-semibold text-green-600 dark:text-green-400 w-16">Week-end</span>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">HC<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hc_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hc_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-red-600 dark:text-red-400">HP<span className="text-red-500">*</span></span>
                                <input type="number" step="0.0001" value={power.fields.hp_price_weekend ?? ''} onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, hp_price_weekend: e.target.value } } : p) } : g))} placeholder="0.0000" className="w-24 px-2 py-1 text-sm font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                <span className="text-gray-500 dark:text-gray-400 text-xs">€</span>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Champs dynamiques pour les types non standard (détectés depuis les offres existantes) */}
                        {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'ZEN_FLEX', 'SEASONAL', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType) && dynamicPriceFields.map(field => (
                          <div key={field.key} className="flex items-center gap-2 w-[200px]">
                            <span className={`text-sm font-semibold w-16 shrink-0 text-right ${field.color || 'text-gray-600 dark:text-gray-400'}`}>
                              {field.label}<span className="text-red-500">*</span>
                            </span>
                            <input
                              type="number"
                              step="0.0001"
                              value={power.fields[field.key] ?? ''}
                              onChange={(e) => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                                ...g,
                                powers: g.powers.map((p, pi) => pi === powerIndex ? { ...p, fields: { ...p.fields, [field.key]: e.target.value } } : p)
                              } : g))}
                              placeholder="0.0000"
                              className="w-28 px-3 py-2 text-base font-bold border-2 rounded-lg border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <span className="text-gray-500 dark:text-gray-400 text-sm w-12 shrink-0">€/kWh</span>
                          </div>
                        ))}
                      </div>

                      {/* Bouton supprimer la puissance */}
                      <button
                        onClick={() => setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? {
                          ...g,
                          powers: g.powers.filter((_, pi) => pi !== powerIndex)
                        } : g))}
                        className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Supprimer cette puissance"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Bouton ajouter une puissance au nouveau groupe */}
              <button
                onClick={() => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? {
                  ...g,
                  powers: [...g.powers, { power: 0, fields: {} }]
                } : g))}
                className="w-full bg-primary-50 dark:bg-primary-900/30 rounded-lg p-3 border-2 border-primary-400 dark:border-primary-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Plus size={18} className="text-primary-600 dark:text-primary-400" />
                <span className="font-semibold text-sm text-primary-700 dark:text-primary-300">Ajouter une puissance à ce groupe</span>
              </button>
            </div>
          ))}

          {/* Bouton pour créer un nouveau groupe d'offres (uniquement en mode édition) */}
          {isEditMode && (
            <button
              onClick={() => setNewGroups(prev => [...prev, { name: '', powers: [{ power: 0, fields: {} }] }])}
              className="w-full rounded-lg p-3 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-2"
            >
              <Package size={18} />
              <Plus size={14} className="-ml-1" />
              <span className="font-medium text-sm">Créer un nouveau groupe d'offres</span>
            </button>
          )}

          {/* Bouton flottant pour ouvrir le récapitulatif (uniquement en mode édition avec modifications) */}
          {isEditMode && hasAnyModifications && (
            <button
              onClick={() => setShowRecapModal(true)}
              className="w-full rounded-lg p-4 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-3"
            >
              <Send size={20} />
              <span className="font-semibold">Voir le récapitulatif et soumettre</span>
              <span className="bg-primary-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {totalModificationsCount}
              </span>
            </button>
          )}
        </div>
      ) : null}

      {/* Modal de récapitulatif */}
      {showRecapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRecapModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-primary-600 to-primary-500 p-6 rounded-t-2xl">
              <button
                onClick={() => setShowRecapModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                aria-label="Fermer"
              >
                <X size={20} className="text-white" />
              </button>
              <div className="text-center">
                <Send size={40} className="mx-auto mb-3 text-white" />
                <h3 className="text-2xl font-bold text-white">Récapitulatif des modifications</h3>
                <p className="text-white/80 mt-2">{totalModificationsCount} modification{totalModificationsCount > 1 ? 's' : ''} à soumettre</p>
              </div>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Modifications de tarifs */}
                {modifiedOffers.map(offer => {
                  const edited = editedOffers[offer.id] || {}
                  const changes = Object.entries(edited).filter(([key, value]) => {
                    const originalValue = (offer as unknown as Record<string, unknown>)[key]
                    const origNum = Number(originalValue)
                    const newNum = Number(value)
                    if (isNaN(origNum) && isNaN(newNum)) return false
                    if (isNaN(origNum) || isNaN(newNum)) return true
                    return Math.abs(origNum - newNum) > 0.00001
                  })
                  if (changes.length === 0) return null
                  return (
                    <div key={offer.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <div className="font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                        {offer.name}
                      </div>
                      <div className="space-y-2">
                        {changes.map(([key, value]) => {
                          const originalValue = (offer as unknown as Record<string, unknown>)[key]
                          const origNum = Number(originalValue)
                          const newNum = Number(value)
                          const isSubscription = key === 'subscription_price'
                          return (
                            <div key={key} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {fieldLabels[key] || key}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-red-500 line-through font-mono">
                                  {isNaN(origNum) ? '-' : origNum.toFixed(isSubscription ? 2 : 4)}
                                </span>
                                <span className="text-gray-400">→</span>
                                <span className="text-sm text-green-600 dark:text-green-400 font-bold font-mono">
                                  {isNaN(newNum) ? '-' : newNum.toFixed(isSubscription ? 2 : 4)}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {isSubscription ? '€/mois' : '€/kWh'}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Fournisseurs à supprimer */}
                {providersToRemove.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                    <div className="font-semibold text-red-800 dark:text-red-300 mb-3 pb-2 border-b border-red-200 dark:border-red-700 flex items-center gap-2">
                      <Building2 size={16} />
                      Fournisseurs à supprimer
                      <span className="text-sm font-normal text-red-600 dark:text-red-400">
                        ({providersToRemove.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {providersToRemove.map(providerId => {
                        const provider = sortedProviders.find(p => p.id === providerId)
                        const providerOffersCount = offersArray.filter(o => o.provider_id === providerId).length
                        return (
                          <div key={providerId} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2 border border-red-200 dark:border-red-700">
                            <span className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                              <Trash2 size={14} />
                              {provider?.name || 'Fournisseur inconnu'}
                            </span>
                            <span className="text-xs text-red-500 dark:text-red-400">
                              {providerOffersCount} offre{providerOffersCount > 1 ? 's' : ''} seront supprimées
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Modifications de puissances */}
                {(newPowersData.length > 0 || powersToRemove.length > 0) && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                    <div className="font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                      Modifications de puissances
                      {sortedProviders.find(p => p.id === filterProvider) && (
                        <span className="text-sm font-normal text-gray-500">
                          ({sortedProviders.find(p => p.id === filterProvider)?.name} - {filterOfferType})
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {powersToRemove.sort((a, b) => a - b).map(power => (
                        <div key={`remove-${power}`} className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded px-3 py-2 border border-red-200 dark:border-red-800">
                          <span className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-2">
                            <Trash2 size={14} />
                            Supprimer la puissance
                          </span>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {power} kVA
                          </span>
                        </div>
                      ))}
                      {newPowersData.map((newPower, index) => (
                        <div key={`add-${index}`} className="bg-green-50 dark:bg-green-900/20 rounded px-3 py-2 border border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                              <Plus size={14} />
                              Ajouter la puissance
                            </span>
                            <span className="text-sm font-bold text-green-600 dark:text-green-400">
                              {newPower.power} kVA
                            </span>
                          </div>
                          <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-700 space-y-1">
                            {newPower.fields.subscription_price && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-green-600 dark:text-green-400">Abonnement :</span>
                                <span className="font-semibold text-green-700 dark:text-green-300">{newPower.fields.subscription_price} €/mois</span>
                              </div>
                            )}
                            {newPower.fields.base_price && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-green-600 dark:text-green-400">Base :</span>
                                <span className="font-semibold text-green-700 dark:text-green-300">{newPower.fields.base_price} €/kWh</span>
                              </div>
                            )}
                            {newPower.fields.hc_price && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-blue-600 dark:text-blue-400">HC :</span>
                                <span className="font-semibold text-blue-700 dark:text-blue-300">{newPower.fields.hc_price} €/kWh</span>
                              </div>
                            )}
                            {newPower.fields.hp_price && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-red-600 dark:text-red-400">HP :</span>
                                <span className="font-semibold text-red-700 dark:text-red-300">{newPower.fields.hp_price} €/kWh</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Noms de groupes modifiés */}
                {hasModifiedGroupNames && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-700">
                    <div className="font-medium text-amber-800 dark:text-amber-300 mb-3 pb-2 border-b border-amber-200 dark:border-amber-700 flex items-center gap-2">
                      <Pencil size={16} />
                      <span>Renommage de groupes d'offres</span>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(editedOfferNames)
                        .filter(([originalName, newName]) => newName !== originalName && newName.trim() !== '')
                        .map(([originalName, newName]) => (
                          <div key={`rename-${originalName}`} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2 border border-amber-200 dark:border-amber-700">
                            <span className="text-sm text-red-500 line-through">{originalName}</span>
                            <span className="text-gray-400 mx-2">→</span>
                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">{newName}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Nouveaux groupes d'offres */}
                {newGroups.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                    <div className="font-medium text-blue-800 dark:text-blue-300 mb-3 pb-2 border-b border-blue-200 dark:border-blue-700 flex items-center gap-2">
                      <Package size={16} />
                      <span>Nouveaux groupes d'offres ({newGroups.length})</span>
                    </div>
                    <div className="space-y-3">
                      {newGroups.map((group, index) => (
                        <div key={`recap-group-${index}`} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-200 dark:border-blue-700">
                          <div className="font-semibold text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                            <Plus size={14} />
                            {group.name || <span className="italic text-gray-400">Nom non défini</span>}
                          </div>
                          <div className="space-y-1">
                            {group.powers.map((power, powerIndex) => (
                              <div key={`recap-group-${index}-power-${powerIndex}`} className="text-xs flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 rounded px-2 py-1">
                                <span className="text-blue-600 dark:text-blue-400">
                                  {power.power || '?'} kVA
                                </span>
                                <span className="text-blue-700 dark:text-blue-300 font-medium">
                                  {power.fields.subscription_price ? `${power.fields.subscription_price} €/mois` : '-'}
                                  {power.fields.base_price && ` • Base: ${power.fields.base_price} €/kWh`}
                                  {power.fields.hc_price && ` • HC: ${power.fields.hc_price}`}
                                  {power.fields.hp_price && ` • HP: ${power.fields.hp_price}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Champ lien vers la fiche tarifaire */}
              <div className="mt-6 p-4 border-2 border-dashed border-primary-300 dark:border-primary-700 rounded-lg">
                <label className="flex items-center gap-2 text-sm font-medium text-primary-700 dark:text-primary-300 mb-2">
                  <Link size={16} />
                  Lien vers la fiche tarifaire officielle
                  {!isPrivilegedUser && <span className="text-red-500">*</span>}
                  {isPrivilegedUser && <span className="text-gray-500 text-xs font-normal">(optionnel)</span>}
                </label>
                <input
                  type="url"
                  value={priceSheetUrl}
                  onChange={(e) => setPriceSheetUrl(e.target.value)}
                  placeholder="https://www.edf.fr/grille-tarifaire.pdf"
                  className={`w-full px-4 py-2 rounded-lg border ${
                    priceSheetUrl && !priceSheetUrl.startsWith('http')
                      ? 'border-red-400 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none`}
                />
                {!priceSheetUrl && !isPrivilegedUser && (
                  <p className="mt-2 text-xs text-primary-600 dark:text-primary-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Ce champ est obligatoire pour valider vos modifications
                  </p>
                )}
              </div>

              {/* Messages d'erreur */}
              {hasDuplicatePowers && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Certaines puissances que vous souhaitez ajouter existent déjà.
                  </p>
                </div>
              )}

              {(hasIncompletePowers || hasIncompleteGroups) && !hasDuplicatePowers && !hasGroupDuplicatePowers && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Veuillez renseigner tous les champs obligatoires.
                  </p>
                </div>
              )}
            </div>

            {/* Footer avec boutons */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 flex gap-3">
              <button
                onClick={() => {
                  setEditedOffers({})
                  setPriceSheetUrl('')
                  setPowersToRemove([])
                  setNewPowersData([])
                  setProvidersToRemove([])
                  setNewGroups([])
                  setEditedOfferNames({})
                  setShowRecapModal(false)
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
              >
                <X size={18} />
                Tout annuler
              </button>
              <button
                onClick={() => {
                  submitAllModifications()
                  setShowRecapModal(false)
                }}
                disabled={submittingOffers || (!isPrivilegedUser && !priceSheetUrl) || (priceSheetUrl.length > 0 && !priceSheetUrl.startsWith('http')) || hasDuplicatePowers || hasIncompletePowers || hasIncompleteGroups || hasGroupDuplicatePowers}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Send size={18} />
                {submittingOffers ? 'Envoi en cours...' : 'Soumettre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
