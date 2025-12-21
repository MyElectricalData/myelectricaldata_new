import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import { ModernButton } from './ModernButton'

interface YearlyProductionProps {
  chartData: {
    byYear: any[]
    byMonthComparison: any[]
    years: string[]
  }
  productionData: any
  isDarkMode: boolean
}

export function YearlyProduction({ chartData, isDarkMode }: YearlyProductionProps) {
  const handleExportMonthly = () => {
    const jsonData = JSON.stringify(chartData.byMonthComparison, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données mensuelles copiées dans le presse-papier')
  }

  return (
    <div>
      {/* Monthly Comparison Chart */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Comparaison mensuelle par année
        </h3>
        <ModernButton
          variant="gradient"
          size="sm"
          icon={Download}
          iconPosition="left"
          onClick={handleExportMonthly}
        >
          Export JSON
        </ModernButton>
      </div>
      <div className="bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
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
              cursor={{ fill: 'rgba(16, 185, 129, 0.1)' }}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number) => [`${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`, 'Production']}
            />
            <Legend />
            {chartData.years.map((year, index) => {
              const colors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']
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
  )
}
