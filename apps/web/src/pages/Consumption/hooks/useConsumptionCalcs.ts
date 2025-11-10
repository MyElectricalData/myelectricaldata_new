import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseOffpeakHours, isOffpeakTime } from '@/utils/offpeakHours'
import type { ConsumptionAPIResponse, MaxPowerAPIResponse, DetailAPIResponse } from '../types/consumption.types'

interface UseConsumptionCalcsProps {
  consumptionData: ConsumptionAPIResponse | null
  maxPowerData: MaxPowerAPIResponse | null
  detailData: DetailAPIResponse | null
  selectedPDL: string | null
  selectedPDLDetails: any
  hcHpCalculationTrigger: number
}

export function useConsumptionCalcs({
  consumptionData,
  maxPowerData,
  detailData,
  selectedPDL,
  selectedPDLDetails,
  hcHpCalculationTrigger
}: UseConsumptionCalcsProps) {
  const queryClient = useQueryClient()
  const [selectedPowerYear, setSelectedPowerYear] = useState(0)

  // Process consumption data for charts
  const chartData = useMemo(() => {
    if (!consumptionData?.meter_reading?.interval_reading) {
      return { byYear: [], byMonth: [], byMonthComparison: [], total: 0, years: [], unit: 'W' }
    }

    const readings = consumptionData.meter_reading.interval_reading
    const unit = consumptionData.meter_reading.reading_type?.unit || 'W'
    const intervalLength = consumptionData.meter_reading.reading_type?.interval_length || 'P1D'

    // Parse interval length to determine how to handle the values
    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^P(\d+)([DHM])$/)
      if (!match) return 1

      const value = parseInt(match[1], 10)
      const unitType = match[2]

      switch (unitType) {
        case 'D': return 1 // Daily values are already total energy
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
    let totalConsumption = 0

    // Find the most recent date in the actual data
    let mostRecentDate = new Date(0)
    readings.forEach((reading: any) => {
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

    // Aggregate by 365-day periods
    const periodData: Record<string, { value: number, startDate: Date, endDate: Date }> = {}

    readings.forEach((reading: any) => {
      const rawValue = parseFloat(reading.value || 0)
      const dateStr = reading.date?.split('T')[0] || reading.date

      if (!dateStr || isNaN(rawValue)) return

      const value = rawValue * intervalMultiplier
      const readingDate = new Date(dateStr)
      const year = dateStr.substring(0, 4)
      const month = dateStr.substring(0, 7)
      const monthOnly = dateStr.substring(5, 7)

      // Find which period this reading belongs to
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
        }
      })

      // Aggregate by month
      monthlyData[month] = (monthlyData[month] || 0) + value

      // Aggregate by month for year comparison
      if (!monthYearData[monthOnly]) {
        monthYearData[monthOnly] = {}
      }
      monthYearData[monthOnly][year] = (monthYearData[monthOnly][year] || 0) + value

      totalConsumption += value
    })

    // Convert to chart format
    const byYear = Object.entries(periodData)
      .map(([label, data]) => ({
        year: label,
        consumption: Math.round(data.value),
        consommation: Math.round(data.value),
        startDate: data.startDate,
        endDate: data.endDate
      }))
      .reverse()

    // Get all years for compatibility
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
        consumption: Math.round(value),
        consommation: Math.round(value),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // Monthly comparison across years
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

    return {
      byYear,
      byMonth,
      byMonthComparison,
      total: Math.round(totalConsumption),
      years,
      unit,
    }
  }, [consumptionData])

  // Process max power data by year
  const powerByYearData = useMemo(() => {
    if (!maxPowerData?.meter_reading?.interval_reading) {
      return []
    }

    const readings = maxPowerData.meter_reading.interval_reading

    // Get the most recent date in the data
    let mostRecentDate = new Date(0)
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (dateStr) {
        const readingDate = new Date(dateStr)
        if (readingDate > mostRecentDate) {
          mostRecentDate = readingDate
        }
      }
    })

    // Define 3 years of 365-day periods
    const period1End = mostRecentDate
    const period1Start = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2End = new Date(mostRecentDate.getTime() - 365 * 24 * 60 * 60 * 1000)
    const period2Start = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3End = new Date(mostRecentDate.getTime() - 730 * 24 * 60 * 60 * 1000)
    const period3Start = new Date(mostRecentDate.getTime() - 1095 * 24 * 60 * 60 * 1000)

    const periods = [
      { label: String(period1End.getFullYear()), startDate: period1Start, endDate: period1End, data: [] as any[] },
      { label: String(period2End.getFullYear()), startDate: period2Start, endDate: period2End, data: [] as any[] },
      { label: String(period3End.getFullYear()), startDate: period3Start, endDate: period3End, data: [] as any[] },
    ]

    // Group readings by period
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (!dateStr) return

      const readingDate = new Date(dateStr)
      const power = parseFloat(reading.value || 0) / 1000 // Convert W to kW

      // Extract time from date field
      let time = ''
      if (reading.date?.includes('T')) {
        time = reading.date.split('T')[1]?.substring(0, 5) || ''
      } else if (reading.date?.includes(' ')) {
        time = reading.date.split(' ')[1]?.substring(0, 5) || ''
      }

      periods.forEach(period => {
        if (readingDate >= period.startDate && readingDate <= period.endDate) {
          period.data.push({
            date: dateStr,
            power: power,
            time: time,
            year: period.label
          })
        }
      })
    })

    // Sort data by date within each period
    periods.forEach(period => {
      period.data.sort((a, b) => a.date.localeCompare(b.date))
    })

    return periods.reverse()
  }, [maxPowerData])

  // Set default year when power data loads
  useEffect(() => {
    if (powerByYearData.length > 0) {
      setSelectedPowerYear(powerByYearData.length - 1)
    }
  }, [powerByYearData.length])

  // Process detailed consumption data by day (load curve)
  const detailByDayData = useMemo(() => {
    if (!detailData?.meter_reading?.interval_reading) {
      return []
    }

    const readings = detailData.meter_reading.interval_reading
    const unit = detailData.meter_reading.reading_type?.unit || 'W'
    const intervalLength = detailData.meter_reading.reading_type?.interval_length || 'P30M'

    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^P(\d+)([DHM])$/)
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

    const intervalMultiplier = getIntervalMultiplier(intervalLength, unit)
    const intervalDurationHours = parseIntervalToDurationInHours(intervalLength)
    const intervalDurationMinutes = intervalDurationHours * 60

    // Group readings by day
    const dayMap: Record<string, any[]> = {}

    readings.forEach((reading: any) => {
      if (!reading.date) return

      // Parse the API datetime
      let apiDateTime: Date

      if (reading.date.includes('T')) {
        apiDateTime = new Date(reading.date)
      } else if (reading.date.includes(' ')) {
        apiDateTime = new Date(reading.date.replace(' ', 'T'))
      } else {
        apiDateTime = new Date(reading.date + 'T00:00:00')
      }

      // Shift backwards by interval duration to get measurement START time
      const actualDateTime = new Date(apiDateTime.getTime() - intervalDurationMinutes * 60 * 1000)

      // Extract date and time from the actual measurement start time
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

      const rawValue = parseFloat(reading.value || 0)
      const energyWh = rawValue * intervalMultiplier
      const energyKwh = energyWh / 1000
      const averagePowerW = intervalDurationHours > 0 ? energyWh / intervalDurationHours : rawValue
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

    // Convert to array and sort by date
    const days = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        data: data.sort((a, b) => a.time.localeCompare(b.time)),
        totalEnergyKwh: data.reduce((sum, d) => sum + d.energyKwh, 0)
      }))
      .filter(day => day.data.length >= 40) // Filter incomplete days
      .sort((a, b) => b.date.localeCompare(a.date))

    return days
  }, [detailData])

  // Calculate HC/HP statistics by year from all cached detailed data
  const hcHpByYear = useMemo(() => {
    if (!selectedPDL) {
      return []
    }

    const offpeakRanges = parseOffpeakHours(selectedPDLDetails?.offpeak_hours)
    const queryCache = queryClient.getQueryCache()
    const allDetailQueries = queryCache.findAll({
      queryKey: ['consumptionDetail', selectedPDL],
      exact: false,
    })

    const allReadings: Array<{ date: Date; energyKwh: number; isHC: boolean }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as any
      const data = response?.data

      if (!data?.meter_reading?.interval_reading) return

      const readings = data.meter_reading.interval_reading
      const unit = data.meter_reading.reading_type?.unit || 'W'
      const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

      const parseIntervalToDurationInHours = (interval: string): number => {
        const match = interval.match(/^P(\d+)([DHM])$/)
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

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || !reading.value) return

        const dateTimeStr = reading.date.includes('T')
          ? reading.date
          : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)

        const energyWh = parseFloat(reading.value) * intervalMultiplier
        const energyKwh = energyWh / 1000

        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        const isHC = isOffpeakTime(hour, minute, offpeakRanges)

        allReadings.push({
          date: apiDateTime,
          energyKwh,
          isHC
        })
      })
    })

    if (allReadings.length === 0) return []

    const mostRecentDate = new Date(Math.max(...allReadings.map(r => r.date.getTime())))

    // Define 3 rolling 365-day periods
    const periods = []
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date(mostRecentDate)
      periodEnd.setDate(mostRecentDate.getDate() - (i * 365))

      const periodStart = new Date(periodEnd)
      periodStart.setDate(periodEnd.getDate() - 364)

      periods.push({
        start: periodStart,
        end: periodEnd,
        label: `${periodStart.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })} - ${periodEnd.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}`
      })
    }

    const result = periods.map(period => {
      const periodReadings = allReadings.filter(r => r.date >= period.start && r.date <= period.end)

      const hcKwh = periodReadings.filter(r => r.isHC).reduce((sum, r) => sum + r.energyKwh, 0)
      const hpKwh = periodReadings.filter(r => !r.isHC).reduce((sum, r) => sum + r.energyKwh, 0)
      const totalKwh = hcKwh + hpKwh

      return {
        year: period.label,
        hcKwh,
        hpKwh,
        totalKwh
      }
    }).filter(p => p.totalKwh > 0)

    return result
  }, [selectedPDL, selectedPDLDetails?.offpeak_hours, hcHpCalculationTrigger, queryClient])

  // Calculate monthly HC/HP data for each rolling year period
  const monthlyHcHpByYear = useMemo(() => {
    if (!selectedPDL || !selectedPDLDetails?.offpeak_hours) {
      return []
    }

    const offpeakRanges = parseOffpeakHours(selectedPDLDetails.offpeak_hours)
    const queryCache = queryClient.getQueryCache()
    const allDetailQueries = queryCache.findAll({
      queryKey: ['consumptionDetail', selectedPDL],
      exact: false,
    })

    if (allDetailQueries.length === 0) return []

    const allReadings: Array<{ date: Date; energyKwh: number; isHC: boolean }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as any
      const data = response?.data

      if (!data?.meter_reading?.interval_reading) return

      const readings = data.meter_reading.interval_reading
      const unit = data.meter_reading.reading_type?.unit || 'W'
      const intervalLength = data.meter_reading.reading_type?.interval_length || 'P30M'

      const parseIntervalToDurationInHours = (interval: string): number => {
        const match = interval.match(/^P(\d+)([DHM])$/)
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

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || !reading.value) return

        const dateTimeStr = reading.date.includes('T') ? reading.date : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)
        const energyWh = parseFloat(reading.value) * intervalMultiplier
        const energyKwh = energyWh / 1000
        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        const isHC = isOffpeakTime(hour, minute, offpeakRanges)

        allReadings.push({ date: apiDateTime, energyKwh, isHC })
      })
    })

    if (allReadings.length === 0) return []

    const mostRecentDate = new Date(Math.max(...allReadings.map(r => r.date.getTime())))

    // Define 3 rolling 365-day periods
    const periods = []
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date(mostRecentDate)
      periodEnd.setDate(mostRecentDate.getDate() - (i * 365))
      const periodStart = new Date(periodEnd)
      periodStart.setDate(periodEnd.getDate() - 364)

      const endYear = periodEnd.getFullYear()

      periods.push({
        start: periodStart,
        end: periodEnd,
        label: endYear.toString()
      })
    }

    const result = periods.map(period => {
      const periodReadings = allReadings.filter(r => r.date >= period.start && r.date <= period.end)

      const monthlyData: Record<string, { hcKwh: number; hpKwh: number; month: string }> = {}

      periodReadings.forEach(reading => {
        const monthKey = `${reading.date.getFullYear()}-${String(reading.date.getMonth() + 1).padStart(2, '0')}`

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            hcKwh: 0,
            hpKwh: 0,
            month: new Date(reading.date.getFullYear(), reading.date.getMonth(), 1)
              .toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
          }
        }

        if (reading.isHC) {
          monthlyData[monthKey].hcKwh += reading.energyKwh
        } else {
          monthlyData[monthKey].hpKwh += reading.energyKwh
        }
      })

      const months = Object.keys(monthlyData).sort().map(key => ({
        month: monthlyData[key].month,
        hcKwh: monthlyData[key].hcKwh,
        hpKwh: monthlyData[key].hpKwh,
        totalKwh: monthlyData[key].hcKwh + monthlyData[key].hpKwh
      }))

      return {
        year: period.label,
        months
      }
    }).filter(p => p.months.length >= 12)

    return result
  }, [selectedPDL, selectedPDLDetails?.offpeak_hours, hcHpCalculationTrigger, queryClient])

  return {
    chartData,
    powerByYearData,
    selectedPowerYear,
    setSelectedPowerYear,
    detailByDayData,
    hcHpByYear,
    monthlyHcHpByYear
  }
}
