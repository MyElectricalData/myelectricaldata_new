import { Euro, TrendingDown, TrendingUp, Zap, Moon, Sun, Calendar } from 'lucide-react'
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost Card */}
        <div className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 rounded-xl p-4 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700 dark:text-green-300">Coût Total Annuel</span>
            <Euro className="text-green-600 dark:text-green-400" size={18} />
          </div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-100">
            {formatCurrency(currentYear.totalCost)}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400 mt-1">
            {currentYear.periodLabel}
          </div>
          {yoyChange !== null && (
            <div className={`flex items-center gap-1 mt-2 text-sm ${yoyChange > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {yoyChange > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>{yoyChange > 0 ? '+' : ''}{yoyChange.toFixed(1)}% vs année précédente</span>
            </div>
          )}
        </div>

        {/* Average Monthly Cost */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Coût Moyen Mensuel</span>
            <Calendar className="text-blue-600 dark:text-blue-400" size={18} />
          </div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatCurrency(currentYear.avgMonthlyCost)}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
            Sur {currentYear.months.length} mois
          </div>
          <div className="text-xs text-blue-500 dark:text-blue-500 mt-2">
            ≈ {formatCurrency(currentYear.avgMonthlyCost / 30)}/jour
          </div>
        </div>

        {/* Consumption Cost Breakdown */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Consommation</span>
            <Zap className="text-amber-600 dark:text-amber-400" size={18} />
          </div>
          <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
            {formatCurrency(currentYear.consumptionCost)}
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {formatKwh(currentYear.totalKwh)} consommés
          </div>
          <div className="text-xs text-amber-500 dark:text-amber-500 mt-2">
            Abonnement: {formatCurrency(currentYear.subscriptionCost)}
          </div>
        </div>

        {/* HC/HP Split */}
        <div className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/30 dark:to-violet-900/30 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Répartition HC/HP</span>
            <div className="flex gap-1">
              <Moon className="text-purple-600 dark:text-purple-400" size={14} />
              <Sun className="text-purple-600 dark:text-purple-400" size={14} />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {hcPercent.toFixed(0)}% HC
          </div>
          <div className="flex gap-2 mt-2">
            <div className="flex-1">
              <div className="text-xs text-purple-600 dark:text-purple-400">Heures Creuses</div>
              <div className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                {formatCurrency(currentYear.hcCost)}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-purple-600 dark:text-purple-400">Heures Pleines</div>
              <div className="text-sm font-semibold text-purple-800 dark:text-purple-200">
                {formatCurrency(currentYear.hpCost)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Previous year comparison */}
      {previousYear && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{previousYear.periodLabel}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(previousYear.totalCost)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {formatKwh(previousYear.totalKwh)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Économie/Surcoût</div>
            <div className={`text-lg font-semibold ${currentYear.totalCost > previousYear.totalCost ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {currentYear.totalCost > previousYear.totalCost ? '+' : ''}{formatCurrency(currentYear.totalCost - previousYear.totalCost)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Par rapport à l'année précédente
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
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
