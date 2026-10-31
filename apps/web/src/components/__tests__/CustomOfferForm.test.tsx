import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CustomOfferForm from '../CustomOfferForm'
import { energyApi, type EnergyOffer } from '@/api/energy'

const offers: EnergyOffer[] = []

vi.mock('@/api/energyQueries', () => ({
  offersWithHistoryQueryOptions: () => ({ queryKey: ['energy-offers', 'with-history'], queryFn: async () => offers }),
}))

vi.mock('@/api/energy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/energy')>()
  return {
    ...actual,
    energyApi: { createCustomOffer: vi.fn(), updateCustomOffer: vi.fn(), deleteCustomOffer: vi.fn() },
  }
})

const renderForm = (props: Partial<React.ComponentProps<typeof CustomOfferForm>> = {}) => {
  const onSelect = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CustomOfferForm selectedOfferId={null} subscribedPower={6} onSelect={onSelect} {...props} />
    </QueryClientProvider>,
  )
  return onSelect
}

/**
 * Offre aux prix saisis (mode client) : un contrat absent de la base des offres,
 * par exemple une grille Zen Fixe souscrite avant la grille actuelle.
 */
describe('CustomOfferForm', () => {
  beforeEach(() => {
    offers.length = 0
    vi.mocked(energyApi.createCustomOffer).mockReset()
    vi.mocked(energyApi.updateCustomOffer).mockReset()
  })

  it('crée une offre HC/HP avec la virgule décimale, puis la sélectionne sur le PDL', async () => {
    vi.mocked(energyApi.createCustomOffer).mockResolvedValue({
      success: true,
      data: { id: 'offre-1' } as EnergyOffer,
      timestamp: '',
    })
    const onSelect = renderForm()

    fireEvent.click(screen.getByRole('button', { name: /saisir mes prix/ }))
    fireEvent.change(screen.getByLabelText('Abonnement'), { target: { value: '18,36' } })
    fireEvent.change(screen.getByLabelText('Prix du kWh en heures creuses'), { target: { value: '0,1493' } })
    fireEvent.change(screen.getByLabelText('Prix du kWh en heures pleines'), { target: { value: '0,1885' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('offre-1'))
    expect(energyApi.createCustomOffer).toHaveBeenCalledWith({
      name: 'Mon offre',
      offer_type: 'HC_HP',
      power_kva: 6,
      subscription_price: 18.36,
      hc_price: 0.1493,
      hp_price: 0.1885,
    })
  })

  it("n'enregistre pas tant qu'un prix manque", () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: /saisir mes prix/ }))
    fireEvent.change(screen.getByLabelText('Abonnement'), { target: { value: '18,36' } })
    fireEvent.change(screen.getByLabelText('Prix du kWh en heures creuses'), { target: { value: '0,1493' } })

    expect(screen.getByRole('button', { name: /Enregistrer/ })).toBeDisabled()
  })

  it("modifie l'offre saisie déjà sélectionnée, sans la resélectionner", async () => {
    offers.push({
      id: 'offre-1',
      provider_id: 'custom-offers',
      name: 'Zen Fixe',
      offer_type: 'BASE',
      // Montants tels que renvoyés par l'API (format de la base)
      subscription_price: '12.50000' as unknown as number,
      base_price: '0.20000' as unknown as number,
      power_kva: 6,
    })
    vi.mocked(energyApi.updateCustomOffer).mockResolvedValue({
      success: true,
      data: { id: 'offre-1' } as EnergyOffer,
      timestamp: '',
    })
    const onSelect = renderForm({ selectedOfferId: 'offre-1' })

    fireEvent.click(await screen.findByRole('button', { name: 'Modifier mes prix' }))
    expect(screen.getByLabelText('Abonnement')).toHaveValue('12,5')
    expect(screen.getByLabelText('Prix du kWh')).toHaveValue('0,2')
    fireEvent.change(screen.getByLabelText('Prix du kWh'), { target: { value: '0,2082' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer/ }))

    await waitFor(() => expect(energyApi.updateCustomOffer).toHaveBeenCalled())
    expect(vi.mocked(energyApi.updateCustomOffer).mock.calls[0]).toEqual([
      'offre-1',
      { name: 'Zen Fixe', offer_type: 'BASE', power_kva: 6, subscription_price: 12.5, base_price: 0.2082 },
    ])
    expect(onSelect).not.toHaveBeenCalled()
  })
})
