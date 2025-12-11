import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConsumption } from '../api/client'
import { useStore } from '../stores/useStore'
import Card from '../components/Card'
import DateRangePicker from '../components/DateRangePicker'
import { TrendingDown, TrendingUp, Euro, Zap, Info, Calculator } from 'lucide-react'
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

// Tariff configurations
const TARIFFS = {
  BASE: {
    name: 'Base',
    description: 'Tarif unique toute la journée',
    subscription: 11.47, // €/month
    price: 0.2516, // €/kWh
  },
  HC_HP: {
    name: 'Heures Creuses / Heures Pleines',
    description: '8h creuses (nuit) + 16h pleines',
    subscription: 12.15, // €/month
    priceHC: 0.2068, // €/kWh
    priceHP: 0.2700, // €/kWh
    hcRatio: 0.4, // Assumption: 40% in HC
  },
  TEMPO: {
    name: 'Tempo',
    description: '300 jours bleus, 43 blancs, 22 rouges',
    subscription: 12.52, // €/month
    blue: { hc: 0.1296, hp: 0.1609 },
    white: { hc: 0.1486, hp: 0.1894 },
    red: { hc: 0.1568, hp: 0.7562 },
    distribution: { blue: 0.82, white: 0.12, red: 0.06 },
    hcRatio: 0.4,
  },
}

export default function Simulation() {
  const { selectedPdl, startDate, endDate } = useStore()
  const [customHcRatio, setCustomHcRatio] = useState(40)

  const { data: consumption, isLoading } = useQuery({
    queryKey: ['consumption', selectedPdl, startDate, endDate],
    queryFn: () => getConsumption(selectedPdl!, startDate, endDate),
    enabled: !!selectedPdl,
  })

  const simulation = useMemo(() => {
    if (!consumption || consumption.length === 0) {
      return null
    }

    const totalKwh = consumption.reduce((acc, d) => acc + d.daily_kwh, 0)
    const hasRealHcHp = consumption.some((d) => d.hc_kwh || d.hp_kwh)

    let hcKwh: number
    let hpKwh: number

    if (hasRealHcHp) {
      hcKwh = consumption.reduce((acc, d) => acc + (d.hc_kwh || 0), 0)
      hpKwh = consumption.reduce((acc, d) => acc + (d.hp_kwh || 0), 0)
    } else {
      // Use custom ratio
      hcKwh = totalKwh * (customHcRatio / 100)
      hpKwh = totalKwh * (1 - customHcRatio / 100)
    }

    const days = consumption.length
    const months = days / 30

    // BASE calculation
    const baseCost = totalKwh * TARIFFS.BASE.price + TARIFFS.BASE.subscription * months

    // HC/HP calculation
    const hchpCost = hcKwh * TARIFFS.HC_HP.priceHC + hpKwh * TARIFFS.HC_HP.priceHP + TARIFFS.HC_HP.subscription * months

    // TEMPO calculation (using distribution)
    const tempoBlueKwh = totalKwh * TARIFFS.TEMPO.distribution.blue
    const tempoWhiteKwh = totalKwh * TARIFFS.TEMPO.distribution.white
    const tempoRedKwh = totalKwh * TARIFFS.TEMPO.distribution.red

    const tempoCost =
      tempoBlueKwh * (customHcRatio / 100) * TARIFFS.TEMPO.blue.hc +
      tempoBlueKwh * (1 - customHcRatio / 100) * TARIFFS.TEMPO.blue.hp +
      tempoWhiteKwh * (customHcRatio / 100) * TARIFFS.TEMPO.white.hc +
      tempoWhiteKwh * (1 - customHcRatio / 100) * TARIFFS.TEMPO.white.hp +
      tempoRedKwh * (customHcRatio / 100) * TARIFFS.TEMPO.red.hc +
      tempoRedKwh * (1 - customHcRatio / 100) * TARIFFS.TEMPO.red.hp +
      TARIFFS.TEMPO.subscription * months

    return {
      totalKwh,
      hcKwh,
      hpKwh,
      days,
      months,
      hasRealHcHp,
      base: {
        total: baseCost,
        monthly: baseCost / months,
        perKwh: baseCost / totalKwh,
      },
      hchp: {
        total: hchpCost,
        monthly: hchpCost / months,
        perKwh: hchpCost / totalKwh,
        savings: baseCost - hchpCost,
        savingsPercent: ((baseCost - hchpCost) / baseCost) * 100,
      },
      tempo: {
        total: tempoCost,
        monthly: tempoCost / months,
        perKwh: tempoCost / totalKwh,
        savings: baseCost - tempoCost,
        savingsPercent: ((baseCost - tempoCost) / baseCost) * 100,
      },
    }
  }, [consumption, customHcRatio])

  const chartData = simulation
    ? [
        {
          name: 'Base',
          total: simulation.base.total,
          monthly: simulation.base.monthly,
        },
        {
          name: 'HC/HP',
          total: simulation.hchp.total,
          monthly: simulation.hchp.monthly,
        },
        {
          name: 'Tempo',
          total: simulation.tempo.total,
          monthly: simulation.tempo.monthly,
        },
      ]
    : []

  const bestOption = simulation
    ? [simulation.base, simulation.hchp, simulation.tempo].reduce((best, current) =>
        current.total < best.total ? current : best
      )
    : null

  return (
    <div className="space-y-6 pt-6">
      {/* Info banner */}
      <Card className="!p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-100">
            <p className="font-medium mb-1">À propos de ce simulateur</p>
            <p>
              Comparez les différentes options tarifaires (Base, HC/HP, Tempo) pour optimiser votre facture d'électricité.
              La simulation se base sur votre consommation réelle sur la période sélectionnée. Les tarifs sont ceux de 2024.
            </p>
          </div>
        </div>
      </Card>

      {/* Date picker */}
      <DateRangePicker />

      {/* HC/HP ratio slider */}
      {simulation && !simulation.hasRealHcHp && (
        <Card
          title="Configuration HC/HP"
          subtitle="Ajustez la répartition Heures Creuses / Heures Pleines"
          icon={<Zap className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Heures Creuses : <span className="font-semibold">{customHcRatio}%</span>
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Heures Pleines : <span className="font-semibold">{100 - customHcRatio}%</span>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={customHcRatio}
              onChange={(e) => setCustomHcRatio(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ajustez selon vos habitudes de consommation. En moyenne, 30-40% de la consommation se fait en heures creuses.
            </p>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
        </div>
      ) : simulation ? (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="!p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Consommation</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {simulation.totalKwh.toFixed(0)}{' '}
                <span className="text-sm font-normal">kWh</span>
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Période</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {simulation.days} <span className="text-sm font-normal">jours</span>
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">HC estimées</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {simulation.hcKwh.toFixed(0)}{' '}
                <span className="text-sm font-normal">kWh</span>
              </p>
            </Card>
            <Card className="!p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">HP estimées</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {simulation.hpKwh.toFixed(0)}{' '}
                <span className="text-sm font-normal">kWh</span>
              </p>
            </Card>
          </div>

          {/* Comparison cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* BASE */}
            <Card
              className={`!p-6 ${
                bestOption === simulation.base
                  ? 'ring-2 ring-green-500 dark:ring-green-400'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.BASE.name}
                </h3>
                {bestOption === simulation.base && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                    Meilleur choix
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {TARIFFS.BASE.description}
              </p>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Prix kWh</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {TARIFFS.BASE.price} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Abonnement/mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {TARIFFS.BASE.subscription} €
                  </span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Coût total</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {simulation.base.total.toFixed(2)} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Par mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {simulation.base.monthly.toFixed(2)} €
                  </span>
                </div>
              </div>
            </Card>

            {/* HC/HP */}
            <Card
              className={`!p-6 ${
                bestOption === simulation.hchp
                  ? 'ring-2 ring-green-500 dark:ring-green-400'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.HC_HP.name}
                </h3>
                {bestOption === simulation.hchp && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                    Meilleur choix
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {TARIFFS.HC_HP.description}
              </p>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Prix HC</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {TARIFFS.HC_HP.priceHC} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Prix HP</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {TARIFFS.HC_HP.priceHP} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Abonnement/mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {TARIFFS.HC_HP.subscription} €
                  </span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Coût total</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {simulation.hchp.total.toFixed(2)} €
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-300">Par mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {simulation.hchp.monthly.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  {simulation.hchp.savings >= 0 ? (
                    <>
                      <TrendingDown className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        -{simulation.hchp.savings.toFixed(2)} € vs Base (
                        {simulation.hchp.savingsPercent.toFixed(1)}%)
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        +{Math.abs(simulation.hchp.savings).toFixed(2)} € vs Base
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* TEMPO */}
            <Card
              className={`!p-6 ${
                bestOption === simulation.tempo
                  ? 'ring-2 ring-green-500 dark:ring-green-400'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {TARIFFS.TEMPO.name}
                </h3>
                {bestOption === simulation.tempo && (
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium rounded">
                    Meilleur choix
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {TARIFFS.TEMPO.description}
              </p>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Bleu HC/HP</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {TARIFFS.TEMPO.blue.hc} / {TARIFFS.TEMPO.blue.hp} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Rouge HP</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {TARIFFS.TEMPO.red.hp} €
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Abonnement/mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {TARIFFS.TEMPO.subscription} €
                  </span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Coût total</span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {simulation.tempo.total.toFixed(2)} €
                  </span>
                </div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600 dark:text-gray-300">Par mois</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {simulation.tempo.monthly.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  {simulation.tempo.savings >= 0 ? (
                    <>
                      <TrendingDown className="w-4 h-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        -{simulation.tempo.savings.toFixed(2)} € vs Base (
                        {simulation.tempo.savingsPercent.toFixed(1)}%)
                      </span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        +{Math.abs(simulation.tempo.savings).toFixed(2)} € vs Base
                      </span>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Chart comparison */}
          <Card
            title="Comparaison visuelle"
            icon={<Euro className="w-5 h-5 text-primary-600 dark:text-primary-400" />}
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-gray-600 dark:text-gray-400" />
                  <YAxis tick={{ fontSize: 12 }} className="text-gray-600 dark:text-gray-400" unit=" €" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--tooltip-bg, #fff)',
                      borderColor: 'var(--tooltip-border, #e5e7eb)',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => `${value.toFixed(2)} €`}
                  />
                  <Legend />
                  <Bar dataKey="total" name="Coût total" fill="#3b82f6" />
                  <Bar dataKey="monthly" name="Coût mensuel" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <div className="text-center py-12">
            <Calculator className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              Sélectionnez un PDL et une période pour simuler les différentes options tarifaires
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
