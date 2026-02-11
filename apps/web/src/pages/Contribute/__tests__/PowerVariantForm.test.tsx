import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PowerVariantForm from '../components/forms/PowerVariantForm'
import { renderWithProviders } from './test-helpers'

describe('PowerVariantForm', () => {
  const defaultProps = {
    offerType: 'BASE',
    onAddVariant: vi.fn(),
    existingPowers: [] as number[],
  }

  describe('champs communs', () => {
    it('affiche la sélection de puissance et le prix abonnement', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} />)

      expect(screen.getByText(/Puissance \(kVA\)/)).toBeInTheDocument()
      expect(screen.getByText(/Prix abonnement/)).toBeInTheDocument()
    })

    it('propose les puissances 3-36 kVA', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} />)

      const select = screen.getByRole('combobox')
      const options = Array.from(select.querySelectorAll('option'))
      const values = options.map(o => o.value).filter(v => v !== '')

      expect(values).toEqual(['3', '6', '9', '12', '15', '18', '24', '30', '36'])
    })

    it('exclut les puissances déjà existantes', () => {
      renderWithProviders(
        <PowerVariantForm {...defaultProps} existingPowers={[6, 9]} />
      )

      const select = screen.getByRole('combobox')
      const options = Array.from(select.querySelectorAll('option'))
      const values = options.map(o => o.value).filter(v => v !== '')

      expect(values).not.toContain('6')
      expect(values).not.toContain('9')
      expect(values).toContain('3')
      expect(values).toContain('12')
    })

    it('le bouton est désactivé sans puissance ni abonnement', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} />)

      const button = screen.getByRole('button', { name: /Ajouter cette variante/ })
      expect(button).toBeDisabled()
    })
  })

  describe('type BASE', () => {
    it('affiche le champ Prix BASE', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="BASE" />)

      expect(screen.getByText(/Prix BASE/)).toBeInTheDocument()
    })

    it('ajoute une variante BASE complète', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="BASE" onAddVariant={onAddVariant} />
      )

      // Sélectionner puissance
      await user.selectOptions(screen.getByRole('combobox'), '6')

      // Remplir l'abonnement
      const aboInput = screen.getByPlaceholderText('12.34')
      await user.clear(aboInput)
      await user.type(aboInput, '12.34')

      // Remplir le prix base
      const baseInput = screen.getByPlaceholderText('0.2516')
      await user.clear(baseInput)
      await user.type(baseInput, '0.2516')

      // Soumettre
      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      expect(onAddVariant).toHaveBeenCalledTimes(1)
      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.power_kva).toBe(6)
      expect(variant.subscription_price).toBe(12.34)
      expect(variant.pricing_data?.base_price).toBe(0.2516)
    })
  })

  describe('type HC_HP', () => {
    it('affiche les champs HC et HP', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="HC_HP" />)

      expect(screen.getByText(/Prix HC/)).toBeInTheDocument()
      expect(screen.getByText(/Prix HP/)).toBeInTheDocument()
    })

    it('ajoute une variante HC_HP', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="HC_HP" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '9')
      await user.type(screen.getByPlaceholderText('12.34'), '15.67')
      await user.type(screen.getByPlaceholderText('0.2068'), '0.2068')
      await user.type(screen.getByPlaceholderText('0.2700'), '0.2700')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.power_kva).toBe(9)
      expect(variant.pricing_data?.hc_price).toBe(0.2068)
      expect(variant.pricing_data?.hp_price).toBe(0.27)
    })
  })

  describe('type TEMPO', () => {
    it('affiche les 6 champs Tempo (Bleu/Blanc/Rouge HC/HP)', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="TEMPO" />)

      expect(screen.getByText(/Bleu HC/)).toBeInTheDocument()
      expect(screen.getByText(/Bleu HP/)).toBeInTheDocument()
      expect(screen.getByText(/Blanc HC/)).toBeInTheDocument()
      expect(screen.getByText(/Blanc HP/)).toBeInTheDocument()
      expect(screen.getByText(/Rouge HC/)).toBeInTheDocument()
      expect(screen.getByText(/Rouge HP/)).toBeInTheDocument()
    })

    it('ajoute une variante TEMPO', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="TEMPO" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '6')
      await user.type(screen.getByPlaceholderText('12.34'), '10.00')
      await user.type(screen.getByPlaceholderText('0.1296'), '0.1296')
      await user.type(screen.getByPlaceholderText('0.1609'), '0.1609')
      await user.type(screen.getByPlaceholderText('0.1486'), '0.1486')
      await user.type(screen.getByPlaceholderText('0.1894'), '0.1894')
      await user.type(screen.getByPlaceholderText('0.1568'), '0.1568')
      await user.type(screen.getByPlaceholderText('0.7562'), '0.7562')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.pricing_data?.tempo_blue_hc).toBe(0.1296)
      expect(variant.pricing_data?.tempo_blue_hp).toBe(0.1609)
      expect(variant.pricing_data?.tempo_white_hc).toBe(0.1486)
      expect(variant.pricing_data?.tempo_white_hp).toBe(0.1894)
      expect(variant.pricing_data?.tempo_red_hc).toBe(0.1568)
      expect(variant.pricing_data?.tempo_red_hp).toBe(0.7562)
    })
  })

  describe('type EJP', () => {
    it('affiche les champs Normal et Pointe', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="EJP" />)

      expect(screen.getByText(/Prix Normal/)).toBeInTheDocument()
      expect(screen.getByText(/Prix Pointe/)).toBeInTheDocument()
    })

    it('ajoute une variante EJP', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="EJP" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '9')
      await user.type(screen.getByPlaceholderText('12.34'), '14.00')
      await user.type(screen.getByPlaceholderText('0.1658'), '0.1658')
      await user.type(screen.getByPlaceholderText('0.8488'), '0.8488')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.pricing_data?.ejp_normal).toBe(0.1658)
      expect(variant.pricing_data?.ejp_peak).toBe(0.8488)
    })
  })

  describe('type SEASONAL', () => {
    it('affiche les champs Hiver/Été et Jour de Pointe', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="SEASONAL" />)

      expect(screen.getByText(/HC Hiver/)).toBeInTheDocument()
      expect(screen.getByText(/HP Hiver/)).toBeInTheDocument()
      expect(screen.getByText(/HC Été/)).toBeInTheDocument()
      expect(screen.getByText(/HP Été/)).toBeInTheDocument()
      expect(screen.getByText(/Prix Jour de Pointe/)).toBeInTheDocument()
    })

    it('ajoute une variante SEASONAL', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="SEASONAL" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '6')
      await user.type(screen.getByPlaceholderText('12.34'), '11.00')
      await user.type(screen.getByPlaceholderText('0.31128'), '0.3113')
      await user.type(screen.getByPlaceholderText('0.22942'), '0.2294')
      await user.type(screen.getByPlaceholderText('0.19397'), '0.1940')
      await user.type(screen.getByPlaceholderText('0.13166'), '0.1317')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.pricing_data?.hc_price_winter).toBe(0.3113)
      expect(variant.pricing_data?.hp_price_winter).toBe(0.2294)
      expect(variant.pricing_data?.hc_price_summer).toBe(0.194)
      expect(variant.pricing_data?.hp_price_summer).toBe(0.1317)
    })
  })

  describe('type ZEN_FLEX', () => {
    it('affiche les champs Éco et Sobriété', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="ZEN_FLEX" />)

      expect(screen.getByText(/HC Éco/)).toBeInTheDocument()
      expect(screen.getByText(/HP Éco/)).toBeInTheDocument()
      expect(screen.getByText(/HC Sobriété/)).toBeInTheDocument()
      expect(screen.getByText(/HP Sobriété/)).toBeInTheDocument()
    })

    it('ajoute une variante ZEN_FLEX', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="ZEN_FLEX" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '6')
      await user.type(screen.getByPlaceholderText('12.34'), '12.00')

      // ZEN_FLEX a des placeholders dupliqués (0.2068 apparaît 2 fois)
      // On utilise getAllByRole('spinbutton') pour cibler par index
      const inputs = screen.getAllByRole('spinbutton')
      // inputs[0] = subscription (12.34), inputs[1] = HC Éco (0.1546), inputs[2] = HP Éco (0.2068)
      // inputs[3] = HC Sobriété (0.2068), inputs[4] = HP Sobriété (0.7562)
      await user.type(inputs[1], '0.1546')
      await user.type(inputs[2], '0.2068')
      await user.type(inputs[3], '0.2068')
      await user.type(inputs[4], '0.7562')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      const variant = onAddVariant.mock.calls[0][0]
      expect(variant.pricing_data?.hc_price_winter).toBe(0.1546)
    })
  })

  describe('type BASE_WEEKEND', () => {
    it('affiche les champs Base semaine et Base week-end', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="BASE_WEEKEND" />)

      expect(screen.getByText(/Prix BASE semaine/)).toBeInTheDocument()
      expect(screen.getByText(/Prix BASE week-end/)).toBeInTheDocument()
    })
  })

  describe('type HC_NUIT_WEEKEND et HC_WEEKEND', () => {
    it('affiche les champs HC/HP pour HC_NUIT_WEEKEND', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="HC_NUIT_WEEKEND" />)

      expect(screen.getByText(/Prix HC/)).toBeInTheDocument()
      expect(screen.getByText(/Prix HP/)).toBeInTheDocument()
    })

    it('affiche les champs HC/HP pour HC_WEEKEND', () => {
      renderWithProviders(<PowerVariantForm {...defaultProps} offerType="HC_WEEKEND" />)

      expect(screen.getByText(/Prix HC/)).toBeInTheDocument()
      expect(screen.getByText(/Prix HP/)).toBeInTheDocument()
    })
  })

  describe('reset du formulaire', () => {
    it('vide les champs après ajout d\'une variante', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="BASE" onAddVariant={onAddVariant} />
      )

      await user.selectOptions(screen.getByRole('combobox'), '6')
      await user.type(screen.getByPlaceholderText('12.34'), '12.34')
      await user.type(screen.getByPlaceholderText('0.2516'), '0.2516')

      await user.click(screen.getByRole('button', { name: /Ajouter cette variante/ }))

      // Après ajout, les champs sont réinitialisés
      expect(screen.getByRole('combobox')).toHaveValue('')
      expect(screen.getByPlaceholderText('12.34')).toHaveValue(null)
      expect(screen.getByPlaceholderText('0.2516')).toHaveValue(null)
    })
  })

  describe('validation', () => {
    it('ne soumet pas sans puissance', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="BASE" onAddVariant={onAddVariant} />
      )

      // Remplir seulement l'abonnement, pas la puissance
      await user.type(screen.getByPlaceholderText('12.34'), '12.34')

      const button = screen.getByRole('button', { name: /Ajouter cette variante/ })
      expect(button).toBeDisabled()
    })

    it('ne soumet pas sans abonnement', async () => {
      const user = userEvent.setup()
      const onAddVariant = vi.fn()

      renderWithProviders(
        <PowerVariantForm {...defaultProps} offerType="BASE" onAddVariant={onAddVariant} />
      )

      // Sélectionner seulement la puissance, pas l'abonnement
      await user.selectOptions(screen.getByRole('combobox'), '6')

      const button = screen.getByRole('button', { name: /Ajouter cette variante/ })
      expect(button).toBeDisabled()
    })
  })
})
