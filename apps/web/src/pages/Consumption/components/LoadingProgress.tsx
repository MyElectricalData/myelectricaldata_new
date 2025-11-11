import { useState, useEffect } from 'react'
import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import type { LoadingProgressProps } from '../types/consumption.types'

interface ExtendedLoadingProgressProps extends LoadingProgressProps {
  dateRange: any
  allLoadingComplete: boolean
  isLoadingConsumption: boolean
  isLoadingPower: boolean
  consumptionResponse: any
  maxPowerResponse: any
}

export function LoadingProgress({
  isLoadingDetailed,
  dailyLoadingComplete,
  powerLoadingComplete,
  loadingProgress,
  hcHpCalculationComplete,
  allLoadingComplete,
  dateRange,
  isLoadingConsumption,
  isLoadingPower,
  consumptionResponse,
  maxPowerResponse
}: ExtendedLoadingProgressProps) {
  const [isProgressExpanded, setIsProgressExpanded] = useState(false)

  // Auto-expand when loading starts
  useEffect(() => {
    const isLoading = isLoadingConsumption || isLoadingPower || isLoadingDetailed
    if (isLoading) {
      setIsProgressExpanded(true)
    } else if (allLoadingComplete) {
      // Auto-collapse 1 second after completion
      setTimeout(() => {
        setIsProgressExpanded(false)
      }, 1000)
    }
  }, [isLoadingConsumption, isLoadingPower, isLoadingDetailed, allLoadingComplete])

  if (!dateRange) {
    return null
  }

  const hasAnyLoading = isLoadingConsumption || isLoadingPower || isLoadingDetailed || allLoadingComplete

  if (!hasAnyLoading) {
    return null
  }

  return (
    <div className="mt-6">
      <div
        onClick={() => setIsProgressExpanded(!isProgressExpanded)}
        className="flex items-center justify-between cursor-pointer hover:opacity-70 transition-opacity"
      >
        <div className="flex items-center gap-2">
          <Activity className="text-primary-600 dark:text-primary-400" size={20} />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Progression du chargement
          </h3>
        </div>
        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          {isProgressExpanded ? (
            <span className="text-sm">Réduire</span>
          ) : (
            <span className="text-sm">Développer</span>
          )}
          {isProgressExpanded ? (
            <ChevronUp size={20} className="text-gray-500" />
          ) : (
            <ChevronDown size={20} className="text-gray-500" />
          )}
        </div>
      </div>

      {isProgressExpanded && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
          <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex flex-col gap-6">
              {/* Daily consumption data loading */}
              <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Chargement des données quotidiennes (3 ans)
              </h3>
              <div className="flex items-center gap-2">
                {dailyLoadingComplete && !isLoadingConsumption ? (
                  consumptionResponse?.success ? (
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
                ) : (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      En cours...
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {consumptionResponse?.success === false && consumptionResponse?.error?.message ? (
                <span className="text-red-600 dark:text-red-400">{consumptionResponse.error.message}</span>
              ) : (
                'Récupération des données de consommation depuis le cache ou l\'API Enedis'
              )}
            </p>
          </div>

        {/* Power data loading */}
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Chargement de la puissance maximum (3 ans)
              </h3>
              <div className="flex items-center gap-2">
                {powerLoadingComplete && !isLoadingPower ? (
                  maxPowerResponse?.success ? (
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
                ) : (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      En cours...
                    </span>
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {maxPowerResponse?.success === false && maxPowerResponse?.error?.message ? (
                <span className="text-red-600 dark:text-red-400">{maxPowerResponse.error.message}</span>
              ) : (
                'Récupération des données de puissance maximum depuis le cache ou l\'API Enedis'
              )}
            </p>
          </div>


        {/* Detailed data loading progress */}
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Chargement des données détaillées (2 ans)
              </h3>
              <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                {loadingProgress.current} / {loadingProgress.total} semaines
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-8 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-blue-500 transition-all duration-300 ease-out flex items-center justify-end pr-3"
                style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
              >
                {loadingProgress.current > 0 && (
                  <span className="text-sm font-bold text-white drop-shadow">
                    {Math.round((loadingProgress.current / loadingProgress.total) * 100)}%
                  </span>
                )}
              </div>
            </div>

            {/* Current range */}
            {loadingProgress.currentRange && (
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                <span className="font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                  {loadingProgress.currentRange}
                </span>
              </p>
            )}
          </div>


        {/* HC/HP calculation progress */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Calcul des heures creuses / pleines
            </h3>
            <div className="flex items-center gap-2">
              {hcHpCalculationComplete ? (
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
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-green-600"></div>
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    En cours...
                  </span>
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Analyse des plages horaires pour déterminer les heures creuses
          </p>
        </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
