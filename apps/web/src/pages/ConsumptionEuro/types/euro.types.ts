import type { EnergyOffer } from '@/api/energy'

// Date range type
export interface DateRange {
  start: string
  end: string
}

// Cost calculation result per period
export interface PeriodCost {
  periodLabel: string
  startDate: Date
  endDate: Date
  // Consumption in kWh
  totalKwh: number
  hcKwh: number
  hpKwh: number
  // Costs in euros
  consumptionCost: number // Cost of energy consumed
  subscriptionCost: number // Monthly subscription prorated
  totalCost: number // Total cost
  // Breakdown
  hcCost: number
  hpCost: number
  // Metadata
  daysInPeriod: number
  monthsInPeriod: number
}

// Monthly cost breakdown
export interface MonthlyCost {
  month: string // YYYY-MM
  monthLabel: string // "janv. 2024"
  // Consumption in kWh
  totalKwh: number
  hcKwh: number
  hpKwh: number
  // Costs in euros
  consumptionCost: number
  subscriptionCost: number
  totalCost: number
  // Breakdown
  hcCost: number
  hpCost: number
  // Days with data
  daysWithData: number
}

// Yearly cost summary
export interface YearlyCost {
  year: string
  periodLabel: string
  months: MonthlyCost[]
  // Totals
  totalKwh: number
  hcKwh: number
  hpKwh: number
  totalCost: number
  consumptionCost: number
  subscriptionCost: number
  hcCost: number
  hpCost: number
  // Comparison data
  avgMonthlyCost: number
  avgMonthlyKwh: number
}

// Chart data point for cost visualization
export interface CostChartDataPoint {
  month: string
  monthLabel: string
  cost: number
  consumption: number
  hcCost?: number
  hpCost?: number
  subscription?: number
}

// Selected offer with provider info
export interface SelectedOfferWithProvider extends EnergyOffer {
  providerName?: string
}

// Props for cost components
export interface EuroCostCardsProps {
  yearlyCosts: YearlyCost[]
  selectedOffer: SelectedOfferWithProvider | null
  isLoading: boolean
}

export interface EuroYearlyChartProps {
  yearlyCosts: YearlyCost[]
  isDarkMode: boolean
}

export interface EuroMonthlyBreakdownProps {
  yearlyCosts: YearlyCost[]
  selectedOffer: SelectedOfferWithProvider | null
  isDarkMode: boolean
}
