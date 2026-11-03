import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// MED-112 : les pages Consommation et Production cherchaient les détails du PDL sélectionné dans
// pdlApi.list() (PDL du compte seulement). Pour un PDL partagé, selectedPDLDetails restait indéfini
// en impersonation : ni offre, ni liaison conso/production, ni capacités du PDL.

const { enedisApi, syncApi, pdlApi, adminApi } = vi.hoisted(() => {
  const empty = () => Promise.resolve({ success: true, data: { grandeur: [{ points: [] }] } })
  return {
    enedisApi: {
      getProductionDaily: vi.fn(empty),
      getConsumptionDaily: vi.fn(empty),
      getMaxPower: vi.fn(empty),
    },
    syncApi: { getStatusPdl: vi.fn(() => Promise.resolve({ sync_types: {} })) },
    pdlApi: { list: vi.fn() },
    adminApi: { getAllSharedPdls: vi.fn() },
  }
})

vi.mock('@/api/enedis', () => ({ enedisApi }))
vi.mock('@/api/sync', () => ({ syncApi }))
vi.mock('@/api/pdl', () => ({ pdlApi }))
vi.mock('@/api/admin', () => ({ adminApi }))
let isAdminMock = true
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: () => isAdminMock }) }))
let serverModeMock = true
vi.mock('@/hooks/useAppMode', () => ({ useAppMode: () => ({ isServerMode: serverModeMock, isClientMode: !serverModeMock }) }))

import { useProductionData } from '@/pages/Production/hooks/useProductionData'
import { useConsumptionData } from '@/pages/ConsumptionKwh/hooks/useConsumptionData'

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
const shared = { owner_id: 'owner-1', owner_email: 'beaufils12@example.org' }

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  isAdminMock = true
  serverModeMock = true
  pdlApi.list.mockResolvedValue({ success: true, data: [pdl(OWN, 'uuid-own')] })
  adminApi.getAllSharedPdls.mockResolvedValue({
    success: true,
    data: {
      pdls: [
        { ...pdl(SHARED_CONSO, 'uuid-conso', { linked_production_pdl_id: 'uuid-prod' }), ...shared },
        { ...pdl(SHARED_PROD, 'uuid-prod', { has_consumption: false, has_production: true }), ...shared },
      ],
      total: 2,
      users_count: 1,
    },
  })
})
afterEach(() => vi.clearAllMocks())

describe('hooks de pages : PDL partagés (admin)', () => {
  it('Production retrouve les détails du PDL de production partagé', async () => {
    const { result } = renderHook(() => useProductionData(SHARED_PROD, null, null), { wrapper })

    await waitFor(() => expect(result.current.selectedPDLDetails?.id).toBe('uuid-prod'))
    expect(result.current.activePdls.map((p) => p.usage_point_id)).toContain(SHARED_PROD)
  })

  it('Consommation retrouve les détails du PDL partagé, liaison de production comprise', async () => {
    const { result } = renderHook(() => useConsumptionData(SHARED_CONSO, null, null), { wrapper })

    await waitFor(() => expect(result.current.selectedPDLDetails?.id).toBe('uuid-conso'))
    expect(result.current.selectedPDLDetails?.linked_production_pdl_id).toBe('uuid-prod')
  })

  it('un non-admin ne voit que ses PDL, sans appeler la route admin', async () => {
    isAdminMock = false
    const { result } = renderHook(() => useConsumptionData(OWN, null, null), { wrapper })

    await waitFor(() => expect(result.current.selectedPDLDetails?.id).toBe('uuid-own'))
    expect(adminApi.getAllSharedPdls).not.toHaveBeenCalled()
  })
})
