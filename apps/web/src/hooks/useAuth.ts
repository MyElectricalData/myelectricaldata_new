import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/authStore'
import { setDebugMode } from '@/utils/logger'
import type { UserCreate, UserLogin } from '@/types/api'

export const useAuth = () => {
  const queryClient = useQueryClient()
  const { user: storedUser, setUser, setAuthenticated, logout: logoutStore } = useAuthStore()

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await authApi.getMe()
      if (response.success && response.data) {
        setUser(response.data)
        setAuthenticated(true)
        // Update debug mode based on user settings
        const debugMode = response.data.debug_mode || false
        setDebugMode(debugMode)
        return response.data
      }
      // Not authenticated - clear state
      setAuthenticated(false)
      return null
    },
    // Always try to fetch - the httpOnly cookie will be sent automatically
    // If not authenticated, the request will fail with 401
    retry: false,
    // Refetch on window focus to check if session is still valid
    refetchOnWindowFocus: true,
  })

  const loginMutation = useMutation({
    mutationFn: async (data: UserLogin) => {
      const response = await authApi.login(data)
      if (!response.success) {
        throw new Error(response.error?.message || 'Login failed')
      }
      return response
    },
    onSuccess: () => {
      // Cookie is set by the server, just refresh user data
      setAuthenticated(true)
      queryClient.invalidateQueries({ queryKey: ['user'] })
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

  const logout = async () => {
    await logoutStore()
    queryClient.clear()
  }

  return {
    user,
    isLoading,
    // Authenticated if we have user data, or if we have stored user and query is still loading
    // isError means the cookie check failed (401), so not authenticated
    isAuthenticated: !!user || (!!storedUser && isLoading && !isError),
    login: loginMutation.mutate,
    signup: signupMutation.mutate,
    logout,
    loginLoading: loginMutation.isPending,
    signupLoading: signupMutation.isPending,
    loginError: loginMutation.error,
    signupError: signupMutation.error,
  }
}
