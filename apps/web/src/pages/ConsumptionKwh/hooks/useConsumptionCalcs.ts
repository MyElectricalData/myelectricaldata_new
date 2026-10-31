import { useMemo, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseOffpeakHours, offpeakFraction } from '@/utils/offpeakHours'
import { useDatePreferencesStore } from '@/stores/datePreferencesStore'
import { getIntervalLength, getReadings, getUnit, hasReadings, readingEnergyWh, readingHours } from '@/utils/enedisMeasure'
import type { MeasureReading } from '@/types/api'
import { rollingYearPeriods } from '@/utils/historyRange'
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
    // Mesure quotidienne : énergie en Wh, jamais multipliée par le pas (MED-24)
    const unit = getUnit(consumptionData) || 'Wh'
    const intervalLength = getIntervalLength(consumptionData) || 'P1D'

    // Énergie (Wh) d'un relevé, au pas qui lui est propre (MED-24)
    const toWh = (reading: MeasureReading) => readingEnergyWh(reading, unit, intervalLength)

    const monthlyData: Record<string, number> = {}
    const monthYearData: Record<string, Record<string, number>> = {}
    let totalConsumption = 0

    // Most recent and oldest dates in the actual data
    let mostRecentDate = new Date(0)
    let oldestDate = new Date(8.64e15)
    readings.forEach((reading: any) => {
      const dateStr = reading.date?.split('T')[0] || reading.date
      if (dateStr) {
        const readingDate = new Date(dateStr)
        if (readingDate > mostRecentDate) mostRecentDate = readingDate
        if (readingDate < oldestDate) oldestDate = readingDate
      }
    })

    // Rolling one-year periods (sliding windows), as many as the history holds (MED-64)
    const periods = rollingYearPeriods(mostRecentDate, oldestDate).map(({ start, end }) => ({
      label: String(end.getFullYear()),
      startDate: start,
      endDate: end
    }))

    // Aggregate by 365-day periods
    const periodData: Record<string, { value: number, startDate: Date, endDate: Date }> = {}
    const periodMonthlyData: Record<string, Record<string, number>> = {}

    readings.forEach((reading: any) => {
      const rawValue = parseFloat(reading.value || 0)
      const dateStr = reading.date?.split('T')[0] || reading.date

      if (!dateStr || isNaN(rawValue)) return

      const value = toWh(reading)
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

    const yearsByPeriod = calendarYears.map(year => {
      const yearStart = new Date(`${year}-01-01`)
      const yearEnd = new Date(`${year}-12-31`)

      // Agréger les données mensuelles pour cette année calendaire
      const monthlyMap: Record<string, number> = {}

      readings.forEach((reading: any) => {
        const rawValue = parseFloat(reading.value || 0)
        const dateStr = reading.date?.split('T')[0] || reading.date
        if (!dateStr || !dateStr.startsWith(year) || isNaN(rawValue)) return

        const value = toWh(reading)
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
      // Un bloc par période jusqu'à la donnée la plus ancienne, sans plafond (MED-64)
      for (let i = 0; i === 0 || new Date(currentPeriodStart.getFullYear() - i + 1, refMonth - 1, refDay - 1, 12, 0, 0, 0) >= oldestDate; i++) {
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
          total += toWh(reading)
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
          const value = toWh(reading)
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
    return calendarYears.map(year => ({
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
    const intervalLength = getIntervalLength(detailData) || 'PT30M'

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
      const energyWh = readingEnergyWh(reading, unit, intervalLength)
      const energyKwh = energyWh / 1000
      const averagePowerW = energyWh / readingHours(reading, intervalLength)
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

    const allReadings: Array<{ date: Date; energyKwh: number; hcShare: number }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as any
      const data = response?.data

      if (!hasReadings(data)) return

      const readings = getReadings(data)
      const unit = getUnit(data) || 'W'
      const intervalLength = getIntervalLength(data) || 'PT30M'

      readings.forEach((reading: any) => {
        if (!reading.date || Number.isNaN(reading.value)) return

        const dateTimeStr = reading.date.includes('T')
          ? reading.date
          : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)

        const energyWh = readingEnergyWh(reading, unit, intervalLength)
        const energyKwh = energyWh / 1000

        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        // Part HC au prorata des minutes du créneau (plage HC qui commence ou finit dans le créneau)
        const hcShare = offpeakFraction(hour, minute, readingHours(reading, intervalLength) * 60, offpeakRanges)

        allReadings.push({
          date: apiDateTime,
          energyKwh,
          hcShare
        })
      })
    })

    if (allReadings.length === 0) return []

    // Remove duplicates by keeping only unique date/time combinations
    const uniqueReadingsMap = new Map<string, { date: Date; energyKwh: number; hcShare: number }>()
    allReadings.forEach(reading => {
      const key = reading.date.toISOString()
      if (!uniqueReadingsMap.has(key)) {
        uniqueReadingsMap.set(key, reading)
      }
    })

    const uniqueReadings = Array.from(uniqueReadingsMap.values())

    const mostRecentDate = uniqueReadings.reduce((max, r) => r.date > max ? r.date : max, uniqueReadings[0].date)
    const oldestDate = uniqueReadings.reduce((min, r) => r.date < min ? r.date : min, uniqueReadings[0].date)

    // Rolling one-year periods over the whole cached curve (aligned with byYear calculation, MED-64)
    const periods = rollingYearPeriods(mostRecentDate, oldestDate).map(({ start, end }) => ({
      start,
      end,
      label: `${start.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })}`
    }))

    const result = periods.map(period => {
      const periodReadings = uniqueReadings.filter(r => r.date >= period.start && r.date <= period.end)

      const hcKwh = periodReadings.reduce((sum, r) => sum + r.energyKwh * r.hcShare, 0)
      const hpKwh = periodReadings.reduce((sum, r) => sum + r.energyKwh * (1 - r.hcShare), 0)
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


    const allReadings: Array<{ date: Date; energyKwh: number; hcShare: number }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as any
      const data = response?.data

      if (!hasReadings(data)) return

      const readings = getReadings(data)
      const unit = getUnit(data) || 'W'
      const intervalLength = getIntervalLength(data) || 'PT30M'

      readings.forEach((reading: any) => {
        if (!reading.date || Number.isNaN(reading.value)) return

        const dateTimeStr = reading.date.includes('T') ? reading.date : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)
        const energyWh = readingEnergyWh(reading, unit, intervalLength)
        const energyKwh = energyWh / 1000
        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        // Part HC au prorata des minutes du créneau (plage HC qui commence ou finit dans le créneau)
        const hcShare = offpeakFraction(hour, minute, readingHours(reading, intervalLength) * 60, offpeakRanges)

        allReadings.push({ date: apiDateTime, energyKwh, hcShare })
      })
    })

    if (allReadings.length === 0) return []

    // Remove duplicates by keeping only unique date/time combinations
    const uniqueReadingsMap = new Map<string, { date: Date; energyKwh: number; hcShare: number }>()
    allReadings.forEach(reading => {
      const key = reading.date.toISOString()
      if (!uniqueReadingsMap.has(key)) {
        uniqueReadingsMap.set(key, reading)
      }
    })

    const uniqueReadings = Array.from(uniqueReadingsMap.values())

    const mostRecentDate = uniqueReadings.reduce((max, r) => r.date > max ? r.date : max, uniqueReadings[0].date)
    const oldestDate = uniqueReadings.reduce((min, r) => r.date < min ? r.date : min, uniqueReadings[0].date)

    // Rolling one-year periods over the whole cached curve, labelled by end year (MED-64)
    const periods = rollingYearPeriods(mostRecentDate, oldestDate).map(({ start, end }) => ({
      start,
      end,
      label: end.getFullYear().toString()
    }))

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

        monthlyData[monthKey].hcKwh += reading.energyKwh * reading.hcShare
        monthlyData[monthKey].hpKwh += reading.energyKwh * (1 - reading.hcShare)
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
