import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { pdlApi } from '@/api/pdl'
import { adminApi } from '@/api/admin'
import { useBalanceData } from '../useBalanceData'

// MED-112 : un admin dont un utilisateur partage ses données doit pouvoir ouvrir le Bilan sur ce PDL.
// Le Bilan ne lisait que pdlApi.list() (PDL du compte admin), d'où « Aucun point de livraison avec production ».

let isAdminMock = true
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: () => isAdminMock }) }))
let serverModeMock = true
vi.mock('@/hooks/useAppMode', () => ({ useAppMode: () => ({ isServerMode: serverModeMock, isClientMode: !serverModeMock }) }))
vi.mock('@/api/pdl', () => ({ pdlApi: { list: vi.fn() } }))
vi.mock('@/api/admin', () => ({ adminApi: { getAllSharedPdls: vi.fn() } }))

const OWN = '11111111111111'
const SHARED_CONSO = '17167149025362'
const SHARED_PROD = '17167149025363'

const pdl = (usage_point_id: string, id: string, extra: Record<string, unknown> = {}) => ({
  id,
  usage_point_id,
  name: usage_point_id,
  has_consumption: true,
  has_production: false,
  is_active: true,
  ...extra,
})

const sharedConso = {
  ...pdl(SHARED_CONSO, 'uuid-conso', { linked_production_pdl_id: 'uuid-prod' }),
  owner_id: 'owner-1',
  owner_email: 'beaufils12@example.org',
}
const sharedProd = {
  ...pdl(SHARED_PROD, 'uuid-prod', { has_consumption: false, has_production: true }),
  owner_id: 'owner-1',
  owner_email: 'beaufils12@example.org',
}

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  isAdminMock = true
  serverModeMock = true
  vi.mocked(pdlApi.list).mockReset()
  vi.mocked(adminApi.getAllSharedPdls).mockReset()
  // Le compte admin n'a que son propre PDL de consommation, sans production
  vi.mocked(pdlApi.list).mockResolvedValue({ success: true, data: [pdl(OWN, 'uuid-own')] } as never)
  vi.mocked(adminApi.getAllSharedPdls).mockResolvedValue({
    success: true,
    data: { pdls: [sharedConso, sharedProd], total: 2, users_count: 1 },
  } as never)
})

describe('useBalanceData : PDL partagés (admin)', () => {
  it('propose au Bilan un PDL partagé relié à une production', async () => {
    const { result } = renderHook(() => useBalanceData(SHARED_CONSO, null), { wrapper })

    await waitFor(() => expect(result.current.balancePdls.map((p) => p.usage_point_id)).toContain(SHARED_CONSO))
  })

  it('retrouve les détails du PDL partagé sélectionné (sinon le Bilan affiche « sans production »)', async () => {
    const { result } = renderHook(() => useBalanceData(SHARED_CONSO, null), { wrapper })

    await waitFor(() => expect(result.current.selectedPDLDetails?.usage_point_id).toBe(SHARED_CONSO))
    expect(result.current.selectedPDLDetails?.linked_production_pdl_id).toBe('uuid-prod')
  })

  it('résout le PDL de production partagé lié au PDL de consommation', async () => {
    const { result } = renderHook(() => useBalanceData(SHARED_CONSO, null), { wrapper })

    await waitFor(() => expect(result.current.productionPDL).toBe(SHARED_PROD))
    expect(result.current.productionPDLDetails?.id).toBe('uuid-prod')
  })

  it('accepte aussi un PDL partagé qui produit lui-même', async () => {
    const { result } = renderHook(() => useBalanceData(SHARED_PROD, null), { wrapper })

    await waitFor(() => expect(result.current.balancePdls.map((p) => p.usage_point_id)).toContain(SHARED_PROD))
    expect(result.current.productionPDL).toBe(SHARED_PROD)
  })

  it('ne remonte que les PDL du compte pour un non-admin, sans appeler la route admin', async () => {
    isAdminMock = false
    vi.mocked(pdlApi.list).mockResolvedValue({
      success: true,
      data: [pdl(OWN, 'uuid-own', { has_production: true })],
    } as never)

    const { result } = renderHook(() => useBalanceData(OWN, null), { wrapper })

    await waitFor(() => expect(result.current.balancePdls.map((p) => p.usage_point_id)).toEqual([OWN]))
    expect(adminApi.getAllSharedPdls).not.toHaveBeenCalled()
  })

  it("en mode client, l'admin local n'appelle pas /admin/shared-pdls (routeur absent) et lit sa liste locale", async () => {
    serverModeMock = false
    vi.mocked(pdlApi.list).mockResolvedValue({
      success: true,
      data: [pdl(OWN, 'uuid-own', { has_production: true })],
    } as never)

    const { result } = renderHook(() => useBalanceData(OWN, null), { wrapper })

    await waitFor(() => expect(result.current.balancePdls.map((p) => p.usage_point_id)).toEqual([OWN]))
    expect(adminApi.getAllSharedPdls).not.toHaveBeenCalled()
  })
})
