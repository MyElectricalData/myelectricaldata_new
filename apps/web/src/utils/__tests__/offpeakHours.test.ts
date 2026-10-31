import { describe, expect, it } from 'vitest'
import { isOffpeakTime, offpeakFraction, parseOffpeakHours } from '../offpeakHours'

// Contrat dont les plages HC ne tombent pas sur la demi-heure (cas réel comparé au ZLinky)
const DECALEES = parseOffpeakHours({ ranges: ['23:32-05:32', '14:32-16:32'] })
const CALEES = parseOffpeakHours({ ranges: ['22:00-06:00'] })

describe('offpeakFraction', () => {
  it('répartit au prorata un créneau où commence une plage HC', () => {
    // 23h30-0h00 : 28 minutes en HC sur 30
    expect(offpeakFraction(23, 30, 30, DECALEES)).toBeCloseTo(28 / 30)
  })

  it('répartit au prorata un créneau où finit une plage HC', () => {
    // 5h30-6h00 : 2 minutes en HC sur 30
    expect(offpeakFraction(5, 30, 30, DECALEES)).toBeCloseTo(2 / 30)
    // 16h30-17h00 : 2 minutes en HC
    expect(offpeakFraction(16, 30, 30, DECALEES)).toBeCloseTo(2 / 30)
  })

  it('donne 0 ou 1 pour un créneau entièrement HP ou HC', () => {
    expect(offpeakFraction(2, 0, 30, DECALEES)).toBe(1)
    expect(offpeakFraction(10, 0, 30, DECALEES)).toBe(0)
  })

  it('donne le même résultat que isOffpeakTime pour des plages calées sur la demi-heure', () => {
    for (let t = 0; t < 1440; t += 30) {
      const hour = Math.floor(t / 60)
      const minute = t % 60
      expect(offpeakFraction(hour, minute, 30, CALEES)).toBe(isOffpeakTime(hour, minute, CALEES) ? 1 : 0)
    }
  })

  it('suit le pas du relevé (15 minutes) et passe minuit', () => {
    expect(offpeakFraction(23, 30, 15, DECALEES)).toBeCloseTo(13 / 15)
    expect(offpeakFraction(23, 45, 30, CALEES)).toBe(1)
  })

  it('retrouve la journée du compteur : 6 h de HC sur 24 h', () => {
    let hc = 0
    for (let t = 0; t < 1440; t += 30) hc += offpeakFraction(Math.floor(t / 60), t % 60, 30, DECALEES) * 30
    expect(hc).toBe(8 * 60)
  })
})
