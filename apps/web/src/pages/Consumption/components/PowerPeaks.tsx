import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts'
import { Download, ZoomOut } from 'lucide-react'
import { toast } from '@/stores/notificationStore'
import { ModernButton } from './ModernButton'

interface PowerData {
  label: string
  data: Array<{
    date: string
    power: number
    time: string
    year: string
  }>
}

interface PowerPeaksProps {
  powerByYearData: PowerData[]
  selectedPDLDetails: any
  isDarkMode: boolean
}

export function PowerPeaks({
  powerByYearData,
  selectedPDLDetails,
  isDarkMode
}: PowerPeaksProps) {
  // Track selected years with a Set (allows multiple selections)
  // Default to the most recent year (last index in the array)
  const [selectedYears, setSelectedYears] = useState<Set<number>>(
    new Set([powerByYearData.length > 0 ? powerByYearData.length - 1 : 0])
  )

  // Zoom state
  const [refAreaLeft, setRefAreaLeft] = useState<string>('')
  const [refAreaRight, setRefAreaRight] = useState<string>('')
  const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null)

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
      .map(index => powerByYearData[index])
      .sort((a, b) => b.label.localeCompare(a.label))
    const jsonData = JSON.stringify(selectedData, null, 2)
    navigator.clipboard.writeText(jsonData)
    const yearLabels = selectedData.map(d => d.label).join(', ')
    toast.success(`Données de puissance de ${yearLabels} copiées dans le presse-papier`)
  }

  const zoomOut = () => {
    setZoomDomain(null)
    setRefAreaLeft('')
    setRefAreaRight('')
  }

  const zoom = () => {
    if (!refAreaLeft || !refAreaRight) return

    // Get indices
    let left = chartData.findIndex(item => item.date === refAreaLeft)
    let right = chartData.findIndex(item => item.date === refAreaRight)

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

  if (powerByYearData.length === 0) {
    return null
  }

  // Prepare chart data with all selected years
  const chartData = (() => {
    const selectedYearsData = Array.from(selectedYears)
      .map(index => powerByYearData[index])
      .sort((a, b) => b.label.localeCompare(a.label)) // Sort by year descending

    // Create a map using normalized dates (MM-DD) to overlay years
    const datesMap = new Map<string, any>()

    selectedYearsData.forEach((yearData) => {
      yearData.data.forEach(dayData => {
        const date = new Date(dayData.date)
        // Normalize to same year to overlay data (use month-day only)
        const normalizedKey = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

        if (!datesMap.has(normalizedKey)) {
          // Store a reference date for display (using year 2000 as base)
          const displayDate = new Date(2000, date.getMonth(), date.getDate())
          datesMap.set(normalizedKey, {
            date: displayDate.toISOString().split('T')[0],
            monthDay: normalizedKey
          })
        }

        const entry = datesMap.get(normalizedKey)!
        // Add data for this year
        entry[`power_${yearData.label}`] = dayData.power
        entry[`time_${yearData.label}`] = dayData.time
        entry[`year_${yearData.label}`] = date.getFullYear()
      })
    })

    // Convert to array and sort by month-day
    return Array.from(datesMap.values()).sort((a, b) => {
      const [aMonth, aDay] = a.monthDay.split('-').map(Number)
      const [bMonth, bDay] = b.monthDay.split('-').map(Number)
      if (aMonth !== bMonth) return aMonth - bMonth
      return aDay - bDay
    })
  })()

  const selectedYearsData = Array.from(selectedYears)
    .map(index => powerByYearData[index])
    .sort((a, b) => b.label.localeCompare(a.label))

  const colors = ['#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4']

  // Get display data based on zoom
  const displayData = zoomDomain
    ? chartData.slice(zoomDomain.left, zoomDomain.right + 1)
    : chartData

  return (
    <div className="mt-6">
      {/* Tabs and buttons - responsive layout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Tabs on the left - Allow multiple selection */}
        <div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
          {[...powerByYearData].reverse().map((data, idx) => {
            const originalIndex = powerByYearData.length - 1 - idx
            const isSelected = selectedYears.has(originalIndex)
            return (
              <ModernButton
                key={data.label}
                variant="tab"
                size="md"
                isActive={isSelected}
                onClick={() => toggleYearSelection(originalIndex)}
                className="flex-1 min-w-[100px]"
              >
                {data.label}
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

      {/* Display selected years graph */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart
            data={displayData}
            onMouseDown={(e) => e && e.activeLabel && setRefAreaLeft(String(e.activeLabel))}
            onMouseMove={(e) => refAreaLeft && e && e.activeLabel && setRefAreaRight(String(e.activeLabel))}
            onMouseUp={zoom}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#9CA3AF" opacity={0.3} />
            <XAxis
              dataKey="date"
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '11px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              tickFormatter={(value) => {
                const date = new Date(value)
                return `${date.getDate()}/${date.getMonth() + 1}`
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke={isDarkMode ? "#FFFFFF" : "#6B7280"}
              style={{ fontSize: '14px', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              label={{ value: 'Puissance (kW)', angle: -90, position: 'insideLeft', fill: isDarkMode ? '#FFFFFF' : '#6B7280' }}
              domain={[0, 'auto']}
            />
            <Tooltip
              cursor={{ stroke: colors[0], strokeWidth: 2 }}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number, name: string, props: any) => {
                // Extract year from the dataKey (e.g., "power_2025")
                const year = name.replace('Puissance max ', '')
                const timeKey = `time_${year}`
                const yearKey = `year_${year}`
                const time = props.payload?.[timeKey]
                const actualYear = props.payload?.[yearKey]
                if (time && actualYear) {
                  return [`${value.toFixed(2)} kW à ${time} (${actualYear})`, name]
                }
                return [`${value.toFixed(2)} kW`, name]
              }}
              labelFormatter={(label) => {
                const date = new Date(label)
                return `${date.getDate()} ${date.toLocaleDateString('fr-FR', { month: 'short' })}`
              }}
            />
            <Legend />

            {/* Reference line for subscribed power */}
            {selectedPDLDetails?.subscribed_power && (
              <ReferenceLine
                y={selectedPDLDetails.subscribed_power}
                stroke="#8B5CF6"
                strokeWidth={2}
                strokeDasharray="5 5"
                label={{
                  value: `Puissance souscrite: ${selectedPDLDetails.subscribed_power} kVA`,
                  position: 'insideTopRight',
                  fill: '#8B5CF6',
                  fontSize: 12
                }}
              />
            )}

            {/* Dynamically create lines for each selected year */}
            {selectedYearsData.map((yearData, index) => (
              <Line
                key={yearData.label}
                type="monotone"
                dataKey={`power_${yearData.label}`}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
                name={`Puissance max ${yearData.label}`}
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

      {/* Info message */}
      <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>ℹ️ Note :</strong> Ces graphiques montrent les pics de puissance maximale atteints chaque jour sur les 3 dernières années.
          {selectedPDLDetails?.subscribed_power && (
            <> La ligne violette en pointillés indique votre puissance souscrite ({selectedPDLDetails.subscribed_power} kVA).
            Le compteur Linky autorise des dépassements temporaires de cette limite, donc un pic ponctuel au-dessus de cette ligne ne provoquera pas nécessairement de disjonction.
            Cependant, si les pics dépassent régulièrement ou de manière prolongée cette ligne, vous risquez de disjoncter.</>
          )}
        </p>
      </div>
    </div>
  )
}
