import { useQuery } from '@tanstack/react-query'
import { getProduction } from '../api/client'
import { useStore } from '../stores/useStore'
import Card from '../components/Card'
import DateRangePicker from '../components/DateRangePicker'
import { Sun, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

export default function Production() {
  const { selectedPdl, startDate, endDate } = useStore()

  const { data: production, isLoading } = useQuery({
    queryKey: ['production', selectedPdl, startDate, endDate],
    queryFn: () => getProduction(selectedPdl!, startDate, endDate),
    enabled: !!selectedPdl,
  })

  const totalKwh = production?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0
  const avgKwh = production?.length ? totalKwh / production.length : 0
  const maxKwh = production?.length ? Math.max(...production.map((d) => d.daily_kwh)) : 0
  const minKwh = production?.length ? Math.min(...production.map((d) => d.daily_kwh)) : 0

  const chartData = production
    ?.slice()
    .reverse()
    .map((d) => ({
      date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      production: d.daily_kwh,
    }))

  return (
    <div className="space-y-6 pt-6">
      {/* Date picker */}
      <DateRangePicker />

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sun className="w-4 h-4 text-yellow-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Total produit</p>
          </div>
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
            <TrendingUp className="w-4 h-4 text-green-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Max</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {maxKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Min</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {minKwh.toFixed(1)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
      </div>

      {/* Chart */}
      <Card title="Évolution de la production">
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
                  formatter={(value: number) => [`${value.toFixed(2)} kWh`, 'Production']}
                />
                <Bar dataKey="production" fill="#fbbf24" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <Sun className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <p>Aucune donnée de production disponible</p>
            <p className="text-sm">Sélectionnez un PDL avec production solaire</p>
          </div>
        )}
      </Card>

      {/* Trend chart */}
      {chartData && chartData.length > 0 && (
        <Card title="Tendance (courbe)" icon={<Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
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
                  formatter={(value: number) => [`${value.toFixed(2)} kWh`, 'Production']}
                />
                <Line
                  type="monotone"
                  dataKey="production"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ fill: '#fbbf24', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Data table */}
      {production && production.length > 0 && (
        <Card title="Détail journalier">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Production</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Variation</th>
                </tr>
              </thead>
              <tbody>
                {production.slice(0, 30).map((d, idx) => {
                  const prevValue = idx > 0 ? production[idx - 1].daily_kwh : d.daily_kwh
                  const variation = ((d.daily_kwh - prevValue) / prevValue) * 100

                  return (
                    <tr key={d.date} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-4 text-gray-900 dark:text-white">
                        {new Date(d.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-yellow-600 dark:text-yellow-400">
                        {d.daily_kwh.toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-4 text-right">
                        {idx > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 ${
                              variation >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {variation >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {Math.abs(variation).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
