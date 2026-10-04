/**
 * Accès aux réponses Enedis de la passerelle (Data Connect 2026, MED-14).
 *
 * Seul point du front qui connaît le format des mesures et du contrat : les
 * écrans et les calculs passent par ces fonctions, jamais par `grandeur[0].points`
 * directement. Le format v5 (`meter_reading.interval_reading`) reste accepté en
 * lecture : le cache React Query restauré depuis IndexedDB peut encore en contenir.
 */
import type {
  EnedisContract,
  EnedisGrandeur,
  EnedisMeasure,
  EnedisPoint,
  EnedisSituationContrat,
  MeasureReading,
} from '@/types/api'

type AnyRecord = Record<string, any>

const asRecord = (data: unknown): AnyRecord | null =>
  data && typeof data === 'object' && !Array.isArray(data) ? (data as AnyRecord) : null

const firstGrandeur = (data: unknown): EnedisGrandeur | undefined => {
  const grandeur = asRecord(data)?.grandeur
  return Array.isArray(grandeur) ? grandeur[0] : undefined
}

const v5MeterReading = (data: unknown): AnyRecord | undefined => asRecord(data)?.meter_reading

/** Lectures numériques {date, value, interval_length?} d'une réponse de mesure (2026 ou v5) */
export function getReadings(data: unknown): MeasureReading[] {
  const grandeur = firstGrandeur(data)
  if (grandeur) {
    return (grandeur.points ?? []).map((point: EnedisPoint) => ({
      date: point.d,
      value: Number(point.v),
      ...(point.p ? { interval_length: point.p } : {}),
    }))
  }
  const readings = v5MeterReading(data)?.interval_reading
  if (!Array.isArray(readings)) return []
  return readings.map((reading: AnyRecord) => ({
    date: reading.date,
    value: Number(reading.value),
    ...(reading.interval_length ? { interval_length: reading.interval_length } : {}),
  }))
}

export const hasReadings = (data: unknown): boolean => getReadings(data).length > 0

/** Unité de la mesure (W, Wh, VA…) */
export function getUnit(data: unknown): string | undefined {
  const grandeur = firstGrandeur(data)
  if (grandeur) return grandeur.unite ?? undefined
  return v5MeterReading(data)?.reading_type?.unit
}

/** Pas de la mesure (PT30M, P1D…) : pas global, sinon celui du premier point */
export function getIntervalLength(data: unknown): string | undefined {
  const record = asRecord(data)
  if (firstGrandeur(data)) {
    return firstGrandeur(data)?.points?.[0]?.p ?? record?.pas
  }
  const meterReading = v5MeterReading(data)
  return meterReading?.reading_type?.interval_length ?? meterReading?.interval_reading?.[0]?.interval_length
}

/** Réponse 2026 reconstruite à partir de lectures (cache React Query, données de démo) */
export function buildMeasure(
  readings: MeasureReading[],
  options: { grandeurMetier: 'CONS' | 'PROD'; unite: string; grandeurPhysique?: string; pas?: string; start?: string; end?: string },
): EnedisMeasure {
  return {
    ...(options.start && options.end ? { periode: { dateDebut: options.start, dateFin: options.end } } : {}),
    ...(options.pas ? { pas: options.pas } : {}),
    grandeur: [
      {
        grandeurMetier: options.grandeurMetier,
        grandeurPhysique: options.grandeurPhysique ?? (options.unite === 'W' ? 'PA' : 'EA'),
        unite: options.unite,
        points: readings.map((reading) => ({
          v: String(reading.value),
          d: reading.date,
          ...(reading.interval_length ? { p: reading.interval_length } : {}),
        })),
      },
    ],
  }
}

export interface ContractSummary {
  segment?: string
  contractType?: string
  subscribedPower?: string
  distributionTariff?: string
  offpeakHours?: string
  lastActivationDate?: string
}

const isInjection = (contract: EnedisSituationContrat): boolean =>
  (contract.contract_type ?? '').includes('GRD-A') || (contract.segment ?? '').startsWith('P')

const offpeakText = (raw: unknown): string | undefined => {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') return Array.from(new Set(Object.values(raw as Record<string, string>))).join(' ; ')
  return undefined
}

/** Champs du contrat à afficher (contrat agrégé 2026, ou contrat v5) */
export function getContractSummary(data: unknown): ContractSummary | null {
  const record = asRecord(data)
  if (!record) return null

  if (Array.isArray(record.situation_contrat)) {
    const contract = record as EnedisContract
    const situations = contract.situation_contrat ?? []
    const consumption = situations.find((c) => !isInjection(c)) ?? situations[0] ?? {}
    const power = consumption.subscribed_power
    return {
      segment: consumption.segment,
      contractType: consumption.contract_type,
      subscribedPower: power ? `${power.value} ${power.unit}` : undefined,
      distributionTariff: consumption.distribution_tariff,
      offpeakHours: offpeakText(contract.comptage?.relais?.plageHeuresCreuses),
      lastActivationDate: contract.synthese_contrat?.consumption_last_activation_date?.slice(0, 10),
    }
  }

  const v5 = record.customer?.usage_points?.[0]?.contracts
  if (!v5) return null
  return {
    segment: v5.segment,
    contractType: v5.contract_type,
    subscribedPower: v5.subscribed_power,
    distributionTariff: v5.distribution_tariff,
    offpeakHours: offpeakText(v5.offpeak_hours),
    lastActivationDate: v5.last_activation_date?.slice(0, 10),
  }
}

export interface AddressSummary {
  street?: string
  postalCodeCity?: string
  inseeCode?: string
}

/** Adresse à afficher (donnees_generales_auto, ou adresse v5) */
export function getAddressSummary(data: unknown): AddressSummary | null {
  const record = asRecord(data)
  if (!record) return null

  if (record.address) {
    return {
      street: record.address.number_street_name,
      postalCodeCity: record.address.postal_code_city,
      inseeCode: record.address.insee_code,
    }
  }

  const v5 = record.customer?.usage_points?.[0]?.usage_point?.usage_point_addresses
  if (!v5) return null
  return {
    street: v5.street,
    postalCodeCity: [v5.postal_code, v5.city].filter(Boolean).join(' ') || undefined,
    inseeCode: v5.insee_code,
  }
}
