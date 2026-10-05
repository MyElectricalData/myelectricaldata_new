import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('../client', () => ({ apiClient: { get: (...args: unknown[]) => get(...args) } }))

import { enedisApi } from '../enedis'

const PRM = '99999999999991'

describe('enedisApi — fin de période incluse côté interface, exclue côté API (MED-19)', () => {
  beforeEach(() => get.mockReset())

  it.each([
    ['getConsumptionDaily', 'enedis/consumption/daily'],
    ['getConsumptionDetail', 'enedis/consumption/detail'],
    ['getConsumptionDetailBatch', 'enedis/consumption/detail/batch'],
    ['getMaxPower', 'enedis/power'],
    ['getProductionDaily', 'enedis/production/daily'],
    ['getProductionDetail', 'enedis/production/detail'],
    ['getProductionDetailBatch', 'enedis/production/detail/batch'],
  ] as const)('%s envoie end + 1 jour', async (method, path) => {
    await enedisApi[method](PRM, { start: '2026-10-01', end: '2026-10-04', use_cache: true })

    expect(get).toHaveBeenCalledWith(`${path}/${PRM}`, { start: '2026-10-01', end: '2026-10-05', use_cache: true })
  })

  it("change de mois, d'année et passe le changement d'heure", async () => {
    for (const [end, expected] of [
      ['2026-09-30', '2026-10-01'],
      ['2026-12-31', '2027-01-01'],
      ['2026-10-25', '2026-10-26'],
      ['2027-03-28', '2027-03-29'],
      ['2028-02-28', '2028-02-29'],
    ]) {
      get.mockReset()
      await enedisApi.getConsumptionDaily(PRM, { start: '2026-01-01', end })
      expect(get.mock.calls[0][1].end).toBe(expected)
    }
  })
})
