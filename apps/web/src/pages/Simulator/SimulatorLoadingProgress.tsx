interface SimulatorLoadingProgressProps {
  isSimulating: boolean
  fetchProgress: { current: number; total: number; phase: string }
  simulationResult: any
  simulationError: string | null
}

export function SimulatorLoadingProgress({
  isSimulating,
  fetchProgress,
  simulationResult,
  simulationError,
}: SimulatorLoadingProgressProps) {
  const isFetchingData = isSimulating && fetchProgress.total > 0
  const isCalculating = isSimulating && fetchProgress.total === 0
  const isComplete = !isSimulating && (simulationResult || simulationError)

  return (
    <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col gap-6">
        {/* Data fetching progress */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Récupération des données de consommation (365 jours)
            </h3>
            <div className="flex items-center gap-2">
              {isComplete ? (
                simulationError ? (
                  <>
                    <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">
                      Erreur
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Terminé
                    </span>
                  </>
                )
              ) : isFetchingData ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary-600"></div>
                  <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                    {fetchProgress.current} / {fetchProgress.total} périodes
                  </span>
                </>
              ) : (
                <>
                  <div className="h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    En attente
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Progress bar for data fetching */}
          {isFetchingData && fetchProgress.total > 0 && (
            <>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-8 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-blue-500 transition-all duration-300 ease-out flex items-center justify-end pr-3"
                  style={{ width: `${(fetchProgress.current / fetchProgress.total) * 100}%` }}
                >
                  {fetchProgress.current > 0 && (
                    <span className="text-sm font-bold text-white drop-shadow">
                      {Math.round((fetchProgress.current / fetchProgress.total) * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Current phase */}
              {fetchProgress.phase && (
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                    {fetchProgress.phase}
                  </span>
                </p>
              )}
            </>
          )}

          <p className="text-sm text-gray-500 dark:text-gray-400">
            {simulationError ? (
              <span className="text-red-600 dark:text-red-400">{simulationError}</span>
            ) : isComplete ? (
              'Données récupérées avec succès depuis le cache ou l\'API Enedis'
            ) : isFetchingData ? (
              'Récupération par périodes de 7 jours avec cache React Query'
            ) : (
              'Préparation de la récupération des données...'
            )}
          </p>
        </div>

        {/* Simulation calculation progress */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Simulation des offres d'électricité
            </h3>
            <div className="flex items-center gap-2">
              {isComplete ? (
                simulationResult ? (
                  <>
                    <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Terminé
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">
                      Erreur
                    </span>
                  </>
                )
              ) : isCalculating || (!isFetchingData && isSimulating) ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    En cours...
                  </span>
                </>
              ) : (
                <>
                  <div className="h-5 w-5 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    En attente
                  </span>
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isComplete && simulationResult ? (
              `Simulation terminée : ${simulationResult.length} offres comparées`
            ) : isCalculating || (!isFetchingData && isSimulating) ? (
              'Calcul des coûts pour toutes les offres disponibles (BASE, HC/HP, TEMPO, etc.)'
            ) : (
              'Calcul en attente de la fin de la récupération des données'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
