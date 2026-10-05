import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { EnergyOffer } from '@/api/energy'
import OfferRow from '../components/alloffers/OfferRow'
import type { AllOffersState } from '../hooks/useAllOffersState'
import { mockOffers } from './test-helpers'

const offer = mockOffers[0] as unknown as EnergyOffer

// Seuls les champs lus par OfferRow
const editState = {
  isEditMode: true,
  editedOffers: {},
  powersToRemove: [],
  setPowersToRemove: vi.fn(),
  duplicateDropdownId: null,
  setDuplicateDropdownId: vi.fn(),
  isOfferModified: () => false,
  updateField: vi.fn(),
  duplicateOfferFields: vi.fn(),
} as unknown as AllOffersState

describe('OfferRow', () => {
  it('propose suppression et duplication en mode édition', () => {
    render(<OfferRow offer={offer} groupName="Tarif Bleu" offersInGroup={[offer]} state={editState} />)
    expect(screen.getByTitle('Proposer la suppression de cette puissance')).toBeInTheDocument()
    expect(screen.getByTitle('Dupliquer les tarifs')).toBeInTheDocument()
  })

  it("n'affiche aucune action sur une offre expirée (hideActions)", () => {
    render(<OfferRow offer={offer} groupName="Tarif Bleu" offersInGroup={[offer]} state={editState} hideActions />)
    expect(screen.queryByTitle('Proposer la suppression de cette puissance')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Dupliquer les tarifs')).not.toBeInTheDocument()
  })
})
