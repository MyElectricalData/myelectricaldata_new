import { describe, it, expect } from 'vitest'
import { getCleanOfferName, getGroupPeriodLabel, isGroupPowerInDb, periodsOverlap } from '../utils/offerPricing'

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

  // Mêmes règles que le backend (apps/api/src/services/offer_names.py, MED-22) :
  // le nom de groupe du front doit être le nom que le serveur stocke
  describe('getCleanOfferName', () => {
    it.each([
      ['Classique - 6 kVA', 'Classique'],
      ['Électricité Prix ECO -5% - 6 kVA', 'Électricité Prix ECO -5%'],
      ['FlexiWatt 2 saisons + Pointe Mobile - 6 kVA', 'FlexiWatt 2 saisons + Pointe Mobile'],
      ['EJP - 6 kVA', 'EJP'],
      ['Tarif Bleu - BASE 6 kVA', 'Tarif Bleu'],
      ['Tarif Bleu - HC/HP - 9 kVA', 'Tarif Bleu'],
      ['Zen Fixe - Option Base - 6 kVA', 'Zen Fixe'],
      ['Zen Week-End - Option Heures Creuses + WE - 6 kVA', 'Zen Week-End'],
      ['Zen Week-End Plus - Option WE + jour choisi - 6 kVA', 'Zen Week-End Plus'],
      ['Zen Week-End - HC/HP + WE 6 kVA', 'Zen Week-End'],
      ['Zen Week-End 6 kVA', 'Zen Week-End'],
      // "Option Flex" reste : l'export Home Assistant (MED-21) reconnaît Zen Flex à ce nom
      ['Zen Week-End - Option Flex - 6 kVA', 'Zen Week-End - Option Flex'],
      ['Tarif Bleu', 'Tarif Bleu'],
      ['Tempo', 'Tempo'],
      ['Octopus Go', 'Octopus Go'],
      ['Classique [01/2025 -> 12/2025]', 'Classique'],
      // cle de groupe du front (nom##periode) envoyee comme nom
      ['Tarif Bleu##2026-02-06##active - 3 kVA', 'Tarif Bleu'],
      ['Tarif Bleu##2026-02-06##active', 'Tarif Bleu'],
      // jamais vide : un nom qui n'est qu'un suffixe reste tel quel (comme le backend)
      ['- BASE', '- BASE'],
      ['6 kVA', '6 kVA'],
      ['Classique - 9 KVA', 'Classique'],
    ])('%s -> %s', (brut, attendu) => {
      expect(getCleanOfferName(brut)).toBe(attendu)
    })
  })

  // Revue de la PR #158 : un nouveau groupe se compare à la base avec son nom, comme
  // isPowerAlreadyUsed, sinon « 2 saisons HP/HC » doublonne avec FlexiWatt 2 saisons
  describe('isGroupPowerInDb', () => {
    const existantes = [
      { power: 6, offer_type: 'SEASONAL', offer_name: 'FlexiWatt 2 saisons', valid_from: '2026-02-05T00:00:00+00:00' },
    ]

    it('signale une puissance de la même offre sur une période qui chevauche', () => {
      expect(isGroupPowerInDb(existantes, 'FlexiWatt 2 saisons', 'SEASONAL', 6, '2026-08-01')).toBe(true)
    })

    it('compare le nom nettoyé, sans la casse', () => {
      expect(isGroupPowerInDb(existantes, 'flexiwatt 2 saisons - 6 kVA', 'SEASONAL', 6, '2026-08-01')).toBe(true)
    })

    it("ne confond pas deux offres de même type et même puissance", () => {
      expect(isGroupPowerInDb(existantes, '2 saisons HP/HC', 'SEASONAL', 6, '2026-08-01')).toBe(false)
    })

    it('ne signale ni une autre puissance, ni un autre type, ni une période disjointe', () => {
      expect(isGroupPowerInDb(existantes, 'FlexiWatt 2 saisons', 'SEASONAL', 9, '2026-08-01')).toBe(false)
      expect(isGroupPowerInDb(existantes, 'FlexiWatt 2 saisons', 'HC_HP', 6, '2026-08-01')).toBe(false)
      expect(isGroupPowerInDb(existantes, 'FlexiWatt 2 saisons', 'SEASONAL', 6, '2025-01-01', '2025-12-31')).toBe(false)
    })
  })

  describe('getGroupPeriodLabel', () => {
    it('ne libelle pas une offre active', () => {
      expect(getGroupPeriodLabel('Classique##active')).toBe('')
    })

    it('libelle une periode ouverte en mois et annee', () => {
      expect(getGroupPeriodLabel('Classique##2025-01-15##active')).toBe('Valide depuis janvier 2025')
    })

    it('libelle une periode fermee', () => {
      expect(getGroupPeriodLabel('Classique##2025-01-15##2025-12-31')).toBe('janvier 2025 → décembre 2025')
    })
  })
})
