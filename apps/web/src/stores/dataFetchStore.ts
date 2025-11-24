import { create } from 'zustand'

export type DataStatus = 'idle' | 'loading' | 'success' | 'error'

export interface LoadingStatus {
  consumption: {
    daily: DataStatus
    detail: DataStatus
    powerMax: DataStatus
    detailProgress?: { current: number; total: number }
  }
  production: {
    daily: DataStatus
    detail: DataStatus
    detailProgress?: { current: number; total: number }
  }
}

interface DataFetchStore {
  fetchDataFunction: (() => void) | null
  isLoading: boolean
  loadingStatus: LoadingStatus
  setFetchDataFunction: (fn: (() => void) | null) => void
  setIsLoading: (loading: boolean) => void
  setLoadingStatus: (status: LoadingStatus) => void
  updateConsumptionStatus: (status: Partial<LoadingStatus['consumption']>) => void
  updateProductionStatus: (status: Partial<LoadingStatus['production']>) => void
  resetLoadingStatus: () => void
  triggerFetch: () => void
}

const initialLoadingStatus: LoadingStatus = {
  consumption: {
    daily: 'idle',
    detail: 'idle',
    powerMax: 'idle',
  },
  production: {
    daily: 'idle',
    detail: 'idle',
  },
}

export const useDataFetchStore = create<DataFetchStore>((set, get) => ({
  fetchDataFunction: null,
  isLoading: false,
  loadingStatus: initialLoadingStatus,
  setFetchDataFunction: (fn) => set({ fetchDataFunction: fn }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setLoadingStatus: (status) => set({ loadingStatus: status }),
  updateConsumptionStatus: (status) => set((state) => ({
    loadingStatus: {
      ...state.loadingStatus,
      consumption: {
        ...state.loadingStatus.consumption,
        ...status,
      },
    },
  })),
  updateProductionStatus: (status) => set((state) => ({
    loadingStatus: {
      ...state.loadingStatus,
      production: {
        ...state.loadingStatus.production,
        ...status,
      },
    },
  })),
  resetLoadingStatus: () => set({ loadingStatus: initialLoadingStatus }),
  triggerFetch: () => {
    const { fetchDataFunction } = get()
    if (fetchDataFunction) {
      fetchDataFunction()
    }
  },
}))
