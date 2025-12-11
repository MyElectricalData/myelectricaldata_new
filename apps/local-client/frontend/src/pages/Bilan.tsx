import { useQuery } from '@tanstack/react-query'
import { getConsumption, getProduction } from '../api/client'
import { useStore } from '../stores/useStore'
import Card from '../components/Card'
import { TrendingUp, TrendingDown, Sun, Zap, Activity, ArrowUpDown, BarChart3 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useMemo } from 'react'

const COLORS = {
  consumption: '#ef4444',
  production: '#fbbf24',
  net: '#3b82f6',
}

export default function Bilan() {
  const { selectedPdl } = useStore()

  // Current year
  const currentYear = new Date().getFullYear()
  const startDateCurrent = `${currentYear}-01-01`
  const endDateCurrent = new Date().toISOString().split('T')[0]

  // Previous year (same period)
  const startDatePrevious = `${currentYear - 1}-01-01`
  const dayOfYear = Math.floor(
    (new Date().getTime() - new Date(currentYear, 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  )
  const endDatePrevious = new Date(currentYear - 1, 0, dayOfYear).toISOString().split('T')[0]

  const { data: consumptionCurrent } = useQuery({
    queryKey: ['consumption', selectedPdl, startDateCurrent, endDateCurrent],
    queryFn: () => getConsumption(selectedPdl!, startDateCurrent, endDateCurrent),
    enabled: !!selectedPdl,
  })

  const { data: productionCurrent } = useQuery({
    queryKey: ['production', selectedPdl, startDateCurrent, endDateCurrent],
    queryFn: () => getProduction(selectedPdl!, startDateCurrent, endDateCurrent),
    enabled: !!selectedPdl,
  })

  const { data: consumptionPrevious } = useQuery({
    queryKey: ['consumption', selectedPdl, startDatePrevious, endDatePrevious],
    queryFn: () => getConsumption(selectedPdl!, startDatePrevious, endDatePrevious),
    enabled: !!selectedPdl,
  })

  const { data: productionPrevious } = useQuery({
    queryKey: ['production', selectedPdl, startDatePrevious, endDatePrevious],
    queryFn: () => getProduction(selectedPdl!, startDatePrevious, endDatePrevious),
    enabled: !!selectedPdl,
  })

  const stats = useMemo(() => {
    const consumptionTotal = consumptionCurrent?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0
    const productionTotal = productionCurrent?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0
    const consumptionPreviousTotal = consumptionPrevious?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0
    const productionPreviousTotal = productionPrevious?.reduce((acc, d) => acc + d.daily_kwh, 0) || 0

    const netConsumption = consumptionTotal - productionTotal
    const selfConsumption = Math.min(consumptionTotal, productionTotal)
    const selfSufficiency = consumptionTotal > 0 ? (selfConsumption / consumptionTotal) * 100 : 0

    const consumptionVariation = consumptionPreviousTotal > 0
      ? ((consumptionTotal - consumptionPreviousTotal) / consumptionPreviousTotal) * 100
      : 0

    const productionVariation = productionPreviousTotal > 0
      ? ((productionTotal - productionPreviousTotal) / productionPreviousTotal) * 100
      : 0

    return {
      consumptionTotal,
      productionTotal,
      netConsumption,
      selfConsumption,
      selfSufficiency,
      consumptionVariation,
      productionVariation,
      consumptionPreviousTotal,
      productionPreviousTotal,
    }
  }, [consumptionCurrent, productionCurrent, consumptionPrevious, productionPrevious])

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const months: Record<string, { consumption: number; production: number }> = {}

    consumptionCurrent?.forEach((d) => {
      const month = d.date.substring(0, 7)
      if (!months[month]) months[month] = { consumption: 0, production: 0 }
      months[month].consumption += d.daily_kwh
    })

    productionCurrent?.forEach((d) => {
      const month = d.date.substring(0, 7)
      if (!months[month]) months[month] = { consumption: 0, production: 0 }
      months[month].production += d.daily_kwh
    })

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: new Date(month).toLocaleDateString('fr-FR', { month: 'short' }),
        consumption: data.consumption,
        production: data.production,
        net: data.consumption - data.production,
      }))
  }, [consumptionCurrent, productionCurrent])

  // Pie chart data
  const pieData = [
    { name: 'Autoconsommation', value: stats.selfConsumption },
    { name: 'Réseau', value: Math.max(0, stats.consumptionTotal - stats.selfConsumption) },
  ]

  return (
    <div className="space-y-6 pt-6">
      {/* Main stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="!p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-red-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Consommation</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {stats.consumptionTotal.toFixed(0)} kWh
              </p>
              <div className="flex items-center gap-1 text-sm">
                {stats.consumptionVariation >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                )}
                <span
                  className={
                    stats.consumptionVariation >= 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }
                >
                  {Math.abs(stats.consumptionVariation).toFixed(1)}% vs {currentYear - 1}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="!p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sun className="w-5 h-5 text-yellow-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Production</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {stats.productionTotal.toFixed(0)} kWh
              </p>
              <div className="flex items-center gap-1 text-sm">
                {stats.productionVariation >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                )}
                <span
                  className={
                    stats.productionVariation >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {Math.abs(stats.productionVariation).toFixed(1)}% vs {currentYear - 1}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="!p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-blue-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Consommation nette</p>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                {stats.netConsumption.toFixed(0)} kWh
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {stats.netConsumption > 0 ? 'Du réseau' : 'Surplus injecté'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Autoconsommation</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.selfConsumption.toFixed(0)} <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>

        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Taux d'autoconsommation</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.selfSufficiency.toFixed(0)} <span className="text-sm font-normal">%</span>
          </p>
        </Card>

        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Moyenne conso/jour</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {consumptionCurrent && consumptionCurrent.length > 0
              ? (stats.consumptionTotal / consumptionCurrent.length).toFixed(1)
              : '0'}{' '}
            <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>

        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Moyenne prod/jour</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {productionCurrent && productionCurrent.length > 0
              ? (stats.productionTotal / productionCurrent.length).toFixed(1)
              : '0'}{' '}
            <span className="text-sm font-normal">kWh</span>
          </p>
        </Card>
      </div>

      {/* Comparison N/N-1 */}
      <Card
        title={`Comparaison ${currentYear} / ${currentYear - 1}`}
        icon={<ArrowUpDown className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Consommation</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-sm text-gray-600 dark:text-gray-300">{currentYear}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.consumptionTotal.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-sm text-gray-600 dark:text-gray-300">{currentYear - 1}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.consumptionPreviousTotal.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-200">Différence</span>
                <span
                  className={`font-bold ${
                    stats.consumptionVariation >= 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}
                >
                  {stats.consumptionVariation >= 0 ? '+' : ''}
                  {stats.consumptionVariation.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-900 dark:text-white mb-4">Production</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-sm text-gray-600 dark:text-gray-300">{currentYear}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.productionTotal.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-sm text-gray-600 dark:text-gray-300">{currentYear - 1}</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {stats.productionPreviousTotal.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-200">Différence</span>
                <span
                  className={`font-bold ${
                    stats.productionVariation >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {stats.productionVariation >= 0 ? '+' : ''}
                  {stats.productionVariation.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly chart */}
      <Card title="Évolution mensuelle" icon={<BarChart3 className="w-5 h-5 text-primary-600 dark:text-primary-400" />}>
        {monthlyData.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-gray-600 dark:text-gray-400" />
                <YAxis tick={{ fontSize: 12 }} className="text-gray-600 dark:text-gray-400" unit=" kWh" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="consumption" name="Consommation" fill={COLORS.consumption} />
                <Bar dataKey="production" name="Production" fill={COLORS.production} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <p>Aucune donnée disponible</p>
          </div>
        )}
      </Card>

      {/* Pie charts */}
      {stats.productionTotal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Répartition de la consommation" icon={<Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#3b82f6'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Bilan énergétique" icon={<Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />}>
            <div className="space-y-4 py-6">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Production totale</span>
                <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                  {stats.productionTotal.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Autoconsommée</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {stats.selfConsumption.toFixed(0)} kWh
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Surplus injecté</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  {Math.max(0, stats.productionTotal - stats.selfConsumption).toFixed(0)} kWh
                </span>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">Prélevé du réseau</span>
                  <span className="font-bold text-red-600 dark:text-red-400">
                    {Math.max(0, stats.netConsumption).toFixed(0)} kWh
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
