import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    const usagePointId = searchParams.get('usage_point_id')

    if (success === 'true') {
      setStatus('success')
      setMessage(usagePointId ? `PDL ${usagePointId} configuré avec succès` : 'Consentement validé')
      setTimeout(() => navigate('/dashboard'), 3000)
    } else if (error) {
      setStatus('error')
      setMessage(error === 'user_not_found' ? 'Utilisateur non trouvé' : 'Une erreur est survenue')
    } else {
      // Fallback: Ancienne méthode avec code/state
      const code = searchParams.get('code')
      const state = searchParams.get('state')

      if (code && state) {
        // Redirection vers l'ancienne URL callback si nécessaire
        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 3000)
      } else {
        setStatus('error')
        setMessage('Paramètres de callback invalides')
      }
    }
  }, [searchParams, navigate])

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
