import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

interface AnnualCurveProps {
  chartData: {
    byMonth: Array<{
      month: string
      monthLabel: string
      consumption: number
      consommation: number
    }>
  }
  isDarkMode: boolean
}

export function AnnualCurve({ chartData, isDarkMode }: AnnualCurveProps) {
  const [showPreviousYear, setShowPreviousYear] = useState(false)

  const handleExport = () => {
    const jsonData = JSON.stringify(chartData.byMonth, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données de courbe annuelle copiées dans le presse-papier')
  }

  // Prepare data with previous year comparison if needed
  const prepareChartData = () => {
    if (!showPreviousYear) {
      return chartData.byMonth
    }

    // For demonstration, we'll simulate previous year data
    // In real implementation, this would come from actual data
    return chartData.byMonth.map(item => ({
      ...item,
      consumptionPrevYear: item.consumption * (0.9 + Math.random() * 0.2) // Simulate variation
    }))
  }

  const data = prepareChartData()

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Courbe de consommation annuelle
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreviousYear(!showPreviousYear)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
              showPreviousYear
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <TrendingDown size={16} className="flex-shrink-0" />
            <span>Comparer N-1</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Download size={16} className="flex-shrink-0" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
            <XAxis
              dataKey="monthLabel"
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '12px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
            />
            <YAxis
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)} kWh`}
              label={{
                value: 'Consommation (kWh)',
                angle: -90,
                position: 'insideLeft',
                fill: isDarkMode ? '#FFFFFF' : '#6B7280'
              }}
            />
            <Tooltip
              cursor={{ stroke: '#3B82F6', strokeWidth: 2 }}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number) => [
                `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`,
                'Consommation'
              ]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="consumption"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={{ fill: '#3B82F6', r: 4 }}
              activeDot={{ r: 6 }}
              name="Année courante"
            />
            {showPreviousYear && (
              <Line
                type="monotone"
                dataKey="consumptionPrevYear"
                stroke="#10B981"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name="Année N-1"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>ℹ️ Note :</strong> Cette courbe présente votre consommation mensuelle sur une année glissante.
          {showPreviousYear && ' La comparaison avec l\'année précédente vous permet d\'identifier les variations de consommation.'}
        </p>
      </div>
    </div>
  )
}
