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
  detailDateRange: { start: string; end: string } | null
}

export function useConsumptionCalcs({
  consumptionData,
  maxPowerData,
  detailData,
  selectedPDL,
  selectedPDLDetails,
  hcHpCalculationTrigger,
  detailDateRange: _detailDateRange // Not used anymore - show all cached data for fluid navigation
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

    // Create meaningful labels for 365-day rolling periods
    // Format: "YYYY-YYYY" if period spans two years, otherwise just "YYYY"
    const formatPeriodLabel = (startDate: Date, endDate: Date): string => {
      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()
      if (startYear === endYear) {
        return String(endYear)
      }
      return `${startYear}-${endYear}`
    }

    const periods = [
      {
        label: formatPeriodLabel(period1Start, period1End),
        startDaysAgo: 0,
        endDaysAgo: 365,
        startDate: period1Start,
        endDate: period1End
      },
      {
        label: formatPeriodLabel(period2Start, period2End),
        startDaysAgo: 365,
        endDaysAgo: 730,
        startDate: period2Start,
        endDate: period2End
      },
      {
        label: formatPeriodLabel(period3Start, period3End),
        startDaysAgo: 730,
        endDaysAgo: 1095,
        startDate: period3Start,
        endDate: period3End
      }
    ]

    // Aggregate by 365-day periods
    const periodData: Record<string, { value: number, startDate: Date, endDate: Date }> = {}
    const periodMonthlyData: Record<string, Record<string, number>> = {}

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

          // Aggregate monthly data for each period
          if (!periodMonthlyData[period.label]) {
            periodMonthlyData[period.label] = {}
          }
          periodMonthlyData[period.label][month] = (periodMonthlyData[period.label][month] || 0) + value
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

    // Create years array for AnnualCurve multi-select
    const yearsByPeriod = periods.map(period => {
      const periodMonths = periodMonthlyData[period.label] || {}
      const byMonth = Object.entries(periodMonths)
        .map(([month, value]) => ({
          month,
          monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' }),
          consumption: Math.round(value),
          consommation: Math.round(value),
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
      total: Math.round(totalConsumption),
      years,
      yearsByPeriod,
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

    // Create meaningful labels for 365-day rolling periods
    const formatPeriodLabel = (startDate: Date, endDate: Date): string => {
      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()
      if (startYear === endYear) {
        return String(endYear)
      }
      return `${startYear}-${endYear}`
    }

    const periods = [
      { label: formatPeriodLabel(period1Start, period1End), startDate: period1Start, endDate: period1End, data: [] as any[] },
      { label: formatPeriodLabel(period2Start, period2End), startDate: period2Start, endDate: period2End, data: [] as any[] },
      { label: formatPeriodLabel(period3Start, period3End), startDate: period3Start, endDate: period3End, data: [] as any[] },
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

    // Group readings by day
    const dayMap: Record<string, any[]> = {}

    readings.forEach((reading: any) => {
      if (!reading.date) return

      // Parse the API datetime
      // NOTE: Backend already shifted timestamps to interval START (not END)
      let measurementDateTime: Date

      if (reading.date.includes('T')) {
        measurementDateTime = new Date(reading.date)
      } else if (reading.date.includes(' ')) {
        measurementDateTime = new Date(reading.date.replace(' ', 'T'))
      } else {
        measurementDateTime = new Date(reading.date + 'T00:00:00')
      }

      // Extract date and time from the measurement start time
      const year = measurementDateTime.getFullYear()
      const month = String(measurementDateTime.getMonth() + 1).padStart(2, '0')
      const day = String(measurementDateTime.getDate()).padStart(2, '0')
      const hours = String(measurementDateTime.getHours()).padStart(2, '0')
      const minutes = String(measurementDateTime.getMinutes()).padStart(2, '0')

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
        datetime: measurementDateTime.toISOString(),
        apiDatetime: reading.date
      })
    })

    // Convert to array and sort by date (no filter by detailDateRange - show all cached data for fluid navigation)
    const days = Object.entries(dayMap)
      .map(([date, data]) => ({
        date,
        data: data.sort((a, b) => a.time.localeCompare(b.time)),
        totalEnergyKwh: data.reduce((sum, d) => sum + d.energyKwh, 0)
      }))
      .filter(day => day.data.length >= 10) // Filter days with very few data points (keep days with at least 10 points = 5h of data)
      .sort((a, b) => b.date.localeCompare(a.date)) // Sort newest first

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

    // Remove duplicates by keeping only unique date/time combinations
    const uniqueReadingsMap = new Map<string, { date: Date; energyKwh: number; isHC: boolean }>()
    allReadings.forEach(reading => {
      const key = reading.date.toISOString()
      if (!uniqueReadingsMap.has(key)) {
        uniqueReadingsMap.set(key, reading)
      }
    })

    const uniqueReadings = Array.from(uniqueReadingsMap.values())

    const mostRecentDate = new Date(Math.max(...uniqueReadings.map(r => r.date.getTime())))

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
      const periodReadings = uniqueReadings.filter(r => r.date >= period.start && r.date <= period.end)

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

    // Remove duplicates by keeping only unique date/time combinations
    const uniqueReadingsMap = new Map<string, { date: Date; energyKwh: number; isHC: boolean }>()
    allReadings.forEach(reading => {
      const key = reading.date.toISOString()
      if (!uniqueReadingsMap.has(key)) {
        uniqueReadingsMap.set(key, reading)
      }
    })

    const uniqueReadings = Array.from(uniqueReadingsMap.values())

    const mostRecentDate = new Date(Math.max(...uniqueReadings.map(r => r.date.getTime())))

    // Define 2 rolling 365-day periods (max 730 days from API)
    // Period 1: Most recent 365 days (from yesterday back 365 days)
    // Period 2: Previous 365 days (from 365 days ago back to 730 days ago)
    const periods = []

    // Period 1: Last 365 days (e.g., Nov 11, 2024 to Nov 10, 2025)
    const period1End = new Date(mostRecentDate)
    const period1Start = new Date(mostRecentDate)
    period1Start.setDate(period1Start.getDate() - 364) // 365 days total including end date

    periods.push({
      start: period1Start,
      end: period1End,
      label: period1End.getFullYear().toString() // 2025
    })

    // Period 2: Previous 365 days (e.g., Nov 11, 2023 to Nov 10, 2024)
    const period2End = new Date(period1Start)
    period2End.setDate(period2End.getDate() - 1) // Day before period 1 starts
    const period2Start = new Date(period2End)
    period2Start.setDate(period2Start.getDate() - 364) // 365 days total

    periods.push({
      start: period2Start,
      end: period2End,
      label: period2End.getFullYear().toString() // 2024
    })

    const result = periods.map(period => {
      const periodReadings = uniqueReadings.filter(r => r.date >= period.start && r.date <= period.end)

      // Count available data days for this period
      const uniqueDays = new Set(periodReadings.map(r => r.date.toDateString())).size

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
        months,
        dataAvailable: uniqueDays, // Number of days with data
        totalDays: 365
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
