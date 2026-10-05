import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AnalysisPeriodSettings from '../AnalysisPeriodSettings'
import { useDatePreferencesStore } from '@/stores/datePreferencesStore'

/**
 * Section « Période d'analyse », partagée entre /settings (mode serveur)
 * et /preferences (mode client, PR #118).
 * Date figée au 6 octobre 2026 : la plage se termine la veille (5 octobre 2026).
 */
describe('AnalysisPeriodSettings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0, 0))
    useDatePreferencesStore.setState({ preset: 'tempo', customDate: { day: 1, month: 1 } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('propose les quatre périodes', () => {
    render(<AnalysisPeriodSettings />)

    expect(screen.getByRole('heading', { name: "Période d'analyse" })).toBeInTheDocument()
    for (const label of ['Année Tempo', 'Année glissante', 'Année calendaire', 'Date personnalisée']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it("affiche par défaut l'année Tempo et son conseil pour le simulateur", () => {
    render(<AnalysisPeriodSettings />)

    expect(screen.getByText('1 septembre 2026')).toBeInTheDocument()
    expect(screen.getByText('5 octobre 2026')).toBeInTheDocument()
    expect(screen.getByText(/Période recommandée pour le simulateur/)).toBeInTheDocument()
    expect(screen.queryByText('Date de début personnalisée :')).not.toBeInTheDocument()
  })

  it('enregistre la période choisie et met à jour l\'aperçu', () => {
    render(<AnalysisPeriodSettings />)

    fireEvent.click(screen.getByRole('button', { name: /Année calendaire/ }))

    expect(useDatePreferencesStore.getState().preset).toBe('calendar')
    expect(screen.getByText('1 janvier 2026')).toBeInTheDocument()
    expect(screen.queryByText(/Période recommandée pour le simulateur/)).not.toBeInTheDocument()
  })

  it('date personnalisée : facture à date anniversaire du 13 octobre', () => {
    render(<AnalysisPeriodSettings />)

    fireEvent.click(screen.getByRole('button', { name: /Date personnalisée/ }))
    expect(screen.getByText('Date de début personnalisée :')).toBeInTheDocument()

    const [daySelect, monthSelect] = screen.getAllByRole('combobox')
    fireEvent.change(daySelect, { target: { value: '13' } })
    fireEvent.change(monthSelect, { target: { value: '10' } })

    expect(useDatePreferencesStore.getState()).toMatchObject({
      preset: 'custom',
      customDate: { day: 13, month: 10 },
    })
    // Le 13 octobre 2026 n'est pas encore passé : la période démarre en 2025
    expect(screen.getByText('13 octobre 2025')).toBeInTheDocument()
    expect(screen.getByText('5 octobre 2026')).toBeInTheDocument()
  })
})
