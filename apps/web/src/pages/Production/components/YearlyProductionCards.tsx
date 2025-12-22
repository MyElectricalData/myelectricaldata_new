import { Download, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import { toast } from '@/stores/notificationStore'

interface YearlyProductionCardsProps {
  chartData: {
    byYear: any[]
    unit?: string
  }
  productionData: any
}

// Card colors - dark background with colored borders (matching screenshot style)
const cardColors = [
  {
    border: 'border-emerald-500',
    title: 'text-emerald-400',
    value: 'text-white',
    subtitle: 'text-gray-400',
    icon: 'text-emerald-400',
  },
  {
    border: 'border-blue-500',
    title: 'text-blue-400',
    value: 'text-white',
    subtitle: 'text-gray-400',
    icon: 'text-blue-400',
  },
  {
    border: 'border-purple-500',
    title: 'text-purple-400',
    value: 'text-white',
    subtitle: 'text-gray-400',
    icon: 'text-purple-400',
  },
  {
    border: 'border-amber-500',
    title: 'text-amber-400',
    value: 'text-white',
    subtitle: 'text-gray-400',
    icon: 'text-amber-400',
  },
]

export function YearlyProductionCards({ chartData, productionData }: YearlyProductionCardsProps) {
  const handleExportYear = (yearData: any) => {
    const intervalLength = productionData?.meter_reading?.reading_type?.interval_length || 'P1D'
    const unit = productionData?.meter_reading?.reading_type?.unit || 'W'

    const startDateFormatted = yearData.startDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
    const endDateFormatted = yearData.endDate.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })

    // Parse interval to duration in hours
    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^P(\d+)([DHM])$/)
      if (!match) return 1
      const value = parseInt(match[1], 10)
      const unit = match[2]
      switch (unit) {
        case 'D': return 1 // Daily values are already total energy
        case 'H': return value
        case 'M': return value / 60
        default: return 1
      }
    }

    // Get interval multiplier for this export
    const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
      if (valueUnit === 'Wh' || valueUnit === 'WH') return 1
      if (valueUnit === 'W') {
        return parseIntervalToDurationInHours(interval)
      }
      return 1
    }

    const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)

    // Filter interval readings for this year and apply multiplier
    const yearReadings = productionData?.meter_reading?.interval_reading?.filter((reading: any) => {
      const date = reading.date?.split('T')[0] || reading.date
      return date && date.startsWith(yearData.year)
    }).map((reading: any) => ({
      date: reading.date?.split('T')[0] || reading.date,
      value_raw: parseFloat(reading.value || 0),
      value_wh: parseFloat(reading.value || 0) * intervalMultiplier
    })) || []

    const jsonData = JSON.stringify({
      year: yearData.year,
      startDate: startDateFormatted,
      endDate: endDateFormatted,
      production_kwh: (yearData.production / 1000),
      production_wh: yearData.production,
      unit_raw: unit,
      interval_length: intervalLength,
      interval_multiplier: intervalMultiplier,
      interval_readings: yearReadings,
      total_readings: yearReadings.length
    }, null, 2)

    navigator.clipboard.writeText(jsonData)
    toast.success(`Données ${yearData.year} copiées (${yearReadings.length} lectures)`)
  }

  const handleExportAll = () => {
    const jsonData = JSON.stringify(chartData.byYear, null, 2)
    navigator.clipboard.writeText(jsonData)
    toast.success('Données copiées dans le presse-papier')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Production par année
        </h3>
        <button
          onClick={handleExportAll}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Download size={16} className="flex-shrink-0" />
          <span>Export JSON</span>
        </button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className={`grid gap-3 grid-cols-1 sm:grid-cols-2 ${
          chartData.byYear.length === 3
            ? 'lg:grid-cols-3'
            : chartData.byYear.length >= 4
              ? 'lg:grid-cols-3 xl:grid-cols-4'
              : 'lg:grid-cols-2'
        }`}>
          {chartData.byYear.map((yearData, index) => {
            const colors = cardColors[index % cardColors.length]
            const startDateFormatted = yearData.startDate.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })
            const endDateFormatted = yearData.endDate.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            })

            // Calculate year-over-year change
            const previousYearData = chartData.byYear.find((y: any) =>
              parseInt(y.year) === parseInt(yearData.year) - 1
            )
            const yoyChange = previousYearData
              ? ((yearData.production - previousYearData.production) / previousYearData.production) * 100
              : null

            return (
              <div
                key={yearData.year}
                className={`bg-gray-50 dark:bg-gray-800/80 rounded-xl p-4 border-2 ${colors.border} shadow-sm hover:shadow-md transition-all duration-200`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap size={18} className={colors.icon} />
                      <p className={`text-lg font-bold text-gray-900 dark:${colors.title}`}>
                        {yearData.year}
                      </p>
                    </div>
                    <button
                      onClick={() => handleExportYear(yearData)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      <Download size={14} />
                    </button>
                  </div>

                  <p className={`text-xs flex items-center gap-1 text-gray-500 dark:${colors.subtitle}`}>
                    <span>📅</span> {startDateFormatted} → {endDateFormatted}
                  </p>

                  <div className="mt-2">
                    <p className={`text-2xl font-bold text-gray-900 dark:${colors.value}`}>
                      {(yearData.production / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWh
                    </p>
                  </div>

                  {/* Year-over-year comparison */}
                  {yoyChange !== null && (
                    <div className="flex items-center gap-1.5 text-sm">
                      {yoyChange >= 0 ? (
                        <TrendingUp size={14} className="text-emerald-500" />
                      ) : (
                        <TrendingDown size={14} className="text-red-500" />
                      )}
                      <span className={`font-medium ${
                        yoyChange >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}%
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        vs année précédente
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
