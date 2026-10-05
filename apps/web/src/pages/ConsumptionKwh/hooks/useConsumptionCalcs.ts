import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseOffpeakHours, isOffpeakTime } from '@/utils/offpeakHours'
import { useDatePreferencesStore } from '@/stores/datePreferencesStore'
import { getIntervalLength, getReadings, getUnit, hasReadings } from '@/utils/enedisMeasure'
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
  const { preset, customDate } = useDatePreferencesStore()

  // Process consumption data for charts
  const chartData = useMemo(() => {
    if (!hasReadings(consumptionData)) {
      return { byYear: [], byMonth: [], byMonthComparison: [], total: 0, years: [], unit: 'W' }
    }

    const readings = getReadings(consumptionData)
    const unit = getUnit(consumptionData) || 'W'
    const intervalLength = getIntervalLength(consumptionData) || 'P1D'

    // Parse interval length to determine how to handle the values
    const parseIntervalToDurationInHours = (interval: string): number => {
      const match = interval.match(/^PT?(\d+)([DHM])$/)
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

    // Create years array for AnnualCurve multi-select (années calendaires)
    const calendarYears = [...new Set(
      readings.map((r: any) => {
        const dateStr = r.date?.split('T')[0] || r.date
        return dateStr?.substring(0, 4)
      }).filter(Boolean)
    )].sort().reverse() as string[]

    const yearsByPeriod = calendarYears.slice(0, 4).map(year => {
      const yearStart = new Date(`${year}-01-01`)
      const yearEnd = new Date(`${year}-12-31`)

      // Agréger les données mensuelles pour cette année calendaire
      const monthlyMap: Record<string, number> = {}

      readings.forEach((reading: any) => {
        const rawValue = parseFloat(reading.value || 0)
        const dateStr = reading.date?.split('T')[0] || reading.date
        if (!dateStr || !dateStr.startsWith(year) || isNaN(rawValue)) return

        const value = rawValue * intervalMultiplier
        const month = dateStr.substring(0, 7)
        monthlyMap[month] = (monthlyMap[month] || 0) + value
      })

      const byMonth = Object.entries(monthlyMap)
        .map(([month, value]) => ({
          month,
          monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
          consumption: Math.round(value),
          consommation: Math.round(value),
        }))
        .filter(m => m.consumption > 0)
        .sort((a, b) => a.month.localeCompare(b.month))

      return {
        label: year,
        startDate: yearStart,
        endDate: yearEnd,
        byMonth
      }
    }).filter((y, idx) => {
      // Toujours garder l'année la plus récente (en cours)
      if (idx === 0) return y.byMonth.length > 0
      // Les autres années doivent avoir au moins 2 mois de données
      return y.byMonth.length >= 2
    })

    // Retirer le premier mois de l'année la plus ancienne (donnée souvent incomplète)
    if (yearsByPeriod.length > 1) {
      const oldest = yearsByPeriod[yearsByPeriod.length - 1]
      if (oldest.byMonth.length > 1) {
        oldest.byMonth = oldest.byMonth.slice(1)
      }
    }

    // --- Calcul basé sur les préférences utilisateur (preset) ---
    // Chaque bloc = une période + la même plage sur l'année précédente (comparaison)
    // Ex. calendaire 1er jan : Bloc 1 = [1 jan 2026 → ajd] vs [1 jan 2025 → même jour 2025]
    const getPresetReference = (): { day: number; month: number } | null => {
      switch (preset) {
        case 'rolling':
          return null
        case 'calendar':
          return { day: 1, month: 1 }
        case 'tempo':
          return { day: 1, month: 9 }
        case 'custom':
          return customDate ? { day: customDate.day, month: customDate.month } : null
        default:
          return null
      }
    }

    const presetRef = getPresetReference()

    // Chaque comparaison contient : période courante + même plage N-1
    interface PresetComparison {
      label: string
      current: { startDate: Date; endDate: Date }
      previous: { startDate: Date; endDate: Date }
    }

    const buildPresetComparisons = (): PresetComparison[] => {
      if (!presetRef) return []

      const refDay = presetRef.day
      const refMonth = presetRef.month // 1-indexed

      // Trouver le début de la période courante
      const refThisYear = new Date(mostRecentDate.getFullYear(), refMonth - 1, refDay, 12, 0, 0, 0)
      let currentPeriodStart: Date
      if (refThisYear <= mostRecentDate) {
        currentPeriodStart = refThisYear
      } else {
        currentPeriodStart = new Date(mostRecentDate.getFullYear() - 1, refMonth - 1, refDay, 12, 0, 0, 0)
      }

      const result: PresetComparison[] = []
      for (let i = 0; i < 3; i++) {
        const pStart = new Date(currentPeriodStart.getFullYear() - i, refMonth - 1, refDay, 12, 0, 0, 0)
        const pEnd = new Date(pStart.getFullYear() + 1, refMonth - 1, refDay - 1, 12, 0, 0, 0)
        const effectiveEnd = pEnd > mostRecentDate ? mostRecentDate : pEnd

        // Période précédente = même plage, 1 an avant
        const prevStart = new Date(pStart.getFullYear() - 1, pStart.getMonth(), pStart.getDate(), 12, 0, 0, 0)
        const prevEnd = new Date(effectiveEnd.getFullYear() - 1, effectiveEnd.getMonth(), effectiveEnd.getDate(), 12, 0, 0, 0)

        const label = preset === 'calendar'
          ? String(pStart.getFullYear())
          : `${pStart.getFullYear()}-${pStart.getFullYear() + 1}`

        result.push({
          label,
          current: { startDate: pStart, endDate: effectiveEnd },
          previous: { startDate: prevStart, endDate: prevEnd }
        })
      }

      return result
    }

    const presetComparisons = buildPresetComparisons()

    // Fonction utilitaire : agréger les readings sur une plage de dates
    const aggregateReadings = (start: Date, end: Date): number => {
      let total = 0
      readings.forEach((reading: any) => {
        const rawValue = parseFloat(reading.value || 0)
        const dateStr = reading.date?.split('T')[0] || reading.date
        if (!dateStr || isNaN(rawValue)) return
        const readingDate = new Date(dateStr + 'T12:00:00')
        if (readingDate >= start && readingDate <= end) {
          total += rawValue * intervalMultiplier
        }
      })
      return total
    }

    // Fonction utilitaire : agréger par mois sur une plage
    const aggregateMonthly = (start: Date, end: Date) => {
      const monthlyMap: Record<string, number> = {}
      readings.forEach((reading: any) => {
        const rawValue = parseFloat(reading.value || 0)
        const dateStr = reading.date?.split('T')[0] || reading.date
        if (!dateStr || isNaN(rawValue)) return
        const readingDate = new Date(dateStr + 'T12:00:00')
        if (readingDate >= start && readingDate <= end) {
          const value = rawValue * intervalMultiplier
          const month = dateStr.substring(0, 7)
          monthlyMap[month] = (monthlyMap[month] || 0) + value
        }
      })
      return Object.entries(monthlyMap)
        .map(([month, value]) => ({
          month,
          monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
          consumption: Math.round(value),
          consommation: Math.round(value),
        }))
        .filter(m => m.consumption > 0)
        .sort((a, b) => a.month.localeCompare(b.month))
    }

    // byYearPreset : tableau de blocs, chaque bloc = { current, previous }
    // Le composant YearlyStatCards reçoit byYear qui est un tableau plat.
    // On garde la structure plate mais on ajoute les infos de comparaison.
    const byYearPresetRaw = presetComparisons.map(comp => {
      const currentTotal = aggregateReadings(comp.current.startDate, comp.current.endDate)
      const previousTotal = aggregateReadings(comp.previous.startDate, comp.previous.endDate)

      return {
        year: comp.label,
        consumption: Math.round(currentTotal),
        consommation: Math.round(currentTotal),
        startDate: comp.current.startDate,
        endDate: comp.current.endDate,
        previousConsommation: Math.round(previousTotal),
        previousStartDate: comp.previous.startDate,
        previousEndDate: comp.previous.endDate,
      }
    }).filter(p => p.consommation > 0)

    // Pas de comparaison N-1 sur le dernier bloc (données précédentes forcément incomplètes/absentes)
    const byYearPreset = byYearPresetRaw.map((entry, idx) => {
      if (idx === byYearPresetRaw.length - 1) {
        return { ...entry, previousConsommation: 0 }
      }
      return entry
    })

    // yearsByPreset : pour chaque comparaison, on génère 2 entrées (courante + précédente)
    // pour que AnnualCurve les superpose sur le même graphique
    const yearsByPreset = presetComparisons.flatMap(comp => {
      const currentMonths = aggregateMonthly(comp.current.startDate, comp.current.endDate)
      const prevLabel = preset === 'calendar'
        ? String(comp.current.startDate.getFullYear() - 1)
        : `${comp.current.startDate.getFullYear() - 1}-${comp.current.startDate.getFullYear()}`
      const previousMonths = aggregateMonthly(comp.previous.startDate, comp.previous.endDate)


      const entries = []

      if (currentMonths.length >= 2) {
        entries.push({
          label: comp.label,
          startDate: comp.current.startDate,
          endDate: comp.current.endDate,
          byMonth: currentMonths
        })
      }

      if (previousMonths.length >= 2) {
        entries.push({
          label: prevLabel,
          startDate: comp.previous.startDate,
          endDate: comp.previous.endDate,
          byMonth: previousMonths
        })
      }

      return entries
    })

    // Dédupliquer les entrées de yearsByPreset (une période peut être "previous" d'un bloc et "current" d'un autre)
    // On garde l'entrée avec le PLUS de mois pour chaque label (la version "current" est plus complète que la version "previous"),
    // et à nombre de mois égal celle qui finit le plus tard (sinon le dernier mois de la version tronquée l'emporte)
    const bestByLabel = new Map<string, typeof yearsByPreset[0]>()
    for (const entry of yearsByPreset) {
      const existing = bestByLabel.get(entry.label)
      if (
        !existing ||
        entry.byMonth.length > existing.byMonth.length ||
        (entry.byMonth.length === existing.byMonth.length && entry.endDate > existing.endDate)
      ) {
        bestByLabel.set(entry.label, entry)
      }
    }
    const yearsByPresetDeduped = [...bestByLabel.values()]

    return {
      byYear,
      byMonth,
      byMonthComparison,
      total: Math.round(totalConsumption),
      years,
      yearsByPeriod,
      byYearPreset,
      yearsByPreset: yearsByPresetDeduped,
      unit,
    }
  }, [consumptionData, preset, customDate])

  // Process max power data by year
  const powerByYearData = useMemo(() => {
    if (!hasReadings(maxPowerData)) {
      return []
    }

    const readings = getReadings(maxPowerData)

    // Extraire les années calendaires uniques (triées du plus récent au plus ancien)
    const calendarYears = [...new Set(
      readings.map((r: any) => {
        const dateStr = r.date?.split('T')[0] || r.date
        return dateStr?.substring(0, 4)
      }).filter(Boolean)
    )].sort().reverse() as string[]

    // Grouper les lectures par année calendaire
    const yearDataMap: Record<string, any[]> = {}

    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (!dateStr) return

      const year = dateStr.substring(0, 4)
      const power = parseFloat(reading.value || 0) / 1000 // Convert W to kW

      // Extract time from date field
      let time = ''
      if (reading.date?.includes('T')) {
        time = reading.date.split('T')[1]?.substring(0, 5) || ''
      } else if (reading.date?.includes(' ')) {
        time = reading.date.split(' ')[1]?.substring(0, 5) || ''
      }

      if (!yearDataMap[year]) yearDataMap[year] = []
      yearDataMap[year].push({
        date: dateStr,
        power,
        time,
        year
      })
    })

    // Construire les périodes par année calendaire
    return calendarYears.slice(0, 4).map(year => ({
      label: year,
      startDate: new Date(`${year}-01-01`),
      endDate: new Date(`${year}-12-31`),
      data: (yearDataMap[year] || []).sort((a: any, b: any) => a.date.localeCompare(b.date))
    })).filter((y, idx) => {
      if (idx === 0) return y.data.length > 0
      return y.data.length >= 10
    })
  }, [maxPowerData])

  // Set default year when power data loads (index 0 = plus récent)
  useEffect(() => {
    if (powerByYearData.length > 0) {
      setSelectedPowerYear(0)
    }
  }, [powerByYearData.length])

  // Process detailed consumption data by day (load curve)
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

      if (!hasReadings(data)) return

      const readings = getReadings(data)
      const unit = getUnit(data) || 'W'
      const intervalLength = getIntervalLength(data) || 'P30M'


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

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || Number.isNaN(reading.value)) return

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

    const mostRecentDate = uniqueReadings.reduce((max, r) => r.date > max ? r.date : max, uniqueReadings[0].date)

    // Define 3 rolling 365-day periods (aligned with byYear calculation)
    const periods = []
    for (let i = 0; i < 3; i++) {
      const periodEnd = new Date(mostRecentDate.getTime() - i * 365 * 24 * 60 * 60 * 1000)
      const periodStart = new Date(periodEnd.getTime() - 365 * 24 * 60 * 60 * 1000)

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
        startDate: period.start,
        endDate: period.end,
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

      if (!hasReadings(data)) return

      const readings = getReadings(data)
      const unit = getUnit(data) || 'W'
      const intervalLength = getIntervalLength(data) || 'P30M'


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

      const intervalMultiplier = unit === 'W' ? parseIntervalToDurationInHours(intervalLength) : 1

      readings.forEach((reading: any) => {
        if (!reading.date || Number.isNaN(reading.value)) return

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

    const mostRecentDate = uniqueReadings.reduce((max, r) => r.date > max ? r.date : max, uniqueReadings[0].date)

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
        startDate: period.start,
        endDate: period.end,
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
