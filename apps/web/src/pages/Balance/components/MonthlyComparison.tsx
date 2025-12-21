import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import type { BalanceChartData } from '../types/balance.types'

interface MonthlyComparisonProps {
  chartData: BalanceChartData
  isDarkMode: boolean
  selectedYears: string[]
}

export function MonthlyComparison({ chartData, isDarkMode, selectedYears }: MonthlyComparisonProps) {
  const handleExport = () => {
    const jsonData = JSON.stringify(chartData.byMonth, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Donnees mensuelles copiees dans le presse-papier')
  }

  // Use selected years or all years if none selected
  const years = selectedYears.length > 0 ? selectedYears : chartData.years

  // Prepare data for the chart
  const data = chartData.byMonth.map(month => {
    const entry: Record<string, string | number> = {
      monthLabel: month.monthLabel
    }

    years.forEach(year => {
      entry[`conso_${year}`] = (month[`conso_${year}`] as number || 0) / 1000 // Convert to kWh
      entry[`prod_${year}`] = (month[`prod_${year}`] as number || 0) / 1000
    })

    return entry
  })

  const consoColors = ['#3B82F6', '#60A5FA', '#93C5FD'] // Blue shades
  const prodColors = ['#10B981', '#34D399', '#6EE7B7'] // Green shades

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-4 transition-colors duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Comparaison mensuelle Production vs Consommation
        </h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Download size={16} className="flex-shrink-0" />
          <span>Export JSON</span>
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} barGap={1} barCategoryGap="1%">
            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
            <XAxis
              dataKey="monthLabel"
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '12px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
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
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              contentStyle={{
                backgroundColor: isDarkMode ? '#1F2937' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`,
                borderRadius: '8px',
                color: isDarkMode ? '#F9FAFB' : '#111827'
              }}
              formatter={(value: number, name: string) => {
                const isProduction = name.startsWith('prod_')
                const year = name.split('_')[1]
                const label = isProduction ? `Production ${year}` : `Consommation ${year}`
                return [`${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWh`, label]
              }}
            />
            <ReferenceLine y={0} stroke="#6B7280" />

            {years.map((year, index) => (
              <Bar
                key={`conso_${year}`}
                dataKey={`conso_${year}`}
                fill={consoColors[index % consoColors.length]}
                radius={[4, 4, 0, 0]}
                name={`conso_${year}`}
              />
            ))}
            {years.map((year, index) => (
              <Bar
                key={`prod_${year}`}
                dataKey={`prod_${year}`}
                fill={prodColors[index % prodColors.length]}
                radius={[4, 4, 0, 0]}
                name={`prod_${year}`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
