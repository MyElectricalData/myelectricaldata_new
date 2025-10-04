import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/api/auth'
import { Mail, CheckCircle } from 'lucide-react'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)

  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await authApi.forgotPassword(email)
      if (!response.success) {
        throw new Error(response.error?.message || 'An error occurred')
      }
      return response
    },
    onSuccess: () => {
      setSuccess(true)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    forgotPasswordMutation.mutate(email)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="card text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mb-4 mx-auto">
              <CheckCircle className="text-green-600 dark:text-green-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold mb-2">Email envoyé !</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Si un compte existe avec cette adresse email, vous recevrez un lien de réinitialisation dans quelques instants.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Vérifiez votre boîte de réception et vos spams.
            </p>
            <Link to="/login" className="btn btn-primary w-full">
              Retour à la connexion
            </Link>
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
            Mot de passe oublié
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Entrez votre email pour réinitialiser votre mot de passe
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="votre@email.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {forgotPasswordMutation.error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {(forgotPasswordMutation.error as Error).message || 'Une erreur est survenue'}
              </div>
            )}

            <button
              type="submit"
              disabled={forgotPasswordMutation.isPending}
              className="btn btn-primary w-full"
            >
              {forgotPasswordMutation.isPending ? 'Envoi en cours...' : 'Envoyer le lien'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline">
              ← Retour à la connexion
            </Link>
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
