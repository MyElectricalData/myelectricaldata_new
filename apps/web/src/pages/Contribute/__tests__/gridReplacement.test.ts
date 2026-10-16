import { describe, it, expect } from 'vitest'
import type { EnergyOffer } from '@/api/energy'
import { dayBefore, findLaterOpenGrid, findOpenGridToClose } from '../utils/gridReplacement'

const offre = (id: string, name: string, power_kva: number, valid_from?: string, valid_to?: string): EnergyOffer => ({
  id, provider_id: 'p1', name, offer_type: 'BASE', subscription_price: 10, base_price: 0.25,
  power_kva, valid_from, valid_to,
})

const ids = (offers: EnergyOffer[]) => offers.map(o => o.id).sort()

describe('dayBefore', () => {
  it.each([
    ['2026-08-01', '2026-07-31'],
    ['2026-03-01', '2026-02-28'],
    ['2024-03-01', '2024-02-29'],
    ['2026-01-01', '2025-12-31'],
    ['2026-08-01T00:00:00Z', '2026-07-31'],
    ['2026-08-01T00:00:00+00:00', '2026-07-31'],
  ])('%s → %s', (date, veille) => {
    expect(dayBefore(date)).toBe(veille)
  })
})

describe('findOpenGridToClose', () => {
  // Enercoop dans l'issue #145 : grille du 05/02/2026 sans date de fin
  const basicwatt = [
    offre('b3', 'BasicWatt', 3, '2026-02-05T00:00:00+00:00'),
    offre('b6', 'BasicWatt', 6, '2026-02-05T00:00:00+00:00'),
    offre('b9', 'BasicWatt', 9, '2026-02-05T00:00:00+00:00'),
  ]
  const expiree = offre('b6-2025', 'BasicWatt', 6, '2025-02-01T00:00:00+00:00', '2026-02-04T00:00:00+00:00')
  const autre = offre('c6', 'Coopérative', 6, '2026-02-05T00:00:00+00:00')
  const existantes = [...basicwatt, expiree, autre]

  it('rend toute la grille ouverte du même nom quand la grille importée débute après', () => {
    expect(ids(findOpenGridToClose(existantes, 'BasicWatt', '2026-08-01'))).toEqual(['b3', 'b6', 'b9'])
  })

  it('compare le nom nettoyé, sans la puissance ni la casse', () => {
    expect(ids(findOpenGridToClose(existantes, 'basicwatt - 6 kVA', '2026-08-01'))).toEqual(['b3', 'b6', 'b9'])
  })

  it('ne clôt pas une offre au nom seulement voisin', () => {
    expect(findOpenGridToClose(existantes, 'Basic', '2026-08-01')).toEqual([])
  })

  it('ne remplace rien à la même date (mise à jour de la grille existante)', () => {
    expect(findOpenGridToClose(existantes, 'BasicWatt', '2026-02-05')).toEqual([])
  })

  it('ne remplace pas une grille plus récente que la grille importée', () => {
    expect(findOpenGridToClose(existantes, 'BasicWatt', '2026-01-01')).toEqual([])
  })

  it('ignore une grille ouverte sans date de début (offre legacy)', () => {
    expect(findOpenGridToClose([offre('l6', 'BasicWatt', 6)], 'BasicWatt', '2026-08-01')).toEqual([])
  })
})

describe('findLaterOpenGrid', () => {
  // Enercoop en base (revue de la PR #158) : la grille d'août saisie au 08/10
  const existantes = [
    offre('b6', 'BasicWatt', 6, '2026-02-05T00:00:00+00:00'),
    offre('b7', 'BasicWatt', 7, '2026-10-08T00:00:00+00:00'),
    offre('c7', 'Coopérative', 7, '2026-11-01T00:00:00+00:00'),
  ]

  it('rend la grille ouverte du même nom qui débute après la grille importée', () => {
    expect(findLaterOpenGrid(existantes, 'basicwatt - 7 kVA', '2026-08-01')?.id).toBe('b7')
  })

  it("ne rend rien quand aucune grille ouverte ne débute après", () => {
    expect(findLaterOpenGrid(existantes, 'BasicWatt', '2026-10-08')).toBeUndefined()
    expect(findLaterOpenGrid([offre('x', 'BasicWatt', 7, '2026-10-08', '2026-12-31')], 'BasicWatt', '2026-08-01')).toBeUndefined()
  })
})
