import { Info } from 'lucide-react'

interface InfoBlockProps {
  isExpanded: boolean
  onToggle: () => void
}

export function InfoBlock({ isExpanded, onToggle }: InfoBlockProps) {
  return (
    <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 transition-colors duration-200">
      {/* Collapsible Header */}
      <div
        className="flex items-center justify-between p-6 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Info className="text-primary-600 dark:text-primary-400" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Informations importantes
          </h3>
        </div>
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          {isExpanded ? (
            <span className="text-sm">Reduire</span>
          ) : (
            <span className="text-sm">Developper</span>
          )}
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Cache Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>💾 Cache automatique :</strong> L'utilisation de cette page entraîne un stockage temporaire de vos données de consommation dans le cache de la passerelle. Ces données sont chiffrées et expirent automatiquement après <strong>24 heures</strong>.
            </p>
          </div>

          {/* Self-Consumption Information */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="text-sm text-green-800 dark:text-green-200 space-y-2">
              <p>
                <strong>🌱 A propos du taux d'autoconsommation :</strong>
              </p>
              <p>
                Le taux d'autoconsommation est calcule precisement a partir des donnees 30 minutes. Il represente la part de votre production solaire que vous consommez directement, sans passer par le reseau.
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Formule : Autoconsommation = min(Production, Consommation) / Production x 100
              </p>
            </div>
          </div>

          {/* Data Source Information */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <p>
                <strong>📊 Source des donnees :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Consommation et production issues de l'API <strong>Enedis Data Connect</strong></li>
                <li>Les donnees detaillees (30 min) permettent un calcul precis de l'autoconsommation</li>
                <li>Les donnees Enedis ne sont disponibles qu'en <strong>J-1</strong> (hier)</li>
                <li>Le bilan net = Production - Consommation (negatif = deficit)</li>
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
