import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  maxDayOfMonth,
  normalizeCustomDate,
  getDateRangeFromPreset,
  useDatePreferencesStore,
} from '../datePreferencesStore'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

describe('datePreferencesStore : date personnalisée', () => {
  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('propose 31 jours pour les mois longs et 30 pour les mois courts', () => {
    for (const month of [1, 3, 5, 7, 8, 10, 12]) expect(maxDayOfMonth(month)).toBe(31)
    for (const month of [4, 6, 9, 11]) expect(maxDayOfMonth(month)).toBe(30)
    expect(maxDayOfMonth(2)).toBeLessThanOrEqual(29)
  })

  it('ramène un jour hors du mois sur le dernier jour proposé', () => {
    expect(normalizeCustomDate({ day: 31, month: 9 })).toEqual({ day: 30, month: 9 })
    expect(normalizeCustomDate({ day: 31, month: 2 })).toEqual({ day: maxDayOfMonth(2), month: 2 })
    expect(normalizeCustomDate({ day: 13, month: 10 })).toEqual({ day: 13, month: 10 })
  })

  // La date de début est rejouée sur plusieurs années : elle ne doit déborder
  // sur le mois suivant ni en année bissextile, ni en année ordinaire.
  it.each([
    ['2026 (ordinaire)', new Date(2026, 9, 6, 10)],
    ['2028 (bissextile)', new Date(2028, 5, 15, 10)],
    ['2029 (lendemain de bissextile)', new Date(2029, 2, 2, 10)],
  ])('aucun débordement de la date de début en %s', (_label, now) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)

    for (const month of MONTHS) {
      const day = maxDayOfMonth(month)
      const { start } = getDateRangeFromPreset('custom', { day, month })
      expect(Number(start.slice(5, 7)), `${day}/${month} → ${start}`).toBe(month)
    }
  })

  it('setCustomDate et le chargement depuis le navigateur normalisent la date', async () => {
    useDatePreferencesStore.getState().setCustomDate({ day: 31, month: 4 })
    expect(useDatePreferencesStore.getState().customDate).toEqual({ day: 30, month: 4 })

    localStorage.setItem(
      'date-preferences-storage',
      JSON.stringify({ state: { preset: 'custom', customDate: { day: 31, month: 11 } }, version: 0 })
    )
    await useDatePreferencesStore.persist.rehydrate()

    expect(useDatePreferencesStore.getState()).toMatchObject({
      preset: 'custom',
      customDate: { day: 30, month: 11 },
    })
  })
})
