import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info, Trash2, RefreshCw, Edit2, Save, X, Zap, Clock } from 'lucide-react'
import { pdlApi } from '@/api/pdl'
import type { PDL } from '@/types/api'

interface PDLCardProps {
  pdl: PDL
  onViewDetails: () => void
  onDelete: () => void
}

export default function PDLCard({ pdl, onViewDetails, onDelete }: PDLCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(pdl.name || '')
  const [editedPower, setEditedPower] = useState(pdl.subscribed_power?.toString() || '')
  const [editedOffpeak, setEditedOffpeak] = useState(
    pdl.offpeak_hours ? JSON.stringify(pdl.offpeak_hours, null, 2) : ''
  )
  const queryClient = useQueryClient()

  const fetchContractMutation = useMutation({
    mutationFn: () => pdlApi.fetchContract(pdl.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const updateContractMutation = useMutation({
    mutationFn: (data: { subscribed_power?: number; offpeak_hours?: Record<string, string> }) =>
      pdlApi.updateContract(pdl.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsEditing(false)
    },
  })

  const updateNameMutation = useMutation({
    mutationFn: (name: string) => pdlApi.updateName(pdl.id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      setIsEditingName(false)
    },
  })

  const handleSave = () => {
    const data: { subscribed_power?: number; offpeak_hours?: Record<string, string> } = {}

    if (editedPower) {
      data.subscribed_power = parseInt(editedPower)
    }

    if (editedOffpeak) {
      try {
        data.offpeak_hours = JSON.parse(editedOffpeak)
      } catch (e) {
        alert('Format JSON invalide pour les heures creuses')
        return
      }
    }

    updateContractMutation.mutate(data)
  }

  const handleCancel = () => {
    setEditedPower(pdl.subscribed_power?.toString() || '')
    setEditedOffpeak(pdl.offpeak_hours ? JSON.stringify(pdl.offpeak_hours, null, 2) : '')
    setIsEditing(false)
  }

  const handleSaveName = () => {
    updateNameMutation.mutate(editedName)
  }

  const handleCancelName = () => {
    setEditedName(pdl.name || '')
    setIsEditingName(false)
  }

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
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
        <div className="flex gap-2">
          <button
            onClick={onViewDetails}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Voir les détails"
          >
            <Info size={18} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded"
            title="Supprimer"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Contract Info */}
      <div className="space-y-2 text-sm">
        {/* Subscribed Power */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Zap size={16} />
            <span>Puissance souscrite :</span>
          </div>
          {isEditing ? (
            <input
              type="number"
              value={editedPower}
              onChange={(e) => setEditedPower(e.target.value)}
              className="input w-24 text-sm py-1"
              placeholder="kVA"
            />
          ) : (
            <span className="font-medium">
              {pdl.subscribed_power ? `${pdl.subscribed_power} kVA` : 'Non renseigné'}
            </span>
          )}
        </div>

        {/* Offpeak Hours */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock size={16} />
            <span>Heures creuses :</span>
          </div>
          {isEditing ? (
            <textarea
              value={editedOffpeak}
              onChange={(e) => setEditedOffpeak(e.target.value)}
              className="input text-xs font-mono w-48 h-20 py-1"
              placeholder='{"lundi": "22:00-06:00"}'
            />
          ) : pdl.offpeak_hours ? (
            <div className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded max-w-xs">
              {Object.entries(pdl.offpeak_hours).map(([day, hours]) => (
                <div key={day}>
                  {day}: {hours}
                </div>
              ))}
            </div>
          ) : (
            <span className="font-medium">Non renseigné</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              disabled={updateContractMutation.isPending}
              className="btn btn-primary text-sm flex items-center gap-1 flex-1"
            >
              <Save size={16} />
              Enregistrer
            </button>
            <button
              onClick={handleCancel}
              className="btn btn-secondary text-sm flex items-center gap-1"
            >
              <X size={16} />
              Annuler
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-secondary text-sm flex items-center gap-1 flex-1"
            >
              <Edit2 size={16} />
              Modifier
            </button>
            <button
              onClick={() => fetchContractMutation.mutate()}
              disabled={fetchContractMutation.isPending}
              className="btn btn-secondary text-sm flex items-center gap-1 flex-1"
              title="Récupérer depuis Enedis"
            >
              <RefreshCw size={16} className={fetchContractMutation.isPending ? 'animate-spin' : ''} />
              Enedis
            </button>
          </>
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
    </div>
  )
}
