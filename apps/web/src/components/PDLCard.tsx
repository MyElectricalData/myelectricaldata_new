import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Trash2, RefreshCw, Edit2, Save, X, Zap, Clock, Factory, Plus, Minus, Eye, EyeOff } from 'lucide-react'
import { pdlApi } from '@/api/pdl'
import { oauthApi } from '@/api/oauth'
import type { PDL } from '@/types/api'

interface PDLCardProps {
  pdl: PDL
  onViewDetails: () => void
  onDelete: () => void
}

export default function PDLCard({ pdl, onViewDetails, onDelete }: PDLCardProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [showSyncWarning, setShowSyncWarning] = useState(false)
  const [showDeleteWarning, setShowDeleteWarning] = useState(false)
  const [hasConsentError, setHasConsentError] = useState(false)
  const [editedName, setEditedName] = useState(pdl.name || '')
  const [editedPower, setEditedPower] = useState(pdl.subscribed_power?.toString() || '')
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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

    // Legacy format: convert object to array
    const values = Object.values(pdl.offpeak_hours).filter(Boolean) as string[]
    return values.length > 0
      ? values.flatMap(parseAllRanges)
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
      // Legacy format: convert object to array
      const values = Object.values(pdl.offpeak_hours).filter(Boolean) as string[]
      const parsed = values.flatMap(parseAllRanges)
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


  const fetchContractMutation = useMutation({
    mutationFn: () => pdlApi.fetchContract(pdl.id),
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
    mutationFn: (data: { subscribed_power?: number; offpeak_hours?: string[] | Record<string, string> }) =>
      pdlApi.updateContract(pdl.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsSaving(false)
    },
    onError: () => {
      setIsSaving(false)
    },
  })

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => pdlApi.updateName(pdl.id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsEditingName(false)
    },
  })

  const updateTypeMutation = useMutation({
    mutationFn: ({ has_consumption, has_production }: { has_consumption: boolean; has_production: boolean }) =>
      pdlApi.updateType(pdl.id, has_consumption, has_production),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (is_active: boolean) => pdlApi.toggleActive(pdl.id, is_active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const getConsentUrlMutation = useMutation({
    mutationFn: () => oauthApi.getAuthorizeUrl(),
    onSuccess: (response) => {
      if (response.success && response.data) {
        window.location.href = response.data.authorize_url
      }
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
      setOffpeakRanges(offpeakRanges.filter((_, i) => i !== index))
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
    } ${fetchContractMutation.isPending ? 'opacity-50 pointer-events-none' : ''} ${
      !(pdl.is_active ?? true) ? 'opacity-60 bg-gray-100 dark:bg-gray-800' : ''
    }`}>
      {/* Loading overlay */}
      {fetchContractMutation.isPending && (
        <div className="absolute inset-0 bg-gray-500/10 dark:bg-gray-900/20 rounded-lg flex items-center justify-center z-10">
          <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm font-medium">Récupération en cours...</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {isEditingName ? (
            <div className="flex items-center gap-2 mb-2">
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
            <div className="flex items-center gap-2 mb-2">
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
          {pdl.name && (
            <p className="font-mono font-medium text-sm text-gray-600 dark:text-gray-400">{pdl.usage_point_id}</p>
          )}
          <p className="text-xs text-gray-500">
            Ajouté le {new Date(pdl.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {isSaving && (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <RefreshCw size={12} className="animate-spin" />
              Enregistrement...
            </span>
          )}
          <button
            onClick={onViewDetails}
            className="px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center gap-1.5 text-sm"
            title="Voir les détails"
          >
            <Info size={16} />
            <span className="hidden sm:inline">Détails</span>
          </button>
          <button
            onClick={() => setShowSyncWarning(true)}
            className="px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded flex items-center gap-1.5 text-sm font-medium"
            title="Synchroniser avec Enedis"
          >
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Sync</span>
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
          >
            {pdl.is_active ?? true ? <EyeOff size={16} /> : <Eye size={16} />}
            <span className="hidden sm:inline">{pdl.is_active ?? true ? 'Désactiver' : 'Activer'}</span>
          </button>
          <button
            onClick={() => setShowDeleteWarning(true)}
            className="px-3 py-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex items-center gap-1.5 text-sm"
            title="Supprimer"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">Supprimer</span>
          </button>
        </div>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Zap size={16} />
                <span>Consommation :</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
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
                  className="w-5 h-5 flex-shrink-0 text-primary-600 bg-white dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed accent-primary-600"
                />
                <span className="text-sm font-medium select-none w-8">
                  {pdl.has_consumption ?? true ? 'Oui' : 'Non'}
                </span>
              </label>
            </div>

            {/* Subscribed Power - Only show if consumption is enabled */}
            {(pdl.has_consumption ?? true) && (
              <div className="flex items-center justify-between pl-7">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Zap size={16} />
                  <span>Puissance souscrite :</span>
                </div>
                <select
                  value={editedPower}
                  onChange={(e) => handlePowerChange(e.target.value)}
                  className="input w-32 text-sm py-1"
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
            )}

            {/* Offpeak Hours - Only show if consumption is enabled */}
            {(pdl.has_consumption ?? true) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Clock size={16} />
                    <span>Heures creuses :</span>
                  </div>
                </div>
                {offpeakRanges.map((range, index) => (
                  <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Plage {index + 1}
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      {/* Time ranges */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        {/* Start time */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-12 sm:hidden">Début:</span>
                          <select
                            value={range.startHour}
                            onChange={(e) => handleOffpeakFieldChange(index, 'startHour', e.target.value)}
                            className="input text-xs sm:text-sm font-mono w-14 sm:w-16 py-1 px-1"
                          >
                            {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-gray-500 text-xs">:</span>
                          <select
                            value={range.startMin}
                            onChange={(e) => handleOffpeakFieldChange(index, 'startMin', e.target.value)}
                            className="input text-xs sm:text-sm font-mono w-14 sm:w-16 py-1 px-1"
                          >
                            {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>

                        <span className="text-gray-500 text-xs hidden sm:inline">→</span>

                        {/* End time */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-12 sm:hidden">Fin:</span>
                          <select
                            value={range.endHour}
                            onChange={(e) => handleOffpeakFieldChange(index, 'endHour', e.target.value)}
                            className="input text-xs sm:text-sm font-mono w-14 sm:w-16 py-1 px-1"
                          >
                            {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          <span className="text-gray-500 text-xs">:</span>
                          <select
                            value={range.endMin}
                            onChange={(e) => handleOffpeakFieldChange(index, 'endMin', e.target.value)}
                            className="input text-xs sm:text-sm font-mono w-14 sm:w-16 py-1 px-1"
                          >
                            {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0')).map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 w-[68px] justify-end">
                        {offpeakRanges.length > 1 && (
                          <button
                            onClick={() => handleRemoveOffpeakRange(index)}
                            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded flex-shrink-0"
                            title="Supprimer cette plage"
                          >
                            <Minus size={16} />
                          </button>
                        )}
                        {index === offpeakRanges.length - 1 && (
                          <button
                            onClick={handleAddOffpeakRange}
                            className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded flex-shrink-0"
                            title="Ajouter une plage"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* PDL Type - Production - Only show if no consent error */}
        {!hasConsentError && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Factory size={16} />
              <span>Production :</span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
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
                className="w-5 h-5 flex-shrink-0 text-primary-600 bg-white dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed accent-primary-600"
              />
              <span className="text-sm font-medium select-none w-8">
                {pdl.has_production ?? false ? 'Oui' : 'Non'}
              </span>
            </label>
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
