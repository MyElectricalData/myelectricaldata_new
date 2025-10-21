import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Copy, Check, Eye, EyeOff } from 'lucide-react'
import { logger } from '@/utils/logger'

declare global {
  interface Window {
    turnstile?: {
      render: (element: string | HTMLElement, options: {
        sitekey: string
        callback: (token: string) => void
        'error-callback': () => void
        'expired-callback': () => void
      }) => string
      reset: (widgetId: string) => void
    }
  }
}

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ client_id: string; client_secret: string } | null>(null)
  const [copied, setCopied] = useState<'id' | 'secret' | null>(null)
  const { signup, signupLoading, signupError } = useAuth()

  const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const widgetRendered = useRef(false)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || widgetRendered.current) return

    const widgetId = 'turnstile-widget'
    const container = document.getElementById(widgetId)
    if (!container) return

    // Check if Turnstile script is already loaded
    const existingScript = document.querySelector('script[src*="turnstile"]')

    const renderWidget = () => {
      if (window.turnstile && container && !widgetRendered.current) {
        try {
          window.turnstile.render(`#${widgetId}`, {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => {
              logger.log('[TURNSTILE] Token received:', token.substring(0, 20) + '...')
              setTurnstileToken(token)
            },
            'error-callback': () => {
              console.error('[TURNSTILE] Error')
              setTurnstileToken(null)
            },
            'expired-callback': () => {
              logger.log('[TURNSTILE] Token expired')
              setTurnstileToken(null)
            },
          })
          widgetRendered.current = true
        } catch (error) {
          console.error('[TURNSTILE] Render error:', error)
        }
      }
    }

    if (existingScript && window.turnstile) {
      // Script already loaded, just render
      renderWidget()
    } else if (!existingScript) {
      // Load script first
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      script.onload = renderWidget
      document.head.appendChild(script)
    }
  }, [TURNSTILE_SITE_KEY])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      alert('Les mots de passe ne correspondent pas')
      return
    }
    signup({ email, password, turnstile_token: turnstileToken || undefined }, {
      onSuccess: (response) => {
        if (response.success && response.data) {
          setCredentials(response.data)
        }
      },
      onError: (error: any) => {
        console.error('[SIGNUP] Error:', error)
      }
    })
  }

  const copyToClipboard = (text: string, type: 'id' | 'secret') => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  if (credentials) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-2xl w-full">
          <div className="card">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mb-4">
                <Check className="text-green-600 dark:text-green-400" size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-2">Compte créé avec succès !</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Conservez précieusement vos identifiants API
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                  ⚠️ Important : Sauvegardez ces identifiants maintenant. Ils ne seront plus affichés.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Client ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={credentials.client_id}
                    readOnly
                    className="input flex-1"
                  />
                  <button
                    onClick={() => copyToClipboard(credentials.client_id, 'id')}
                    className="btn btn-secondary"
                    title="Copier"
                  >
                    {copied === 'id' ? <Check size={20} /> : <Copy size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Client Secret</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={credentials.client_secret}
                    readOnly
                    className="input flex-1"
                  />
                  <button
                    onClick={() => copyToClipboard(credentials.client_secret, 'secret')}
                    className="btn btn-secondary"
                    title="Copier"
                  >
                    {copied === 'secret' ? <Check size={20} /> : <Copy size={20} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link to="/login" className="btn btn-primary w-full">
                Continuer vers la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Créer un compte
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Obtenez vos identifiants API
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Minimum 8 caractères
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pr-10"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {TURNSTILE_SITE_KEY && <div id="turnstile-widget" className="flex justify-center"></div>}

            {signupError && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {(signupError as Error).message || 'Une erreur est survenue. Vérifiez vos informations.'}
              </div>
            )}

            <button
              type="submit"
              disabled={signupLoading}
              className="btn btn-primary w-full"
            >
              {signupLoading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <p className="text-gray-600 dark:text-gray-400">
              Déjà un compte ?{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline">
                Se connecter
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-gray-600 dark:text-gray-400 hover:underline">
            ← Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  )
}
