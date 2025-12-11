import { useQuery } from '@tanstack/react-query'
import { getConsumption } from '../api/client'
import { useStore } from '../stores/useStore'
import Card from '../components/Card'
import DateRangePicker from '../components/DateRangePicker'
import { Euro, TrendingUp, TrendingDown, Calculator } from 'lucide-react'
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
import { useState } from 'react'

// Tariff prices (example prices - should be configurable)
const TARIFFS = {
  BASE: {
    base: 0.2516,
  },
  HC_HP: {
    hc: 0.2068,
    hp: 0.2700,
  },
  TEMPO: {
    blueHC: 0.1296,
    blueHP: 0.1609,
    whiteHC: 0.1486,
    whiteHP: 0.1894,
    redHC: 0.1568,
    redHP: 0.7562,
  },
}

export default function ConsumptionEuro() {
  const { selectedPdl, startDate, endDate } = useStore()
  const [tariffType, setTariffType] = useState<'BASE' | 'HC_HP' | 'TEMPO'>('BASE')

  const { data: consumption, isLoading } = useQuery({
    queryKey: ['consumption', selectedPdl, startDate, endDate],
    queryFn: () => getConsumption(selectedPdl!, startDate, endDate),
    enabled: !!selectedPdl,
  })

  // Calculate costs based on tariff
  const calculateCost = (dailyKwh: number, hcKwh?: number, hpKwh?: number) => {
    if (tariffType === 'BASE') {
      return dailyKwh * TARIFFS.BASE.base
    } else if (tariffType === 'HC_HP' && hcKwh !== undefined && hpKwh !== undefined) {
      return hcKwh * TARIFFS.HC_HP.hc + hpKwh * TARIFFS.HC_HP.hp
    } else if (tariffType === 'TEMPO') {
      // For demo, assume all days are blue (would need actual tempo calendar)
      const hc = hcKwh || dailyKwh * 0.4
      const hp = hpKwh || dailyKwh * 0.6
      return hc * TARIFFS.TEMPO.blueHC + hp * TARIFFS.TEMPO.blueHP
    }
    return dailyKwh * TARIFFS.BASE.base
  }

  const totalCost = consumption?.reduce(
    (acc, d) => acc + calculateCost(d.daily_kwh, d.hc_kwh, d.hp_kwh),
    0
  ) || 0

  const avgCost = consumption?.length ? totalCost / consumption.length : 0
  const maxCost = consumption?.length
    ? Math.max(...consumption.map((d) => calculateCost(d.daily_kwh, d.hc_kwh, d.hp_kwh)))
    : 0
  const minCost = consumption?.length
    ? Math.min(...consumption.map((d) => calculateCost(d.daily_kwh, d.hc_kwh, d.hp_kwh)))
    : 0

  const chartData = consumption
    ?.slice()
    .reverse()
    .map((d) => {
      const cost = calculateCost(d.daily_kwh, d.hc_kwh, d.hp_kwh)
      const hcCost = d.hc_kwh ? d.hc_kwh * (tariffType === 'HC_HP' ? TARIFFS.HC_HP.hc : TARIFFS.TEMPO.blueHC) : 0
      const hpCost = d.hp_kwh ? d.hp_kwh * (tariffType === 'HC_HP' ? TARIFFS.HC_HP.hp : TARIFFS.TEMPO.blueHP) : 0

      return {
        date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
        total: cost,
        hc: hcCost,
        hp: hpCost,
      }
    })

  const hasHcHp = consumption?.some((d) => d.hc_kwh || d.hp_kwh)

  return (
    <div className="space-y-6 pt-6">
      {/* Date picker & Tariff selector */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <DateRangePicker />
        </div>
        <Card className="!p-4 flex items-center gap-4">
          <Calculator className="w-5 h-5 text-primary-600 dark:text-primary-400" />
          <div className="flex gap-2">
            {(['BASE', 'HC_HP', 'TEMPO'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTariffType(type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tariffType === type
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {type.replace('_', '/')}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {totalCost.toFixed(2)} <span className="text-sm font-normal">€</span>
          </p>
        </Card>
        <Card className="!p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Moyenne/jour</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {avgCost.toFixed(2)} <span className="text-sm font-normal">€</span>
          </p>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Max</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {maxCost.toFixed(2)} <span className="text-sm font-normal">€</span>
          </p>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-green-500" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Min</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {minCost.toFixed(2)} <span className="text-sm font-normal">€</span>
          </p>
        </Card>
      </div>

      {/* Tariff info */}
      <Card title="Tarification appliquée" icon={<Calculator className="w-5 h-5 text-primary-600 dark:text-primary-400" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tariffType === 'BASE' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Tarif unique</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {TARIFFS.BASE.base} € / kWh
              </p>
            </div>
          )}
          {tariffType === 'HC_HP' && (
            <>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Heures Creuses</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.HC_HP.hc} € / kWh
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Heures Pleines</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.HC_HP.hp} € / kWh
                </p>
              </div>
            </>
          )}
          {tariffType === 'TEMPO' && (
            <>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Bleu HC/HP</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.TEMPO.blueHC} / {TARIFFS.TEMPO.blueHP} €
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Blanc HC/HP</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.TEMPO.whiteHC} / {TARIFFS.TEMPO.whiteHP} €
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-gray-500 dark:text-gray-400">Rouge HC/HP</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.TEMPO.redHC} / {TARIFFS.TEMPO.redHP} €
                </p>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Chart */}
      <Card title="Évolution des coûts">
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
                  unit=" €"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    borderColor: 'var(--tooltip-border, #e5e7eb)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)} €`, '']}
                />
                {hasHcHp && (tariffType === 'HC_HP' || tariffType === 'TEMPO') ? (
                  <>
                    <Legend />
                    <Bar dataKey="hc" name="Heures Creuses" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="hp" name="Heures Pleines" fill="#ef4444" stackId="a" />
                  </>
                ) : (
                  <Bar dataKey="total" name="Coût" fill="#10b981" />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <Euro className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
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
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Total kWh</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Coût total</th>
                  {hasHcHp && (
                    <>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">HC kWh</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Coût HC</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">HP kWh</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Coût HP</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {consumption.slice(0, 30).map((d) => {
                  const cost = calculateCost(d.daily_kwh, d.hc_kwh, d.hp_kwh)
                  const hcCost = d.hc_kwh ? d.hc_kwh * (tariffType === 'HC_HP' ? TARIFFS.HC_HP.hc : TARIFFS.TEMPO.blueHC) : 0
                  const hpCost = d.hp_kwh ? d.hp_kwh * (tariffType === 'HC_HP' ? TARIFFS.HC_HP.hp : TARIFFS.TEMPO.blueHP) : 0

                  return (
                    <tr key={d.date} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-4 text-gray-900 dark:text-white">
                        {new Date(d.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400">
                        {d.daily_kwh.toFixed(2)} kWh
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-green-600 dark:text-green-400">
                        {cost.toFixed(2)} €
                      </td>
                      {hasHcHp && (
                        <>
                          <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400">
                            {d.hc_kwh?.toFixed(2) || '-'} kWh
                          </td>
                          <td className="py-3 px-4 text-right text-blue-600 dark:text-blue-400">
                            {d.hc_kwh ? `${hcCost.toFixed(2)} €` : '-'}
                          </td>
                          <td className="py-3 px-4 text-right text-gray-500 dark:text-gray-400">
                            {d.hp_kwh?.toFixed(2) || '-'} kWh
                          </td>
                          <td className="py-3 px-4 text-right text-red-600 dark:text-red-400">
                            {d.hp_kwh ? `${hpCost.toFixed(2)} €` : '-'}
                          </td>
                        </>
                      )}
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
