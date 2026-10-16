// Reproduction sur l'état réel d'Enercoop en base (v2.myelectricaldata.fr, 15/10/2026), avec la
// grille officielle du 01/08/2026, fournie par @Marlboro62 en revue de la PR #158 (issue #145).
// En base, chaque offre a deux grilles ouvertes : celle du 05/02 (3, 6, 9… 36 kVA) et celle du
// 08/10 (les 27 autres puissances, la grille d'août saisie à la date du jour).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { EnergyOffer } from '@/api/energy'
import enBase from './enercoop-base-prod.json'
import grille from './enercoop-2026-08-01.json'

vi.mock('@/api/energy', () => ({
  energyApi: {
    getProviders: vi.fn(),
    getOffers: vi.fn(),
    submitContributionBatch: vi.fn(),
    bulkApproveContributions: vi.fn(),
  },
}))
vi.mock('@/api/pdl', () => ({ pdlApi: { list: vi.fn(async () => []) } }))
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: () => false, isModerator: () => false, hasPermission: () => false }),
}))
vi.mock('@/stores/notificationStore', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import { energyApi } from '@/api/energy'
import { useAllOffersState } from '../hooks/useAllOffersState'
import { useAIImport } from '../hooks/useAIImport'

const EN_BASE = enBase as unknown as EnergyOffer[]

// Base où la grille du 08/10 a été redatée au 01/08, sa vraie date d'entrée en vigueur
const EN_BASE_REDATEE = EN_BASE.map(o =>
  o.valid_from?.startsWith('2026-10-08') ? { ...o, valid_from: '2026-08-01T00:00:00+00:00' } : o
)

const importJson = (noms: string[]) => JSON.stringify({
  ...grille,
  offers: grille.offers.filter(o => noms.includes(o.offer_name)),
})

function useContribuer() {
  const state = useAllOffersState()
  const ai = useAIImport(state)
  return { state, ai }
}

async function importer(json: string, base: EnergyOffer[] = EN_BASE, type?: string) {
  vi.mocked(energyApi.getOffers).mockResolvedValue({ success: true, data: base } as never)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(useContribuer, { wrapper })
  await waitFor(() => expect(hook.result.current.state.sortedProviders).toHaveLength(1))
  await waitFor(() => expect(hook.result.current.state.offersArray).toHaveLength(base.length))
  act(() => hook.result.current.state.setFilterProvider('p1'))
  await waitFor(() => expect(hook.result.current.state.filterOfferType).not.toBe('all'))
  if (type) {
    act(() => hook.result.current.state.setFilterOfferType(type))
    await waitFor(() => expect(hook.result.current.state.filterOfferType).toBe(type))
  }
  act(() => hook.result.current.ai.setAiJsonInput(json))
  await act(async () => { await hook.result.current.ai.importAIJson() })
  return hook
}

const clotures = (base: EnergyOffer[], edited: Record<string, { valid_to?: string }>) =>
  base.filter(o => edited[o.id]?.valid_to).map(o => `${o.power_kva} kVA du ${o.valid_from?.slice(0, 10)} au ${edited[o.id].valid_to}`)

beforeEach(() => {
  vi.mocked(energyApi.getProviders).mockResolvedValue({ success: true, data: [{ id: 'p1', name: 'Enercoop' }] } as never)
})

describe('Enercoop en base : grilles ouvertes du 05/02 et du 08/10, import de la grille du 01/08', () => {
  it('BasicWatt : bloque tant que la grille du 08/10 reste ouverte, avec un message qui la cite', async () => {
    const { result } = await importer(importJson(['BasicWatt']))
    const { state, ai } = result.current

    // La grille du 08/10 débute après la grille importée : elle ne se clôt pas avant son début
    expect(state.hasDuplicatePowers).toBe(true)
    expect(ai.aiImportResult?.details?.[0]?.warning ?? '').toContain('08/10/2026')
  })

  it('BasicWatt, grille du 08/10 redatée au 01/08 : clôt aussi la grille du 05/02 et laisse soumettre', async () => {
    const { result } = await importer(importJson(['BasicWatt']), EN_BASE_REDATEE)
    const { state } = result.current

    const basicwatt0502 = EN_BASE_REDATEE
      .filter(o => o.name.startsWith('BasicWatt') && o.valid_from?.startsWith('2026-02-05'))
    expect(clotures(EN_BASE_REDATEE, state.editedOffers).sort()).toEqual(
      basicwatt0502.map(o => `${o.power_kva} kVA du 2026-02-05 au 2026-07-31`).sort()
    )
    expect(state.hasDuplicatePowers).toBe(false)
  })
})

describe('offre absente de la base, importée en deprecated', () => {
  it('« 2 saisons HP/HC » ne doublonne pas avec les autres offres SEASONAL', async () => {
    // Filtre sur SEASONAL : existingPowers ne contient que le type affiché
    const { result } = await importer(importJson(['2 saisons HP/HC']), EN_BASE, 'SEASONAL')
    const { state } = result.current
    expect(state.newGroups.map(g => g.name)).toEqual(['2 saisons HP/HC'])

    expect(state.hasGroupDuplicatePowers).toBe(false)
    act(() => result.current.state.openRecapModal())
    expect(result.current.state.recapExcludedPowers.size).toBe(0)
  })
})
