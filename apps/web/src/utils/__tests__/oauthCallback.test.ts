import { describe, it, expect } from 'vitest'
import { buildBackendCallbackUrl, isEnedisCallback } from '../oauthCallback'

describe('oauthCallback — retour de consentement Enedis', () => {
  it('Data Connect v2 : autorisation_id sans code (mesuré le 05/10/2026)', () => {
    const params = new URLSearchParams('autorisation_id=58249&state=abc')
    expect(isEnedisCallback(params)).toBe(true)
    expect(buildBackendCallbackUrl(params, '/api', 'https://www.v2.myelectricaldata.fr')).toBe(
      'https://www.v2.myelectricaldata.fr/api/oauth/callback?state=abc&autorisation_id=58249',
    )
  })

  it('v1 : code et usage_point_id', () => {
    const params = new URLSearchParams('code=xyz&state=abc&usage_point_id=99999999999991')
    expect(isEnedisCallback(params)).toBe(true)
    expect(buildBackendCallbackUrl(params, 'https://api.test', 'https://ignore.test')).toBe(
      'https://api.test/oauth/callback?code=xyz&state=abc&usage_point_id=99999999999991',
    )
  })

  it("ni code ni autorisation_id : pas un retour Enedis", () => {
    expect(isEnedisCallback(new URLSearchParams('state=abc'))).toBe(false)
  })
})
