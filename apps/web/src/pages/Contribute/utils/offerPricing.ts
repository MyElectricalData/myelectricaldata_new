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
    { key: 'hc_price_summer', label: 'HC Été', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'hp_price_summer', label: 'HP Été', color: 'text-red-600 dark:text-red-400' },
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
    { label: 'Été', color: 'text-orange-600 dark:text-orange-400', fields: ['hc_price_summer', 'hp_price_summer'] },
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
  // Tempo : couleurs par jour
  if (label.includes('Bleu')) return 'text-blue-600 dark:text-blue-400'
  if (label.includes('Blanc')) return 'text-gray-500 dark:text-gray-300'
  if (label.includes('Rouge')) return 'text-red-600 dark:text-red-400'
  // Saisonnier
  if (label.includes('Été')) return 'text-amber-600 dark:text-amber-400'
  if (label.includes('Hiver')) return 'text-cyan-600 dark:text-cyan-400'
  // Week-end
  if (label.includes('WE') || label.includes('Week-end')) return 'text-purple-600 dark:text-purple-400'
  // HC/HP standard
  if (label === 'HC') return 'text-blue-600 dark:text-blue-400'
  if (label === 'HP') return 'text-red-600 dark:text-red-400'
  // EJP
  if (label === 'Normal') return 'text-green-600 dark:text-green-400'
  if (label === 'Pointe') return 'text-red-600 dark:text-red-400'
  return 'text-gray-600 dark:text-gray-400'
}

/**
 * Formate la puissance d'une offre (ex: "6 kVA")
 */
export function formatPower(offer: { power_kva?: number }): string | null {
  if (!offer.power_kva) return null
  return `${offer.power_kva} kVA`
}

// Puissance en fin de nom, avec ou sans tiret : "Classique - 6 kVA", "Tarif Bleu - BASE 6 kVA"
const POWER_SUFFIX = /\s*-?\s*\d+\s*kVA\s*$/i

// Types et options qui doublonnent offer_type, du plus long au plus court.
// "Option Flex" n'en fait pas partie : l'export Home Assistant (MED-21) reconnait Zen Flex a ce nom.
const TYPE_SUFFIXES = [
  'Option Heures Creuses \\+ WE \\+ jour choisi',
  'Option Heures Creuses \\+ WE',
  'Option Heures Creuses',
  'Option WE \\+ jour choisi',
  'Option Week-End',
  'Option Base',
  'HC/HP \\+ WE',
  'BASE_WEEKEND',
  'HC_NUIT_WEEKEND',
  'HC_WEEKEND',
  'ZEN_FLEX',
  'SEASONAL',
  'HC/HP',
  'HC_HP',
  'TEMPO',
  'BASE',
  'EJP',
]
const TYPE_SUFFIX = new RegExp(`\\s*-\\s*(${TYPE_SUFFIXES.join('|')})\\s*$`, 'i')

/**
 * Nom commercial d'une offre : retire le suffixe de periode "[date -> date]", puis la
 * puissance, une cle de groupe "##periode", puis le type ou l'option en fin de nom.
 * Memes regles que le backend (apps/api/src/services/offer_names.py, MED-22) pour la
 * puissance, la cle de groupe et le type ou l'option. La periode "[date -> date]" est en plus
 * propre au front : c'est un suffixe d'affichage, jamais stocke comme nom d'offre.
 */
export function getCleanOfferName(name: string): string {
  const passes = [
    /\s*\[.*?\]\s*$/, // periode "[date -> date]"
    POWER_SUFFIX,
    /\s*##.*$/, // cle de groupe (nom##periode) envoyee par erreur comme nom
    TYPE_SUFFIX,
  ]
  // un nom qui ne serait plus qu'un suffixe est laisse tel quel (comme le backend)
  return passes.reduce((current, pattern) => current.replace(pattern, '').trim() || current, name)
}

/**
 * Extrait le label de periode d'un nom de groupe
 * Format de cle : "NomOffre##2025-02-01##active" ou "NomOffre##active"
 */
export function getGroupPeriodLabel(groupName: string): string {
  const parts = groupName.split('##')
  if (parts.length < 2) return ''
  const validFrom = parts[1]
  const validTo = parts[2]
  if (validFrom === 'active') return ''
  const monthYear = (date: string) => new Date(date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  if (validTo === 'active' || !validTo) return `Valide depuis ${monthYear(validFrom)}`
  return `${monthYear(validFrom)} → ${monthYear(validTo)}`
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
