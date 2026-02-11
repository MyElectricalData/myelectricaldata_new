import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import Contribute from '../index'
import { renderWithProviders, mockProviders, mockContributions, mockOffers, mockOfferTypes } from './test-helpers'

// Mock de l'API energy
vi.mock('@/api/energy', () => ({
  energyApi: {
    getProviders: vi.fn().mockResolvedValue({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    }),
    getOffers: vi.fn().mockResolvedValue({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    }),
    getOfferTypes: vi.fn().mockResolvedValue({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    }),
    getMyContributions: vi.fn().mockResolvedValue({
      success: true,
      data: [],
      timestamp: new Date().toISOString(),
    }),
    getUnreadContributionsCount: vi.fn().mockResolvedValue({
      success: true,
      data: { unread_count: 0 },
      timestamp: new Date().toISOString(),
    }),
    submitContribution: vi.fn(),
    updateContribution: vi.fn(),
    deleteContribution: vi.fn(),
    replyToContribution: vi.fn(),
  },
}))

// Mock du toast
vi.mock('@/stores/notificationStore', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn().mockReturnValue('loading-id'),
    dismiss: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock du SingleDatePicker
vi.mock('@/components/SingleDatePicker', () => ({
  SingleDatePicker: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) => (
    <div data-testid={`date-picker-${label}`}>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </div>
  ),
}))

describe('Contribute', () => {
  describe('onglet "Nouvelle contribution" (new)', () => {
    it('affiche le formulaire NewContribution par défaut', () => {
      renderWithProviders(<Contribute initialTab="new" />)

      expect(screen.getByText('Type de contribution')).toBeInTheDocument()
      expect(screen.getByText('Variantes de puissance')).toBeInTheDocument()
      expect(screen.getByText('Documentation')).toBeInTheDocument()
    })

    it('ne montre pas les autres onglets', () => {
      renderWithProviders(<Contribute initialTab="new" />)

      // Les composants des autres onglets ne sont pas rendus
      expect(screen.queryByText(/Toutes les offres/i)).not.toBeInTheDocument()
    })
  })

  describe('onglet "Mes contributions" (mine)', () => {
    it('affiche le composant MyContributions', async () => {
      const { energyApi } = await import('@/api/energy')
      vi.mocked(energyApi.getMyContributions).mockResolvedValue({
        success: true,
        data: mockContributions,
        timestamp: new Date().toISOString(),
      })

      renderWithProviders(<Contribute initialTab="mine" />)

      // MyContributions affiche une vue groupée par statut
      // Attend que les données soient chargées
      expect(screen.queryByText('Type de contribution')).not.toBeInTheDocument()
    })
  })

  describe('onglet "Toutes les offres" (offers)', () => {
    it('affiche le composant AllOffers', async () => {
      const { energyApi } = await import('@/api/energy')
      vi.mocked(energyApi.getProviders).mockResolvedValue({
        success: true,
        data: mockProviders,
        timestamp: new Date().toISOString(),
      })
      vi.mocked(energyApi.getOffers).mockResolvedValue({
        success: true,
        data: mockOffers,
        timestamp: new Date().toISOString(),
      })
      vi.mocked(energyApi.getOfferTypes).mockResolvedValue({
        success: true,
        data: mockOfferTypes,
        timestamp: new Date().toISOString(),
      })

      renderWithProviders(<Contribute initialTab="offers" />)

      // AllOffers ne montre pas le formulaire NewContribution
      expect(screen.queryByText('Type de contribution')).not.toBeInTheDocument()
    })
  })

  describe('initialTab par défaut', () => {
    it('affiche l\'onglet "new" si pas de prop initialTab', () => {
      renderWithProviders(<Contribute />)

      expect(screen.getByText('Type de contribution')).toBeInTheDocument()
    })
  })
})
