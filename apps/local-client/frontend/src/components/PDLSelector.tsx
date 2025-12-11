import { useQuery } from '@tanstack/react-query'
import { getPDLs } from '../api/client'
import { useStore } from '../stores/useStore'
import { ChevronDown } from 'lucide-react'
import { useEffect } from 'react'

export default function PDLSelector() {
  const { selectedPdl, setSelectedPdl } = useStore()
  const { data: pdls, isLoading } = useQuery({
    queryKey: ['pdls'],
    queryFn: getPDLs,
  })

  // Auto-select first PDL if none selected
  useEffect(() => {
    if (pdls && pdls.length > 0 && !selectedPdl) {
      setSelectedPdl(pdls[0].usage_point_id)
    }
  }, [pdls, selectedPdl, setSelectedPdl])

  if (isLoading) {
    return (
      <div className="animate-pulse h-10 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
    )
  }

  if (!pdls || pdls.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Aucun PDL disponible
      </div>
    )
  }

  return (
    <div className="relative">
      <select
        value={selectedPdl || ''}
        onChange={(e) => setSelectedPdl(e.target.value)}
        className="appearance-none w-full sm:w-auto px-4 py-2 pr-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
      >
        {pdls.map((pdl) => (
          <option key={pdl.usage_point_id} value={pdl.usage_point_id}>
            PDL {pdl.usage_point_id}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
    </div>
  )
}
