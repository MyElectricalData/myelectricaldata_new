import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'

interface YearlyConsumptionProps {
  chartData: {
    byYear: any[]
    byMonthComparison: any[]
    years: string[]
  }
  consumptionData: any
  isDarkMode: boolean
}

export function YearlyConsumption({ chartData, consumptionData, isDarkMode }: YearlyConsumptionProps) {
  const handleExportYearly = () => {
    const intervalLength = consumptionData?.meter_reading?.reading_type?.interval_length || 'P1D'
    const unit = consumptionData?.meter_reading?.reading_type?.unit || 'W'
    const jsonData = JSON.stringify({
      interval_length: intervalLength,
      unit_raw: unit,
      data: chartData.byYear
    }, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données annuelles copiées dans le presse-papier')
  }

  const handleExportMonthly = () => {
    const jsonData = JSON.stringify(chartData.byMonthComparison, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données mensuelles copiées dans le presse-papier')
  }

  return (
    <div className="space-y-8">
      {/* Yearly Consumption Chart */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Consommation par année
          </h3>
          <button
            onClick={handleExportYearly}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Download size={16} className="flex-shrink-0" />
            <span>Export JSON</span>
          </button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData.byYear}>
              <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
              <XAxis
                dataKey="year"
                stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              />
              <YAxis
                stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)} kWh`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB'
                }}
                formatter={(value: number) => [`${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, 'Consommation']}
              />
              <Legend />
              <Bar
                dataKey="consommation"
                fill="#3B82F6"
                radius={[8, 8, 0, 0]}
                name="Consommation (kWh)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Comparison Chart */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Comparaison mensuelle par année
          </h3>
          <button
            onClick={handleExportMonthly}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Download size={16} className="flex-shrink-0" />
            <span>Export JSON</span>
          </button>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData.byMonthComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
              <XAxis
                dataKey="monthLabel"
                stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              />
              <YAxis
                stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
                style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)} kWh`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                contentStyle={{
                  backgroundColor: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F9FAFB'
                }}
                formatter={(value: number) => [`${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, 'Consommation']}
              />
              <Legend />
              {chartData.years.map((year, index) => {
                const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']
                return (
                  <Bar
                    key={year}
                    dataKey={year}
                    fill={colors[index % colors.length]}
                    radius={[4, 4, 0, 0]}
                    name={year}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
