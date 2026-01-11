import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Information about impersonating another user's PDL (admin feature)
interface ImpersonationInfo {
  ownerId: string
  ownerEmail: string
}

// Offre de référence temporaire pour les PDL partagés (admin feature)
// Permet de définir une offre "actuelle" sans modifier les données du propriétaire
interface ReferenceOffer {
  offerId: string
  offerName: string
}

interface PdlStore {
  selectedPdl: string
  // When viewing a shared PDL, this contains the owner's info
  impersonation: ImpersonationInfo | null
  // Offres de référence temporaires par PDL (pour les PDL partagés)
  // Clé: usage_point_id, Valeur: offre de référence
  referenceOffers: Record<string, ReferenceOffer>
  setSelectedPdl: (pdl: string, impersonation?: ImpersonationInfo | null) => void
  clearImpersonation: () => void
  isImpersonating: () => boolean
  // Gestion des offres de référence
  setReferenceOffer: (usagePointId: string, offer: ReferenceOffer | null) => void
  getReferenceOffer: (usagePointId: string) => ReferenceOffer | null
  clearReferenceOffer: (usagePointId: string) => void
}

export const usePdlStore = create<PdlStore>()(
  persist(
    (set, get) => ({
      selectedPdl: '',
      impersonation: null,
      referenceOffers: {},
      setSelectedPdl: (pdl: string, impersonation?: ImpersonationInfo | null) =>
        set({ selectedPdl: pdl, impersonation: impersonation ?? null }),
      clearImpersonation: () => set({ impersonation: null }),
      isImpersonating: () => get().impersonation !== null,
      // Définir une offre de référence pour un PDL partagé
      setReferenceOffer: (usagePointId: string, offer: ReferenceOffer | null) =>
        set((state) => {
          const newReferenceOffers = { ...state.referenceOffers }
          if (offer) {
            newReferenceOffers[usagePointId] = offer
          } else {
            delete newReferenceOffers[usagePointId]
          }
          return { referenceOffers: newReferenceOffers }
        }),
      // Récupérer l'offre de référence pour un PDL
      getReferenceOffer: (usagePointId: string) =>
        get().referenceOffers[usagePointId] || null,
      // Supprimer l'offre de référence pour un PDL
      clearReferenceOffer: (usagePointId: string) =>
        set((state) => {
          const newReferenceOffers = { ...state.referenceOffers }
          delete newReferenceOffers[usagePointId]
          return { referenceOffers: newReferenceOffers }
        }),
    }),
    {
      name: 'pdl-storage', // Clé localStorage
    }
  )
)
