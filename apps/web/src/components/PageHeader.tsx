import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { TrendingUp, Sun, Calculator, Download, Lock, LayoutDashboard, Calendar, Zap, Users, AlertCircle, BookOpen, Settings as SettingsIcon, Key, Shield, FileText, Activity, Euro, Scale } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { pdlApi } from '@/api/pdl'
import { usePdlStore } from '@/stores/pdlStore'
import { useDataFetchStore } from '@/stores/dataFetchStore'
import { useIsDemo } from '@/hooks/useIsDemo'
import { useUnifiedDataFetch } from '@/hooks/useUnifiedDataFetch'
import { LoadingStatusBadge } from './LoadingStatusBadge'
import type { PDL } from '@/types/api'

// Pages qui affichent le sélecteur de PDL avec bouton "Récupérer"
const PDL_SELECTOR_PAGES = [
  '/consumption_kwh', '/consumption_euro', '/production', '/balance', '/simulator', '/dashboard', '/tempo', '/ecowatt', '/contribute',
  '/faq', '/api-docs', '/api-docs/auth', '/settings',
  '/admin', '/admin/users', '/admin/tempo', '/admin/ecowatt', '/admin/contributions', '/admin/offers', '/admin/roles', '/admin/logs', '/admin/add-pdl'
]

// Configuration des titres et icônes par page
const PAGE_CONFIG: Record<string, { title: string; icon: typeof TrendingUp; subtitle?: string }> = {
  '/dashboard': { title: 'Tableau de bord', icon: LayoutDashboard, subtitle: 'Gérez vos points de livraison' },
  '/consumption_kwh': { title: 'Consommation', icon: TrendingUp, subtitle: 'Visualisez et analysez votre consommation électrique en kWh' },
  '/consumption_euro': { title: 'Consommation', icon: Euro, subtitle: 'Visualisez et analysez le coût de votre consommation en euros' },
  '/production': { title: 'Production', icon: Sun, subtitle: 'Visualisez et analysez votre production d\'énergie solaire' },
  '/balance': { title: 'Bilan Énergétique', icon: Scale, subtitle: 'Comparez votre production et consommation pour analyser votre autoconsommation' },
  '/simulator': { title: 'Comparateur des abonnements', icon: Calculator, subtitle: 'Comparez automatiquement le coût de toutes les offres disponibles' },
  '/tempo': { title: 'Calendrier Tempo', icon: Calendar, subtitle: 'Historique des jours Tempo bleus, blancs et rouges fourni par RTE' },
  '/ecowatt': { title: 'EcoWatt - Signal RTE', icon: Zap, subtitle: 'Suivez en temps réel l\'état du réseau électrique français' },
  '/contribute': { title: 'Contribuer à la base de données', icon: Users, subtitle: 'Aidez la communauté en ajoutant des offres tarifaires' },
  '/faq': { title: 'FAQ - Questions fréquentes Enedis', icon: AlertCircle, subtitle: 'Réponses aux questions courantes et solutions aux erreurs de l\'API Enedis' },
  '/api-docs': { title: 'Documentation API', icon: BookOpen, subtitle: 'Explorez et testez les endpoints de l\'API MyElectricalData' },
  '/api-docs/auth': { title: 'Authentification OAuth 2.0', icon: Key, subtitle: 'Guide complet pour intégrer l\'API MyElectricalData dans vos applications' },
  '/settings': { title: 'Mon compte', icon: SettingsIcon, subtitle: 'Gérez votre compte et vos préférences' },
  // Admin pages
  '/admin': { title: 'Administration', icon: Shield, subtitle: 'Vue d\'ensemble et statistiques de la plateforme' },
  '/admin/users': { title: 'Gestion des utilisateurs', icon: Users, subtitle: 'Gérez les comptes utilisateurs de la plateforme' },
  '/admin/tempo': { title: 'Gestion Tempo', icon: Calendar, subtitle: 'Gérez les données du calendrier Tempo RTE' },
  '/admin/ecowatt': { title: 'Administration EcoWatt', icon: Zap, subtitle: 'Gérez les données EcoWatt RTE' },
  '/admin/contributions': { title: 'Gestion des contributions', icon: Users, subtitle: 'Modérez les contributions des utilisateurs' },
  '/admin/offers': { title: 'Gestion des offres', icon: Zap, subtitle: 'Gérez les offres tarifaires des fournisseurs' },
  '/admin/roles': { title: 'Gestion des rôles', icon: Shield, subtitle: 'Configurez les rôles et permissions' },
  '/admin/logs': { title: 'Logs d\'application', icon: FileText, subtitle: 'Consultez les logs du système' },
  '/admin/add-pdl': { title: 'Ajouter un PDL', icon: Activity, subtitle: 'Ajouter un point de livraison à un utilisateur' },
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

  // Toujours récupérer toutes les données (consommation + production), quelle que soit la page
  const pageContext = 'all' as const

  // Hook unifié pour récupérer toutes les données
  const { fetchAllData } = useUnifiedDataFetch({
    selectedPDL: selectedPdl,
    selectedPDLDetails,
    allPDLs: pdls,
    pageContext,
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

  // Check if on a consumption page
  const isConsumptionPage = location.pathname.startsWith('/consumption')

  // Get the set of production PDL IDs that are linked to consumption PDLs
  // These should be hidden from the selector (the consumption PDL will show instead)
  const linkedProductionIds = new Set(
    pdls
      .filter((pdl: PDL) => pdl.has_consumption && pdl.linked_production_pdl_id)
      .map((pdl: PDL) => pdl.linked_production_pdl_id)
  )

  // Filter PDLs based on page
  const displayedPdls = location.pathname === '/production'
    ? (() => {
        // Show: consumption PDLs with linked production + standalone production PDLs
        const consumptionWithProduction = pdls.filter((pdl: PDL) =>
          pdl.has_consumption &&
          pdl.is_active &&
          pdl.linked_production_pdl_id
        )

        const standaloneProduction = activePdls.filter((pdl: PDL) =>
          pdl.has_production &&
          !linkedProductionIds.has(pdl.id) // Use pdl.id (UUID) not usage_point_id
        )

        return [...consumptionWithProduction, ...standaloneProduction]
      })()
    : isConsumptionPage
    ? activePdls.filter((pdl: PDL) => pdl.has_consumption)
    : activePdls.filter((pdl: PDL) => !linkedProductionIds.has(pdl.id)) // Hide linked production PDLs globally

  // Auto-select first PDL if none selected OR if current PDL is not in the displayed list
  useEffect(() => {
    if (displayedPdls.length > 0) {
      // Check if current PDL is in the displayed list for this page
      const currentPdlInList = displayedPdls.some(p => p.usage_point_id === selectedPdl)

      if (!selectedPdl || !currentPdlInList) {
        const newPdl = displayedPdls[0]
        // Show toast only if we're switching from an incompatible PDL (not on first load)
        if (selectedPdl && !currentPdlInList) {
          toast(`PDL changé automatiquement vers "${newPdl.name || newPdl.usage_point_id}"`, {
            icon: '🔄',
            duration: 4000,
          })
        }
        // Select the first available PDL for this page
        setSelectedPdl(newPdl.usage_point_id)
      }
    }
  }, [displayedPdls, selectedPdl, setSelectedPdl])

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
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
            displayedPdls.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                {location.pathname === '/production'
                  ? 'Aucun PDL de production non lié trouvé'
                  : isConsumptionPage
                  ? 'Aucun PDL avec l\'option consommation activée'
                  : 'Aucun point de livraison actif trouvé'}
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
                    className="px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm w-full sm:w-auto min-w-[20ch]"
                  >
                    {displayedPdls.map((pdl: PDL) => (
                      <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                        {pdl.name || pdl.usage_point_id}
                      </option>
                    ))}
                  </select>

                  {/* Bouton de récupération - Affiché seulement quand pas en chargement */}
                  <button
                    onClick={async () => {
                      if (!isDemo && selectedPdl && selectedPDLDetails) {
                        setIsLoading(true)
                        try {
                          await fetchAllData()
                        } finally {
                          setIsLoading(false)
                        }
                      }
                    }}
                    disabled={!selectedPdl || !selectedPDLDetails || isDemo}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap text-sm w-full sm:w-auto"
                    title={isDemo ? 'Récupération bloquée en mode démo' : !selectedPDLDetails ? 'Chargement du PDL...' : 'Récupérer toutes les données depuis Enedis'}
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
