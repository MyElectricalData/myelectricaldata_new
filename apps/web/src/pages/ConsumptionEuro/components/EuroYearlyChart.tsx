import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Download } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import type { YearlyCost } from '../types/euro.types'

interface EuroYearlyChartProps {
  yearlyCosts: YearlyCost[]
  isDarkMode: boolean
}

// Format currency
const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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

export function EuroYearlyChart({ yearlyCosts, isDarkMode }: EuroYearlyChartProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)

  const handleExportChart = () => {
    const exportData = yearlyCosts.map(year => ({
      year: year.year,
      periodLabel: year.periodLabel,
      totalCost: year.totalCost,
      totalKwh: year.totalKwh,
      consumptionCost: year.consumptionCost,
      subscriptionCost: year.subscriptionCost,
      months: year.months.map(m => ({
        month: m.month,
        monthLabel: m.monthLabel,
        totalCost: m.totalCost,
        hcCost: m.hcCost,
        hpCost: m.hpCost,
        subscriptionCost: m.subscriptionCost,
        totalKwh: m.totalKwh,
        hcKwh: m.hcKwh,
        hpKwh: m.hpKwh
      }))
    }))
    const jsonData = JSON.stringify(exportData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données comparaison annuelle copiées dans le presse-papier')
  }

  // Prepare chart data for monthly comparison - always show all years
  const chartData = useMemo(() => {
    if (yearlyCosts.length === 0) return []

    return MONTH_NAMES.map((label, monthIdx) => {
      const monthNum = String(monthIdx + 1).padStart(2, '0')
      const dataPoint: Record<string, string | number> = { month: label }

      yearlyCosts.forEach((year) => {
        // Find all months matching this month number in the period
        // A rolling year period may have the same month number twice (e.g., Nov 2024 and Nov 2025)
        // We sum them up to represent the full month's data for this period
        const matchingMonths = year.months.filter(m => {
          const parts = m.month.split('-')
          return parts[1] === monthNum
        })

        // Sum up all matching months (handles partial months at period boundaries)
        const totalCost = matchingMonths.reduce((sum, m) => sum + m.totalCost, 0)
        const hcCost = matchingMonths.reduce((sum, m) => sum + m.hcCost, 0)
        const hpCost = matchingMonths.reduce((sum, m) => sum + m.hpCost, 0)
        const subscriptionCost = matchingMonths.reduce((sum, m) => sum + m.subscriptionCost, 0)
        const totalKwh = matchingMonths.reduce((sum, m) => sum + m.totalKwh, 0)

        if (showBreakdown) {
          dataPoint[`${year.year}_HC`] = hcCost
          dataPoint[`${year.year}_HP`] = hpCost
          dataPoint[`${year.year}_Abo`] = subscriptionCost
        } else {
          dataPoint[year.year] = totalCost
        }
        dataPoint[`${year.year}_kWh`] = totalKwh
      })

      return dataPoint
    })
  }, [yearlyCosts, showBreakdown])

  // Calculate totals for all years
  const yearTotals = useMemo(() => {
    return yearlyCosts.map(year => ({
      year: year.year,
      totalCost: year.totalCost,
      totalKwh: year.totalKwh,
      consumptionCost: year.consumptionCost,
      subscriptionCost: year.subscriptionCost
    }))
  }, [yearlyCosts])

  if (yearlyCosts.length === 0) {
    return null
  }

  const colors = {
    grid: isDarkMode ? '#374151' : '#e5e7eb',
    text: isDarkMode ? '#9ca3af' : '#6b7280'
  }

  // Calculate year-over-year difference
  const yoyDiff = yearlyCosts.length >= 2
    ? {
        cost: yearlyCosts[0].totalCost - yearlyCosts[1].totalCost,
        kwh: yearlyCosts[0].totalKwh - yearlyCosts[1].totalKwh,
        costPercent: yearlyCosts[1].totalCost > 0
          ? ((yearlyCosts[0].totalCost - yearlyCosts[1].totalCost) / yearlyCosts[1].totalCost) * 100
          : 0,
        kwhPercent: yearlyCosts[1].totalKwh > 0
          ? ((yearlyCosts[0].totalKwh - yearlyCosts[1].totalKwh) / yearlyCosts[1].totalKwh) * 100
          : 0
      }
    : null

  return (
    <div className="space-y-4">
      {/* Header with export button */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Comparaison annuelle
        </h3>
        <button
          onClick={handleExportChart}
          className="flex items-center justify-center gap-2 min-w-[120px] px-3 py-2 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          <Download size={16} />
          <span>Export JSON</span>
        </button>
      </div>

      {/* Year stats cards */}
      <div className="grid grid-cols-2 gap-4">
        {yearlyCosts.map((year, idx) => {
          const color = YEAR_COLORS[idx % YEAR_COLORS.length]

          return (
            <div
              key={year.year}
              className="p-4 rounded-xl border-2 shadow-lg"
              style={{
                backgroundColor: isDarkMode ? `${color.main}20` : color.light,
                borderColor: color.main,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-lg font-bold"
                  style={{ color: color.main }}
                >
                  {(() => {
                    // Extract years from periodLabel (e.g., "25 janv. 2025 - 24 janv. 2026")
                    const yearMatches = year.periodLabel.match(/(\d{4})/g)
                    if (yearMatches && yearMatches.length >= 2) {
                      return `12 mois (${yearMatches[0]}-${yearMatches[1]})`
                    }
                    return `12 mois (${year.year})`
                  })()}
                </span>
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color.main }}
                />
              </div>

              {/* Period */}
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {year.periodLabel}
              </div>

              {/* Total cost - main stat */}
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {formatCurrency(year.totalCost)}
              </div>

              {/* kWh */}
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {Math.round(year.totalKwh).toLocaleString('fr-FR')} kWh
              </div>

              {/* Monthly average */}
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Moy. {formatCurrency(year.avgMonthlyCost)}/mois
              </div>
            </div>
          )
        })}
      </div>

      {/* Year-over-year comparison badge */}
      {yoyDiff && (
        <div className="flex flex-wrap gap-3 justify-center">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            yoyDiff.cost > 0
              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          }`}>
            <span>{yoyDiff.cost > 0 ? '+' : ''}{formatCurrency(yoyDiff.cost)}</span>
            <span className="opacity-70">({yoyDiff.costPercent > 0 ? '+' : ''}{yoyDiff.costPercent.toFixed(1)}%)</span>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            yoyDiff.kwh > 0
              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          }`}>
            <span>{yoyDiff.kwh > 0 ? '+' : ''}{Math.round(yoyDiff.kwh).toLocaleString('fr-FR')} kWh</span>
            <span className="opacity-70">({yoyDiff.kwhPercent > 0 ? '+' : ''}{yoyDiff.kwhPercent.toFixed(1)}%)</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showBreakdown}
            onChange={(e) => setShowBreakdown(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Voir détail HC/HP
        </label>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis
              dataKey="month"
              tick={{ fill: colors.text, fontSize: 11 }}
              tickLine={{ stroke: colors.grid }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: colors.text, fontSize: 12 }}
              tickLine={{ stroke: colors.grid }}
              tickFormatter={(value) => `${value}€`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelStyle={{ color: isDarkMode ? '#f3f4f6' : '#111827', fontWeight: 'bold' }}
              formatter={(value: number, name: string) => {
                if (name.includes('_kWh')) return [`${Math.round(value)} kWh`, name.replace('_kWh', '')]
                return [formatCurrency(value), name.replace('_HC', ' HC').replace('_HP', ' HP').replace('_Abo', ' Abo')]
              }}
            />

            {showBreakdown ? (
              // Stacked bars for each year with HC/HP/Abo breakdown
              yearlyCosts.map((year, idx) => {
                const color = YEAR_COLORS[idx % YEAR_COLORS.length].main
                return [
                  <Bar
                    key={`${year.year}_HC`}
                    dataKey={`${year.year}_HC`}
                    name={`${year.year} HC`}
                    fill={color}
                    fillOpacity={0.4}
                    stackId={`stack_${idx}`}
                  />,
                  <Bar
                    key={`${year.year}_HP`}
                    dataKey={`${year.year}_HP`}
                    name={`${year.year} HP`}
                    fill={color}
                    fillOpacity={0.7}
                    stackId={`stack_${idx}`}
                  />,
                  <Bar
                    key={`${year.year}_Abo`}
                    dataKey={`${year.year}_Abo`}
                    name={`${year.year} Abo`}
                    fill={color}
                    fillOpacity={1}
                    stackId={`stack_${idx}`}
                  />
                ]
              }).flat()
            ) : (
              // Simple bars for each year (total cost)
              yearlyCosts.map((year, idx) => (
                <Bar
                  key={year.year}
                  dataKey={year.year}
                  name={year.year}
                  fill={YEAR_COLORS[idx % YEAR_COLORS.length].main}
                />
              ))
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table with comparison */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400">Mois</th>
              {yearlyCosts.map((year, idx) => (
                <th
                  key={year.year}
                  className="text-right py-2 px-3 font-semibold"
                  style={{ color: YEAR_COLORS[idx % YEAR_COLORS.length].main }}
                >
                  {year.year}
                </th>
              ))}
              {yearlyCosts.length === 2 && (
                <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400">Diff.</th>
              )}
            </tr>
          </thead>
          <tbody>
            {chartData.map((row, rowIdx) => {
              const values = yearlyCosts.map(year => {
                // When showBreakdown is true, we need to sum HC + HP + Abo
                if (showBreakdown) {
                  const hc = (row[`${year.year}_HC`] as number) || 0
                  const hp = (row[`${year.year}_HP`] as number) || 0
                  const abo = (row[`${year.year}_Abo`] as number) || 0
                  return hc + hp + abo
                }
                return (row[year.year] as number) || 0
              })
              const diff = yearlyCosts.length === 2 ? values[0] - values[1] : null

              return (
                <tr key={rowIdx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="py-2 px-3 text-gray-900 dark:text-gray-100">{row.month}</td>
                  {yearlyCosts.map((year, i) => (
                    <td key={year.year} className="py-2 px-3 text-right text-gray-600 dark:text-gray-400">
                      {formatCurrency(values[i])}
                    </td>
                  ))}
                  {diff !== null && (
                    <td className={`py-2 px-3 text-right font-medium ${diff > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-800/50 font-semibold">
              <td className="py-2 px-3 text-gray-900 dark:text-gray-100">Total</td>
              {yearTotals.map((total, idx) => (
                <td
                  key={total.year}
                  className="py-2 px-3 text-right"
                  style={{ color: YEAR_COLORS[idx % YEAR_COLORS.length].main }}
                >
                  {formatCurrency(total.totalCost)}
                </td>
              ))}
              {yearlyCosts.length === 2 && yearTotals.length === 2 && (
                <td className={`py-2 px-3 text-right font-bold ${
                  yearTotals[0].totalCost - yearTotals[1].totalCost > 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {yearTotals[0].totalCost - yearTotals[1].totalCost > 0 ? '+' : ''}
                  {formatCurrency(yearTotals[0].totalCost - yearTotals[1].totalCost)}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}
