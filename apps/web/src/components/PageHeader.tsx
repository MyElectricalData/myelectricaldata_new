import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { TrendingUp, Sun, Calculator, Download, Lock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useIsDemo } from '@/hooks/useIsDemo'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'
import { LoadingStatusBadge } from './LoadingStatusBadge'
import type { PDL } from '@/types/api'

// Pages qui affichent le sélecteur de PDL
const PDL_SELECTOR_PAGES = ['/consumption', '/production', '/simulator']

// Configuration des titres et icônes par page
const PAGE_CONFIG: Record<string, { title: string; icon: typeof TrendingUp; subtitle?: string }> = {
  '/dashboard': { title: 'Tableau de bord', icon: TrendingUp },
  '/consumption': { title: 'Consommation', icon: TrendingUp, subtitle: 'Visualisez et analysez votre consommation électrique' },
  '/production': { title: 'Production', icon: Sun, subtitle: 'Visualisez et analysez votre production d\'énergie solaire' },
  '/simulator': { title: 'Comparateur des abonnements', icon: Calculator, subtitle: 'Comparez automatiquement le coût de toutes les offres disponibles' },
}

export default function PageHeader() {
  const location = useLocation()
  const { selectedPdl, setSelectedPdl } = usePdlStore()
  const { setFetchDataFunction, isLoading, setIsLoading } = useDataFetchStore()
  const isDemo = useIsDemo()

  // Récupérer la liste des PDLs
  const { data: pdlsResponse } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
  })

  const pdls: PDL[] = Array.isArray(pdlsResponse) ? pdlsResponse : []
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPdl)

  // Hook unifié pour récupérer toutes les données
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL: selectedPdl,
    selectedPDLDetails,
    allPDLs: pdls,
  })

  // Enregistrer la fonction de fetch unifiée
  // Note: On ne met pas fetchAllData dans les dépendances pour éviter les boucles infinies
  // La fonction sera recréée uniquement quand le PDL change
  useEffect(() => {
    if (!selectedPdl) {
      setFetchDataFunction(null)
      return
    }

    const wrappedFetch = async () => {
      setIsLoading(true)
      try {
        await fetchAllData()
      } finally {
        setIsLoading(false)
      }
    }
    setFetchDataFunction(wrappedFetch)
    return () => setFetchDataFunction(null)
  }, [selectedPdl, setFetchDataFunction, setIsLoading])

  // Déterminer si on affiche le sélecteur de PDL
  const showPdlSelector = PDL_SELECTOR_PAGES.includes(location.pathname)

  // Trouver la configuration pour la page actuelle
  const config = PAGE_CONFIG[location.pathname]

  // Si pas de config pour cette page, ne rien afficher
  if (!config) return null

  const Icon = config.icon
  const activePdls = pdls.filter((p: PDL) => p.is_active)

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px]">
        <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Titre avec icône et sous-titre */}
          <div className="flex items-center justify-center lg:justify-start gap-3 w-full lg:w-auto">
            <Icon className="text-primary-600 dark:text-primary-400 flex-shrink-0" size={32} />
            <div className="text-center lg:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {config.title}
              </h1>
              {config.subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 hidden sm:block">
                  {config.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Sélecteur de PDL et bouton de récupération (uniquement sur certaines pages) */}
          {showPdlSelector && (
            activePdls.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                Aucun point de livraison actif trouvé
              </div>
            ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
              {/* Sélecteur de PDL OU statut de chargement */}
              {isLoading ? (
                <LoadingStatusBadge />
              ) : (
                <>
                  <label htmlFor="pdl-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block whitespace-nowrap">
                    Point de livraison :
                  </label>
                  <select
                    id="pdl-selector"
                    value={selectedPdl}
                    onChange={(e) => setSelectedPdl(e.target.value)}
                    className="px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm w-full sm:w-auto"
                  >
                    <option value="">Sélectionner un PDL</option>
                    {activePdls.map((pdl: PDL) => (
                      <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                        {pdl.name || pdl.usage_point_id}
                      </option>
                    ))}
                  </select>

                  {/* Bouton de récupération - Affiché seulement quand pas en chargement */}
                  <button
                    onClick={async () => {
                      if (!isDemo && selectedPdl) {
                        setIsLoading(true)
                        try {
                          await fetchAllData()
                        } finally {
                          setIsLoading(false)
                        }
                      }
                    }}
                    disabled={!selectedPdl || isDemo}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap text-sm w-full sm:w-auto"
                    title={isDemo ? 'Récupération bloquée en mode démo' : 'Récupérer toutes les données depuis Enedis'}
                  >
                    {isDemo ? (
                      <>
                        <Lock size={18} />
                        <span className="hidden sm:inline">Mode démo</span>
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        <span className="hidden sm:inline">Récupérer</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
