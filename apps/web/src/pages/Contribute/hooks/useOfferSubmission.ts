// Hook pour la soumission batch des modifications d'offres
// Extrait de AllOffers.tsx lignes 1828-2264

import { energyApi, type ContributionData } from '@/api/energy'
import { toast } from '@/stores/notificationStore'
import { getCleanOfferName, formatPower } from '../utils/offerPricing'
import type { AllOffersState } from './useAllOffersState'

// Helper pour parser les valeurs numériques en évitant NaN
const parsePrice = (editedValue: string | undefined, originalValue: number | undefined): number | undefined => {
  if (editedValue !== undefined && editedValue !== '') {
    const parsed = parseFloat(editedValue)
    return isNaN(parsed) ? originalValue : parsed
  }
  return originalValue
}

export function useOfferSubmission(state: AllOffersState) {
  const {
    sortedProviders,
    filterProvider,
    filterOfferType,
    offersArray,
    editedOffers,
    editedOfferNames,
    priceSheetUrl,
    powersToRemove,
    newPowersData,
    newGroups,
    providersToRemove,
    deprecatedOffers,
    groupedOffers,
    recapExcludedPowers,
    showRecapModal, setShowRecapModal,
    submittingOffers, setSubmittingOffers,
    isOfferModified,
    hasModifiedGroupNames,
    resetAllModifications,
  } = state

  const submitAllModifications = async (directApply: boolean = false) => {
    const currentProvider = sortedProviders.find(p => p.id === filterProvider)

    // Toutes les offres du fournisseur (pas seulement le type affiché)
    const providerOffers = currentProvider
      ? offersArray.filter((offer) => offer.provider_id === currentProvider.id)
      : []

    const existingBaseOfferName = providerOffers.length > 0 && currentProvider
      ? getCleanOfferName(providerOffers[0].name)
      : currentProvider ? `${currentProvider.name} - ${filterOfferType}` : ''

    const modifiedOffers = providerOffers.filter(offer => isOfferModified(offer))
    const hasProviderModifications = modifiedOffers.length > 0 || newPowersData.length > 0 || powersToRemove.length > 0 || newGroups.some(g => !g.alreadyInDb) || hasModifiedGroupNames || deprecatedOffers.length > 0
    const hasProviderDeletions = providersToRemove.length > 0

    if (!hasProviderModifications && !hasProviderDeletions) return

    setSubmittingOffers(true)

    const allContributions: ContributionData[] = []

    // Modifications de tarifs existants
    if (currentProvider) {
      for (const offer of modifiedOffers.filter(o => !recapExcludedPowers.has(`modified-${o.id}`))) {
        const edited = editedOffers[offer.id] || {}
        const powerKva = offer.power_kva || 6

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
          ...(edited.valid_to !== undefined ? { valid_to: edited.valid_to || '' } : {}),
        }

        if (isHistoricalAdd) {
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
      for (const { power, groupName: groupKey } of powersToRemove) {
        // groupKey vaut "nom##periode" : comparer et afficher le seul nom
        const groupName = getCleanOfferName(groupKey)
        const groupOffer = providerOffers.find(o => getCleanOfferName(o.name) === groupName)
        const offerType = groupOffer?.offer_type || filterOfferType
        // l'offre exacte du groupe : sans elle, le serveur cherche par fournisseur + type + puissance
        // et echoue des que plusieurs offres partagent ces trois valeurs
        const offerToRemove = groupedOffers[groupKey]?.find(o => o.power_kva === power)
        allContributions.push({
          contribution_type: 'UPDATE_OFFER',
          existing_provider_id: currentProvider.id,
          ...(offerToRemove && { existing_offer_id: offerToRemove.id }),
          provider_name: currentProvider.name,
          offer_name: `[SUPPRESSION] ${currentProvider.name} - ${groupName} - ${power} kVA`,
          offer_type: offerType,
          description: `Demande de suppression de la puissance ${power} kVA pour ${currentProvider.name} (${groupName})`,
          power_kva: power,
          price_sheet_url: priceSheetUrl,
          valid_from: new Date().toISOString().split('T')[0],
        })
      }

      // Offres obsolètes (deprecated)
      for (const dep of deprecatedOffers) {
        for (const offerId of dep.offer_ids) {
          allContributions.push({
            contribution_type: 'UPDATE_OFFER',
            existing_provider_id: currentProvider.id,
            provider_name: currentProvider.name,
            offer_name: `[SUPPRESSION] ${getCleanOfferName(dep.offer_name)} (${dep.offer_type})`,
            offer_type: dep.offer_type,
            description: `Offre signalée comme obsolète par l'IA : ${dep.warning}`,
            power_kva: 0,
            price_sheet_url: priceSheetUrl,
            valid_from: new Date().toISOString().split('T')[0],
          })
          allContributions[allContributions.length - 1].existing_offer_id = offerId
        }
      }

      // Nouvelles puissances
      for (let npIdx = 0; npIdx < newPowersData.length; npIdx++) {
        if (recapExcludedPowers.has(`newpower-${npIdx}`)) continue
        const newPower = newPowersData[npIdx]
        const effectiveType = newPower.offer_type || filterOfferType
        // offer_name porte la cle du groupe ("nom##periode") : n'en envoyer que le nom
        const effectiveName = (newPower.offer_name && getCleanOfferName(newPower.offer_name)) || existingBaseOfferName
        const pricingData: Record<string, number | string | undefined> = {}
        for (const [key, value] of Object.entries(newPower.fields)) {
          if (key !== 'subscription_price' && value) {
            pricingData[key] = parsePrice(value, undefined)
          }
        }
        pricingData.subscription_price = parsePrice(newPower.fields.subscription_price, undefined)
        if (newPower.valid_to) pricingData.valid_to = newPower.valid_to

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
          pricing_data: pricingData,
          price_sheet_url: priceSheetUrl,
          valid_from: newPower.valid_from || new Date().toISOString().split('T')[0],
        })
      }

      // Nouveaux groupes d'offres
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
              tempo_blue_hc: parsePrice(power.fields.tempo_blue_hc, undefined),
              tempo_blue_hp: parsePrice(power.fields.tempo_blue_hp, undefined),
              tempo_white_hc: parsePrice(power.fields.tempo_white_hc, undefined),
              tempo_white_hp: parsePrice(power.fields.tempo_white_hp, undefined),
              tempo_red_hc: parsePrice(power.fields.tempo_red_hc, undefined),
              tempo_red_hp: parsePrice(power.fields.tempo_red_hp, undefined),
              ejp_normal: parsePrice(power.fields.ejp_normal, undefined),
              ejp_peak: parsePrice(power.fields.ejp_peak, undefined),
              hc_price_summer: parsePrice(power.fields.hc_price_summer, undefined),
              hp_price_summer: parsePrice(power.fields.hp_price_summer, undefined),
              hc_price_winter: parsePrice(power.fields.hc_price_winter, undefined),
              hp_price_winter: parsePrice(power.fields.hp_price_winter, undefined),
              base_price_weekend: parsePrice(power.fields.base_price_weekend, undefined),
              hc_price_weekend: parsePrice(power.fields.hc_price_weekend, undefined),
              hp_price_weekend: parsePrice(power.fields.hp_price_weekend, undefined),
              ...(group.validTo ? { valid_to: group.validTo } : {}),
            },
            price_sheet_url: priceSheetUrl,
            valid_from: group.validFrom || new Date().toISOString().split('T')[0],
          })
        }
      }

      // Renommages de groupes
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

    // Envoi batch
    try {
      const response = await energyApi.submitContributionBatch(allContributions, priceSheetUrl, directApply)
      if (response.success) {
        const data = response.data as { created: number; contribution_ids?: string[]; errors: number; error_details?: string[] }
        const created = data.created || 0
        const contributionIds = data.contribution_ids || []
        const errors = data.errors || 0

        // Application directe
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
          resetAllModifications()
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

  return {
    submittingOffers,
    showRecapModal, setShowRecapModal,
    submitAllModifications,
  }
}
