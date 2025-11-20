import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Trash2, RefreshCw, Edit2, Save, X, Zap, Clock, Factory, Plus, Minus, Eye, EyeOff, Calendar, MoreVertical, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react'
import { pdlApi } from '@/api/pdl'
import { oauthApi } from '@/api/oauth'
import type { PDL } from '@/types/api'

interface PDLCardProps {
  pdl: PDL
  onViewDetails: () => void
  onDelete: () => void
  isDemo?: boolean
  allPdls?: PDL[] // All PDLs for linking production
}

export default function PDLCard({ pdl, onViewDetails, onDelete, isDemo = false, allPdls = [] }: PDLCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [showSyncWarning, setShowSyncWarning] = useState(false)
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [hasConsentError, setHasConsentError] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [editedName, setEditedName] = useState(pdl.name || '')
  const [editedPower, setEditedPower] = useState(pdl.subscribed_power?.toString() || '')
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement | null>(null)
  const [offpeakRanges, setOffpeakRanges] = useState<Array<{startHour: string, startMin: string, endHour: string, endMin: string}>>(() => {
    const parseRange = (range: string) => {
      // Try format "HH:MM-HH:MM" (array format)
      let match = range.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
      if (match) {
        return {
          startHour: match[1].padStart(2, '0'),
          startMin: match[2],
          endHour: match[3].padStart(2, '0'),
          endMin: match[4]
        }
      }

      // Try format "HC (22H00-6H00)" (Enedis format with parentheses)
      const enedisMatch = range.match(/HC\s*\(([^)]+)\)/i)
      if (enedisMatch) {
        const content = enedisMatch[1]
        // Split by semicolon for multiple ranges (we'll only parse the first one here)
        const ranges = content.split(';')
        const firstRange = ranges[0].trim()
        // Match "22H00-6H00" or "22h00-6h00"
        match = firstRange.match(/(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})/)
        if (match) {
          return {
            startHour: match[1].padStart(2, '0'),
            startMin: match[2],
            endHour: match[3].padStart(2, '0'),
            endMin: match[4]
          }
        }
      }

      return { startHour: '00', startMin: '00', endHour: '00', endMin: '00' }
    }

    const parseAllRanges = (str: string) => {
      const results = []
      // Check if it's Enedis format with parentheses
      const enedisMatch = str.match(/HC\s*\(([^)]+)\)/i)
      if (enedisMatch) {
        const content = enedisMatch[1]
        const ranges = content.split(';')
        for (const rangeStr of ranges) {
          const match = rangeStr.trim().match(/(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})/)
          if (match) {
            results.push({
              startHour: match[1].padStart(2, '0'),
              startMin: match[2],
              endHour: match[3].padStart(2, '0'),
              endMin: match[4]
            })
          }
        }
        return results
      }
      // Otherwise use regular parseRange
      return [parseRange(str)]
    }

    if (!pdl.offpeak_hours) return [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }]

    if (Array.isArray(pdl.offpeak_hours)) {
      return pdl.offpeak_hours.length > 0
        ? pdl.offpeak_hours.flatMap(parseAllRanges)
        : [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }]
    }

    // Legacy format: convert object to array and deduplicate
    const values = Object.values(pdl.offpeak_hours).filter(Boolean) as string[]
    const uniqueValues = Array.from(new Set(values))
    return uniqueValues.length > 0
      ? uniqueValues.flatMap(parseAllRanges)
      : [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }]
  })
  const queryClient = useQueryClient()

  // Sync edited values with PDL changes
  useEffect(() => {
    const parseAllRanges = (str: string) => {
      const results = []
      // Check if it's Enedis format with parentheses
      const enedisMatch = str.match(/HC\s*\(([^)]+)\)/i)
      if (enedisMatch) {
        const content = enedisMatch[1]
        const ranges = content.split(';')
        for (const rangeStr of ranges) {
          const match = rangeStr.trim().match(/(\d{1,2})[hH](\d{2})\s*-\s*(\d{1,2})[hH](\d{2})/)
          if (match) {
            results.push({
              startHour: match[1].padStart(2, '0'),
              startMin: match[2],
              endHour: match[3].padStart(2, '0'),
              endMin: match[4]
            })
          }
        }
        return results.length > 0 ? results : [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }]
      }

      // Try format "HH:MM-HH:MM" (array format)
      const match = str.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/)
      if (match) {
        return [{
          startHour: match[1].padStart(2, '0'),
          startMin: match[2],
          endHour: match[3].padStart(2, '0'),
          endMin: match[4]
        }]
      }

      return [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }]
    }

    setEditedName(pdl.name || '')
    setEditedPower(pdl.subscribed_power?.toString() || '')

    if (!pdl.offpeak_hours) {
      setOffpeakRanges([{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }])
    } else if (Array.isArray(pdl.offpeak_hours)) {
      const parsed = pdl.offpeak_hours.flatMap(parseAllRanges)
      setOffpeakRanges(parsed.length > 0 ? parsed : [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }])
    } else {
      // Legacy format: convert object to array and deduplicate
      const values = Object.values(pdl.offpeak_hours).filter(Boolean) as string[]
      const uniqueValues = Array.from(new Set(values))
      const parsed = uniqueValues.flatMap(parseAllRanges)
      setOffpeakRanges(parsed.length > 0 ? parsed : [{ startHour: '00', startMin: '00', endHour: '00', endMin: '00' }])
    }
  }, [pdl.id, pdl.name, pdl.subscribed_power, pdl.offpeak_hours])

  // Reset consent error when PDL changes (actual consent errors are set by fetchContractMutation)
  useEffect(() => {
    setHasConsentError(false)
  }, [pdl.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false)
      }
    }

    if (showMobileMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMobileMenu])


  const fetchContractMutation = useMutation({
    mutationFn: () => {
      if (isDemo) {
        return Promise.reject(new Error('Synchronisation désactivée en mode démo'))
      }
      return pdlApi.fetchContract(pdl.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setShowSyncWarning(false)
      setHasConsentError(false)
    },
    onError: (error: any) => {
      // Check if it's a consent error from Enedis
      const errorMessage = error?.response?.data?.error?.message || error?.message || ''
      if (errorMessage.includes('ERRE001150') || errorMessage.includes('No consent')) {
        setHasConsentError(true)
        // Uncheck consumption and production
        updateTypeMutation.mutate({ has_consumption: false, has_production: false })
      }
    },
  })

  const handleConfirmSync = () => {
    setShowSyncWarning(false)
    fetchContractMutation.mutate()
  }

  const updateContractMutation = useMutation({
    mutationFn: (data: { subscribed_power?: number; offpeak_hours?: string[] | Record<string, string> }) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.updateContract(pdl.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.updateName(pdl.id, name)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsEditingName(false)
    },
  })

  const updateTypeMutation = useMutation({
    mutationFn: ({ has_consumption, has_production }: { has_consumption: boolean; has_production: boolean }) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.updateType(pdl.id, has_consumption, has_production)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (is_active: boolean) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.toggleActive(pdl.id, is_active)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const getConsentUrlMutation = useMutation({
    mutationFn: () => {
      if (isDemo) {
        return Promise.reject(new Error('Consentement Enedis désactivé en mode démo'))
      }
      return oauthApi.getAuthorizeUrl()
    },
    onSuccess: (response) => {
      if (response.success && response.data) {
        window.location.href = response.data.authorize_url
      }
    },
  })

  const linkProductionMutation = useMutation({
    mutationFn: (productionPdlId: string | null) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.linkProduction(pdl.id, productionPdlId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const saveContract = () => {
    const data: { subscribed_power?: number; offpeak_hours?: string[] } = {}

    if (editedPower) {
      data.subscribed_power = parseInt(editedPower)
    }

    // Convert ranges to string format "HH:MM-HH:MM"
    const validRanges = offpeakRanges
      .filter(r => r.startHour !== '00' || r.startMin !== '00' || r.endHour !== '00' || r.endMin !== '00')
      .map(r => `${r.startHour}:${r.startMin}-${r.endHour}:${r.endMin}`)

    if (validRanges.length > 0) {
      data.offpeak_hours = validRanges
    }

    setIsSaving(true)
    updateContractMutation.mutate(data)
  }

  const handlePowerChange = (value: string) => {
    setEditedPower(value)

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Auto-save after a short delay
    saveTimeoutRef.current = setTimeout(() => {
      const data: { subscribed_power?: number } = {}
      if (value) {
        data.subscribed_power = parseInt(value)
      }
      setIsSaving(true)
      updateContractMutation.mutate(data)
    }, 500)
  }

  const handleAddOffpeakRange = () => {
    setOffpeakRanges([...offpeakRanges, { startHour: '00', startMin: '00', endHour: '00', endMin: '00' }])
  }

  const handleRemoveOffpeakRange = (index: number) => {
    if (offpeakRanges.length > 1) {
      const newRanges = offpeakRanges.filter((_, i) => i !== index)
      setOffpeakRanges(newRanges)

      // Clear previous timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Auto-save after a short delay
      saveTimeoutRef.current = setTimeout(() => {
        const validRanges = newRanges
          .filter(r => r.startHour !== '00' || r.startMin !== '00' || r.endHour !== '00' || r.endMin !== '00')
          .map(r => `${r.startHour}:${r.startMin}-${r.endHour}:${r.endMin}`)

        const data: { offpeak_hours?: string[] } = {}
        if (validRanges.length > 0) {
          data.offpeak_hours = validRanges
        }

        setIsSaving(true)
        updateContractMutation.mutate(data)
      }, 500)
    }
  }

  const handleOffpeakFieldChange = (index: number, field: 'startHour' | 'startMin' | 'endHour' | 'endMin', value: string) => {
    const newRanges = [...offpeakRanges]
    newRanges[index] = { ...newRanges[index], [field]: value }
    setOffpeakRanges(newRanges)

    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Auto-save after a short delay
    saveTimeoutRef.current = setTimeout(() => {
      const validRanges = newRanges
        .filter(r => r.startHour !== '00' || r.startMin !== '00' || r.endHour !== '00' || r.endMin !== '00')
        .map(r => `${r.startHour}:${r.startMin}-${r.endHour}:${r.endMin}`)

      const data: { offpeak_hours?: string[] } = {}
      if (validRanges.length > 0) {
        data.offpeak_hours = validRanges
      }

      setIsSaving(true)
      updateContractMutation.mutate(data)
    }, 500)
  }

  const handleIncrementField = (index: number, field: 'startHour' | 'startMin' | 'endHour' | 'endMin') => {
    const range = offpeakRanges[index]
    let newValue = parseInt(range[field])

    if (field === 'startHour' || field === 'endHour') {
      newValue = (newValue + 1) % 24
    } else {
      newValue = (newValue + 1) % 60
    }

    handleOffpeakFieldChange(index, field, newValue.toString().padStart(2, '0'))
  }

  const handleDecrementField = (index: number, field: 'startHour' | 'startMin' | 'endHour' | 'endMin') => {
    const range = offpeakRanges[index]
    let newValue = parseInt(range[field])

    if (field === 'startHour' || field === 'endHour') {
      newValue = (newValue - 1 + 24) % 24
    } else {
      newValue = (newValue - 1 + 60) % 60
    }

    handleOffpeakFieldChange(index, field, newValue.toString().padStart(2, '0'))
  }

  const handleSaveName = () => {
    updateNameMutation.mutate(editedName)
  }

  const handleCancelName = () => {
    setEditedName(pdl.name || '')
    setIsEditingName(false)
  }


  return (
    <div className={`p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border relative transition-all ${
      hasConsentError
        ? 'border-red-300 dark:border-red-800'
        : 'border-gray-200 dark:border-gray-700'
    } ${fetchContractMutation.isPending ? 'pointer-events-none' : ''} ${
      !(pdl.is_active ?? true) ? 'opacity-60 bg-gray-100 dark:bg-gray-800' : ''
    }`}>
      {/* Loading overlay */}
      {fetchContractMutation.isPending && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-medium">Récupération en cours...</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="space-y-2 mb-3">
        {/* First line: Name + Edit button + Action buttons */}
        <div className="flex items-center justify-between">
          {isEditingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveName()
                  } else if (e.key === 'Escape') {
                    handleCancelName()
                  }
                }}
                className="input flex-1 text-sm"
                placeholder="Nom du PDL (optionnel)"
                autoFocus
              />
              <button
                onClick={handleSaveName}
                disabled={updateNameMutation.isPending}
                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded"
                title="Enregistrer"
              >
                <Save size={16} />
              </button>
              <button
                onClick={handleCancelName}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                title="Annuler"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {pdl.name || pdl.usage_point_id}
              </p>
              {!(pdl.is_active ?? true) && (
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                  Désactivé
                </span>
              )}
              <button
                onClick={() => setIsEditingName(true)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                title="Modifier le nom"
              >
                <Edit2 size={14} />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-center flex-shrink-0">
            {isSaving && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" />
                <span className="hidden sm:inline">Enregistrement...</span>
              </span>
            )}

            {/* Desktop: Show all buttons */}
            <div className="hidden md:flex gap-2" data-tour="pdl-actions">
              <button
                onClick={onViewDetails}
                className="px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center gap-1.5 text-sm"
                title="Voir les détails"
                data-tour="pdl-details-btn"
              >
                <Info size={16} />
                <span>Détails</span>
              </button>
              <button
                onClick={() => setShowSyncWarning(true)}
                className="px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded flex items-center gap-1.5 text-sm font-medium"
                title="Synchroniser avec Enedis"
                data-tour="pdl-sync-btn"
              >
                <RefreshCw size={16} />
                <span>Sync</span>
              </button>
              <button
                onClick={() => toggleActiveMutation.mutate(!(pdl.is_active ?? true))}
                disabled={toggleActiveMutation.isPending}
                className={`px-3 py-2 rounded flex items-center gap-1.5 text-sm font-medium ${
                  pdl.is_active ?? true
                    ? 'hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                    : 'hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400'
                }`}
                title={pdl.is_active ?? true ? 'Désactiver ce PDL' : 'Activer ce PDL'}
                data-tour="pdl-toggle-btn"
              >
                {pdl.is_active ?? true ? <EyeOff size={16} /> : <Eye size={16} />}
                <span>{pdl.is_active ?? true ? 'Désactiver' : 'Activer'}</span>
              </button>
              <button
                onClick={() => setShowDeleteWarning(true)}
                className="px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center gap-1.5 text-sm"
                title="Supprimer"
                data-tour="pdl-delete-btn"
              >
                <Trash2 size={16} />
                <span>Supprimer</span>
              </button>
            </div>

            {/* Mobile: Show menu button */}
            <div className="md:hidden relative" ref={mobileMenuRef}>
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center justify-center"
                title="Actions"
                aria-label="Menu d'actions"
              >
                <MoreVertical size={20} />
              </button>

              {/* Mobile dropdown menu */}
              {showMobileMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                  <button
                    onClick={() => {
                      onViewDetails()
                      setShowMobileMenu(false)
                    }}
                    className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm text-left"
                  >
                    <Info size={16} className="flex-shrink-0" />
                    <span>Voir les détails</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowSyncWarning(true)
                      setShowMobileMenu(false)
                    }}
                    className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm text-blue-600 dark:text-blue-400 text-left"
                  >
                    <RefreshCw size={16} className="flex-shrink-0" />
                    <span>Synchroniser</span>
                  </button>
                  <button
                    onClick={() => {
                      toggleActiveMutation.mutate(!(pdl.is_active ?? true))
                      setShowMobileMenu(false)
                    }}
                    disabled={toggleActiveMutation.isPending}
                    className={`w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm text-left ${
                      pdl.is_active ?? true
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {pdl.is_active ?? true ? <EyeOff size={16} className="flex-shrink-0" /> : <Eye size={16} className="flex-shrink-0" />}
                    <span>{pdl.is_active ?? true ? 'Désactiver' : 'Activer'}</span>
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                  <button
                    onClick={() => {
                      setShowDeleteWarning(true)
                      setShowMobileMenu(false)
                    }}
                    className="w-full px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-sm text-red-600 dark:text-red-400 text-left"
                  >
                    <Trash2 size={16} className="flex-shrink-0" />
                    <span>Supprimer</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Second line: PDL number + Dates */}
        {pdl.name && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <p className="font-mono font-medium text-sm text-gray-600 dark:text-gray-400">{pdl.usage_point_id}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {pdl.oldest_available_data_date && (
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar size={12} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                  <span className="text-gray-600 dark:text-gray-400">
                    <span className="hidden sm:inline">Données depuis le </span>
                    <span className="sm:hidden">Données: </span>
                    {new Date(pdl.oldest_available_data_date).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )}
              {pdl.activation_date && (
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar size={12} className="text-green-500 dark:text-green-400 flex-shrink-0" />
                  <span className="text-gray-600 dark:text-gray-400">
                    <span className="hidden sm:inline">Activé le </span>
                    <span className="sm:hidden">Activé: </span>
                    {new Date(pdl.activation_date).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Calendar size={12} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">
                  <span className="hidden sm:inline">Ajouté le </span>
                  <span className="sm:hidden">Ajouté: </span>
                  {new Date(pdl.created_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>
          </div>
        )}
        {!pdl.name && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {pdl.oldest_available_data_date && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Calendar size={12} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">
                  <span className="hidden sm:inline">Données depuis le </span>
                  <span className="sm:hidden">Données: </span>
                  {new Date(pdl.oldest_available_data_date).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}
            {pdl.activation_date && (
              <div className="flex items-center gap-1 whitespace-nowrap">
                <Calendar size={12} className="text-green-500 dark:text-green-400 flex-shrink-0" />
                <span className="text-gray-600 dark:text-gray-400">
                  <span className="hidden sm:inline">Activé le </span>
                  <span className="sm:hidden">Activé: </span>
                  {new Date(pdl.activation_date).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Calendar size={12} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
              <span className="text-gray-600 dark:text-gray-400">
                <span className="hidden sm:inline">Ajouté le </span>
                <span className="sm:hidden">Ajouté: </span>
                {new Date(pdl.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Consent Error Warning */}
      {hasConsentError && (
        <div className="mt-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <X size={16} className="text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                Consentement invalide ou manquant
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                Le consentement pour ce point de livraison n'est pas valable ou a expiré. Il est nécessaire de faire un nouveau consentement pour accéder aux données Enedis.
              </p>
              <button
                onClick={() => getConsentUrlMutation.mutate()}
                disabled={getConsentUrlMutation.isPending}
                className="btn btn-primary text-sm flex items-center gap-2"
              >
                {getConsentUrlMutation.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Redirection...
                  </>
                ) : (
                  'Faire un consentement'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contract Info */}
      <div className={`space-y-2 text-sm ${hasConsentError ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* PDL Type - Consumption - Only show if no consent error */}
        {!hasConsentError && (
          <>
            {/* Consumption Section */}
            <div className="border border-blue-200 dark:border-blue-800/50 rounded-lg overflow-hidden">
              {/* Consumption Header */}
              <label className="flex items-center gap-3 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors" data-tour="pdl-consumption">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium">
                  <Zap size={18} className="text-blue-600 dark:text-blue-400" />
                  <span>Consommation</span>
                </div>
                <div className="flex-1"></div>
                <input
                  type="checkbox"
                  checked={pdl.has_consumption ?? true}
                  onChange={(e) =>
                    updateTypeMutation.mutate({
                      has_consumption: e.target.checked,
                      has_production: pdl.has_production ?? false,
                    })
                  }
                  disabled={updateTypeMutation.isPending}
                  className="w-5 h-5 flex-shrink-0 rounded-md border-2 border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800 checked:bg-blue-600 dark:checked:bg-blue-500 checked:border-blue-600 dark:checked:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>

              {/* Consumption Configuration - Only show if consumption is enabled */}
              {(pdl.has_consumption ?? true) && (
                <div className="px-3 py-2 space-y-2 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between" data-tour="pdl-power">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Zap size={16} />
                      <span>Puissance souscrite :</span>
                    </div>
                    <select
                      value={editedPower}
                      onChange={(e) => handlePowerChange(e.target.value)}
                      className="w-32 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border-2 border-blue-300 dark:border-blue-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 cursor-pointer transition-all shadow-sm hover:shadow"
                    >
                      <option value="">Sélectionner</option>
                      <option value="3">3 kVA</option>
                      <option value="6">6 kVA</option>
                      <option value="9">9 kVA</option>
                      <option value="12">12 kVA</option>
                      <option value="15">15 kVA</option>
                      <option value="18">18 kVA</option>
                      <option value="24">24 kVA</option>
                      <option value="30">30 kVA</option>
                      <option value="36">36 kVA</option>
                    </select>
                  </div>

                  {/* Offpeak Hours */}
                  <div className="space-y-3" data-tour="pdl-offpeak">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Clock size={16} />
                        <span>Heures creuses :</span>
                      </div>
                      <button
                        onClick={handleAddOffpeakRange}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-700 dark:hover:bg-emerald-800 rounded-lg shadow-sm hover:shadow transition-all duration-200"
                        title="Ajouter une plage horaire"
                      >
                        <Plus size={16} />
                        <span>Ajouter</span>
                      </button>
                    </div>

                    {/* Hour markers above timeline */}
                    <div className="relative h-4 mb-1">
                      <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                        <span>0h</span>
                        <span>6h</span>
                        <span>12h</span>
                        <span>18h</span>
                        <span>24h</span>
                      </div>
                    </div>

                    {/* Visual timeline */}
                    <div className="relative h-8 bg-gradient-to-r from-red-100 via-red-50 to-red-100 dark:from-red-800/40 dark:via-red-700/30 dark:to-red-800/40 rounded-lg border border-gray-300 dark:border-gray-600 overflow-visible mb-2"
                    >
                      {/* Hour grid lines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div
                            key={i}
                            className="flex-1 border-r border-gray-400/50 dark:border-gray-400/50 last:border-r-0"
                          />
                        ))}
                      </div>

                      {/* Off-peak ranges visualization */}
                      {offpeakRanges.map((range, index) => {
                        const startHour = parseInt(range.startHour) + parseInt(range.startMin) / 60
                        const endHour = parseInt(range.endHour) + parseInt(range.endMin) / 60

                        // Skip if no valid range
                        if (startHour === 0 && endHour === 0) return null

                        // Handle wrap-around (e.g., 22h to 6h crosses midnight)
                        if (endHour < startHour) {
                          // Split into two ranges: start to midnight, and midnight to end
                          return (
                            <>
                              {/* First part: from start to 24h */}
                              <div
                                key={`${index}-end`}
                                className="absolute inset-0 bg-emerald-500/70 dark:bg-emerald-500/70 border-l-2 border-r-2 border-emerald-700 dark:border-emerald-600 transition-all duration-300 flex items-center justify-center"
                                style={{
                                  left: `${(startHour / 24) * 100}%`,
                                  width: `${((24 - startHour) / 24) * 100}%`
                                }}
                                title={`Plage ${index + 1}: ${range.startHour}:${range.startMin} → 24:00 (suite à 00:00)`}
                              >
                                <span className="text-white font-bold text-xs drop-shadow-md pointer-events-none">
                                  {index + 1}
                                </span>
                              </div>
                              {/* Second part: from 0h to end */}
                              <div
                                key={`${index}-start`}
                                className="absolute inset-0 bg-emerald-500/70 dark:bg-emerald-500/70 border-l-2 border-r-2 border-emerald-700 dark:border-emerald-600 transition-all duration-300 flex items-center justify-center"
                                style={{
                                  left: '0%',
                                  width: `${(endHour / 24) * 100}%`
                                }}
                                title={`Plage ${index + 1}: 00:00 → ${range.endHour}:${range.endMin} (suite de ${range.startHour}:${range.startMin})`}
                              >
                                <span className="text-white font-bold text-xs drop-shadow-md pointer-events-none">
                                  {index + 1}
                                </span>
                              </div>
                            </>
                          )
                        }

                        // Normal case: no wrap-around
                        const left = (startHour / 24) * 100
                        const width = ((endHour - startHour) / 24) * 100

                        return (
                          <div
                            key={index}
                            className="absolute inset-0 bg-emerald-500/70 dark:bg-emerald-500/70 border-l-2 border-r-2 border-emerald-700 dark:border-emerald-600 transition-all duration-300 flex items-center justify-center"
                            style={{
                              left: `${Math.max(0, left)}%`,
                              width: `${Math.max(0, width)}%`
                            }}
                            title={`Plage ${index + 1}: ${range.startHour}:${range.startMin} → ${range.endHour}:${range.endMin}`}
                          >
                            <span className="text-white font-bold text-xs drop-shadow-md pointer-events-none">
                              {index + 1}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Time range cards */}
                    <div className="space-y-1.5">
                      {offpeakRanges.map((range, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-2 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-lg"
                        >
                          {/* Range number badge */}
                          <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-500 dark:bg-blue-600 text-white text-xs font-bold rounded-full">
                            {index + 1}
                          </div>

                          {/* Time inputs - full width */}
                          <div className="flex-1 flex items-center gap-3">
                            {/* Start time */}
                            <div className="flex-1 flex items-center gap-1.5">
                              <select
                                value={range.startHour}
                                onChange={(e) => handleOffpeakFieldChange(index, 'startHour', e.target.value)}
                                className="flex-1 px-2 py-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded text-sm font-semibold text-center text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={i.toString().padStart(2, '0')}>
                                    {i.toString().padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="text-gray-600 dark:text-gray-400 text-xs">h</span>
                              <span className="text-blue-600 dark:text-blue-400 font-bold">:</span>
                              <select
                                value={range.startMin}
                                onChange={(e) => handleOffpeakFieldChange(index, 'startMin', e.target.value)}
                                className="flex-1 px-2 py-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded text-sm font-semibold text-center text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {Array.from({ length: 60 }, (_, i) => (
                                  <option key={i} value={i.toString().padStart(2, '0')}>
                                    {i.toString().padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="text-gray-600 dark:text-gray-400 text-xs">min</span>
                            </div>

                            {/* Arrow separator */}
                            <span className="text-blue-600 dark:text-blue-400 font-bold flex-shrink-0">→</span>

                            {/* End time */}
                            <div className="flex-1 flex items-center gap-1.5">
                              <select
                                value={range.endHour}
                                onChange={(e) => handleOffpeakFieldChange(index, 'endHour', e.target.value)}
                                className="flex-1 px-2 py-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded text-sm font-semibold text-center text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {Array.from({ length: 24 }, (_, i) => (
                                  <option key={i} value={i.toString().padStart(2, '0')}>
                                    {i.toString().padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="text-gray-600 dark:text-gray-400 text-xs">h</span>
                              <span className="text-blue-600 dark:text-blue-400 font-bold">:</span>
                              <select
                                value={range.endMin}
                                onChange={(e) => handleOffpeakFieldChange(index, 'endMin', e.target.value)}
                                className="flex-1 px-2 py-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded text-sm font-semibold text-center text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {Array.from({ length: 60 }, (_, i) => (
                                  <option key={i} value={i.toString().padStart(2, '0')}>
                                    {i.toString().padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="text-gray-600 dark:text-gray-400 text-xs">min</span>
                            </div>
                          </div>

                          {/* Delete button */}
                          {offpeakRanges.length > 1 && (
                            <button
                              onClick={() => handleRemoveOffpeakRange(index)}
                              className="flex-shrink-0 p-1.5 text-white bg-red-500 hover:bg-red-600 dark:bg-red-700 dark:hover:bg-red-800 rounded transition-all"
                              title="Supprimer cette plage"
                            >
                              <Minus size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Production Section */}
        {!hasConsentError && (
          <div className="border border-green-200 dark:border-green-800/50 rounded-lg overflow-hidden">
            {/* Production Header */}
            <label className="flex items-center gap-3 py-2 px-3 bg-green-50 dark:bg-green-900/20 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors" data-tour="pdl-production">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium">
                <Factory size={18} className="text-green-600 dark:text-green-400" />
                <span>Production</span>
              </div>
              <div className="flex-1"></div>
              <input
                type="checkbox"
                checked={pdl.has_production ?? false}
                onChange={(e) =>
                  updateTypeMutation.mutate({
                    has_consumption: pdl.has_consumption ?? true,
                    has_production: e.target.checked,
                  })
                }
                disabled={updateTypeMutation.isPending}
                className="w-5 h-5 flex-shrink-0 rounded-md border-2 border-green-400 dark:border-green-500 bg-white dark:bg-gray-800 checked:bg-green-600 dark:checked:bg-green-500 checked:border-green-600 dark:checked:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>

            {/* Production Configuration - Link Production PDL - Only show for consumption-only PDLs (not production) */}
            {(pdl.has_consumption ?? true) && !(pdl.has_production ?? false) && (() => {
              const productionPdls = allPdls.filter(p => p.has_production && p.id !== pdl.id)

              return productionPdls.length > 0 ? (
                <div className="px-3 py-2 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Factory size={16} />
                      <span>PDL de production lié :</span>
                    </div>
                    <select
                      value={pdl.linked_production_pdl_id || ''}
                      onChange={(e) => linkProductionMutation.mutate(e.target.value || null)}
                      disabled={linkProductionMutation.isPending}
                      className="w-48 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border-2 border-green-300 dark:border-green-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-green-500 dark:focus:border-green-400 cursor-pointer transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Aucun</option>
                      {productionPdls.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || p.usage_point_id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null
            })()}
          </div>
        )}
      </div>


      {/* Error messages */}
      {fetchContractMutation.isError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          Erreur lors de la récupération depuis Enedis
        </div>
      )}
      {updateContractMutation.isError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          Erreur lors de la mise à jour du contrat
        </div>
      )}
      {updateNameMutation.isError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          Erreur lors de la mise à jour du nom
        </div>
      )}
      {updateTypeMutation.isError && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          Erreur lors de la mise à jour du type de PDL
        </div>
      )}

      {/* Sync Warning Modal */}
      {showSyncWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <RefreshCw size={20} className="text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Synchroniser avec Enedis ?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Cette action va récupérer les données depuis Enedis et <strong>écrasera toutes vos modifications locales</strong> (puissance souscrite, heures creuses, type de PDL).
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSyncWarning(false)}
                className="btn btn-secondary text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmSync}
                disabled={fetchContractMutation.isPending}
                className="btn btn-primary text-sm flex items-center gap-2"
              >
                {fetchContractMutation.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Synchronisation...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Confirmer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Warning Modal */}
      {showDeleteWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Trash2 size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Supprimer ce PDL ?
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Êtes-vous sûr de vouloir supprimer le PDL <strong>{pdl.name || pdl.usage_point_id}</strong> ? Cette action est <strong>irréversible</strong> et supprimera toutes les données associées.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteWarning(false)}
                className="btn btn-secondary text-sm"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowDeleteWarning(false)
                  onDelete()
                }}
                className="btn bg-red-600 hover:bg-red-700 text-white text-sm flex items-center gap-2"
              >
                <Trash2 size={16} />
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
