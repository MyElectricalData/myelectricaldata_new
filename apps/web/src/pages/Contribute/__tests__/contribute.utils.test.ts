import { describe, it, expect } from 'vitest'
import { getOfferTypeLabel, formatPrice } from '../utils/contribute.utils'

describe('contribute.utils', () => {
  describe('getOfferTypeLabel', () => {
    it('retourne "Base" pour BASE', () => {
      expect(getOfferTypeLabel('BASE')).toBe('Base')
    })

    it('retourne "Heures Creuses / Heures Pleines" pour HC_HP', () => {
      expect(getOfferTypeLabel('HC_HP')).toBe('Heures Creuses / Heures Pleines')
    })

    it('retourne "Tempo" pour TEMPO', () => {
      expect(getOfferTypeLabel('TEMPO')).toBe('Tempo')
    })

    it('retourne "EJP" pour EJP', () => {
      expect(getOfferTypeLabel('EJP')).toBe('EJP')
    })

    it('retourne "Saisonnier" pour SEASONAL', () => {
      expect(getOfferTypeLabel('SEASONAL')).toBe('Saisonnier')
    })

    it('retourne "Zen Flex" pour ZEN_FLEX', () => {
      expect(getOfferTypeLabel('ZEN_FLEX')).toBe('Zen Flex')
    })

    it('retourne "Base + Weekend" pour BASE_WEEKEND', () => {
      expect(getOfferTypeLabel('BASE_WEEKEND')).toBe('Base + Weekend')
    })

    it('retourne "HC Nuit + Weekend" pour HC_NUIT_WEEKEND', () => {
      expect(getOfferTypeLabel('HC_NUIT_WEEKEND')).toBe('HC Nuit + Weekend')
    })

    it('retourne "HC/HP + Weekend" pour HC_WEEKEND', () => {
      expect(getOfferTypeLabel('HC_WEEKEND')).toBe('HC/HP + Weekend')
    })

    it('retourne le code brut pour un type inconnu', () => {
      expect(getOfferTypeLabel('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE')
    })
  })

  describe('formatPrice', () => {
    it('formate un prix avec 4 décimales et le suffixe €/kWh', () => {
      expect(formatPrice(0.2516)).toBe('0.2516 €/kWh')
    })

    it('complète avec des zéros si moins de 4 décimales', () => {
      expect(formatPrice(0.25)).toBe('0.2500 €/kWh')
    })

    it('arrondit à 4 décimales', () => {
      expect(formatPrice(0.25167)).toBe('0.2517 €/kWh')
    })

    it('formate un prix entier', () => {
      expect(formatPrice(1)).toBe('1.0000 €/kWh')
    })

    it('retourne "-" pour undefined', () => {
      expect(formatPrice(undefined)).toBe('-')
    })

    it('retourne "-" pour null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(formatPrice(null as any)).toBe('-')
    })

    it('formate zéro', () => {
      expect(formatPrice(0)).toBe('0.0000 €/kWh')
    })
  })
})
