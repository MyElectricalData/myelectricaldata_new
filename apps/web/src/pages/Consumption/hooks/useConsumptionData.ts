import { useQuery, useQueryClient } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import { enedisApi } from '@/api/enedis'
import type { PDL } from '@/types/api'
import type { DateRange } from '../types/consumption.types'

export function useConsumptionData(selectedPDL: string, dateRange: DateRange | null, detailDateRange: DateRange | null, selectedPDLDetails: PDL | undefined) {
  const queryClient = useQueryClient()

  // Fetch PDLs
  const { data: pdlsData } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
  })

  const pdls = Array.isArray(pdlsData) ? pdlsData : []

  // Filter only active PDLs (if is_active is undefined, consider it as active)
  const activePdls = pdls.filter(p => p.is_active !== false)

  // Fetch consumption data with React Query
  const { data: consumptionResponse, isLoading: isLoadingConsumption } = useQuery({
    queryKey: ['consumption', selectedPDL, dateRange?.start, dateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !dateRange) return null
      return enedisApi.getConsumptionDaily(selectedPDL, {
        start: dateRange.start,
        end: dateRange.end,
        use_cache: true,
      })
    },
    enabled: !!selectedPDL && !!dateRange,
    staleTime: 1000 * 60 * 60, // 1 hour - data is considered fresh
    gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache
  })

  // Fetch max power data with React Query
  const { data: maxPowerResponse, isLoading: isLoadingPower } = useQuery({
    queryKey: ['maxPower', selectedPDL, dateRange?.start, dateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !dateRange) return null
      return enedisApi.getMaxPower(selectedPDL, {
        start: dateRange.start,
        end: dateRange.end,
        use_cache: true,
      })
    },
    enabled: !!selectedPDL && !!dateRange,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Fetch detailed consumption data (load curve - 30min intervals)
  // Only fetch if PDL is active and has consumption enabled
  const shouldFetchDetail = !!selectedPDL &&
                           !!detailDateRange &&
                           selectedPDLDetails?.is_active &&
                           selectedPDLDetails?.has_consumption

  const { data: detailResponse, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['consumptionDetail', selectedPDL, detailDateRange?.start, detailDateRange?.end],
    queryFn: async () => {
      if (!selectedPDL || !detailDateRange) return null

      try {
        // Get all days in the range from cache (day by day)
        const startDate = new Date(detailDateRange.start + 'T00:00:00Z')
        const endDate = new Date(detailDateRange.end + 'T00:00:00Z')
        const allPoints: any[] = []
        const daysChecked: string[] = []
        const daysFound: string[] = []

        // Iterate through each day in the range
        const currentDate = new Date(startDate)
        while (currentDate <= endDate) {
          const dateStr = currentDate.getUTCFullYear() + '-' +
                         String(currentDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                         String(currentDate.getUTCDate()).padStart(2, '0')

          daysChecked.push(dateStr)

          // Try to get this day's data from cache
          const dayData = queryClient.getQueryData(['consumptionDetail', selectedPDL, dateStr, dateStr]) as any

          if (dayData?.data?.meter_reading?.interval_reading) {
            daysFound.push(dateStr)
            allPoints.push(...dayData.data.meter_reading.interval_reading)
          }

          // Move to next day
          currentDate.setUTCDate(currentDate.getUTCDate() + 1)
        }

        // Return combined data in the same format as API response
        return allPoints.length > 0 ? {
          success: true,
          data: {
            meter_reading: {
              interval_reading: allPoints
            }
          }
        } : null
      } catch (error) {
        console.error('Error in detailResponse queryFn:', error)
        return null
      }
    },
    enabled: shouldFetchDetail,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  const consumptionData = consumptionResponse?.success ? consumptionResponse.data : null
  const maxPowerData = maxPowerResponse?.success ? maxPowerResponse.data : null
  const detailData = detailResponse?.success ? detailResponse.data : null
  const isLoading = isLoadingConsumption || isLoadingPower || isLoadingDetail

  return {
    pdls,
    activePdls,
    consumptionData,
    maxPowerData,
    detailData,
    isLoading,
    isLoadingConsumption,
    isLoadingPower,
    isLoadingDetail,
    queryClient
  }
}