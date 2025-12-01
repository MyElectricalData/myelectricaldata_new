import { TrendingUp, TrendingDown, Zap, Sun, Home, Percent } from 'lucide-react'
import type { BalanceChartData } from '../types/balance.types'

interface BalanceSummaryCardsProps {
  chartData: BalanceChartData
  hasDetailedData: boolean
}

export function BalanceSummaryCards({ chartData, hasDetailedData }: BalanceSummaryCardsProps) {
  const { totals } = chartData
  const isPositiveBalance = totals.netBalance >= 0

  const formatKwh = (wh: number) => {
    return (wh / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Consumption */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Home className="text-blue-600 dark:text-blue-400" size={20} />
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Consommation</span>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatKwh(totals.consumption)} <span className="text-base font-normal">kWh</span>
        </p>
      </div>

      {/* Total Production */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
            <Sun className="text-yellow-600 dark:text-yellow-400" size={20} />
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Production</span>
        </div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatKwh(totals.production)} <span className="text-base font-normal">kWh</span>
        </p>
      </div>

      {/* Net Balance */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-lg ${isPositiveBalance ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
            {isPositiveBalance ? (
              <TrendingUp className="text-green-600 dark:text-green-400" size={20} />
            ) : (
              <TrendingDown className="text-red-600 dark:text-red-400" size={20} />
            )}
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bilan Net</span>
        </div>
        <p className={`text-2xl font-bold ${isPositiveBalance ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {isPositiveBalance ? '+' : ''}{formatKwh(totals.netBalance)} <span className="text-base font-normal">kWh</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {isPositiveBalance ? 'Surplus injecté' : 'Déficit soutiré'}
        </p>
      </div>

      {/* Self-Consumption Rate */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
            <Percent className="text-purple-600 dark:text-purple-400" size={20} />
          </div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Autoconsommation</span>
        </div>
        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
          {totals.selfConsumptionRate.toFixed(1)} <span className="text-base font-normal">%</span>
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {hasDetailedData ? 'Calcul précis (30min)' : 'Estimation journalière'}
        </p>
      </div>
    </div>
  )
}
