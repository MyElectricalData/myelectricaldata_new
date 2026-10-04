// Types specifiques a la page AllOffers

import type { EnergyOffer } from '@/api/energy'

// --- Configuration des champs de prix ---

export interface PriceFieldConfig {
  key: string
  label: string
  color?: string
}

// --- State des filtres ---

export interface OffersFilterState {
  filterProvider: string
  filterOfferType: string
  selectedGroupName: string
}

// --- State d'edition inline ---

export interface EditedOffersMap {
  [offerId: string]: Record<string, string>
}

// --- Nouvelles puissances a ajouter ---

export interface NewPowerData {
  power: number
  fields: Record<string, string>
  // Champs optionnels pour l'import IA multi-types
  offer_type?: string
  offer_name?: string
  valid_from?: string
  valid_to?: string
}

// --- Nouveaux groupes d'offres ---

export interface NewGroupPower {
  power: number
  fields: Record<string, string>
}

export interface NewGroup {
  name: string
  validFrom: string   // Date de mise en service (YYYY-MM-DD)
  validTo: string     // Date de fin (YYYY-MM-DD), vide = offre active
  offer_type?: string // Type d'offre (pour import IA multi-types)
  alreadyInDb?: boolean // Offre identique deja en base
  powers: NewGroupPower[]
}

// --- Puissances a supprimer ---

export interface PowerToRemove {
  power: number
  groupName: string
}

// --- Offres obsoletes (deprecated) ---

export interface DeprecatedOffer {
  offer_type: string
  offer_name: string
  offer_ids: string[]
  warning: string
}

// --- Resultat de l'import IA ---

export interface AIImportResult {
  success: boolean
  message: string
  details?: AIImportDetail[]
}

export interface AIImportDetail {
  offer_type: string
  offer_name: string
  matched: number
  added: number
  deprecated?: boolean
  warning?: string
}

// --- Modale de confirmation ---

export interface ConfirmDialogState {
  title: string
  message: string
  onConfirm: () => void
  onSubmit: () => void
}

// --- Confirmation de suppression (admin) ---

export interface DeleteConfirmState {
  groupName: string
  offers: EnergyOffer[]
}

// --- Puissances existantes (pour detection des doublons) ---

export interface ExistingPower {
  power: number
  offer_type: string
  valid_from?: string
  valid_to?: string
}

// --- Labels des champs tarifaires ---

export const FIELD_LABELS: Record<string, string> = {
  base_price: 'Base',
  hc_price: 'HC',
  hp_price: 'HP',
  hc_price_weekend: 'HC WE',
  hp_price_weekend: 'HP WE',
  base_price_weekend: 'WE',
  tempo_blue_hc: 'Bleu HC',
  tempo_blue_hp: 'Bleu HP',
  tempo_white_hc: 'Blanc HC',
  tempo_white_hp: 'Blanc HP',
  tempo_red_hc: 'Rouge HC',
  tempo_red_hp: 'Rouge HP',
  ejp_normal: 'Normal',
  ejp_peak: 'Pointe',
  hc_price_summer: 'HC Ete',
  hp_price_summer: 'HP Ete',
  hc_price_winter: 'HC Hiver',
  hp_price_winter: 'HP Hiver',
  peak_day_price: 'Pointe',
}

// --- Ordre des types d'offres ---

export const TYPE_ORDER = [
  'BASE', 'HC_HP', 'TEMPO', 'EJP', 'SEASONAL',
  'BASE_WEEKEND', 'HC_NUIT_WEEKEND', 'HC_WEEKEND',
] as const

// --- Labels des types d'offres ---

export const TYPE_LABELS: Record<string, string> = {
  'BASE': 'Base',
  'HC_HP': 'HC/HP',
  'TEMPO': 'Tempo',
  'EJP': 'EJP',
  'SEASONAL': 'Saisonnier',
  'BASE_WEEKEND': 'Base Week-end',
  'HC_NUIT_WEEKEND': 'HC Nuit Week-end',
  'HC_WEEKEND': 'HC Week-end',
}
