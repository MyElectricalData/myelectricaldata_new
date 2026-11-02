import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'

// MED-112 : choix, PDL par PDL, des PDL partagés avec l'admin dans le client local

const { syncApi, toast } = vi.hoisted(() => ({
  syncApi: {
    listSharedPdls: vi.fn(),
    selectSharedPdl: vi.fn(() => Promise.resolve({ success: true })),
    unselectSharedPdl: vi.fn(() => Promise.resolve({ success: true })),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@/api/sync', () => ({ syncApi }))
vi.mock('@/stores/notificationStore', () => ({ toast }))

import SharedPdlsPanel from '@/components/SharedPdlsPanel'

const choice = (usage_point_id: string, extra: Record<string, unknown> = {}) => ({
  usage_point_id,
  name: `PDL ${usage_point_id.slice(-4)}`,
  owner_email: 'beaufils12@example.org',
  has_consumption: true,
  has_production: false,
  is_active: true,
  selected: false,
  own: false,
  ...extra,
})

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SharedPdlsPanel />, { wrapper })
}

const httpError = (status: number) =>
  new AxiosError('fail', String(status), undefined, undefined, {
    status, statusText: '', headers: {}, config: { headers: new AxiosHeaders() }, data: {},
  })

beforeEach(() => {
  syncApi.listSharedPdls.mockResolvedValue({
    success: true,
    data: [
      choice('17167149025362', { selected: true }),
      choice('17167149025363', { has_production: true }),
      choice('11111111111111', { own: true }),
    ],
  })
})
afterEach(() => vi.clearAllMocks())

describe('SharedPdlsPanel', () => {
  it('liste les PDL partagés avec leur état, sans les PDL du compte', async () => {
    renderPanel()

    const coche = await screen.findByLabelText('Synchroniser le PDL 17167149025362')
    expect(coche).toBeChecked()
    expect(screen.getByLabelText('Synchroniser le PDL 17167149025363')).not.toBeChecked()
    expect(screen.queryByLabelText('Synchroniser le PDL 11111111111111')).toBeNull()
    expect(screen.getByText(/PDL partagés avec vous \(2\)/)).toBeInTheDocument()
  })

  it('cocher ajoute le PDL, décocher le retire', async () => {
    renderPanel()

    fireEvent.click(await screen.findByLabelText('Synchroniser le PDL 17167149025363'))
    await waitFor(() => expect(syncApi.selectSharedPdl).toHaveBeenCalledWith('17167149025363'))

    fireEvent.click(screen.getByLabelText('Synchroniser le PDL 17167149025362'))
    await waitFor(() => expect(syncApi.unselectSharedPdl).toHaveBeenCalledWith('17167149025362'))
    expect(syncApi.selectSharedPdl).toHaveBeenCalledTimes(1)
  })

  it("ne s'affiche pas pour un compte non admin à la passerelle (403)", async () => {
    syncApi.listSharedPdls.mockRejectedValue(httpError(403))
    const { container } = renderPanel()

    await waitFor(() => expect(syncApi.listSharedPdls).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('signale une liste indisponible (passerelle injoignable)', async () => {
    syncApi.listSharedPdls.mockRejectedValue(httpError(502))
    renderPanel()

    expect(await screen.findByText('Liste des PDL partagés indisponible.')).toBeInTheDocument()
  })
})
