import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Download, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'

interface MonthlyData {
  month: string
  hcKwh: number
  hpKwh: number
  totalKwh: number
}

interface YearData {
  year: string
  months: MonthlyData[]
}

interface MonthlyHcHpProps {
  monthlyHcHpByYear: YearData[]
  selectedPDLDetails: any
  isDarkMode: boolean
}

export function MonthlyHcHp({ monthlyHcHpByYear, selectedPDLDetails, isDarkMode }: MonthlyHcHpProps) {
  const [selectedMonthlyHcHpYear, setSelectedMonthlyHcHpYear] = useState(0)
  const [showYearComparison, setShowYearComparison] = useState(false)

  if (monthlyHcHpByYear.length === 0 || !selectedPDLDetails?.offpeak_hours) {
    return null
  }

  const handleExport = () => {
    const jsonData = JSON.stringify(monthlyHcHpByYear, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données HC/HP mensuelles copiées dans le presse-papier')
  }

  const getChartData = () => {
    const yearData = monthlyHcHpByYear[selectedMonthlyHcHpYear]
    const previousYearData = showYearComparison && selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear[1]
      ? monthlyHcHpByYear[1]
      : null

    let chartData = yearData.months

    if (previousYearData) {
      // Create a map of previous year data by month name
      const prevDataMap = new Map(
        previousYearData.months.map(m => {
          const monthName = m.month.split(' ')[0] // Extract month name
          return [monthName, { hcKwh: m.hcKwh, hpKwh: m.hpKwh }]
        })
      )

      // Merge with current year data
      chartData = yearData.months.map(m => {
        const monthName = m.month.split(' ')[0]
        const prevData = prevDataMap.get(monthName)
        return {
          month: monthName,
          hcKwh: m.hcKwh,
          hpKwh: m.hpKwh,
          totalKwh: m.totalKwh,
          prevHcKwh: prevData?.hcKwh || 0,
          prevHpKwh: prevData?.hpKwh || 0,
        }
      })
    }

    return { chartData, yearData, previousYearData }
  }

  const { chartData, yearData, previousYearData } = getChartData()

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Consommation HC/HP par mois
      </h3>

      {/* Tabs and buttons on same line */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Tabs on the left */}
        <div className="flex gap-2 flex-1">
          {monthlyHcHpByYear.map((yearData, index) => (
            <button
              key={yearData.year}
              onClick={() => setSelectedMonthlyHcHpYear(index)}
              className={`flex-1 px-4 py-2.5 font-semibold rounded-lg transition-all duration-200 ${
                selectedMonthlyHcHpYear === index
                  ? 'bg-primary-600 text-white shadow-lg'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-400 dark:hover:border-primary-600'
              }`}
            >
              {yearData.year}
            </button>
          ))}
        </div>

        {/* Buttons on the right */}
        <div className="flex items-center gap-2">
          {/* Comparison toggle - always show but disable when not available */}
          <button
            onClick={() => {
              if (selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear.length > 1) {
                setShowYearComparison(!showYearComparison)
              }
            }}
            disabled={!(selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear.length > 1)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 shadow-sm ${
              showYearComparison && selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear.length > 1
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-md'
                : !(selectedMonthlyHcHpYear === 0 && monthlyHcHpByYear.length > 1)
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-50'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <CalendarRange size={16} className="flex-shrink-0" />
            <span>Année -1</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 transform hover:scale-105"
          >
            <Download size={16} className="flex-shrink-0" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Display selected year chart */}
      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
            <XAxis
              dataKey="month"
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              tick={{ fill: isDarkMode ? '#FFFFFF' : '#6B7280', fontSize: 12 }}
            />
            <YAxis
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              tick={{ fill: isDarkMode ? '#FFFFFF' : '#6B7280', fontSize: 12 }}
              label={{ value: 'Consommation (kWh)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(59, 130, 246, 0.15)' }}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' kWh'}
            />
            <Legend />
            {showYearComparison && previousYearData ? (
              <>
                <Bar dataKey="hcKwh" name={`HC ${yearData.year}`} stackId="current" fill="#3b82f6" />
                <Bar dataKey="hpKwh" name={`HP ${yearData.year}`} stackId="current" fill="#f97316" />
                <Bar dataKey="prevHcKwh" name={`HC ${previousYearData.year}`} stackId="previous" fill="#93c5fd" />
                <Bar dataKey="prevHpKwh" name={`HP ${previousYearData.year}`} stackId="previous" fill="#fdba74" />
              </>
            ) : (
              <>
                <Bar dataKey="hcKwh" name="Heures Creuses (HC)" stackId="a" fill="#3b82f6" />
                <Bar dataKey="hpKwh" name="Heures Pleines (HP)" stackId="a" fill="#f97316" />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
