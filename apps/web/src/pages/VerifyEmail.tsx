import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// Window.__ENV__ is declared globally in vite-env.d.ts

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  // Use runtime config first, then build-time env, then default
  // Remove trailing slash to avoid double slashes in URLs
  const rawApiBaseUrl = window.__ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api'
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '')

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setStatus('error')
      setMessage('Token de vérification manquant')
      return
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/accounts/verify-email?token=${token}`)
        const data = await response.json()

        if (data.success) {
          setStatus('success')
          setMessage(data.data.message)
          setTimeout(() => navigate('/login'), 3000)
        } else {
          setStatus('error')
          setMessage(data.error.message)
        }
      } catch (error) {
        setStatus('error')
        setMessage('Erreur lors de la vérification')
      }
    }

    verifyEmail()
  }, [searchParams, navigate, apiBaseUrl])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center">
          {status === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Vérification en cours...</h2>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="rounded-full h-16 w-16 bg-green-100 mx-auto mb-4 flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Email vérifié !</h2>
              <p className="text-gray-600 mb-4">{message}</p>
              <p className="text-sm text-gray-500">Redirection vers la page de connexion...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="rounded-full h-16 w-16 bg-red-100 mx-auto mb-4 flex items-center justify-center">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Erreur de vérification</h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <button
                onClick={() => navigate('/login')}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Retour à la connexion
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
