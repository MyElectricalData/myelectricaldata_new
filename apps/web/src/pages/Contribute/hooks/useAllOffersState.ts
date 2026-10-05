// Hook central : state, queries, computed values et helpers pour la page AllOffers
// Regroupe les ~38 useState, 3 useQuery, les useEffect et les useMemo du fichier monolithique

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { energyApi, type EnergyProvider, type EnergyOffer } from '@/api/energy'
import { pdlApi } from '@/api/pdl'
import { toast } from '@/stores/notificationStore'
import { usePermissions } from '@/hooks/usePermissions'
import type {
  EditedOffersMap,
  NewPowerData,
  NewGroup,
  PowerToRemove,
  DeprecatedOffer,
  AIImportResult,
  ConfirmDialogState,
  DeleteConfirmState,
  PriceFieldConfig,
} from '../types'
import {
  getFieldKeysForOfferType,
  getCleanOfferName,
  periodsOverlap,
  getGroupPeriodLabel,
  detectDynamicPriceFields,
} from '../utils/offerPricing'

// Ordre de tri des types d'offres (réutilisé depuis les types)
const typeOrder: string[] = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND']

function sortTypesByOrder(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const indexA = typeOrder.indexOf(a)
    const indexB = typeOrder.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })
}

export function useAllOffersState() {
  const queryClient = useQueryClient()
  const { isAdmin, isModerator } = usePermissions()
  const isPrivilegedUser = isAdmin() || isModerator()

  // --- State ---

  // Mode lecture/edition
  const [isEditMode, setIsEditMode] = useState(false)

  // Filtres
  const [filterProvider, setFilterProvider] = useState<string>('')
  const [filterOfferType, setFilterOfferType] = useState<string>('all')
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [showTypeInfoPopup, setShowTypeInfoPopup] = useState(false)
  const [typeInfoTarget, setTypeInfoTarget] = useState<string>('')

  // Edition inline des offres
  const [editedOffers, setEditedOffers] = useState<EditedOffersMap>({})
  const [priceSheetUrl, setPriceSheetUrl] = useState('')

  // Propositions d'ajout/suppression de puissances
  const [powersToRemove, setPowersToRemove] = useState<PowerToRemove[]>([])
  const [newPowersData, setNewPowersData] = useState<NewPowerData[]>([])

  // Formulaire nouveau fournisseur
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [newProviderName, setNewProviderName] = useState('')
  const [newProviderWebsite, setNewProviderWebsite] = useState('')
  const [creatingProvider, setCreatingProvider] = useState(false)

  // Fournisseurs marqués pour suppression
  const [providersToRemove, setProvidersToRemove] = useState<string[]>([])

  // Formulaire nouvelle offre

  // Edition des noms d'offres
  const [editedOfferNames, setEditedOfferNames] = useState<Record<string, string>>({})

  // Nouveaux groupes d'offres
  const [newGroups, setNewGroups] = useState<NewGroup[]>([])

  // Modal recapitulatif
  const [showRecapModal, setShowRecapModal] = useState(false)
  const [recapExcludedPowers, setRecapExcludedPowers] = useState<Set<string>>(new Set())

  // Section offres expirees
  const [showExpiredSection, setShowExpiredSection] = useState(false)
  const [reactivatingGroups, setReactivatingGroups] = useState<Set<string>>(new Set())
  const [deletingGroups, setDeletingGroups] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)

  // Dropdown de duplication
  const [duplicateDropdownId, setDuplicateDropdownId] = useState<string | null>(null)

  // Modale de confirmation
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  // Soumission
  const [submittingOffers, setSubmittingOffers] = useState(false)

  // Mode IA
  const [showAIMode, setShowAIMode] = useState(false)
  const [aiJsonInput, setAiJsonInput] = useState('')
  const [aiImportResult, setAiImportResult] = useState<AIImportResult | null>(null)
  const [unchangedOfferIds, setUnchangedOfferIds] = useState<Set<string>>(new Set())
  const [deprecatedOffers, setDeprecatedOffers] = useState<DeprecatedOffer[]>([])

  // Refs
  const skipFilterResetRef = useRef(false)
  const prevProviderRef = useRef(filterProvider)
  const pdlInitDoneRef = useRef(false)
  const targetOfferTypeRef = useRef<string | null>(null)
  const prevNewGroupsLengthRef = useRef(0)

  // --- Queries ---

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

  const { data: pdlsData, isFetched: pdlsFetched } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  // --- Computed values ---

  const offersArray = useMemo(() => {
    return Array.isArray(offersData) ? offersData : []
  }, [offersData])

  const activeOffersArray = useMemo(() => {
    return offersArray.filter(o => !o.valid_to && o.is_active !== false)
  }, [offersArray])

  const sortedProviders = useMemo(() => {
    if (!Array.isArray(providersData)) return []
    return [...providersData].sort((a, b) => {
      if (a.name.toUpperCase() === 'EDF') return -1
      if (b.name.toUpperCase() === 'EDF') return 1
      return a.name.localeCompare(b.name)
    })
  }, [providersData])

  const availableOfferTypes = useMemo(() => {
    if (!filterProvider || offersArray.length === 0) return []
    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    return sortTypesByOrder(types)
  }, [filterProvider, offersArray])

  // Types non intégrés au simulateur (actuellement vide)
  const unsupportedCreationTypes: string[] = []

  const unusedOfferTypes = useMemo(() => {
    const creatableTypes = typeOrder.filter(t => !unsupportedCreationTypes.includes(t))
    if (!filterProvider) return creatableTypes
    const usedTypes = new Set(offersArray.filter(o => o.provider_id === filterProvider).map(o => o.offer_type))
    return creatableTypes.filter(type => !usedTypes.has(type))
  }, [filterProvider, offersArray])

  // Offres filtrées par fournisseur et type (actives uniquement)
  const providerOffers = useMemo(() => {
    return offersArray
      .filter((offer) =>
        offer.provider_id === filterProvider && offer.is_active !== false && (filterOfferType === 'all' || offer.offer_type === filterOfferType)
      )
      .sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))
  }, [offersArray, filterProvider, filterOfferType])

  // Regroupement par nom + période de validité
  const groupedOffers = useMemo(() => {
    const groups: Record<string, EnergyOffer[]> = {}
    for (const offer of providerOffers) {
      const cleanName = getCleanOfferName(offer.name)
      const fromDate = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : ''
      const toDate = offer.valid_to ? new Date(offer.valid_to).toLocaleDateString('sv-SE') : ''
      const periodKey = fromDate
        ? (toDate ? `${fromDate}##${toDate}` : `${fromDate}##active`)
        : 'active'
      const groupKey = `${cleanName}##${periodKey}`
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push(offer)
    }
    for (const groupName of Object.keys(groups)) {
      groups[groupName].sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))
    }
    return groups
  }, [providerOffers])

  const groupNames = useMemo(() => {
    return Object.keys(groupedOffers).sort((a, b) => a.localeCompare(b))
  }, [groupedOffers])

  const activeGroupNames = useMemo(() => {
    return groupNames.filter(g => !groupedOffers[g]?.every(offer => offer.valid_to))
  }, [groupNames, groupedOffers])

  const expiredGroupNames = useMemo(() => {
    return groupNames.filter(g => groupedOffers[g]?.every(offer => offer.valid_to))
  }, [groupNames, groupedOffers])

  const visibleGroupNames = useMemo(() => activeGroupNames, [activeGroupNames])

  // Puissances existantes pour le fournisseur/type
  const existingPowers = useMemo(() => {
    return providerOffers
      .map(offer => ({
        power: offer.power_kva || 0,
        offer_type: offer.offer_type,
        offer_name: getCleanOfferName(offer.name),
        valid_from: offer.valid_from,
        valid_to: offer.valid_to,
      }))
      .filter(p => p.power > 0)
  }, [providerOffers])

  // Détection dynamique des champs de prix pour les types non standard
  const dynamicPriceFields = useMemo(() => {
    const standardTypes = ['BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL', 'BASE_WEEKEND', 'HC_WEEKEND', 'HC_NUIT_WEEKEND']
    if (standardTypes.includes(filterOfferType)) return []
    const offersOfType = offersArray.filter(o => o.offer_type === filterOfferType)
    if (offersOfType.length === 0) return [{ key: 'base_price', label: 'Prix' }] as PriceFieldConfig[]
    return detectDynamicPriceFields(offersOfType, filterOfferType)
  }, [filterOfferType, offersArray])

  // --- Helpers lies au state ---

  const isOfferModified = (offer: EnergyOffer): boolean => {
    const edited = editedOffers[offer.id]
    if (!edited) return false
    return Object.entries(edited).some(([key, value]) => {
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

  const hasModifiedGroupNames = Object.entries(editedOfferNames).some(
    ([renameKey, newName]) => {
      const originalName = renameKey.split('::')[0]
      return newName !== originalName && newName.trim() !== ''
    }
  )

  // Nombre total de modifications (pour le badge)
  const totalModificationsCount = useMemo(() => {
    const modifiedOffersCount = offersArray.filter(offer => isOfferModified(offer)).length
    const renamedGroupsCount = Object.entries(editedOfferNames).filter(
      ([renameKey, newName]) => {
        const originalName = renameKey.split('::')[0]
        return newName !== originalName && newName.trim() !== ''
      }
    ).length
    const deprecatedCount = deprecatedOffers.reduce((sum, d) => sum + d.offer_ids.length, 0)
    const provOffers = offersArray.filter(o => o.provider_id === filterProvider && o.is_active !== false)
    const newGroupsWithNewPowers = newGroups.filter(group => {
      if (group.alreadyInDb) return false
      const groupType = group.offer_type || filterOfferType
      return group.powers.some(p => {
        if (p.power <= 0) return true
        return !provOffers.some(o =>
          (o.power_kva || 0) === p.power && o.offer_type === groupType &&
          periodsOverlap(group.validFrom || undefined, group.validTo || undefined, o.valid_from, o.valid_to)
        )
      })
    }).length
    return modifiedOffersCount + newPowersData.length + powersToRemove.length + providersToRemove.length + newGroupsWithNewPowers + renamedGroupsCount + deprecatedCount
  }, [offersArray, editedOffers, editedOfferNames, newPowersData, powersToRemove, providersToRemove, newGroups, deprecatedOffers, filterOfferType, filterProvider])

  const hasAnyModifications = totalModificationsCount > 0

  // Confirmation avant action qui fait perdre les modifications
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
      },
    })
  }

  // Mise a jour d'un champ d'offre
  const updateField = (offerId: string, fieldKey: string, value: string) => {
    setEditedOffers(prev => ({
      ...prev,
      [offerId]: { ...prev[offerId], [fieldKey]: value },
    }))
  }

  // Duplication des tarifs vers la ligne suivante ou toutes les lignes
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

  // Verification de puissance doublon
  const isPowerAlreadyUsed = (
    power: number,
    currentIndex?: number,
    offerType?: string,
    offerName?: string,
    validFrom?: string,
    validTo?: string
  ): boolean => {
    const effectiveType = offerType || filterOfferType
    const existsInOffers = existingPowers.some(ep => {
      if (ep.power !== power || ep.offer_type !== effectiveType) return false
      if (powersToRemove.some(p => p.power === power && (!offerName || p.groupName === offerName))) return false
      // offerName peut etre la cle du groupe ("nom##periode") : comparer le seul nom
      if (offerName && ep.offer_name && getCleanOfferName(offerName) !== ep.offer_name) return false
      return periodsOverlap(validFrom, validTo, ep.valid_from, ep.valid_to)
    })
    if (existsInOffers) return true
    return newPowersData.some((p, i) => {
      if (i === currentIndex) return false
      if (p.power !== power) return false
      const pType = p.offer_type || filterOfferType
      if (pType !== effectiveType) return false
      if (offerName && p.offer_name && offerName !== p.offer_name) return false
      return periodsOverlap(validFrom, validTo, p.valid_from, p.valid_to)
    })
  }

  // Verification de completude des nouvelles puissances
  const getRequiredPriceFields = (offerType?: string): string[] => {
    const type = offerType || filterOfferType
    const fields = getFieldKeysForOfferType(type)
    if (fields.length > 0) return fields
    // Détection dynamique pour types non standard
    const offersOfType = offersArray.filter(o => o.offer_type === type)
    if (offersOfType.length === 0) return ['base_price']
    const knownPriceFields = [
      'base_price', 'hc_price', 'hp_price',
      'hc_price_winter', 'hp_price_winter', 'hc_price_summer', 'hp_price_summer',
      'peak_day_price', 'base_price_weekend',
      'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp',
      'ejp_normal', 'ejp_peak',
    ]
    const usedFields = new Set<string>()
    offersOfType.forEach(offer => {
      knownPriceFields.forEach(key => {
        const value = offer[key as keyof typeof offer]
        if (value !== undefined && value !== null) usedFields.add(key)
      })
    })
    return usedFields.size > 0 ? Array.from(usedFields) : ['base_price']
  }

  const isNewPowerComplete = (newPower: { power: number; fields: Record<string, string>; offer_type?: string }): boolean => {
    if (!newPower.power || newPower.power <= 0) return false
    if (!newPower.fields.subscription_price || newPower.fields.subscription_price === '') return false
    const requiredFields = getRequiredPriceFields(newPower.offer_type)
    return requiredFields.every(field => !!newPower.fields[field] && newPower.fields[field] !== '')
  }

  const hasDuplicatePowers = useMemo(() => {
    return newPowersData.some((newPower, index) =>
      !recapExcludedPowers.has(`newpower-${index}`) &&
      isPowerAlreadyUsed(newPower.power, index, newPower.offer_type, newPower.offer_name, newPower.valid_from, newPower.valid_to)
    )
  }, [newPowersData, existingPowers, powersToRemove, recapExcludedPowers])

  const hasIncompletePowers = useMemo(() => {
    return newPowersData.length > 0 && newPowersData.some(p => !isNewPowerComplete(p))
  }, [newPowersData, filterOfferType])

  const hasIncompleteGroups = useMemo(() => {
    if (newGroups.length === 0) return false
    return newGroups.some(group => {
      if (group.alreadyInDb) return false
      if (!group.name || group.name.trim() === '') return true
      return group.powers.some(p => !isNewPowerComplete({ ...p, offer_type: group.offer_type }))
    })
  }, [newGroups, filterOfferType])

  const hasGroupDuplicatePowers = useMemo(() => {
    return newGroups.some((group, groupIdx) => {
      if (group.alreadyInDb) return false
      const includedPowers = group.powers.filter((_, pi) => !recapExcludedPowers.has(`group-${groupIdx}-${pi}`))
      const powers = includedPowers.map(p => p.power).filter(p => p > 0)
      if (powers.length !== new Set(powers).size) return true
      const groupType = group.offer_type || filterOfferType
      return includedPowers.some(p => {
        if (!p.power || p.power <= 0) return false
        return existingPowers.some(ep =>
          ep.power === p.power && ep.offer_type === groupType &&
          periodsOverlap(group.validFrom || undefined, group.validTo || undefined, ep.valid_from, ep.valid_to)
        )
      })
    })
  }, [newGroups, existingPowers, filterOfferType, recapExcludedPowers])

  // Ouvrir le recap en auto-excluant les doublons
  const openRecapModal = () => {
    const initialExclusions = new Set<string>()
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

  // Copie JSON dans le presse-papier
  const copyJsonToClipboard = (data: unknown, successMessage: string) => {
    const json = JSON.stringify(data, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      toast.success(successMessage)
    }).catch(() => {
      toast.error('Impossible de copier dans le presse-papier')
    })
  }

  // Construction du JSON d'export pour un ensemble d'offres
  const buildOfferExportJson = (offers: EnergyOffer[], providerName: string) => {
    // Grouper par type + nom + periode (separer par valid_from pour ne pas fusionner des periodes differentes)
    const grouped: Record<string, EnergyOffer[]> = {}
    for (const offer of offers) {
      const groupName = offer.name.replace(/\s*-\s*\d+\s*kVA$/i, '').trim()
      let periodKey: string
      if (offer.valid_to) {
        periodKey = `${offer.valid_from || ''}|${offer.valid_to}`
      } else {
        periodKey = offer.valid_from || 'active'
      }
      const key = `${offer.offer_type}##${groupName}##${periodKey}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(offer)
    }
    const exportOffers: Record<string, unknown>[] = []
    for (const [key, grp] of Object.entries(grouped)) {
      const [offerType, groupName, periodKey] = key.split('##')
      const isDeprecated = periodKey.includes('|')
      const priceFields = getFieldKeysForOfferType(offerType)
      const byPower = new Map<number, EnergyOffer>()
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

  // Helper pour extraire le nom sans la période
  const getGroupNameWithoutPeriod = (groupKey: string): string => {
    return groupKey.split('##')[0]
  }

  // Helper pour extraire et formater la période

  // Reset complet après soumission réussie
  const resetAllModifications = () => {
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

  // --- Effects ---

  // Initialiser avec le fournisseur du 1er PDL, ou EDF par défaut
  useEffect(() => {
    if (sortedProviders.length === 0 || offersArray.length === 0 || filterProvider) return
    if (!pdlsFetched) return
    if (!pdlInitDoneRef.current) {
      pdlInitDoneRef.current = true
      const pdls = Array.isArray(pdlsData) ? pdlsData : (pdlsData as { data?: unknown[] })?.data || []
      const firstPdlWithOffer = (pdls as { selected_offer_id?: string }[]).find(p => p.selected_offer_id)
      if (firstPdlWithOffer?.selected_offer_id) {
        const offer = offersArray.find(o => o.id === firstPdlWithOffer.selected_offer_id)
        if (offer) {
          const provider = sortedProviders.find(p => p.id === offer.provider_id)
          if (provider) {
            targetOfferTypeRef.current = offer.offer_type
            setFilterProvider(provider.id)
            return
          }
        }
      }
    }
    const edf = sortedProviders.find(p => p.name.toUpperCase() === 'EDF')
    setFilterProvider(edf ? edf.id : sortedProviders[0].id)
  }, [sortedProviders, filterProvider, offersArray, pdlsData, pdlsFetched])

  // Reset filtre type + propositions quand on change de fournisseur
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
      return
    }
    if (!providerChanged && filterOfferType !== 'all') return
    const providerOffers = offersArray.filter(o => o.provider_id === filterProvider)
    const types = [...new Set(providerOffers.map(o => o.offer_type))]
    const sortedTypes = sortTypesByOrder(types)

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
    setPowersToRemove([])
    setNewPowersData([])
    setNewGroups([])
    setAiJsonInput('')
    setAiImportResult(null)
    setDeprecatedOffers([])
    setUnchangedOfferIds(new Set())
  }, [filterProvider, offersArray])

  // Reset propositions quand on change de type d'offre (sauf import IA)
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

  // Fermer dropdown duplication au clic extérieur
  useEffect(() => {
    if (!duplicateDropdownId) return
    const handleClick = () => setDuplicateDropdownId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [duplicateDropdownId])

  // Auto-focus et scroll vers le dernier nouveau groupe
  useEffect(() => {
    if (newGroups.length > prevNewGroupsLengthRef.current) {
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

  // Sélectionner le premier groupe visible
  useEffect(() => {
    if (visibleGroupNames.length > 0 && !visibleGroupNames.includes(selectedGroupName)) {
      setSelectedGroupName(visibleGroupNames[0])
    }
  }, [visibleGroupNames, selectedGroupName])

  // --- Return ---

  return {
    // Permissions
    isPrivilegedUser,
    isAdmin,
    isModerator,

    // Queries
    queryClient,
    offersArray,
    activeOffersArray,
    sortedProviders,

    // Filtres
    filterProvider, setFilterProvider,
    filterOfferType, setFilterOfferType,
    selectedGroupName, setSelectedGroupName,
    showTypeInfoPopup, setShowTypeInfoPopup,
    typeInfoTarget, setTypeInfoTarget,
    availableOfferTypes,
    unusedOfferTypes,

    // Mode
    isEditMode, setIsEditMode,

    // Edition
    editedOffers, setEditedOffers,
    priceSheetUrl, setPriceSheetUrl,
    editedOfferNames, setEditedOfferNames,

    // Puissances
    powersToRemove, setPowersToRemove,
    newPowersData, setNewPowersData,
    existingPowers,

    // Fournisseur
    isAddingProvider, setIsAddingProvider,
    newProviderName, setNewProviderName,
    newProviderWebsite, setNewProviderWebsite,
    creatingProvider, setCreatingProvider,
    providersToRemove, setProvidersToRemove,

    // Nouvelle offre

    // Groupes
    newGroups, setNewGroups,
    groupedOffers,
    groupNames,
    activeGroupNames,
    expiredGroupNames,
    visibleGroupNames,
    providerOffers,

    // Recap
    showRecapModal, setShowRecapModal,
    recapExcludedPowers, setRecapExcludedPowers,

    // Offres expirees
    showExpiredSection, setShowExpiredSection,
    reactivatingGroups, setReactivatingGroups,
    deletingGroups, setDeletingGroups,
    deleteConfirm, setDeleteConfirm,

    // Duplication
    duplicateDropdownId, setDuplicateDropdownId,

    // Confirmation
    confirmDialog, setConfirmDialog,

    // Soumission
    submittingOffers, setSubmittingOffers,

    // IA
    showAIMode, setShowAIMode,
    aiJsonInput, setAiJsonInput,
    aiImportResult, setAiImportResult,
    unchangedOfferIds, setUnchangedOfferIds,
    deprecatedOffers, setDeprecatedOffers,
    skipFilterResetRef,

    // Champs dynamiques
    dynamicPriceFields,

    // Computed
    hasModifiedGroupNames,
    totalModificationsCount,
    hasAnyModifications,
    hasDuplicatePowers,
    hasIncompletePowers,
    hasIncompleteGroups,
    hasGroupDuplicatePowers,

    // Helpers
    isOfferModified,
    confirmOrExecute,
    updateField,
    duplicateOfferFields,
    isPowerAlreadyUsed,
    getRequiredPriceFields,
    isNewPowerComplete,
    openRecapModal,
    copyJsonToClipboard,
    buildOfferExportJson,
    getGroupNameWithoutPeriod,
    getGroupPeriodLabel,
    resetAllModifications,
  }
}

export type AllOffersState = ReturnType<typeof useAllOffersState>
