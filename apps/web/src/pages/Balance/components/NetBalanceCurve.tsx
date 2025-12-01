import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'
import type { BalanceChartData } from '../types/balance.types'

interface NetBalanceCurveProps {
  chartData: BalanceChartData
  isDarkMode: boolean
}

export function NetBalanceCurve({ chartData, isDarkMode }: NetBalanceCurveProps) {
  const handleExport = () => {
    const jsonData = JSON.stringify(chartData.byDay, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Donnees journalieres copiees dans le presse-papier')
  }

  // Prepare daily data for the chart (convert to kWh)
  const data = chartData.byDay.map(day => ({
    date: day.date,
    dateLabel: new Date(day.date + 'T00:00:00').toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short'
    }),
    netBalance: day.netBalance / 1000,
    consumption: day.consumption / 1000,
    production: day.production / 1000
  }))

  // Custom gradient definitions
  const gradientOffset = () => {
    const dataMax = Math.max(...data.map(d => d.netBalance))
    const dataMin = Math.min(...data.map(d => d.netBalance))

    if (dataMax <= 0) return 0
    if (dataMin >= 0) return 1
    return dataMax / (dataMax - dataMin)
  }

  const off = gradientOffset()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Bilan net journalier
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Production - Consommation par jour
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

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset={off} stopColor="#10B981" stopOpacity={0.8} />
                <stop offset={off} stopColor="#EF4444" stopOpacity={0.8} />
              </linearGradient>
              <linearGradient id="splitColorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={off} stopColor="#10B981" stopOpacity={0.3} />
                <stop offset={off} stopColor="#EF4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
            <XAxis
              dataKey="date"
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '10px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              tickFormatter={(value) => {
                const date = new Date(value + 'T00:00:00')
                return date.toLocaleDateString('fr-FR', { month: 'short' })
              }}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '12px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              tickFormatter={(value) => `${value.toFixed(0)}`}
              label={{
                value: 'kWh',
                angle: -90,
                position: 'insideLeft',
                style: { fill: isDarkMode ? '#FFFFFF' : '#6B7280', fontSize: '12px' }
              }}
            />
            <Tooltip
              cursor={{ stroke: isDarkMode ? '#6B7280' : '#D1D5DB', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`,
                borderRadius: '8px',
                color: isDarkMode ? '#F9FAFB' : '#111827'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'netBalance') {
                  const color = value >= 0 ? '#10B981' : '#EF4444'
                  const label = value >= 0 ? 'Surplus' : 'Deficit'
                  return [
                    <span key="value" style={{ color }}>{value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh</span>,
                    label
                  ]
                }
                return [`${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, name]
              }}
              labelFormatter={(label) => {
                const date = new Date(label + 'T00:00:00')
                return date.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })
              }}
            />
            <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="netBalance"
              stroke="url(#splitColor)"
              fill="url(#splitColorFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Surplus (injection)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500"></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">Deficit (soutirage)</span>
        </div>
      </div>
    </div>
  )
}
