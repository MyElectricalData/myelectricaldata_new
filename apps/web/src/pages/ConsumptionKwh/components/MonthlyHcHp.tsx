import React, { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts'
import { Download, ZoomOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { ModernButton } from './ModernButton'

interface MonthlyData {
  month: string
  hcKwh: number
  hpKwh: number
  totalKwh: number
}

interface YearData {
  year: string
  months: MonthlyData[]
  dataAvailable?: number
  totalDays?: number
}

interface MonthlyHcHpProps {
  monthlyHcHpByYear: YearData[]
  selectedPDLDetails: any
  isDarkMode: boolean
}

// Graph colors for tabs - matching the HC bars in the chart
const graphColors = ['#3B82F6', '#93C5FD', '#60A5FA', '#2563EB']

// Convert hex to rgba for tab backgrounds
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function MonthlyHcHp({ monthlyHcHpByYear, selectedPDLDetails, isDarkMode }: MonthlyHcHpProps) {
  // Track selected years with a Set (allows multiple selections)
  // Default to the most recent year (find the highest year value)
  const [selectedYears, setSelectedYears] = useState<Set<number>>(() => {
    if (monthlyHcHpByYear.length === 0) return new Set([0])

    // Find index of the most recent year (highest year number)
    const mostRecentIndex = monthlyHcHpByYear.reduce((maxIdx, current, currentIdx, array) => {
      return parseInt(current.year) > parseInt(array[maxIdx].year) ? currentIdx : maxIdx
    }, 0)

    return new Set([mostRecentIndex])
  })

  // Zoom state
  const [refAreaLeft, setRefAreaLeft] = useState<string>('')
  const [refAreaRight, setRefAreaRight] = useState<string>('')
  const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null)

  // Don't show Monthly HC/HP if:
  // - No data available
  // - No offpeak hours configured
  // - User has BASE pricing (no HC/HP distinction)
  const pricingOption = selectedPDLDetails?.pricing_option
  const isBasePricing = pricingOption === 'BASE'

  if (monthlyHcHpByYear.length === 0 || !selectedPDLDetails?.offpeak_hours || isBasePricing) {
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
      .map(index => monthlyHcHpByYear[index])
      .sort((a, b) => a.year.localeCompare(b.year)) // Sort by year ascending
    const jsonData = JSON.stringify(selectedData, null, 2)
    navigator.clipboard.writeText(jsonData)
    const yearLabels = selectedData.map(d => d.year).join(', ')
    toast.success(`Données HC/HP de ${yearLabels} copiées dans le presse-papier`)
  }

  const zoomOut = () => {
    setZoomDomain(null)
    setRefAreaLeft('')
    setRefAreaRight('')
  }

  const zoom = () => {
    if (!refAreaLeft || !refAreaRight) return

    // Get indices
    let left = chartData.findIndex(item => item.month === refAreaLeft)
    let right = chartData.findIndex(item => item.month === refAreaRight)

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
  const chartData = (() => {
    const selectedYearsData = Array.from(selectedYears)
      .map(index => monthlyHcHpByYear[index])
      .sort((a, b) => a.year.localeCompare(b.year)) // Sort by year ascending (2024 before 2025)

    // Create a map of all months
    const monthsMap = new Map<string, any>()

    selectedYearsData.forEach((yearData) => {
      yearData.months.forEach(monthData => {
        const monthKey = monthData.month.split(' ')[0] // Extract month name (e.g., "Jan")

        if (!monthsMap.has(monthKey)) {
          monthsMap.set(monthKey, { month: monthKey })
        }

        const entry = monthsMap.get(monthKey)!
        // Add data for this year with index suffix
        entry[`hc_${yearData.year}`] = monthData.hcKwh
        entry[`hp_${yearData.year}`] = monthData.hpKwh
      })
    })

    // Convert to array and ensure proper month order
    const monthOrder = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
    return Array.from(monthsMap.values()).sort((a, b) => {
      const aIndex = monthOrder.findIndex(m => a.month.toLowerCase().startsWith(m))
      const bIndex = monthOrder.findIndex(m => b.month.toLowerCase().startsWith(m))
      return aIndex - bIndex
    })
  })()

  const selectedYearsData = Array.from(selectedYears)
    .map(index => monthlyHcHpByYear[index])
    .sort((a, b) => a.year.localeCompare(b.year)) // Sort by year ascending for display

  // Get display data based on zoom
  const displayData = zoomDomain
    ? chartData.slice(zoomDomain.left, zoomDomain.right + 1)
    : chartData

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Consommation HC/HP par mois
      </h3>

      {/* Tabs and buttons - responsive layout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Tabs on the left - Allow multiple selection */}
        <div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
          {monthlyHcHpByYear.map((yearData, idx) => {
            const isSelected = selectedYears.has(idx)
            const color = graphColors[idx % graphColors.length]
            return (
              <button
                key={yearData.year}
                onClick={() => toggleYearSelection(idx)}
                className={`flex-1 min-w-[80px] px-4 py-2 text-base font-semibold rounded-lg border-2 transition-all duration-200 ${
                  isSelected
                    ? 'shadow-md'
                    : 'text-gray-400 hover:text-gray-200 border-gray-700 hover:border-gray-600'
                }`}
                style={isSelected ? {
                  backgroundColor: hexToRgba(color, 0.125),
                  borderColor: color,
                  color: color,
                } : undefined}
              >
                {yearData.year}
              </button>
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
      <div className="bg-gradient-to-br from-indigo-50 to-cyan-100 dark:from-indigo-900/20 dark:to-cyan-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
        {/* Show data availability warnings for selected years */}
        {selectedYearsData.some(year => year.dataAvailable !== undefined && year.dataAvailable < 350) && (
          <div className="mb-4 space-y-2">
            {selectedYearsData
              .filter(year => year.dataAvailable !== undefined && year.dataAvailable < 350)
              .map(year => (
                <div key={year.year} className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>⚠️ {year.year} - Données partielles :</strong> {year.dataAvailable} jours de données disponibles sur 365 jours pour cette période glissante.
                    {year.dataAvailable! < 100 && ' Les valeurs affichées peuvent être significativement incomplètes.'}
                  </p>
                </div>
              ))
            }
          </div>
        )}

        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={displayData}
            onMouseDown={(e) => e && e.activeLabel && setRefAreaLeft(String(e.activeLabel))}
            onMouseMove={(e) => refAreaLeft && e && e.activeLabel && setRefAreaRight(String(e.activeLabel))}
            onMouseUp={zoom}
          >
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
            {/* Dynamically create bars for each selected year */}
            {selectedYearsData.map((yearData, _yearIndex) => {
              // Define colors for HC and HP for each year with transparency for overlay effect
              const hcColors = [
                'rgba(59, 130, 246, 0.7)',   // blue
                'rgba(147, 197, 253, 0.7)',  // light blue
                'rgba(96, 165, 250, 0.7)',   // sky blue
                'rgba(37, 99, 235, 0.7)'     // dark blue
              ]
              const hpColors = [
                'rgba(249, 115, 22, 0.7)',   // orange
                'rgba(253, 186, 116, 0.7)',  // light orange
                'rgba(251, 146, 60, 0.7)',   // amber
                'rgba(234, 88, 12, 0.7)'     // dark orange
              ]

              return (
                <React.Fragment key={yearData.year}>
                  <Bar
                    dataKey={`hc_${yearData.year}`}
                    name={`HC ${yearData.year}`}
                    fill={hcColors[_yearIndex % hcColors.length]}
                  />
                  <Bar
                    dataKey={`hp_${yearData.year}`}
                    name={`HP ${yearData.year}`}
                    fill={hpColors[_yearIndex % hpColors.length]}
                  />
                </React.Fragment>
              )
            })}

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
          </BarChart>
        </ResponsiveContainer>

        {/* Zoom instruction */}
        {!zoomDomain && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            💡 Cliquez et glissez sur le graphique pour zoomer sur une période
          </p>
        )}
      </div>
    </div>
  )
}
