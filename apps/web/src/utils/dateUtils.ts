/**
 * Date utilities for Enedis API integration
 * All dates are in UTC to match Enedis API RFC 3339 format
 */

/**
 * Format a Date object to YYYY-MM-DD in UTC
 */
export const formatDateUTC = (date: Date): string => {
  return date.getUTCFullYear() + '-' +
         String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
         String(date.getUTCDate()).padStart(2, '0')
}

/**
 * Get yesterday's date at midnight UTC
 */
export const getYesterdayUTC = (): Date => {
  const today = new Date()
  return new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() - 1,
    0, 0, 0, 0
  ))
}

/**
 * Create a UTC date at midnight
 */
export const createUTCDate = (year: number, month: number, day: number): Date => {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
}

/**
 * Subtract days from a date (returns new Date in UTC)
 */
export const subtractDays = (date: Date, days: number): Date => {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - days,
    0, 0, 0, 0
  ))
}

/**
 * Add days to a date (returns new Date in UTC)
 */
export const addDays = (date: Date, days: number): Date => {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days,
    0, 0, 0, 0
  ))
}

/**
 * Parse a date string (YYYY-MM-DD) to UTC Date at midnight
 */
export const parseDateUTC = (dateStr: string): Date => {
  return new Date(dateStr + 'T00:00:00Z')
}

/**
 * Calculate date range for consumption data (3 years back from yesterday)
 */
export const getConsumptionDateRange = (daysBack: number = 1095): { start: string, end: string } => {
  const yesterday = getYesterdayUTC()
  const startDate = subtractDays(yesterday, daysBack)

  return {
    start: formatDateUTC(startDate),
    end: formatDateUTC(yesterday)
  }
}

/**
 * Calculate date range for detailed data (max 7 days)
 * @param weekOffset 0 = most recent week, 1 = previous week, etc.
 */
export const getDetailDateRange = (weekOffset: number = 0): { start: string, end: string } => {
  const yesterday = getYesterdayUTC()
  const offsetDays = weekOffset * 7

  // End date: yesterday - offset
  let endDate = subtractDays(yesterday, offsetDays)

  // Cap to yesterday if in the future
  if (endDate > yesterday) {
    endDate = new Date(yesterday)
  }

  // Start: 6 days before end (7 days total)
  const startDate = subtractDays(endDate, 6)

  return {
    start: formatDateUTC(startDate),
    end: formatDateUTC(endDate)
  }
}

/**
 * Generate all dates between start and end (inclusive)
 */
export const getDateRange = (startDate: string, endDate: string): string[] => {
  const dates: string[] = []
  const current = parseDateUTC(startDate)
  const end = parseDateUTC(endDate)

  while (current <= end) {
    dates.push(formatDateUTC(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}

/**
 * Check if a date is within a range
 */
export const isDateInRange = (date: Date, start: Date, end: Date): boolean => {
  return date >= start && date <= end
}

/**
 * Format a date for French locale display
 */
export const formatDateFR = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? parseDateUTC(date) : date
  return dateObj.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Calculate the number of weeks between two dates
 */
export const getWeeksBetween = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.ceil(diffDays / 7)
}
