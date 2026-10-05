import { describe, it, expect } from 'vitest'
import { periodsOverlap } from '../utils/offerPricing'

describe('offerPricing', () => {
  describe('periodsOverlap', () => {
    it('considère deux offres sans date comme la même période', () => {
      expect(periodsOverlap(undefined, undefined, undefined, undefined)).toBe(true)
    })

    // db73162 : une offre "legacy" sans date face à une nouvelle grille datée = périodes différentes
    it('ne fait pas chevaucher une grille datée et une offre sans date de début', () => {
      expect(periodsOverlap('2026-02-01', undefined, undefined, undefined)).toBe(false)
      expect(periodsOverlap(undefined, undefined, '2026-02-01', undefined)).toBe(false)
    })

    it('détecte le chevauchement de deux périodes datées', () => {
      expect(periodsOverlap('2025-01-01', '2025-12-31', '2025-06-01', undefined)).toBe(true)
    })

    it('sépare deux périodes datées disjointes', () => {
      expect(periodsOverlap('2025-01-01', '2025-01-31', '2026-02-01', undefined)).toBe(false)
    })
  })
})
