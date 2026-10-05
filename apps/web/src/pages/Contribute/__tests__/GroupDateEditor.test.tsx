import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { EnergyOffer } from '@/api/energy'
import { GroupDateEditor } from '../components/alloffers/OfferGroupCard'
import { mockOffers } from './test-helpers'

const offers = [mockOffers[0]] as unknown as EnergyOffer[]
const id = offers[0].id

const renderEditor = (editedOffers: Record<string, Record<string, string>>, groupValidTo: string | null = null) =>
  render(
    <GroupDateEditor
      offersInGroup={offers}
      groupValidFrom="2025-01-01T00:00:00"
      groupValidTo={groupValidTo}
      editedOffers={editedOffers}
      setEditedOffers={vi.fn()}
    />
  )

describe('GroupDateEditor', () => {
  it('affiche la date du groupe sans badge quand rien n\'est modifié', () => {
    renderEditor({})
    expect(screen.getByTitle('Date de début de validité')).toHaveValue('2025-01-01')
    expect(screen.queryByText('Date modifiée')).not.toBeInTheDocument()
  })

  // Date posée hors du champ (import IA) : le champ doit montrer ce qui sera soumis
  it('affiche la date modifiée hors du champ et le badge', () => {
    renderEditor({ [id]: { valid_from: '2026-02-01' } })
    expect(screen.getByTitle('Date de début de validité')).toHaveValue('2026-02-01')
    expect(screen.getByText('Date modifiée')).toBeInTheDocument()
  })

  it('signale une offre réactivée quand la date de fin est effacée', () => {
    renderEditor({ [id]: { valid_to: '' } }, '2025-12-31T00:00:00')
    expect(screen.getByText('Réactivée')).toBeInTheDocument()
  })

  it('propose d\'effacer la date de fin quand elle existe', () => {
    renderEditor({}, '2025-12-31T00:00:00')
    expect(screen.getByTitle('Effacer la date de fin (offre active)')).toBeInTheDocument()
  })
})
