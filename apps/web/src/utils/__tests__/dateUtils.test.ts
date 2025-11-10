import { describe, it, expect } from 'vitest'
import {
  formatDateUTC,
  getYesterdayUTC,
  createUTCDate,
  subtractDays,
  addDays,
  parseDateUTC,
  getConsumptionDateRange,
  getDetailDateRange,
  getDateRange,
  isDateInRange,
  formatDateFR,
  getWeeksBetween
} from '../dateUtils'

describe('dateUtils', () => {
  describe('formatDateUTC', () => {
    it('should format date to YYYY-MM-DD in UTC', () => {
      const date = new Date('2024-03-15T10:30:00Z')
      expect(formatDateUTC(date)).toBe('2024-03-15')
    })

    it('should handle dates with timezone offsets correctly', () => {
      const date = new Date('2024-12-31T23:00:00-01:00') // Will be 2025-01-01 in UTC
      expect(formatDateUTC(date)).toBe('2025-01-01')
    })

    it('should pad single digit months and days', () => {
      const date = new Date('2024-01-05T00:00:00Z')
      expect(formatDateUTC(date)).toBe('2024-01-05')
    })
  })

  describe('getYesterdayUTC', () => {
    it('should return yesterday at midnight UTC', () => {
      const yesterday = getYesterdayUTC()
      const today = new Date()

      // Check it's exactly 1 day before today
      const diffInMs = today.getTime() - yesterday.getTime()
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      expect(diffInDays).toBe(1)
      expect(yesterday.getUTCHours()).toBe(0)
      expect(yesterday.getUTCMinutes()).toBe(0)
      expect(yesterday.getUTCSeconds()).toBe(0)
      expect(yesterday.getUTCMilliseconds()).toBe(0)
    })
  })

  describe('createUTCDate', () => {
    it('should create a UTC date at midnight', () => {
      const date = createUTCDate(2024, 2, 15) // March 15, 2024 (month is 0-indexed)

      expect(date.getUTCFullYear()).toBe(2024)
      expect(date.getUTCMonth()).toBe(2) // March (0-indexed)
      expect(date.getUTCDate()).toBe(15)
      expect(date.getUTCHours()).toBe(0)
      expect(date.getUTCMinutes()).toBe(0)
      expect(date.getUTCSeconds()).toBe(0)
    })
  })

  describe('subtractDays', () => {
    it('should subtract days correctly', () => {
      const date = new Date('2024-03-15T12:00:00Z')
      const result = subtractDays(date, 5)

      expect(formatDateUTC(result)).toBe('2024-03-10')
    })

    it('should handle month boundaries', () => {
      const date = new Date('2024-03-01T00:00:00Z')
      const result = subtractDays(date, 1)

      expect(formatDateUTC(result)).toBe('2024-02-29') // 2024 is a leap year
    })

    it('should handle year boundaries', () => {
      const date = new Date('2024-01-01T00:00:00Z')
      const result = subtractDays(date, 1)

      expect(formatDateUTC(result)).toBe('2023-12-31')
    })
  })

  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date('2024-03-15T12:00:00Z')
      const result = addDays(date, 5)

      expect(formatDateUTC(result)).toBe('2024-03-20')
    })

    it('should handle month boundaries', () => {
      const date = new Date('2024-02-29T00:00:00Z') // Leap year
      const result = addDays(date, 1)

      expect(formatDateUTC(result)).toBe('2024-03-01')
    })

    it('should handle year boundaries', () => {
      const date = new Date('2023-12-31T00:00:00Z')
      const result = addDays(date, 1)

      expect(formatDateUTC(result)).toBe('2024-01-01')
    })
  })

  describe('parseDateUTC', () => {
    it('should parse YYYY-MM-DD string to UTC date at midnight', () => {
      const date = parseDateUTC('2024-03-15')

      expect(date.getUTCFullYear()).toBe(2024)
      expect(date.getUTCMonth()).toBe(2) // March (0-indexed)
      expect(date.getUTCDate()).toBe(15)
      expect(date.getUTCHours()).toBe(0)
      expect(date.getUTCMinutes()).toBe(0)
      expect(date.getUTCSeconds()).toBe(0)
    })
  })

  describe('getConsumptionDateRange', () => {
    it('should return 3 years range by default', () => {
      const range = getConsumptionDateRange()
      const start = new Date(range.start)
      const end = new Date(range.end)

      const diffInMs = end.getTime() - start.getTime()
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      expect(diffInDays).toBe(1095) // 3 years
    })

    it('should return custom days range', () => {
      const range = getConsumptionDateRange(30)
      const start = new Date(range.start)
      const end = new Date(range.end)

      const diffInMs = end.getTime() - start.getTime()
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      expect(diffInDays).toBe(30)
    })

    it('should end at yesterday', () => {
      const range = getConsumptionDateRange()
      const yesterday = getYesterdayUTC()

      expect(range.end).toBe(formatDateUTC(yesterday))
    })
  })

  describe('getDetailDateRange', () => {
    it('should return most recent week for offset 0', () => {
      const range = getDetailDateRange(0)
      const start = new Date(range.start)
      const end = new Date(range.end)

      const diffInMs = end.getTime() - start.getTime()
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      expect(diffInDays).toBe(6) // 7 days total
    })

    it('should return previous week for offset 1', () => {
      const range0 = getDetailDateRange(0)
      const range1 = getDetailDateRange(1)

      const end0 = new Date(range0.end)
      const end1 = new Date(range1.end)

      const diffInMs = end0.getTime() - end1.getTime()
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))

      expect(diffInDays).toBe(7) // Exactly 1 week earlier
    })
  })

  describe('getDateRange', () => {
    it('should generate all dates between start and end', () => {
      const dates = getDateRange('2024-03-01', '2024-03-05')

      expect(dates).toEqual([
        '2024-03-01',
        '2024-03-02',
        '2024-03-03',
        '2024-03-04',
        '2024-03-05'
      ])
    })

    it('should handle single day range', () => {
      const dates = getDateRange('2024-03-15', '2024-03-15')

      expect(dates).toEqual(['2024-03-15'])
    })

    it('should handle month boundaries', () => {
      const dates = getDateRange('2024-02-28', '2024-03-02')

      expect(dates).toEqual([
        '2024-02-28',
        '2024-02-29', // Leap year
        '2024-03-01',
        '2024-03-02'
      ])
    })
  })

  describe('isDateInRange', () => {
    it('should return true for date within range', () => {
      const date = new Date('2024-03-15T00:00:00Z')
      const start = new Date('2024-03-01T00:00:00Z')
      const end = new Date('2024-03-31T00:00:00Z')

      expect(isDateInRange(date, start, end)).toBe(true)
    })

    it('should return true for date at range boundaries', () => {
      const start = new Date('2024-03-01T00:00:00Z')
      const end = new Date('2024-03-31T00:00:00Z')

      expect(isDateInRange(start, start, end)).toBe(true)
      expect(isDateInRange(end, start, end)).toBe(true)
    })

    it('should return false for date outside range', () => {
      const date = new Date('2024-04-01T00:00:00Z')
      const start = new Date('2024-03-01T00:00:00Z')
      const end = new Date('2024-03-31T00:00:00Z')

      expect(isDateInRange(date, start, end)).toBe(false)
    })
  })

  describe('formatDateFR', () => {
    it('should format date in French locale', () => {
      const date = new Date('2024-03-15T00:00:00Z')
      const formatted = formatDateFR(date)

      // The exact format may vary by environment, but should contain these elements
      expect(formatted).toContain('15')
      expect(formatted).toContain('2024')
      expect(formatted.toLowerCase()).toMatch(/mars|march/) // Depending on locale
    })

    it('should handle string input', () => {
      const formatted = formatDateFR('2024-03-15')

      expect(formatted).toContain('15')
      expect(formatted).toContain('2024')
    })
  })

  describe('getWeeksBetween', () => {
    it('should calculate weeks between two dates', () => {
      const start = new Date('2024-03-01T00:00:00Z')
      const end = new Date('2024-03-29T00:00:00Z')

      const weeks = getWeeksBetween(start, end)

      expect(weeks).toBe(4) // 28 days = 4 weeks
    })

    it('should round up partial weeks', () => {
      const start = new Date('2024-03-01T00:00:00Z')
      const end = new Date('2024-03-10T00:00:00Z')

      const weeks = getWeeksBetween(start, end)

      expect(weeks).toBe(2) // 9 days rounds up to 2 weeks
    })

    it('should handle same day', () => {
      const date = new Date('2024-03-15T00:00:00Z')

      const weeks = getWeeksBetween(date, date)

      expect(weeks).toBe(0)
    })
  })
})