import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { parseOffpeakHours, isOffpeakTime } from '@/utils/offpeakHours'
import { tempoApi, type TempoDay } from '@/api/tempo'
import type { EnergyOffer } from '@/api/energy'
import type { YearlyCost, MonthlyCost, SelectedOfferWithProvider } from '../types/euro.types'
import type { PDL } from '@/types/api'

// Type for meter reading from API response
interface MeterReading {
  date: string
  value: string | number
}

interface MeterReadingData {
  meter_reading?: {
    interval_reading?: MeterReading[]
    reading_type?: {
      unit?: string
      interval_length?: string
    }
  }
}

interface APIResponse {
  data?: MeterReadingData
}

interface UseConsumptionEuroCalcsProps {
  selectedPDL: string | null
  selectedPDLDetails: PDL | undefined
  selectedOffer: SelectedOfferWithProvider | null
  hcHpCalculationTrigger: number
}

// Parse price that may be string (Decimal) or number
const parsePrice = (price: number | string | undefined | null): number => {
  if (price === undefined || price === null) return 0
  const numPrice = typeof price === 'string' ? parseFloat(price) : price
  return isNaN(numPrice) ? 0 : numPrice
}

// Get Tempo prices for a specific day color
const getTempoPrices = (offer: EnergyOffer, color: 'BLUE' | 'WHITE' | 'RED'): { hcPrice: number; hpPrice: number } => {
  switch (color) {
    case 'BLUE':
      return {
        hcPrice: parsePrice(offer.tempo_blue_hc),
        hpPrice: parsePrice(offer.tempo_blue_hp)
      }
    case 'WHITE':
      return {
        hcPrice: parsePrice(offer.tempo_white_hc),
        hpPrice: parsePrice(offer.tempo_white_hp)
      }
    case 'RED':
      return {
        hcPrice: parsePrice(offer.tempo_red_hc),
        hpPrice: parsePrice(offer.tempo_red_hp)
      }
  }
}

// Get the appropriate price based on offer type (for non-Tempo offers)
const getOfferPrices = (offer: EnergyOffer | null): { hcPrice: number; hpPrice: number; basePrice: number } => {
  if (!offer) return { hcPrice: 0, hpPrice: 0, basePrice: 0 }

  const offerType = offer.offer_type

  switch (offerType) {
    case 'BASE':
      return {
        hcPrice: parsePrice(offer.base_price),
        hpPrice: parsePrice(offer.base_price),
        basePrice: parsePrice(offer.base_price)
      }
    case 'HC_HP':
      return {
        hcPrice: parsePrice(offer.hc_price),
        hpPrice: parsePrice(offer.hp_price),
        basePrice: 0
      }
    case 'TEMPO':
      // Default to blue for fallback (when no tempo data available)
      return {
        hcPrice: parsePrice(offer.tempo_blue_hc),
        hpPrice: parsePrice(offer.tempo_blue_hp),
        basePrice: 0
      }
    case 'EJP':
      // Use normal price for most days
      return {
        hcPrice: parsePrice(offer.ejp_normal),
        hpPrice: parsePrice(offer.ejp_normal),
        basePrice: parsePrice(offer.ejp_normal)
      }
    case 'WEEKEND':
      // Use weekday prices as default
      return {
        hcPrice: parsePrice(offer.hc_price),
        hpPrice: parsePrice(offer.hp_price),
        basePrice: parsePrice(offer.base_price)
      }
    case 'SEASONAL':
      // Use winter prices as default (higher)
      return {
        hcPrice: parsePrice(offer.hc_price_winter) || parsePrice(offer.hc_price),
        hpPrice: parsePrice(offer.hp_price_winter) || parsePrice(offer.hp_price),
        basePrice: 0
      }
    default:
      return {
        hcPrice: parsePrice(offer.hc_price) || parsePrice(offer.base_price),
        hpPrice: parsePrice(offer.hp_price) || parsePrice(offer.base_price),
        basePrice: parsePrice(offer.base_price)
      }
  }
}

export function useConsumptionEuroCalcs({
  selectedPDL,
  selectedPDLDetails,
  selectedOffer,
  // hcHpCalculationTrigger is kept in props for API consistency but not used in deps
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hcHpCalculationTrigger
}: UseConsumptionEuroCalcsProps) {
  const queryClient = useQueryClient()

  // Determine date range for Tempo data (last 2 years)
  const tempoDateRange = useMemo(() => {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setFullYear(startDate.getFullYear() - 2)
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    }
  }, [])

  // Fetch Tempo days if offer is TEMPO type
  const { data: tempoResponse } = useQuery({
    queryKey: ['tempo-days', tempoDateRange.startDate, tempoDateRange.endDate],
    queryFn: () => tempoApi.getDays(tempoDateRange.startDate, tempoDateRange.endDate),
    enabled: selectedOffer?.offer_type === 'TEMPO',
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - tempo data doesn't change for past days
  })

  // Create a map of date -> tempo color for quick lookup
  const tempoColorMap = useMemo(() => {
    const map = new Map<string, 'BLUE' | 'WHITE' | 'RED'>()
    if (tempoResponse?.success && Array.isArray(tempoResponse.data)) {
      (tempoResponse.data as TempoDay[]).forEach(day => {
        map.set(day.date, day.color)
      })
    }
    return map
  }, [tempoResponse])

  // Calculate costs from detailed consumption data
  const yearlyCosts = useMemo((): YearlyCost[] => {
    if (!selectedPDL || !selectedOffer) {
      return []
    }

    const offpeakRanges = parseOffpeakHours(selectedPDLDetails?.offpeak_hours)
    const defaultPrices = getOfferPrices(selectedOffer)
    const subscriptionMonthly = parsePrice(selectedOffer.subscription_price)
    const isTempo = selectedOffer.offer_type === 'TEMPO'

    const queryCache = queryClient.getQueryCache()
    const allDetailQueries = queryCache.findAll({
      queryKey: ['consumptionDetail', selectedPDL],
      exact: false,
    })

    const allReadings: Array<{
      date: Date
      dateKey: string // YYYY-MM-DD for tempo lookup
      energyKwh: number
      isHC: boolean
    }> = []

    allDetailQueries.forEach((query) => {
      const response = query.state.data as APIResponse | null
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

      readings.forEach((reading: MeterReading) => {
        if (!reading.date || !reading.value) return

        const dateTimeStr = reading.date.includes('T')
          ? reading.date
          : reading.date.replace(' ', 'T')
        const apiDateTime = new Date(dateTimeStr)

        // Get date key for tempo lookup (YYYY-MM-DD)
        const dateKey = apiDateTime.toISOString().split('T')[0]

        const energyWh = parseFloat(String(reading.value)) * intervalMultiplier
        const energyKwh = energyWh / 1000

        const hour = apiDateTime.getHours()
        const minute = apiDateTime.getMinutes()
        const isHC = isOffpeakTime(hour, minute, offpeakRanges)

        allReadings.push({
          date: apiDateTime,
          dateKey,
          energyKwh,
          isHC
        })
      })
    })

    if (allReadings.length === 0) return []

    // Remove duplicates
    const uniqueReadingsMap = new Map<string, { date: Date; dateKey: string; energyKwh: number; isHC: boolean }>()
    allReadings.forEach(reading => {
      const key = reading.date.toISOString()
      if (!uniqueReadingsMap.has(key)) {
        uniqueReadingsMap.set(key, reading)
      }
    })

    const uniqueReadings = Array.from(uniqueReadingsMap.values())
    const mostRecentDate = new Date(Math.max(...uniqueReadings.map(r => r.date.getTime())))

    // Define 2 rolling 365-day periods
    const periods = []

    // Period 1: Last 365 days
    const period1End = new Date(mostRecentDate)
    const period1Start = new Date(mostRecentDate)
    period1Start.setDate(period1Start.getDate() - 364)

    periods.push({
      start: period1Start,
      end: period1End,
      label: period1End.getFullYear().toString()
    })

    // Period 2: Previous 365 days
    const period2End = new Date(period1Start)
    period2End.setDate(period2End.getDate() - 1)
    const period2Start = new Date(period2End)
    period2Start.setDate(period2Start.getDate() - 364)

    periods.push({
      start: period2Start,
      end: period2End,
      label: period2End.getFullYear().toString()
    })

    const result = periods.map(period => {
      const periodReadings = uniqueReadings.filter(r => r.date >= period.start && r.date <= period.end)

      // Group by month
      const monthlyData: Record<string, {
        hcKwh: number
        hpKwh: number
        hcCost: number
        hpCost: number
        daysWithData: Set<string>
        // For tempo statistics
        blueKwh: number
        whiteKwh: number
        redKwh: number
        unknownKwh: number
      }> = {}

      periodReadings.forEach(reading => {
        const monthKey = `${reading.date.getFullYear()}-${String(reading.date.getMonth() + 1).padStart(2, '0')}`
        const dayKey = reading.date.toDateString()

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            hcKwh: 0,
            hpKwh: 0,
            hcCost: 0,
            hpCost: 0,
            daysWithData: new Set(),
            blueKwh: 0,
            whiteKwh: 0,
            redKwh: 0,
            unknownKwh: 0
          }
        }

        // Get the price for this reading
        let hcPrice = defaultPrices.hcPrice
        let hpPrice = defaultPrices.hpPrice

        if (isTempo) {
          const tempoColor = tempoColorMap.get(reading.dateKey)
          if (tempoColor) {
            const tempoPrices = getTempoPrices(selectedOffer, tempoColor)
            hcPrice = tempoPrices.hcPrice
            hpPrice = tempoPrices.hpPrice

            // Track kWh by tempo color
            if (tempoColor === 'BLUE') {
              monthlyData[monthKey].blueKwh += reading.energyKwh
            } else if (tempoColor === 'WHITE') {
              monthlyData[monthKey].whiteKwh += reading.energyKwh
            } else if (tempoColor === 'RED') {
              monthlyData[monthKey].redKwh += reading.energyKwh
            }
          } else {
            // No tempo data for this day, use blue as default
            monthlyData[monthKey].unknownKwh += reading.energyKwh
          }
        }

        if (reading.isHC) {
          monthlyData[monthKey].hcKwh += reading.energyKwh
          monthlyData[monthKey].hcCost += reading.energyKwh * hcPrice
        } else {
          monthlyData[monthKey].hpKwh += reading.energyKwh
          monthlyData[monthKey].hpCost += reading.energyKwh * hpPrice
        }
        monthlyData[monthKey].daysWithData.add(dayKey)
      })

      // Calculate costs for each month (including partial months)
      const months: MonthlyCost[] = Object.keys(monthlyData).sort().map(monthKey => {
        const data = monthlyData[monthKey]
        const totalKwh = data.hcKwh + data.hpKwh

        // For tempo, costs are already calculated per-reading
        // For other types, calculate here
        const hcCost = isTempo ? data.hcCost : data.hcKwh * defaultPrices.hcPrice
        const hpCost = isTempo ? data.hpCost : data.hpKwh * defaultPrices.hpPrice
        const consumptionCost = hcCost + hpCost

        // Subscription cost for the month (prorated for partial months)
        const daysInMonth = new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]), 0).getDate()
        const subscriptionCost = (data.daysWithData.size / daysInMonth) * subscriptionMonthly

        return {
          month: monthKey,
          monthLabel: new Date(monthKey + '-01').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
          totalKwh,
          hcKwh: data.hcKwh,
          hpKwh: data.hpKwh,
          consumptionCost,
          subscriptionCost,
          totalCost: consumptionCost + subscriptionCost,
          hcCost,
          hpCost,
          daysWithData: data.daysWithData.size
        }
      })

      // Calculate totals
      const totalKwh = months.reduce((sum, m) => sum + m.totalKwh, 0)
      const hcKwh = months.reduce((sum, m) => sum + m.hcKwh, 0)
      const hpKwh = months.reduce((sum, m) => sum + m.hpKwh, 0)
      const consumptionCost = months.reduce((sum, m) => sum + m.consumptionCost, 0)
      const subscriptionCost = months.reduce((sum, m) => sum + m.subscriptionCost, 0)
      const hcCost = months.reduce((sum, m) => sum + m.hcCost, 0)
      const hpCost = months.reduce((sum, m) => sum + m.hpCost, 0)
      const totalCost = consumptionCost + subscriptionCost

      return {
        year: period.label,
        periodLabel: `${period.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} - ${period.end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        months,
        totalKwh,
        hcKwh,
        hpKwh,
        totalCost,
        consumptionCost,
        subscriptionCost,
        hcCost,
        hpCost,
        avgMonthlyCost: months.length > 0 ? totalCost / months.length : 0,
        avgMonthlyKwh: months.length > 0 ? totalKwh / months.length : 0
      }
    }).filter(p => p.months.length >= 1) // Include periods with at least 1 month of data

    return result
  }, [selectedPDL, selectedPDLDetails?.offpeak_hours, selectedOffer, queryClient, tempoColorMap])

  return {
    yearlyCosts
  }
}
