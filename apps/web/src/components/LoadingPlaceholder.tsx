import { TrendingUp, BarChart3, Zap, Calendar, Activity } from 'lucide-react'

interface LoadingPlaceholderProps {
  /** Type de page pour adapter le placeholder */
  type: 'consumption' | 'production' | 'simulation'
}

/**
 * Affiche une version fictive de la page qui sera floutée pendant le chargement.
 * Donne à l'utilisateur un aperçu de la structure de la page.
 */
export function LoadingPlaceholder({ type }: LoadingPlaceholderProps) {
  switch (type) {
    case 'consumption':
      return <ConsumptionPlaceholder />
    case 'production':
      return <ProductionPlaceholder />
    case 'simulation':
      return <SimulationPlaceholder />
    default:
      return <ConsumptionPlaceholder />
  }
}

/** Placeholder pour la page Consommation */
function ConsumptionPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="text-primary-600 dark:text-primary-400" size={32} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Consommation électrique
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardPlaceholder
          icon={<Zap className="text-yellow-500" size={24} />}
          label="Consommation totale"
          value="12,847"
          unit="kWh"
        />
        <StatCardPlaceholder
          icon={<Calendar className="text-blue-500" size={24} />}
          label="Moyenne journalière"
          value="35.2"
          unit="kWh/j"
        />
        <StatCardPlaceholder
          icon={<Activity className="text-green-500" size={24} />}
          label="Heures creuses"
          value="42"
          unit="%"
        />
        <StatCardPlaceholder
          icon={<TrendingUp className="text-purple-500" size={24} />}
          label="Pic de puissance"
          value="8.4"
          unit="kVA"
        />
      </div>

      {/* Chart Section */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Évolution de la consommation
          </h2>
        </div>
        <ChartPlaceholder height={300} />
      </div>

      {/* Distribution HC/HP */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="text-primary-600 dark:text-primary-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Répartition HC/HP
          </h2>
        </div>
        <div className="flex gap-8">
          <PieChartPlaceholder />
          <div className="flex-1 space-y-4">
            <DistributionBarPlaceholder label="Heures Creuses" value={42} color="bg-blue-500" />
            <DistributionBarPlaceholder label="Heures Pleines" value={58} color="bg-orange-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Placeholder pour la page Production */
function ProductionPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Zap className="text-primary-600 dark:text-primary-400" size={32} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Production électrique
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCardPlaceholder
          icon={<Zap className="text-yellow-500" size={24} />}
          label="Production totale"
          value="3,245"
          unit="kWh"
        />
        <StatCardPlaceholder
          icon={<Calendar className="text-green-500" size={24} />}
          label="Moyenne journalière"
          value="8.9"
          unit="kWh/j"
        />
        <StatCardPlaceholder
          icon={<TrendingUp className="text-blue-500" size={24} />}
          label="Pic de production"
          value="4.2"
          unit="kW"
        />
      </div>

      {/* Chart */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Évolution de la production
          </h2>
        </div>
        <ChartPlaceholder height={300} color="green" />
      </div>
    </div>
  )
}

/** Placeholder pour la page Simulation */
function SimulationPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="text-primary-600 dark:text-primary-400" size={32} />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Simulateur de tarifs
        </h1>
      </div>

      {/* Offer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <OfferCardPlaceholder
          name="Tarif Base"
          provider="EDF"
          price="1,845.00"
          isBest
        />
        <OfferCardPlaceholder
          name="Heures Creuses"
          provider="EDF"
          price="1,923.50"
        />
        <OfferCardPlaceholder
          name="Tempo"
          provider="EDF"
          price="1,756.80"
        />
      </div>

      {/* Comparison Chart */}
      <div className="mt-6 rounded-xl shadow-md border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="text-primary-600 dark:text-primary-400" size={20} />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Comparaison des offres
          </h2>
        </div>
        <ChartPlaceholder height={250} type="bar" />
      </div>
    </div>
  )
}

// === Composants de base ===

function StatCardPlaceholder({
  icon,
  label,
  value,
  unit
}: {
  icon: React.ReactNode
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

function ChartPlaceholder({
  height = 200,
  color = 'primary',
  type = 'line'
}: {
  height?: number
  color?: 'primary' | 'green' | 'blue'
  type?: 'line' | 'bar'
}) {
  const colorClasses = {
    primary: 'from-primary-500/20 to-primary-600/40',
    green: 'from-green-500/20 to-green-600/40',
    blue: 'from-blue-500/20 to-blue-600/40'
  }

  if (type === 'bar') {
    return (
      <div className="flex items-end gap-2 justify-around" style={{ height }}>
        {[65, 85, 45, 90, 70, 80, 55, 95, 60, 75].map((h, i) => (
          <div
            key={i}
            className={`w-8 rounded-t bg-gradient-to-t ${colorClasses[color]}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`w-full rounded-lg bg-gradient-to-br ${colorClasses[color]}`}
      style={{ height }}
    >
      {/* Fake line chart path */}
      <svg className="w-full h-full" preserveAspectRatio="none">
        <path
          d="M0,150 Q50,120 100,130 T200,100 T300,110 T400,80 T500,90 T600,60 T700,70 T800,50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary-500 dark:text-primary-400"
        />
      </svg>
    </div>
  )
}

function PieChartPlaceholder() {
  return (
    <div className="relative w-32 h-32">
      <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="20"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* HC portion (42%) */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="20"
          strokeDasharray="105.6 251.2"
          className="text-blue-500"
        />
        {/* HP portion (58%) - offset */}
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="20"
          strokeDasharray="145.6 251.2"
          strokeDashoffset="-105.6"
          className="text-orange-500"
        />
      </svg>
    </div>
  )
}

function DistributionBarPlaceholder({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
        <span className="text-sm font-medium text-gray-900 dark:text-white">{value}%</span>
      </div>
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function OfferCardPlaceholder({
  name,
  provider,
  price,
  isBest = false
}: {
  name: string
  provider: string
  price: string
  isBest?: boolean
}) {
  return (
    <div className={`p-4 rounded-xl shadow-md border ${
      isBest
        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
      {isBest && (
        <span className="text-xs font-medium text-green-600 dark:text-green-400 mb-2 block">
          ⭐ Meilleure offre
        </span>
      )}
      <h3 className="font-semibold text-gray-900 dark:text-white">{name}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{provider}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white mt-2">
        {price} €<span className="text-sm font-normal text-gray-500">/an</span>
      </p>
    </div>
  )
}
