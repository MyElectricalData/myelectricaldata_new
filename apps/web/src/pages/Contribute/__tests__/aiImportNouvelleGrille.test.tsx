// Import IA d'une nouvelle grille d'un fournisseur déjà en base (MED-53, issue #145) :
// l'ancienne grille ouverte se clôt à la veille dans la même contribution, au lieu de bloquer
// la soumission par « Certaines puissances que vous souhaitez ajouter existent déjà ».
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { EnergyOffer } from '@/api/energy'

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
import { useOfferSubmission } from '../hooks/useOfferSubmission'
import RecapModal from '../components/alloffers/RecapModal'

const ANCIENNE = '2026-02-05T00:00:00+00:00'

const offre = (id: string, name: string, power_kva: number, subscription_price: number): EnergyOffer => ({
  id, provider_id: 'p1', name, offer_type: 'BASE', subscription_price, base_price: 0.25,
  power_kva, valid_from: ANCIENNE, is_active: true,
})

// Enercoop en base : BasicWatt 3/6/9 kVA ouverte depuis le 05/02/2026, et une autre offre BASE
const EN_BASE = [
  offre('b3', 'BasicWatt', 3, 13),
  offre('b6', 'BasicWatt', 6, 16),
  offre('b9', 'BasicWatt', 9, 19),
  offre('c6', 'Coopérative', 6, 14),
]

const variante = (power_kva: number) => ({ power_kva, subscription_price: 20 + power_kva, base_price: 0.28 })

const importJson = (offer_name: string, valid_from: string, puissances: number[]) => JSON.stringify({
  provider_name: 'Enercoop',
  offers: [{ offer_name, offer_type: 'BASE', valid_from, power_variants: puissances.map(variante) }],
})

function useContribuer() {
  const state = useAllOffersState()
  const ai = useAIImport(state)
  const submission = useOfferSubmission(state)
  return { state, ai, submission }
}

async function importer(json: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(useContribuer, { wrapper })
  await waitFor(() => expect(hook.result.current.state.sortedProviders).toHaveLength(1))
  await waitFor(() => expect(hook.result.current.state.offersArray).toHaveLength(EN_BASE.length))
  act(() => hook.result.current.state.setFilterProvider('p1'))
  await waitFor(() => expect(hook.result.current.state.filterOfferType).toBe('BASE'))
  act(() => hook.result.current.ai.setAiJsonInput(json))
  await act(async () => { await hook.result.current.ai.importAIJson() })
  return hook
}

beforeEach(() => {
  vi.mocked(energyApi.getProviders).mockResolvedValue({ success: true, data: [{ id: 'p1', name: 'Enercoop' }] } as never)
  vi.mocked(energyApi.getOffers).mockResolvedValue({ success: true, data: EN_BASE } as never)
  vi.mocked(energyApi.submitContributionBatch).mockReset()
  vi.mocked(energyApi.submitContributionBatch).mockResolvedValue({ success: true, data: { created: 1, errors: 0 } } as never)
})

describe('import IA : nouvelle grille d\'une offre déjà en base (issue #145)', () => {
  it('clôt l\'ancienne grille à la veille et laisse soumettre', async () => {
    // 36 kVA est absente de la base, 9 kVA absente de l'import : la grille est remplacée en entier
    const { result } = await importer(importJson('BasicWatt', '2026-08-01', [3, 6, 36]))
    const { state } = result.current

    // symptôme de l'issue : « Certaines puissances que vous souhaitez ajouter existent déjà »
    expect(state.hasDuplicatePowers).toBe(false)
    expect(state.editedOffers.b3).toEqual({ valid_to: '2026-07-31' })
    expect(state.editedOffers.b6).toEqual({ valid_to: '2026-07-31' })
    expect(state.editedOffers.b9).toEqual({ valid_to: '2026-07-31' })
    expect(state.editedOffers.c6).toBeUndefined()
    expect(state.newPowersData.map(p => [p.power, p.valid_from])).toEqual([
      [3, '2026-08-01'], [6, '2026-08-01'], [36, '2026-08-01'],
    ])
  })

  it('affiche la clôture au récapitulatif et laisse Soumettre actif', async () => {
    const { result } = await importer(importJson('BasicWatt', '2026-08-01', [3, 6, 36]))
    act(() => result.current.state.setPriceSheetUrl('https://example.org/grille.pdf'))
    render(<RecapModal state={result.current.state} submitAllModifications={vi.fn()} submittingOffers={false} />)

    expect(screen.getByText(/BasicWatt : grille du 05\/02\/2026 clôturée au 31\/07\/2026, remplacée par la grille du 01\/08\/2026/)).toBeTruthy()
    expect(screen.queryByText(/existent déjà/)).toBeNull()
    expect((screen.getByRole('button', { name: /Soumettre/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('envoie la clôture et la nouvelle grille dans la même contribution', async () => {
    const { result } = await importer(importJson('BasicWatt', '2026-08-01', [3, 6, 36]))
    act(() => result.current.state.setPriceSheetUrl('https://example.org/grille.pdf'))
    await act(async () => { await result.current.submission.submitAllModifications(false) })

    const envoyees = vi.mocked(energyApi.submitContributionBatch).mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    const clotures = envoyees.filter(c => c.contribution_type === 'UPDATE_OFFER')
    expect(clotures.map(c => c.existing_offer_id).sort()).toEqual(['b3', 'b6', 'b9'])
    for (const c of clotures) {
      expect(c.pricing_data).toMatchObject({ valid_to: '2026-07-31' })
    }
    const ajouts = envoyees.filter(c => c.contribution_type === 'NEW_OFFER')
    expect(ajouts.map(c => [c.power_kva, c.valid_from])).toEqual([
      [3, '2026-08-01'], [6, '2026-08-01'], [36, '2026-08-01'],
    ])
    expect(envoyees.some(c => c.existing_offer_id === 'c6')).toBe(false)
  })

  it('bloque une grille antérieure à la grille ouverte, avec un message qui la nomme', async () => {
    const { result } = await importer(importJson('BasicWatt', '2026-01-01', [3, 6]))
    const { state, ai } = result.current

    expect(Object.values(state.editedOffers).some(e => e.valid_to)).toBe(false)
    expect(state.hasDuplicatePowers).toBe(true)
    expect(ai.aiImportResult?.details?.[0]?.warning ?? '').toContain('05/02/2026')
  })

  it('ne clôt pas une offre au nom seulement voisin', async () => {
    const { result } = await importer(importJson('Basic', '2026-08-01', [6]))

    expect(Object.values(result.current.state.editedOffers).some(e => e.valid_to)).toBe(false)
  })

  it('ne clôt rien quand la nouvelle grille est rejetée (champs de prix manquants)', async () => {
    const sansPrix = JSON.stringify({
      provider_name: 'Enercoop',
      offers: [{ offer_name: 'BasicWatt', offer_type: 'BASE', valid_from: '2026-08-01',
        power_variants: [{ power_kva: 6, subscription_price: 26 }] }],
    })
    const { result } = await importer(sansPrix)

    expect(Object.values(result.current.state.editedOffers).some(e => e.valid_to)).toBe(false)
    expect(result.current.state.newPowersData).toEqual([])
  })

  it('clôt par une mise à jour une offre déjà corrigée par un import précédent', async () => {
    // revue Codex : valid_from '2026-02-05' (import) face à '2026-02-05T00:00:00+00:00' (base)
    const { result } = await importer(importJson('BasicWatt', '2026-02-05', [6]))
    act(() => result.current.ai.setAiJsonInput(importJson('BasicWatt', '2026-08-01', [3, 6, 9])))
    await act(async () => { await result.current.ai.importAIJson() })
    act(() => result.current.state.setPriceSheetUrl('https://example.org/grille.pdf'))
    await act(async () => { await result.current.submission.submitAllModifications(false) })

    const envoyees = vi.mocked(energyApi.submitContributionBatch).mock.calls[0][0] as unknown as Array<Record<string, unknown>>
    const b6 = envoyees.filter(c => c.existing_offer_id === 'b6' || String(c.description || '').includes('historique'))
    expect(b6).toHaveLength(1)
    expect(b6[0]).toMatchObject({ contribution_type: 'UPDATE_OFFER', existing_offer_id: 'b6' })
    expect(b6[0].pricing_data).toMatchObject({ valid_to: '2026-07-31' })
  })

  it('met à jour la grille existante quand la date est la même', async () => {
    const { result } = await importer(importJson('BasicWatt', '2026-02-05', [6]))
    const { state } = result.current

    expect(state.editedOffers.b6?.subscription_price).toBe('26')
    expect(state.editedOffers.b6?.valid_to).toBeUndefined()
    expect(state.newPowersData).toEqual([])
  })
})
