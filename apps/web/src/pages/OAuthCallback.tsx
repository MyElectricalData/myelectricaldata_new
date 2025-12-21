import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle } from 'lucide-react'
import { logger } from '@/utils/logger'

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

// Global flag to track redirect across component remounts (persists until page reload)
declare global {
  interface Window {
    __OAUTH_REDIRECTING__?: boolean
  }
}

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const consentError = searchParams.get('consent_error')
    const usagePointId = searchParams.get('usage_point_id')
    const code = searchParams.get('code')

    logger.log('[OAuthCallback] useEffect triggered, params:', { success, error, consentError, code }, 'redirecting:', window.__OAUTH_REDIRECTING__)

    if (success === 'true') {
      // Backend already processed - show success
      setStatus('success')
      setMessage(usagePointId ? `PDL ${usagePointId} configuré avec succès` : 'Consentement validé')
      // Force immediate refresh of PDL cache (refetchQueries ignores staleTime)
      queryClient.refetchQueries({ queryKey: ['pdls'] })
      setTimeout(() => navigate('/dashboard'), 3000)
    } else if (error || consentError) {
      // Error from backend
      setStatus('error')
      const errorMsg = error || consentError
      const pdl = searchParams.get('pdl')

      // Translate error codes to user-friendly messages
      let friendlyMessage = 'Une erreur est survenue'
      if (errorMsg === 'user_not_found') {
        friendlyMessage = 'Utilisateur non trouvé. Veuillez vous reconnecter.'
      } else if (errorMsg === 'pdl_already_exists') {
        friendlyMessage = pdl
          ? `Le point de livraison ${pdl} est déjà associé à un compte. Contactez l'administrateur si vous pensez qu'il s'agit d'une erreur.`
          : 'Ce point de livraison est déjà associé à un compte.'
      } else if (errorMsg === 'invalid_pdl_format') {
        friendlyMessage = pdl
          ? `Le numéro PDL "${pdl}" n'est pas valide. Enedis a transmis un identifiant incorrect. Veuillez réessayer ou contacter le support.`
          : 'Le numéro PDL reçu d\'Enedis n\'est pas valide. Veuillez réessayer ou contacter le support.'
      } else if (errorMsg === 'no_usage_point_id') {
        friendlyMessage = 'Aucun point de livraison fourni par Enedis. Veuillez réessayer le consentement.'
      } else if (errorMsg) {
        friendlyMessage = errorMsg
      }

      setMessage(friendlyMessage)
    } else if (code) {
      // Raw OAuth callback from Enedis - need to forward to backend
      // Check global flag to prevent double execution (survives component remount)
      if (window.__OAUTH_REDIRECTING__) {
        logger.log('[OAuthCallback] Already redirecting (global flag), skipping')
        return
      }
      window.__OAUTH_REDIRECTING__ = true

      const state = searchParams.get('state')
      logger.log('[OAuthCallback] Redirecting to backend, setting global flag...')

      // Build backend URL and redirect to process the consent
      const baseUrl = API_BASE_URL.startsWith('/')
        ? `${window.location.origin}${API_BASE_URL}`
        : API_BASE_URL
      const backendUrl = new URL(`${baseUrl}/oauth/callback`)
      backendUrl.searchParams.set('code', code)
      if (state) backendUrl.searchParams.set('state', state)
      if (usagePointId) backendUrl.searchParams.set('usage_point_id', usagePointId)

      // Note: The httpOnly cookie will be sent automatically with the redirect
      // No need to pass access_token in URL (more secure)

      // Use replace to prevent browser back button from returning here
      window.location.replace(backendUrl.toString())
    } else {
      setStatus('error')
      setMessage('Paramètres de callback invalides')
    }
  }, [searchParams, navigate, queryClient])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full px-4">
        <div className="card text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold mb-2">Traitement du consentement</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Veuillez patienter...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="text-green-600 dark:text-green-400 mx-auto mb-4" size={64} />
              <h2 className="text-xl font-semibold mb-2 text-green-600 dark:text-green-400">
                Consentement validé !
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {message || 'Votre accès aux données Enedis a été configuré avec succès.'}
              </p>
              <p className="text-sm text-gray-500">
                Redirection vers le tableau de bord...
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="text-red-600 dark:text-red-400 mx-auto mb-4" size={64} />
              <h2 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400">
                Erreur de consentement
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {message || 'Une erreur est survenue lors de la validation de votre consentement Enedis.'}
              </p>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn btn-primary w-full"
              >
                Retour au tableau de bord
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
