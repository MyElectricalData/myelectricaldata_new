import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

// Runtime environment from env.js (generated at container startup)
declare global {
  interface Window {
    __ENV__?: {
      VITE_API_BASE_URL?: string
      VITE_BACKEND_URL?: string
    }
  }
}

// Use runtime config first, then build-time env, then default
const API_BASE_URL = window.__ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'

export default function ConsentRedirect() {
  const [searchParams] = useSearchParams()
  const hasRedirected = useRef(false)

  useEffect(() => {
    // Prevent double execution in React 18 StrictMode
    if (hasRedirected.current) return
    hasRedirected.current = true

    // Get all query parameters
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const usagePointId = searchParams.get('usage_point_id')

    // Build backend URL with all parameters
    // Use window.location.origin if API_BASE_URL is relative
    const baseUrl = API_BASE_URL.startsWith('/')
      ? `${window.location.origin}${API_BASE_URL}`
      : API_BASE_URL
    const backendUrl = new URL(`${baseUrl}/oauth/callback`)
    if (code) backendUrl.searchParams.set('code', code)
    if (state) backendUrl.searchParams.set('state', state)
    if (usagePointId) backendUrl.searchParams.set('usage_point_id', usagePointId)

    // Include access_token for backend to identify the user
    const accessToken = localStorage.getItem('access_token')
    if (accessToken) {
      backendUrl.searchParams.set('access_token', accessToken)
    }

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
