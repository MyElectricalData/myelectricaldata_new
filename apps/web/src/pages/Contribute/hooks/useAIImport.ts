// Hook pour l'import JSON IA : validation, matching, deduplication
// Extrait de AllOffers.tsx lignes 825-1429

import type { EnergyOffer } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import { getFieldKeysForOfferType, getCleanOfferName } from '../utils/offerPricing'
import type { AllOffersState } from './useAllOffersState'

// Types supportés par le simulateur et le backend
const SUPPORTED_TYPES = ['BASE', 'BASE_WEEKEND', 'HC_HP', 'HC_NUIT_WEEKEND', 'HC_WEEKEND', 'TEMPO', 'EJP', 'SEASONAL']

// Types non intégrés au simulateur mais acceptés dans le JSON avec conversion automatique
const UNSUPPORTED_TYPE_CONVERSIONS: Record<string, string> = {
  'ZEN_WEEK_END': 'BASE_WEEKEND',
  'ZEN_WEEK_END_HP_HC': 'HC_WEEKEND',
  'ZEN_FLEX': 'SEASONAL',
}

// Mapping des types synonymes entre IA et base
const TYPE_SYNONYMS: Record<string, string[]> = {
  'ZEN_WEEK_END': ['BASE_WEEKEND'],
  'BASE_WEEKEND': ['ZEN_WEEK_END'],
  'ZEN_WEEK_END_HP_HC': ['HC_WEEKEND', 'HC_NUIT_WEEKEND'],
  'HC_WEEKEND': ['ZEN_WEEK_END_HP_HC'],
  'HC_NUIT_WEEKEND': ['ZEN_WEEK_END_HP_HC'],
  'ZEN_FLEX': ['SEASONAL'],
  'SEASONAL': ['ZEN_FLEX'],
}

const KNOWN_TYPES = [...SUPPORTED_TYPES, ...Object.keys(UNSUPPORTED_TYPE_CONVERSIONS)]

// Clés valides dans le JSON
const VALID_OFFER_KEYS = ['offer_name', 'offer_type', 'valid_from', 'valid_until', 'special_conditions', 'warning', 'deprecated', 'power_variants']
const ALL_VALID_VARIANT_KEYS = ['power_kva', 'subscription_price', 'base_price', 'base_price_weekend', 'hc_price', 'hp_price', 'hc_price_weekend', 'hp_price_weekend', 'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter', 'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp', 'ejp_normal', 'ejp_peak']
const VALID_ROOT_KEYS = ['provider_name', 'data_source', 'extraction_date', 'offers']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AIJsonOffer = any

export function useAIImport(state: AllOffersState) {
  const {
    offersArray,
    sortedProviders,
    filterProvider,
    filterOfferType,
    editedOffers,
    showAIMode, setShowAIMode,
    aiJsonInput, setAiJsonInput,
    aiImportResult, setAiImportResult,
    setEditedOffers,
    setUnchangedOfferIds,
    setNewPowersData,
    setNewGroups,
    setDeprecatedOffers,
    skipFilterResetRef,
    setFilterOfferType,
    openRecapModal,
  } = state

  // Cherche les offres actives du fournisseur par type, avec fallback synonymes
  const findOffersByType = (
    offerType: string,
    allOffers: EnergyOffer[]
  ): { offers: EnergyOffer[]; resolvedType: string } => {
    const direct = allOffers.filter(o => o.provider_id === filterProvider && o.offer_type === offerType && o.is_active !== false)
    if (direct.length > 0) return { offers: direct, resolvedType: offerType }
    for (const synonym of (TYPE_SYNONYMS[offerType] || [])) {
      const synOffers = allOffers.filter(o => o.provider_id === filterProvider && o.offer_type === synonym && o.is_active !== false)
      if (synOffers.length > 0) return { offers: synOffers, resolvedType: synonym }
    }
    return { offers: [], resolvedType: offerType }
  }

  // Déduplication des offres du JSON (individuelles vs groupées)
  const deduplicateOffers = (offers: AIJsonOffer[]): AIJsonOffer[] => {
    const groups = new Map<string, AIJsonOffer[]>()
    for (const offer of offers) {
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
    const result: AIJsonOffer[] = []
    for (const [, offersInGroup] of groups) {
      if (offersInGroup.length === 1) {
        result.push(offersInGroup[0])
        continue
      }
      const multiVariant = offersInGroup.filter((o: AIJsonOffer) => (o.power_variants?.length || 0) > 1)
      const singleVariant = offersInGroup.filter((o: AIJsonOffer) => (o.power_variants?.length || 0) <= 1)
      result.push(...multiVariant)
      const coveredPowers = new Set<number>()
      for (const mv of multiVariant) {
        for (const v of (mv.power_variants || [])) {
          if (v.power_kva) coveredPowers.add(v.power_kva)
        }
      }
      for (const sv of singleVariant) {
        const power = sv.power_variants?.[0]?.power_kva
        if (!power || !coveredPowers.has(power)) result.push(sv)
      }
    }
    return result
  }

  // Validation complète du JSON importé
  const validateJsonStructure = (data: Record<string, unknown>): string[] => {
    const errors: string[] = []
    const currentProvider = sortedProviders.find(p => p.id === filterProvider)
    const expectedProviderName = currentProvider?.name || ''

    if (!data.provider_name) {
      errors.push(`Champ "provider_name" manquant. Attendu : "${expectedProviderName}"`)
    } else {
      const jsonProvider = String(data.provider_name).trim().toLowerCase()
      const expected = expectedProviderName.trim().toLowerCase()
      if (jsonProvider !== expected) {
        errors.push(`Fournisseur "${data.provider_name}" ≠ fournisseur sélectionné "${expectedProviderName}"`)
      }
    }

    const unknownRootKeys = Object.keys(data).filter(k => !VALID_ROOT_KEYS.includes(k))
    if (unknownRootKeys.length > 0) {
      errors.push(`Clé(s) inconnue(s) à la racine : ${unknownRootKeys.join(', ')}`)
    }

    const offers = data.offers as AIJsonOffer[]
    for (let i = 0; i < offers.length; i++) {
      const offer = offers[i]
      const offerLabel = `Offre #${i + 1}${offer?.offer_name ? ` (${offer.offer_name})` : ''}`
      if (typeof offer !== 'object' || offer === null) {
        errors.push(`${offerLabel} : n'est pas un objet valide`)
        continue
      }
      if (!offer.offer_name || typeof offer.offer_name !== 'string') {
        errors.push(`${offerLabel} : "offer_name" manquant`)
      }
      if (!offer.offer_type || typeof offer.offer_type !== 'string') {
        errors.push(`${offerLabel} : "offer_type" manquant`)
      }
      if (offer.deprecated !== true && (!offer.power_variants || !Array.isArray(offer.power_variants))) {
        errors.push(`${offerLabel} : "power_variants" manquant ou invalide`)
      }
      const unknownOfferKeys = Object.keys(offer).filter(k => !VALID_OFFER_KEYS.includes(k))
      if (unknownOfferKeys.length > 0) {
        errors.push(`${offerLabel} : clé(s) inconnue(s) : ${unknownOfferKeys.join(', ')}`)
      }
      if (offer.power_variants && Array.isArray(offer.power_variants)) {
        for (let j = 0; j < offer.power_variants.length; j++) {
          const v = offer.power_variants[j]
          const variantLabel = `${offerLabel}, variante #${j + 1}`
          if (!v.power_kva || typeof v.power_kva !== 'number') {
            errors.push(`${variantLabel} : "power_kva" manquant ou invalide`)
          }
          if (v.subscription_price === undefined || typeof v.subscription_price !== 'number') {
            errors.push(`${variantLabel} : "subscription_price" manquant ou invalide`)
          }
          const unknownKeys = Object.keys(v).filter(k => !ALL_VALID_VARIANT_KEYS.includes(k))
          if (unknownKeys.length > 0) {
            errors.push(`${variantLabel} : clé(s) inconnue(s) : ${unknownKeys.join(', ')}`)
          }
        }
      }
    }
    return errors
  }

  // Traitement d'une offre deprecated sans données de prix
  const processDeprecatedWithoutPrices = (
    offer: AIJsonOffer,
    allOffers: EnergyOffer[],
    newDeprecated: typeof state.deprecatedOffers extends (infer T)[] ? T[] : never,
    details: Array<{ offer_type: string; offer_name: string; matched: number; added: number; unchanged?: number; deprecated?: boolean; warning?: string }>
  ) => {
    const matchingOffers = allOffers.filter(o =>
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
  }

  // Import principal
  const importAIJson = async () => {
    try {
      // Utiliser les offres du state (même source que l'export, pas de désynchronisation)
      const currentOffers = offersArray

      // Nettoyer le JSON
      let cleaned = aiJsonInput.trim()
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) cleaned = codeBlockMatch[1].trim()
      const data = JSON.parse(cleaned)

      // Valider la structure de base
      if (!data.offers || !Array.isArray(data.offers) || data.offers.length === 0) {
        setAiImportResult({ success: false, message: 'Le JSON doit contenir un tableau "offers" non vide.' })
        return
      }

      // Validation complète
      const validationErrors = validateJsonStructure(data)
      if (validationErrors.length > 0) {
        setAiImportResult({
          success: false,
          message: `Validation échouée (${validationErrors.length} erreur${validationErrors.length > 1 ? 's' : ''}) :\n${validationErrors.slice(0, 15).join('\n')}${validationErrors.length > 15 ? `\n... et ${validationErrors.length - 15} autre(s)` : ''}`,
        })
        return
      }

      const details: Array<{ offer_type: string; offer_name: string; matched: number; added: number; unchanged?: number; deprecated?: boolean; warning?: string }> = []
      const updatedOffers = { ...editedOffers }
      const addedPowers: Array<{ power: number; fields: Record<string, string>; offer_type: string; offer_name: string; valid_from?: string; valid_to?: string }> = []
      const newDeprecated: Array<{ offer_type: string; offer_name: string; offer_ids: string[]; warning: string }> = []
      const historicalGroups: Array<{ name: string; validFrom: string; validTo: string; offer_type: string; alreadyInDb?: boolean; powers: Array<{ power: number; fields: Record<string, string> }> }> = []
      const unchangedIds = new Set<string>()

      // Déduplication des offres du JSON
      const deduplicatedOffers = deduplicateOffers(data.offers)

      for (const offer of deduplicatedOffers) {
        let isHistoricalImport = false

        // Offre deprecated
        if (offer.deprecated === true) {
          if (offer.power_variants && Array.isArray(offer.power_variants) && offer.power_variants.length > 0) {
            isHistoricalImport = true
          } else {
            processDeprecatedWithoutPrices(offer, currentOffers, newDeprecated, details)
            continue
          }
        }

        // Valider le type
        if (!offer.offer_type || !KNOWN_TYPES.includes(offer.offer_type)) {
          details.push({
            offer_type: offer.offer_type || '???',
            offer_name: offer.offer_name || '???',
            matched: 0, added: 0,
            warning: `Type d'offre inconnu : "${offer.offer_type}". Types valides : ${SUPPORTED_TYPES.join(', ')}`,
          })
          continue
        }

        // Conversion des types non standard
        const convertedType = UNSUPPORTED_TYPE_CONVERSIONS[offer.offer_type]
        if (convertedType) offer.offer_type = convertedType

        // Valider les variantes
        if (!offer.power_variants || !Array.isArray(offer.power_variants) || offer.power_variants.length === 0) {
          details.push({ offer_type: offer.offer_type, offer_name: offer.offer_name || '???', matched: 0, added: 0, warning: 'Aucune variante de puissance fournie.' })
          continue
        }

        // Dédupliquer les variantes par puissance
        const variantsByPower = new Map<number, typeof offer.power_variants[0]>()
        for (const variant of offer.power_variants) {
          if (!variant.power_kva) continue
          const existing = variantsByPower.get(variant.power_kva)
          if (!existing || (variant.subscription_price || 0) > (existing.subscription_price || 0)) {
            variantsByPower.set(variant.power_kva, variant)
          }
        }
        offer.power_variants = Array.from(variantsByPower.values())

        // Chercher les offres existantes pour ce type
        const { offers: existingForType } = findOffersByType(offer.offer_type, currentOffers)

        // Affiner par nom de groupe
        let existingFiltered = existingForType
        if (isHistoricalImport) {
          existingFiltered = []
        } else if (offer.offer_name && existingForType.length > 0) {
          const cleanJson = getCleanOfferName(offer.offer_name).toLowerCase()
          const nameMatch = existingForType.filter(o => {
            const cleanDb = getCleanOfferName(o.name).toLowerCase()
            return cleanDb === cleanJson || cleanDb.includes(cleanJson) || cleanJson.includes(cleanDb)
          })
          existingFiltered = nameMatch.length > 0 ? nameMatch : []

          // Filtrer par periode pour matcher la bonne offre
          if (existingFiltered.length > 0 && !offer.valid_until) {
            if (offer.valid_from) {
              // Import avec valid_from : chercher les offres avec le meme valid_from
              const importDate = new Date(offer.valid_from).toLocaleDateString('sv-SE')
              const periodMatch = existingFiltered.filter(o => {
                if (o.valid_to) return false
                const existDate = o.valid_from ? new Date(o.valid_from).toLocaleDateString('sv-SE') : ''
                return existDate === importDate
              })
              if (periodMatch.length > 0) {
                existingFiltered = periodMatch
              } else {
                // Nouvelle periode : traiter comme ajout
                existingFiltered = []
              }
            } else {
              // Import sans valid_from : preferer les offres sans valid_from
              const noFromMatch = existingFiltered.filter(o => !o.valid_from && !o.valid_to)
              if (noFromMatch.length > 0) existingFiltered = noFromMatch
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
            if (missingFields.length > 0) warnings.push(`Champs manquants pour ${offer.offer_type} : ${missingFields.join(', ')}`)
            if (unexpectedFields.length > 0) warnings.push(`Champs inattendus pour ${offer.offer_type} : ${unexpectedFields.join(', ')} (attendus : ${fieldKeys.join(', ')})`)
            details.push({ offer_type: offer.offer_type, offer_name: offer.offer_name || offer.offer_type, matched: 0, added: 0, warning: warnings.join('. ') })
            continue
          }
        }

        // Import historique : vérifier si l'offre existe déjà en BDD
        if (isHistoricalImport) {
          const allExistingForType = currentOffers.filter(o =>
            o.provider_id === filterProvider && o.offer_type === offer.offer_type
          )
          const cleanJson = getCleanOfferName(offer.offer_name || '').toLowerCase()
          const matchingExisting = cleanJson
            ? allExistingForType.filter(o => {
              const cleanDb = getCleanOfferName(o.name).toLowerCase()
              return cleanDb === cleanJson || cleanDb.includes(cleanJson) || cleanJson.includes(cleanDb)
            })
            : allExistingForType

          const importDate = offer.valid_from ? new Date(offer.valid_from).toLocaleDateString('sv-SE') : ''
          const importDateTo = offer.valid_until ? new Date(offer.valid_until).toLocaleDateString('sv-SE') : ''
          let allUnchanged = true

          for (const variant of offer.power_variants) {
            if (!variant.power_kva || !variant.subscription_price) continue
            const existingMatch = matchingExisting.find(o => {
              if ((o.power_kva || 0) !== variant.power_kva) return false
              const existDate = o.valid_from ? new Date(o.valid_from).toLocaleDateString('sv-SE') : ''
              const existDateTo = o.valid_to ? new Date(o.valid_to).toLocaleDateString('sv-SE') : ''
              return existDate === importDate && existDateTo === importDateTo
            })
            if (!existingMatch) { allUnchanged = false; break }
            const allFieldsToCheck = ['subscription_price', ...fieldKeys]
            for (const key of allFieldsToCheck) {
              const origVal = Number((existingMatch as unknown as Record<string, unknown>)[key])
              const newVal = key === 'subscription_price' ? Number(variant.subscription_price) : Number(variant[key])
              if (!isNaN(origVal) && !isNaN(newVal) && Math.abs(origVal - newVal) > 0.00001) {
                allUnchanged = false; break
              }
            }
            if (!allUnchanged) break
          }

          if (allUnchanged) {
            const groupPowers: Array<{ power: number; fields: Record<string, string> }> = []
            for (const variant of offer.power_variants) {
              if (!variant.power_kva || !variant.subscription_price) continue
              const fields: Record<string, string> = { subscription_price: String(variant.subscription_price) }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) fields[key] = String(variant[key])
              }
              groupPowers.push({ power: variant.power_kva, fields })
              unchanged++
            }
            if (groupPowers.length > 0) {
              historicalGroups.push({
                name: offer.offer_name || offer.offer_type,
                validFrom: offer.valid_from || '',
                validTo: offer.valid_until || '',
                offer_type: offer.offer_type,
                alreadyInDb: true,
                powers: groupPowers,
              })
            }
          } else {
            const groupPowers: Array<{ power: number; fields: Record<string, string> }> = []
            for (const variant of offer.power_variants) {
              if (!variant.power_kva || !variant.subscription_price) continue
              const fields: Record<string, string> = { subscription_price: String(variant.subscription_price) }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) fields[key] = String(variant[key])
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
          // Traitement normal : matching ou ajout
          for (const variant of offer.power_variants) {
            if (!variant.power_kva || !variant.subscription_price) continue
            const candidatesByPower = existingFiltered.filter(o => (o.power_kva || 0) === variant.power_kva)
            // Meme critere que l'export : subscription_price DESC, ID DESC
            // Parmi les actives, trier par subscription_price DESC (meme critere que l'export)
            const activeCandidates = candidatesByPower
              .filter(o => !o.valid_to)
              .sort((a, b) => (b.subscription_price || 0) - (a.subscription_price || 0))
            let existing = activeCandidates[0]
            // Dernier recours : offre la plus recente meme expiree
            if (!existing && candidatesByPower.length > 0) {
              existing = [...candidatesByPower].sort((a, b) =>
                (b.subscription_price || 0) - (a.subscription_price || 0)
              )[0]
            }

            if (existing) {
              const allFieldsToCheck = ['subscription_price', ...fieldKeys]
              let hasRealChange = false
              for (const key of allFieldsToCheck) {
                const origVal = Number((existing as unknown as Record<string, unknown>)[key])
                const newVal = key === 'subscription_price' ? Number(variant.subscription_price) : Number(variant[key])
                if (!isNaN(origVal) && !isNaN(newVal) && Math.abs(origVal - newVal) > 0.00001) { hasRealChange = true; break }
                if (isNaN(origVal) !== isNaN(newVal)) { hasRealChange = true; break }
              }
              if (offer.valid_from) {
                const existingValidFrom = (existing as unknown as Record<string, unknown>).valid_from
                if (existingValidFrom) {
                  const importDateStr = new Date(offer.valid_from).toLocaleDateString('sv-SE')
                  const existingDate = new Date(String(existingValidFrom)).toLocaleDateString('sv-SE')
                  if (importDateStr !== existingDate) hasRealChange = true
                }
              }
              if (hasRealChange) {
                updatedOffers[existing.id] = { ...(updatedOffers[existing.id] || {}) }
                updatedOffers[existing.id].subscription_price = String(variant.subscription_price)
                for (const key of fieldKeys) {
                  if (variant[key] !== undefined) updatedOffers[existing.id][key] = String(variant[key])
                }
                if (offer.valid_from) updatedOffers[existing.id].valid_from = offer.valid_from
                matched++
              } else {
                unchangedIds.add(existing.id)
                unchanged++
              }
            } else {
              const fields: Record<string, string> = { subscription_price: String(variant.subscription_price) }
              for (const key of fieldKeys) {
                if (variant[key] !== undefined) fields[key] = String(variant[key])
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
          matched, added, unchanged,
          deprecated: isHistoricalImport || undefined,
          warning: offer.warning,
        })
      }

      // Appliquer les modifications
      setEditedOffers(updatedOffers)
      setUnchangedOfferIds(unchangedIds)
      setNewPowersData(addedPowers)
      setNewGroups(historicalGroups)
      setDeprecatedOffers(newDeprecated)

      // Si multi-types, passer en mode "all"
      const importedTypes = details.map(d => d.offer_type)
      const hasMultipleTypes = new Set(importedTypes).size > 1
      if (hasMultipleTypes && filterOfferType !== 'all') {
        skipFilterResetRef.current = true
        setFilterOfferType('all')
      }

      const totalMatched = details.reduce((sum, d) => sum + d.matched, 0)
      const totalAdded = details.reduce((sum, d) => sum + d.added, 0)
      const totalUnchanged = details.reduce((sum, d) => sum + (d.unchanged || 0), 0)
      const totalDeprecated = details.filter(d => d.deprecated).length

      const parts: string[] = []
      if (totalMatched > 0) parts.push(`${totalMatched} mise(s) à jour`)
      if (totalUnchanged > 0) parts.push(`${totalUnchanged} inchangée(s)`)
      if (totalAdded > 0) parts.push(`${totalAdded} nouvelle(s) puissance(s)`)
      if (totalDeprecated > 0) parts.push(`${totalDeprecated} offre(s) à supprimer`)

      const summary = parts.length > 0 ? parts.join(', ') : 'aucune modification'
      setAiImportResult({ success: true, message: `${details.length} offre(s) importée(s) : ${summary}.`, details })

      const hasChanges = totalMatched > 0 || totalAdded > 0 || totalDeprecated > 0 || historicalGroups.length > 0
      if (hasChanges) {
        toast.success(`Import IA réussi : ${summary}`)
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

  return {
    showAIMode, setShowAIMode,
    aiJsonInput, setAiJsonInput,
    aiImportResult, setAiImportResult,
    importAIJson,
  }
}
