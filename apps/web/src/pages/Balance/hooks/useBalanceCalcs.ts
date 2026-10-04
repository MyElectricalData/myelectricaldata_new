import { useMemo } from 'react'
import type { EnedisMeasure, MeasureReading } from '@/types/api'
import { getIntervalLength, getReadings, getUnit, hasReadings } from '@/utils/enedisMeasure'
import type { BalanceChartData, YearlyBalance, MonthlyBalance, DailyBalance } from '../types/balance.types'

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

function getIntervalMultiplier(intervalLength?: string, unit?: string): number {
  // If unit is already Wh, no conversion needed
  if (unit === 'Wh' || unit === 'WH') return 1

  // For W (power), multiply by interval duration in hours to get Wh
  if (unit === 'W') {
    const match = intervalLength?.match(/^PT?(\d+)([DHM])$/)
    if (!match) return 1
    const val = parseInt(match[1], 10)
    const u = match[2]
    switch (u) {
      case 'D': return 1 // Daily values are already total energy
      case 'H': return val
      case 'M': return val / 60
      default: return 1
    }
  }
  return 1
}

export function useBalanceCalcs(
  consumptionData: EnedisMeasure | null,
  productionData: EnedisMeasure | null,
  consumptionDetailData?: EnedisMeasure | null,
  productionDetailData?: EnedisMeasure | null
): BalanceChartData | null {
  return useMemo(() => {
    if (!hasReadings(consumptionData) || !hasReadings(productionData)) {
      return null
    }

    const consumptionReadings = getReadings(consumptionData)
    const productionReadings = getReadings(productionData)

    const consumptionInterval = getIntervalLength(consumptionData)
    const consumptionUnit = getUnit(consumptionData)
    const productionInterval = getIntervalLength(productionData)
    const productionUnit = getUnit(productionData)

    const consumptionMultiplier = getIntervalMultiplier(consumptionInterval, consumptionUnit)
    const productionMultiplier = getIntervalMultiplier(productionInterval, productionUnit)

    // Create maps for quick lookup by date
    const consumptionByDate = new Map<string, number>()
    const productionByDate = new Map<string, number>()

    consumptionReadings.forEach((reading: MeasureReading) => {
      const date = reading.date?.split('T')[0] || reading.date
      const value = reading.value * consumptionMultiplier
      consumptionByDate.set(date, (consumptionByDate.get(date) || 0) + value)
    })

    productionReadings.forEach((reading: MeasureReading) => {
      const date = reading.date?.split('T')[0] || reading.date
      const value = reading.value * productionMultiplier
      productionByDate.set(date, (productionByDate.get(date) || 0) + value)
    })

    // Get all unique dates
    const allDates = new Set([...consumptionByDate.keys(), ...productionByDate.keys()])
    const sortedDates = Array.from(allDates).sort()

    // Calculate daily balance
    const byDay: DailyBalance[] = sortedDates.map(date => {
      const consumption = consumptionByDate.get(date) || 0
      const production = productionByDate.get(date) || 0
      return {
        date,
        consumption,
        production,
        netBalance: production - consumption
      }
    })

    // Group by year
    const yearGroups = new Map<string, { consumption: number; production: number; dates: string[] }>()
    byDay.forEach(day => {
      const year = day.date.substring(0, 4)
      if (!yearGroups.has(year)) {
        yearGroups.set(year, { consumption: 0, production: 0, dates: [] })
      }
      const group = yearGroups.get(year)!
      group.consumption += day.consumption
      group.production += day.production
      group.dates.push(day.date)
    })

    const years = Array.from(yearGroups.keys()).sort()

    const byYear: YearlyBalance[] = years.map(year => {
      const group = yearGroups.get(year)!
      const dates = group.dates.sort()

      // Estimate self-consumption rate
      // Without detailed data, we estimate based on min(production, consumption) / production
      // This assumes all production is self-consumed up to consumption level
      let selfConsumptionRate = 0
      if (group.production > 0) {
        // Simple estimation: min of daily prod vs conso, summed
        let selfConsumed = 0
        byDay.filter(d => d.date.startsWith(year)).forEach(day => {
          selfConsumed += Math.min(day.production, day.consumption)
        })
        selfConsumptionRate = (selfConsumed / group.production) * 100
      }

      return {
        year,
        consumption: group.consumption,
        production: group.production,
        netBalance: group.production - group.consumption,
        selfConsumptionRate,
        startDate: new Date(dates[0] + 'T00:00:00Z'),
        endDate: new Date(dates[dates.length - 1] + 'T00:00:00Z')
      }
    })

    // Group by month (for comparison chart)
    const monthGroups = new Map<string, Map<number, { consumption: number; production: number }>>()

    years.forEach(year => {
      monthGroups.set(year, new Map())
      for (let m = 1; m <= 12; m++) {
        monthGroups.get(year)!.set(m, { consumption: 0, production: 0 })
      }
    })

    byDay.forEach(day => {
      const year = day.date.substring(0, 4)
      const month = parseInt(day.date.substring(5, 7), 10)
      const monthData = monthGroups.get(year)?.get(month)
      if (monthData) {
        monthData.consumption += day.consumption
        monthData.production += day.production
      }
    })

    const byMonth: MonthlyBalance[] = []
    for (let m = 1; m <= 12; m++) {
      const monthEntry: MonthlyBalance = {
        month: m,
        monthLabel: MONTH_LABELS[m - 1],
        consumption: 0,
        production: 0,
        netBalance: 0
      }

      years.forEach(year => {
        const data = monthGroups.get(year)?.get(m)
        if (data) {
          monthEntry[`conso_${year}`] = data.consumption
          monthEntry[`prod_${year}`] = data.production
          monthEntry[`balance_${year}`] = data.production - data.consumption
          monthEntry.consumption += data.consumption
          monthEntry.production += data.production
        }
      })

      monthEntry.netBalance = monthEntry.production - monthEntry.consumption
      byMonth.push(monthEntry)
    }

    // Calculate totals
    const totalConsumption = byYear.reduce((sum, y) => sum + y.consumption, 0)
    const totalProduction = byYear.reduce((sum, y) => sum + y.production, 0)

    // Calculate overall self-consumption rate
    let overallSelfConsumption = 0
    if (totalProduction > 0) {
      let totalSelfConsumed = 0
      byDay.forEach(day => {
        totalSelfConsumed += Math.min(day.production, day.consumption)
      })
      overallSelfConsumption = (totalSelfConsumed / totalProduction) * 100
    }

    // If we have detailed data, recalculate self-consumption more accurately
    if (hasReadings(consumptionDetailData) && hasReadings(productionDetailData)) {
      // Create maps by timestamp
      const detailConsumption = new Map<string, number>()
      const detailProduction = new Map<string, number>()

      const detailConsoInterval = getIntervalLength(consumptionDetailData)
      const detailConsoUnit = getUnit(consumptionDetailData)
      const detailProdInterval = getIntervalLength(productionDetailData)
      const detailProdUnit = getUnit(productionDetailData)

      const detailConsoMultiplier = getIntervalMultiplier(detailConsoInterval, detailConsoUnit)
      const detailProdMultiplier = getIntervalMultiplier(detailProdInterval, detailProdUnit)

      getReadings(consumptionDetailData).forEach((reading: MeasureReading) => {
        const timestamp = reading.date
        const value = reading.value * detailConsoMultiplier
        detailConsumption.set(timestamp, value)
      })

      getReadings(productionDetailData).forEach((reading: MeasureReading) => {
        const timestamp = reading.date
        const value = reading.value * detailProdMultiplier
        detailProduction.set(timestamp, value)
      })

      // Calculate self-consumption at 30min resolution
      let detailedSelfConsumed = 0
      let detailedTotalProduction = 0

      detailProduction.forEach((prod, timestamp) => {
        detailedTotalProduction += prod
        const conso = detailConsumption.get(timestamp) || 0
        detailedSelfConsumed += Math.min(prod, conso)
      })

      if (detailedTotalProduction > 0) {
        overallSelfConsumption = (detailedSelfConsumed / detailedTotalProduction) * 100
      }
    }

    return {
      byYear,
      byMonth,
      byDay,
      years,
      totals: {
        consumption: totalConsumption,
        production: totalProduction,
        netBalance: totalProduction - totalConsumption,
        selfConsumptionRate: overallSelfConsumption
      }
    }
  }, [consumptionData, productionData, consumptionDetailData, productionDetailData])
}
