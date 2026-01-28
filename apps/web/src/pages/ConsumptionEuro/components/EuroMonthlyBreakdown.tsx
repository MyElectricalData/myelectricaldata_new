import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { ChevronDown, ChevronUp, Download } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import type { YearlyCost } from '../types/euro.types'

interface EuroMonthlyBreakdownProps {
  yearlyCosts: YearlyCost[]
  isDarkMode: boolean
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

// Year colors for comparison
const YEAR_COLORS = [
  { main: '#10b981', light: '#d1fae5' }, // Green
  { main: '#6366f1', light: '#e0e7ff' }, // Indigo
  { main: '#f59e0b', light: '#fef3c7' }, // Amber
  { main: '#ec4899', light: '#fce7f3' }, // Pink
]

// Full month names in French
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export function EuroMonthlyBreakdown({ yearlyCosts, isDarkMode }: EuroMonthlyBreakdownProps) {
  const [expandedYear, setExpandedYear] = useState<string | null>(yearlyCosts[0]?.year || null)

  const handleExportBreakdown = () => {
    const exportData = yearlyCosts.map(year => ({
      year: year.year,
      periodLabel: year.periodLabel,
      totalCost: year.totalCost,
      consumptionCost: year.consumptionCost,
      subscriptionCost: year.subscriptionCost,
      hcCost: year.hcCost,
      hpCost: year.hpCost,
      totalKwh: year.totalKwh,
      hcKwh: year.hcKwh,
      hpKwh: year.hpKwh,
      months: year.months.map(m => ({
        month: m.month,
        monthLabel: m.monthLabel,
        totalCost: m.totalCost,
        consumptionCost: m.consumptionCost,
        subscriptionCost: m.subscriptionCost,
        hcCost: m.hcCost,
        hpCost: m.hpCost,
        totalKwh: m.totalKwh,
        hcKwh: m.hcKwh,
        hpKwh: m.hpKwh
      }))
    }))
    const jsonData = JSON.stringify(exportData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Détail mensuel copié dans le presse-papier')
  }

  // Prepare year comparison data - always show all years
  const comparisonData = useMemo(() => {
    if (yearlyCosts.length === 0) return []

    return MONTH_NAMES.map((label, idx) => {
      const monthNum = String(idx + 1).padStart(2, '0')
      const dataPoint: Record<string, string | number> = { month: label }

      yearlyCosts.forEach((year) => {
        const monthData = year.months.find(m => m.month.endsWith(`-${monthNum}`))
        dataPoint[year.year] = monthData?.totalCost || 0
        dataPoint[`${year.year}_kWh`] = monthData?.totalKwh || 0
      })

      return dataPoint
    })
  }, [yearlyCosts])

  const colors = {
    grid: isDarkMode ? '#374151' : '#e5e7eb',
    text: isDarkMode ? '#9ca3af' : '#6b7280'
  }

  if (yearlyCosts.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Header with export button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Détail mensuel
        </h3>
        <button
          onClick={handleExportBreakdown}
          className="flex items-center justify-center gap-2 min-w-[120px] px-3 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Download size={16} />
          <span>Export JSON</span>
        </button>
      </div>

      {/* Year comparison chart */}
      {yearlyCosts.length >= 1 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Comparaison des coûts mensuels
          </h4>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={comparisonData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: colors.text, fontSize: 10 }}
                  tickLine={{ stroke: colors.grid }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: colors.text, fontSize: 11 }}
                  tickLine={{ stroke: colors.grid }}
                  tickFormatter={(value) => `${value}€`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                    border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                    borderRadius: '8px'
                  }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
                {yearlyCosts.map((year, idx) => {
                  const color = YEAR_COLORS[idx % YEAR_COLORS.length].main
                  return (
                    <Area
                      key={year.year}
                      type="monotone"
                      dataKey={year.year}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Expandable year details */}
      <div className="space-y-3">
        {yearlyCosts.map(year => (
          <div
            key={year.year}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            {/* Year header */}
            <button
              onClick={() => setExpandedYear(expandedYear === year.year ? null : year.year)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {(() => {
                    // Extract years from periodLabel (e.g., "25 janv. 2025 - 24 janv. 2026")
                    const yearMatches = year.periodLabel.match(/(\d{4})/g)
                    if (yearMatches && yearMatches.length >= 2) {
                      return `12 mois (${yearMatches[0]}-${yearMatches[1]})`
                    }
                    return `12 mois (${year.year})`
                  })()}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {year.periodLabel}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold text-primary-600 dark:text-primary-400">
                  {formatCurrency(year.totalCost)}
                </span>
                {expandedYear === year.year ? (
                  <ChevronUp className="text-gray-400" size={20} />
                ) : (
                  <ChevronDown className="text-gray-400" size={20} />
                )}
              </div>
            </button>

            {/* Year details */}
            {expandedYear === year.year && (
              <div className="p-4 space-y-4">
                {/* Summary stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                    <span className="text-green-600 dark:text-green-400 text-xs">Consommation</span>
                    <div className="font-semibold text-green-900 dark:text-green-100">
                      {formatCurrency(year.consumptionCost)}
                    </div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                    <span className="text-blue-600 dark:text-blue-400 text-xs">Abonnement</span>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {formatCurrency(year.subscriptionCost)}
                    </div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                    <span className="text-purple-600 dark:text-purple-400 text-xs">Heures Creuses</span>
                    <div className="font-semibold text-purple-900 dark:text-purple-100">
                      {formatCurrency(year.hcCost)}
                    </div>
                  </div>
                  <div className="bg-pink-50 dark:bg-pink-900/20 p-3 rounded-lg">
                    <span className="text-pink-600 dark:text-pink-400 text-xs">Heures Pleines</span>
                    <div className="font-semibold text-pink-900 dark:text-pink-100">
                      {formatCurrency(year.hpCost)}
                    </div>
                  </div>
                </div>

                {/* Monthly breakdown table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">Mois</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Total kWh</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">HC kWh</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">HP kWh</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Coût Conso</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400">Abo</th>
                        <th className="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...year.months].reverse().map(month => (
                        <tr
                          key={month.month}
                          className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                        >
                          <td className="py-2 px-2 text-gray-900 dark:text-gray-100">{month.monthLabel}</td>
                          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{Math.round(month.totalKwh)}</td>
                          <td className="py-2 px-2 text-right text-purple-600 dark:text-purple-400">{Math.round(month.hcKwh)}</td>
                          <td className="py-2 px-2 text-right text-pink-600 dark:text-pink-400">{Math.round(month.hpKwh)}</td>
                          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(month.consumptionCost)}</td>
                          <td className="py-2 px-2 text-right text-gray-600 dark:text-gray-400">{formatCurrency(month.subscriptionCost)}</td>
                          <td className="py-2 px-2 text-right font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(month.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-primary-50 dark:bg-primary-900/20 font-semibold">
                        <td className="py-2 px-2 text-primary-900 dark:text-primary-100">Total</td>
                        <td className="py-2 px-2 text-right text-primary-700 dark:text-primary-300">{Math.round(year.totalKwh)}</td>
                        <td className="py-2 px-2 text-right text-purple-700 dark:text-purple-300">{Math.round(year.hcKwh)}</td>
                        <td className="py-2 px-2 text-right text-pink-700 dark:text-pink-300">{Math.round(year.hpKwh)}</td>
                        <td className="py-2 px-2 text-right text-primary-700 dark:text-primary-300">{formatCurrency(year.consumptionCost)}</td>
                        <td className="py-2 px-2 text-right text-primary-700 dark:text-primary-300">{formatCurrency(year.subscriptionCost)}</td>
                        <td className="py-2 px-2 text-right text-primary-600 dark:text-primary-400">{formatCurrency(year.totalCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
