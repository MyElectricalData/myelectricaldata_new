import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildBackendCallbackUrl } from '@/utils/oauthCallback'

// Window.__ENV__ is declared globally in vite-env.d.ts
// Use runtime config first, then build-time env, then default
// Remove trailing slash to avoid double slashes in URLs
const rawApiBaseUrl = window.__ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'
const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '')

export default function ConsentRedirect() {
  const [searchParams] = useSearchParams()
  const hasRedirected = useRef(false)

  useEffect(() => {
    // Prevent double execution in React 18 StrictMode
    if (hasRedirected.current) return
    hasRedirected.current = true

    // Relaie tous les paramètres Enedis (v1 : code + usage_point_id, v2 : autorisation_id sans code)
    const backendUrl = buildBackendCallbackUrl(searchParams, API_BASE_URL, window.location.origin)

    // Note: The httpOnly cookie will be sent automatically with the redirect
    // No need to pass access_token in URL (more secure)

    // Redirect to backend
    window.location.href = backendUrl
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
