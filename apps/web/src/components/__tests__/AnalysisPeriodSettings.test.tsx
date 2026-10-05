import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AnalysisPeriodSettings from '../AnalysisPeriodSettings'
import { useDatePreferencesStore } from '@/stores/datePreferencesStore'
import { useAppMode } from '@/hooks/useAppMode'

vi.mock('@/hooks/useAppMode', () => ({ useAppMode: vi.fn() }))

const setMode = (mode: 'client' | 'server') => {
  vi.mocked(useAppMode).mockReturnValue({
    mode,
    isClientMode: mode === 'client',
    isServerMode: mode === 'server',
  })
}

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
    setMode('client')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('propose les quatre périodes, la période active étant signalée', () => {
    render(<AnalysisPeriodSettings />)

    expect(screen.getByRole('heading', { name: "Période d'analyse" })).toBeInTheDocument()
    for (const label of ['Année Tempo', 'Année glissante', 'Année calendaire', 'Date personnalisée']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /Année Tempo/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Année glissante/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it("affiche par défaut l'année Tempo, sans conseil simulateur en mode client", () => {
    render(<AnalysisPeriodSettings />)

    expect(screen.getByText('1 septembre 2026')).toBeInTheDocument()
    expect(screen.getByText('5 octobre 2026')).toBeInTheDocument()
    expect(screen.queryByText(/Période recommandée pour le simulateur/)).not.toBeInTheDocument()
    expect(screen.queryByText('Date de début personnalisée :')).not.toBeInTheDocument()
  })

  it("mode serveur : conseil simulateur affiché pour l'année Tempo", () => {
    setMode('server')
    render(<AnalysisPeriodSettings />)

    expect(screen.getByText(/Période recommandée pour le simulateur/)).toBeInTheDocument()
  })

  it("enregistre la période choisie et met à jour l'aperçu", () => {
    setMode('server')
    render(<AnalysisPeriodSettings />)

    fireEvent.click(screen.getByRole('button', { name: /Année calendaire/ }))

    expect(useDatePreferencesStore.getState().preset).toBe('calendar')
    expect(screen.getByRole('button', { name: /Année calendaire/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 janvier 2026')).toBeInTheDocument()
    expect(screen.queryByText(/Période recommandée pour le simulateur/)).not.toBeInTheDocument()
  })

  it('date personnalisée : facture à date anniversaire du 13 octobre', () => {
    render(<AnalysisPeriodSettings />)

    fireEvent.click(screen.getByRole('button', { name: /Date personnalisée/ }))
    expect(screen.getByText('Date de début personnalisée :')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Jour/), { target: { value: '13' } })
    fireEvent.change(screen.getByLabelText(/Mois/), { target: { value: '10' } })

    expect(useDatePreferencesStore.getState()).toMatchObject({
      preset: 'custom',
      customDate: { day: 13, month: 10 },
    })
    // Le 13 octobre 2026 n'est pas encore passé : la période démarre en 2025
    expect(screen.getByText('13 octobre 2025')).toBeInTheDocument()
    expect(screen.getByText('5 octobre 2026')).toBeInTheDocument()
  })

  it('date personnalisée : jours limités au mois, jour ramené au changement de mois', () => {
    useDatePreferencesStore.setState({ preset: 'custom', customDate: { day: 31, month: 1 } })
    render(<AnalysisPeriodSettings />)

    const daySelect = screen.getByLabelText(/Jour/) as HTMLSelectElement
    expect(daySelect.options).toHaveLength(31)

    fireEvent.change(screen.getByLabelText(/Mois/), { target: { value: '9' } })

    expect(useDatePreferencesStore.getState().customDate).toEqual({ day: 30, month: 9 })
    expect((screen.getByLabelText(/Jour/) as HTMLSelectElement).options).toHaveLength(30)
    // Plus de période de 5 jours partant du « 31 septembre » (= 1er octobre)
    expect(screen.getByText('30 septembre 2026')).toBeInTheDocument()
  })
})
