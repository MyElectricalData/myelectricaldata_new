// Utility functions for off-peak hours calculations

export interface OffpeakRange {
  startHour: number
  startMin: number
  endHour: number
  endMin: number
}

/**
 * Parse offpeak hours configuration from PDL
 * Supports both array format ["22:00-06:00"] and legacy object format {"HC": "22h00-06h00"}
 */
export function parseOffpeakHours(offpeakConfig?: string[] | Record<string, string>): OffpeakRange[] {
  if (!offpeakConfig) return []

  const ranges: OffpeakRange[] = []
  const rangeStrings: string[] = Array.isArray(offpeakConfig)
    ? offpeakConfig
    : Object.values(offpeakConfig).filter(Boolean)

  for (const range of rangeStrings) {
    // Extract time ranges from various formats: "22h30-06h30", "22:00-06:00", "HC (22H00-6H00)", etc.
    // Match: optional text, then first time (HH:MM or HHhMM), separator, then second time
    const match = range.match(/(\d{1,2})[hH:](\d{0,2})\s*-\s*(\d{1,2})[hH:]?(\d{0,2})/)
    if (match) {
      const startHour = parseInt(match[1])
      const startMin = match[2] ? parseInt(match[2]) : 0
      const endHour = parseInt(match[3])
      const endMin = match[4] ? parseInt(match[4]) : 0

      ranges.push({ startHour, startMin, endHour, endMin })
    }
  }

  return ranges
}

/**
 * Check if a given time (hour:minute) falls within off-peak hours
 */
export function isOffpeakTime(hour: number, minute: number, ranges: OffpeakRange[]): boolean {
  if (ranges.length === 0) {
    // Default: 22h-6h if no config
    return hour >= 22 || hour < 6
  }

  const timeInMinutes = hour * 60 + minute

  for (const range of ranges) {
    const startInMinutes = range.startHour * 60 + range.startMin
    const endInMinutes = range.endHour * 60 + range.endMin

    // Handle ranges that cross midnight (e.g., 22:30-06:30)
    if (startInMinutes > endInMinutes) {
      // Range crosses midnight
      if (timeInMinutes >= startInMinutes || timeInMinutes < endInMinutes) {
        return true
      }
    } else {
      // Normal range within same day
      if (timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if a given hour is in off-peak (simplified version for hour-only checks)
 */
export function isOffpeakHour(hour: number, offpeakConfig?: string[] | Record<string, string>): boolean {
  const ranges = parseOffpeakHours(offpeakConfig)
  return isOffpeakTime(hour, 0, ranges)
}
