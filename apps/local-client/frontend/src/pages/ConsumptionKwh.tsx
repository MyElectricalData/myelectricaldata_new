import { useQuery } from '@tanstack/react-query'
import { getConsumption } from '../api/client'
import { useStore } from '../stores/useStore'
import Card from '../components/Card'
import DateRangePicker from '../components/DateRangePicker'
import { Zap, TrendingUp, TrendingDown } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export default function ConsumptionKwh() {
  const { selectedPdl, startDate, endDate } = useStore()

  const { data: consumption, isLoading } = useQuery({
    queryKey: ['consumption', selectedPdl, startDate, endDate],
    queryFn: () => getConsumption(selectedPdl!, startDate, endDate),
    enabled: !!selectedPdl,
  })

  const totalKwh = consumption?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0
  const avgKwh = consumption?.length ? totalKwh / consumption.length : 0
  const maxKwh = consumption?.length ? Math.max(...consumption.map((d) => d.daily_kwh)) : 0
  const minKwh = consumption?.length ? Math.min(...consumption.map((d) => d.daily_kwh)) : 0

  const chartData = consumption
    ?.slice()
    .reverse()
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      total: d.daily_kwh,
      hc: d.hc_kwh || 0,
      hp: d.hp_kwh || 0,
    }))

  const hasHcHp = consumption?.some((d) => d.hc_kwh || d.hp_kwh)

  return (
    <div className="space-y-6 pt-6">
      {/* Date picker */}
      <DateRangePicker />

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Moyenne/jour</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {avgKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Max</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {maxKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-green-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Min</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {minKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
      </div>

      {/* Chart */}
      <Card title="Évolution de la consommation">
        {isLoading ? (
          <div className="h-80 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
          </div>
        ) : chartData && chartData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-gray-600 dark:text-gray-400"
                  unit=" kWh"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)} kWh`, '']}
                />
                {hasHcHp ? (
                  <>
                    <Legend />
                    <Bar dataKey="hc" name="Heures Creuses" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="hp" name="Heures Pleines" fill="#ef4444" stackId="a" />
                  </>
                ) : (
                  <Bar dataKey="total" name="Consommation" fill="#3b82f6" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <Zap className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p>Aucune donnée disponible</p>
            <p className="text-sm">Sélectionnez un PDL et une période</p>
          </div>
        )}
      </Card>

      {/* Data table */}
      {consumption && consumption.length > 0 && (
        <Card title="Détail journalier">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Total</th>
                  {hasHcHp && (
                    <>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">HC</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">HP</th>
                    </>
                  )}
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Puissance max</th>
                </tr>
              </thead>
              <tbody>
                {consumption.slice(0, 30).map((d) => (
                  <tr key={d.date} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-4 text-gray-900 dark:text-white">
                      {new Date(d.date).toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-gray-900 dark:text-white">
                      {d.daily_kwh.toFixed(2)} kWh
                    </td>
                    {hasHcHp && (
                      <>
                        <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">
                          {d.hc_kwh?.toFixed(2) || '-'} kWh
                        </td>
                        <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                          {d.hp_kwh?.toFixed(2) || '-'} kWh
                        </td>
                      </>
                    )}
                    <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400">
                      {d.max_power_kva ? `${d.max_power_kva.toFixed(1)} kVA` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
