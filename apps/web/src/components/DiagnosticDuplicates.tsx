import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, Search } from 'lucide-react'
import { getReadings, hasReadings } from '@/utils/enedisMeasure'

/**
 * Composant de diagnostic des doublons dans le cache
 *
 * UTILISATION :
 * Ajouter ce composant dans n'importe quelle page pour diagnostiquer les doublons
 *
 * Exemple :
 * import { DiagnosticDuplicates } from '@/components/DiagnosticDuplicates'
 *
 * <DiagnosticDuplicates />
 */

interface DiagnosticResult {
  totalDays: number
  totalPoints: number
  totalDuplicates: number
  daysWithDuplicates: number
  duplicateRate: number
  details: Array<{
    type: string
    date: string
    totalPoints: number
    uniquePoints: number
    duplicates: number
  }>
}

export function DiagnosticDuplicates() {
  const queryClient = useQueryClient()
  const [result, setResult] = useState<DiagnosticResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState<number>(2)

  // Auto-refresh analysis with configurable interval
  React.useEffect(() => {
    if (refreshInterval === 0 || !result) return // Off or no result to refresh

    const interval = setInterval(() => {
      // Re-run diagnostic automatically to update stats
      runDiagnostic()
    }, refreshInterval * 1000)

    return () => clearInterval(interval)
  }, [refreshInterval, result])

  const runDiagnostic = () => {
    setIsAnalyzing(true)

    setTimeout(() => {
      const cache = queryClient.getQueryCache()
      const queries = cache.getAll()

      let totalDuplicates = 0
      let daysWithDuplicates = 0
      let totalPoints = 0
      const details: DiagnosticResult['details'] = []

      // Analyser les requêtes de type consumptionDetail et productionDetail
      const detailQueries = queries.filter(q =>
        q.queryKey[0] === 'consumptionDetail' || q.queryKey[0] === 'productionDetail'
      )

      detailQueries.forEach(query => {
        const data = query.state.data as any
        if (!hasReadings(data?.data)) return

        const points = getReadings(data.data)
        const date = query.queryKey[2] as string
        const type = query.queryKey[0] as string

        // Compter les timestamps uniques
        const timestamps = points.map((p) => p.date)
        const uniqueTimestamps = new Set(timestamps)

        const duplicateCount = timestamps.length - uniqueTimestamps.size

        totalPoints += points.length

        if (duplicateCount > 0) {
          daysWithDuplicates++
          totalDuplicates += duplicateCount

          details.push({
            type,
            date,
            totalPoints: points.length,
            uniquePoints: uniqueTimestamps.size,
            duplicates: duplicateCount
          })
        }
      })

      const diagnosticResult: DiagnosticResult = {
        totalDays: detailQueries.length,
        totalPoints,
        totalDuplicates,
        daysWithDuplicates,
        duplicateRate: totalPoints > 0 ? (totalDuplicates / totalPoints) * 100 : 0,
        details: details.sort((a, b) => b.duplicates - a.duplicates) // Trier par nombre de doublons
      }

      setResult(diagnosticResult)
      setIsAnalyzing(false)
    }, 100)
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Search className="text-primary-600 dark:text-primary-400" size={24} />
            Diagnostic des doublons
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">Refresh:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value={0}>Off</option>
              <option value={1}>1s</option>
              <option value={2}>2s</option>
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
            </select>
            {refreshInterval > 0 && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 animate-pulse">
                ●
              </span>
            )}
          </div>
        </div>
        <button
          onClick={runDiagnostic}
          disabled={isAnalyzing}
          className="btn btn-primary"
        >
          {isAnalyzing ? 'Analyse...' : 'Analyser le cache'}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Résumé */}
          <div className={`p-4 rounded-lg border ${
            result.totalDuplicates === 0
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-start gap-3">
              {result.totalDuplicates === 0 ? (
                <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={24} />
              ) : (
                <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={24} />
              )}
              <div className="flex-1">
                <h4 className={`font-semibold ${
                  result.totalDuplicates === 0
                    ? 'text-green-800 dark:text-green-300'
                    : 'text-red-800 dark:text-red-300'
                }`}>
                  {result.totalDuplicates === 0 ? '✅ Aucun doublon détecté !' : '❌ Doublons détectés !'}
                </h4>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Jours analysés :</strong> {result.totalDays}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Total points :</strong> {result.totalPoints.toLocaleString()}
                  </p>
                  {result.totalDuplicates > 0 && (
                    <>
                      <p className="text-red-700 dark:text-red-300">
                        <strong>Doublons :</strong> {result.totalDuplicates.toLocaleString()} points
                      </p>
                      <p className="text-red-700 dark:text-red-300">
                        <strong>Jours affectés :</strong> {result.daysWithDuplicates}
                      </p>
                      <p className="text-red-700 dark:text-red-300">
                        <strong>Taux de doublons :</strong> {result.duplicateRate.toFixed(2)}%
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Détails des doublons */}
          {result.details.length > 0 && (
            <div className="space-y-2">
              <h5 className="font-semibold text-gray-900 dark:text-white">
                Détails par jour ({result.details.length} jours affectés) :
              </h5>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {result.details.map((detail) => (
                  <div
                    key={`${detail.type}-${detail.date}`}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
                  >
                    <span className="text-gray-700 dark:text-gray-300">
                      <span className="font-mono text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                        {detail.type === 'consumptionDetail' ? 'CONSO' : 'PROD'}
                      </span>
                      {' '}
                      {detail.date}
                    </span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">
                      {detail.duplicates} doublons ({detail.totalPoints} → {detail.uniquePoints})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommandations */}
          {result.totalDuplicates > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h5 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
                💡 Recommandations :
              </h5>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700 dark:text-blue-300">
                <li>Vider le cache (bouton dans la sidebar)</li>
                <li>Récupérer les données à nouveau depuis la page Consommation</li>
                <li>Relancer ce diagnostic pour vérifier</li>
              </ol>
            </div>
          )}
        </div>
      )}

      {!result && (
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Cliquez sur "Analyser le cache" pour détecter d'éventuels doublons dans les données en cache.
        </p>
      )}
    </div>
  )
}
