// Types partagés pour la page Contribuer

export type TabType = 'new' | 'mine' | 'offers'

export interface ContributeProps {
  initialTab?: TabType
}

export interface ImportProgress {
  current: number
  total: number
  errors: string[]
}

export interface PowerVariant {
  power_kva: number
  subscription_price: number
  // Prix kWh spécifiques à cette puissance
  pricing_data?: {
    // BASE
    base_price?: number
    // HC/HP
    hc_price?: number
    hp_price?: number
    // TEMPO
    tempo_blue_hc?: number
    tempo_blue_hp?: number
    tempo_white_hc?: number
    tempo_white_hp?: number
    tempo_red_hc?: number
    tempo_red_hp?: number
    // EJP
    ejp_normal?: number
    ejp_peak?: number
    // SEASONAL / ZEN_FLEX
    hc_price_winter?: number
    hp_price_winter?: number
    hc_price_summer?: number
    hp_price_summer?: number
    // Jours de pointe
    peak_day_price?: number
    // Weekend
    base_price_weekend?: number
  }
}

export interface ValidityPeriod {
  id: string // ID unique pour React key
  validFrom: string // Date de début (YYYY-MM-DD)
  validTo: string // Date de fin (YYYY-MM-DD) ou vide si offre active
}

export interface ContributionFormState {
  // Type de contribution
  contributionType: 'NEW_PROVIDER' | 'NEW_OFFER'

  // Provider info
  providerName: string
  providerWebsite: string
  selectedProviderId: string

  // Offer info
  offerName: string
  offerType: string
  description: string

  // Pricing (prix kWh uniquement - abonnement dans power_variants)
  basePrice: string
  hcPrice: string
  hpPrice: string

  // TEMPO pricing
  tempoBlueHc: string
  tempoBlueHp: string
  tempoWhiteHc: string
  tempoWhiteHp: string
  tempoRedHc: string
  tempoRedHp: string

  // EJP pricing
  ejpNormal: string
  ejpPeak: string

  // Seasonal pricing
  hcPriceWinter: string
  hpPriceWinter: string
  hcPriceSummer: string
  hpPriceSummer: string
  peakDayPrice: string

  // Power variants
  powerVariants: PowerVariant[]
  currentVariantPower: string
  currentVariantPrice: string

  // Validity periods (multi-period support)
  validityPeriods: ValidityPeriod[]

  // Documentation
  priceSheetUrl: string
  screenshotUrl: string
}

export interface FilterState {
  filterProvider: string
  filterPower: string
  filterOfferType: string
}
