import { Download, Settings, Lock } from 'lucide-react'
import type { PDL } from '@/types/api'
import { useIsDemo } from '@/hooks/useIsDemo'
import { ModernButton } from './ModernButton'

interface DataFetchSectionProps {
  activePdls: PDL[]
  selectedPDL: string
  onFetchData: () => void
  isLoading: boolean
  isLoadingDetailed: boolean
  dataLimitWarning: string | null
  children?: React.ReactNode
}

export function DataFetchSection({
  activePdls,
  selectedPDL,
  onFetchData,
  isLoading,
  isLoadingDetailed,
  dataLimitWarning,
  children
}: DataFetchSectionProps) {
  const isDemo = useIsDemo()

  return (
    <div className="card">
      {/* Configuration Header */}
      <div className="flex items-center gap-2 mb-6">
        <Settings className="text-primary-600 dark:text-primary-400" size={20} />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Configuration</h2>
      </div>

      <div className="space-y-6">
        {/* No active PDL message */}
        {activePdls.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Aucun point de livraison actif disponible. Veuillez en ajouter un depuis votre{' '}
            <a href="/dashboard" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline">
              tableau de bord
            </a>.
          </div>
        )}

        {/* Warning if PDL has limited data */}
        {dataLimitWarning && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400 text-lg flex-shrink-0">ℹ️</span>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {dataLimitWarning}
            </p>
          </div>
        )}

        {/* Fetch Button - Always show if there are active PDLs */}
        {activePdls.length > 0 && (
          <>
            <ModernButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={onFetchData}
              disabled={!selectedPDL || isLoading || isLoadingDetailed || isDemo}
              icon={isDemo ? Lock : Download}
              iconPosition="left"
              loading={isLoading || isLoadingDetailed}
            >
              {isLoading || isLoadingDetailed
                ? 'Récupération en cours...'
                : isDemo
                  ? 'Récupération bloquée en mode démo'
                  : 'Récupérer l\'historique'
              }
            </ModernButton>

            {isDemo && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Mode Démo :</strong> Le compte démo dispose déjà de 3 ans de données fictives.
                  La récupération depuis l'API Enedis est désactivée.
                </p>
              </div>
            )}
          </>
        )}

        {/* Children (LoadingProgress) */}
        {children}
      </div>
    </div>
  )
}
