import { useState } from 'react'
import { type Contribution } from '@/api/energy'
import { type PowerVariant, type TabType } from './types'
import NewContribution from './components/tabs/NewContribution'
import MyContributions from './components/tabs/MyContributions'
import AllOffers from './components/tabs/AllOffers'

interface ContributeProps {
  initialTab?: TabType
}

export default function Contribute({ initialTab = 'new' }: ContributeProps) {
  // State pour suivre la contribution en cours d'édition
  const [editingContributionId, setEditingContributionId] = useState<string | null>(null)

  // State centralisé pour le formulaire de nouvelle contribution
  const [formState, setFormState] = useState({
    contributionType: 'NEW_OFFER' as 'NEW_PROVIDER' | 'NEW_OFFER',
    providerName: '',
    providerWebsite: '',
    selectedProviderId: '',
    offerName: '',
    offerType: 'BASE',
    description: '',
    powerVariants: [] as PowerVariant[],
    priceSheetUrl: '',
    screenshotUrl: '',
    validityPeriods: [
      {
        id: `period-${Date.now()}`,
        validFrom: new Date().toISOString().split('T')[0],
        validTo: '',
      },
    ] as Array<{ id: string; validFrom: string; validTo: string }>,
  })

  const handleFormStateChange = (key: string, value: unknown) => {
    setFormState(prev => ({ ...prev, [key]: value }))
  }

  // Handler pour éditer une contribution existante
  const handleEditContribution = (contribution: Contribution) => {
    setEditingContributionId(contribution.id)
    // La navigation vers l'onglet "new" est gérée par MyContributions via navigate()

    // Remplir le formulaire avec les données de la contribution
    setFormState({
      contributionType: contribution.contribution_type === 'NEW_PROVIDER' ? 'NEW_PROVIDER' : 'NEW_OFFER',
      providerName: contribution.provider_name || '',
      providerWebsite: contribution.provider_website || '',
      selectedProviderId: contribution.existing_provider_id || '',
      offerName: contribution.offer_name || '',
      offerType: contribution.offer_type || 'BASE',
      description: contribution.description || '',
      powerVariants: contribution.power_variants && contribution.power_variants.length > 0
        ? contribution.power_variants as PowerVariant[]
        : (contribution.power_kva && contribution.pricing_data
          ? [{
              power_kva: contribution.power_kva,
              subscription_price: contribution.pricing_data.subscription_price || 0,
              pricing_data: {
                base_price: contribution.pricing_data.base_price,
                hc_price: contribution.pricing_data.hc_price,
                hp_price: contribution.pricing_data.hp_price,
                tempo_blue_hc: contribution.pricing_data.tempo_blue_hc,
                tempo_blue_hp: contribution.pricing_data.tempo_blue_hp,
                tempo_white_hc: contribution.pricing_data.tempo_white_hc,
                tempo_white_hp: contribution.pricing_data.tempo_white_hp,
                tempo_red_hc: contribution.pricing_data.tempo_red_hc,
                tempo_red_hp: contribution.pricing_data.tempo_red_hp,
                ejp_normal: contribution.pricing_data.ejp_normal,
                ejp_peak: contribution.pricing_data.ejp_peak,
                hc_price_winter: contribution.pricing_data.hc_price_winter,
                hp_price_winter: contribution.pricing_data.hp_price_winter,
                hc_price_summer: contribution.pricing_data.hc_price_summer,
                hp_price_summer: contribution.pricing_data.hp_price_summer,
                peak_day_price: contribution.pricing_data.peak_day_price,
                base_price_weekend: contribution.pricing_data.base_price_weekend,
              }
            }]
          : []
        ),
      priceSheetUrl: contribution.price_sheet_url || '',
      screenshotUrl: contribution.screenshot_url || '',
      validityPeriods: [
        {
          id: `period-${Date.now()}`,
          validFrom: contribution.valid_from
            ? contribution.valid_from.split('T')[0]
            : new Date().toISOString().split('T')[0],
          validTo: '', // Pas de valid_to sur les contributions existantes
        },
      ],
    })
  }

  return (
    <div className="w-full">
      {/* Le contenu affiché dépend de l'initialTab passé par le routing */}
      {initialTab === 'new' && (
        <NewContribution
          editingContributionId={editingContributionId}
          setEditingContributionId={setEditingContributionId}
          formState={formState}
          onFormStateChange={handleFormStateChange}
        />
      )}

      {initialTab === 'mine' && (
        <MyContributions
          onEditContribution={handleEditContribution}
        />
      )}

      {initialTab === 'offers' && (
        <AllOffers />
      )}
    </div>
  )
}
