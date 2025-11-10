/**
 * Demo data for testing when Enedis API is unavailable
 */

export const generateDemoConsumptionData = (days: number = 30) => {
  const data = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    // Generate realistic consumption pattern
    const baseConsumption = 10 + Math.random() * 5 // Base 10-15 kWh
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Higher consumption on weekends
    const weekendFactor = isWeekend ? 1.3 : 1

    // Seasonal variation (higher in winter)
    const month = date.getMonth()
    const winterFactor = (month >= 10 || month <= 2) ? 1.5 : 1

    const value = Math.round(baseConsumption * weekendFactor * winterFactor * 100) / 100

    data.push({
      date: date.toISOString().split('T')[0],
      value: value
    })
  }

  return {
    interval_reading: data,
    quality: "COMPLETE",
    reading_type: {
      unit: "KWH",
      measurement_kind: "energy",
      aggregate: "sum"
    }
  }
}

export const generateDemoPowerData = (days: number = 30) => {
  const data = []
  const today = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    // Generate realistic power pattern
    const basePower = 3 + Math.random() * 2 // Base 3-5 kW
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Higher power on weekends
    const weekendFactor = isWeekend ? 1.2 : 1

    const value = Math.round(basePower * weekendFactor * 1000) // Convert to W

    data.push({
      date: date.toISOString().split('T')[0],
      value: value
    })
  }

  return {
    interval_reading: data,
    quality: "COMPLETE",
    reading_type: {
      unit: "W",
      measurement_kind: "power",
      aggregate: "maximum"
    }
  }
}

export const DEMO_MODE_MESSAGE = "Mode démonstration : Les données affichées sont fictives pour illustrer le fonctionnement de l'application."