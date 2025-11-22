import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { enedisApi } from '@/api/enedis'
import { logger } from '@/utils/logger'
import toast from 'react-hot-toast'
import type { PDL } from '@/types/api'

interface UseDataFetchResult {
  isLoading: boolean
  fetchData: () => Promise<void>
  progress: {
    current: number
    total: number
    message: string
  }
}

export function useDataFetch(selectedPDL: string, pdlDetails: PDL | undefined): UseDataFetchResult {
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    message: ''
  })

  const fetchData = useCallback(async () => {
    console.log('[useDataFetch] fetchData called', { selectedPDL, pdlDetails })

    if (!selectedPDL) {
      toast.error('Veuillez sélectionner un PDL')
      return
    }

    if (!pdlDetails) {
      toast.error('Détails du PDL non disponibles')
      return
    }

    console.log('[useDataFetch] Starting data fetch...')
    setIsLoading(true)
    setProgress({ current: 0, total: 0, message: 'Initialisation...' })

    try {
      // Calculate date range (3 years max - 1095 days)
      const todayUTC = new Date()
      const yesterdayUTC = new Date(Date.UTC(
        todayUTC.getUTCFullYear(),
        todayUTC.getUTCMonth(),
        todayUTC.getUTCDate() - 1,
        0, 0, 0, 0
      ))

      const startDate_obj = new Date(Date.UTC(
        yesterdayUTC.getUTCFullYear(),
        yesterdayUTC.getUTCMonth(),
        yesterdayUTC.getUTCDate() - 1095,
        0, 0, 0, 0
      ))

      const startDate = startDate_obj.toISOString().split('T')[0]
      const endDate = yesterdayUTC.toISOString().split('T')[0]

      logger.log('[DataFetch] Fetching data for PDL:', selectedPDL, {
        has_consumption: pdlDetails.has_consumption,
        has_production: pdlDetails.has_production,
        startDate,
        endDate
      })

      const tasks: Array<{ name: string; fn: () => Promise<any>; queryKey: any[] }> = []

      // Fetch consumption if PDL has it
      if (pdlDetails.has_consumption) {
        tasks.push({
          name: 'Consommation quotidienne',
          fn: async () => {
            setProgress(prev => ({ ...prev, message: 'Récupération consommation quotidienne...' }))
            return enedisApi.getConsumptionDaily(selectedPDL, { start: startDate, end: endDate })
          },
          queryKey: ['consumption', selectedPDL, startDate, endDate]
        })

        tasks.push({
          name: 'Puissance maximale',
          fn: async () => {
            setProgress(prev => ({ ...prev, message: 'Récupération puissance maximale...' }))
            return enedisApi.getMaxPower(selectedPDL, { start: startDate, end: endDate })
          },
          queryKey: ['maxPower', selectedPDL, startDate, endDate]
        })
      }

      // Fetch production if PDL has it
      if (pdlDetails.has_production) {
        tasks.push({
          name: 'Production quotidienne',
          fn: async () => {
            setProgress(prev => ({ ...prev, message: 'Récupération production quotidienne...' }))
            return enedisApi.getProductionDaily(selectedPDL, { start: startDate, end: endDate })
          },
          queryKey: ['production', selectedPDL, startDate, endDate]
        })
      }

      console.log('[useDataFetch] Total tasks:', tasks.length)
      setProgress({ current: 0, total: tasks.length, message: `0/${tasks.length} tâches complétées` })

      let hasErrors = false

      // Execute all tasks sequentially
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        console.log(`[useDataFetch] Executing task ${i + 1}/${tasks.length}: ${task.name}`)
        try {
          const data = await task.fn()
          console.log(`[useDataFetch] Task ${task.name} completed, data:`, data)

          // Check if the API returned an error
          if (data && !data.success && data.error) {
            hasErrors = true
            console.error(`[useDataFetch] API error in ${task.name}:`, data.error)
            const errorMsg = typeof data.error === 'string' ? data.error : data.error.message || 'Erreur inconnue'
            toast.error(`${task.name}: ${errorMsg}`)
          } else {
            queryClient.setQueryData(task.queryKey, data)
          }

          setProgress({
            current: i + 1,
            total: tasks.length,
            message: `${i + 1}/${tasks.length} tâches complétées`
          })
        } catch (error: any) {
          hasErrors = true
          console.error(`[useDataFetch] Error in task ${task.name}:`, error)
          logger.error(`[DataFetch] Error fetching ${task.name}:`, error)
          toast.error(`Erreur lors de la récupération: ${task.name}`)
        }
      }

      console.log('[useDataFetch] All tasks completed!')
      if (!hasErrors) {
        toast.success('Données récupérées avec succès')
      }

    } catch (error: any) {
      logger.error('[DataFetch] Error:', error)
      toast.error('Erreur lors de la récupération des données')
    } finally {
      setIsLoading(false)
      setProgress({ current: 0, total: 0, message: '' })
    }
  }, [selectedPDL, pdlDetails, queryClient])

  return {
    isLoading,
    fetchData,
    progress
  }
}
