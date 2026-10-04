import type { EnedisMeasure } from '@/types/api'

export interface DateRange {
  start: string
  end: string
}

export interface LoadingProgress {
  current: number
  total: number
  currentRange: string
}

export type ProductionAPIResponse = EnedisMeasure

export type MaxPowerAPIResponse = EnedisMeasure

export type DetailAPIResponse = EnedisMeasure
