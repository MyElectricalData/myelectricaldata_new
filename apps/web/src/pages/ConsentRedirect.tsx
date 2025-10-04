import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export default function ConsentRedirect() {
  const [searchParams] = useSearchParams()

  useEffect(() => {
    // Get all query parameters
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const usagePointId = searchParams.get('usage_point_id')

    // Build backend URL with all parameters
    // Use window.location.origin if API_BASE_URL is relative
    const baseUrl = API_BASE_URL.startsWith('/')
      ? `${window.location.origin}${API_BASE_URL}`
      : API_BASE_URL
    const backendUrl = new URL(`${baseUrl}/consent`)
    if (code) backendUrl.searchParams.set('code', code)
    if (state) backendUrl.searchParams.set('state', state)
    if (usagePointId) backendUrl.searchParams.set('usage_point_id', usagePointId)

    // Redirect to backend
    window.location.href = backendUrl.toString()
  }, [searchParams])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-lg mb-2">Traitement du consentement...</div>
        <div className="text-sm text-gray-500">Vous allez être redirigé</div>
      </div>
    </div>
  )
}
