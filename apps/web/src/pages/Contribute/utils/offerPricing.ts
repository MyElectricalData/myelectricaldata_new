// Configuration data-driven des champs de prix par type d'offre
// Elimine la duplication massive dans AllOffers.tsx (8x les memes formulaires)

import type { PriceFieldConfig, NewGroupPower } from '../types'
import type { EnergyOffer } from '@/api/energy'

// --- Mapping type d'offre -> champs de prix ---

export const OFFER_TYPE_PRICE_FIELDS: Record<string, PriceFieldConfig[]> = {
  BASE: [
    { key: 'base_price', label: 'Base' },
  ],
  HC_HP: [
    { key: 'hc_price', label: 'HC', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price', label: 'HP', color: 'text-red-600 dark:text-red-400' },
  ],
  TEMPO: [
    { key: 'tempo_blue_hc', label: 'Bleu HC', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'tempo_blue_hp', label: 'Bleu HP', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'tempo_white_hc', label: 'Blanc HC', color: 'text-gray-600 dark:text-gray-400' },
    { key: 'tempo_white_hp', label: 'Blanc HP', color: 'text-gray-600 dark:text-gray-400' },
    { key: 'tempo_red_hc', label: 'Rouge HC', color: 'text-red-600 dark:text-red-400' },
    { key: 'tempo_red_hp', label: 'Rouge HP', color: 'text-red-600 dark:text-red-400' },
  ],
  EJP: [
    { key: 'ejp_normal', label: 'Normal', color: 'text-green-600 dark:text-green-400' },
    { key: 'ejp_peak', label: 'Pointe', color: 'text-red-600 dark:text-red-400' },
  ],
  SEASONAL: [
    { key: 'hc_price_summer', label: 'HC Ete', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price_summer', label: 'HP Ete', color: 'text-red-600 dark:text-red-400' },
    { key: 'hc_price_winter', label: 'HC Hiver', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price_winter', label: 'HP Hiver', color: 'text-red-600 dark:text-red-400' },
  ],
  BASE_WEEKEND: [
    { key: 'base_price', label: 'Semaine' },
    { key: 'base_price_weekend', label: 'Week-end', color: 'text-green-600 dark:text-green-400' },
  ],
  HC_WEEKEND: [
    { key: 'hc_price', label: 'HC', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price', label: 'HP', color: 'text-red-600 dark:text-red-400' },
    { key: 'hc_price_weekend', label: 'HC WE', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price_weekend', label: 'HP WE', color: 'text-red-600 dark:text-red-400' },
  ],
  HC_NUIT_WEEKEND: [
    { key: 'hc_price', label: 'HC', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price', label: 'HP', color: 'text-red-600 dark:text-red-400' },
    { key: 'hc_price_weekend', label: 'HC WE', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price_weekend', label: 'HP WE', color: 'text-red-600 dark:text-red-400' },
  ],
}

// Layout saisonnier : regroupement des champs par saison (pour affichage sur 2 lignes)
export const SEASONAL_LAYOUT: Record<string, { label: string; color: string; fields: string[] }[]> = {
  SEASONAL: [
    { label: 'Ete', color: 'text-orange-600 dark:text-orange-400', fields: ['hc_price_summer', 'hp_price_summer'] },
    { label: 'Hiver', color: 'text-blue-600 dark:text-blue-400', fields: ['hc_price_winter', 'hp_price_winter'] },
  ],
  HC_WEEKEND: [
    { label: 'Semaine', color: 'text-gray-600 dark:text-gray-400', fields: ['hc_price', 'hp_price'] },
    { label: 'Week-end', color: 'text-green-600 dark:text-green-400', fields: ['hc_price_weekend', 'hp_price_weekend'] },
  ],
  HC_NUIT_WEEKEND: [
    { label: 'Semaine', color: 'text-gray-600 dark:text-gray-400', fields: ['hc_price', 'hp_price'] },
    { label: 'Week-end', color: 'text-green-600 dark:text-green-400', fields: ['hc_price_weekend', 'hp_price_weekend'] },
  ],
}

// Types qui utilisent un layout saisonnier (2 lignes au lieu de 1)
export function hasSeasonalLayout(offerType: string): boolean {
  return offerType in SEASONAL_LAYOUT
}

// --- Fonctions utilitaires ---

/**
 * Retourne les cles des champs tarifaires pour un type d'offre
 */
export function getFieldKeysForOfferType(offerType: string): string[] {
  const config = OFFER_TYPE_PRICE_FIELDS[offerType]
  if (config) return config.map(f => f.key)
  return []
}

/**
 * Retourne les champs de prix requis pour un type d'offre
 */
export function getRequiredPriceFields(offerType: string): string[] {
  return getFieldKeysForOfferType(offerType)
}

/**
 * Retourne la configuration des champs de prix pour un type d'offre
 * Inclut la detection de champs dynamiques pour les types non standard
 */
export function getPriceFieldsConfig(
  offerType: string,
  dynamicFields?: PriceFieldConfig[]
): PriceFieldConfig[] {
  const config = OFFER_TYPE_PRICE_FIELDS[offerType]
  if (config) return config
  // Champs dynamiques detectes depuis les offres existantes
  return dynamicFields || []
}

/**
 * Nombre de colonnes tarifs dans la grille (pour le layout CSS Grid)
 */
export function getTariffColumns(offerType: string): number {
  switch (offerType) {
    case 'BASE': return 1
    case 'BASE_WEEKEND': return 2
    case 'HC_HP': return 2
    case 'HC_WEEKEND':
    case 'HC_NUIT_WEEKEND':
    case 'SEASONAL': return 4
    case 'TEMPO': return 6
    case 'EJP': return 2
    default: return 2
  }
}

/**
 * Couleur CSS pour un label de champ tarifaire (utilise dans le recap)
 */
export function getLabelColor(label: string): string {
  if (label.includes('Bleu') || label === 'HC' || label.includes('HC')) return 'text-blue-600 dark:text-blue-400'
  if (label.includes('Rouge') || label === 'HP' || label.includes('HP')) return 'text-red-600 dark:text-red-400'
  if (label.includes('Blanc')) return 'text-gray-600 dark:text-gray-400'
  if (label.includes('WE') || label.includes('Week-end')) return 'text-green-600 dark:text-green-400'
  if (label.includes('Ete')) return 'text-orange-600 dark:text-orange-400'
  if (label.includes('Normal')) return 'text-green-600 dark:text-green-400'
  if (label.includes('Pointe')) return 'text-red-600 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-400'
}

/**
 * Formate une valeur numerique pour l'affichage
 */
export function formatValue(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') return '-'
  const num = Number(value)
  if (isNaN(num)) return String(value)
  return num.toFixed(4)
}

/**
 * Formate la puissance d'une offre (ex: "6 kVA")
 */
export function formatPower(offer: { power_kva?: number }): string | null {
  if (!offer.power_kva) return null
  return `${offer.power_kva} kVA`
}

/**
 * Extrait le nom propre d'une offre en retirant le suffixe de periode
 * Format attendu : "Nom de l'offre [01/2025 -> 12/2025]"
 */
export function getCleanOfferName(name: string): string {
  let cleaned = name
  // 1. Retirer le suffixe de periode [date -> date] ou [date ->]
  cleaned = cleaned.replace(/\s*\[.*?\]\s*$/, '')
  // 2. Retirer "- Option XXX - XX kVA" (forme longue EDF)
  cleaned = cleaned.replace(/\s*-\s*Option\s+(?:Base|Heures\s+Creuses(?:\s*\+\s*WE(?:\s*\+\s*jour\s+choisi)?)?|Week-End|WE\s*\+\s*jour\s+choisi|Flex)\s*-?\s*\d+\s*kVA\s*$/i, '')
  // 3. Retirer "- TYPE XX kVA" (forme avec code type)
  cleaned = cleaned.replace(/\s*-\s*(?:BASE|HC\/?HP|HC_HP|TEMPO|EJP|SEASONAL|BASE_WEEKEND|HC_WEEKEND|HC_NUIT_WEEKEND|ZEN_FLEX)\s+\d+\s*kVA\s*$/i, '')
  // 4. Retirer "- XX kVA" simple
  cleaned = cleaned.replace(/\s*-\s*\d+\s*kVA\s*$/i, '')
  // 5. Retirer les suffixes de type restants (sans kVA)
  cleaned = cleaned.replace(/\s*-\s*(?:BASE|HC\/?HP|HC_HP|TEMPO|EJP|SEASONAL|BASE_WEEKEND|HC_WEEKEND|HC_NUIT_WEEKEND|ZEN_FLEX)\s*$/i, '')
  // 6. Retirer les suffixes "- Option XXX" restants
  cleaned = cleaned.replace(/\s*-\s*Option\s+(?:Base|Heures\s+Creuses(?:\s*\+\s*WE(?:\s*\+\s*jour\s+choisi)?)?|Week-End|WE\s*\+\s*jour\s+choisi|Flex)\s*$/i, '')
  return cleaned.trim()
}

/**
 * Extrait le label de periode d'un nom de groupe
 * Format de cle : "NomOffre##2025-02-01##active" ou "NomOffre##active"
 */
export function getGroupPeriodLabel(groupName: string): string {
  const parts = groupName.split('##')
  if (parts.length < 2) return ''
  // parts[1] = date debut ou "active", parts[2] = date fin ou "active"
  const from = parts[1] || ''
  const to = parts.length > 2 ? parts[2] : ''
  if (from === 'active' || !from) return ''
  if (to === 'active' || !to) return `${from} →`
  return `${from} → ${to}`
}

/**
 * Retire le label de periode du nom de groupe
 * Format de cle : "NomOffre##2025-02-01##active" ou "NomOffre##active"
 */
export function getGroupNameWithoutPeriod(groupName: string): string {
  const idx = groupName.indexOf('##')
  if (idx === -1) return groupName.trim()
  return groupName.substring(0, idx).trim()
}

/**
 * Verifie si deux periodes se chevauchent
 * Une date de fin vide signifie "pas de borne" (offre active) ; une date de debut vide
 * d'un seul cote designe une offre legacy, distincte d'une grille datee
 */
export function periodsOverlap(
  start1?: string,
  end1?: string,
  start2?: string,
  end2?: string
): boolean {
  const s1 = start1 ? new Date(start1) : null
  const e1 = end1 ? new Date(end1) : null
  const s2 = start2 ? new Date(start2) : null
  const e2 = end2 ? new Date(end2) : null

  // Si les deux n'ont pas de start, elles se chevauchent
  if (!s1 && !s2) return true
  // Si l'une a un valid_from et l'autre non, ce sont des periodes differentes
  // (l'une est une offre "legacy" sans date, l'autre est une nouvelle grille datee)
  if (!s1 || !s2) return false

  const end1Eff = e1 || new Date('9999-12-31')
  const end2Eff = e2 || new Date('9999-12-31')

  return s1 <= end2Eff && s2 <= end1Eff
}

/**
 * Verifie si une nouvelle puissance a tous les champs requis
 */
export function isNewPowerComplete(
  power: NewGroupPower,
  offerType: string
): boolean {
  if (!power.power || power.power <= 0) return false
  if (!power.fields.subscription_price?.trim()) return false
  const requiredFields = getFieldKeysForOfferType(offerType)
  return requiredFields.every(f => !!power.fields[f]?.trim())
}

/**
 * Verifie si une puissance existe deja dans les offres
 */
export function isPowerAlreadyUsed(
  powerKva: number,
  offerType: string,
  validFrom: string | undefined,
  validTo: string | undefined,
  existingOffers: EnergyOffer[]
): boolean {
  return existingOffers.some(o =>
    (o.power_kva || 0) === powerKva &&
    o.offer_type === offerType &&
    periodsOverlap(validFrom, validTo, o.valid_from, o.valid_to)
  )
}

/**
 * Construit le JSON d'export pour un ensemble d'offres
 */
export function buildOfferExportJson(
  offers: EnergyOffer[],
  providerName: string
): Record<string, unknown> {
  if (offers.length === 0) return {}

  const offerType = offers[0].offer_type
  const offerName = getCleanOfferName(offers[0].name)
  const fieldKeys = getFieldKeysForOfferType(offerType)

  return {
    provider: providerName,
    offer_name: offerName,
    offer_type: offerType,
    valid_from: offers[0].valid_from || null,
    valid_to: offers[0].valid_to || null,
    powers: offers
      .sort((a, b) => (a.power_kva || 0) - (b.power_kva || 0))
      .map(o => {
        const power: Record<string, unknown> = {
          power_kva: o.power_kva,
          subscription_price: o.subscription_price,
        }
        for (const key of fieldKeys) {
          const val = (o as unknown as Record<string, unknown>)[key]
          if (val != null) power[key] = val
        }
        return power
      }),
  }
}

/**
 * Detecte les champs de prix dynamiques depuis les offres existantes
 * Utile pour les types d'offres non standard
 */
export function detectDynamicPriceFields(
  offers: EnergyOffer[],
  offerType: string
): PriceFieldConfig[] {
  // Si le type est connu, utiliser la config statique
  if (OFFER_TYPE_PRICE_FIELDS[offerType]) return OFFER_TYPE_PRICE_FIELDS[offerType]

  // Detecter les champs qui ont des valeurs non-null dans les offres
  const knownPriceKeys = [
    'base_price', 'hc_price', 'hp_price',
    'hc_price_weekend', 'hp_price_weekend', 'base_price_weekend',
    'tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp',
    'tempo_red_hc', 'tempo_red_hp',
    'ejp_normal', 'ejp_peak',
    'hc_price_summer', 'hp_price_summer', 'hc_price_winter', 'hp_price_winter',
    'peak_day_price',
  ]

  const fields: PriceFieldConfig[] = []
  for (const key of knownPriceKeys) {
    const hasValue = offers.some(o => (o as unknown as Record<string, unknown>)[key] != null)
    if (hasValue) {
      const label = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace('Price', '')
        .trim()
      fields.push({ key, label, color: getLabelColor(label) })
    }
  }
  return fields
}
