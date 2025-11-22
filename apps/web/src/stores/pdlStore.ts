import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PdlStore {
  selectedPdl: string
  setSelectedPdl: (pdl: string) => void
}

export const usePdlStore = create<PdlStore>()(
  persist(
    (set) => ({
      selectedPdl: '',
      setSelectedPdl: (pdl: string) => set({ selectedPdl: pdl }),
    }),
    {
      name: 'pdl-storage', // Clé localStorage
    }
  )
)
