import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { setDebugMode } from '@/utils/logger'
import type { UserCreate, UserLogin } from '@/types/api'

export const useAuth = () => {
  const queryClient = useQueryClient()
  const { setUser, setToken, logout: logoutStore } = useAuthStore()

  const { data: user, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await authApi.getMe()
      if (response.success && response.data) {
        setUser(response.data)
        // Update debug mode based on user settings
        setDebugMode(response.data.debug_mode || false)
        return response.data
      }
      return null
    },
    enabled: !!localStorage.getItem('access_token'),
  })

  const loginMutation = useMutation({
    mutationFn: async (data: UserLogin) => {
      const response = await authApi.login(data)
      if (!response.success) {
        throw new Error(response.error?.message || 'Login failed')
      }
      return response
    },
    onSuccess: (response) => {
      if (response.success && response.data) {
        setToken(response.data.access_token)
        queryClient.invalidateQueries({ queryKey: ['user'] })
      }
    },
  })

  const signupMutation = useMutation({
    mutationFn: async (data: UserCreate) => {
      const response = await authApi.signup(data)
      if (!response.success) {
        throw new Error(response.error?.message || 'Signup failed')
      }
      return response
    },
  })

  const logout = () => {
    logoutStore()
    queryClient.clear()
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutate,
    signup: signupMutation.mutate,
    logout,
    loginLoading: loginMutation.isPending,
    signupLoading: signupMutation.isPending,
    loginError: loginMutation.error,
    signupError: signupMutation.error,
  }
}
