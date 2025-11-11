import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Download } from 'lucide-react'
import toast from 'react-hot-toast'

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
  selectedPowerYear: number
  setSelectedPowerYear: (year: number) => void
  selectedPDLDetails: any
  maxPowerData: any
  isDarkMode: boolean
}

export function PowerPeaks({
  powerByYearData,
  selectedPowerYear,
  setSelectedPowerYear,
  selectedPDLDetails,
  maxPowerData,
  isDarkMode
}: PowerPeaksProps) {
  const handleExport = () => {
    const jsonData = JSON.stringify(maxPowerData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données de puissance copiées dans le presse-papier')
  }

  if (powerByYearData.length === 0) {
    return null
  }

  const colors = ['#EF4444', '#F59E0B', '#10B981']
  const yearData = powerByYearData[selectedPowerYear]
  const color = colors[selectedPowerYear % colors.length]

  return (
    <div className="mt-6">
      {/* Tabs and export button - responsive layout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Tabs on the left */}
        <div className="flex gap-2 flex-1 overflow-x-auto">
          {[...powerByYearData].reverse().map((data, idx) => {
            const originalIdx = powerByYearData.length - 1 - idx
            return (
              <button
                key={data.label}
                onClick={() => setSelectedPowerYear(originalIdx)}
                className={`flex-1 px-4 py-2.5 font-semibold rounded-lg transition-all duration-200 ${
                  selectedPowerYear === originalIdx
                    ? 'bg-primary-600 text-white shadow-lg'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-400 dark:hover:border-primary-600'
                }`}
              >
                {data.label}
              </button>
            )
          })}
        </div>

        {/* Export button on the right */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Download size={16} className="flex-shrink-0" />
          <span>Export JSON</span>
        </button>
      </div>

      {/* Display selected year graph */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={yearData.data}>
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
              cursor={{ stroke: color, strokeWidth: 2 }}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number, _name: string, props: any) => {
                const time = props.payload?.time
                if (time) {
                  return [`${value.toFixed(2)} kW à ${time}`, 'Puissance max']
                }
                return [`${value.toFixed(2)} kW`, 'Puissance max']
              }}
              labelFormatter={(label) => {
                const date = new Date(label)
                return date.toLocaleDateString('fr-FR')
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

            <Line
              type="monotone"
              dataKey="power"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
              name={`Puissance max ${yearData.label}`}
            />
          </LineChart>
        </ResponsiveContainer>
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
