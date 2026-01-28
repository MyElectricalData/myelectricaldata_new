import { Euro, TrendingDown, TrendingUp, Zap, Moon, Sun, Calendar, Download } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import type { YearlyCost, SelectedOfferWithProvider } from '../types/euro.types'

interface EuroCostCardsProps {
  yearlyCosts: YearlyCost[]
  selectedOffer: SelectedOfferWithProvider | null
  isLoading: boolean
}

// Format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

// Format kWh
const formatKwh = (value: number): string => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} MWh`
  }
  return `${Math.round(value)} kWh`
}

export function EuroCostCards({ yearlyCosts, selectedOffer, isLoading }: EuroCostCardsProps) {
  const handleExportAll = () => {
    const exportData = {
      offer: selectedOffer,
      yearlyCosts: yearlyCosts.map(year => ({
        year: year.year,
        periodLabel: year.periodLabel,
        totalCost: year.totalCost,
        avgMonthlyCost: year.avgMonthlyCost,
        consumptionCost: year.consumptionCost,
        subscriptionCost: year.subscriptionCost,
        hcCost: year.hcCost,
        hpCost: year.hpCost,
        totalKwh: year.totalKwh,
        hcKwh: year.hcKwh,
        hpKwh: year.hpKwh
      }))
    }
    const jsonData = JSON.stringify(exportData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données coûts annuels copiées dans le presse-papier')
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-gray-100 dark:bg-gray-700 rounded-xl h-32" />
        ))}
      </div>
    )
  }

  if (!selectedOffer || yearlyCosts.length === 0) {
    return null
  }

  const currentYear = yearlyCosts[0]
  const previousYear = yearlyCosts[1]

  // Calculate year-over-year change
  const yoyChange = previousYear
    ? ((currentYear.totalCost - previousYear.totalCost) / previousYear.totalCost) * 100
    : null

  // Calculate HC percentage
  const hcPercent = currentYear.totalKwh > 0
    ? (currentYear.hcKwh / currentYear.totalKwh) * 100
    : 0

  return (
    <div className="space-y-4">
      {/* Header with export button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Coûts annuels
        </h3>
        <button
          onClick={handleExportAll}
          className="flex items-center justify-center gap-2 min-w-[120px] px-3 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Download size={16} />
          <span>Export JSON</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost Card */}
        <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border-2 border-emerald-500 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Coût Total Annuel</span>
            <Euro className="text-emerald-500" size={18} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(currentYear.totalCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {currentYear.periodLabel}
          </div>
          {yoyChange !== null && (
            <div className={`flex items-center gap-1.5 mt-2 text-sm`}>
              {yoyChange > 0 ? (
                <TrendingUp size={14} className="text-red-500" />
              ) : (
                <TrendingDown size={14} className="text-emerald-500" />
              )}
              <span className={`font-medium ${yoyChange > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {yoyChange > 0 ? '+' : ''}{yoyChange.toFixed(1)}%
              </span>
              <span className="text-gray-500 dark:text-gray-400">vs année précédente</span>
            </div>
          )}
        </div>

        {/* Average Monthly Cost */}
        <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border-2 border-blue-500 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Coût Moyen Mensuel</span>
            <Calendar className="text-blue-500" size={18} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(currentYear.avgMonthlyCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Sur {currentYear.months.length} mois
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            ≈ {formatCurrency(currentYear.avgMonthlyCost / 30)}/jour
          </div>
        </div>

        {/* Consumption Cost Breakdown */}
        <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border-2 border-amber-500 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Consommation</span>
            <Zap className="text-amber-500" size={18} />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatCurrency(currentYear.consumptionCost)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatKwh(currentYear.totalKwh)} consommés
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Abonnement: {formatCurrency(currentYear.subscriptionCost)}
          </div>
        </div>

        {/* HC/HP Split */}
        <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border-2 border-purple-500 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Répartition HC/HP</span>
            <div className="flex gap-1">
              <Moon className="text-purple-500" size={14} />
              <Sun className="text-purple-500" size={14} />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {hcPercent.toFixed(0)}% HC
          </div>
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">Heures Creuses</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {formatCurrency(currentYear.hcCost)}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 dark:text-gray-400">Heures Pleines</div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {formatCurrency(currentYear.hpCost)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Previous year comparison */}
      {previousYear && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-3 border-2 border-gray-300 dark:border-gray-600 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{previousYear.periodLabel}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(previousYear.totalCost)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatKwh(previousYear.totalKwh)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-3 border-2 border-gray-300 dark:border-gray-600 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Économie/Surcoût</div>
            <div className={`text-lg font-semibold ${currentYear.totalCost > previousYear.totalCost ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {currentYear.totalCost > previousYear.totalCost ? '+' : ''}{formatCurrency(currentYear.totalCost - previousYear.totalCost)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Par rapport à l'année précédente
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/80 rounded-xl p-3 border-2 border-gray-300 dark:border-gray-600 shadow-sm">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Variation Consommation</div>
            <div className={`text-lg font-semibold ${currentYear.totalKwh > previousYear.totalKwh ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
              {currentYear.totalKwh > previousYear.totalKwh ? '+' : ''}{((currentYear.totalKwh - previousYear.totalKwh) / previousYear.totalKwh * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatKwh(Math.abs(currentYear.totalKwh - previousYear.totalKwh))} {currentYear.totalKwh > previousYear.totalKwh ? 'de plus' : 'de moins'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
