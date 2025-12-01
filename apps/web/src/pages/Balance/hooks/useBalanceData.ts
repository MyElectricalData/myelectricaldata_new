import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pdlApi } from '@/api/pdl'
import type { PDL, APIResponse } from '@/types/api'
import type { EnedisData } from '@/api/enedis'
import type { DateRange } from '../types/balance.types'

type EnedisApiResponse = APIResponse<EnedisData>

export function useBalanceData(selectedPDL: string, dateRange: DateRange | null) {
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

  // Filter PDLs that have BOTH consumption and production data
  // A PDL has production if has_production === true OR if it's linked to a production PDL
  const balancePdls = useMemo(() => {
    return pdls.filter(p => {
      if (p.is_active === false) return false
      // PDL must have production capability
      return p.has_production === true || p.linked_production_pdl_id
    })
  }, [pdls])

  // Get selected PDL details
  const selectedPDLDetails = pdls.find(p => p.usage_point_id === selectedPDL)

  // Determine the production PDL to use
  // If the selected PDL has linked_production_pdl_id, use that for production data
  const productionPDLDetails = useMemo(() => {
    if (!selectedPDLDetails) return null
    if (selectedPDLDetails.linked_production_pdl_id) {
      // Find the linked production PDL by its UUID (id)
      return pdls.find(p => p.id === selectedPDLDetails.linked_production_pdl_id) || null
    }
    return null
  }, [selectedPDLDetails, pdls])

  const productionPDL = useMemo(() => {
    if (!selectedPDLDetails) return selectedPDL
    if (productionPDLDetails) {
      return productionPDLDetails.usage_point_id
    }
    return selectedPDL
  }, [selectedPDLDetails, selectedPDL, productionPDLDetails])

  // Read consumption data from cache (already fetched by ConsumptionKwh page)
  const consumptionResponse = useQuery<EnedisApiResponse | null>({
    queryKey: ['consumptionDaily', selectedPDL],
    enabled: !!selectedPDL && !!dateRange,
    queryFn: async () => {
      // Just read from cache - data should already be there
      return queryClient.getQueryData(['consumptionDaily', selectedPDL]) as EnedisApiResponse | null
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Read production data from cache (already fetched by Production page)
  const productionResponse = useQuery<EnedisApiResponse | null>({
    queryKey: ['productionDaily', productionPDL],
    enabled: !!productionPDL && !!dateRange,
    queryFn: async () => {
      // Just read from cache - data should already be there
      return queryClient.getQueryData(['productionDaily', productionPDL]) as EnedisApiResponse | null
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Detailed data (30min intervals) for more accurate self-consumption calculation
  const [consumptionDetailResponse, setConsumptionDetailResponse] = useState<EnedisApiResponse | null>(null)
  const [productionDetailResponse, setProductionDetailResponse] = useState<EnedisApiResponse | null>(null)

  // Subscribe to consumption detail cache updates
  useEffect(() => {
    if (!selectedPDL) {
      setConsumptionDetailResponse(null)
      return
    }

    const initialData = queryClient.getQueryData(['consumptionDetail', selectedPDL]) as EnedisApiResponse | null
    if (initialData) {
      setConsumptionDetailResponse(initialData)
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'consumptionDetail' &&
        event?.query?.queryKey?.[1] === selectedPDL
      ) {
        const updatedData = queryClient.getQueryData(['consumptionDetail', selectedPDL]) as EnedisApiResponse | null
        setConsumptionDetailResponse(updatedData)
      }
    })

    return () => unsubscribe()
  }, [selectedPDL, queryClient])

  // Subscribe to production detail cache updates
  useEffect(() => {
    if (!productionPDL) {
      setProductionDetailResponse(null)
      return
    }

    const initialData = queryClient.getQueryData(['productionDetail', productionPDL]) as EnedisApiResponse | null
    if (initialData) {
      setProductionDetailResponse(initialData)
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === 'updated' &&
        event?.query?.queryKey?.[0] === 'productionDetail' &&
        event?.query?.queryKey?.[1] === productionPDL
      ) {
        const updatedData = queryClient.getQueryData(['productionDetail', productionPDL]) as EnedisApiResponse | null
        setProductionDetailResponse(updatedData)
      }
    })

    return () => unsubscribe()
  }, [productionPDL, queryClient])

  const consumptionData = consumptionResponse.data?.success ? consumptionResponse.data.data ?? null : null
  const productionData = productionResponse.data?.success ? productionResponse.data.data ?? null : null
  const consumptionDetailData = consumptionDetailResponse?.success ? consumptionDetailResponse.data ?? null : null
  const productionDetailData = productionDetailResponse?.success ? productionDetailResponse.data ?? null : null

  const isLoading = consumptionResponse.isLoading || productionResponse.isLoading

  // Check if we have data in cache
  const hasConsumptionData = !!consumptionData?.meter_reading?.interval_reading?.length
  const hasProductionData = !!productionData?.meter_reading?.interval_reading?.length
  const hasDetailedData = !!consumptionDetailData?.meter_reading?.interval_reading?.length &&
                          !!productionDetailData?.meter_reading?.interval_reading?.length

  return {
    pdls,
    balancePdls,
    selectedPDLDetails,
    productionPDL,
    productionPDLDetails,
    consumptionData,
    productionData,
    consumptionDetailData,
    productionDetailData,
    isLoading,
    hasConsumptionData,
    hasProductionData,
    hasDetailedData,
    queryClient
  }
}
