/**
 * Retour du consentement Enedis vers le front, à relayer au backend (/oauth/callback).
 *
 * - v1 : `?code=…&state=…&usage_point_id=<PRM>`
 * - Data Connect v2 : `?autorisation_id=…&state=…`, SANS code (mesuré le 05/10/2026)
 */
const FORWARDED_PARAMS = ['code', 'state', 'usage_point_id', 'autorisation_id'] as const

/** Vrai si l'URL est un retour de consentement Enedis (v1 ou v2) */
export const isEnedisCallback = (params: URLSearchParams): boolean =>
  Boolean(params.get('code') || params.get('autorisation_id'))

/** URL du callback backend, avec les seuls paramètres Enedis présents */
export function buildBackendCallbackUrl(params: URLSearchParams, apiBaseUrl: string, origin: string): string {
  const baseUrl = apiBaseUrl.startsWith('/') ? `${origin}${apiBaseUrl}` : apiBaseUrl
  const backendUrl = new URL(`${baseUrl}/oauth/callback`)
  for (const name of FORWARDED_PARAMS) {
    const value = params.get(name)
    if (value) backendUrl.searchParams.set(name, value)
  }
  return backendUrl.toString()
}
