import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Information about impersonating another user's PDL (admin feature)
interface ImpersonationInfo {
  ownerId: string
  ownerEmail: string
}

interface PdlStore {
  selectedPdl: string
  // When viewing a shared PDL, this contains the owner's info
  impersonation: ImpersonationInfo | null
  setSelectedPdl: (pdl: string, impersonation?: ImpersonationInfo | null) => void
  clearImpersonation: () => void
  isImpersonating: () => boolean
}

export const usePdlStore = create<PdlStore>()(
  persist(
    (set, get) => ({
      selectedPdl: '',
      impersonation: null,
      setSelectedPdl: (pdl: string, impersonation?: ImpersonationInfo | null) =>
        set({ selectedPdl: pdl, impersonation: impersonation ?? null }),
      clearImpersonation: () => set({ impersonation: null }),
      isImpersonating: () => get().impersonation !== null,
    }),
    {
      name: 'pdl-storage', // Clé localStorage
    }
  )
)
