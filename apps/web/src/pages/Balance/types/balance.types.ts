export interface DateRange {
  start: string
  end: string
}

export interface YearlyBalance {
  year: string
  consumption: number // in Wh
  production: number // in Wh
  netBalance: number // production - consumption (positive = surplus)
  selfConsumptionRate: number // estimated % (0-100)
  startDate: Date
  endDate: Date
}

export interface MonthlyBalance {
  month: number // 1-12
  monthLabel: string // "Jan", "Fév", etc.
  consumption: number // in Wh
  production: number // in Wh
  netBalance: number
  [key: string]: string | number // for dynamic year keys
}

export interface DailyBalance {
  date: string // YYYY-MM-DD
  consumption: number // in Wh
  production: number // in Wh
  netBalance: number
}

export interface BalanceChartData {
  byYear: YearlyBalance[]
  byMonth: MonthlyBalance[]
  byDay: DailyBalance[]
  years: string[]
  totals: {
    consumption: number
    production: number
    netBalance: number
    selfConsumptionRate: number
  }
}

export interface DetailedBalanceData {
  timestamp: string // ISO datetime
  consumption: number // in W or Wh depending on interval
  production: number
  netBalance: number
}
