import type { PDL } from '@/types/api'

// Date range type
export interface DateRange {
  start: string
  end: string
}

// Loading progress
export interface LoadingProgress {
  current: number
  total: number
  currentRange: string
}

// Chart data types
export interface ChartDataPoint {
  date: string
  value: number
  hc?: number
  hp?: number
  year?: number
  month?: string
}

export interface PowerDataPoint {
  date: string
  value: number
}

export interface DetailDataPoint {
  date: string
  time: string
  value: number
  isHc?: boolean
}

export interface HcHpData {
  hc: number
  hp: number
  total: number
  percentHc: number
  percentHp: number
}

export interface YearlyData {
  year: number
  total: number
  hc?: number
  hp?: number
  percentHc?: number
  percentHp?: number
}

export interface MonthlyHcHpData {
  month: string
  hc: number
  hp: number
  total: number
}

// API response types
export interface ConsumptionResponse {
  success: boolean
  data?: any
  error?: string
  message?: string
}

// Component props types
export interface PDLSelectorProps {
  pdls: PDL[]
  activePdls: PDL[]
  selectedPDL: string
  selectedPDLDetails: PDL | undefined
  onPDLSelect: (value: string) => void
  onFetchData: () => void
  onClearCache: () => void
  isClearingCache: boolean
  isLoading: boolean
  isLoadingDetailed: boolean
  isLoadingDaily: boolean
  hasAttemptedAutoLoad: boolean
}

export interface LoadingProgressProps {
  isLoadingDaily: boolean
  isLoadingDetailed: boolean
  dailyLoadingComplete: boolean
  powerLoadingComplete: boolean
  loadingProgress: LoadingProgress
  hcHpCalculationComplete: boolean
  hcHpCalculationTrigger: number
  allLoadingComplete: boolean
}

export interface YearlyConsumptionProps {
  yearConsumptions: YearlyData[]
  selectedHcHpPeriod: number
  setSelectedHcHpPeriod: (value: number) => void
  showYearComparison: boolean
  setShowYearComparison: (value: boolean) => void
  isStatsSectionExpanded: boolean
  setIsStatsSectionExpanded: (value: boolean) => void
  isDarkMode: boolean
}

export interface HcHpDistributionProps {
  hcHpByYear: Record<number, HcHpData>
  selectedHcHpPeriod: number
  isDarkMode: boolean
}

export interface AnnualCurveProps {
  chartData: ChartDataPoint[]
  onExportJSON: () => void
  isChartsExpanded: boolean
  setIsChartsExpanded: (value: boolean) => void
  isDarkMode: boolean
}

export interface DetailedLoadCurveProps {
  detailChartData: DetailDataPoint[]
  detailHcHpChartData: DetailDataPoint[]
  selectedDetailDay: number
  setSelectedDetailDay: (value: number) => void
  detailWeekOffset: number
  setDetailWeekOffset: (value: number) => void
  viewMonth: Date
  setViewMonth: (value: Date) => void
  showDatePicker: boolean
  setShowDatePicker: (value: boolean) => void
  showDetailYearComparison: boolean
  setShowDetailYearComparison: (value: boolean) => void
  showDetailWeekComparison: boolean
  setShowDetailWeekComparison: (value: boolean) => void
  dateRange: DateRange | null
  detailDateRange: DateRange | null
  isDetailSectionExpanded: boolean
  setIsDetailSectionExpanded: (value: boolean) => void
  isDarkMode: boolean
  selectedPDLDetails: PDL | undefined
}

export interface MonthlyHcHpProps {
  monthlyHcHpData: Record<number, MonthlyHcHpData[]>
  selectedMonthlyHcHpYear: number
  setSelectedMonthlyHcHpYear: (value: number) => void
  isDarkMode: boolean
}

export interface PowerPeaksProps {
  powerChartData: PowerDataPoint[]
  selectedPowerYear: number
  setSelectedPowerYear: (value: number) => void
  isPowerSectionExpanded: boolean
  setIsPowerSectionExpanded: (value: boolean) => void
  isDarkMode: boolean
}

export interface InfoBlockProps {
  dataLimitWarning: string | null
}

export interface ConfirmModalProps {
  showConfirmModal: boolean
  setShowConfirmModal: (value: boolean) => void
  confirmClearCache: () => void
}