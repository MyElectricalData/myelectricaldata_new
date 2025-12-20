import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/api'
import { apiClient } from '@/api/client'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  setAuthenticated: (authenticated: boolean) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
      logout: async () => {
        try {
          // Call backend to clear httpOnly cookie
          await apiClient.post('accounts/logout')
        } catch {
          // Ignore errors - cookie will expire anyway
        }
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      // Only persist user data, not auth state (cookie handles that)
      partialize: (state) => ({ user: state.user }),
    }
  )
)
