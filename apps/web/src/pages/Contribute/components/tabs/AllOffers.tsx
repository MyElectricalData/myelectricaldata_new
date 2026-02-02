import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Send, X, Link, AlertCircle, Plus, Trash2, Undo2, Eye, Pencil, Info, Building2, ArrowDownToLine, Sparkles, Copy } from 'lucide-react'
import { energyApi, type EnergyProvider, type ContributionData, type EnergyOffer } from '@/api/energy'
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

  // State pour l'édition inline des offres
  const [editedOffers, setEditedOffers] = useState<Record<string, Record<string, string>>>({})
  const [submittingOffers, setSubmittingOffers] = useState(false)
  const [priceSheetUrl, setPriceSheetUrl] = useState('')

  // State pour les propositions d'ajout/suppression de puissances
  const [powersToRemove, setPowersToRemove] = useState<number[]>([])
  // Nouvelles puissances à ajouter avec leurs tarifs (liste)
  const [newPowersData, setNewPowersData] = useState<Array<{
    power: number
    fields: Record<string, string>
    // Champs optionnels pour l'import IA multi-types
    offer_type?: string
    offer_name?: string
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

  // Date de mise en service pour les formulaires d'ajout (nouveau fournisseur / nouvelle offre)
  const [newOfferValidFrom, setNewOfferValidFrom] = useState(() => new Date().toISOString().split('T')[0])

  // Édition des noms d'offres (clé = nom original clean, valeur = nouveau nom)
  const [editedOfferNames, setEditedOfferNames] = useState<Record<string, string>>({})

  // Nouveaux groupes d'offres à créer (nom du groupe + date de validité + puissances avec tarifs)
  const [newGroups, setNewGroups] = useState<Array<{
    name: string
    validFrom: string  // Date de mise en service (YYYY-MM-DD)
    powers: Array<{
      power: number
      fields: Record<string, string>
    }>
  }>>([])

  // Modal du récapitulatif
  const [showRecapModal, setShowRecapModal] = useState(false)

  // Afficher l'historique des tarifs
  const [showHistory, setShowHistory] = useState(false)

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
      warning?: string
    }>
  } | null>(null)
  // Offres signalées comme supprimées/deprecated par l'IA
  const [deprecatedOffers, setDeprecatedOffers] = useState<Array<{
    offer_type: string
    offer_name: string
    offer_ids: string[]
    warning: string
  }>>([])
  // Flag pour empêcher le reset de newPowersData lors d'un changement de filtre déclenché par l'import IA
  const skipFilterResetRef = useRef(false)

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

  // Fetch all offers (avec option historique)
  const { data: offersData } = useQuery({
    queryKey: ['energy-offers', showHistory],
    queryFn: async () => {
      const response = await energyApi.getOffers(undefined, showHistory)
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
      setDeprecatedOffers([])
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
    // Reset les propositions de puissances, le mode ajout d'offre et le mode IA
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
    setIsAddingOffer(false)
    setNewOfferType('')
    setShowAIMode(false)
    setAiJsonInput('')
    setAiImportResult(null)
    setDeprecatedOffers([])
  }, [filterProvider, offersArray])

  // Reset les propositions de puissances quand on change de type d'offre
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
  }, [filterOfferType])

  // Fermer le dropdown de duplication au clic exterieur
  useEffect(() => {
    if (!duplicateDropdownId) return
    const handleClick = () => setDuplicateDropdownId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [duplicateDropdownId])

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
    const deprecatedCount = deprecatedOffers.reduce((sum, d) => sum + d.offer_ids.length, 0)
    return modifiedOffersCount + newPowersData.length + powersToRemove.length + providersToRemove.length + newGroups.length + renamedGroupsCount + deprecatedCount
  }, [offersArray, editedOffers, editedOfferNames, newPowersData, powersToRemove, providersToRemove, newGroups, deprecatedOffers])

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
        setShowRecapModal(true)
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
      case 'HC_HP': case 'HC_NUIT_WEEKEND': case 'HC_WEEKEND': return ['hc_price', 'hp_price']
      case 'TEMPO': return ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp']
      case 'EJP': return ['ejp_normal', 'ejp_peak']
      case 'ZEN_FLEX': case 'SEASONAL': return ['hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter']
      case 'ZEN_WEEK_END': return ['base_price', 'base_price_weekend']
      case 'ZEN_WEEK_END_HP_HC': return ['hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend']
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

    // Construire la liste des offres actuelles du fournisseur
    const currentOffers = offersArray.filter(o => o.provider_id === filterProvider)
    let currentOffersSection = ''
    if (currentOffers.length > 0) {
      // Regrouper par offer_type + clean name
      const groups: Record<string, { type: string; name: string; powers: number[] }> = {}
      for (const offer of currentOffers) {
        const cleanName = getCleanOfferName(offer.name)
        const key = `${offer.offer_type}::${cleanName}`
        if (!groups[key]) {
          groups[key] = { type: offer.offer_type, name: cleanName, powers: [] }
        }
        const power = offer.power_kva || parseInt(offer.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
        if (power > 0) groups[key].powers.push(power)
      }
      const lines = Object.values(groups).map(g => {
        const sortedPowers = g.powers.sort((a, b) => a - b)
        return `- "${g.name}" (${g.type}) : puissances ${sortedPowers.join(', ')} kVA`
      })
      currentOffersSection = `

## Offres actuellement enregistrées pour "${providerName}"

${lines.join('\n')}

Compare avec les offres actuelles du fournisseur :
- Si une offre ci-dessus N'EXISTE PLUS chez le fournisseur, ajoute-la quand même dans le JSON avec un champ "deprecated": true et un "warning" expliquant qu'elle semble avoir été supprimée ou remplacée.
- Si une offre a été RENOMMÉE, utilise le nouveau nom et ajoute un "warning" mentionnant l'ancien nom.
- Si de NOUVELLES offres existent chez le fournisseur et ne figurent pas ci-dessus, ajoute-les normalement.`
    }

    return `Tu es un assistant spécialisé dans les tarifs d'électricité en France.

Je souhaite obtenir les grilles tarifaires actuelles du fournisseur "${providerName}".

Génère un JSON contenant TOUTES les offres disponibles de ce fournisseur.

## Format JSON requis

{
  "offers": [
    {
      "offer_name": "Nom de l'offre (sans puissance ni type)",
      "offer_type": "TYPE",
      "valid_from": "YYYY-MM-DD",
      "warning": "optionnel - si le type ne correspond pas exactement",
      "deprecated": false,
      "power_variants": [
        {
          "power_kva": 6,
          "subscription_price": 12.34,
          ... champs prix selon le type ...
        }
      ]
    }
  ]
}

## Types d'offres disponibles

Choisis le type le plus adapté pour chaque offre :

- BASE : tarif unique → champs : "base_price"
- HC_HP : heures creuses/pleines → champs : "hc_price", "hp_price"
- TEMPO : 6 tarifs bleu/blanc/rouge × HC/HP → champs : "tempo_blue_hc", "tempo_blue_hp", "tempo_white_hc", "tempo_white_hp", "tempo_red_hc", "tempo_red_hp"
- EJP : normal + pointe → champs : "ejp_normal", "ejp_peak"
- SEASONAL : été/hiver × HC/HP → champs : "hc_price_summer", "hp_price_summer", "hc_price_winter", "hp_price_winter"
- ZEN_FLEX : équivalent à SEASONAL
- ZEN_WEEK_END : base + week-end → champs : "base_price", "base_price_weekend"
- ZEN_WEEK_END_HP_HC : HC/HP semaine + HC/HP week-end → champs : "hc_price", "hp_price", "hc_price_weekend", "hp_price_weekend"
${currentOffersSection}

## Règles

- IMPORTANT : tous les prix doivent être en TTC (Toutes Taxes Comprises)
- Tous les prix en euros avec un point décimal (ex: 0.2516)
- subscription_price = abonnement mensuel TTC en €/mois
- Les prix kWh sont en €/kWh TTC
- Inclure toutes les puissances disponibles (typiquement : 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA)
- offer_name ne doit PAS contenir la puissance ni le type d'offre
- valid_from = date de début de validité de la grille tarifaire
- Si tu extrais les données d'un PDF : attention, les grilles tarifaires sont souvent présentées en colonnes (puissances en lignes, prix en colonnes). Veille à bien associer chaque prix à la bonne puissance et au bon champ.

## Source des données

Si l'utilisateur te fournit un document en pièce jointe :
- **Page HTML ou lien web** : source la plus fiable, privilégier ce format
- **Image (capture d'écran)** : bonne alternative, la lecture visuelle est généralement fiable
- **PDF** : attention, la structure interne des fichiers PDF rend la lecture difficile pour les IA (colonnes mélangées, tableaux mal interprétés). Si possible, demande à l'utilisateur une capture d'écran ou un lien HTML à la place.

Dans TOUS les cas, les tarifs proposés DOIVENT être vérifiés par l'utilisateur avant validation. Ajoute un "warning" si tu n'es pas certain d'un tarif.

## Warning

Si une offre du fournisseur ne correspond pas exactement à un type ci-dessus, choisis le type le plus proche ET ajoute un champ "warning" expliquant la différence. Par exemple :
- "warning": "Cette offre a des horaires HC spécifiques non standards"
- "warning": "Offre avec remise variable non modélisable dans les types standards"

## Sortie

Ne retourne QUE le JSON, sans texte avant ou après.`
  }

  // Importer un JSON multi-offres généré par une IA
  const importAIJson = () => {
    try {
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

      const knownTypes = ['BASE', 'BASE_WEEKEND', 'HC_HP', 'HC_NUIT_WEEKEND', 'HC_WEEKEND', 'TEMPO', 'EJP', 'ZEN_FLEX', 'SEASONAL', 'ZEN_WEEK_END', 'ZEN_WEEK_END_HP_HC']
      const details: Array<{
        offer_type: string
        offer_name: string
        matched: number
        added: number
        deprecated?: boolean
        warning?: string
      }> = []

      const updatedOffers = { ...editedOffers }
      const addedPowers: Array<{ power: number; fields: Record<string, string>; offer_type: string; offer_name: string }> = []
      const newDeprecated: typeof deprecatedOffers = []

      for (const offer of data.offers) {
        // Offre marquée comme supprimée par l'IA
        if (offer.deprecated === true) {
          // Trouver les offres existantes correspondantes pour les marquer
          const matchingOffers = offersArray.filter(o =>
            o.provider_id === filterProvider && o.offer_type === offer.offer_type
          )
          // Filtrer par nom si possible
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
        // Valider le type d'offre
        if (!offer.offer_type || !knownTypes.includes(offer.offer_type)) {
          details.push({
            offer_type: offer.offer_type || '???',
            offer_name: offer.offer_name || '???',
            matched: 0,
            added: 0,
            warning: `Type d'offre inconnu : "${offer.offer_type}". Types valides : ${knownTypes.join(', ')}`,
          })
          continue
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

        // Chercher les offres existantes du fournisseur pour ce type
        const existingForType = offersArray.filter(
          o => o.provider_id === filterProvider && o.offer_type === offer.offer_type
        )

        let matched = 0
        let added = 0
        const fieldKeys = getFieldKeysForOfferType(offer.offer_type)

        for (const variant of offer.power_variants) {
          if (!variant.power_kva || !variant.subscription_price) continue

          // Chercher une offre existante avec cette puissance
          const existing = existingForType.find(o => {
            const power = o.power_kva || parseInt(o.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
            return power === variant.power_kva
          })

          if (existing) {
            // Injecter dans editedOffers
            updatedOffers[existing.id] = { ...(updatedOffers[existing.id] || {}) }
            updatedOffers[existing.id].subscription_price = String(variant.subscription_price)
            for (const key of fieldKeys) {
              if (variant[key] !== undefined) {
                updatedOffers[existing.id][key] = String(variant[key])
              }
            }
            matched++
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
            })
            added++
          }
        }

        details.push({
          offer_type: offer.offer_type,
          offer_name: offer.offer_name || offer.offer_type,
          matched,
          added,
          warning: offer.warning,
        })
      }

      // Appliquer les modifications
      setEditedOffers(updatedOffers)
      if (addedPowers.length > 0) {
        setNewPowersData(prev => [...prev, ...addedPowers])
      }
      if (newDeprecated.length > 0) {
        setDeprecatedOffers(prev => [...prev, ...newDeprecated])
      }

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
      const totalDeprecated = details.filter(d => d.deprecated).length

      const parts = [`${totalMatched} mise(s) à jour`]
      if (totalAdded > 0) {
        parts.push(`${totalAdded} nouvelle(s) puissance(s)`)
      }
      if (totalDeprecated > 0) {
        parts.push(`${totalDeprecated} offre(s) à supprimer`)
      }

      setAiImportResult({
        success: true,
        message: `${details.length} offre(s) importée(s) : ${parts.join(', ')}.`,
        details,
      })

      toast.success(`Import IA réussi : ${parts.join(', ')}`)

      // Fermer le mode IA et ouvrir le récapitulatif de soumission
      setShowAIMode(false)
      setShowRecapModal(true)
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

  // Helper pour soumettre toutes les modifications en un seul lot (batch)
  // Envoie une seule notification Slack/email au lieu d'une par contribution
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
    const hasProviderModifications = modifiedOffers.length > 0 || newPowersData.length > 0 || powersToRemove.length > 0 || newGroups.length > 0 || hasModifiedGroupNames || deprecatedOffers.length > 0
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

    // Modifications de tarifs existants
    if (currentProvider) {
      for (const offer of modifiedOffers) {
        const edited = editedOffers[offer.id] || {}
        const powerMatch = offer.name.match(/(\d+)\s*kVA/i)
        const powerKva = powerMatch ? parseInt(powerMatch[1]) : offer.power_kva || 6

        allContributions.push({
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
        })
      }

      // Suppressions de puissances
      for (const power of powersToRemove) {
        allContributions.push({
          contribution_type: 'UPDATE_OFFER',
          existing_provider_id: currentProvider.id,
          provider_name: currentProvider.name,
          offer_name: `[SUPPRESSION] ${currentProvider.name} - ${filterOfferType} - ${power} kVA`,
          offer_type: filterOfferType,
          description: `Demande de suppression de la puissance ${power} kVA pour ${currentProvider.name} (${filterOfferType})`,
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

      // Ajout de nouvelles puissances
      for (const newPower of newPowersData) {
        const effectiveType = newPower.offer_type || filterOfferType
        const effectiveName = newPower.offer_name || existingBaseOfferName
        const pricingData: Record<string, number | undefined> = {}
        for (const [key, value] of Object.entries(newPower.fields)) {
          if (key !== 'subscription_price' && value) {
            pricingData[key] = parsePrice(value, undefined)
          }
        }
        pricingData.subscription_price = parsePrice(newPower.fields.subscription_price, undefined)
        allContributions.push({
          contribution_type: 'NEW_OFFER',
          existing_provider_id: currentProvider.id,
          provider_name: currentProvider.name,
          offer_name: `${effectiveName} - ${newPower.power} kVA`,
          offer_type: effectiveType,
          description: `Ajout de la puissance ${newPower.power} kVA pour ${currentProvider.name} (${effectiveType})`,
          power_kva: newPower.power,
          pricing_data: pricingData,
          price_sheet_url: priceSheetUrl,
          valid_from: new Date().toISOString().split('T')[0],
        })
      }

      // Nouveaux groupes d'offres
      for (const group of newGroups) {
        if (!group.name || group.powers.length === 0) continue
        for (const power of group.powers) {
          if (!power.power || power.power <= 0) continue
          allContributions.push({
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
            valid_from: group.validFrom || new Date().toISOString().split('T')[0],
          })
        }
      }

      // Renommages de groupes d'offres
      for (const [originalName, newName] of Object.entries(editedOfferNames)) {
        if (newName === originalName || newName.trim() === '') continue
        const offersInGroup = providerOffers.filter(o => getCleanOfferName(o.name) === originalName)
        for (const offer of offersInGroup) {
          const power = getPower(offer.name)
          const newOfferName = power ? `${newName} - ${power}` : newName
          allContributions.push({
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
      const response = await energyApi.submitContributionBatch(allContributions, priceSheetUrl)
      if (response.success) {
        const data = response.data as { created: number; errors: number; error_details?: string[] }
        const created = data.created || 0
        const errors = data.errors || 0
        if (created > 0) {
          toast.success(`${created} contribution(s) soumise(s) avec succès !`)
          setEditedOffers({})
          setEditedOfferNames({})
          setPriceSheetUrl('')
          setPowersToRemove([])
          setNewPowersData([])
          setNewGroups([])
          setProvidersToRemove([])
          setDeprecatedOffers([])
          queryClient.invalidateQueries({ queryKey: ['my-contributions'] })
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
      offer.provider_id === filterProvider && (filterOfferType === 'all' || offer.offer_type === filterOfferType)
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
      const power = powerMatch ? parseInt(powerMatch[1]) : (offer.power_kva || 0)
      return { power, offer_type: offer.offer_type }
    }).filter(p => p.power > 0)
  }, [providerOffers])

  // Vérifier si une puissance est déjà utilisée (existante ou dans les nouvelles puissances ajoutées)
  // Prend en compte le offer_type ET offer_name pour distinguer les puissances d'offres différentes
  const isPowerAlreadyUsed = (power: number, currentIndex?: number, offerType?: string, offerName?: string): boolean => {
    const effectiveType = offerType || filterOfferType
    // Vérifier dans les offres existantes (sauf celles marquées pour suppression)
    // En mode 'all', on compare aussi par nom d'offre pour éviter les faux doublons entre offres différentes
    const existsInOffers = existingPowers.some(ep =>
      ep.power === power && ep.offer_type === effectiveType && !powersToRemove.includes(power)
    )
    if (existsInOffers) return true
    // Vérifier dans les nouvelles puissances ajoutées (sauf l'index courant)
    // Même power + même offer_type + même offer_name = doublon
    return newPowersData.some((p, i) => {
      if (i === currentIndex) return false
      if (p.power !== power) return false
      const pType = p.offer_type || filterOfferType
      if (pType !== effectiveType) return false
      // Si les deux ont un offer_name, comparer aussi par nom
      if (offerName && p.offer_name && offerName !== p.offer_name) return false
      return true
    })
  }

  // Vérifier s'il y a des doublons dans les nouvelles puissances
  const hasDuplicatePowers = useMemo(() => {
    return newPowersData.some((newPower, index) => isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name))
  }, [newPowersData, existingPowers, powersToRemove])

  // Détecter les champs de prix requis pour le type d'offre actuel
  const getRequiredPriceFields = (offerType?: string): string[] => {
    const type = offerType || filterOfferType
    if (type === 'BASE') return ['base_price']
    if (type === 'HC_HP') return ['hc_price', 'hp_price']
    if (type === 'TEMPO') return ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp']
    if (type === 'EJP') return ['ejp_normal', 'ejp_peak']
    if (type === 'ZEN_FLEX' || type === 'SEASONAL') return ['hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter']
    if (type === 'ZEN_WEEK_END') return ['base_price', 'base_price_weekend']
    if (type === 'ZEN_WEEK_END_HP_HC' || type === 'HC_WEEKEND' || type === 'HC_NUIT_WEEKEND') return ['hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend']

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
        {/* Bouton Mode IA (visible en mode édition + fournisseur sélectionné) */}
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
        {/* Bouton mode lecture/édition */}
        <button
          onClick={() => {
            if (isEditMode) {
              confirmOrExecute(() => {
                // Quitter le mode édition : reset des modifications
                setEditedOffers({})
                setPriceSheetUrl('')
                setPowersToRemove([])
                setNewPowersData([])
                setIsEditMode(false)
              })
              return
            }
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
                      if (!isMarkedForRemoval && provider.id !== filterProvider) {
                        confirmOrExecute(() => setFilterProvider(provider.id))
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

          {/* Toggle historique des tarifs */}
          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(e) => setShowHistory(e.target.checked)}
                className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Afficher l'historique des tarifs
              </span>
            </label>
            {showHistory && (
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                Tarifs expirés inclus
              </span>
            )}
          </div>

          {/* Bouton/Champ ajouter un nouveau fournisseur (masqué en mode IA) */}
          {isEditMode && !isAddingProvider && !showAIMode && (
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
                  Conseils pour de meilleurs résultats
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 ml-5 list-disc">
                  <li>Privilégiez une <strong>page web</strong> ou une <strong>capture d'écran</strong> comme source</li>
                  <li>Les <strong>PDF</strong> sont difficiles à lire pour les IA (colonnes mélangées, tableaux mal interprétés)</li>
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
                  <p className="font-medium mb-1">{aiImportResult.success ? '✅' : '❌'} {aiImportResult.message}</p>
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

        {/* Type d'offre - Boutons dynamiques (masqué si ajout de fournisseur ou mode IA) */}
        {!isAddingProvider && !showAIMode && filterProvider && (
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
                            if (type === filterOfferType) return
                            confirmOrExecute(() => {
                              setFilterOfferType(type)
                              // En mode édition, si le type est vide, créer directement un nouveau groupe
                              if (isEditMode && isEmpty) {
                                if (newGroups.length === 0) {
                                  setNewGroups([{ name: '', validFrom: new Date().toISOString().split('T')[0], powers: [{ power: 0, fields: {} }] }])
                                }
                              }
                            })
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

      {/* Contenu masqué en mode IA */}
      {!showAIMode && (<>

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
                    setNewOfferValidFrom(new Date().toISOString().split('T')[0])
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
                      setNewOfferValidFrom(new Date().toISOString().split('T')[0])
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
                  onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], powers: [{ power: 0, fields: {} }] }])}
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
                  {/* Date de mise en service */}
                  <SingleDatePicker
                    value={group.validFrom}
                    onChange={(date) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validFrom: date } : g))}
                    minDate="2020-01-01"
                    required
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
                onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], powers: [{ power: 0, fields: {} }] }])}
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

            // Calculer la date de validité du groupe (la plus récente parmi les offres)
            const groupValidFrom = offersInGroup.reduce((latest, offer) => {
              if (!offer.valid_from) return latest
              if (!latest) return offer.valid_from
              return new Date(offer.valid_from) > new Date(latest) ? offer.valid_from : latest
            }, null as string | null)

            // Vérifier si le groupe contient des offres expirées
            const hasExpiredOffers = offersInGroup.some(offer => offer.valid_to)

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
                  {/* Spacer pour pousser la date à droite */}
                  <div className="flex-1" />
                  {/* Badge date de validité du groupe - Style proéminent */}
                  {groupValidFrom && (
                    <span
                      className={`text-sm font-medium px-3 py-1 rounded-lg ${
                        hasExpiredOffers
                          ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700'
                          : 'text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/40 border border-primary-300 dark:border-primary-700'
                      }`}
                      title={`Tarif en vigueur depuis le ${new Date(groupValidFrom).toLocaleDateString('fr-FR')}`}
                    >
                      {hasExpiredOffers ? 'Expiré le ' : 'Depuis le '}
                      {new Date(groupValidFrom).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                  )}
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

                            {/* Col Actions - uniquement en mode édition (première ligne) */}
                            {isEditMode && powerNum !== null && (
                              <div className="flex items-center gap-0.5 justify-center">
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
            const isDuplicate = isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name)
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

                {/* Tarifs selon le type d'offre (effectiveType = offer_type IA ou filterOfferType) */}
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

                  {(effectiveType === 'ZEN_WEEK_END' || effectiveType === 'ZEN_WEEK_END_HP_HC' || effectiveType === 'ZEN_FLEX' || effectiveType === 'SEASONAL' || effectiveType === 'EJP') && (
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
                {/* Date de mise en service */}
                <SingleDatePicker
                  value={group.validFrom}
                  onChange={(date) => setNewGroups(prev => prev.map((g, i) => i === groupIndex ? { ...g, validFrom: date } : g))}
                  minDate="2020-01-01"
                  required
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
              onClick={() => setNewGroups(prev => [...prev, { name: '', validFrom: new Date().toISOString().split('T')[0], powers: [{ power: 0, fields: {} }] }])}
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

      </>)}

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
                {/* Modifications de tarifs — regroupées par offre */}
                {(() => {
                  // Toutes les offres modifiées du fournisseur (tous types confondus)
                  const allModifiedOffers = offersArray
                    .filter(o => o.provider_id === filterProvider && isOfferModified(o))
                    .sort((a, b) => {
                      const powerA = a.power_kva || parseInt(a.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
                      const powerB = b.power_kva || parseInt(b.name.match(/(\d+)\s*kVA/i)?.[1] || '0')
                      return powerA - powerB
                    })
                  // Regrouper par clean name
                  const groups: Record<string, typeof allModifiedOffers> = {}
                  for (const offer of allModifiedOffers) {
                    const edited = editedOffers[offer.id] || {}
                    const hasRealChanges = Object.entries(edited).some(([key, value]) => {
                      const orig = Number((offer as unknown as Record<string, unknown>)[key])
                      const next = Number(value)
                      if (isNaN(orig) && isNaN(next)) return false
                      if (isNaN(orig) || isNaN(next)) return true
                      return Math.abs(orig - next) > 0.00001
                    })
                    if (!hasRealChanges) continue
                    const cleanName = getCleanOfferName(offer.name)
                    if (!groups[cleanName]) groups[cleanName] = []
                    groups[cleanName].push(offer)
                  }
                  return Object.entries(groups).map(([groupName, offers]) => (
                    <div key={groupName} className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 font-semibold text-sm text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700">
                        {groupName}
                      </div>
                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {offers.map(offer => {
                          const edited = editedOffers[offer.id] || {}
                          const changes = Object.entries(edited).filter(([key, value]) => {
                            const orig = Number((offer as unknown as Record<string, unknown>)[key])
                            const next = Number(value)
                            if (isNaN(orig) && isNaN(next)) return false
                            if (isNaN(orig) || isNaN(next)) return true
                            return Math.abs(orig - next) > 0.00001
                          })
                          const power = getPower(offer.name)
                          return (
                            <div key={offer.id} className="px-4 py-2">
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{power || offer.name}</div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                {changes.map(([key, value]) => {
                                  const orig = Number((offer as unknown as Record<string, unknown>)[key])
                                  const next = Number(value)
                                  const isSub = key === 'subscription_price'
                                  return (
                                    <span key={key} className="text-xs flex items-center gap-1">
                                      <span className="text-gray-500 dark:text-gray-400">{fieldLabels[key] || key}</span>
                                      <span className="text-red-500 line-through font-mono">{isNaN(orig) ? '-' : orig.toFixed(isSub ? 2 : 4)}</span>
                                      <span className="text-gray-400">→</span>
                                      <span className="text-green-600 dark:text-green-400 font-semibold font-mono">{isNaN(next) ? '-' : next.toFixed(isSub ? 2 : 4)}</span>
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
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

                {/* Modifications de puissances */}
                {(newPowersData.length > 0 || powersToRemove.length > 0) && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 font-semibold text-sm text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700">
                      Puissances
                      {sortedProviders.find(p => p.id === filterProvider) && (
                        <span className="text-xs font-normal text-gray-500 ml-2">
                          {sortedProviders.find(p => p.id === filterProvider)?.name} — {filterOfferType}
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {powersToRemove.sort((a, b) => a - b).map(power => (
                        <div key={`remove-${power}`} className="px-4 py-2 flex items-center justify-between text-red-600 dark:text-red-400">
                          <span className="text-xs flex items-center gap-1"><Trash2 size={12} /> Supprimer</span>
                          <span className="text-xs font-semibold">{power} kVA</span>
                        </div>
                      ))}
                      {newPowersData.map((newPower, index) => (
                        <div key={`add-${index}`} className="px-4 py-2">
                          <div className="flex items-center justify-between text-green-600 dark:text-green-400">
                            <span className="text-xs flex items-center gap-1">
                              <Plus size={12} /> Ajouter
                              {newPower.offer_type && (
                                <span className="text-purple-500 dark:text-purple-400 ml-1">({newPower.offer_type})</span>
                              )}
                            </span>
                            <span className="text-xs font-semibold">{newPower.power} kVA</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {newPower.fields.subscription_price && (
                              <span className="text-xs text-gray-500">Abo: {newPower.fields.subscription_price} €/mois</span>
                            )}
                            {Object.entries(newPower.fields)
                              .filter(([k]) => k !== 'subscription_price' && newPower.fields[k as keyof typeof newPower.fields])
                              .map(([k, v]) => (
                                <span key={k} className="text-xs text-gray-500">{fieldLabels[k] || k}: {v} €/kWh</span>
                              ))}
                          </div>
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
                        .filter(([originalName, newName]) => newName !== originalName && newName.trim() !== '')
                        .map(([originalName, newName]) => (
                          <div key={`rename-${originalName}`} className="px-4 py-2 flex items-center gap-2 text-xs">
                            <span className="text-red-500 line-through">{originalName}</span>
                            <span className="text-gray-400">→</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">{newName}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Nouveaux groupes d'offres */}
                {newGroups.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-100 dark:bg-blue-900/40 font-semibold text-sm text-blue-800 dark:text-blue-300 border-b border-blue-200 dark:border-blue-700 flex items-center gap-2">
                      <Package size={14} />
                      Nouveaux groupes ({newGroups.length})
                    </div>
                    <div className="divide-y divide-blue-200 dark:divide-blue-700">
                      {newGroups.map((group, index) => (
                        <div key={`recap-group-${index}`} className="px-4 py-2">
                          <div className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                            {group.name || <span className="italic text-gray-400">Nom non défini</span>}
                          </div>
                          {group.powers.map((power, powerIndex) => (
                            <div key={`recap-group-${index}-power-${powerIndex}`} className="text-xs text-blue-600 dark:text-blue-400 flex flex-wrap gap-x-3">
                              <span className="font-medium">{power.power || '?'} kVA</span>
                              {power.fields.subscription_price && <span>Abo: {power.fields.subscription_price} €/mois</span>}
                              {power.fields.base_price && <span>Base: {power.fields.base_price}</span>}
                              {power.fields.hc_price && <span>HC: {power.fields.hc_price}</span>}
                              {power.fields.hp_price && <span>HP: {power.fields.hp_price}</span>}
                            </div>
                          ))}
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
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
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
                  setShowRecapModal(false)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
              >
                <X size={18} />
                Tout annuler
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
