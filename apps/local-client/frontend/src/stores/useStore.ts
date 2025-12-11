import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // Theme
  darkMode: boolean
  toggleDarkMode: () => void

  // Selected PDL
  selectedPdl: string | null
  setSelectedPdl: (pdl: string | null) => void

  // Date range
  startDate: string
  endDate: string
  setDateRange: (start: string, end: string) => void

  // Period type
  periodType: 'day' | 'week' | 'month' | 'year'
  setPeriodType: (type: 'day' | 'week' | 'month' | 'year') => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Theme - default to dark mode (like gateway)
      darkMode: true,
      toggleDarkMode: () => set((state) => {
        const newDarkMode = !state.darkMode
        if (newDarkMode) {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { darkMode: newDarkMode }
      }),

      // Selected PDL
      selectedPdl: null,
      setSelectedPdl: (pdl) => set({ selectedPdl: pdl }),

      // Date range - default to last 7 days
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      setDateRange: (start, end) => set({ startDate: start, endDate: end }),

      // Period type
      periodType: 'week',
      setPeriodType: (type) => set({ periodType: type }),
    }),
    {
      name: 'myelectricaldata-local-storage',
      partialize: (state) => ({
        darkMode: state.darkMode,
        selectedPdl: state.selectedPdl,
        periodType: state.periodType,
      }),
    }
  )
)

// Initialize dark mode on load
if (useStore.getState().darkMode) {
  document.documentElement.classList.add('dark')
}
