import { ReactNode } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

/**
 * Crée un QueryClient de test (pas de retry, pas de refetch)
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface WrapperProps {
  children: ReactNode
}

/**
 * Render avec tous les providers nécessaires (QueryClient + Router)
 */
export function renderWithProviders(
  ui: ReactNode,
  options?: Omit<RenderOptions, 'wrapper'> & { initialEntries?: string[] }
) {
  const queryClient = createTestQueryClient()
  const { initialEntries = ['/contribute/new'], ...renderOptions } = options || {}

  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  }
}

/**
 * Données de test : fournisseurs
 */
export const mockProviders = [
  {
    id: 'provider-1',
    name: 'EDF',
    logo_url: 'https://logo.clearbit.com/edf.fr',
    website: 'https://www.edf.fr',
    active_offers_count: 10,
    is_active: true,
  },
  {
    id: 'provider-2',
    name: 'Enercoop',
    logo_url: 'https://logo.clearbit.com/enercoop.fr',
    website: 'https://www.enercoop.fr',
    active_offers_count: 5,
    is_active: true,
  },
]

/**
 * Données de test : types d'offres
 */
export const mockOfferTypes = [
  { code: 'BASE', name: 'Base', description: 'Tarif unique', icon: 'zap', color: '#3B82F6', required_price_fields: ['base_price'], optional_price_fields: [], display_order: 1 },
  { code: 'HC_HP', name: 'Heures Creuses / Heures Pleines', description: 'Double tarif', icon: 'clock', color: '#10B981', required_price_fields: ['hc_price', 'hp_price'], optional_price_fields: [], display_order: 2 },
  { code: 'TEMPO', name: 'Tempo', description: '6 tarifs', icon: 'palette', color: '#F59E0B', required_price_fields: ['tempo_blue_hc', 'tempo_blue_hp', 'tempo_white_hc', 'tempo_white_hp', 'tempo_red_hc', 'tempo_red_hp'], optional_price_fields: [], display_order: 3 },
  { code: 'EJP', name: 'EJP', description: 'Normal + Pointe', icon: 'alert-triangle', color: '#EF4444', required_price_fields: ['ejp_normal', 'ejp_peak'], optional_price_fields: [], display_order: 4 },
  { code: 'SEASONAL', name: 'Saisonnier', description: 'Hiver/Été', icon: 'sun', color: '#8B5CF6', required_price_fields: ['hc_price_winter', 'hp_price_winter', 'hc_price_summer', 'hp_price_summer'], optional_price_fields: ['peak_day_price'], display_order: 5 },
  { code: 'ZEN_FLEX', name: 'Zen Flex', description: 'Éco/Sobriété', icon: 'leaf', color: '#06B6D4', required_price_fields: ['hc_price_winter', 'hp_price_winter', 'hc_price_summer', 'hp_price_summer'], optional_price_fields: [], display_order: 6 },
  { code: 'BASE_WEEKEND', name: 'Base + Weekend', description: 'Base semaine + weekend', icon: 'calendar', color: '#D946EF', required_price_fields: ['base_price'], optional_price_fields: ['base_price_weekend'], display_order: 7 },
  { code: 'HC_NUIT_WEEKEND', name: 'HC Nuit + Weekend', description: 'HC/HP nuit et weekend', icon: 'moon', color: '#14B8A6', required_price_fields: ['hc_price', 'hp_price'], optional_price_fields: [], display_order: 8 },
  { code: 'HC_WEEKEND', name: 'HC/HP + Weekend', description: 'HC/HP avec weekend', icon: 'calendar', color: '#F97316', required_price_fields: ['hc_price', 'hp_price'], optional_price_fields: [], display_order: 9 },
]

/**
 * Données de test : contributions
 */
export const mockContributions = [
  {
    id: 'contrib-1',
    contribution_type: 'NEW_OFFER' as const,
    status: 'pending' as const,
    existing_provider_id: 'provider-1',
    existing_provider_name: 'EDF',
    offer_name: 'Zen Électrique',
    offer_type: 'BASE',
    description: 'Offre de test',
    power_variants: [
      { power_kva: 6, subscription_price: 12.34, pricing_data: { base_price: 0.2516 } },
      { power_kva: 9, subscription_price: 15.67, pricing_data: { base_price: 0.2516 } },
    ],
    price_sheet_url: 'https://example.com/fiche.pdf',
    valid_from: '2025-01-01',
    created_at: '2025-01-15T10:00:00Z',
    messages: [],
  },
  {
    id: 'contrib-2',
    contribution_type: 'NEW_PROVIDER' as const,
    status: 'approved' as const,
    provider_name: 'Test Fournisseur',
    provider_website: 'https://test.fr',
    offer_name: 'Offre Verte',
    offer_type: 'HC_HP',
    power_variants: [
      { power_kva: 6, subscription_price: 11.00, pricing_data: { hc_price: 0.2068, hp_price: 0.2700 } },
    ],
    price_sheet_url: 'https://example.com/fiche2.pdf',
    valid_from: '2025-02-01',
    created_at: '2025-01-20T14:00:00Z',
    reviewed_at: '2025-01-25T09:00:00Z',
    messages: [
      {
        id: 'msg-1',
        message_type: 'info_request' as const,
        content: 'Pouvez-vous confirmer les tarifs ?',
        is_from_admin: true,
        sender_email: 'admin@test.fr',
        created_at: '2025-01-22T10:00:00Z',
      },
    ],
  },
  {
    id: 'contrib-3',
    contribution_type: 'NEW_OFFER' as const,
    status: 'rejected' as const,
    existing_provider_id: 'provider-2',
    existing_provider_name: 'Enercoop',
    offer_name: 'Offre Rejetée',
    offer_type: 'TEMPO',
    power_variants: [],
    price_sheet_url: 'https://example.com/fiche3.pdf',
    valid_from: '2025-03-01',
    created_at: '2025-02-01T08:00:00Z',
    reviewed_at: '2025-02-05T16:00:00Z',
    review_comment: 'Tarifs incorrects',
    messages: [],
  },
]

/**
 * Données de test : offres existantes
 */
export const mockOffers = [
  {
    id: 'offer-1',
    provider_id: 'provider-1',
    name: 'Tarif Bleu',
    offer_type: 'BASE',
    subscription_price: 12.34,
    base_price: 0.2516,
    power_kva: 6,
    is_active: true,
    valid_from: '2025-01-01',
  },
  {
    id: 'offer-2',
    provider_id: 'provider-1',
    name: 'Tarif Bleu',
    offer_type: 'HC_HP',
    subscription_price: 14.56,
    hc_price: 0.2068,
    hp_price: 0.2700,
    power_kva: 9,
    is_active: true,
    valid_from: '2025-01-01',
  },
]
