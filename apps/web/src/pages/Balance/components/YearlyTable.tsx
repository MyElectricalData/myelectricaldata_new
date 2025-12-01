import { Download, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'
import type { BalanceChartData } from '../types/balance.types'

interface YearlyTableProps {
  chartData: BalanceChartData
  hasDetailedData: boolean
}

export function YearlyTable({ chartData, hasDetailedData }: YearlyTableProps) {
  const handleExport = () => {
    const exportData = chartData.byYear.map(year => ({
      annee: year.year,
      consommation_kwh: (year.consumption / 1000).toFixed(2),
      production_kwh: (year.production / 1000).toFixed(2),
      bilan_net_kwh: (year.netBalance / 1000).toFixed(2),
      autoconsommation_pct: year.selfConsumptionRate.toFixed(1),
      debut: year.startDate.toISOString().split('T')[0],
      fin: year.endDate.toISOString().split('T')[0]
    }))
    const jsonData = JSON.stringify(exportData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Donnees annuelles copiees dans le presse-papier')
  }

  const formatKwh = (wh: number) => {
    return (wh / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recapitulatif par annee
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasDetailedData ? 'Autoconsommation calculee sur donnees 30min' : 'Autoconsommation estimee sur donnees journalieres'}
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Download size={16} className="flex-shrink-0" />
          <span>Export JSON</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Annee
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Consommation
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Production
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Bilan Net
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Autoconso.
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Periode
              </th>
            </tr>
          </thead>
          <tbody>
            {chartData.byYear.map((year, index) => {
              const isPositive = year.netBalance >= 0
              return (
                <tr
                  key={year.year}
                  className={`border-b border-gray-100 dark:border-gray-700/50 ${
                    index % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-700/20' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <span className="font-bold text-gray-900 dark:text-white">{year.year}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                      {formatKwh(year.consumption)} kWh
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                      {formatKwh(year.production)} kWh
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {isPositive ? (
                        <TrendingUp size={16} className="text-green-500" />
                      ) : (
                        <TrendingDown size={16} className="text-red-500" />
                      )}
                      <span className={`font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isPositive ? '+' : ''}{formatKwh(year.netBalance)} kWh
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-purple-600 dark:text-purple-400 font-medium">
                      {year.selfConsumptionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {year.startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                      {' - '}
                      {year.endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 dark:bg-gray-700/50 font-bold">
              <td className="py-3 px-4 text-gray-900 dark:text-white">Total</td>
              <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">
                {formatKwh(chartData.totals.consumption)} kWh
              </td>
              <td className="py-3 px-4 text-right text-yellow-600 dark:text-yellow-400">
                {formatKwh(chartData.totals.production)} kWh
              </td>
              <td className="py-3 px-4 text-right">
                <span className={chartData.totals.netBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {chartData.totals.netBalance >= 0 ? '+' : ''}{formatKwh(chartData.totals.netBalance)} kWh
                </span>
              </td>
              <td className="py-3 px-4 text-right text-purple-600 dark:text-purple-400">
                {chartData.totals.selfConsumptionRate.toFixed(1)}%
              </td>
              <td className="py-3 px-4"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
