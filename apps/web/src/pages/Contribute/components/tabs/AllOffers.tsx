import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Send, X, Link, AlertCircle, Plus, Trash2, Undo2, Eye, Pencil, Info, Building2, ArrowDownToLine, Sparkles, Copy, Zap, ChevronDown, ChevronRight, Clock, RotateCcw, Calendar } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData, type EnergyOffer } from '@/api/energy'
import { pdlApi } from '@/api/pdl'
import { toast } from '@/stores/notificationStore'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { usePermissions } from '@/hooks/usePermissions'
import { SingleDatePicker } from '@/components/SingleDatePicker'

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
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [showTypeInfoPopup, setShowTypeInfoPopup] = useState(false)
  const [typeInfoTarget, setTypeInfoTarget] = useState<string>('')

  // State pour l'édition inline des offres
  const [editedOffers, setEditedOffers] = useState<Record<string, Record<string, string>>>({})
  const [submittingOffers, setSubmittingOffers] = useState(false)
  const [priceSheetUrl, setPriceSheetUrl] = useState('')

  // State pour les propositions d'ajout/suppression de puissances
  const [powersToRemove, setPowersToRemove] = useState<{ power: number; groupName: string }[]>([])
  // Nouvelles puissances à ajouter avec leurs tarifs (liste)
  const [newPowersData, setNewPowersData] = useState<Array<{
    power: number
    fields: Record<string, string>
    // Champs optionnels pour l'import IA multi-types
    offer_type?: string
    offer_name?: string
    valid_from?: string
    valid_to?: string
  }>>([])

  // Formulaire inline pour créer un nouveau fournisseur
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderWebsite, setNewProviderWebsite] = useState('')
  const [creatingProvider, setCreatingProvider] = useState(false)

  // Fournisseurs marqués pour suppression
  const [providersToRemove, setProvidersToRemove] = useState<string[]>([])

  // Formulaire inline pour ajouter une nouvelle offre à un fournisseur existant
  const [isAddingOffer, setIsAddingOffer] = useState(false)
  const [newOfferType, setNewOfferType] = useState('')

  // Date de mise en service pour les formulaires d'ajout (nouveau fournisseur / nouvelle offre)
  const [newOfferValidFrom, setNewOfferValidFrom] = useState(() => new Date().toISOString().split('T')[0])

  // Édition des noms d'offres (clé = "nomOriginal::offerType", valeur = nouveau nom)
  const [editedOfferNames, setEditedOfferNames] = useState<Record<string, string>>({})

  // Nouveaux groupes d'offres à créer (nom du groupe + date de validité + puissances avec tarifs)
  const [newGroups, setNewGroups] = useState<Array<{
    name: string
    validFrom: string  // Date de mise en service (YYYY-MM-DD)
    validTo: string    // Date de fin (YYYY-MM-DD), vide = offre active
    offer_type?: string  // Type d'offre (pour import IA multi-types)
    alreadyInDb?: boolean  // Offre identique déjà en base (afficher "Déjà en base" dans le récap)
    powers: Array<{
      power: number
      fields: Record<string, string>
    }>
  }>>([])

  // Modal du récapitulatif
  const [showRecapModal, setShowRecapModal] = useState(false)
  // Puissances exclues de la soumission dans le récapitulatif
  // Clés : "group-{groupIdx}-{powerIdx}" pour newGroups, "newpower-{groupKey}-{powerIdx}" pour newPowersData
  const [recapExcludedPowers, setRecapExcludedPowers] = useState<Set<string>>(new Set())

  // Section offres expirées (pliable, fermée par défaut)
  const [showExpiredSection, setShowExpiredSection] = useState(false)
  // Groupes d'offres en cours de réactivation (loading state)
  const [reactivatingGroups, setReactivatingGroups] = useState<Set<string>>(new Set())
  // Groupes d'offres en cours de suppression (loading state, admin only)
  const [deletingGroups, setDeletingGroups] = useState<Set<string>>(new Set())
  // Modal de confirmation de suppression
  const [deleteConfirm, setDeleteConfirm] = useState<{ groupName: string; offers: EnergyOffer[] } | null>(null)

  // Dropdown de duplication des tarifs
  const [duplicateDropdownId, setDuplicateDropdownId] = useState<string | null>(null)

  // Modale de confirmation avant perte de modifications
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    onConfirm: () => void
    onSubmit: () => void
  } | null>(null)

  // Mode IA : import JSON
  const [showAIMode, setShowAIMode] = useState(false)
  const [aiJsonInput, setAiJsonInput] = useState('')
  const [aiImportResult, setAiImportResult] = useState<{
    success: boolean
    message: string
    details?: Array<{
      offer_type: string
      offer_name: string
      matched: number
      added: number
      deprecated?: boolean
      warning?: string
    }>
  } | null>(null)
  // Offres inchangées détectées lors de l'import IA (pour affichage dans le récap)
  const [unchangedOfferIds, setUnchangedOfferIds] = useState<Set<string>>(new Set())
  // Offres signalées comme supprimées/deprecated par l'IA
  const [deprecatedOffers, setDeprecatedOffers] = useState<Array<{
    offer_type: string
    offer_name: string
    offer_ids: string[]
    warning: string
  }>>([])
  // Flag pour empêcher le reset de newPowersData lors d'un changement de filtre déclenché par l'import IA
  const skipFilterResetRef = useRef(false)
  // Ref pour tracker le fournisseur précédent et éviter les resets parasites lors des refetch React Query
  const prevProviderRef = useRef(filterProvider)

  // Fetch providers (staleTime: 0 pour toujours refetch au montage — les offres peuvent changer après validation admin)
  const { data: providersData } = useQuery({
    queryKey: ['energy-providers'],
    queryFn: async () => {
      const response = await energyApi.getProviders()
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyProvider[]
      }
      return []
    },
    staleTime: 0,
  })

  // Fetch all offers (staleTime: 0 pour toujours refetch au montage)
  const { data: offersData } = useQuery({
    queryKey: ['energy-offers', 'with-history'],
    queryFn: async () => {
      const response = await energyApi.getOffers(undefined, true)
      if (response.success && Array.isArray(response.data)) {
        return response.data as EnergyOffer[]
      }
      return []
    },
    staleTime: 0,
  })

  // Récupérer les PDLs pour pré-sélectionner le fournisseur de l'offre du 1er PDL
  const { data: pdlsData, isFetched: pdlsFetched } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  // Ref pour ne faire l'initialisation basée sur le PDL qu'une seule fois
  const pdlInitDoneRef = useRef(false)
  // Type d'offre cible à appliquer lors de l'initialisation (positionné par l'init PDL)
  const targetOfferTypeRef = useRef<string | null>(null)

  // Normaliser offersData en tableau (protection contre les données corrompues du cache)
  const offersArray = useMemo(() => {
    return Array.isArray(offersData) ? offersData : []
  }, [offersData])

  // Offres actives uniquement (sans valid_to et is_active !== false) — pour les compteurs
  const activeOffersArray = useMemo(() => {
    return offersArray.filter(o => !o.valid_to && o.is_active !== false)
  }, [offersArray])

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
  const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND']

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


  // Types non intégrés au simulateur (ne pas proposer pour la création de nouvelles offres)
  const unsupportedCreationTypes: string[] = []

  // Types d'offres non encore utilisés par le fournisseur sélectionné (pour ajout d'offre)
  const unusedOfferTypes = useMemo(() => {
    const creatableTypes = typeOrder.filter(t => !unsupportedCreationTypes.includes(t))
    if (!filterProvider) return creatableTypes
    const usedTypes = new Set(offersArray.filter(o => o.provider_id === filterProvider).map(o => o.offer_type))
    return creatableTypes.filter(type => !usedTypes.has(type))
  }, [filterProvider, offersArray])

  // Initialiser avec le fournisseur de l'offre du 1er PDL, ou EDF par défaut
  useEffect(() => {
    if (sortedProviders.length === 0 || offersArray.length === 0 || filterProvider) return
    // Attendre que la query PDL soit terminée (succès ou erreur) avant de choisir le fallback
    if (!pdlsFetched) return

    // Tentative d'initialisation via l'offre sélectionnée du 1er PDL (une seule fois)
    if (!pdlInitDoneRef.current) {
      pdlInitDoneRef.current = true
      const pdls = Array.isArray(pdlsData) ? pdlsData : (pdlsData as { data?: unknown[] })?.data || []
      const firstPdlWithOffer = (pdls as { selected_offer_id?: string }[]).find(p => p.selected_offer_id)
      if (firstPdlWithOffer?.selected_offer_id) {
        const offer = offersArray.find(o => o.id === firstPdlWithOffer.selected_offer_id)
        if (offer) {
          const provider = sortedProviders.find(p => p.id === offer.provider_id)
          if (provider) {
            // Stocker le type cible pour que le useEffect de reset provider l'applique
            targetOfferTypeRef.current = offer.offer_type
            setFilterProvider(provider.id)
            return
          }
        }
      }
    }

    // Fallback : EDF ou le premier fournisseur
    const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
    if (edf) {
      setFilterProvider(edf.id)
    } else {
      setFilterProvider(sortedProviders[0].id)
    }
  }, [sortedProviders, filterProvider, offersArray, pdlsData, pdlsFetched])

  // Reset le filtre de type d'offre et les propositions de puissances quand on change de fournisseur
  // Ignore les refetch React Query (changement de référence offersArray sans changement de provider)
  useEffect(() => {
    const providerChanged = filterProvider !== prevProviderRef.current
    prevProviderRef.current = filterProvider

    if (!filterProvider || offersArray.length === 0) {
      setFilterOfferType('all')
      setPowersToRemove([])
      setNewPowersData([])
      setNewGroups([])
      setDeprecatedOffers([])
      setUnchangedOfferIds(new Set())
      setIsAddingOffer(false)
      setNewOfferType('')
      return
    }

    // Si le fournisseur n'a pas changé (simple refetch) et qu'un type est déjà sélectionné,
    // ne pas reset les filtres — sauf si le type est encore 'all' (chargement initial)
    if (!providerChanged && filterOfferType !== 'all') return

    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    const typeOrder = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND']
    const sortedTypes = types.sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })

    // Si l'init PDL a positionné un type cible, l'utiliser (une seule fois)
    if (targetOfferTypeRef.current) {
      const target = targetOfferTypeRef.current
      targetOfferTypeRef.current = null
      if (sortedTypes.includes(target)) {
        setFilterOfferType(target)
      } else if (sortedTypes.length > 0) {
        setFilterOfferType(sortedTypes[0])
      } else {
        setFilterOfferType('all')
      }
    } else if (sortedTypes.length > 0) {
      setFilterOfferType(sortedTypes[0])
    } else {
      setFilterOfferType('all')
    }
    // Reset les propositions de puissances, le mode ajout d'offre et le mode IA
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
    setIsAddingOffer(false)
    setNewOfferType('')
    // Garder showAIMode actif au changement de fournisseur, mais réinitialiser le contenu
    setAiJsonInput('')
    setAiImportResult(null)
    setDeprecatedOffers([])
    setUnchangedOfferIds(new Set())
  }, [filterProvider, offersArray])

  // Reset les propositions de puissances et les modifications quand on change de type d'offre
  // (sauf si le changement vient de l'import IA)
  useEffect(() => {
    if (skipFilterResetRef.current) {
      skipFilterResetRef.current = false
      return
    }
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
    setDeprecatedOffers([])
    setUnchangedOfferIds(new Set())
    setEditedOffers({})
    setEditedOfferNames({})
  }, [filterOfferType])

  // Fermer le dropdown de duplication au clic exterieur
  useEffect(() => {
    if (!duplicateDropdownId) return
    const handleClick = () => setDuplicateDropdownId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [duplicateDropdownId])

  // Auto-focus et scroll vers le dernier nouveau groupe créé
  const prevNewGroupsLengthRef = useRef(0)
  useEffect(() => {
    if (newGroups.length > prevNewGroupsLengthRef.current) {
      // Un nouveau groupe a été ajouté, focus le champ nom du dernier groupe
      requestAnimationFrame(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('[data-new-group-name]')
        const lastInput = inputs[inputs.length - 1]
        if (lastInput) {
          lastInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
          lastInput.focus()
        }
      })
    }
    prevNewGroupsLengthRef.current = newGroups.length
  }, [newGroups.length])

  // Helper pour vérifier si une offre a été modifiée (comparaison numérique avec epsilon)
  const isOfferModified = (offer: EnergyOffer): boolean => {
    const edited = editedOffers[offer.id]
    if (!edited) return false
    return Object.entries(edited).some(([key, value]) => {
      // valid_from et valid_to sont des dates, comparaison en string (pas numérique)
      if (key === 'valid_from' || key === 'valid_to') {
        const origStr = String((offer as unknown as Record<string, unknown>)[key] || '')
        return value !== origStr
      }
      const orig = Number((offer as unknown as Record<string, unknown>)[key])
      const next = Number(value)
      if (isNaN(orig) && isNaN(next)) return false
      if (isNaN(orig) || isNaN(next)) return true
      return Math.abs(orig - next) > 0.00001
    })
  }

  // Helper pour vérifier s'il y a des noms de groupes modifiés
  const hasModifiedGroupNames = Object.entries(editedOfferNames).some(
    ([renameKey, newName]) => {
      const originalName = renameKey.split('::')[0]
      return newName !== originalName && newName.trim() !== ''
    }
  )

  // Calculer le nombre total de modifications pour le badge
  // Exclut les groupes 100% doublons (toutes les puissances déjà en base)
  const totalModificationsCount = useMemo(() => {
    const modifiedOffersCount = offersArray.filter(offer => isOfferModified(offer)).length
    const renamedGroupsCount = Object.entries(editedOfferNames).filter(
      ([renameKey, newName]) => {
        const originalName = renameKey.split('::')[0]
        return newName !== originalName && newName.trim() !== ''
      }
    ).length
    const deprecatedCount = deprecatedOffers.reduce((sum, d) => sum + d.offer_ids.length, 0)
    // Ne compter que les newGroups qui ont au moins une puissance non-doublon (exclure alreadyInDb)
    const provOffers = offersArray.filter(o => o.provider_id === filterProvider && o.is_active !== false)
    const newGroupsWithNewPowers = newGroups.filter(group => {
      if (group.alreadyInDb) return false
      const groupType = group.offer_type || filterOfferType
      return group.powers.some(p => {
        if (p.power <= 0) return true
        // Vérifier si cette puissance existe déjà dans les offres du fournisseur
        return !provOffers.some(o =>
          (o.power_kva || 0) === p.power && o.offer_type === groupType &&
          (() => {
            // Inline periodsOverlap
            const s1 = group.validFrom ? new Date(group.validFrom) : null
            const e1 = group.validTo ? new Date(group.validTo) : null
            const s2 = o.valid_from ? new Date(o.valid_from) : null
            const e2 = o.valid_to ? new Date(o.valid_to) : null
            if (!s1 && !s2) return true
            if (!s1 || !s2) return true
            const end1 = e1 || new Date('9999-12-31')
            const end2 = e2 || new Date('9999-12-31')
            return s1 <= end2 && s2 <= end1
          })()
        )
      })
    }).length
    return modifiedOffersCount + newPowersData.length + powersToRemove.length + providersToRemove.length + newGroupsWithNewPowers + renamedGroupsCount + deprecatedCount
  }, [offersArray, editedOffers, editedOfferNames, newPowersData, powersToRemove, providersToRemove, newGroups, deprecatedOffers, filterOfferType, filterProvider])

  // Vérifier s'il y a des modifications à afficher
  const hasAnyModifications = totalModificationsCount > 0

  // Confirmation avant une action qui fait perdre les modifications en cours
  // Si pas de modifications : execute directement. Sinon : ouvre la modale avec callback.
  const confirmOrExecute = (action: () => void) => {
    if (!hasAnyModifications) {
      action()
      return
    }
    setConfirmDialog({
      title: 'Modifications non soumises',
      message: `Vous avez ${totalModificationsCount} modification(s) en cours qui n'ont pas encore été soumises.\n\nSi vous continuez, ces modifications seront perdues.\n\nPour les conserver, soumettez-les d'abord.`,
      onConfirm: () => {
        setConfirmDialog(null)
        action()
      },
      onSubmit: () => {
        setConfirmDialog(null)
        openRecapModal()
      }
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

  // Helper pour obtenir les cles de champs tarifaires selon le type d'offre
  const getFieldKeysForOfferType = (offerType: string): string[] => {
    switch (offerType) {
      case 'BASE': return ['base_price']
      case 'BASE_WEEKEND': return ['base_price', 'base_price_weekend']
      case 'HC_HP': return ['hc_price', 'hp_price']
      case 'HC_NUIT_WEEKEND': case 'HC_WEEKEND': return ['hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend']
      case 'TEMPO': return ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp']
      case 'EJP': return ['ejp_normal', 'ejp_peak']
      case 'SEASONAL': return ['hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter']
      default: return []
    }
  }

  // Dupliquer les champs tarifaires d'une offre vers la suivante ou toutes les lignes du groupe
  const duplicateOfferFields = (
    sourceOffer: EnergyOffer,
    targetMode: 'next' | 'all',
    offersInGroup: EnergyOffer[]
  ) => {
    const fieldsToCopy = ['subscription_price', ...getFieldKeysForOfferType(sourceOffer.offer_type)]
    const sourceIndex = offersInGroup.findIndex(o => o.id === sourceOffer.id)

    const targets = targetMode === 'next'
      ? [offersInGroup[sourceIndex + 1]].filter(Boolean)
      : offersInGroup.filter((_, i) => i !== sourceIndex)

    if (targets.length === 0) return

    setEditedOffers(prev => {
      const updated = { ...prev }
      for (const target of targets) {
        updated[target.id] = { ...(updated[target.id] || {}) }
        for (const field of fieldsToCopy) {
          const sourceValue = prev[sourceOffer.id]?.[field]
            ?? String((sourceOffer as unknown as Record<string, unknown>)[field] ?? '')
          updated[target.id][field] = sourceValue
        }
      }
      return updated
    })

    setDuplicateDropdownId(null)
    toast.success(targetMode === 'next'
      ? 'Tarifs dupliqués vers la ligne suivante'
      : `Tarifs dupliqués vers ${targets.length} ligne(s)`)
  }

  // Générer le prompt IA dynamiquement avec le nom du fournisseur sélectionné
  const generateAIPrompt = (): string => {
    const provider = sortedProviders.find(p => p.id === filterProvider)
    const providerName = provider?.name || 'Inconnu'

    // Construire le JSON complet des offres existantes du fournisseur
    const currentOffers = offersArray.filter(o => o.provider_id === filterProvider)
    let currentOffersSection = ''
    if (currentOffers.length > 0) {
      const allPriceKeys = [
        'subscription_price', 'base_price', 'base_price_weekend',
        'hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend',
        'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter',
        'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp',
        'tempo_red_hc', 'tempo_red_hp', 'ejp_normal', 'ejp_peak',
      ] as const

      // Regrouper par offer_type + clean name + période de validité
      const groups: Record<string, {
        type: string
        name: string
        validFrom: string | null
        validTo: string | null
        powers: Array<{ power_kva: number; fields: Record<string, number> }>
      }> = {}
      for (const offer of currentOffers) {
        const cleanName = getCleanOfferName(offer.name)
        const validFrom = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : null
        const validTo = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('sv-SE') : null
        const key = `${offer.offer_type}::${cleanName}::${validFrom || ''}::${validTo || ''}`
        if (!groups[key]) {
          groups[key] = { type: offer.offer_type, name: cleanName, validFrom, validTo, powers: [] }
        }
        const power = offer.power_kva || 0
        if (power > 0) {
          const fields: Record<string, number> = {}
          for (const k of allPriceKeys) {
            const val = (offer as unknown as Record<string, unknown>)[k]
            if (val !== null && val !== undefined && !isNaN(Number(val))) {
              fields[k] = Number(val)
            }
          }
          groups[key].powers.push({ power_kva: power, fields })
        }
      }

      // Construire le JSON des offres existantes
      const existingOffersJson = Object.values(groups).map(g => {
        g.powers.sort((a, b) => a.power_kva - b.power_kva)
        return {
          offer_name: g.name,
          offer_type: g.type,
          valid_from: g.validFrom,
          valid_until: g.validTo,
          power_variants: g.powers.map(p => ({ power_kva: p.power_kva, ...p.fields })),
        }
      })

      const totalOffers = currentOffers.length
      const groupCount = Object.keys(groups).length
      currentOffersSection = `

## Offres actuellement enregistrées en base pour "${providerName}"

\`\`\`json
${JSON.stringify(existingOffersJson, null, 2)}
\`\`\`

**Total : ${totalOffers} lignes tarifaires réparties sur ${groupCount} offre(s).**

## IMPORTANT — Règles de comparaison avec la base existante

**NE RETOURNE QUE les offres qui ne sont PAS déjà en base** (nouvelles grilles tarifaires, nouvelles offres).

Compare chaque offre trouvée avec le JSON ci-dessus :
- **Offre identique** (même nom, même type, même période, mêmes prix) → **NE PAS l'inclure** dans ton JSON de retour.
- **Offre avec nouveaux tarifs** (même nom, même type, mais période de validité différente) → L'inclure comme **nouvelle offre** avec le bon \`valid_from\`.
- **Offre qui N'EXISTE PLUS** chez le fournisseur et qui est en base SANS \`valid_until\` → L'inclure avec \`"deprecated": true\` et un \`"warning"\` expliquant qu'elle semble avoir été supprimée ou remplacée.
- **Offre RENOMMÉE** → Utiliser le nouveau nom et ajouter un \`"warning"\` mentionnant l'ancien nom.
- **NOUVELLE offre** non présente en base → L'inclure normalement.

Si TOUTES les offres trouvées sont déjà identiques en base, retourne un JSON avec un tableau \`"offers"\` vide et un message expliquant que tout est à jour.`
    }

    return `Tu es un assistant spécialisé dans les tarifs d'électricité en France.

## Méthode recommandée

- **Compare PLUSIEURS sources** pour fiabiliser les prix : site officiel du fournisseur, grilles tarifaires PDF, comparateurs (selectra.info, jechange.fr, fournisseurs-electricite.com, etc.)
- En cas de divergence entre sources, privilégie la grille officielle du fournisseur et ajoute un warning mentionnant l'écart constaté
- Active le mode **"tasks"** (ou équivalent multi-étapes) de ton IA pour traiter chaque offre séparément et aller plus vite
- N'hésite pas à faire plusieurs recherches successives si le fournisseur propose beaucoup d'offres

Je souhaite obtenir les grilles tarifaires actuelles du fournisseur "${providerName}".

Génère un JSON contenant TOUTES les offres disponibles de ce fournisseur.

## Format JSON requis

\`\`\`json
{
  "provider_name": "${providerName}",
  "data_source": "Description de la source (ex: grille tarifaire PDF téléchargée depuis le site officiel)",
  "extraction_date": "YYYY-MM-DD",
  "offers": [
    {
      "offer_name": "Nom de l'offre (sans puissance ni type)",
      "offer_type": "TYPE",
      "valid_from": "YYYY-MM-DD",
      "valid_until": "YYYY-MM-DD ou null",
      "special_conditions": "optionnel - conditions particulières",
      "warning": "optionnel - si incertitude ou remarque",
      "deprecated": false,
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 12.34,
          "...champs_prix_selon_type..."
        }
      ]
    }
  ]
}
\`\`\`

## Types d'offres disponibles et leurs champs

Il existe exactement **8 types**. Chaque type a des champs prix **obligatoires**. Le champ \`subscription_price\` (abonnement mensuel TTC en €/mois) est obligatoire pour TOUS les types.

**IMPORTANT — Mapping obligatoire :**
- Chaque offre du fournisseur DOIT être associée à l'un des 8 types ci-dessous
- Analyse la structure tarifaire de l'offre (nombre de prix, périodes HC/HP, saisons, etc.) pour déterminer le type correspondant
- Si une offre ne correspond à AUCUN des 8 types (structure tarifaire inconnue, tarification dynamique, indexation spot, etc.), ajoute un \`"warning"\` expliquant le problème et indique à l'utilisateur de contacter un administrateur ou modérateur pour créer un nouveau type d'offre

### BASE — Tarif unique
Un seul prix du kWh, identique à toute heure.

| Champ | Description |
|-------|-------------|
| \`base_price\` | Prix du kWh TTC |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.03, "base_price": 0.195200 }
\`\`\`

### HC_HP — Heures Creuses / Heures Pleines
2 prix selon l'heure (HC = nuit/creux, HP = jour/plein).

| Champ | Description |
|-------|-------------|
| \`hc_price\` | Prix du kWh en Heures Creuses |
| \`hp_price\` | Prix du kWh en Heures Pleines |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.60, "hc_price": 0.163500, "hp_price": 0.208100 }
\`\`\`

### TEMPO — 6 tarifs (3 couleurs × HC/HP)
Jours bleus (300j/an, les moins chers), blancs (43j/an) et rouges (22j/an, les plus chers), chacun avec HC et HP.

| Champ | Description |
|-------|-------------|
| \`tempo_blue_hc\` | Jour Bleu — Heures Creuses |
| \`tempo_blue_hp\` | Jour Bleu — Heures Pleines |
| \`tempo_white_hc\` | Jour Blanc — Heures Creuses |
| \`tempo_white_hp\` | Jour Blanc — Heures Pleines |
| \`tempo_red_hc\` | Jour Rouge — Heures Creuses |
| \`tempo_red_hp\` | Jour Rouge — Heures Pleines |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 15.84, "tempo_blue_hc": 0.129200, "tempo_blue_hp": 0.160200, "tempo_white_hc": 0.148500, "tempo_white_hp": 0.189400, "tempo_red_hc": 0.141900, "tempo_red_hp": 0.756200 }
\`\`\`

### EJP — Effacement Jours de Pointe
Tarif normal la plupart du temps, tarif pointe très élevé 20 jours par an.

| Champ | Description |
|-------|-------------|
| \`ejp_normal\` | Prix du kWh en période Normale |
| \`ejp_peak\` | Prix du kWh en période de Pointe |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 13.75, "ejp_normal": 0.153100, "ejp_peak": 0.689400 }
\`\`\`

### SEASONAL — Saisonnier (2 saisons × HC/HP)
4 prix selon la saison et l'heure. Selon le fournisseur, les 2 saisons peuvent être :
- **Été / Hiver** : été = avril à octobre, hiver = novembre à mars
- **Éco / Sobriété** : Éco = 345 jours (saison basse), Sobriété = 20 jours (saison haute)

IMPORTANT : utiliser les champs \`summer\` pour la saison basse (été ou Éco) et \`winter\` pour la saison haute (hiver ou Sobriété), quel que soit le nom commercial.

| Champ | Description |
|-------|-------------|
| \`hc_price_summer\` | HC saison basse (été / Éco) |
| \`hp_price_summer\` | HP saison basse (été / Éco) |
| \`hc_price_winter\` | HC saison haute (hiver / Sobriété) |
| \`hp_price_winter\` | HP saison haute (hiver / Sobriété) |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price_summer": 0.142800, "hp_price_summer": 0.178500, "hc_price_winter": 0.167300, "hp_price_winter": 0.210900 }
\`\`\`

### BASE_WEEKEND — Base + Week-end
2 prix : un tarif semaine et un tarif week-end (souvent moins cher le week-end).

| Champ | Description |
|-------|-------------|
| \`base_price\` | Prix du kWh en semaine |
| \`base_price_weekend\` | Prix du kWh le week-end |

Exemple :
\`\`\`json
{ "power_kva": 6, "subscription_price": 12.03, "base_price": 0.208100, "base_price_weekend": 0.163500 }
\`\`\`

### HC_WEEKEND — HC/HP + Week-end
4 prix : HC et HP en semaine + HC et HP le week-end.

| Champ | Description |
|-------|-------------|
| \`hc_price\` | HC semaine |
| \`hp_price\` | HP semaine |
| \`hc_price_weekend\` | HC week-end |
| \`hp_price_weekend\` | HP week-end |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price": 0.163500, "hp_price": 0.208100, "hc_price_weekend": 0.142800, "hp_price_weekend": 0.178500 }
\`\`\`

### HC_NUIT_WEEKEND — HC Nuit + Week-end
Identique à HC_WEEKEND mais avec heures creuses étendues la nuit et le week-end. Mêmes champs.

| Champ | Description |
|-------|-------------|
| \`hc_price\` | HC (nuit + week-end) |
| \`hp_price\` | HP (jour semaine) |
| \`hc_price_weekend\` | HC week-end |
| \`hp_price_weekend\` | HP week-end |

Exemple :
\`\`\`json
{ "power_kva": 9, "subscription_price": 14.27, "hc_price": 0.152300, "hp_price": 0.215800, "hc_price_weekend": 0.138700, "hp_price_weekend": 0.185400 }
\`\`\`
${currentOffersSection}

## Règles générales

- **provider_name** : DOIT être exactement \`${providerName}\`
- **Tous les prix en TTC** (Toutes Taxes Comprises)
- **Séparateur décimal** : point (0.187702), PAS virgule
- **Précision** : 6 décimales pour les prix kWh (ex: 0.187702 €/kWh), 2 décimales pour les abonnements (ex: 12.03 €/mois)
- **subscription_price** = abonnement mensuel TTC en €/mois
- **offer_name** : ne doit PAS contenir la puissance ni le type d'offre
- **valid_from** : date de début de validité de la grille tarifaire (YYYY-MM-DD)
- **valid_until** : date de fin de validité si connue, sinon null
- **deprecated** : true si l'offre n'est plus commercialisée

## Paliers de prix

ATTENTION : certains fournisseurs appliquent des prix différents selon les tranches de puissance (ex: 3-6 kVA, 7-20 kVA, ≥21 kVA).

- Vérifie attentivement les changements de tarif entre chaque ligne du tableau
- Les cellules fusionnées dans les tableaux indiquent souvent un même prix pour plusieurs puissances
- Quand une cellule de prix est fusionnée sur plusieurs lignes, applique ce prix à TOUTES les puissances concernées
- Quand le prix change (nouvelle cellule), applique le nouveau prix aux puissances suivantes

## Puissances

- Inclure TOUTES les puissances proposées par le fournisseur pour chaque offre
- Les puissances courantes sont 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA mais certains fournisseurs proposent d'autres valeurs (4, 5, 7, 8, 10, 11, etc. ou 42, 48, 64 kVA)
- Retourne chaque puissance trouvée sur la source
- Si certaines puissances listées dans les offres existantes ne sont pas visibles sur la source fournie, ajoute un warning au niveau de l'offre : "Puissance XX kVA non visible sur la source - tarif à confirmer"

## Erreurs courantes à éviter

1. **HT vs TTC** : Ne pas confondre les prix HT et TTC. Toujours prendre la colonne TTC.
2. **Tarif réglementé vs tarif fournisseur** : Les tableaux affichent souvent les deux côte à côte. Prendre uniquement les colonnes du fournisseur (ex: "Tarif Alpiq"), pas les colonnes "Tarifs réglementés".
3. **HC et HP inversés** : Vérifier que les colonnes Heures Creuses et Heures Pleines ne sont pas inversées. HP est généralement plus cher que HC.
4. **Cellules fusionnées** : Attention aux cellules fusionnées qui masquent les changements de palier. Une cellule fusionnée sur plusieurs lignes = même prix pour toutes ces puissances.
5. **Colonnes tronquées** : Si certaines colonnes ne sont pas visibles sur la capture, ajouter un warning et ne pas inventer de valeurs.
6. **Virgule vs point** : Les sources françaises utilisent la virgule (0,1877). Convertir en point dans le JSON (0.1877).
7. **Noms de champs** : Utiliser EXACTEMENT les noms de champs indiqués pour chaque type. Ne pas inventer de variantes.

## Warnings

Ajoute un champ "warning" dans les cas suivants :
- Offre qui ne correspond pas exactement à un type standard
- Prix incertain ou partiellement visible
- Colonnes tronquées sur la capture
- Puissances manquantes par rapport aux offres existantes
- Conditions spéciales de l'offre

Exemples :
- "warning": "Cette offre a des horaires HC spécifiques non standards"
- "warning": "Offre avec remise variable non modélisable dans les types standards"
- "warning": "Prix HP pour puissances 6-20 kVA non visibles sur la capture - valeurs présumées identiques à ≥21 kVA"
- "warning": "Puissance 64 kVA non visible sur la source fournie"

## Sortie attendue

Avant le JSON, affiche un résumé sous cette forme :

**Résumé :**
- Offre X (TYPE) : Y puissance(s)
- Offre Z (TYPE) : Y puissance(s)
- **Total : N lignes tarifaires**

Puis retourne le JSON complet.`
  }

  // Importer un JSON multi-offres généré par une IA
  const importAIJson = async () => {
    try {
      // Rafraîchir les offres depuis le serveur avant comparaison
      // (évite les faux "Déjà en base" si des offres ont été supprimées ailleurs)
      const freshOffers = await queryClient.fetchQuery({
        queryKey: ['energy-offers', 'with-history'],
        queryFn: async () => {
          const response = await energyApi.getOffers(undefined, true)
          if (response.success && Array.isArray(response.data)) {
            return response.data as EnergyOffer[]
          }
          return []
        },
        staleTime: 0,
      })
      const freshOffersArray = Array.isArray(freshOffers) ? freshOffers : []
      // Nettoyer le JSON (retirer les blocs markdown ```json ... ```)
      let cleaned = aiJsonInput.trim()
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim()
      }

      const data = JSON.parse(cleaned)

      // Valider la structure
      if (!data.offers || !Array.isArray(data.offers) || data.offers.length === 0) {
        setAiImportResult({
          success: false,
          message: 'Le JSON doit contenir un tableau "offers" non vide.',
        })
        return
      }

      // Validation complète : collecter toutes les erreurs d'un coup
      const validationErrors: string[] = []

      // 1. provider_name
      const currentProvider = sortedProviders.find(p => p.id === filterProvider)
      const expectedProviderName = currentProvider?.name || ''
      if (!data.provider_name) {
        validationErrors.push(`Champ "provider_name" manquant. Attendu : "${expectedProviderName}"`)
      } else {
        const jsonProvider = data.provider_name.trim().toLowerCase()
        const expected = expectedProviderName.trim().toLowerCase()
        if (jsonProvider !== expected) {
          validationErrors.push(`Fournisseur "${data.provider_name}" ≠ fournisseur sélectionné "${expectedProviderName}"`)
        }
      }

      // 2. Structure de chaque offre
      const validOfferKeys = ['offer_name', 'offer_type', 'valid_from', 'valid_until', 'special_conditions', 'warning', 'deprecated', 'power_variants']
      const allValidVariantKeys = ['power_kva', 'subscription_price', 'base_price', 'base_price_weekend', 'hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend', 'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter', 'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp', 'ejp_normal', 'ejp_peak']
      const validRootKeys = ['provider_name', 'data_source', 'extraction_date', 'offers']
      const unknownRootKeys = Object.keys(data).filter(k => !validRootKeys.includes(k))
      if (unknownRootKeys.length > 0) {
        validationErrors.push(`Clé(s) inconnue(s) à la racine : ${unknownRootKeys.join(', ')}`)
      }

      for (let i = 0; i < data.offers.length; i++) {
        const offer = data.offers[i]
        const offerLabel = `Offre #${i + 1}${offer?.offer_name ? ` (${offer.offer_name})` : ''}`
        if (typeof offer !== 'object' || offer === null) {
          validationErrors.push(`${offerLabel} : n'est pas un objet valide`)
          continue
        }
        if (!offer.offer_name || typeof offer.offer_name !== 'string') {
          validationErrors.push(`${offerLabel} : "offer_name" manquant`)
        }
        if (!offer.offer_type || typeof offer.offer_type !== 'string') {
          validationErrors.push(`${offerLabel} : "offer_type" manquant`)
        }
        if (offer.deprecated !== true && (!offer.power_variants || !Array.isArray(offer.power_variants))) {
          validationErrors.push(`${offerLabel} : "power_variants" manquant ou invalide`)
        }
        const unknownOfferKeys = Object.keys(offer).filter(k => !validOfferKeys.includes(k))
        if (unknownOfferKeys.length > 0) {
          validationErrors.push(`${offerLabel} : clé(s) inconnue(s) : ${unknownOfferKeys.join(', ')}`)
        }
        if (offer.power_variants && Array.isArray(offer.power_variants)) {
          for (let j = 0; j < offer.power_variants.length; j++) {
            const v = offer.power_variants[j]
            const variantLabel = `${offerLabel}, variante #${j + 1}`
            if (!v.power_kva || typeof v.power_kva !== 'number') {
              validationErrors.push(`${variantLabel} : "power_kva" manquant ou invalide`)
            }
            if (v.subscription_price === undefined || typeof v.subscription_price !== 'number') {
              validationErrors.push(`${variantLabel} : "subscription_price" manquant ou invalide`)
            }
            const unknownKeys = Object.keys(v).filter(k => !allValidVariantKeys.includes(k))
            if (unknownKeys.length > 0) {
              validationErrors.push(`${variantLabel} : clé(s) inconnue(s) : ${unknownKeys.join(', ')}`)
            }
          }
        }
      }

      if (validationErrors.length > 0) {
        setAiImportResult({
          success: false,
          message: `Validation échouée (${validationErrors.length} erreur${validationErrors.length > 1 ? 's' : ''}) :\n${validationErrors.slice(0, 15).join('\n')}${validationErrors.length > 15 ? `\n... et ${validationErrors.length - 15} autre(s)` : ''}`,
        })
        return
      }

      // Types supportés par le simulateur et le backend
      const supportedTypes = ['BASE', 'BASE_WEEKEND', 'HC_HP', 'HC_NUIT_WEEKEND', 'HC_WEEKEND', 'TEMPO', 'EJP', 'SEASONAL']
      // Types non intégrés au simulateur mais acceptés dans le JSON avec conversion automatique
      const unsupportedTypeConversions: Record<string, string> = {
        'ZEN_WEEK_END': 'BASE_WEEKEND',
        'ZEN_WEEK_END_HP_HC': 'HC_WEEKEND',
        'ZEN_FLEX': 'SEASONAL',
      }
      const knownTypes = [...supportedTypes, ...Object.keys(unsupportedTypeConversions)]
      const details: Array<{
        offer_type: string
        offer_name: string
        matched: number
        added: number
        unchanged?: number
        deprecated?: boolean
        warning?: string
      }> = []

      const updatedOffers = { ...editedOffers }
      const addedPowers: Array<{ power: number; fields: Record<string, string>; offer_type: string; offer_name: string; valid_from?: string; valid_to?: string }> = []
      const newDeprecated: typeof deprecatedOffers = []
      const historicalGroups: typeof newGroups = []
      const unchangedIds = new Set<string>()

      // Mapping des types synonymes : certains types IA correspondent à des types différents en base
      // Ex: le scraper EDF crée les offres Zen Weekend avec le type BASE_WEEKEND, pas ZEN_WEEK_END
      const typeSynonyms: Record<string, string[]> = {
        'ZEN_WEEK_END': ['BASE_WEEKEND'],
        'BASE_WEEKEND': ['ZEN_WEEK_END'],
        'ZEN_WEEK_END_HP_HC': ['HC_WEEKEND', 'HC_NUIT_WEEKEND'],
        'HC_WEEKEND': ['ZEN_WEEK_END_HP_HC'],
        'HC_NUIT_WEEKEND': ['ZEN_WEEK_END_HP_HC'],
        'ZEN_FLEX': ['SEASONAL'],
        'SEASONAL': ['ZEN_FLEX'],
      }

      // Cherche les offres ACTIVES du fournisseur par type, avec fallback sur les types synonymes
      // Filtre is_active !== false pour exclure les anciennes versions (même condition que l'export)
      const findOffersByType = (offerType: string): { offers: typeof freshOffersArray; resolvedType: string } => {
        const direct = freshOffersArray.filter(o => o.provider_id === filterProvider && o.offer_type === offerType && o.is_active !== false)
        if (direct.length > 0) return { offers: direct, resolvedType: offerType }
        // Fallback sur les synonymes
        for (const synonym of (typeSynonyms[offerType] || [])) {
          const synOffers = freshOffersArray.filter(o => o.provider_id === filterProvider && o.offer_type === synonym && o.is_active !== false)
          if (synOffers.length > 0) return { offers: synOffers, resolvedType: synonym }
        }
        return { offers: [], resolvedType: offerType }
      }

      // Dédupliquer les offres du JSON : quand une offre individuelle ("Tarif Bleu - BASE 18 kVA",
      // 1 seule variante) coexiste avec une offre groupée ("Tarif Bleu", 9 variantes) du même type,
      // les individuelles sont redondantes → on les supprime pour éviter la double-écriture
      const deduplicatedOffers = (() => {
        // Regrouper par (offer_type + nom nettoyé)
        const groups = new Map<string, typeof data.offers>()
        for (const offer of data.offers) {
          const cleanName = (offer.offer_name || '')
            .replace(/\s*-?\s*\d+\s*kVA/gi, '')
            .replace(/\s*-?\s*(BASE|HC[_\s]?HP|TEMPO|EJP)/gi, '')
            .replace(/\s*-\s*-\s*/g, ' - ')
            .replace(/\s+/g, ' ')
            .replace(/\s*-\s*$/, '')
            .trim()
            .toLowerCase() || (offer.offer_name || '').toLowerCase()
          const key = `${offer.offer_type}##${cleanName}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(offer)
        }
        // Pour chaque groupe, garder la groupée (multi-variantes) et ignorer les individuelles
        const result: typeof data.offers = []
        for (const [, offersInGroup] of groups) {
          if (offersInGroup.length === 1) {
            result.push(offersInGroup[0])
            continue
          }
          // Séparer : offres multi-variantes (groupées) vs mono-variante (individuelles)
          const multiVariant = offersInGroup.filter((o: typeof offersInGroup[0]) => (o.power_variants?.length || 0) > 1)
          const singleVariant = offersInGroup.filter((o: typeof offersInGroup[0]) => (o.power_variants?.length || 0) <= 1)
          // Garder toutes les offres multi-variantes (groupées)
          result.push(...multiVariant)
          // Garder les individuelles UNIQUEMENT si aucune groupée ne couvre la même puissance
          const coveredPowers = new Set<number>()
          for (const mv of multiVariant) {
            for (const v of (mv.power_variants || [])) {
              if (v.power_kva) coveredPowers.add(v.power_kva)
            }
          }
          for (const sv of singleVariant) {
            const power = sv.power_variants?.[0]?.power_kva
            if (!power || !coveredPowers.has(power)) {
              result.push(sv)
            }
            // Sinon : individuelle redondante avec la groupée → ignorée
          }
        }
        return result
      })()

      for (const offer of deduplicatedOffers) {
        // Flag pour les offres dépréciées avec données de prix (import historique)
        let isHistoricalImport = false

        // Offre marquée comme supprimée par l'IA
        if (offer.deprecated === true) {
          // Si l'offre dépréciée a des données de prix, l'importer comme offre historique
          if (offer.power_variants && Array.isArray(offer.power_variants) && offer.power_variants.length > 0) {
            isHistoricalImport = true
            // Ne pas `continue` → le traitement régulier s'applique ci-dessous
          } else {
            // Offre dépréciée SANS données de prix → marquer les offres existantes pour suppression
            const matchingOffers = freshOffersArray.filter(o =>
              o.provider_id === filterProvider && o.offer_type === offer.offer_type
            )
            const byName = matchingOffers.filter(o =>
              getCleanOfferName(o.name).toLowerCase().includes(offer.offer_name?.toLowerCase() || '')
            )
            const targetOffers = byName.length > 0 ? byName : matchingOffers
            if (targetOffers.length > 0) {
              newDeprecated.push({
                offer_type: offer.offer_type || '???',
                offer_name: offer.offer_name || '???',
                offer_ids: targetOffers.map(o => o.id),
                warning: offer.warning || 'Offre signalée comme supprimée ou remplacée.',
              })
            }
            details.push({
              offer_type: offer.offer_type || '???',
              offer_name: offer.offer_name || '???',
              matched: 0,
              added: 0,
              deprecated: true,
              warning: offer.warning || 'Offre signalée comme supprimée ou remplacée.',
            })
            continue
          }
        }
        // Valider le type d'offre
        if (!offer.offer_type || !knownTypes.includes(offer.offer_type)) {
          details.push({
            offer_type: offer.offer_type || '???',
            offer_name: offer.offer_name || '???',
            matched: 0,
            added: 0,
            warning: `Type d'offre inconnu : "${offer.offer_type}". Types valides : ${supportedTypes.join(', ')}`,
          })
          continue
        }

        // Convertir les types non intégrés au simulateur vers leur équivalent
        const convertedType = unsupportedTypeConversions[offer.offer_type]
        if (convertedType) {
          offer.offer_type = convertedType
        }

        // Valider les variantes de puissance
        if (!offer.power_variants || !Array.isArray(offer.power_variants) || offer.power_variants.length === 0) {
          details.push({
            offer_type: offer.offer_type,
            offer_name: offer.offer_name || '???',
            matched: 0,
            added: 0,
            warning: 'Aucune variante de puissance fournie.',
          })
          continue
        }

        // Dédupliquer les variantes par puissance (garder celle avec l'abo le plus élevé = tarif le plus récent)
        const variantsByPower = new Map<number, typeof offer.power_variants[0]>()
        for (const variant of offer.power_variants) {
          if (!variant.power_kva) continue
          const existing = variantsByPower.get(variant.power_kva)
          if (!existing || (variant.subscription_price || 0) > (existing.subscription_price || 0)) {
            variantsByPower.set(variant.power_kva, variant)
          }
        }
        offer.power_variants = Array.from(variantsByPower.values())

        // Chercher les offres existantes du fournisseur pour ce type (ou types synonymes)
        const { offers: existingForType } = findOffersByType(offer.offer_type)

        // Affiner par nom de groupe pour éviter de matcher une offre JSON
        // sur un groupe existant portant un nom différent
        // Ex: "Zen Online - Base" ne doit pas écraser "Tarif Bleu - BASE"
        // Matching strict : fournisseur (filterProvider) + type (findOffersByType) + nom
        let existingFiltered = existingForType
        if (isHistoricalImport) {
          // Import historique (offre dépréciée) : toujours créer de nouvelles entrées
          existingFiltered = []
        } else if (offer.offer_name && existingForType.length > 0) {
          const cleanJson = getCleanOfferName(offer.offer_name).toLowerCase()
          const nameMatch = existingForType.filter(o => {
            const cleanDb = getCleanOfferName(o.name).toLowerCase()
            return cleanDb === cleanJson || cleanDb.includes(cleanJson) || cleanJson.includes(cleanDb)
          })
          // Pas de match par nom → nouvelle offre (même si le type existe déjà)
          existingFiltered = nameMatch.length > 0 ? nameMatch : []

          // Offre active (sans valid_until) avec valid_from : vérifier si c'est une nouvelle période
          // Si le valid_from de l'import ne correspond à aucune offre active existante,
          // c'est une nouvelle grille tarifaire → créer au lieu de modifier
          if (existingFiltered.length > 0 && offer.valid_from && !offer.valid_until) {
            const importDate = new Date(offer.valid_from).toLocaleDateString('sv-SE')
            const hasMatchingPeriod = existingFiltered.some(o => {
              if (o.valid_to) return false // ignorer les offres expirées
              const existDate = o.valid_from ? new Date(o.valid_from).toLocaleDateString('sv-SE') : ''
              return existDate === importDate
            })
            if (!hasMatchingPeriod) {
              // Aucune offre active avec le même valid_from → nouvelle période tarifaire
              existingFiltered = []
            }
          }
        }

        let matched = 0
        let added = 0
        let unchanged = 0
        const fieldKeys = getFieldKeysForOfferType(offer.offer_type)

        // Vérifier les champs de prix sur la première variante
        if (offer.power_variants.length > 0) {
          const sampleVariant = offer.power_variants[0]
          const allPriceFields = ['base_price', 'base_price_weekend', 'hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend', 'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter', 'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp', 'ejp_normal', 'ejp_peak']
          const missingFields = fieldKeys.filter(k => sampleVariant[k] === undefined || sampleVariant[k] === null)
          const unexpectedFields = allPriceFields.filter(k => !fieldKeys.includes(k) && sampleVariant[k] !== undefined && sampleVariant[k] !== null)

          if (missingFields.length > 0 || unexpectedFields.length > 0) {
            const warnings: string[] = []
            if (missingFields.length > 0) {
              warnings.push(`Champs manquants pour ${offer.offer_type} : ${missingFields.join(', ')}`)
            }
            if (unexpectedFields.length > 0) {
              warnings.push(`Champs inattendus pour ${offer.offer_type} : ${unexpectedFields.join(', ')} (attendus : ${fieldKeys.join(', ')})`)
            }
            details.push({
              offer_type: offer.offer_type,
              offer_name: offer.offer_name || offer.offer_type,
              matched: 0,
              added: 0,
              warning: warnings.join('. '),
            })
            continue
          }
        }

        // Import historique : vérifier d'abord si l'offre existe déjà en BDD
        // avant de créer un nouveau groupe
        if (isHistoricalImport) {
          // Chercher les offres existantes (y compris inactives) pour ce type et nom
          const allExistingForType = freshOffersArray.filter(o =>
            o.provider_id === filterProvider && o.offer_type === offer.offer_type
          )
          const cleanJson = getCleanOfferName(offer.offer_name || '').toLowerCase()
          const matchingExisting = cleanJson
            ? allExistingForType.filter(o => {
              const cleanDb = getCleanOfferName(o.name).toLowerCase()
              return cleanDb === cleanJson || cleanDb.includes(cleanJson) || cleanJson.includes(cleanDb)
            })
            : allExistingForType

          // Vérifier si toutes les variantes existent déjà avec les mêmes prix et période
          const importDate = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : ''
          const importDateTo = offer.valid_until ? new Date(offer.valid_until).toLocaleDateString('sv-SE') : ''
          let allUnchanged = true
          for (const variant of offer.power_variants) {
            if (!variant.power_kva || !variant.subscription_price) continue
            // Chercher une offre existante avec cette puissance et la même période
            // Comparaison en heure locale pour éviter les décalages UTC (ex: 23:00 UTC = lendemain en CET)
            const existingMatch = matchingExisting.find(o => {
              if ((o.power_kva || 0) !== variant.power_kva) return false
              const existDate = o.valid_from ? new Date(o.valid_from).toLocaleDateString('sv-SE') : ''
              const existDateTo = o.valid_to ? new Date(o.valid_to).toLocaleDateString('sv-SE') : ''
              return existDate === importDate && existDateTo === importDateTo
            })
            if (!existingMatch) {
              allUnchanged = false
              break
            }
            // Vérifier que les prix sont identiques
            const allFieldsToCheck = ['subscription_price', ...fieldKeys]
            for (const key of allFieldsToCheck) {
              const origVal = Number((existingMatch as unknown as Record<string, unknown>)[key])
              const newVal = key === 'subscription_price' ? Number(variant.subscription_price) : Number(variant[key])
              if (!isNaN(origVal) && !isNaN(newVal) && Math.abs(origVal - newVal) > 0.00001) {
                allUnchanged = false
                break
              }
            }
            if (!allUnchanged) break
          }

          if (allUnchanged) {
            // Offre historique identique en BDD → ajouter au récap avec flag "alreadyInDb"
            // Ne PAS ajouter à unchangedIds pour éviter de mélanger avec l'offre courante
            const groupPowersUnchanged: Array<{ power: number; fields: Record<string, string> }> = []
            for (const variant of offer.power_variants) {
              if (!variant.power_kva || !variant.subscription_price) continue
              const fields: Record<string, string> = {
                subscription_price: String(variant.subscription_price),
              }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) {
                  fields[key] = String(variant[key])
                }
              }
              groupPowersUnchanged.push({ power: variant.power_kva, fields })
              unchanged++
            }
            if (groupPowersUnchanged.length > 0) {
              historicalGroups.push({
                name: offer.offer_name || offer.offer_type,
                validFrom: offer.valid_from || '',
                validTo: offer.valid_until || '',
                offer_type: offer.offer_type,
                alreadyInDb: true,
                powers: groupPowersUnchanged,
              })
            }
          } else {
            // Des différences existent → créer un nouveau groupe
            const groupPowers: Array<{ power: number; fields: Record<string, string> }> = []
            for (const variant of offer.power_variants) {
              if (!variant.power_kva || !variant.subscription_price) continue
              const fields: Record<string, string> = {
                subscription_price: String(variant.subscription_price),
              }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) {
                  fields[key] = String(variant[key])
                }
              }
              groupPowers.push({ power: variant.power_kva, fields })
              added++
            }
            if (groupPowers.length > 0) {
              historicalGroups.push({
                name: offer.offer_name || offer.offer_type,
                validFrom: offer.valid_from || '',
                validTo: offer.valid_until || '',
                offer_type: offer.offer_type,
                powers: groupPowers,
              })
            }
          }
        } else {
          for (const variant of offer.power_variants) {
            if (!variant.power_kva || !variant.subscription_price) continue

            // Chercher une offre existante avec cette puissance (dans le groupe filtré par nom)
            // Prioriser les offres actives (sans valid_to) pour éviter de matcher avec une ancienne version
            const candidatesByPower = existingFiltered.filter(o => (o.power_kva || 0) === variant.power_kva)
            let existing = candidatesByPower.find(o => !o.valid_to)
            if (!existing && candidatesByPower.length > 0) {
              // Fallback : prendre la plus récente (valid_from le plus récent)
              existing = candidatesByPower.sort((a, b) => {
                const dateA = a.valid_from ? new Date(a.valid_from).getTime() : 0
                const dateB = b.valid_from ? new Date(b.valid_from).getTime() : 0
                return dateB - dateA
              })[0]
            }

            if (existing) {
              // Vérifier si les prix ont réellement changé avant d'écraser
              const allFieldsToCheck = ['subscription_price', ...fieldKeys]
              let hasRealChange = false
              for (const key of allFieldsToCheck) {
                const origVal = Number((existing as unknown as Record<string, unknown>)[key])
                const newVal = key === 'subscription_price' ? Number(variant.subscription_price) : Number(variant[key])
                if (!isNaN(origVal) && !isNaN(newVal) && Math.abs(origVal - newVal) > 0.00001) {
                  hasRealChange = true
                  break
                }
                if (isNaN(origVal) !== isNaN(newVal)) {
                  hasRealChange = true
                  break
                }
              }
              // Vérifier aussi le valid_from (uniquement si l'offre existante a déjà un valid_from)
              // Si l'existante n'a pas de valid_from, l'import ajoute juste l'info sans constituer un changement
              // Comparaison sur la date uniquement (YYYY-MM-DD), l'heure n'est pas significative
              if (offer.valid_from) {
                const existingValidFrom = (existing as unknown as Record<string, unknown>).valid_from
                if (existingValidFrom) {
                  const importDate = new Date(offer.valid_from).toLocaleDateString('sv-SE')
                  const existingDate = new Date(String(existingValidFrom)).toLocaleDateString('sv-SE')
                  if (importDate !== existingDate) {
                    hasRealChange = true
                  }
                }
              }
              if (hasRealChange) {
                // Injecter dans editedOffers uniquement si changement réel
                updatedOffers[existing.id] = { ...(updatedOffers[existing.id] || {}) }
                updatedOffers[existing.id].subscription_price = String(variant.subscription_price)
                for (const key of fieldKeys) {
                  if (variant[key] !== undefined) {
                    updatedOffers[existing.id][key] = String(variant[key])
                  }
                }
                if (offer.valid_from) {
                  updatedOffers[existing.id].valid_from = offer.valid_from
                }
                matched++
              } else {
                unchangedIds.add(existing.id)
                unchanged++
              }
            } else {
              // Puissance non existante : créer dans newPowersData avec offer_type
              const fields: Record<string, string> = {
                subscription_price: String(variant.subscription_price),
              }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) {
                  fields[key] = String(variant[key])
                }
              }
              addedPowers.push({
                power: variant.power_kva,
                fields,
                offer_type: offer.offer_type,
                offer_name: offer.offer_name || offer.offer_type,
                valid_from: offer.valid_from,
              })
              added++
            }
          }
        }

        details.push({
          offer_type: offer.offer_type,
          offer_name: offer.offer_name || offer.offer_type,
          matched,
          added,
          unchanged,
          deprecated: isHistoricalImport || undefined,
          warning: offer.warning,
        })
      }

      // Appliquer les modifications (reset avant pour éviter les doublons lors d'un réimport)
      setEditedOffers(updatedOffers)
      setUnchangedOfferIds(unchangedIds)
      setNewPowersData(addedPowers)
      setNewGroups(historicalGroups)
      setDeprecatedOffers(newDeprecated)

      // Si l'import a touché des types différents du filtre actuel, on passe en mode "all"
      const importedTypes = details.map(d => d.offer_type)
      const hasMultipleTypes = new Set(importedTypes).size > 1
      if (hasMultipleTypes && filterOfferType !== 'all') {
        // Empêcher le useEffect de reset newPowersData/powersToRemove
        skipFilterResetRef.current = true
        setFilterOfferType('all')
      }

      const totalMatched = details.reduce((sum, d) => sum + d.matched, 0)
      const totalAdded = details.reduce((sum, d) => sum + d.added, 0)
      const totalUnchanged = details.reduce((sum, d) => sum + (d.unchanged || 0), 0)
      const totalDeprecated = details.filter(d => d.deprecated).length

      const parts: string[] = []
      if (totalMatched > 0) {
        parts.push(`${totalMatched} mise(s) à jour`)
      }
      if (totalUnchanged > 0) {
        parts.push(`${totalUnchanged} inchangée(s)`)
      }
      if (totalAdded > 0) {
        parts.push(`${totalAdded} nouvelle(s) puissance(s)`)
      }
      if (totalDeprecated > 0) {
        parts.push(`${totalDeprecated} offre(s) à supprimer`)
      }

      const summary = parts.length > 0 ? parts.join(', ') : 'aucune modification'
      setAiImportResult({
        success: true,
        message: `${details.length} offre(s) importée(s) : ${summary}.`,
        details,
      })

      const hasChanges = totalMatched > 0 || totalAdded > 0 || totalDeprecated > 0 || historicalGroups.length > 0
      if (hasChanges) {
        toast.success(`Import IA réussi : ${summary}`)
        // Fermer le mode IA et ouvrir le récapitulatif de soumission
        setShowAIMode(false)
        openRecapModal()
      } else {
        toast.info(`Import IA : ${summary}`)
      }
    } catch (e) {
      setAiImportResult({
        success: false,
        message: `Erreur de parsing JSON : ${e instanceof Error ? e.message : 'format invalide'}`,
      })
      toast.error('Erreur lors du parsing du JSON')
    }
  }

  // Helper pour formater la valeur
  const formatValue = (value: string | number | undefined): string => {
    if (value === undefined || value === null || value === '') return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return num.toString()
  }

  // Helper pour obtenir la couleur du label selon le type de tarif
  const getLabelColor = (label: string) => {
    // Tempo : couleurs par jour
    if (label.includes('Bleu')) return 'text-blue-600 dark:text-blue-400'
    if (label.includes('Blanc')) return 'text-gray-500 dark:text-gray-300'
    if (label.includes('Rouge')) return 'text-red-600 dark:text-red-400'
    // Saisonnier
    if (label.includes('Été')) return 'text-amber-600 dark:text-amber-400'
    if (label.includes('Hiver')) return 'text-cyan-600 dark:text-cyan-400'
    // Week-end
    if (label.includes('WE')) return 'text-purple-600 dark:text-purple-400'
    // HC/HP standard
    if (label === 'HC') return 'text-blue-600 dark:text-blue-400'
    if (label === 'HP') return 'text-red-600 dark:text-red-400'
    // EJP
    if (label === 'Pointe') return 'text-red-600 dark:text-red-400'
    return 'text-gray-600 dark:text-gray-400'
  }

  // Configuration du nombre de colonnes de tarifs par type d'offre (tout sur une seule ligne)
  const getTariffColumns = (offerType: string): number => {
    switch (offerType) {
      case 'BASE':
        return 1  // Base
      case 'HC_HP':
      case 'EJP':
        return 2  // HC/HP ou Normal/Pointe
      case 'BASE_WEEKEND':
        return 2  // Base + Base WE
      case 'HC_WEEKEND':
      case 'HC_NUIT_WEEKEND':
        return 4  // HC/HP + HC WE/HP WE
      case 'SEASONAL':
        return 4  // HC/HP × 2 saisons
      case 'TEMPO':
        return 6  // Bleu HC/HP + Blanc HC/HP + Rouge HC/HP
      default:
        return 2  // Défaut
    }
  }

  // Render un champ (éditable en mode édition, lecture seule sinon)
  // compact=true : labels empilés au-dessus de la valeur (pour grilles denses comme Tempo)
  const renderEditableField = (label: string, fieldKey: string, unit: string, offer: EnergyOffer, compact = false) => {
    const editedValue = editedOffers[offer.id]?.[fieldKey]
    const originalValue = (offer as unknown as Record<string, unknown>)[fieldKey]
    const displayValue = editedValue !== undefined ? editedValue : formatValue(originalValue as string | number | undefined)
    const isModified = editedValue !== undefined && editedValue !== String(originalValue ?? '')

    // Mode compact : label au-dessus de la valeur (pour Tempo, Seasonal, etc.)
    if (compact) {
      if (!isEditMode) {
        return (
          <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex flex-col items-center min-w-0">
            <span className={`text-xs font-semibold ${getLabelColor(label)}`}>{label}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {displayValue || '-'}
            </span>
          </div>
        )
      }
      return (
        <div key={`${offer.id}-${fieldKey}`} className="flex-1 flex flex-col items-center min-w-0 gap-0.5">
          <span className={`text-xs font-semibold ${getLabelColor(label)}`}>{label}</span>
          <input
            type="number"
            step="0.0001"
            value={displayValue}
            onChange={(e) => updateField(offer.id, fieldKey, e.target.value)}
            className={`w-full min-w-[60px] max-w-[100px] px-2 py-1 text-sm font-bold text-center border-2 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:outline-none ${
              isModified
                ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
        </div>
      )
    }

    // Mode standard : label et valeur en ligne
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

    // Mode édition standard : champ input en ligne
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

  // Helper pour rendre une ligne de nouvelle puissance
  const renderNewPowerRow = (newPower: typeof newPowersData[0], index: number) => {
    const isDuplicate = isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name, newPower.valid_from, newPower.valid_to)
    const isIncomplete = !isNewPowerComplete(newPower)
    const hasError = isDuplicate || isIncomplete
    const effectiveType = newPower.offer_type || filterOfferType
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
              {newPower.offer_type && (
                <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded shrink-0">{newPower.offer_type}</span>
              )}
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
            {effectiveType === 'BASE' && (
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

            {effectiveType === 'HC_HP' && (
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

            {effectiveType === 'TEMPO' && (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                Tarifs Tempo à renseigner après validation
              </div>
            )}

            {(effectiveType === 'BASE_WEEKEND' || effectiveType === 'HC_WEEKEND' || effectiveType === 'SEASONAL' || effectiveType === 'EJP') && (
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
    )
  }

  // Helper pour extraire et nettoyer le nom de l'offre
  const getCleanOfferName = (offerName: string): string => {
    // Étape 1 : retirer le suffixe kVA
    let name = offerName.replace(/\s*-?\s*\d+\s*kVA/gi, '')
    // Conserver le nom après retrait kVA comme fallback (ex: "Tempo" reste valide)
    const nameAfterKva = name.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().replace(/\s*-\s*$/, '').trim()
    // Étape 2 : retirer les mots-clés de type d'offre (peut donner une chaîne vide si le nom EST un type)
    name = name.replace(/\s*-?\s*(BASE|HC[_\s]?HP|TEMPO|EJP)/gi, '')
    name = name.replace(/\s*-\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
    name = name.replace(/\s*-\s*$/, '').trim()
    return name || nameAfterKva || offerName
  }

  // Helper pour générer le JSON d'export d'un ensemble d'offres
  // Utilisé par : copie fournisseur, copie type, copie offre individuelle
  const buildOfferExportJson = (offers: typeof offersArray, providerName: string) => {
    const grouped: Record<string, typeof offers> = {}
    for (const offer of offers) {
      const groupName = offer.name.replace(/\s*-\s*\d+\s*kVA$/i, '').trim()
      const periodKey = offer.valid_to
        ? `${offer.valid_from || ''}|${offer.valid_to}`
        : 'active'
      const key = `${offer.offer_type}##${groupName}##${periodKey}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(offer)
    }
    const exportOffers: Record<string, unknown>[] = []
    for (const [key, grp] of Object.entries(grouped)) {
      const [offerType, groupName, periodKey] = key.split('##')
      const isDeprecated = periodKey !== 'active'
      const priceFields = getFieldKeysForOfferType(offerType)
      const byPower = new Map<number, typeof grp[0]>()
      for (const o of grp) {
        const p = o.power_kva || 0
        const existing = byPower.get(p)
        if (!existing || (o.subscription_price || 0) > (existing.subscription_price || 0)) {
          byPower.set(p, o)
        }
      }
      const sortedOffers = Array.from(byPower.values()).sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))
      const variants = sortedOffers.map(o => {
        const variant: Record<string, unknown> = {
          power_kva: typeof o.power_kva === 'number' ? o.power_kva : Number(o.power_kva) || 0,
          subscription_price: typeof o.subscription_price === 'number' ? o.subscription_price : Number(o.subscription_price) || 0,
        }
        for (const field of priceFields) {
          const val = (o as unknown as Record<string, unknown>)[field]
          variant[field] = (val != null) ? (typeof val === 'number' ? val : Number(val) || 0) : 0
        }
        return variant
      })
      const entry: Record<string, unknown> = {
        offer_name: groupName,
        offer_type: offerType,
        power_variants: variants,
      }
      if (isDeprecated) {
        entry.deprecated = true
        if (grp[0].valid_from) entry.valid_from = grp[0].valid_from
        if (grp[0].valid_to) entry.valid_until = grp[0].valid_to
      } else if (grp[0].valid_from) {
        entry.valid_from = grp[0].valid_from
      }
      exportOffers.push(entry)
    }
    return {
      provider_name: providerName,
      data_source: 'Export MyElectricalData',
      extraction_date: new Date().toISOString().split('T')[0],
      offers: exportOffers,
    }
  }

  // Helper pour copier un JSON dans le presse-papier
  const copyJsonToClipboard = (data: unknown, successMessage: string) => {
    const json = JSON.stringify(data, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      toast.success(successMessage)
    }).catch(() => {
      toast.error('Impossible de copier dans le presse-papier')
    })
  }

  // Helper pour formater la puissance
  const formatPower = (offer: { power_kva?: number }): string | null => {
    return offer.power_kva ? `${offer.power_kva} kVA` : null
  }

  // Helper pour extraire le nom sans la période depuis une clé de groupe
  const getGroupNameWithoutPeriod = (groupKey: string): string => {
    return groupKey.split('##')[0]
  }

  // Helper pour extraire et formater la période depuis une clé de groupe
  const getGroupPeriodLabel = (groupKey: string): string => {
    const parts = groupKey.split('##')
    if (parts.length < 2) return ''
    const validFrom = parts[1]
    const validTo = parts[2]
    if (validFrom === 'active') return ''
    if (validTo === 'active' || !validTo) {
      return `Valide depuis ${new Date(validFrom).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
    }
    return `${new Date(validFrom).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} → ${new Date(validTo).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`
  }

  // Helper pour soumettre toutes les modifications en un seul lot (batch)
  // Envoie une seule notification Slack/email au lieu d'une par contribution
  const submitAllModifications = async (directApply: boolean = false) => {
    const currentProvider = sortedProviders.find(p => p.id === filterProvider)

    // Soumission : inclure TOUTES les offres modifiées du fournisseur
    // (pas seulement le type actuellement affiché, car l'import IA peut toucher plusieurs types)
    const providerOffers = currentProvider ? offersArray.filter((offer) =>
      offer.provider_id === currentProvider.id
    ) : []

    // Récupérer le nom de base des offres existantes (sans la puissance)
    const existingBaseOfferName = providerOffers.length > 0 && currentProvider
      ? getCleanOfferName(providerOffers[0].name)
      : currentProvider ? `${currentProvider.name} - ${filterOfferType}` : ''

    const modifiedOffers = providerOffers.filter(offer => isOfferModified(offer))
    const hasProviderModifications = modifiedOffers.length > 0 || newPowersData.length > 0 || powersToRemove.length > 0 || newGroups.some(g => !g.alreadyInDb) || hasModifiedGroupNames || deprecatedOffers.length > 0
    const hasProviderDeletions = providersToRemove.length > 0

    if (!hasProviderModifications && !hasProviderDeletions) return

    setSubmittingOffers(true)

    // Helper pour parser les valeurs numériques en évitant NaN
    const parsePrice = (editedValue: string | undefined, originalValue: number | undefined): number | undefined => {
      if (editedValue !== undefined && editedValue !== '') {
        const parsed = parseFloat(editedValue)
        return isNaN(parsed) ? originalValue : parsed
      }
      return originalValue
    }

    // Collecter toutes les contributions dans un tableau
    const allContributions: ContributionData[] = []

    // Modifications de tarifs existants (filtrer les offres exclues du récap)
    if (currentProvider) {
      for (const offer of modifiedOffers.filter(o => !recapExcludedPowers.has(`modified-${o.id}`))) {
        const edited = editedOffers[offer.id] || {}
        const powerKva = offer.power_kva || 6

        // Si valid_from ET valid_to sont définis et différents de l'offre existante,
        // c'est un ajout d'offre historique (pas un remplacement de l'offre en cours)
        const hasNewValidTo = edited.valid_to !== undefined && edited.valid_to !== '' && edited.valid_to !== (offer.valid_to || '')
        const hasNewValidFrom = edited.valid_from && edited.valid_from !== (offer.valid_from || '')
        const isHistoricalAdd = hasNewValidTo && hasNewValidFrom && !offer.valid_to

        const pricingData: Record<string, unknown> = {
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
          // Inclure valid_to si modifié (vide = réactivation/offre active)
          ...(edited.valid_to !== undefined ? { valid_to: edited.valid_to || '' } : {}),
        }

        if (isHistoricalAdd) {
          // Ajout d'une version historique : NEW_OFFER avec les dates spécifiées
          const cleanName = getCleanOfferName(offer.name)
          allContributions.push({
            contribution_type: 'NEW_OFFER',
            existing_provider_id: offer.provider_id,
            provider_name: currentProvider.name,
            offer_name: `${cleanName} - ${powerKva} kVA`,
            offer_type: offer.offer_type,
            power_kva: powerKva,
            description: `Ajout d'une version historique de l'offre "${cleanName}" (${edited.valid_from} → ${edited.valid_to})`,
            pricing_data: pricingData,
            price_sheet_url: priceSheetUrl,
            valid_from: edited.valid_from,
          })
        } else {
          // Mise à jour de l'offre existante
          allContributions.push({
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: offer.provider_id,
            existing_offer_id: offer.id,
            provider_name: currentProvider.name,
            offer_name: offer.name,
            offer_type: offer.offer_type,
            power_kva: powerKva,
            pricing_data: pricingData,
            price_sheet_url: priceSheetUrl,
            valid_from: edited.valid_from || offer.valid_from || new Date().toISOString().split('T')[0],
          })
        }
      }

      // Suppressions de puissances
      for (const { power, groupName } of powersToRemove) {
        // Trouver le type d'offre depuis les offres du groupe
        const groupOffer = providerOffers.find(o => getCleanOfferName(o.name) === groupName)
        const offerType = groupOffer?.offer_type || filterOfferType
        allContributions.push({
          contribution_type: 'UPDATE_OFFER',
          existing_provider_id: currentProvider.id,
          provider_name: currentProvider.name,
          offer_name: `[SUPPRESSION] ${currentProvider.name} - ${groupName} - ${power} kVA`,
          offer_type: offerType,
          description: `Demande de suppression de la puissance ${power} kVA pour ${currentProvider.name} (${groupName})`,
          power_kva: power,
          price_sheet_url: priceSheetUrl,
          valid_from: new Date().toISOString().split('T')[0],
        })
      }

      // Offres obsolètes (deprecated) signalées par l'IA
      for (const dep of deprecatedOffers) {
        for (const offerId of dep.offer_ids) {
          allContributions.push({
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: currentProvider.id,
            provider_name: currentProvider.name,
            offer_name: `[SUPPRESSION] ${dep.offer_name} (${dep.offer_type})`,
            offer_type: dep.offer_type,
            description: `Offre signalée comme obsolète par l'IA : ${dep.warning}`,
            power_kva: 0,
            price_sheet_url: priceSheetUrl,
            valid_from: new Date().toISOString().split('T')[0],
          })
          // Utilisation de offerId pour traçabilité (ajout dans existing_offer_id)
          allContributions[allContributions.length - 1].existing_offer_id = offerId
        }
      }

      // Ajout de nouvelles puissances (filtrer les puissances exclues du récap)
      for (let npIdx = 0; npIdx < newPowersData.length; npIdx++) {
        if (recapExcludedPowers.has(`newpower-${npIdx}`)) continue
        const newPower = newPowersData[npIdx]
        const effectiveType = newPower.offer_type || filterOfferType
        const effectiveName = newPower.offer_name || existingBaseOfferName
        const pricingData: Record<string, number | undefined> = {}
        for (const [key, value] of Object.entries(newPower.fields)) {
          if (key !== 'subscription_price' && value) {
            pricingData[key] = parsePrice(value, undefined)
          }
        }
        pricingData.subscription_price = parsePrice(newPower.fields.subscription_price, undefined)
        // Inclure valid_to dans pricing_data pour les offres historiques
        const pricingDataFinal: Record<string, number | string | undefined> = { ...pricingData }
        if (newPower.valid_to) {
          pricingDataFinal.valid_to = newPower.valid_to
        }
        allContributions.push({
          contribution_type: 'NEW_OFFER',
          existing_provider_id: currentProvider.id,
          provider_name: currentProvider.name,
          offer_name: `${effectiveName} - ${newPower.power} kVA`,
          offer_type: effectiveType,
          description: newPower.valid_to
            ? `Ajout historique : ${newPower.power} kVA pour ${currentProvider.name} (${effectiveType}) - offre expirée`
            : `Ajout de la puissance ${newPower.power} kVA pour ${currentProvider.name} (${effectiveType})`,
          power_kva: newPower.power,
          pricing_data: pricingDataFinal,
          price_sheet_url: priceSheetUrl,
          valid_from: newPower.valid_from || new Date().toISOString().split('T')[0],
        })
      }

      // Nouveaux groupes d'offres (filtrer les puissances exclues du récap et les groupes déjà en base)
      for (let gIdx = 0; gIdx < newGroups.length; gIdx++) {
        const group = newGroups[gIdx]
        if (group.alreadyInDb) continue
        if (!group.name || group.powers.length === 0) continue
        const groupOfferType = group.offer_type || filterOfferType
        for (let pIdx = 0; pIdx < group.powers.length; pIdx++) {
          if (recapExcludedPowers.has(`group-${gIdx}-${pIdx}`)) continue
          const power = group.powers[pIdx]
          if (!power.power || power.power <= 0) continue
          allContributions.push({
            contribution_type: 'NEW_OFFER',
            existing_provider_id: currentProvider.id,
            provider_name: currentProvider.name,
            offer_name: `${group.name} - ${power.power} kVA`,
            offer_type: groupOfferType,
            description: `Création d'un nouveau groupe d'offres "${group.name}" avec la puissance ${power.power} kVA pour ${currentProvider.name} (${groupOfferType})`,
            power_kva: power.power,
            pricing_data: {
              subscription_price: parsePrice(power.fields.subscription_price, undefined),
              base_price: parsePrice(power.fields.base_price, undefined),
              hc_price: parsePrice(power.fields.hc_price, undefined),
              hp_price: parsePrice(power.fields.hp_price, undefined),
              // Tempo
              tempo_blue_hc: parsePrice(power.fields.tempo_blue_hc, undefined),
              tempo_blue_hp: parsePrice(power.fields.tempo_blue_hp, undefined),
              tempo_white_hc: parsePrice(power.fields.tempo_white_hc, undefined),
              tempo_white_hp: parsePrice(power.fields.tempo_white_hp, undefined),
              tempo_red_hc: parsePrice(power.fields.tempo_red_hc, undefined),
              tempo_red_hp: parsePrice(power.fields.tempo_red_hp, undefined),
              // EJP
              ejp_normal: parsePrice(power.fields.ejp_normal, undefined),
              ejp_peak: parsePrice(power.fields.ejp_peak, undefined),
              // Seasonal
              hc_price_summer: parsePrice(power.fields.hc_price_summer, undefined),
              hp_price_summer: parsePrice(power.fields.hp_price_summer, undefined),
              hc_price_winter: parsePrice(power.fields.hc_price_winter, undefined),
              hp_price_winter: parsePrice(power.fields.hp_price_winter, undefined),
              // Base Weekend
              base_price_weekend: parsePrice(power.fields.base_price_weekend, undefined),
              // HC Weekend
              hc_price_weekend: parsePrice(power.fields.hc_price_weekend, undefined),
              hp_price_weekend: parsePrice(power.fields.hp_price_weekend, undefined),
              ...(group.validTo ? { valid_to: group.validTo } : {}),
            },
            price_sheet_url: priceSheetUrl,
            valid_from: group.validFrom || new Date().toISOString().split('T')[0],
          })
        }
      }

      // Renommages de groupes d'offres
      for (const [renameKey, newName] of Object.entries(editedOfferNames)) {
        const [originalName, offerType] = renameKey.split('::')
        if (newName === originalName || newName.trim() === '') continue
        const offersInGroup = providerOffers.filter(o =>
          getCleanOfferName(o.name) === originalName && o.offer_type === offerType
        )
        for (const offer of offersInGroup) {
          const power = formatPower(offer)
          const newOfferName = power ? `${newName} - ${power}` : newName
          allContributions.push({
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: currentProvider.id,
            existing_offer_id: offer.id,
            provider_name: currentProvider.name,
            offer_name: `[RENOMMAGE] ${newOfferName}`,
            offer_type: offerType || filterOfferType,
            description: `Renommage du groupe d'offres "${originalName}" en "${newName}" pour ${currentProvider.name} (${offerType || filterOfferType})`,
            power_kva: offer.power_kva || (power ? parseInt(power) : 6),
            price_sheet_url: priceSheetUrl,
            valid_from: new Date().toISOString().split('T')[0],
          })
        }
      }
    }

    // Suppressions de fournisseurs
    for (const providerId of providersToRemove) {
      const providerToDelete = sortedProviders.find(p => p.id === providerId)
      if (!providerToDelete) continue
      allContributions.push({
        contribution_type: 'UPDATE_OFFER',
        existing_provider_id: providerId,
        provider_name: providerToDelete.name,
        offer_name: `[SUPPRESSION FOURNISSEUR] ${providerToDelete.name}`,
        offer_type: 'BASE',
        description: `Demande de suppression du fournisseur "${providerToDelete.name}" et de toutes ses offres.`,
        price_sheet_url: priceSheetUrl || 'N/A',
        valid_from: new Date().toISOString().split('T')[0],
      })
    }

    // Envoyer en un seul appel batch
    try {
      const response = await energyApi.submitContributionBatch(allContributions, priceSheetUrl, directApply)
      if (response.success) {
        const data = response.data as { created: number; contribution_ids?: string[]; errors: number; error_details?: string[] }
        const created = data.created || 0
        const contributionIds = data.contribution_ids || []
        const errors = data.errors || 0

        // Application directe : approuver automatiquement les contributions créées
        if (directApply && contributionIds.length > 0) {
          try {
            const approveResponse = await energyApi.bulkApproveContributions(contributionIds)
            if (approveResponse.success) {
              const approveData = approveResponse.data as { processed: number }
              toast.success(`${approveData.processed || contributionIds.length} modification(s) appliquée(s) directement !`)
            } else {
              toast.error('Erreur lors de l\'application directe des contributions')
            }
          } catch {
            toast.error('Erreur lors de l\'application directe des contributions')
          }
        } else if (created > 0) {
          toast.success(`${created} contribution(s) soumise(s) avec succès !`)
        }

        if (created > 0 || contributionIds.length > 0) {
          setEditedOffers({})
          setEditedOfferNames({})
          setPriceSheetUrl('')
          setPowersToRemove([])
          setNewPowersData([])
          setNewGroups([])
          setProvidersToRemove([])
          setDeprecatedOffers([])
          setUnchangedOfferIds(new Set())
          queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
          queryClient.invalidateQueries({ queryKey: ['energy-providers'] })
          queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
        }
        if (errors > 0) {
          toast.error(`${errors} erreur(s) lors de l'envoi`)
        }
      } else {
        toast.error('Erreur lors de la soumission des contributions')
      }
    } catch {
      toast.error('Erreur de communication avec le serveur')
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
      offer.provider_id === filterProvider && offer.is_active !== false && (filterOfferType === 'all' || offer.offer_type === filterOfferType)
    )
    .sort((a, b) => {
      const powerA = a.power_kva || 0
      const powerB = b.power_kva || 0
      return powerA - powerB
    })

  // Regrouper les offres par nom (clean name) ET période de validité
  const groupedOffers = useMemo(() => {
    const groups: Record<string, typeof providerOffers> = {}
    for (const offer of providerOffers) {
      const cleanName = getCleanOfferName(offer.name)
      // Créer une clé unique : nom + période (date uniquement, sans heure/timezone)
      const fromDate = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : ''
      const toDate = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('sv-SE') : ''
      const periodKey = fromDate
        ? (toDate ? `${fromDate}##${toDate}` : `${fromDate}##active`)
        : 'active'
      const groupKey = `${cleanName}##${periodKey}`

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(offer)
    }
    // Trier chaque groupe par puissance
    for (const groupName of Object.keys(groups)) {
      groups[groupName].sort((a, b) => {
        const powerA = a.power_kva || 0
        const powerB = b.power_kva || 0
        return powerA - powerB
      })
    }
    return groups
  }, [providerOffers])

  // Liste des noms de groupes triés
  const groupNames = useMemo(() => {
    return Object.keys(groupedOffers).sort((a, b) => a.localeCompare(b))
  }, [groupedOffers])

  // Séparer les groupes actifs et expirés
  const activeGroupNames = useMemo(() => {
    return groupNames.filter(g => !groupedOffers[g]?.every(offer => offer.valid_to))
  }, [groupNames, groupedOffers])

  const expiredGroupNames = useMemo(() => {
    return groupNames.filter(g => groupedOffers[g]?.every(offer => offer.valid_to))
  }, [groupNames, groupedOffers])

  // Groupes visibles dans la zone principale = uniquement les offres actives
  // Les offres expirées sont toujours dans la section pliable dédiée en bas
  const visibleGroupNames = useMemo(() => {
    return activeGroupNames
  }, [activeGroupNames])

  // Sélectionner automatiquement le premier groupe visible quand la liste change
  useEffect(() => {
    if (visibleGroupNames.length > 0 && !visibleGroupNames.includes(selectedGroupName)) {
      setSelectedGroupName(visibleGroupNames[0])
    }
  }, [visibleGroupNames, selectedGroupName])

  // Calculer les puissances existantes pour ce fournisseur/type
  const existingPowers = useMemo(() => {
    return providerOffers.map(offer => {
      const power = offer.power_kva || 0
      return {
        power,
        offer_type: offer.offer_type,
        offer_name: getCleanOfferName(offer.name),
        valid_from: offer.valid_from,
        valid_to: offer.valid_to
      }
    }).filter(p => p.power > 0)
  }, [providerOffers])

  // Vérifier si deux périodes se chevauchent
  const periodsOverlap = (
    start1: string | undefined,
    end1: string | undefined,
    start2: string | undefined,
    end2: string | undefined
  ): boolean => {
    // Si aucune des deux n'a de date, elles sont considérées identiques → chevauchement
    if (!start1 && !start2) return true
    // Si l'une a un valid_from et l'autre non, ce sont des périodes différentes
    // (l'une est une offre "legacy" sans date, l'autre est une nouvelle grille datée)
    if (!start1 || !start2) return false

    const s1 = new Date(start1)
    const e1 = end1 ? new Date(end1) : new Date('9999-12-31')
    const s2 = new Date(start2)
    const e2 = end2 ? new Date(end2) : new Date('9999-12-31')

    // Chevauchement si : start1 <= end2 ET start2 <= end1
    return s1 <= e2 && s2 <= e1
  }

  // Ouvrir le récapitulatif en initialisant les exclusions (auto-exclure les doublons)
  const openRecapModal = () => {
    const initialExclusions = new Set<string>()
    // Auto-exclure les puissances de newGroups qui sont des doublons en BDD
    newGroups.forEach((group, groupIdx) => {
      const groupType = group.offer_type || filterOfferType
      group.powers.forEach((power, powerIdx) => {
        if (power.power > 0 && existingPowers.some(ep =>
          ep.power === power.power && ep.offer_type === groupType &&
          periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
        )) {
          initialExclusions.add(`group-${groupIdx}-${powerIdx}`)
        }
      })
    })
    setRecapExcludedPowers(initialExclusions)
    setShowRecapModal(true)
  }

  // Vérifier si une puissance est déjà utilisée (existante ou dans les nouvelles puissances ajoutées)
  // Prend en compte le offer_type, offer_name ET les périodes de validité pour distinguer les offres
  const isPowerAlreadyUsed = (
    power: number,
    currentIndex?: number,
    offerType?: string,
    offerName?: string,
    validFrom?: string,
    validTo?: string
  ): boolean => {
    const effectiveType = offerType || filterOfferType
    // Vérifier dans les offres existantes (sauf celles marquées pour suppression)
    // Compare power + offer_type + offer_name + chevauchement de périodes
    const existsInOffers = existingPowers.some(ep => {
      if (ep.power !== power || ep.offer_type !== effectiveType) return false
      if (powersToRemove.some(p => p.power === power && (!offerName || p.groupName === offerName))) return false
      // Si un offer_name est fourni, comparer aussi par nom d'offre
      if (offerName && ep.offer_name && offerName !== ep.offer_name) return false
      // Vérifier le chevauchement de périodes de validité
      return periodsOverlap(validFrom, validTo, ep.valid_from, ep.valid_to)
    })
    if (existsInOffers) return true
    // Vérifier dans les nouvelles puissances ajoutées (sauf l'index courant)
    // Même power + même offer_type + même offer_name + périodes qui se chevauchent = doublon
    return newPowersData.some((p, i) => {
      if (i === currentIndex) return false
      if (p.power !== power) return false
      const pType = p.offer_type || filterOfferType
      if (pType !== effectiveType) return false
      // Si les deux ont un offer_name, comparer aussi par nom
      if (offerName && p.offer_name && offerName !== p.offer_name) return false
      // Vérifier le chevauchement de périodes de validité
      return periodsOverlap(validFrom, validTo, p.valid_from, p.valid_to)
    })
  }

  // Vérifier s'il y a des doublons dans les nouvelles puissances
  const hasDuplicatePowers = useMemo(() => {
    return newPowersData.some((newPower, index) =>
      !recapExcludedPowers.has(`newpower-${index}`) &&
      isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name, newPower.valid_from, newPower.valid_to)
    )
  }, [newPowersData, existingPowers, powersToRemove, recapExcludedPowers])

  // Détecter les champs de prix requis pour le type d'offre actuel
  const getRequiredPriceFields = (offerType?: string): string[] => {
    const type = offerType || filterOfferType
    if (type === 'BASE') return ['base_price']
    if (type === 'HC_HP') return ['hc_price', 'hp_price']
    if (type === 'TEMPO') return ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp']
    if (type === 'EJP') return ['ejp_normal', 'ejp_peak']
    if (type === 'SEASONAL') return ['hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter']
    if (type === 'HC_WEEKEND' || type === 'HC_NUIT_WEEKEND') return ['hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend']

    // Pour les types non standard, détecter depuis les offres existantes
    const knownPriceFields = [
      'base_price', 'hc_price', 'hp_price',
      'hc_price_winter', 'hp_price_winter', 'hc_price_summer', 'hp_price_summer',
      'peak_day_price', 'base_price_weekend',
      'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp',
      'ejp_normal', 'ejp_peak'
    ]

    const offersOfType = offersArray.filter(o => o.offer_type === type)
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
  const isNewPowerComplete = (newPower: { power: number; fields: Record<string, string>; offer_type?: string }): boolean => {
    // Puissance doit être > 0
    if (!newPower.power || newPower.power <= 0) return false
    // Abonnement obligatoire
    if (!newPower.fields.subscription_price || newPower.fields.subscription_price === '') return false

    // Vérifier les champs de prix requis pour ce type d'offre
    const requiredFields = getRequiredPriceFields(newPower.offer_type)
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
      // Les groupes déjà en base ne sont pas soumis, ignorer la validation
      if (group.alreadyInDb) return false
      // Le nom du groupe est obligatoire
      if (!group.name || group.name.trim() === '') return true
      // Chaque puissance doit être complète (utiliser le offer_type du groupe si disponible)
      return group.powers.some(p => !isNewPowerComplete({ ...p, offer_type: group.offer_type }))
    })
  }, [newGroups, filterOfferType])

  // Vérifier s'il y a des doublons dans les nouveaux groupes (internes ou avec les offres existantes)
  const hasGroupDuplicatePowers = useMemo(() => {
    return newGroups.some((group, groupIdx) => {
      // Les groupes déjà en base ne sont pas soumis, ignorer la validation
      if (group.alreadyInDb) return false
      // Ne considérer que les puissances non exclues du récap
      const includedPowers = group.powers
        .filter((_, pi) => !recapExcludedPowers.has(`group-${groupIdx}-${pi}`))
      const powers = includedPowers.map(p => p.power).filter(p => p > 0)
      // Doublons internes au groupe (parmi les puissances sélectionnées)
      if (powers.length !== new Set(powers).size) return true
      // Doublons avec les offres existantes (même type + même puissance + périodes qui se chevauchent)
      const groupType = group.offer_type || filterOfferType
      return includedPowers.some(p => {
        if (!p.power || p.power <= 0) return false
        return existingPowers.some(ep =>
          ep.power === p.power &&
          ep.offer_type === groupType &&
          periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
        )
      })
    })
  }, [newGroups, existingPowers, filterOfferType, recapExcludedPowers])

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
    if (['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType)) {
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
              if (activeOffersArray.length === 0) return '0 offre'
              const selectedProvider = sortedProviders.find(p => p.id === filterProvider)
              const totalCount = filterProvider
                ? activeOffersArray.filter(o => o.provider_id === filterProvider).length
                : activeOffersArray.length
              return `${totalCount} offre(s)${selectedProvider ? ` pour ${selectedProvider.name}` : ''}`
            })()}
          </p>
        </div>
        {/* Boutons mode */}
        <div className="flex items-center gap-2">
          {isEditMode && filterProvider && (
            <button
              onClick={() => {
                setShowAIMode(!showAIMode)
                setAiImportResult(null)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showAIMode
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700'
              }`}
            >
              <Sparkles size={16} />
              Mode IA
            </button>
          )}
          <button
            onClick={() => {
              if (isEditMode) {
                confirmOrExecute(() => {
                  setEditedOffers({})
                  setPriceSheetUrl('')
                  setPowersToRemove([])
                  setNewPowersData([])
                  setShowAIMode(false)
                  setAiJsonInput('')
                  setAiImportResult(null)
                  setDeprecatedOffers([])
                  setUnchangedOfferIds(new Set())
                  setIsEditMode(false)
                })
                return
              }
              setShowExpiredSection(false)
              setIsEditMode(true)
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




          {/* Bouton/Champ ajouter un nouveau fournisseur (masqué en mode IA) */}
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

        {/* Panneau Mode IA (après le choix de fournisseur) */}
        {showAIMode && isEditMode && filterProvider && (
          <div className="border border-purple-200 dark:border-purple-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-3 flex items-center gap-2 border-b border-purple-200 dark:border-purple-700">
              <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold text-purple-800 dark:text-purple-200 text-sm">Import via IA</h3>
              <span className="text-xs text-purple-600 dark:text-purple-400 ml-auto">
                Fournisseur : {sortedProviders.find(p => p.id === filterProvider)?.name || '—'}
              </span>
            </div>

            <div className="p-4 space-y-4">
              {/* Étape 1 : Prompt */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    1. Copiez ce prompt dans votre IA préférée
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generateAIPrompt())
                      toast.success('Prompt copié dans le presse-papier')
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700 transition-colors"
                  >
                    <Copy size={14} />
                    Copier le prompt
                  </button>
                </div>
                <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                  {generateAIPrompt()}
                </pre>
              </div>

              {/* Conseils sur les sources et vérification */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1.5 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  Comment utiliser ce prompt
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1.5 ml-5 list-disc">
                  <li><strong>Lancez le prompt seul</strong> — l'IA effectuera une recherche web pour trouver les tarifs officiels du fournisseur</li>
                  <li>Pour fournir une source spécifique :
                    <ul className="ml-4 mt-1 space-y-0.5 list-[circle]">
                      <li><strong>Copier/coller le contenu</strong> : méthode la plus fiable. Ouvre le PDF ou la page web, sélectionne le tableau tarifaire et colle-le à la suite du prompt</li>
                      <li><strong>Page HTML ou lien web</strong> : bonne alternative, l'IA peut souvent accéder aux pages publiques</li>
                      <li><strong>Image (capture d'écran)</strong> : acceptable si les autres méthodes ne fonctionnent pas</li>
                    </ul>
                  </li>
                  <li><strong>Évitez les PDF en pièce jointe</strong> — la structure interne des PDF rend la lecture difficile pour les IA (colonnes mélangées, tableaux mal interprétés)</li>
                  <li>Dans tous les cas, <strong>vérifiez toujours les tarifs proposés</strong> avant de soumettre</li>
                </ul>
              </div>

              {/* Étape 2 : JSON input */}
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  2. Collez le JSON généré par l'IA
                </p>
                <textarea
                  value={aiJsonInput}
                  onChange={(e) => setAiJsonInput(e.target.value)}
                  placeholder='{ "offers": [ ... ] }'
                  className="w-full h-40 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-700 dark:text-gray-300 resize-y focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              {/* Résultat de l'import */}
              {aiImportResult && (
                <div className={`rounded-lg border p-3 text-sm ${
                  aiImportResult.success
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                }`}>
                  {(() => {
                    const lines = aiImportResult.message.split('\n')
                    const title = lines[0]
                    const errorLines = lines.slice(1)
                    return (
                      <>
                        <p className="font-medium mb-1">{aiImportResult.success ? '✅' : '❌'} {title}</p>
                        {errorLines.length > 0 && (
                          <ul className="mt-2 space-y-1 list-none">
                            {errorLines.map((line, idx) => (
                              <li key={idx} className="text-xs flex items-start gap-1.5">
                                <span className="text-red-400 mt-0.5 shrink-0">•</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )
                  })()}
                  {aiImportResult.details && aiImportResult.details.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {aiImportResult.details.map((d, i) => (
                        <li key={i} className="text-xs">
                          <span className="font-medium">{d.offer_name}</span>
                          <span className="text-gray-500 dark:text-gray-400"> ({d.offer_type})</span>
                          {' : '}
                          {d.deprecated ? (
                            <span className="text-orange-600 dark:text-orange-400 font-medium">obsolète — suppression proposée</span>
                          ) : (
                            <>
                              {d.matched > 0 && <span>{d.matched} mise(s) à jour</span>}
                              {d.matched > 0 && d.added > 0 && ', '}
                              {d.added > 0 && <span className="text-blue-500">{d.added} nouvelle(s) puissance(s)</span>}
                              {d.matched === 0 && d.added === 0 && <span className="text-gray-400">aucune correspondance</span>}
                            </>
                          )}
                          {d.warning && (
                            <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
                              ⚠️ {d.warning}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Boutons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAIMode(false)
                    setAiJsonInput('')
                    setAiImportResult(null)
                    // Nettoyer les contributions générées par l'import AI
                    setNewPowersData([])
                    setEditedOffers({})
                    setPowersToRemove([])
                    setDeprecatedOffers([])
                    setUnchangedOfferIds(new Set())
                    setNewGroups([])
                    setEditedOfferNames({})
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Fermer
                </button>
                <button
                  onClick={importAIJson}
                  disabled={!aiJsonInput.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={16} />
                  Importer
                </button>
              </div>
            </div>
          </div>
        )}

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
                  setNewProviderWebsite('')
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
                onClick={() => {
                  setIsAddingProvider(false)
                  setNewProviderName('')
                  setNewProviderWebsite('')
                  const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
                  if (edf) setFilterProvider(edf.id)
                  else if (sortedProviders.length > 0) setFilterProvider(sortedProviders[0].id)
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors"
              >
                <X size={16} />
                Annuler
              </button>
              <button
                onClick={async () => {
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
                }}
                disabled={creatingProvider || !newProviderName.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Plus size={16} />
                {creatingProvider ? 'Création...' : 'Créer le fournisseur'}
              </button>
            </div>
          </div>
        )}

        {/* Type d'offre - Boutons dynamiques (masqué si ajout de fournisseur ou mode IA) */}
        {!isAddingProvider && !showAIMode && filterProvider && (
          <div>
            <div className="mb-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Types d'offre</label>
              <div className="mt-1 h-0.5 w-full bg-primary-500 rounded-full" />
            </div>
            <div className="flex items-center justify-between mb-3">
              {isEditMode && isPrivilegedUser && (() => {
                const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
                if (providerOffers.length === 0) return null
                const providerName = sortedProviders.find(p => p.id === filterProvider)?.name || ''
                return (
                  <button
                    onClick={async () => {
                      if (!confirm(`Supprimer définitivement toutes les offres de ${providerName} (${providerOffers.length} offres) ?\n\nCette action est irréversible.`)) return
                      try {
                        const loadingId = toast.loading(`Suppression des offres de ${providerName}...`)
                        const response = await energyApi.purgeProviderOffers(providerName)
                        toast.dismiss(loadingId)
                        if (response.success) {
                          toast.success(`${response.data?.deleted_count || providerOffers.length} offre(s) supprimée(s)`)
                          // Réinitialiser l'état local
                          setEditedOffers({})
                          setDeprecatedOffers([])
                          setUnchangedOfferIds(new Set())
                          setNewGroups([])
                          setNewPowersData([])
                          setPowersToRemove([])
                          // Rafraîchir les offres depuis le serveur
                          await queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
                        } else {
                          toast.error(`Erreur : ${response.error?.message || 'suppression échouée'}`)
                        }
                      } catch (e) {
                        toast.error(`Erreur : ${e instanceof Error ? e.message : 'suppression échouée'}`)
                      }
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50"
                    title="Supprimer définitivement toutes les offres de ce fournisseur"
                  >
                    <Trash2 size={14} />
                    Supprimer toutes les offres du fournisseur
                  </button>
                )
              })()}
            </div>

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
                          'SEASONAL': 'Saisonnier',
                          'BASE_WEEKEND': 'Base Week-end',
                          'HC_NUIT_WEEKEND': 'HC Nuit Week-end',
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
                  <div className="flex flex-wrap justify-center gap-2">
                    {(isEditMode ? typeOrder : availableOfferTypes).map((type) => {
                      const isSelected = filterOfferType === type
                      const typeCount = activeOffersArray.filter(o => o.provider_id === filterProvider && o.offer_type === type).length
                      const isEmpty = typeCount === 0
                      const typeLabels: Record<string, string> = {
                        'BASE': 'Base',
                        'HC_HP': 'HC/HP',
                        'TEMPO': 'Tempo',
                        'EJP': 'EJP',
                        'SEASONAL': 'Saisonnier',
                        'BASE_WEEKEND': 'Base Week-end',
                        'HC_NUIT_WEEKEND': 'HC Nuit Week-end',
                        'HC_WEEKEND': 'HC Week-end',
                      }
                      return (
                        <div
                          key={type}
                          onClick={() => {
                            if (type === filterOfferType) return
                            confirmOrExecute(() => {
                              setFilterOfferType(type)
                              if (isEditMode && isEmpty) {
                                if (newGroups.length === 0) {
                                  setNewGroups([{ name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])
                                }
                              }
                            })
                          }}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 cursor-pointer flex-1 min-w-[calc((100%-0.5rem)/2)] sm:min-w-[calc((100%-1.5rem)/4)] ${
                            isSelected
                              ? 'bg-primary-600 text-white shadow-md'
                              : isEmpty && isEditMode
                                ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-500 dark:hover:text-primary-400'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                          }`}
                          title={isEmpty && isEditMode ? `Cliquer pour créer des offres ${typeLabels[type] || type}` : undefined}
                        >
                          <span className={`px-1.5 py-0.5 text-xs rounded-full shrink-0 ${
                              isSelected
                                ? 'bg-primary-500 text-white'
                                : isEmpty
                                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                            }`}>
                              {typeCount}
                          </span>
                          <span
                            className="flex-1 text-center flex items-center justify-center gap-1.5"
                          >
                            {isEmpty && isEditMode && <Plus size={12} className="shrink-0" />}
                            {typeLabels[type] || type}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setTypeInfoTarget(type)
                                setShowTypeInfoPopup(true)
                              }}
                              className={`p-1 rounded transition-all ${
                                isSelected
                                  ? 'text-white/70 hover:text-white hover:bg-white/20'
                                  : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                              title="Détail du type d'offre"
                            >
                              <Info size={14} />
                            </button>
                            {!isEmpty && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const currentProv = sortedProviders.find(p => p.id === filterProvider)
                                  if (!currentProv) return
                                  const typeOffers = offersArray.filter(o => o.provider_id === filterProvider && o.offer_type === type && o.is_active !== false)
                                  const exportData = buildOfferExportJson(typeOffers, currentProv.name)
                                  copyJsonToClipboard(exportData, `${typeCount} offre(s) ${typeLabels[type] || type} copiées`)
                                }}
                                className={`p-1 rounded transition-all ${
                                  isSelected
                                    ? 'text-white/70 hover:text-white hover:bg-white/20'
                                    : 'text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                title={`Copier les offres ${typeLabels[type] || type} en JSON`}
                              >
                                <Copy size={14} />
                              </button>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

          </div>
        )}

      </div>

      {/* Contenu masqué en mode IA */}
      {!showAIMode && (<>

      {/* Popup d'information sur le type d'offre */}
      {showTypeInfoPopup && typeInfoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTypeInfoPopup(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative max-w-lg w-full p-5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Info size={20} className="text-primary-600 dark:text-primary-400 shrink-0" />
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                  {typeInfoTarget === 'BASE' && 'Offre Base — Tarif unique'}
                  {typeInfoTarget === 'HC_HP' && 'Offre Heures Creuses / Heures Pleines'}
                  {typeInfoTarget === 'TEMPO' && 'Offre Tempo — 6 tarifs selon le jour'}
                  {typeInfoTarget === 'EJP' && 'Offre EJP — Effacement Jour de Pointe'}
                  {typeInfoTarget === 'BASE_WEEKEND' && 'Offre Base Week-end'}
                  {typeInfoTarget === 'SEASONAL' && 'Offre Saisonnière (2 saisons)'}
                  {(typeInfoTarget === 'HC_WEEKEND' || typeInfoTarget === 'HC_NUIT_WEEKEND') && `Offre ${typeInfoTarget === 'HC_NUIT_WEEKEND' ? 'HC Nuit Week-end' : 'HC Week-end'}`}
                  {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'BASE_WEEKEND', 'SEASONAL', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(typeInfoTarget) && `Offre ${typeInfoTarget}`}
                </h4>
              </div>
              <button
                onClick={() => setShowTypeInfoPopup(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              {typeInfoTarget === 'BASE' && (
                <>
                  <p>Un seul prix du kWh, 24h/24, 7j/7, toute l'année.</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix Base (€/kWh)
                  </p>
                </>
              )}
              {typeInfoTarget === 'HC_HP' && (
                <>
                  <p>Deux prix différents selon l'heure :</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>Heures Creuses (HC)</strong> : 8h par jour (souvent la nuit entre 22h et 6h, parfois le midi). Prix réduit.</li>
                    <li><strong>Heures Pleines (HP)</strong> : les 16h restantes. Prix plus élevé.</li>
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + Prix HC (€/kWh) + Prix HP (€/kWh)
                  </p>
                </>
              )}
              {typeInfoTarget === 'TEMPO' && (
                <>
                  <p>L'année est divisée en 3 types de jours, chacun avec ses tarifs HC/HP :</p>
                  <ul className="list-none ml-2 space-y-1">
                    <li><span className="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2"></span><strong>Jours Bleus</strong> (300 jours/an) : tarif le plus avantageux</li>
                    <li><span className="inline-block w-3 h-3 rounded-full bg-gray-400 mr-2"></span><strong>Jours Blancs</strong> (43 jours/an) : tarif intermédiaire</li>
                    <li><span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span><strong>Jours Rouges</strong> (22 jours/an) : tarif très élevé (hiver uniquement)</li>
                  </ul>
                  <p className="mt-1">La couleur du lendemain est annoncée la veille à 17h.</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement + 6 prix (Bleu HC, Bleu HP, Blanc HC, Blanc HP, Rouge HC, Rouge HP)
                  </p>
                </>
              )}
              {typeInfoTarget === 'EJP' && (
                <>
                  <p>Offre historique (non commercialisée depuis 1998) avec 2 périodes :</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>Jours Normaux</strong> (345 jours/an) : tarif avantageux</li>
                    <li><strong>Jours de Pointe</strong> (20 jours/an, hiver) : tarif très élevé. Prévenus la veille à 17h.</li>
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement + Prix Normal (€/kWh) + Prix Pointe (€/kWh)
                  </p>
                </>
              )}
              {typeInfoTarget === 'BASE_WEEKEND' && (
                <>
                  <p>Tarif réduit pendant tout le week-end (samedi et dimanche), tarif normal en semaine.</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement + Prix Semaine (€/kWh) + Prix Week-end (€/kWh)
                  </p>
                </>
              )}
              {typeInfoTarget === 'SEASONAL' && (
                <>
                  <p>Tarification saisonnière avec 2 périodes et des prix HC/HP différents :</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><span className="text-orange-600 dark:text-orange-400 font-semibold">Saison basse / Éco</span> : été (avril-octobre) ou jours Éco (345 jours/an) selon le fournisseur — tarifs HC/HP avantageux</li>
                    <li><span className="text-blue-600 dark:text-blue-400 font-semibold">Saison haute / Sobriété</span> : hiver (novembre-mars) ou jours Sobriété (20 jours/an) selon le fournisseur — tarifs HC/HP plus élevés</li>
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement + HC Été/Éco + HP Été/Éco + HC Hiver/Sobriété + HP Hiver/Sobriété (€/kWh)
                  </p>
                </>
              )}
              {(typeInfoTarget === 'HC_WEEKEND' || typeInfoTarget === 'HC_NUIT_WEEKEND') && (
                <>
                  <p>Tarifs HC/HP avec avantage week-end :</p>
                  <ul className="list-disc list-inside ml-2 space-y-1">
                    <li><strong>Semaine</strong> : tarifs HC/HP classiques</li>
                    <li><span className="text-green-600 dark:text-green-400 font-semibold">Week-end</span> : tarifs HC/HP réduits (samedi et dimanche)</li>
                    {typeInfoTarget === 'HC_NUIT_WEEKEND' && <li><strong>Nuit</strong> : heures creuses étendues la nuit</li>}
                  </ul>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <strong>Tarifs à renseigner :</strong> Abonnement + HC Semaine + HP Semaine + HC Week-end + HP Week-end
                  </p>
                </>
              )}
              {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(typeInfoTarget) && (
                <>
                  <p>Offre avec tarification spécifique détectée depuis les offres existantes.</p>
                  {dynamicPriceFields.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      <strong>Tarifs à renseigner :</strong> Abonnement (€/mois) + {dynamicPriceFields.map(f => f.label).join(' + ')} (€/kWh)
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mode ajout de nouvelle offre : afficher uniquement la zone d'ajout de puissances */}
      {(!isAddingProvider && isAddingOffer && newOfferType) ? (
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
                  {newOfferType === 'BASE' && (
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

                  {newOfferType === 'HC_HP' && (
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

                  {(newOfferType !== 'BASE' && newOfferType !== 'HC_HP') && (
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
          {(() => {
            const lastPower = newPowersData[newPowersData.length - 1]
            const requiredFields = getFieldKeysForOfferType(newOfferType || filterOfferType)
            const isLastComplete = !lastPower || (
              lastPower.power > 0 &&
              lastPower.fields.subscription_price?.trim() &&
              requiredFields.every(f => lastPower.fields[f]?.trim())
            )
            return (
              <button
                onClick={() => {
                  const copiedFields: Record<string, string> = {}
                  if (lastPower) {
                    for (const key of requiredFields) {
                      if (lastPower.fields[key]) copiedFields[key] = lastPower.fields[key]
                    }
                  }
                  setNewPowersData(prev => [...prev, { power: 0, fields: copiedFields }])
                }}
                disabled={!isLastComplete}
                className={`w-full rounded-lg p-3 border-2 border-dashed transition-all flex items-center justify-center gap-2 ${
                  isLastComplete
                    ? 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-400 opacity-50 cursor-not-allowed'
                }`}
              >
                <Plus size={18} />
                <span className="font-medium text-sm">Ajouter une puissance</span>
              </button>
            )
          })()}

          {/* Récapitulatif et soumission pour nouvelle offre */}
          {newPowersData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Send size={18} className="text-primary-600 dark:text-primary-400" />
                Récapitulatif - Nouvelle offre
              </h4>

              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  <strong>{sortedProviders.find(p => p.id === filterProvider)?.name}</strong> - {(() => {
                    const labels: Record<string, string> = { 'BASE': 'Base', 'HC_HP': 'HC/HP', 'TEMPO': 'Tempo', 'EJP': 'EJP', 'SEASONAL': 'Saisonnier', 'BASE_WEEKEND': 'Base Week-end', 'HC_WEEKEND': 'HC Week-end', 'HC_NUIT_WEEKEND': 'HC Nuit Week-end' }
                    return labels[newOfferType] || newOfferType
                  })()} (nouvelle offre) - {newPowersData.length} puissance(s)
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

              {/* Date de mise en service */}
              <div className="mb-4">
                <SingleDatePicker
                  value={newOfferValidFrom}
                  onChange={setNewOfferValidFrom}
                  label="Date de mise en service du tarif"
                  required
                  minDate="2020-01-01"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Date à partir de laquelle ce tarif est en vigueur
                </p>
              </div>


              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsAddingOffer(false)
                    setNewOfferType('')
                    setNewPowersData([])
                    setPriceSheetUrl('')
                    setNewOfferValidFrom(new Date().toISOString().split('T')[0])
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                  Annuler
                </button>
                <button
                  onClick={async () => {
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

                    const providerName = sortedProviders.find(p => p.id === filterProvider)?.name || ''
                    const offerType = newOfferType

                    for (const newPower of newPowersData) {
                      try {
                        const contributionData: ContributionData = {
                          contribution_type: 'NEW_OFFER',
                          existing_provider_id: filterProvider,
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
                          valid_from: newOfferValidFrom || new Date().toISOString().split('T')[0],
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
                      setIsAddingOffer(false)
                      setNewOfferType('')
                      setNewPowersData([])
                      setPriceSheetUrl('')
                      setNewOfferValidFrom(new Date().toISOString().split('T')[0])
                    }
                    if (errorCount > 0) {
                      toast.error(`${errorCount} erreur(s) lors de l'envoi`)
                    }
                    setSubmittingOffers(false)
                  }}
                  disabled={submittingOffers || newPowersData.length === 0 || (!isPrivilegedUser && !priceSheetUrl)}
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
      ) : providerOffers.length === 0 ? (
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
                  onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all"
                >
                  <Package size={18} />
                  <Plus size={14} className="-ml-1" />
                  <span>Créer un nouveau groupe d'offres</span>
                </button>
              </div>
            )}

            {/* Afficher les nouveaux groupes - design bleu cohérent avec le contexte "type vide" */}
            {newGroups.map((group, groupIndex) => group.alreadyInDb ? null : (
              <div key={`new-group-empty-${groupIndex}`} className="space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-dashed border-blue-400 dark:border-blue-600">
                {/* En-tête du nouveau groupe */}
                <div className="flex items-center gap-3 pb-2 border-b border-blue-300 dark:border-blue-700">
                  <Plus size={16} className="text-blue-600 dark:text-blue-400" />
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, name: e.target.value } : g))}
                    placeholder="Nom de l'offre (ex: Vert Fixe, Stable...)"
                    data-new-group-name
                    className="flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  {/* Dates de validité */}
                  <div className="flex items-center gap-2">
                    <SingleDatePicker
                      value={group.validFrom}
                      onChange={(date) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validFrom: date } : g))}
                      minDate="2020-01-01"
                      required
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">→</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={group.validTo}
                        onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validTo: e.target.value } : g))}
                        min={group.validFrom || '2020-01-01'}
                        placeholder="jj/mm/aaaa"
                        className="px-2 py-1.5 text-sm rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none [color-scheme:dark] dark:[color-scheme:dark]"
                      />
                      {group.validTo && (
                        <button
                          onClick={() => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validTo: '' } : g))}
                          className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300"
                          title="Effacer la date de fin (offre active)"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
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

                          {filterOfferType === 'SEASONAL' && (
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

                          {filterOfferType === 'BASE_WEEKEND' && (
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
                          {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(filterOfferType) && dynamicPriceFields.map(field => (
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
                {(() => {
                  const lastPower = group.powers[group.powers.length - 1]
                  const requiredFields = getFieldKeysForOfferType(group.offer_type || filterOfferType)
                  const isLastComplete = !lastPower || (
                    lastPower.power > 0 &&
                    lastPower.fields.subscription_price?.trim() &&
                    requiredFields.every(f => lastPower.fields[f]?.trim())
                  )
                  return (
                    <button
                      onClick={() => {
                        // Copier les prix kWh de la dernière puissance (pas l'abonnement ni la puissance)
                        const copiedFields: Record<string, string> = {}
                        if (lastPower) {
                          for (const key of requiredFields) {
                            if (lastPower.fields[key]) copiedFields[key] = lastPower.fields[key]
                          }
                        }
                        setNewGroups(prev => prev.map((g, gi) => gi === groupIndex ? { ...g, powers: [...g.powers, { power: 0, fields: copiedFields }] } : g))
                      }}
                      disabled={!isLastComplete}
                      className={`w-full rounded-lg p-3 border-2 transition-all flex items-center justify-center gap-2 shadow-sm ${
                        isLastComplete
                          ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-400 dark:border-primary-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/50'
                          : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Plus size={18} className={isLastComplete ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'} />
                      <span className={`font-semibold text-sm ${isLastComplete ? 'text-primary-700 dark:text-primary-300' : 'text-gray-400'}`}>Ajouter une puissance à ce groupe</span>
                    </button>
                  )
                })()}
              </div>
            ))}

            {/* Bouton pour créer un autre groupe d'offres */}
            {newGroups.length > 0 && (
              <button
                onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])}
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
                          {newGroups.map((group, index) => group.alreadyInDb ? null : (
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
                    onClick={() => submitAllModifications()}
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
          {/* Bouton pour créer un nouveau groupe d'offres (en haut, uniquement en mode édition) */}
          {isEditMode && (
            <button
              onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], validTo: '', powers: [{ power: 0, fields: {} }] }])}
              className="w-full rounded-lg p-3 border-2 border-dashed border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600 transition-all flex items-center justify-center gap-2"
            >
              <Package size={18} />
              <Plus size={14} className="-ml-1" />
              <span className="font-medium text-sm">Créer un nouveau groupe d'offres</span>
            </button>
          )}

          {/* Nouveaux groupes d'offres (uniquement en mode édition, exclure ceux déjà en base) */}
          {isEditMode && newGroups.map((group, groupIndex) => group.alreadyInDb ? null : (
            <div key={`new-group-${groupIndex}`} className="space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border-2 border-dashed border-blue-400 dark:border-blue-600">
              {/* En-tête du nouveau groupe */}
              <div className="flex items-center gap-3 pb-2 border-b border-blue-300 dark:border-blue-700">
                <Plus size={16} className="text-blue-600 dark:text-blue-400" />
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, name: e.target.value } : g))}
                  placeholder="Nom de l'offre (ex: Vert Fixe, Stable...)"
                  data-new-group-name
                  className="flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                {/* Dates de validité */}
                <div className="flex items-center gap-2">
                  <SingleDatePicker
                    value={group.validFrom}
                    onChange={(date) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validFrom: date } : g))}
                    minDate="2020-01-01"
                    required
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">→</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={group.validTo}
                      onChange={(e) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validTo: e.target.value } : g))}
                      min={group.validFrom || '2020-01-01'}
                      placeholder="jj/mm/aaaa"
                      className="px-2 py-1.5 text-sm rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none [color-scheme:dark] dark:[color-scheme:dark]"
                    />
                    {group.validTo && (
                      <button
                        onClick={() => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validTo: '' } : g))}
                        className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-300"
                        title="Effacer la date de fin (offre active)"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {group.offer_type && (
                  <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">{group.offer_type}</span>
                )}
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
                const effectiveGroupType = group.offer_type || filterOfferType
                const isDuplicateInDb = power.power > 0 && existingPowers.some(ep =>
                  ep.power === power.power &&
                  ep.offer_type === effectiveGroupType &&
                  periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
                )
                return (
                  <div
                    key={`new-group-${groupIndex}-power-${powerIndex}`}
                    className={`rounded-lg p-3 border transition-all ${
                      isDuplicateInDb
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                        : isIncomplete
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400 dark:border-amber-600'
                          : 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600'
                    }`}
                  >
                    {isDuplicateInDb && (
                      <div className="text-xs text-red-600 dark:text-red-400 mb-2 flex items-center gap-1">
                        <AlertCircle size={12} />
                        <span>Cette puissance existe déjà pour ce type d'offre sur une période qui chevauche</span>
                      </div>
                    )}
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
                        {effectiveGroupType === 'BASE' && (
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

                        {effectiveGroupType === 'HC_HP' && (
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

                        {effectiveGroupType === 'SEASONAL' && (
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

                        {effectiveGroupType === 'BASE_WEEKEND' && (
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

                        {(effectiveGroupType === 'HC_WEEKEND' || effectiveGroupType === 'HC_NUIT_WEEKEND') && (
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

                        {effectiveGroupType === 'TEMPO' && (
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

                        {effectiveGroupType === 'EJP' && (
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

                        {/* Champs dynamiques pour les types non standard (détectés depuis les offres existantes) */}
                        {!['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_WEEKEND', 'HC_NUIT_WEEKEND'].includes(effectiveGroupType) && dynamicPriceFields.map(field => (
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
              {(() => {
                const lastPower = group.powers[group.powers.length - 1]
                const requiredFields = getFieldKeysForOfferType(filterOfferType)
                const isLastComplete = !lastPower || (
                  lastPower.power > 0 &&
                  lastPower.fields.subscription_price?.trim() &&
                  requiredFields.every(f => lastPower.fields[f]?.trim())
                )
                return (
                  <button
                    onClick={() => {
                      const copiedFields: Record<string, string> = {}
                      if (lastPower) {
                        for (const key of requiredFields) {
                          if (lastPower.fields[key]) copiedFields[key] = lastPower.fields[key]
                        }
                      }
                      setNewGroups(prev => prev.map((g, i) => i === groupIndex ? {
                        ...g,
                        powers: [...g.powers, { power: 0, fields: copiedFields }]
                      } : g))
                    }}
                    disabled={!isLastComplete}
                    className={`w-full rounded-lg p-3 border-2 transition-all flex items-center justify-center gap-2 shadow-sm ${
                      isLastComplete
                        ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-400 dark:border-primary-600 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-100 dark:hover:bg-primary-900/50'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Plus size={18} className={isLastComplete ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'} />
                    <span className={`font-semibold text-sm ${isLastComplete ? 'text-primary-700 dark:text-primary-300' : 'text-gray-400'}`}>Ajouter une puissance à ce groupe</span>
                  </button>
                )
              })()}
            </div>
          ))}

          {/* Onglets de groupes d'offres (mode lecture uniquement) */}
          {activeGroupNames.length >= 1 && !isEditMode && (
            <div>
              <div className="mb-3">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Offres</label>
                <div className="mt-1 h-0.5 w-full bg-primary-500 rounded-full" />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
              {activeGroupNames.map((gName) => {
                const isActive = selectedGroupName === gName
                const count = groupedOffers[gName]?.length || 0
                const cleanName = getGroupNameWithoutPeriod(gName)
                const isDeprecated = deprecatedOffers.some(d =>
                  d.offer_name === cleanName && d.offer_type === groupedOffers[gName]?.[0]?.offer_type
                )
                return (
                  <button
                    key={gName}
                    onClick={() => setSelectedGroupName(gName)}
                    className={`flex-1 min-w-[150px] px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between gap-2 cursor-pointer ${
                      isDeprecated ? 'opacity-50 line-through ' : ''
                    }${
                      isActive
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                    title={isDeprecated ? 'Offre marquée pour suppression' : undefined}
                  >
                    <span className={`px-1.5 py-0.5 text-xs rounded-full shrink-0 ${
                      isActive
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                    }`}>
                      {count}
                    </span>
                    <span className="flex-1 text-center truncate">{cleanName}</span>
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const currentProv = sortedProviders.find(p => p.id === filterProvider)
                        if (!currentProv) return
                        const groupOffers = groupedOffers[gName] || []
                        const exportData = buildOfferExportJson(groupOffers, currentProv.name)
                        copyJsonToClipboard(exportData, `${count} offre(s) "${cleanName}" copiées en JSON`)
                      }}
                      className={`p-1 rounded shrink-0 transition-colors ${
                        isActive
                          ? 'text-white/50 hover:text-white hover:bg-white/20'
                          : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-500/50'
                      }`}
                      title={`Copier "${cleanName}" en JSON`}
                    >
                      <Copy size={14} />
                    </span>
                  </button>
                )
              })}
              </div>
            </div>
          )}

          {/* Liste des offres éditables - Regroupées par nom */}
          {(isEditMode ? visibleGroupNames : visibleGroupNames.filter(g => g === selectedGroupName)).map((groupName) => {
            const offersInGroup = groupedOffers[groupName]
            const groupOfferType = offersInGroup[0]?.offer_type || filterOfferType
            const cleanGroupName = getGroupNameWithoutPeriod(groupName)
            const renameKey = `${cleanGroupName}::${groupOfferType}`
            const editedName = editedOfferNames[renameKey]
            const isNameModified = editedName !== undefined && editedName !== cleanGroupName

            // Calculer la date de validité du groupe (la plus récente parmi les offres)
            const groupValidFrom = offersInGroup.reduce((latest, offer) => {
              if (!offer.valid_from) return latest
              if (!latest) return offer.valid_from
              return new Date(offer.valid_from) > new Date(latest) ? offer.valid_from : latest
            }, null as string | null)

            // Calculer la date de fin du groupe (la plus récente parmi les offres)
            const groupValidTo = offersInGroup.reduce((latest, offer) => {
              if (!offer.valid_to) return latest
              if (!latest) return offer.valid_to
              return new Date(offer.valid_to) > new Date(latest) ? offer.valid_to : latest
            }, null as string | null)

            const isGroupDeprecated = deprecatedOffers.some(d =>
              d.offer_name === cleanGroupName && d.offer_type === groupOfferType
            )
            return (
              <div key={`${groupName}::${groupOfferType}`} className={`space-y-2 ${isGroupDeprecated ? 'opacity-50' : ''}`}>
                {/* En-tête du groupe avec nom éditable (mode édition uniquement, en lecture les onglets suffisent) */}
                {isEditMode && <div className={`flex items-center gap-3 pb-2 border-b ${isGroupDeprecated ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
                    <input
                      type="text"
                      value={editedName ?? cleanGroupName}
                      onChange={(e) => setEditedOfferNames(prev => ({ ...prev, [renameKey]: e.target.value }))}
                      className={`flex-1 max-w-md px-3 py-1.5 text-sm font-semibold rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                        isNameModified
                          ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                          : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                      }`}
                      placeholder="Nom de l'offre"
                    />
                  {/* Dates de validité éditables au niveau du groupe */}
                  {(() => {
                    const firstOfferId = offersInGroup[0]?.id
                    const editedGroupDateFrom = editedOffers[firstOfferId]?.valid_from
                    const editedGroupDateTo = editedOffers[firstOfferId]?.valid_to
                    const groupDateFromYMD = groupValidFrom ? groupValidFrom.split('T')[0] : ''
                    const groupDateToYMD = groupValidTo ? groupValidTo.split('T')[0] : ''
                    const currentDateFrom = editedGroupDateFrom ?? groupDateFromYMD
                    const currentDateTo = editedGroupDateTo ?? groupDateToYMD
                    const isDateFromModified = editedGroupDateFrom !== undefined && editedGroupDateFrom !== groupDateFromYMD
                    const isDateToModified = editedGroupDateTo !== undefined && editedGroupDateTo !== groupDateToYMD
                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Calendar size={14} className="text-gray-400 shrink-0" />
                        <input
                          type="date"
                          value={currentDateFrom}
                          onChange={(e) => {
                            const newDate = e.target.value
                            setEditedOffers(prev => {
                              const updated = { ...prev }
                              for (const o of offersInGroup) {
                                updated[o.id] = { ...updated[o.id], valid_from: newDate }
                              }
                              return updated
                            })
                          }}
                          className={`w-[130px] px-2 py-1.5 text-sm rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            isDateFromModified
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                          }`}
                          title="Date de début de validité"
                        />
                        <span className="text-xs text-gray-400">→</span>
                        <input
                          type="date"
                          value={currentDateTo}
                          onChange={(e) => {
                            const newDate = e.target.value
                            setEditedOffers(prev => {
                              const updated = { ...prev }
                              for (const o of offersInGroup) {
                                updated[o.id] = { ...updated[o.id], valid_to: newDate }
                              }
                              return updated
                            })
                          }}
                          className={`w-[130px] px-2 py-1.5 text-sm rounded-lg border-2 bg-white dark:bg-gray-800 focus:ring-2 focus:outline-none ${
                            isDateToModified
                              ? 'border-amber-400 dark:border-amber-600 focus:ring-amber-500'
                              : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
                          }`}
                          title="Date de fin de validité (vide = offre active)"
                          placeholder="Fin"
                        />
                        {currentDateTo && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditedOffers(prev => {
                                const updated = { ...prev }
                                for (const o of offersInGroup) {
                                  updated[o.id] = { ...updated[o.id], valid_to: '' }
                                }
                                return updated
                              })
                            }}
                            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
                            title="Effacer la date de fin (offre active)"
                          >
                            <X size={14} />
                          </button>
                        )}
                        {(isDateFromModified || isDateToModified) && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded whitespace-nowrap">
                            {isDateToModified && !currentDateTo ? 'Réactivée' : 'Date modifiée'}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  {isNameModified && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Nom modifié</span>
                  )}
                  {isGroupDeprecated && (
                    <span className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded font-medium">Suppression demandée</span>
                  )}
                  {/* Bouton supprimer le groupe complet (mode édition) */}
                    <button
                      onClick={() => {
                        const isAlreadyDeprecated = deprecatedOffers.some(d =>
                          d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type
                        )
                        if (isAlreadyDeprecated) {
                          setDeprecatedOffers(prev => prev.filter(d =>
                            !(d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                          ))
                        } else {
                          setDeprecatedOffers(prev => [...prev, {
                            offer_type: offersInGroup[0]?.offer_type || filterOfferType,
                            offer_name: groupName,
                            offer_ids: offersInGroup.map(o => o.id),
                            warning: 'Suppression manuelle demandée par l\'utilisateur.',
                          }])
                        }
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                          ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20'
                      }`}
                      title={deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                        ? 'Annuler la suppression'
                        : 'Supprimer cette offre'
                      }
                    >
                      {deprecatedOffers.some(d => d.offer_name === groupName && d.offer_type === offersInGroup[0]?.offer_type)
                        ? <Undo2 size={16} />
                        : <Trash2 size={16} />
                      }
                    </button>
                </div>}

                {/* Offres du groupe */}
                {offersInGroup.map((offer) => {
                  const modified = isOfferModified(offer)
                  const power = formatPower(offer)
                  const powerNum = offer.power_kva || null
                  const isMarkedForRemoval = powerNum !== null && powersToRemove.some(p => p.power === powerNum && p.groupName === groupName)

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
                        const gridCols = `70px 1fr ${Array(cols).fill('1fr').join(' ')} ${isEditMode ? '70px' : ''}`

                        return (
                          <div
                            className="grid items-center gap-x-2 gap-y-1"
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            {/* Col 1: Puissance + Badges */}
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

                            {/* Col 2: Abonnement (compact si beaucoup de colonnes tarifs) */}
                            {renderEditableField('Abo.', 'subscription_price', '€/mois', offer, cols >= 4)}

                            {/* Colonnes Tarifs - tout sur une seule ligne */}
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
                                {renderEditableField('HC', 'hc_price', '€/kWh', offer, true)}
                                {renderEditableField('HP', 'hp_price', '€/kWh', offer, true)}
                                {renderEditableField('HC WE', 'hc_price_weekend', '€/kWh', offer, true)}
                                {renderEditableField('HP WE', 'hp_price_weekend', '€/kWh', offer, true)}
                              </>
                            )}

                            {offer.offer_type === 'TEMPO' && (
                              <>
                                {renderEditableField('HC Bleu', 'tempo_blue_hc', '€/kWh', offer, true)}
                                {renderEditableField('HP Bleu', 'tempo_blue_hp', '€/kWh', offer, true)}
                                {renderEditableField('HC Blanc', 'tempo_white_hc', '€/kWh', offer, true)}
                                {renderEditableField('HP Blanc', 'tempo_white_hp', '€/kWh', offer, true)}
                                {renderEditableField('HC Rouge', 'tempo_red_hc', '€/kWh', offer, true)}
                                {renderEditableField('HP Rouge', 'tempo_red_hp', '€/kWh', offer, true)}
                              </>
                            )}

                            {offer.offer_type === 'SEASONAL' && (
                              <>
                                {renderEditableField('HC Été', 'hc_price_summer', '€/kWh', offer, true)}
                                {renderEditableField('HP Été', 'hp_price_summer', '€/kWh', offer, true)}
                                {renderEditableField('HC Hiver', 'hc_price_winter', '€/kWh', offer, true)}
                                {renderEditableField('HP Hiver', 'hp_price_winter', '€/kWh', offer, true)}
                              </>
                            )}

                            {offer.offer_type === 'EJP' && (
                              <>
                                {renderEditableField('Normal', 'ejp_normal', '€/kWh', offer)}
                                {renderEditableField('Pointe', 'ejp_peak', '€/kWh', offer)}
                              </>
                            )}

                            {/* Col Actions - uniquement en mode édition (première ligne) */}
                            {isEditMode && powerNum !== null && (
                              <div className="flex items-center gap-0.5 justify-center">
                                {isMarkedForRemoval ? (
                                  <button
                                    onClick={() => setPowersToRemove(prev => prev.filter(p => !(p.power === powerNum && p.groupName === groupName)))}
                                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Annuler la suppression"
                                  >
                                    <Undo2 size={16} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      if (!powersToRemove.some(p => p.power === powerNum && p.groupName === groupName)) {
                                        setPowersToRemove(prev => [...prev, { power: powerNum, groupName }])
                                      }
                                    }}
                                    className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                    title="Proposer la suppression de cette puissance"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                                {/* Bouton duplication des tarifs */}
                                <div className="relative">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDuplicateDropdownId(prev => prev === offer.id ? null : offer.id)
                                    }}
                                    className="p-1.5 text-primary-500 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors"
                                    title="Dupliquer les tarifs"
                                  >
                                    <ArrowDownToLine size={16} />
                                  </button>
                                  {duplicateDropdownId === offer.id && (
                                    <div
                                      className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-64"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <button
                                        onClick={() => duplicateOfferFields(offer, 'next', offersInGroup)}
                                        disabled={offersInGroup.indexOf(offer) === offersInGroup.length - 1}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        Dupliquer vers la ligne suivante
                                      </button>
                                      <button
                                        onClick={() => duplicateOfferFields(offer, 'all', offersInGroup)}
                                        disabled={offersInGroup.length <= 1}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        Dupliquer vers toutes les lignes
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Plus de lignes supplémentaires : tous les tarifs sont sur une seule ligne */}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}

                {/* Nouvelles puissances ajoutées à ce groupe (mode édition) */}
                {isEditMode && newPowersData.map((newPower, index) => {
                  // Filtrer : n'afficher que les puissances de CE groupe
                  const groupOfferType = offersInGroup[0]?.offer_type
                  if (newPower.offer_name !== groupName || newPower.offer_type !== groupOfferType) return null
                  return renderNewPowerRow(newPower, index)
                })}

                {/* Bouton ajouter une puissance à ce groupe (mode édition) */}
                {isEditMode && (() => {
                  const groupOfferType = offersInGroup[0]?.offer_type || filterOfferType
                  const requiredFields = getFieldKeysForOfferType(groupOfferType)
                  // Chercher la dernière puissance ajoutée pour ce groupe
                  const groupNewPowers = newPowersData.filter(np => np.offer_name === groupName && np.offer_type === groupOfferType)
                  const lastNewPower = groupNewPowers.length > 0 ? groupNewPowers[groupNewPowers.length - 1] : null
                  // Vérifier la complétude de la dernière ligne (newPower ou offre existante)
                  let isLastComplete = true
                  let lastFields: Record<string, string> = {}
                  if (lastNewPower) {
                    isLastComplete = lastNewPower.power > 0 &&
                      !!lastNewPower.fields.subscription_price?.trim() &&
                      requiredFields.every(f => !!lastNewPower.fields[f]?.trim())
                    lastFields = lastNewPower.fields
                  } else if (offersInGroup.length > 0) {
                    const lastOffer = offersInGroup[offersInGroup.length - 1] as unknown as Record<string, unknown>
                    // Les offres existantes sont déjà complètes, copier leurs prix
                    for (const key of requiredFields) {
                      if (lastOffer[key] != null) lastFields[key] = String(lastOffer[key])
                    }
                  }
                  return (
                    <button
                      onClick={() => {
                        const copiedFields: Record<string, string> = {}
                        for (const key of requiredFields) {
                          if (lastFields[key]) copiedFields[key] = lastFields[key]
                        }
                        setNewPowersData(prev => [...prev, { power: 0, fields: copiedFields, offer_name: groupName, offer_type: groupOfferType }])
                      }}
                      disabled={!isLastComplete}
                      className={`w-full rounded-lg p-2 border-2 border-dashed transition-all flex items-center justify-center gap-2 ${isLastComplete ? 'border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-400 dark:hover:border-primary-600' : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
                      title={!isLastComplete ? 'Remplissez tous les champs de la ligne précédente avant d\'en ajouter une nouvelle' : undefined}
                    >
                      <Plus size={16} />
                      <span className="font-medium text-xs">Ajouter une puissance</span>
                    </button>
                  )
                })()}

                {/* Dates de validité du groupe - en bas */}
                {(groupValidFrom || groupValidTo) && (
                  <div className="flex justify-end pt-2 gap-2">
                    {groupValidFrom && (
                      <span
                        className="text-sm font-medium px-3 py-1 rounded-lg border text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/40 border-primary-300 dark:border-primary-700"
                        title={`Tarif en vigueur depuis le ${new Date(groupValidFrom).toLocaleDateString('fr-FR')}`}
                      >
                        Depuis le {new Date(groupValidFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    )}
                    {groupValidTo && (
                      <span
                        className="text-sm font-medium px-3 py-1 rounded-lg border text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700"
                        title={`Tarif expiré le ${new Date(groupValidTo).toLocaleDateString('fr-FR')}`}
                      >
                        Jusqu'au {new Date(groupValidTo).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Nouvelles puissances non associées à un groupe (import IA sans offer_name, etc.) */}
          {isEditMode && newPowersData.map((newPower, index) => {
            // N'afficher ici que les puissances sans groupe ou dont le groupe n'existe pas
            if (newPower.offer_name && groupNames.includes(newPower.offer_name)) return null
            return renderNewPowerRow(newPower, index)
          })}


          {/* Section pliable : Offres expirées */}
          {expiredGroupNames.length > 0 && (
            <div className="mt-6 rounded-lg border border-amber-200 dark:border-amber-700 overflow-hidden">
              <button
                onClick={() => setShowExpiredSection(!showExpiredSection)}
                className="w-full flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors cursor-pointer"
              >
                {showExpiredSection ? <ChevronDown size={16} className="text-amber-500" /> : <ChevronRight size={16} className="text-amber-500" />}
                <Clock size={16} className="text-amber-500" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  Offres expirées
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-200 dark:bg-amber-800 px-2 py-0.5 rounded-full">
                  {expiredGroupNames.length}
                </span>
              </button>

              {showExpiredSection && (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {[...expiredGroupNames].sort((a, b) => {
                    const offersA = groupedOffers[a] || []
                    const offersB = groupedOffers[b] || []
                    const maxDateA = offersA.reduce((m, o) => o.valid_to && (!m || o.valid_to > m) ? o.valid_to : m, '' as string)
                    const maxDateB = offersB.reduce((m, o) => o.valid_to && (!m || o.valid_to > m) ? o.valid_to : m, '' as string)
                    if (maxDateA !== maxDateB) return maxDateB.localeCompare(maxDateA)
                    return getGroupNameWithoutPeriod(a).localeCompare(getGroupNameWithoutPeriod(b))
                  }).map((gName) => {
                          const offers = groupedOffers[gName]
                          if (!offers) return null
                          const cleanName = getGroupNameWithoutPeriod(gName)
                          const periodLabel = getGroupPeriodLabel(gName)
                          const latestValidTo = offers.reduce((latest, offer) => {
                            if (!offer.valid_to) return latest
                            if (!latest) return offer.valid_to
                            return new Date(offer.valid_to) > new Date(latest) ? offer.valid_to : latest
                          }, null as string | null)
                          return (
                            <div
                              key={gName}
                              className="opacity-80"
                            >
                              <div className="px-4 py-2 bg-amber-50/50 dark:bg-amber-900/10 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{cleanName}</span>
                                <div className="flex items-center gap-2">
                                  {latestValidTo && (
                                    <span className="text-xs text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-600 px-2 py-0.5 rounded">
                                      Expiré le {new Date(latestValidTo).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </span>
                                  )}
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      if (reactivatingGroups.has(gName)) return
                                      setReactivatingGroups(prev => new Set(prev).add(gName))
                                      try {
                                        if (isPrivilegedUser) {
                                          // Admin : réactivation directe via API
                                          for (const offer of offers) {
                                              await energyApi.updateOffer(offer.id, { valid_to: null, is_active: true } as unknown as Partial<EnergyOffer>)
                                          }
                                          toast.success(`${cleanName}${periodLabel ? ` (${periodLabel})` : ''} réactivé`)
                                          queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
                                        } else {
                                          // Utilisateur : soumission d'une contribution
                                          const provider = sortedProviders.find(p => p.id === filterProvider)
                                          const contributions = offers.map(offer => ({
                                            contribution_type: 'UPDATE_OFFER' as const,
                                            existing_provider_id: filterProvider,
                                            existing_offer_id: offer.id,
                                            provider_name: provider?.name || '',
                                            offer_name: `[REACTIVATION] ${offer.name}`,
                                            offer_type: offer.offer_type,
                                            description: `Demande de réactivation de l'offre ${cleanName}${periodLabel ? ` (${periodLabel})` : ''} (${offer.power_kva || '?'} kVA)`,
                                            power_kva: offer.power_kva || 0,
                                            price_sheet_url: '',
                                            valid_from: new Date().toISOString().split('T')[0],
                                          }))
                                          await energyApi.submitContributionBatch(contributions, '')
                                          toast.success(`Demande de réactivation soumise pour ${cleanName}${periodLabel ? ` (${periodLabel})` : ''}`)
                                          queryClient.invalidateQueries({ queryKey: ['contributions'] })
                                        }
                                      } catch {
                                        toast.error('Erreur lors de la réactivation')
                                      } finally {
                                        setReactivatingGroups(prev => {
                                          const next = new Set(prev)
                                          next.delete(gName)
                                          return next
                                        })
                                      }
                                    }}
                                    disabled={reactivatingGroups.has(gName)}
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-300 dark:border-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <RotateCcw size={12} className={reactivatingGroups.has(gName) ? 'animate-spin' : ''} />
                                    {reactivatingGroups.has(gName) ? 'Envoi...' : 'Réactiver'}
                                  </button>
                                  {/* Bouton supprimer (admin uniquement) */}
                                  {isPrivilegedUser && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDeleteConfirm({ groupName: gName, offers })
                                      }}
                                      disabled={deletingGroups.has(gName)}
                                      className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-800/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/60 border border-red-300 dark:border-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                    >
                                      <Trash2 size={12} className={deletingGroups.has(gName) ? 'animate-pulse' : ''} />
                                      {deletingGroups.has(gName) ? 'Suppression...' : 'Supprimer'}
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className={isEditMode ? 'space-y-2 p-3' : 'divide-y divide-gray-200 dark:divide-gray-700'}>
                                {offers.sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0)).map((offer) => {
                                  if (!isEditMode) {
                                    return (
                                      <div key={offer.id} className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                        <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[60px]">
                                          {offer.power_kva || '?'} kVA
                                        </span>
                                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                                          Abo. <span className="font-semibold text-gray-700 dark:text-gray-300">{offer.subscription_price}</span> €/mois
                                        </span>
                                        {offer.base_price != null && (
                                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                                            Base <span className="font-semibold text-gray-700 dark:text-gray-300">{offer.base_price}</span> €/kWh
                                          </span>
                                        )}
                                        {offer.hc_price != null && (
                                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                                            HC <span className="font-semibold text-gray-700 dark:text-gray-300">{offer.hc_price}</span> €/kWh
                                          </span>
                                        )}
                                        {offer.hp_price != null && (
                                          <span className="text-gray-500 dark:text-gray-400 text-xs">
                                            HP <span className="font-semibold text-gray-700 dark:text-gray-300">{offer.hp_price}</span> €/kWh
                                          </span>
                                        )}
                                      </div>
                                    )
                                  }

                                  // Mode édition : même grille que les offres actives
                                  const modified = isOfferModified(offer)
                                  const power = formatPower(offer)
                                  const cols = getTariffColumns(offer.offer_type)
                                  const gridCols = `70px 1fr ${Array(cols).fill('1fr').join(' ')}`

                                  return (
                                    <div
                                      key={offer.id}
                                      className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border transition-all ${
                                        modified
                                          ? 'border-amber-400 dark:border-amber-600'
                                          : 'border-gray-200 dark:border-gray-700'
                                      }`}
                                    >
                                      <div
                                        className="grid items-center gap-x-2 gap-y-1"
                                        style={{ gridTemplateColumns: gridCols }}
                                      >
                                        {/* Puissance + badge */}
                                        <div className="flex flex-col items-start gap-1">
                                          <span className="text-sm font-medium px-2 py-1 rounded text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700">
                                            {power || '-'}
                                          </span>
                                          {modified && (
                                            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Modifié</span>
                                          )}
                                        </div>

                                        {/* Abonnement */}
                                        {renderEditableField('Abo.', 'subscription_price', '€/mois', offer, cols >= 4)}

                                        {/* Colonnes tarifs selon le type */}
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
                                            {renderEditableField('HC', 'hc_price', '€/kWh', offer, true)}
                                            {renderEditableField('HP', 'hp_price', '€/kWh', offer, true)}
                                            {renderEditableField('HC WE', 'hc_price_weekend', '€/kWh', offer, true)}
                                            {renderEditableField('HP WE', 'hp_price_weekend', '€/kWh', offer, true)}
                                          </>
                                        )}

                                        {offer.offer_type === 'TEMPO' && (
                                          <>
                                            {renderEditableField('HC Bleu', 'tempo_blue_hc', '€/kWh', offer, true)}
                                            {renderEditableField('HP Bleu', 'tempo_blue_hp', '€/kWh', offer, true)}
                                            {renderEditableField('HC Blanc', 'tempo_white_hc', '€/kWh', offer, true)}
                                            {renderEditableField('HP Blanc', 'tempo_white_hp', '€/kWh', offer, true)}
                                            {renderEditableField('HC Rouge', 'tempo_red_hc', '€/kWh', offer, true)}
                                            {renderEditableField('HP Rouge', 'tempo_red_hp', '€/kWh', offer, true)}
                                          </>
                                        )}

                                        {offer.offer_type === 'SEASONAL' && (
                                          <>
                                            {renderEditableField('HC Été', 'hc_price_summer', '€/kWh', offer, true)}
                                            {renderEditableField('HP Été', 'hp_price_summer', '€/kWh', offer, true)}
                                            {renderEditableField('HC Hiver', 'hc_price_winter', '€/kWh', offer, true)}
                                            {renderEditableField('HP Hiver', 'hp_price_winter', '€/kWh', offer, true)}
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
                                  )
                                })}
                              </div>
                            </div>
                          )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Spacer pour le bouton flottant */}
          {isEditMode && hasAnyModifications && (
            <div className="h-16" />
          )}
        </div>
      ) : null}

      </>)}

      {/* Bouton flottant fixe en bas de page pour ouvrir le récapitulatif */}
      {isEditMode && hasAnyModifications && !showRecapModal && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-gradient-to-t from-gray-900/90 via-gray-900/70 to-transparent pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <button
              onClick={() => openRecapModal()}
              className="w-full rounded-xl p-3.5 bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/30 hover:shadow-primary-600/50 transition-all flex items-center justify-center gap-3"
            >
              <Send size={20} />
              <span className="font-semibold">Voir le récapitulatif et soumettre</span>
              <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {totalModificationsCount}
              </span>
            </button>
          </div>
        </div>
      )}

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
            <div className="sticky top-0 bg-primary-600 dark:bg-primary-700 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Send size={20} className="text-white" />
                <h3 className="text-lg font-bold text-white">Récapitulatif</h3>
                <span className="bg-white/20 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  {totalModificationsCount} modification{totalModificationsCount > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setShowRecapModal(false)}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                aria-label="Fermer"
              >
                <X size={18} className="text-white" />
              </button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {/* Bouton global Tout sélectionner / Tout désélectionner */}
                {(() => {
                  const allModified = offersArray.filter(o => o.provider_id === filterProvider && isOfferModified(o))
                  if (allModified.length === 0) return null
                  const allGlobalSelected = allModified.every(o => !recapExcludedPowers.has(`modified-${o.id}`))
                  const noneGlobalSelected = allModified.every(o => recapExcludedPowers.has(`modified-${o.id}`))
                  return (
                    <div className="flex items-center gap-3 px-1">
                      <input
                        type="checkbox"
                        checked={allGlobalSelected}
                        ref={el => { if (el) el.indeterminate = !allGlobalSelected && !noneGlobalSelected }}
                        onChange={() => {
                          setRecapExcludedPowers(prev => {
                            const next = new Set(prev)
                            if (allGlobalSelected) {
                              allModified.forEach(o => next.add(`modified-${o.id}`))
                            } else {
                              allModified.forEach(o => next.delete(`modified-${o.id}`))
                            }
                            return next
                          })
                        }}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {allGlobalSelected ? 'Tout désélectionner' : noneGlobalSelected ? 'Tout sélectionner' : `${allModified.filter(o => !recapExcludedPowers.has(`modified-${o.id}`)).length}/${allModified.length} sélectionnés`}
                      </span>
                    </div>
                  )
                })()}

                {/* Offres importées — tableau unifié par groupe (modifiées + inchangées) */}
                {(() => {
                  // Toutes les offres du fournisseur concernées par l'import (modifiées OU inchangées)
                  const allRelevantOffers = offersArray
                    .filter(o => o.provider_id === filterProvider && o.is_active !== false && (isOfferModified(o) || unchangedOfferIds.has(o.id)))
                    .sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))
                  // Regrouper par (clean name + offer_type)
                  const groups: Record<string, typeof allRelevantOffers> = {}
                  for (const offer of allRelevantOffers) {
                    const cleanName = getCleanOfferName(offer.name)
                    const groupKey = `${cleanName}##${offer.offer_type}`
                    if (!groups[groupKey]) groups[groupKey] = []
                    groups[groupKey].push(offer)
                  }
                  // Trier : groupes avec modifications en premier, doublons (100% unchanged) en dernier
                  const sortedEntries = Object.entries(groups).sort(([, offersA], [, offersB]) => {
                    const hasModA = offersA.some(o => isOfferModified(o))
                    const hasModB = offersB.some(o => isOfferModified(o))
                    if (hasModA && !hasModB) return -1
                    if (!hasModA && hasModB) return 1
                    return 0
                  })
                  return sortedEntries.map(([groupKey, offers]) => {
                    const [groupName, groupType] = groupKey.split('##')
                    const groupFieldKeys = getFieldKeysForOfferType(groupType)
                    const modifiedOffers = offers.filter(o => isOfferModified(o))
                    const modifiedCount = modifiedOffers.length
                    const allUnchanged = modifiedCount === 0
                    // Compteur de sélection (uniquement les offres modifiées)
                    const selectedCount = modifiedOffers.filter(o => !recapExcludedPowers.has(`modified-${o.id}`)).length
                    const allSelected = selectedCount === modifiedCount
                    const noneSelected = selectedCount === 0
                    return (
                    <div key={groupKey} className={`rounded-lg border overflow-hidden ${allUnchanged ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'}`}>
                      <div className={`px-4 py-2.5 font-semibold text-sm border-b flex items-center gap-2 ${allUnchanged ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700'}`}>
                        {groupName}
                        <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded font-medium">{groupType}</span>
                        {allUnchanged ? (
                          <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ml-auto">
                            <AlertCircle size={10} /> Déjà en base
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">
                              {modifiedCount} modif.
                            </span>
                            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{selectedCount}/{modifiedCount}</span>
                          </div>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={allUnchanged ? 'bg-red-100/50 dark:bg-red-900/20' : 'bg-gray-100/50 dark:bg-gray-800/50'}>
                              <th className="px-2 py-1.5 w-8">
                                {modifiedCount > 0 && (
                                  <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
                                    onChange={() => {
                                      setRecapExcludedPowers(prev => {
                                        const next = new Set(prev)
                                        if (allSelected) {
                                          modifiedOffers.forEach(o => next.add(`modified-${o.id}`))
                                        } else {
                                          modifiedOffers.forEach(o => next.delete(`modified-${o.id}`))
                                        }
                                        return next
                                      })
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                  />
                                )}
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                              <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                              {groupFieldKeys.map(k => (
                                <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(fieldLabels[k] || k)}`}>
                                  {fieldLabels[k] || k}
                                </th>
                              ))}
                              {offers.some(o => unchangedOfferIds.has(o.id)) && <th className="px-2 py-1.5 w-8"></th>}
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${allUnchanged ? 'divide-red-200 dark:divide-red-800' : 'divide-gray-200 dark:divide-gray-700'}`}>
                            {offers.map(offer => {
                              const isModified = isOfferModified(offer)
                              const isUnchanged = !isModified && unchangedOfferIds.has(offer.id)
                              const exclusionKey = `modified-${offer.id}`
                              const isExcluded = isModified && recapExcludedPowers.has(exclusionKey)
                              const edited = editedOffers[offer.id] || {}
                              const allFields = ['subscription_price', ...groupFieldKeys]
                              return (
                                <tr key={offer.id} className={`${isModified && !isExcluded ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''} ${isUnchanged ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isExcluded ? 'opacity-30' : ''}`}>
                                  <td className="px-2 py-1.5 text-center">
                                    {isModified ? (
                                      <input
                                        type="checkbox"
                                        checked={!isExcluded}
                                        onChange={() => {
                                          setRecapExcludedPowers(prev => {
                                            const next = new Set(prev)
                                            if (next.has(exclusionKey)) next.delete(exclusionKey)
                                            else next.add(exclusionKey)
                                            return next
                                          })
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                      />
                                    ) : isUnchanged ? (
                                      <AlertCircle size={14} className="text-red-500 dark:text-red-400 inline" />
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{offer.power_kva || '?'}</td>
                                  {allFields.map(key => {
                                    const origVal = Number((offer as unknown as Record<string, unknown>)[key])
                                    const isSub = key === 'subscription_price'
                                    const editedVal = edited[key]
                                    const hasChange = editedVal !== undefined && (() => {
                                      const next = Number(editedVal)
                                      if (isNaN(origVal) && isNaN(next)) return false
                                      if (isNaN(origVal) || isNaN(next)) return true
                                      return Math.abs(origVal - next) > 0.00001
                                    })()
                                    return (
                                      <td key={key} className={`${isSub ? 'px-3' : 'px-2'} py-1.5 text-right font-mono`}>
                                        {hasChange ? (
                                          <span className="flex items-center justify-end gap-1">
                                            <span className="text-red-500 line-through">{isNaN(origVal) ? '-' : origVal.toFixed(isSub ? 2 : 4)}</span>
                                            <span className="text-gray-400">→</span>
                                            <span className="text-green-600 dark:text-green-400 font-semibold">{Number(editedVal).toFixed(isSub ? 2 : 4)}</span>
                                          </span>
                                        ) : (
                                          <span className="text-gray-700 dark:text-gray-300">{isNaN(origVal) ? '-' : origVal.toFixed(isSub ? 2 : 4)}</span>
                                        )}
                                      </td>
                                    )
                                  })}
                                  {offers.some(o => unchangedOfferIds.has(o.id)) && (
                                    <td className="px-2 py-1.5 text-center">
                                      {isUnchanged && <AlertCircle size={12} className="text-red-500 inline" />}
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )})
                })()}

                {/* Fournisseurs à supprimer */}
                {providersToRemove.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                    <div className="px-4 py-2.5 bg-red-100 dark:bg-red-900/40 font-semibold text-sm text-red-800 dark:text-red-300 border-b border-red-200 dark:border-red-700 flex items-center gap-2">
                      <Trash2 size={14} />
                      Suppression de fournisseurs
                    </div>
                    <div className="divide-y divide-red-200 dark:divide-red-800">
                      {providersToRemove.map(providerId => {
                        const provider = sortedProviders.find(p => p.id === providerId)
                        const providerOffersCount = offersArray.filter(o => o.provider_id === providerId).length
                        return (
                          <div key={providerId} className="px-4 py-2 flex items-center justify-between">
                            <span className="text-sm text-red-700 dark:text-red-300">{provider?.name || 'Fournisseur inconnu'}</span>
                            <span className="text-xs text-red-500 dark:text-red-400">{providerOffersCount} offre{providerOffersCount > 1 ? 's' : ''}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Offres signalées comme deprecated par l'IA */}
                {deprecatedOffers.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 overflow-hidden">
                    <div className="px-4 py-2.5 bg-orange-100 dark:bg-orange-900/40 font-semibold text-sm text-orange-800 dark:text-orange-300 border-b border-orange-200 dark:border-orange-700 flex items-center gap-2">
                      <Trash2 size={14} />
                      Offres obsolètes signalées par l'IA ({deprecatedOffers.reduce((sum, d) => sum + d.offer_ids.length, 0)})
                    </div>
                    <div className="divide-y divide-orange-200 dark:divide-orange-800">
                      {deprecatedOffers.map((dep, index) => (
                        <div key={`deprecated-${index}`} className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">{dep.offer_name}</span>
                            <span className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">{dep.offer_type}</span>
                            <span className="text-xs text-orange-500 dark:text-orange-400 ml-auto">{dep.offer_ids.length} offre{dep.offer_ids.length > 1 ? 's' : ''}</span>
                          </div>
                          {dep.warning && (
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1 italic">{dep.warning}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modifications de puissances — regroupées par offre et période */}
                {(newPowersData.length > 0 || powersToRemove.length > 0) && (() => {
                  // Regrouper les nouvelles puissances par offre + période, en gardant l'index global
                  const groupedByOfferAndPeriod: Record<string, Array<{ data: typeof newPowersData[0]; globalIndex: number }>> = {}
                  for (let i = 0; i < newPowersData.length; i++) {
                    const newPower = newPowersData[i]
                    const offerKey = `${newPower.offer_name || 'Sans nom'} (${newPower.offer_type || filterOfferType})`
                    const periodKey = newPower.valid_from
                      ? (newPower.valid_to
                        ? `${new Date(newPower.valid_from).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })} → ${new Date(newPower.valid_to).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}`
                        : `Valide depuis ${new Date(newPower.valid_from).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}`)
                      : 'Offre active'
                    const groupKey = `${offerKey}##${periodKey}`
                    if (!groupedByOfferAndPeriod[groupKey]) groupedByOfferAndPeriod[groupKey] = []
                    groupedByOfferAndPeriod[groupKey].push({ data: newPower, globalIndex: i })
                  }

                  return Object.entries(groupedByOfferAndPeriod).map(([groupKey, powersWithIndex]) => {
                    const [offerInfo, periodInfo] = groupKey.split('##')
                    const powerFieldKeys = powersWithIndex[0] ? getFieldKeysForOfferType(powersWithIndex[0].data.offer_type || filterOfferType) : []
                    const selectedCount = powersWithIndex.filter(p => !recapExcludedPowers.has(`newpower-${p.globalIndex}`)).length
                    const allSelected = selectedCount === powersWithIndex.length
                    const noneSelected = selectedCount === 0
                    return (
                      <div key={groupKey} className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 overflow-hidden">
                        <div className="px-4 py-2.5 bg-green-100 dark:bg-green-900/40 font-semibold text-sm text-green-800 dark:text-green-300 border-b border-green-200 dark:border-green-700 flex items-center gap-2 flex-wrap">
                          <Plus size={14} />
                          {offerInfo}
                          <span className="text-xs font-normal text-green-600 dark:text-green-400">{periodInfo}</span>
                          {/* Boutons Tous / Aucun */}
                          <div className="flex items-center gap-1 ml-auto">
                            <span className="text-xs font-normal text-green-600 dark:text-green-400">{selectedCount}/{powersWithIndex.length}</span>
                            <button
                              onClick={() => {
                                setRecapExcludedPowers(prev => {
                                  const next = new Set(prev)
                                  powersWithIndex.forEach(p => next.delete(`newpower-${p.globalIndex}`))
                                  return next
                                })
                              }}
                              disabled={allSelected}
                              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${allSelected ? 'text-gray-400 dark:text-gray-600 cursor-default' : 'text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/30'}`}
                            >
                              Tous
                            </button>
                            <button
                              onClick={() => {
                                setRecapExcludedPowers(prev => {
                                  const next = new Set(prev)
                                  powersWithIndex.forEach(p => next.add(`newpower-${p.globalIndex}`))
                                  return next
                                })
                              }}
                              disabled={noneSelected}
                              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${noneSelected ? 'text-gray-400 dark:text-gray-600 cursor-default' : 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
                            >
                              Aucun
                            </button>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-green-100/50 dark:bg-green-900/20">
                                <th className="px-2 py-1.5 w-8"></th>
                                <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                                <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                                {powerFieldKeys.map(k => (
                                  <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(fieldLabels[k] || k)}`}>
                                    {fieldLabels[k] || k}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-green-200 dark:divide-green-800">
                              {powersWithIndex.map(({ data: newPower, globalIndex }) => {
                                const exclusionKey = `newpower-${globalIndex}`
                                const isExcluded = recapExcludedPowers.has(exclusionKey)
                                return (
                                  <tr key={`add-${globalIndex}`} className={isExcluded ? 'opacity-40' : ''}>
                                    <td className="px-2 py-1.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={!isExcluded}
                                        onChange={() => {
                                          setRecapExcludedPowers(prev => {
                                            const next = new Set(prev)
                                            if (next.has(exclusionKey)) next.delete(exclusionKey)
                                            else next.add(exclusionKey)
                                            return next
                                          })
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{newPower.power}</td>
                                    <td className="px-3 py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">
                                      {newPower.fields.subscription_price || '-'}
                                    </td>
                                    {powerFieldKeys.map(k => (
                                      <td key={k} className="px-2 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">
                                        {newPower.fields[k] || '-'}
                                      </td>
                                    ))}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })
                })()}

                {/* Puissances à supprimer */}
                {powersToRemove.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                    <div className="px-4 py-2.5 bg-red-100 dark:bg-red-900/40 font-semibold text-sm text-red-800 dark:text-red-300 border-b border-red-200 dark:border-red-700 flex items-center gap-2">
                      <Trash2 size={14} />
                      Suppression de puissances
                    </div>
                    <div className="divide-y divide-red-200 dark:divide-red-800">
                      {[...powersToRemove].sort((a, b) => a.power - b.power).map(({ power, groupName }) => (
                        <div key={`remove-${groupName}-${power}`} className="px-4 py-2 flex items-center justify-between text-red-600 dark:text-red-400">
                          <span className="text-xs flex items-center gap-1"><Trash2 size={12} /> Supprimer <span className="text-gray-500 dark:text-gray-400">({groupName})</span></span>
                          <span className="text-xs font-semibold">{power} kVA</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Noms de groupes modifiés */}
                {hasModifiedGroupNames && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 overflow-hidden">
                    <div className="px-4 py-2.5 bg-amber-100 dark:bg-amber-900/40 font-semibold text-sm text-amber-800 dark:text-amber-300 border-b border-amber-200 dark:border-amber-700 flex items-center gap-2">
                      <Pencil size={14} />
                      Renommages
                    </div>
                    <div className="divide-y divide-amber-200 dark:divide-amber-700">
                      {Object.entries(editedOfferNames)
                        .filter(([renameKey, newName]) => {
                          const originalName = renameKey.split('::')[0]
                          return newName !== originalName && newName.trim() !== ''
                        })
                        .map(([renameKey, newName]) => {
                          const [originalName, offerType] = renameKey.split('::')
                          return (
                            <div key={`rename-${renameKey}`} className="px-4 py-2 flex items-center gap-2 text-xs">
                              <span className="text-red-500 line-through">{originalName}</span>
                              <span className="text-gray-400">→</span>
                              <span className="font-semibold text-green-600 dark:text-green-400">{newName}</span>
                              {offerType && <span className="text-gray-400 ml-1">({offerType})</span>}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* Nouveaux groupes d'offres */}
                {newGroups.length > 0 && newGroups.map((group, index) => {
                  const groupType = group.offer_type || filterOfferType
                  const groupFieldKeys = getFieldKeysForOfferType(groupType)
                  const isAlreadyInDb = group.alreadyInDb === true
                  const hasDuplicates = !isAlreadyInDb && group.powers.some(p => p.power > 0 && existingPowers.some(ep =>
                    ep.power === p.power && ep.offer_type === groupType &&
                    periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
                  ))
                  // Compter les puissances sélectionnées dans ce groupe
                  const selectedCount = group.powers.filter((_, pi) => !recapExcludedPowers.has(`group-${index}-${pi}`)).length
                  const allSelected = selectedCount === group.powers.length
                  const noneSelected = selectedCount === 0
                  // Styles : rouge pour doublons, gris pour déjà en base, bleu pour nouveau
                  const containerClass = hasDuplicates
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                    : isAlreadyInDb
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                      : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                  const headerClass = hasDuplicates
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700'
                    : isAlreadyInDb
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                  return (
                    <div key={`recap-group-${index}`} className={`rounded-lg border overflow-hidden ${containerClass}`}>
                      {/* En-tête du groupe */}
                      <div className={`px-4 py-2.5 font-semibold text-sm border-b flex items-center gap-2 flex-wrap ${headerClass}`}>
                        <Package size={14} />
                        {group.name || <span className="italic text-gray-400">Sans nom</span>}
                        {group.offer_type && (
                          <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded font-medium">{group.offer_type}</span>
                        )}
                        {(group.validFrom || group.validTo) && (
                          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                            {group.validFrom && group.validTo
                              ? `${new Date(group.validFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} → ${new Date(group.validTo).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`
                              : group.validFrom ? `Depuis ${new Date(group.validFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                          </span>
                        )}
                        {isAlreadyInDb && (
                          <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ml-auto">
                            <AlertCircle size={10} /> Déjà en base
                          </span>
                        )}
                        {hasDuplicates && (
                          <span className="text-xs bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <AlertCircle size={10} /> Doublons détectés
                          </span>
                        )}
                        {!isAlreadyInDb && <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-auto">{selectedCount}/{group.powers.length}</span>}
                      </div>

                      {/* Tableau des puissances */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={`${hasDuplicates ? 'bg-red-100/50 dark:bg-red-900/20' : isAlreadyInDb ? 'bg-red-100/50 dark:bg-red-900/20' : 'bg-blue-100/50 dark:bg-blue-900/20'}`}>
                              <th className="px-2 py-1.5 w-8">
                                {!isAlreadyInDb && (
                                  <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
                                    onChange={() => {
                                      setRecapExcludedPowers(prev => {
                                        const next = new Set(prev)
                                        if (allSelected) {
                                          group.powers.forEach((_, pi) => next.add(`group-${index}-${pi}`))
                                        } else {
                                          group.powers.forEach((_, pi) => next.delete(`group-${index}-${pi}`))
                                        }
                                        return next
                                      })
                                    }}
                                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                  />
                                )}
                              </th>
                              <th className="px-3 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-400 w-16">kVA</th>
                              <th className="px-3 py-1.5 text-right font-semibold text-gray-600 dark:text-gray-400">Abo. (€)</th>
                              {groupFieldKeys.map(k => (
                                <th key={k} className={`px-2 py-1.5 text-right font-semibold ${getLabelColor(fieldLabels[k] || k)}`}>
                                  {fieldLabels[k] || k}
                                </th>
                              ))}
                              {hasDuplicates && <th className="px-2 py-1.5 w-8"></th>}
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${hasDuplicates ? 'divide-red-200 dark:divide-red-800' : isAlreadyInDb ? 'divide-gray-200 dark:divide-gray-700' : 'divide-blue-200 dark:divide-blue-700'}`}>
                            {group.powers.map((power, powerIndex) => {
                              const isDup = power.power > 0 && existingPowers.some(ep =>
                                ep.power === power.power && ep.offer_type === groupType &&
                                periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
                              )
                              const exclusionKey = `group-${index}-${powerIndex}`
                              const isExcluded = recapExcludedPowers.has(exclusionKey)
                              return (
                                <tr key={`recap-group-${index}-power-${powerIndex}`} className={`${isDup ? 'bg-red-50/50 dark:bg-red-900/10' : ''} ${isExcluded && !isAlreadyInDb ? 'opacity-40' : ''}`}>
                                  <td className="px-2 py-1.5 text-center">
                                    {isAlreadyInDb ? (
                                      <AlertCircle size={14} className="text-red-500 dark:text-red-400 inline" />
                                    ) : (
                                      <input
                                        type="checkbox"
                                        checked={!isExcluded}
                                        onChange={() => {
                                          setRecapExcludedPowers(prev => {
                                            const next = new Set(prev)
                                            if (next.has(exclusionKey)) next.delete(exclusionKey)
                                            else next.add(exclusionKey)
                                            return next
                                          })
                                        }}
                                        className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                      />
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5 font-bold text-gray-900 dark:text-white">{power.power || '?'}</td>
                                  <td className="px-3 py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">
                                    {power.fields.subscription_price || '-'}
                                  </td>
                                  {groupFieldKeys.map(k => (
                                    <td key={k} className="px-2 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">
                                      {power.fields[k] || '-'}
                                    </td>
                                  ))}
                                  {hasDuplicates && (
                                    <td className="px-2 py-1.5 text-center">
                                      {isDup && <AlertCircle size={12} className="text-red-500 inline" />}
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
                {/* Warning si aucune modification significative */}
                {(() => {
                  const hasAnyContent =
                    offersArray.some(o => o.provider_id === filterProvider && isOfferModified(o)) ||
                    unchangedOfferIds.size > 0 ||
                    newPowersData.length > 0 ||
                    powersToRemove.length > 0 ||
                    providersToRemove.length > 0 ||
                    deprecatedOffers.length > 0 ||
                    newGroups.length > 0 ||
                    hasModifiedGroupNames
                  if (hasAnyContent) return null
                  return (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700 p-4 flex items-start gap-3">
                      <AlertCircle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          Aucune modification significative détectée
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          Les valeurs importées sont identiques aux tarifs actuels. Si vous avez utilisé le mode IA, vérifiez que les données de l'IA sont à jour.
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Champ lien + erreurs + boutons : uniquement si des modifications existent */}
              {totalModificationsCount > 0 && (
                <>
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
                </>
              )}
            </div>

            {/* Footer avec boutons */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
              {totalModificationsCount > 0 ? (
                <>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRecapModal(false)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    >
                      Retour
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
                  {isPrivilegedUser && (
                    <button
                      onClick={() => {
                        submitAllModifications(true)
                        setShowRecapModal(false)
                      }}
                      disabled={submittingOffers || hasDuplicatePowers || hasIncompletePowers || hasIncompleteGroups || hasGroupDuplicatePowers}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <Zap size={18} />
                      {submittingOffers ? 'Application en cours...' : 'Appliquer directement (sans validation)'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditedOffers({})
                      setPriceSheetUrl('')
                      setPowersToRemove([])
                      setNewPowersData([])
                      setProvidersToRemove([])
                      setNewGroups([])
                      setEditedOfferNames({})
                      setDeprecatedOffers([])
                      setUnchangedOfferIds(new Set())
                      setShowRecapModal(false)
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                  >
                    <X size={18} />
                    Tout annuler
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowRecapModal(false)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Fermer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation de suppression d'offres expirées */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Supprimer définitivement
              </h3>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Supprimer le groupe <strong>{getGroupNameWithoutPeriod(deleteConfirm.groupName)}</strong>{getGroupPeriodLabel(deleteConfirm.groupName) ? ` (${getGroupPeriodLabel(deleteConfirm.groupName)})` : ''} ?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {deleteConfirm.offers.length} offre{deleteConfirm.offers.length > 1 ? 's' : ''} ({deleteConfirm.offers.map(o => `${o.power_kva} kVA`).join(', ')}) seront supprimées de la base de données. Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const { groupName, offers } = deleteConfirm
                  setDeleteConfirm(null)
                  setDeletingGroups(prev => new Set(prev).add(groupName))
                  try {
                    for (const offer of offers) {
                      await energyApi.deleteOffer(offer.id)
                    }
                    toast.success(`${offers.length} offre${offers.length > 1 ? 's' : ''} supprimée${offers.length > 1 ? 's' : ''} (${getGroupNameWithoutPeriod(groupName)}${getGroupPeriodLabel(groupName) ? ` - ${getGroupPeriodLabel(groupName)}` : ''})`)
                    queryClient.invalidateQueries({ queryKey: ['energy-offers'] })
                  } catch {
                    toast.error('Erreur lors de la suppression')
                  } finally {
                    setDeletingGroups(prev => {
                      const next = new Set(prev)
                      next.delete(groupName)
                      return next
                    })
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors font-medium flex items-center gap-2 text-sm"
              >
                <Trash2 size={16} />
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation avant perte de modifications */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDialog(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4 text-orange-600 dark:text-orange-400">
                {confirmDialog.title}
              </h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line mb-6">
                {confirmDialog.message}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDialog.onSubmit}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg flex items-center gap-2"
                >
                  <Send size={16} />
                  Soumettre
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
                >
                  Continuer sans soumettre
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
