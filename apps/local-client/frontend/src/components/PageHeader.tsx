import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  TrendingUp,
  Euro,
  Sun,
  BarChart3,
  Calendar,
  AlertTriangle,
  Calculator,
  Settings,
  Download,
} from 'lucide-react'
import { getPDLs, type PDL } from '../api/client'

// Configuration des titres et icônes par page
const PAGE_CONFIG: Record<string, { title: string; icon: typeof TrendingUp; subtitle?: string }> = {
  '/': { title: 'Tableau de bord', icon: LayoutDashboard, subtitle: 'Vue d\'ensemble de vos données électriques' },
  '/consumption_kwh': { title: 'Consommation kWh', icon: TrendingUp, subtitle: 'Visualisez et analysez votre consommation électrique en kWh' },
  '/consumption_euro': { title: 'Consommation Euro', icon: Euro, subtitle: 'Visualisez le coût de votre consommation en euros' },
  '/production': { title: 'Production', icon: Sun, subtitle: 'Visualisez votre production d\'énergie solaire' },
  '/bilan': { title: 'Bilan Énergétique', icon: BarChart3, subtitle: 'Comparez votre production et consommation' },
  '/tempo': { title: 'Calendrier Tempo', icon: Calendar, subtitle: 'Historique des jours Tempo fourni par RTE' },
  '/ecowatt': { title: 'EcoWatt - Signal RTE', icon: AlertTriangle, subtitle: 'État du réseau électrique français' },
  '/simulation': { title: 'Simulateur', icon: Calculator, subtitle: 'Comparez les offres tarifaires' },
  '/exporters': { title: 'Exporteurs', icon: Settings, subtitle: 'Configuration des exporteurs de données' },
}

interface PageHeaderProps {
  selectedPdl: string
  onPdlChange: (pdl: string) => void
  onExportCsv?: () => void
  showExportButton?: boolean
}

export default function PageHeader({ selectedPdl, onPdlChange, onExportCsv, showExportButton = false }: PageHeaderProps) {
  const location = useLocation()

  // Récupérer la liste des PDLs
  const { data: pdls = [] } = useQuery({
    queryKey: ['pdls'],
    queryFn: getPDLs,
  })

  // Trouver la configuration pour la page actuelle
  const config = PAGE_CONFIG[location.pathname]

  // Si pas de config pour cette page, utiliser un défaut
  const pageConfig = config || { title: 'MyElectricalData', icon: LayoutDashboard }
  const Icon = pageConfig.icon

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6 max-w-[1920px]">
        <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Titre avec icône et sous-titre */}
          <div className="flex items-center justify-center lg:justify-start gap-3 w-full lg:w-auto">
            <Icon className="text-primary-600 dark:text-primary-400 flex-shrink-0" size={32} />
            <div className="text-center lg:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {pageConfig.title}
              </h1>
              {pageConfig.subtitle && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 hidden sm:block">
                  {pageConfig.subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Sélecteur de Point de livraison */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <label htmlFor="pdl-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block whitespace-nowrap">
              Point de livraison
            </label>
            <select
              id="pdl-selector"
              value={selectedPdl}
              onChange={(e) => onPdlChange(e.target.value)}
              className="px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors text-sm w-full sm:w-auto min-w-[20ch]"
            >
              {pdls.map((pdl: PDL) => (
                <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
                  {pdl.name || pdl.usage_point_id}
                </option>
              ))}
            </select>

            {/* Bouton Exporter CSV (optionnel) */}
            {showExportButton && onExportCsv && (
              <button
                onClick={onExportCsv}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors whitespace-nowrap text-sm w-full sm:w-auto border border-gray-300 dark:border-gray-600"
              >
                <Download size={18} />
                <span>Exporter CSV</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
