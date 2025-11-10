import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailedLoadCurve } from '../DetailedLoadCurve'

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

describe('DetailedLoadCurve', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const defaultProps = {
    detailByDayData: [
      {
        date: '2024-01-15',
        data: [
          { time: '00:00', power: 1.5, energyKwh: 0.75 },
          { time: '00:30', power: 1.2, energyKwh: 0.6 },
        ],
        totalEnergyKwh: 10.5,
      },
    ],
    selectedPDL: 'PDL123',
    isDarkMode: false,
    isLoadingDetail: false,
    detailDateRange: { start: '2024-01-15', end: '2024-01-15' },
    onWeekOffsetChange: vi.fn(),
    detailWeekOffset: 0,
  }

  it('should render comparison buttons as disabled when no comparison data is available', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <DetailedLoadCurve {...defaultProps} />
      </QueryClientProvider>
    )

    // Find the comparison buttons
    const yearButton = screen.getByRole('button', { name: /année -1/i })
    const weekButton = screen.getByRole('button', { name: /semaine -1/i })

    // Check that buttons are disabled
    expect(yearButton).toBeDisabled()
    expect(weekButton).toBeDisabled()

    // Check that buttons have the correct disabled styling
    expect(yearButton.className).toContain('cursor-not-allowed')
    expect(yearButton.className).toContain('opacity-50')
    expect(weekButton.className).toContain('cursor-not-allowed')
    expect(weekButton.className).toContain('opacity-50')
  })

  it('should enable comparison buttons when comparison data is available', () => {
    // Add mock data to query cache for week-1 and year-1
    const weekAgoDate = '2024-01-08'
    const yearAgoDate = '2023-01-15'

    queryClient.setQueryData(
      ['consumptionDetail', 'PDL123', weekAgoDate, weekAgoDate],
      {
        data: {
          meter_reading: {
            interval_reading: [
              { value: '1500' },
              { value: '1200' },
            ],
          },
        },
      }
    )

    queryClient.setQueryData(
      ['consumptionDetail', 'PDL123', yearAgoDate, yearAgoDate],
      {
        data: {
          meter_reading: {
            interval_reading: [
              { value: '1600' },
              { value: '1300' },
            ],
          },
        },
      }
    )

    render(
      <QueryClientProvider client={queryClient}>
        <DetailedLoadCurve {...defaultProps} />
      </QueryClientProvider>
    )

    // Find the comparison buttons
    const yearButton = screen.getByRole('button', { name: /année -1/i })
    const weekButton = screen.getByRole('button', { name: /semaine -1/i })

    // Check that buttons are enabled
    expect(yearButton).not.toBeDisabled()
    expect(weekButton).not.toBeDisabled()

    // Check that buttons don't have disabled styling
    expect(yearButton.className).not.toContain('cursor-not-allowed')
    expect(yearButton.className).not.toContain('opacity-50')
    expect(weekButton.className).not.toContain('cursor-not-allowed')
    expect(weekButton.className).not.toContain('opacity-50')
  })
})