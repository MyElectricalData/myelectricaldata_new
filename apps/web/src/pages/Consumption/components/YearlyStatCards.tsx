import { Download } from 'lucide-react'
import toast from 'react-hot-toast'

interface YearlyStatCardsProps {
  chartData: {
    byYear: any[]
    unit?: string
  }
  consumptionData: any
}

export function YearlyStatCards({ chartData, consumptionData }: YearlyStatCardsProps) {
  const handleExportYear = (yearData: any) => {
    const intervalLength = consumptionData?.meter_reading?.reading_type?.interval_length || 'P1D'
    const unit = consumptionData?.meter_reading?.reading_type?.unit || 'W'

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
    const yearReadings = consumptionData?.meter_reading?.interval_reading?.filter((reading: any) => {
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
      consommation_kwh: (yearData.consommation / 1000),
      consommation_wh: yearData.consommation,
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
          Consommation par année
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
          {chartData.byYear.map((yearData) => {
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

            return (
              <div
                key={yearData.year}
                className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-200 dark:border-gray-600"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {yearData.year}
                    </p>
                    <button
                      onClick={() => handleExportYear(yearData)}
                      className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <Download size={14} />
                    </button>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {startDateFormatted} - {endDateFormatted}
                  </p>

                  <div className="mt-2">
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {(yearData.consommation / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWh
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {yearData.consommation.toLocaleString('fr-FR')} {chartData.unit === 'W' ? 'W' : 'Wh'}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}