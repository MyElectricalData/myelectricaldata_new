import { AlertCircle } from 'lucide-react'

export function InfoBlock() {
  return (
    <div className="card mt-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-2">Informations</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Les données sont récupérées depuis l'API Enedis Data Connect</li>
              <li>L'endpoint utilisé est <code className="bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">consumption/daily</code> (relevés quotidiens)</li>
              <li>Les données sont mises en cache pour optimiser les performances</li>
              <li>Récupération automatique de 1095 jours d'historique (limite maximale Enedis)</li>
              <li>Les données Enedis ne sont disponibles qu'en J-1 (hier)</li>
            </ul>

            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
              <p className="text-sm">
                <strong>⚠️ Information importante :</strong> L'utilisation de la page de consommation active automatiquement le cache. Vos données de consommation seront stockées temporairement sur la passerelle pour améliorer les performances et éviter de solliciter excessivement l'API Enedis. Les données en cache expirent automatiquement après 24 heures.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
