import { Link } from 'react-router-dom'
import { Home, AlertCircle } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <AlertCircle className="mx-auto h-24 w-24 text-gray-400 dark:text-gray-600" />
        </div>

        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">
          404
        </h1>

        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
          Page non trouvée
        </h2>

        <p className="text-gray-600 dark:text-gray-400 mb-8">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
        >
          <Home size={20} />
          Retour à l'accueil
        </Link>
      </div>
    </div>
  )
}
