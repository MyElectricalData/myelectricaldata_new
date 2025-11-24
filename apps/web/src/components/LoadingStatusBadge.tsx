import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import type { DataStatus } from '@/stores/dataFetchStore'

interface TaskStatus {
  name: string
  fullName: string
  status: DataStatus
  progress?: string
  description: string
  category: 'consumption' | 'production'
}

export function LoadingStatusBadge() {
  const { loadingStatus } = useDataFetchStore()
  const [showTooltip, setShowTooltip] = useState(false)

  // Safety check: ensure loadingStatus has the correct structure
  if (!loadingStatus || !loadingStatus.consumption || !loadingStatus.production) {
    return null
  }

  // Calculate date ranges
  const todayUTC = new Date()
  const today = new Date(Date.UTC(
    todayUTC.getUTCFullYear(),
    todayUTC.getUTCMonth(),
    todayUTC.getUTCDate(),
    0, 0, 0, 0
  ))
  const yesterday = new Date(Date.UTC(
    todayUTC.getUTCFullYear(),
    todayUTC.getUTCMonth(),
    todayUTC.getUTCDate() - 1,
    0, 0, 0, 0
  ))

  // 3 years back from today for daily and power max
  const threeYearsAgo = new Date(Date.UTC(
    today.getUTCFullYear() - 3,
    today.getUTCMonth(),
    today.getUTCDate(),
    0, 0, 0, 0
  ))

  // 2 years back from today for detailed data
  const twoYearsAgo = new Date(Date.UTC(
    today.getUTCFullYear() - 2,
    today.getUTCMonth(),
    today.getUTCDate(),
    0, 0, 0, 0
  ))

  const formatDate = (date: Date) => {
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`
  }

  const dailyDateRange = `${formatDate(threeYearsAgo)} → ${formatDate(yesterday)}`
  const detailDateRange = `${formatDate(twoYearsAgo)} → ${formatDate(yesterday)}`

  // Build tasks array based on loading status
  const tasks: TaskStatus[] = []

  // Consumption tasks - only add non-idle tasks
  if (loadingStatus.consumption.daily !== 'idle') {
    tasks.push({
      name: 'Conso quotidien',
      fullName: 'Consommation quotidienne',
      status: loadingStatus.consumption.daily,
      description: `${dailyDateRange} (3 ans)`,
      category: 'consumption'
    })
  }

  if (loadingStatus.consumption.detail !== 'idle') {
    tasks.push({
      name: 'Conso détaillé',
      fullName: 'Consommation détaillée',
      status: loadingStatus.consumption.detail,
      description: `${detailDateRange} (2 ans)`,
      category: 'consumption'
    })
  }

  if (loadingStatus.consumption.powerMax !== 'idle') {
    tasks.push({
      name: 'Puissance max',
      fullName: 'Puissance maximum',
      status: loadingStatus.consumption.powerMax,
      description: `${dailyDateRange} (3 ans)`,
      category: 'consumption'
    })
  }

  // Production tasks - only add non-idle tasks
  if (loadingStatus.production.daily !== 'idle') {
    tasks.push({
      name: 'Prod quotidien',
      fullName: 'Production quotidienne',
      status: loadingStatus.production.daily,
      description: `${dailyDateRange} (3 ans)`,
      category: 'production'
    })
  }

  if (loadingStatus.production.detail !== 'idle') {
    tasks.push({
      name: 'Prod détaillé',
      fullName: 'Production détaillée',
      status: loadingStatus.production.detail,
      description: `${detailDateRange} (2 ans)`,
      category: 'production'
    })
  }

  // Don't show if no tasks
  if (tasks.length === 0) {
    return null
  }

  // Separate tasks by category
  const consumptionTasks = tasks.filter(t => t.category === 'consumption')
  const productionTasks = tasks.filter(t => t.category === 'production')

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Mobile & Desktop: Affichage toutes les icônes */}
      <div className="flex items-center justify-center sm:justify-start gap-1.5 sm:gap-4 px-2 sm:px-4 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors h-[42px] w-full sm:w-auto">
        {/* Consumption tasks */}
        {consumptionTasks.length > 0 && (
          <div className="flex items-center gap-1 sm:gap-3">
            {consumptionTasks.map((task, idx) => (
              <div key={`conso-${idx}`} className="flex items-center gap-1 sm:gap-1.5">
                {task.status === 'loading' ? (
                  <Loader2 className="h-4 w-4 text-primary-600 dark:text-primary-400 animate-spin flex-shrink-0" />
                ) : task.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : task.status === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-xs font-medium hidden sm:inline ${
                  task.status === 'loading' ? 'text-primary-600 dark:text-primary-400' :
                  task.status === 'success' ? 'text-green-600 dark:text-green-400' :
                  task.status === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-500 dark:text-gray-400'
                }`}>
                  {task.name}
                  {task.progress && ` (${task.progress})`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Separator if both categories exist */}
        {consumptionTasks.length > 0 && productionTasks.length > 0 && (
          <div className="h-5 sm:h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
        )}

        {/* Production tasks */}
        {productionTasks.length > 0 && (
          <div className="flex items-center gap-1 sm:gap-3">
            {productionTasks.map((task, idx) => (
              <div key={`prod-${idx}`} className="flex items-center gap-1 sm:gap-1.5">
                {task.status === 'loading' ? (
                  <Loader2 className="h-4 w-4 text-primary-600 dark:text-primary-400 animate-spin flex-shrink-0" />
                ) : task.status === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                ) : task.status === 'error' ? (
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-xs font-medium hidden sm:inline ${
                  task.status === 'loading' ? 'text-primary-600 dark:text-primary-400' :
                  task.status === 'success' ? 'text-green-600 dark:text-green-400' :
                  task.status === 'error' ? 'text-red-600 dark:text-red-400' :
                  'text-gray-500 dark:text-gray-400'
                }`}>
                  {task.name}
                  {task.progress && ` (${task.progress})`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tooltip volant avec détails - 2 colonnes */}
      {showTooltip && (
        <div className="absolute top-full left-0 mt-2 w-full sm:w-full z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
              Progression du chargement
            </h4>
            <div className="grid grid-cols-2 gap-4">
              {/* Colonne Consommation */}
              {consumptionTasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Consommation
                  </h5>
                  {consumptionTasks.map((task, idx) => (
                    <div key={`tooltip-conso-${idx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {task.fullName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {task.status === 'loading' ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-600 dark:border-primary-400"></div>
                              <span className="text-xs font-medium text-primary-600 dark:text-primary-400 hidden sm:inline">
                                En cours...
                              </span>
                            </>
                          ) : task.status === 'success' ? (
                            <>
                              <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-xs font-medium text-green-600 dark:text-green-400 hidden sm:inline">
                                Terminé
                              </span>
                            </>
                          ) : task.status === 'error' ? (
                            <>
                              <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              <span className="text-xs font-medium text-red-600 dark:text-red-400 hidden sm:inline">
                                Erreur
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:inline">
                              En attente
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {task.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Colonne Production */}
              {productionTasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Production
                  </h5>
                  {productionTasks.map((task, idx) => (
                    <div key={`tooltip-prod-${idx}`} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {task.fullName}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {task.status === 'loading' ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-600 dark:border-primary-400"></div>
                              <span className="text-xs font-medium text-primary-600 dark:text-primary-400 hidden sm:inline">
                                En cours...
                              </span>
                            </>
                          ) : task.status === 'success' ? (
                            <>
                              <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-xs font-medium text-green-600 dark:text-green-400 hidden sm:inline">
                                Terminé
                              </span>
                            </>
                          ) : task.status === 'error' ? (
                            <>
                              <svg className="h-4 w-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              <span className="text-xs font-medium text-red-600 dark:text-red-400 hidden sm:inline">
                                Erreur
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-gray-400 dark:text-gray-500 hidden sm:inline">
                              En attente
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {task.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
