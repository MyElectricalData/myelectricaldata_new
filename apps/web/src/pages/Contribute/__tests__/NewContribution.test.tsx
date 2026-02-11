import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewContribution from '../components/tabs/NewContribution'
import { renderWithProviders, mockProviders } from './test-helpers'
import { type PowerVariant, type ValidityPeriod } from '../types'

// Mock de l'API energy
vi.mock('@/api/energy', () => ({
  energyApi: {
    getProviders: vi.fn(),
    submitContribution: vi.fn(),
    updateContribution: vi.fn(),
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

describe('NewContribution', () => {
  let formState: {
    contributionType: 'NEW_PROVIDER' | 'NEW_OFFER'
    providerName: string
    providerWebsite: string
    selectedProviderId: string
    offerName: string
    offerType: string
    description: string
    powerVariants: PowerVariant[]
    priceSheetUrl: string
    screenshotUrl: string
    validityPeriods: ValidityPeriod[]
  }
  let onFormStateChange: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const today = new Date().toISOString().split('T')[0]
    formState = {
      contributionType: 'NEW_OFFER',
      providerName: '',
      providerWebsite: '',
      selectedProviderId: '',
      offerName: '',
      offerType: 'BASE',
      description: '',
      powerVariants: [],
      priceSheetUrl: '',
      screenshotUrl: '',
      validityPeriods: [{ id: 'period-1', validFrom: today, validTo: '' }],
    }

    onFormStateChange = vi.fn((key: string, value: unknown) => {
      ;(formState as Record<string, unknown>)[key] = value
    })

    const { energyApi } = await import('@/api/energy')
    vi.mocked(energyApi.getProviders).mockResolvedValue({
      success: true,
      data: mockProviders,
      timestamp: new Date().toISOString(),
    })
  })

  const renderNewContribution = (overrides = {}) => {
    return renderWithProviders(
      <NewContribution
        editingContributionId={null}
        setEditingContributionId={vi.fn()}
        formState={{ ...formState, ...overrides }}
        onFormStateChange={onFormStateChange}
      />
    )
  }

  describe('rendu initial', () => {
    it('affiche le formulaire de contribution', () => {
      renderNewContribution()

      expect(screen.getByText('Type de contribution')).toBeInTheDocument()
    })

    it('affiche les types de contribution (NEW_OFFER et NEW_PROVIDER)', () => {
      renderNewContribution()

      expect(screen.getByText(/Nouvelle offre \(fournisseur existant\)/)).toBeInTheDocument()
      expect(screen.getByText(/Nouveau fournisseur \+ offre/)).toBeInTheDocument()
    })

    it('affiche les sections du formulaire', () => {
      renderNewContribution()

      expect(screen.getByText('Variantes de puissance')).toBeInTheDocument()
      expect(screen.getByText('Documentation')).toBeInTheDocument()
    })
  })

  describe('type de contribution', () => {
    it('affiche le sélecteur de fournisseur par défaut (NEW_OFFER)', () => {
      renderNewContribution()

      // Le label est "Fournisseur" avec un astérisque obligatoire
      expect(screen.getByText('Sélectionnez un fournisseur')).toBeInTheDocument()
    })

    it('affiche les champs nouveau fournisseur quand NEW_PROVIDER est sélectionné', () => {
      renderNewContribution({ contributionType: 'NEW_PROVIDER' })

      expect(screen.getByPlaceholderText(/EDF, Engie, Total/)).toBeInTheDocument()
      expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument()
    })
  })

  describe('champs de l\'offre', () => {
    it('affiche les champs nom et type d\'offre', () => {
      renderNewContribution()

      expect(screen.getByPlaceholderText(/Tarif Bleu, Heures Creuses/)).toBeInTheDocument()
    })

    it('modifie le nom de l\'offre via onFormStateChange', async () => {
      const user = userEvent.setup()
      renderNewContribution()

      const input = screen.getByPlaceholderText(/Tarif Bleu, Heures Creuses/)
      await user.type(input, 'Mon Offre Test')

      expect(onFormStateChange).toHaveBeenCalledWith('offerName', expect.any(String))
    })
  })

  describe('variantes de puissance', () => {
    it('affiche l\'info pour ajouter des variantes', () => {
      renderNewContribution()

      expect(screen.getByText(/Ajoutez une ou plusieurs puissances/)).toBeInTheDocument()
    })

    it('affiche les variantes existantes avec le compteur', () => {
      const variants: PowerVariant[] = [
        { power_kva: 6, subscription_price: 12.34, pricing_data: { base_price: 0.2516 } },
        { power_kva: 9, subscription_price: 15.67, pricing_data: { base_price: 0.2516 } },
      ]

      renderNewContribution({ powerVariants: variants })

      // Le compteur de variantes
      expect(screen.getByText(/Variantes ajoutées \(2\)/)).toBeInTheDocument()
      // Les détails des variantes (dans la section ajoutées, pas le select)
      expect(screen.getByText('6 kVA')).toBeInTheDocument()
      expect(screen.getByText('9 kVA')).toBeInTheDocument()
    })
  })

  describe('documentation', () => {
    it('affiche les champs de documentation', () => {
      renderNewContribution()

      expect(screen.getByPlaceholderText(/particulier\.edf\.fr/)).toBeInTheDocument()
    })
  })

  describe('validation à la soumission', () => {
    // Le formulaire a des champs required (HTML5 validation).
    // Pour tester la validation JS (handleSubmit), il faut remplir les champs required
    // ou intercepter le submit programmatiquement.
    // On teste ici que le handleSubmit vérifie les variantes et périodes.

    it('affiche une erreur si aucune variante de puissance', async () => {
      const user = userEvent.setup()
      const { toast } = await import('@/stores/notificationStore')

      // Remplir tous les champs required du formulaire HTML pour passer la validation native
      renderNewContribution({
        selectedProviderId: 'provider-1',
        offerName: 'Test',
        offerType: 'BASE',
        priceSheetUrl: 'https://example.com/fiche.pdf',
        powerVariants: [],
      })

      const submitButton = screen.getByRole('button', { name: /Soumettre la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Veuillez ajouter au moins une variante de puissance')
      })
    })

    it('affiche une erreur si aucune période de validité', async () => {
      const user = userEvent.setup()
      const { toast } = await import('@/stores/notificationStore')

      renderNewContribution({
        selectedProviderId: 'provider-1',
        offerName: 'Test',
        offerType: 'BASE',
        priceSheetUrl: 'https://example.com/fiche.pdf',
        powerVariants: [{ power_kva: 6, subscription_price: 12.34 }],
        validityPeriods: [],
      })

      const submitButton = screen.getByRole('button', { name: /Soumettre la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Veuillez ajouter au moins une période de validité')
      })
    })

    it('affiche une erreur si les périodes se chevauchent', async () => {
      const user = userEvent.setup()
      const { toast } = await import('@/stores/notificationStore')

      renderNewContribution({
        selectedProviderId: 'provider-1',
        offerName: 'Test',
        offerType: 'BASE',
        priceSheetUrl: 'https://example.com/fiche.pdf',
        powerVariants: [{ power_kva: 6, subscription_price: 12.34 }],
        validityPeriods: [
          { id: 'p1', validFrom: '2025-01-01', validTo: '2025-06-30' },
          { id: 'p2', validFrom: '2025-03-01', validTo: '2025-09-30' },
        ],
      })

      const submitButton = screen.getByRole('button', { name: /Soumettre la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Les périodes de validité ne doivent pas se chevaucher')
      })
    })
  })

  describe('soumission réussie', () => {
    it('soumet une contribution NEW_OFFER avec succès', async () => {
      const user = userEvent.setup()
      const { energyApi } = await import('@/api/energy')

      vi.mocked(energyApi.submitContribution).mockResolvedValue({
        success: true,
        data: { id: 'new-contrib-1' },
        timestamp: new Date().toISOString(),
      })

      renderNewContribution({
        contributionType: 'NEW_OFFER',
        selectedProviderId: 'provider-1',
        offerName: 'Mon Offre Test',
        offerType: 'BASE',
        priceSheetUrl: 'https://example.com/fiche.pdf',
        powerVariants: [{ power_kva: 6, subscription_price: 12.34, pricing_data: { base_price: 0.2516 } }],
        validityPeriods: [{ id: 'p1', validFrom: '2025-01-01', validTo: '' }],
      })

      const submitButton = screen.getByRole('button', { name: /Soumettre la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(energyApi.submitContribution).toHaveBeenCalledTimes(1)
      })

      const sentData = vi.mocked(energyApi.submitContribution).mock.calls[0][0]
      expect(sentData.contribution_type).toBe('NEW_OFFER')
      expect(sentData.existing_provider_id).toBe('provider-1')
      expect(sentData.offer_name).toBe('Mon Offre Test')
      expect(sentData.offer_type).toBe('BASE')
      expect(sentData.power_variants).toHaveLength(1)
      expect(sentData.power_variants?.[0].power_kva).toBe(6)
    })

    it('crée une contribution par période en mode multi-périodes', async () => {
      const user = userEvent.setup()
      const { energyApi } = await import('@/api/energy')

      vi.mocked(energyApi.submitContribution).mockResolvedValue({
        success: true,
        data: { id: 'new-contrib' },
        timestamp: new Date().toISOString(),
      })

      renderNewContribution({
        contributionType: 'NEW_OFFER',
        selectedProviderId: 'provider-1',
        offerName: 'Tarif Multi',
        offerType: 'BASE',
        priceSheetUrl: 'https://example.com/fiche.pdf',
        powerVariants: [{ power_kva: 6, subscription_price: 12.00 }],
        validityPeriods: [
          { id: 'p1', validFrom: '2024-01-01', validTo: '2024-12-31' },
          { id: 'p2', validFrom: '2025-01-01', validTo: '' },
        ],
      })

      const submitButton = screen.getByRole('button', { name: /Soumettre la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(energyApi.submitContribution).toHaveBeenCalledTimes(2)
      })

      const firstCall = vi.mocked(energyApi.submitContribution).mock.calls[0][0]
      expect(firstCall.valid_from).toBe('2024-01-01')
      expect(firstCall.pricing_data?.valid_to).toBe('2024-12-31')

      const secondCall = vi.mocked(energyApi.submitContribution).mock.calls[1][0]
      expect(secondCall.valid_from).toBe('2025-01-01')
    })
  })

  describe('mode édition', () => {
    it('affiche le bouton "Mettre à jour" en mode édition', () => {
      renderWithProviders(
        <NewContribution
          editingContributionId="contrib-1"
          setEditingContributionId={vi.fn()}
          formState={{
            ...formState,
            offerName: 'Offre en édition',
            powerVariants: [{ power_kva: 6, subscription_price: 12.34 }],
          }}
          onFormStateChange={onFormStateChange}
        />
      )

      expect(screen.getByRole('button', { name: /Mettre à jour la contribution/ })).toBeInTheDocument()
    })

    it('met à jour une contribution existante', async () => {
      const user = userEvent.setup()
      const { energyApi } = await import('@/api/energy')
      const setEditingId = vi.fn()

      vi.mocked(energyApi.updateContribution).mockResolvedValue({
        success: true,
        data: { id: 'contrib-1' },
        timestamp: new Date().toISOString(),
      })

      renderWithProviders(
        <NewContribution
          editingContributionId="contrib-1"
          setEditingContributionId={setEditingId}
          formState={{
            ...formState,
            selectedProviderId: 'provider-1',
            offerName: 'Offre Modifiée',
            offerType: 'BASE',
            priceSheetUrl: 'https://example.com/fiche.pdf',
            powerVariants: [{ power_kva: 6, subscription_price: 12.34, pricing_data: { base_price: 0.2516 } }],
            validityPeriods: [{ id: 'p1', validFrom: '2025-01-01', validTo: '' }],
          }}
          onFormStateChange={onFormStateChange}
        />
      )

      const submitButton = screen.getByRole('button', { name: /Mettre à jour la contribution/ })
      await user.click(submitButton)

      await waitFor(() => {
        expect(energyApi.updateContribution).toHaveBeenCalledWith('contrib-1', expect.objectContaining({
          offer_name: 'Offre Modifiée',
        }))
      })
    })
  })

  describe('mode import JSON', () => {
    it('affiche le bouton pour basculer en mode JSON', () => {
      renderNewContribution()

      expect(screen.getByText(/Import JSON/i)).toBeInTheDocument()
    })
  })
})
