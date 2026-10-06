import { useMemo } from 'react'
import type { ProductionAPIResponse, DetailAPIResponse } from '../types/production.types'
import { getIntervalLength, getReadings, getUnit, hasReadings } from '@/utils/enedisMeasure'

interface UseProductionCalcsProps {
  productionData: ProductionAPIResponse | null
  detailData: DetailAPIResponse | null
}

export function useProductionCalcs({
  productionData,
  detailData,
}: UseProductionCalcsProps) {

  // Process production data for charts
  const chartData = useMemo(() => {
    if (!hasReadings(productionData)) {
      return { byYear: [], byMonth: [], byMonthComparison: [], total: 0, years: [], unit: 'W' }
    }

    const readings = getReadings(productionData)
    const unit = getUnit(productionData) || 'W'
    const intervalLength = getIntervalLength(productionData) || 'P1D'

    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^PT?(\d+)([DHM])$/)
      if (!match) return 1

      const value = parseInt(match[1], 10)
      const unitType = match[2]

      switch (unitType) {
        case 'D': return 1
        case 'H': return value
        case 'M': return value / 60
        default: return 1
      }
    }

    const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
      if (valueUnit === 'Wh' || valueUnit === 'WH') return 1
      if (valueUnit === 'W') {
        return parseIntervalToDurationInHours(interval)
      }
      return 1
    }

    const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)

    const monthlyData: Record<string, number> = {}
    const monthYearData: Record<string, Record<string, number>> = {}
    let totalProduction = 0

    // Find the most recent date in the actual data
    let mostRecentDate = new Date(0)
    readings.forEach((reading) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (dateStr) {
        const readingDate = new Date(dateStr)
        if (readingDate > mostRecentDate) {
          mostRecentDate = readingDate
        }
      }
    })

    // Define 365-day periods (sliding windows)
    const period1End = mostRecentDate
    const period1Start = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2End = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2Start = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3End = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3Start = new Date(mostRecentDate.getTime() - 1095 * 24 * 60 * 60 * 1000)

    const periods = [
      {
        label: String(period1End.getFullYear()),
        startDaysAgo: 0,
        endDaysAgo: 365,
        startDate: period1Start,
        endDate: period1End
      },
      {
        label: String(period2End.getFullYear()),
        startDaysAgo: 365,
        endDaysAgo: 730,
        startDate: period2Start,
        endDate: period2End
      },
      {
        label: String(period3End.getFullYear()),
        startDaysAgo: 730,
        endDaysAgo: 1095,
        startDate: period3Start,
        endDate: period3End
      }
    ]

    const periodData: Record<string, { value: number, startDate: Date, endDate: Date }> = {}
    const periodMonthlyData: Record<string, Record<string, number>> = {}

    readings.forEach((reading) => {
      const rawValue = reading.value
      const dateStr = reading.date?.split('T')[0] || reading.date

      if (!dateStr || isNaN(rawValue)) return

      const value = rawValue * intervalMultiplier
      const readingDate = new Date(dateStr)
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(0, 7)
      const monthOnly = dateStr.substring(5, 7)

      periods.forEach(period => {
        if (readingDate >= period.startDate && readingDate <= period.endDate) {
          if (!periodData[period.label]) {
            periodData[period.label] = {
              value: 0,
              startDate: period.startDate,
              endDate: period.endDate
            }
          }
          periodData[period.label].value += value

          if (!periodMonthlyData[period.label]) {
            periodMonthlyData[period.label] = {}
          }
          periodMonthlyData[period.label][month] = (periodMonthlyData[period.label][month] || 0) + value
        }
      })

      monthlyData[month] = (monthlyData[month] || 0) + value

      if (!monthYearData[monthOnly]) {
        monthYearData[monthOnly] = {}
      }
      monthYearData[monthOnly][year] = (monthYearData[monthOnly][year] || 0) + value

      totalProduction += value
    })

    const byYear = Object.entries(periodData)
      .map(([label, data]) => ({
        year: label,
        production: Math.round(data.value),
        startDate: data.startDate,
        endDate: data.endDate
      }))
      .reverse()

    const years = Object.keys(monthYearData).length > 0
      ? Object.keys(readings.reduce((acc: any, r: any) => {
          const year = r.date?.substring(0, 4)
          if (year) acc[year] = true
          return acc
        }, {})).sort()
      : []

    const byMonth = Object.entries(monthlyData)
      .map(([month, value]) => ({
        month,
        monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' }),
        production: Math.round(value),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    const monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

    const byMonthComparison = monthNames.map((monthNum, idx) => {
      const row: any = {
        month: monthNum,
        monthLabel: monthLabels[idx],
      }

      years.forEach(year => {
        const value = monthYearData[monthNum]?.[year] || 0
        row[year] = Math.round(value)
      })

      return row
    })

    const yearsByPeriod = periods.map(period => {
      const periodMonths = periodMonthlyData[period.label] || {}
      const byMonth = Object.entries(periodMonths)
        .map(([month, value]) => ({
          month,
          monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' }),
          production: Math.round(value),
        }))
        .sort((a, b) => a.month.localeCompare(b.month))

      return {
        label: period.label,
        byMonth
      }
    }).reverse()

    return {
      byYear,
      byMonth,
      byMonthComparison,
      total: Math.round(totalProduction),
      years,
      yearsByPeriod,
      unit,
    }
  }, [productionData])

  // Process detailed production data by day
  const detailByDayData = useMemo(() => {
    if (!hasReadings(detailData)) {
      return []
    }

    const readings = getReadings(detailData)
    const unit = getUnit(detailData) || 'W'
    const intervalLength = getIntervalLength(detailData) || 'P30M'

    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^PT?(\d+)([DHM])$/)
      if (!match) return 0.5

      const value = parseInt(match[1], 10)
      const unitType = match[2]

      switch (unitType) {
        case 'D': return value * 24
        case 'H': return value
        case 'M': return value / 60
        default: return 0.5
      }
    }

    const getIntervalMultiplier = (interval: string, valueUnit: string): number => {
      if (valueUnit === 'Wh' || valueUnit === 'WH') return 1
      if (valueUnit === 'W') {
        return parseIntervalToDurationInHours(interval)
      }
      return 1
    }

    const intervalDurationHours = parseIntervalToDurationInHours(intervalLength)
    const intervalDurationMinutes = intervalDurationHours * 60

    const dayMap: Record<string, any[]> = {}

    readings.forEach((reading) => {
      if (!reading.date) return

      let apiDateTime: Date

      if (reading.date.includes('T')) {
        apiDateTime = new Date(reading.date)
      } else if (reading.date.includes(' ')) {
        apiDateTime = new Date(reading.date.replace(' ', 'T'))
      } else {
        apiDateTime = new Date(reading.date + 'T00:00:00')
      }

      const actualDateTime = new Date(apiDateTime.getTime() - intervalDurationMinutes * 60 * 1000)

      const year = actualDateTime.getFullYear()
      const month = String(actualDateTime.getMonth() + 1).padStart(2, '0')
      const day = String(actualDateTime.getDate()).padStart(2, '0')
      const hours = String(actualDateTime.getHours()).padStart(2, '0')
      const minutes = String(actualDateTime.getMinutes()).padStart(2, '0')

      const dateStr = `${year}-${month}-${day}`
      const time = `${hours}:${minutes}`

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = []
      }

      const pointInterval = reading.interval_length || intervalLength
      const pointMultiplier = getIntervalMultiplier(pointInterval, unit)
      const pointDurationHours = parseIntervalToDurationInHours(pointInterval)
      const rawValue = reading.value
      const energyWh = rawValue * pointMultiplier
      const energyKwh = energyWh / 1000
      const averagePowerW = pointDurationHours > 0 ? energyWh / pointDurationHours : rawValue
      const averagePowerKw = averagePowerW / 1000

      dayMap[dateStr].push({
        time,
        power: averagePowerKw,
        energyWh,
        energyKwh,
        rawValue,
        datetime: actualDateTime.toISOString(),
        apiDatetime: reading.date
      })
    })

    const days = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        data: data.sort((a, b) => a.time.localeCompare(b.time)),
        totalEnergyKwh: data.reduce((sum, d) => sum + d.energyKwh, 0)
      }))
      .filter(day => day.data.length >= 40)
      .sort((a, b) => b.date.localeCompare(a.date))

    return days
  }, [detailData])

  return {
    chartData,
    detailByDayData,
  }
}
