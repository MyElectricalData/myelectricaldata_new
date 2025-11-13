import { Loader2, Download, Trash2, Settings } from 'lucide-react'
import type { PDL } from '@/types/api'

interface PDLSelectorProps {
  pdls: PDL[]
  activePdls: PDL[]
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  onPDLSelect: (value: string) => void
  onFetchData: () => void
  onClearCache: () => void
  isClearingCache: boolean
  isLoading: boolean
  isLoadingDetailed: boolean
  hasDataInCache: boolean
  dataLimitWarning: string | null
  user: any
  children?: React.ReactNode
}

export function PDLSelector({
  activePdls,
  selectedPDL,
  onPDLSelect,
  onFetchData,
  onClearCache,
  isClearingCache,
  isLoading,
  isLoadingDetailed,
  dataLimitWarning,
  user,
  children
}: PDLSelectorProps) {
  return (
    <div className="card">
      {/* Configuration Header */}
      <div className="flex items-center gap-2 mb-6">
        <Settings className="text-primary-600 dark:text-primary-400" size={20} />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Configuration</h2>
      </div>

      <div className="space-y-6">
        {/* PDL Selection - Only show if more than one active PDL */}
        {activePdls.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Point de Livraison (PDL)
            </label>
            <select
              value={selectedPDL}
              onChange={(e) => onPDLSelect(e.target.value)}
              disabled={isLoading || isLoadingDetailed}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activePdls.map((pdl: PDL) => (
                <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                  {pdl.name || pdl.usage_point_id}
                </option>
              ))}
            </select>

            {/* Warning if PDL has limited data */}
            {dataLimitWarning && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
                <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {dataLimitWarning}
                </p>
              </div>
            )}
          </div>
        )}

        {/* No active PDL message */}
        {activePdls.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Aucun PDL actif disponible. Veuillez en ajouter un depuis votre{' '}
            <a href="/dashboard" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline">
              tableau de bord
            </a>.
          </div>
        )}

        {/* Warning if PDL has limited data - Show for single PDL too */}
        {activePdls.length === 1 && dataLimitWarning && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {dataLimitWarning}
            </p>
          </div>
        )}

        {/* Fetch Button - Always show if there are active PDLs */}
        {activePdls.length > 0 && (
          <button
            onClick={onFetchData}
            disabled={!selectedPDL || isLoading || isLoadingDetailed}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading || isLoadingDetailed ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Récupération en cours...
              </>
            ) : (
              <>
                <Download size={20} />
                Récupérer l'historique
              </>
            )}
          </button>
        )}

        {/* Clear Cache Button (Admin only) */}
        {user?.is_admin && (
          <button
            onClick={onClearCache}
            disabled={isClearingCache}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isClearingCache ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Vidage en cours...
              </>
            ) : (
              <>
                <Trash2 size={20} />
                Vider tout le cache (Navigateur + Redis)
              </>
            )}
          </button>
        )}

        {/* Children (LoadingProgress) */}
        {children}
      </div>
    </div>
  )
}
