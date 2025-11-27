import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Download, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { ModernButton } from './ModernButton'

interface HcHpData {
  year: string
  hcKwh: number
  hpKwh: number
  totalKwh: number
}

interface HcHpDistributionProps {
  hcHpByYear: HcHpData[]
  selectedPDLDetails: any
}

export function HcHpDistribution({ hcHpByYear, selectedPDLDetails }: HcHpDistributionProps) {
  const [selectedHcHpPeriod, setSelectedHcHpPeriod] = useState(0)

  if (hcHpByYear.length === 0 || !selectedPDLDetails?.offpeak_hours) {
    return null
  }

  const handleExportAll = () => {
    const jsonData = JSON.stringify(hcHpByYear, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données HC/HP copiées dans le presse-papier')
  }

  const handleExportPeriod = (yearData: HcHpData) => {
    const jsonData = JSON.stringify(yearData, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données HC/HP copiées')
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Répartition HC/HP par année
      </h3>

      {/* Tabs and export button - responsive layout */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Tabs on the left */}
        <div className="flex gap-2 flex-1 overflow-x-auto overflow-y-hidden py-3 px-2 no-scrollbar">
          {hcHpByYear.map((yearData, index) => {
            // Extract the year from the end date
            const endYear = yearData.year.split(' - ')[1]?.split(' ').pop() || yearData.year

            return (
              <ModernButton
                key={yearData.year}
                variant="tab"
                size="md"
                isActive={selectedHcHpPeriod === index}
                onClick={() => setSelectedHcHpPeriod(index)}
                className="flex-1 min-w-[80px]"
              >
                {endYear}
              </ModernButton>
            )
          })}
        </div>

        {/* Export button on the right */}
        <ModernButton
          variant="gradient"
          size="sm"
          icon={Download}
          iconPosition="left"
          onClick={handleExportAll}
        >
          Export JSON
        </ModernButton>
      </div>

      {/* Selected Period Chart */}
      {hcHpByYear[selectedHcHpPeriod] && (() => {
        const yearData = hcHpByYear[selectedHcHpPeriod]
        const hcPercentage = yearData.totalKwh > 0 ? (yearData.hcKwh / yearData.totalKwh) * 100 : 0
        const hpPercentage = yearData.totalKwh > 0 ? (yearData.hpKwh / yearData.totalKwh) * 100 : 0

        const pieData = [
          { name: 'Heures Creuses (HC)', value: yearData.hcKwh, color: '#3b82f6' },
          { name: 'Heures Pleines (HP)', value: yearData.hpKwh, color: '#f97316' },
        ]

        return (
          <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-gray-900 dark:text-white">
                {yearData.year}
              </h4>
              <ModernButton
                variant="gradient"
                size="sm"
                icon={Download}
                onClick={() => handleExportPeriod(yearData)}
                className="!px-2 !py-1.5"
              >
                <span className="sr-only">Export période</span>
              </ModernButton>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pie Chart - Fixed size to avoid ResponsiveContainer rendering delay */}
              <div className="flex items-center justify-center">
                <PieChart width={280} height={280}>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: { name?: string; percent?: number }) =>
                      `${name?.split(' ')[0] || ''} ${((percent || 0) * 100).toFixed(1)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh`}
                  />
                </PieChart>
              </div>

              {/* Statistics */}
              <div className="flex flex-col justify-center gap-4">
                {/* Heures Creuses */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Heures Creuses (HC)</p>
                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                      {hcPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {yearData.hcKwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                  </p>
                </div>

                {/* Heures Pleines */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Heures Pleines (HP)</p>
                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                      {hpPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {yearData.hpKwh.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                  </p>
                </div>

                {/* Visual bar */}
                <div className="mt-2">
                  <div className="w-full h-4 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden flex">
                    <div
                      className="bg-blue-500 dark:bg-blue-400 h-full transition-all"
                      style={{ width: `${hcPercentage}%` }}
                      title={`HC: ${hcPercentage.toFixed(1)}%`}
                    />
                    <div
                      className="bg-orange-500 dark:bg-orange-400 h-full transition-all"
                      style={{ width: `${hpPercentage}%` }}
                      title={`HP: ${hpPercentage.toFixed(1)}%`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Info message */}
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" size={16} />
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  Le total HC/HP peut différer légèrement de la "Consommation par années".
                  Cette différence est due à une simulation basée sur les plages horaires HC/HP,
                  car Enedis ne fournit pas ces données détaillées.
                  De plus, Enedis transmet les données par paliers de 30 minutes : si le changement d'heure creuse/pleine
                  intervient au milieu d'un intervalle de 30 minutes, la répartition HC/HP sera approximative à 30 minutes près.
                  C'est la <strong>Consommation par années</strong> qui est la plus précise et qui sera facturée par votre fournisseur.
                </p>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
