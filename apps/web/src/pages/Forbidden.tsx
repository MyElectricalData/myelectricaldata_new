import { Link } from 'react-router-dom'
import { Home, ShieldAlert } from 'lucide-react'

export default function Forbidden() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <ShieldAlert className="mx-auto h-24 w-24 text-red-400 dark:text-red-600" />
        </div>

        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">
          403
        </h1>

        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Accès refusé
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Vous n'avez pas les permissions nécessaires pour accéder à cette page.
        </p>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
        >
          <Home size={20} />
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  )
}
