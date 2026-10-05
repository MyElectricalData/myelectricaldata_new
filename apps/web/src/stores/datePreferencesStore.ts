import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Types de presets pour la date de début d'année
 */
export type DatePreset =
  | 'rolling'    // À partir d'aujourd'hui (année glissante)
  | 'calendar'   // Par année calendaire (1er janvier)
  | 'tempo'      // Année Tempo EDF (1er septembre)
  | 'custom'     // Date personnalisée

/**
 * Date de référence personnalisée (jour + mois)
 */
export interface CustomDate {
  day: number   // 1-31
  month: number // 1-12 (janvier = 1)
}

/**
 * État du store de préférences de dates
 */
interface DatePreferencesState {
  preset: DatePreset
  customDate: CustomDate
  setPreset: (preset: DatePreset) => void
  setCustomDate: (date: CustomDate) => void
}

/**
 * Labels des presets
 */
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  rolling: 'Année glissante',
  calendar: 'Année calendaire',
  tempo: 'Année Tempo',
  custom: 'Date personnalisée',
}

/**
 * Descriptions des presets
 */
export const DATE_PRESET_DESCRIPTIONS: Record<DatePreset, string> = {
  rolling: 'À partir d\'aujourd\'hui, 12 mois en arrière',
  calendar: 'Du 1er janvier au 31 décembre',
  tempo: 'Du 1er septembre au 31 août (tarif Tempo EDF)',
  custom: 'Choisissez votre propre date de début',
}

/**
 * Labels des mois en français
 */
export const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

/**
 * Dernier jour proposé pour un mois de référence (1-12).
 * La date de référence est rejouée sur plusieurs années (période courante et
 * comparaisons N-1, N-2) : le jour retenu doit exister CHAQUE année, sinon
 * new Date(année, mois - 1, jour) déborde sur le mois suivant.
 */
export function maxDayOfMonth(month: number): number {
  // Jour 0 du mois suivant = dernier jour de `month`. 2001 n'est pas bissextile :
  // février plafonne à 28, seul jour de fin de février présent toutes les années.
  return new Date(2001, month, 0).getDate()
}

/**
 * Ramène une date personnalisée sur un jour valide pour son mois
 * (ex. 31 septembre → 30 septembre).
 */
export function normalizeCustomDate(date: CustomDate): CustomDate {
  return { ...date, day: Math.min(Math.max(date.day, 1), maxDayOfMonth(date.month)) }
}

/**
 * Calcule la plage de dates selon le preset sélectionné
 * @returns { start: string, end: string } au format YYYY-MM-DD
 */
export function getDateRangeFromPreset(
  preset: DatePreset,
  customDate?: CustomDate
): { start: string; end: string } {
  const now = new Date()
  // Hier à midi pour éviter les problèmes de timezone
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
    12, 0, 0, 0
  )

  const formatDate = (date: Date): string => {
    return date.getFullYear() + '-' +
           String(date.getMonth() + 1).padStart(2, '0') + '-' +
           String(date.getDate()).padStart(2, '0')
  }

  const endDate = formatDate(yesterday)

  // Fonction pour calculer la date de début selon jour/mois de référence
  const calculateStartFromReference = (refDay: number, refMonth: number): Date => {
    const refThisYear = new Date(
      yesterday.getFullYear(),
      refMonth - 1, // month est 0-indexed
      refDay,
      12, 0, 0, 0
    )

    let startYear: number
    if (refThisYear <= yesterday) {
      // La date de référence de cette année est passée
      startYear = yesterday.getFullYear()
    } else {
      // La date de référence de cette année n'est pas encore passée
      startYear = yesterday.getFullYear() - 1
    }

    return new Date(startYear, refMonth - 1, refDay, 12, 0, 0, 0)
  }

  let startDate: Date

  switch (preset) {
    case 'rolling':
      // Année glissante : même date il y a 1 an
      startDate = new Date(
        yesterday.getFullYear() - 1,
        yesterday.getMonth(),
        yesterday.getDate(),
        12, 0, 0, 0
      )
      break

    case 'calendar':
      // Année calendaire : 1er janvier
      startDate = calculateStartFromReference(1, 1)
      break

    case 'tempo':
      // Année Tempo : 1er septembre
      startDate = calculateStartFromReference(1, 9)
      break

    case 'custom':
      // Date personnalisée
      if (customDate) {
        const { day, month } = normalizeCustomDate(customDate)
        startDate = calculateStartFromReference(day, month)
      } else {
        // Fallback : année glissante
        startDate = new Date(
          yesterday.getFullYear() - 1,
          yesterday.getMonth(),
          yesterday.getDate(),
          12, 0, 0, 0
        )
      }
      break

    default:
      // Par défaut : année glissante
      startDate = new Date(
        yesterday.getFullYear() - 1,
        yesterday.getMonth(),
        yesterday.getDate(),
        12, 0, 0, 0
      )
  }

  return { start: formatDate(startDate), end: endDate }
}

/**
 * Store Zustand pour les préférences de plage de date
 * Persisté dans localStorage
 */
export const useDatePreferencesStore = create<DatePreferencesState>()(
  persist(
    (set) => ({
      preset: 'tempo', // Année Tempo par défaut
      customDate: { day: 1, month: 1 }, // 1er janvier par défaut pour custom
      setPreset: (preset) => set({ preset }),
      setCustomDate: (date) => set({ customDate: normalizeCustomDate(date) }),
    }),
    {
      name: 'date-preferences-storage',
      // Une date invalide déjà enregistrée (ex. 31 février) est corrigée au chargement
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<DatePreferencesState>) }
        return { ...state, customDate: normalizeCustomDate(state.customDate) }
      },
    }
  )
)
