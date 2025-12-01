import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts'
import { Download, ZoomOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { ModernButton } from './ModernButton'

interface MonthData {
  month: string
  monthLabel: string
  consumption: number
  consommation: number
}

interface YearData {
  label: string
  byMonth: MonthData[]
}

interface AnnualCurveProps {
  chartData: {
    byMonth: MonthData[]
    yearsByPeriod?: YearData[]
  }
  isDarkMode: boolean
}

export function AnnualCurve({ chartData, isDarkMode }: AnnualCurveProps) {
  // If we have yearsByPeriod array from chartData, use it, otherwise create a single year
  const yearsData: YearData[] = chartData.yearsByPeriod || [{
    label: 'Année courante',
    byMonth: chartData.byMonth
  }]

  // Track selected years with a Set (allows multiple selections)
  // Default to the most recent year (last index after reverse)
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    new Set([yearsData.length > 0 ? yearsData.length - 1 : 0])
  )

  // Zoom state
  const [refAreaLeft, setRefAreaLeft] = useState<string>('')
  const [refAreaRight, setRefAreaRight] = useState<string>('')
  const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null)

  if (yearsData.length === 0) {
    return null
  }

  const toggleYearSelection = (index: number) => {
    const newSelection = new Set(selectedYears)
    if (newSelection.has(index)) {
      // Don't allow deselecting the last selected year
      if (newSelection.size > 1) {
        newSelection.delete(index)
      }
    } else {
      newSelection.add(index)
    }
    setSelectedYears(newSelection)
  }

  const handleExport = () => {
    const selectedData = Array.from(selectedYears)
      .map(index => yearsData[index])
      .filter((yearData): yearData is YearData => yearData !== undefined && yearData.byMonth !== undefined)
      .sort((a, b) => b.label.localeCompare(a.label))
    const jsonData = JSON.stringify(selectedData, null, 2)
    navigator.clipboard.writeText(jsonData)
    const yearLabels = selectedData.map(d => d.label).join(', ')
    toast.success(`Données de ${yearLabels} copiées dans le presse-papier`)
  }

  const zoomOut = () => {
    setZoomDomain(null)
    setRefAreaLeft('')
    setRefAreaRight('')
  }

  const zoom = () => {
    if (!refAreaLeft || !refAreaRight) return

    // Get indices
    let left = chartDataMerged.findIndex(item => item.monthLabel === refAreaLeft)
    let right = chartDataMerged.findIndex(item => item.monthLabel === refAreaRight)

    if (left === right || left === -1 || right === -1) {
      setRefAreaLeft('')
      setRefAreaRight('')
      return
    }

    // Swap if needed
    if (left > right) [left, right] = [right, left]

    setZoomDomain({ left, right })
    setRefAreaLeft('')
    setRefAreaRight('')
  }

  // Prepare chart data with all selected years
  const chartDataMerged = (() => {
    const selectedYearsData = Array.from(selectedYears)
      .map(index => yearsData[index])
      .filter((yearData): yearData is YearData => yearData !== undefined && yearData.byMonth !== undefined)
      .sort((a, b) => b.label.localeCompare(a.label)) // Sort by year descending

    // Create a map using normalized month keys (YYYY-MM) to overlay years
    const monthsMap = new Map<string, any>()

    selectedYearsData.forEach((yearData) => {
      yearData.byMonth.forEach(monthData => {
        // Extract month from YYYY-MM format (e.g., "2025-01" -> "01")
        const monthOnly = monthData.month.substring(5, 7) // Get MM part

        // Create a normalized month label (e.g., "janv.")
        const normalizedDate = new Date(`2000-${monthOnly}-01`)
        const normalizedLabel = normalizedDate.toLocaleDateString('fr-FR', { month: 'short' })

        if (!monthsMap.has(monthOnly)) {
          monthsMap.set(monthOnly, {
            monthLabel: normalizedLabel,
            monthNum: monthOnly
          })
        }

        const entry = monthsMap.get(monthOnly)!
        // Add data for this year
        entry[`consumption_${yearData.label}`] = monthData.consumption
      })
    })

    // Convert to array and sort by month number
    return Array.from(monthsMap.values()).sort((a, b) =>
      a.monthNum.localeCompare(b.monthNum)
    )
  })()

  const selectedYearsData = Array.from(selectedYears)
    .map(index => yearsData[index])
    .filter((yearData): yearData is YearData => yearData !== undefined && yearData.byMonth !== undefined)
    .sort((a, b) => b.label.localeCompare(a.label))

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4']

  // Get display data based on zoom
  const displayData = zoomDomain
    ? chartDataMerged.slice(zoomDomain.left, zoomDomain.right + 1)
    : chartDataMerged

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Courbe de consommation annuelle
      </h3>

      {/* Tabs and buttons - responsive layout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Tabs on the left - Allow multiple selection */}
        <div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
          {[...yearsData].reverse().map((yearData, idx) => {
            const originalIndex = yearsData.length - 1 - idx
            const isSelected = selectedYears.has(originalIndex)
            return (
              <ModernButton
                key={yearData.label}
                variant="tab"
                size="md"
                isActive={isSelected}
                onClick={() => toggleYearSelection(originalIndex)}
                className="flex-1 min-w-[100px]"
              >
                {yearData.label}
              </ModernButton>
            )
          })}
        </div>

        {/* Action buttons on the right */}
        <div className="flex gap-2">
          {zoomDomain && (
            <ModernButton
              variant="gradient"
              size="sm"
              icon={ZoomOut}
              iconPosition="left"
              onClick={zoomOut}
              title="Réinitialiser le zoom"
              className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
            >
              Réinitialiser
            </ModernButton>
          )}
          <ModernButton
            variant="gradient"
            size="sm"
            icon={Download}
            iconPosition="left"
            onClick={handleExport}
          >
            Export JSON
          </ModernButton>
        </div>
      </div>

      {/* Display selected years chart */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={displayData}
            onMouseDown={(e) => e && e.activeLabel && setRefAreaLeft(e.activeLabel)}
            onMouseMove={(e) => refAreaLeft && e && e.activeLabel && setRefAreaRight(e.activeLabel)}
            onMouseUp={zoom}
          >
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
              cursor={{ stroke: colors[0], strokeWidth: 2 }}
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

            {/* Dynamically create lines for each selected year */}
            {selectedYearsData.map((yearData, index) => (
              <Line
                key={yearData.label}
                type="monotone"
                dataKey={`consumption_${yearData.label}`}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={{ fill: colors[index % colors.length], r: 4 }}
                activeDot={{ r: 6 }}
                name={yearData.label}
              />
            ))}

            {/* Selection area for zooming */}
            {refAreaLeft && refAreaRight && (
              <ReferenceArea
                x1={refAreaLeft}
                x2={refAreaRight}
                strokeOpacity={0.3}
                fill={isDarkMode ? "#6366f1" : "#818cf8"}
                fillOpacity={0.3}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Zoom instruction */}
        {!zoomDomain && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            💡 Cliquez et glissez sur le graphique pour zoomer sur une période
          </p>
        )}
      </div>

      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>ℹ️ Note :</strong> Cette courbe présente votre consommation mensuelle sur des périodes glissantes de 365 jours. Vous pouvez sélectionner plusieurs périodes pour les comparer.
        </p>
      </div>
    </div>
  )
}
