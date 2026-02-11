import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ValidityPeriodManager from '../components/ValidityPeriodManager'
import { renderWithProviders } from './test-helpers'
import { type ValidityPeriod } from '../types'

// Mock du SingleDatePicker (évite la dépendance à react-day-picker)
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

describe('ValidityPeriodManager', () => {
  const defaultProps = {
    periods: [] as ValidityPeriod[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onUpdate: vi.fn(),
  }

  it('affiche un message quand aucune période n\'est ajoutée', () => {
    renderWithProviders(<ValidityPeriodManager {...defaultProps} />)

    expect(screen.getByText(/Aucune période ajoutée/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ajouter une période/ })).toBeInTheDocument()
  })

  it('appelle onAdd quand on clique sur "Ajouter une période"', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} onAdd={onAdd} />
    )

    await user.click(screen.getByText('Ajouter une période'))
    expect(onAdd).toHaveBeenCalledTimes(1)

    // Vérifie la structure de la période ajoutée
    const addedPeriod = onAdd.mock.calls[0][0]
    expect(addedPeriod).toHaveProperty('id')
    expect(addedPeriod).toHaveProperty('validFrom')
    expect(addedPeriod.validTo).toBe('')
  })

  it('affiche les périodes passées en props', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '2025-06-30' },
      { id: 'p2', validFrom: '2025-07-01', validTo: '' },
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    // Vérifie que le résumé affiche le bon nombre
    expect(screen.getByText(/2 périodes configurées/)).toBeInTheDocument()
    expect(screen.getByText(/2 contributions seront créées/)).toBeInTheDocument()
  })

  it('affiche le badge "Offre active" pour une période sans date de fin', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '' },
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    expect(screen.getByText('Offre active')).toBeInTheDocument()
  })

  it('appelle onRemove quand on clique sur le bouton supprimer', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '' },
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} onRemove={onRemove} />
    )

    // Le bouton supprimer a le titre "Supprimer cette période"
    await user.click(screen.getByTitle('Supprimer cette période'))
    expect(onRemove).toHaveBeenCalledWith('p1')
  })

  it('détecte et affiche les chevauchements de périodes', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '2025-06-30' },
      { id: 'p2', validFrom: '2025-03-01', validTo: '2025-09-30' }, // Chevauche p1
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    expect(screen.getByText(/Périodes qui se chevauchent détectées/)).toBeInTheDocument()
    // Les deux périodes doivent avoir le badge de chevauchement
    const badges = screen.getAllByText('Chevauchement détecté')
    expect(badges).toHaveLength(2)
  })

  it('ne détecte pas de chevauchement pour des périodes distinctes', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '2025-06-30' },
      { id: 'p2', validFrom: '2025-07-01', validTo: '2025-12-31' },
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    expect(screen.queryByText(/Périodes qui se chevauchent/)).not.toBeInTheDocument()
    expect(screen.queryByText('Chevauchement détecté')).not.toBeInTheDocument()
  })

  it('détecte le chevauchement quand une période active (sans fin) est présente', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '' }, // Offre active = fin infinie
      { id: 'p2', validFrom: '2025-07-01', validTo: '2025-12-31' }, // Chevauche car p1 n'a pas de fin
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    expect(screen.getByText(/Périodes qui se chevauchent détectées/)).toBeInTheDocument()
  })

  it('affiche le résumé avec le nombre de chevauchements', () => {
    const periods: ValidityPeriod[] = [
      { id: 'p1', validFrom: '2025-01-01', validTo: '2025-06-30' },
      { id: 'p2', validFrom: '2025-03-01', validTo: '2025-09-30' },
      { id: 'p3', validFrom: '2025-10-01', validTo: '' },
    ]

    renderWithProviders(
      <ValidityPeriodManager {...defaultProps} periods={periods} />
    )

    expect(screen.getByText(/3 périodes configurées/)).toBeInTheDocument()
    expect(screen.getByText(/2 périodes en chevauchement/)).toBeInTheDocument()
  })
})
