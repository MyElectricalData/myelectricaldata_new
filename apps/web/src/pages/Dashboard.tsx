import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { pdlApi } from '@/api/pdl'
import { oauthApi } from '@/api/oauth'
import { ExternalLink, CheckCircle, XCircle, ArrowUpDown, GripVertical, UserPlus, Filter } from 'lucide-react'
import PDLDetails from '@/components/PDLDetails'
import PDLCard from '@/components/PDLCard'
import { useAuth } from '@/hooks/useAuth'
import type { PDL } from '@/types/api'

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [selectedPdl, setSelectedPdl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'name' | 'date' | 'id' | 'custom'>('custom')
  const [draggedPdl, setDraggedPdl] = useState<PDL | null>(null)
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(false)
  const [showInactive, setShowInactive] = useState(true)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Check for consent callback parameters
  useEffect(() => {
    const consentSuccess = searchParams.get('consent_success')
    const consentError = searchParams.get('consent_error')
    const pdlCount = searchParams.get('pdl_count')
    const createdCount = searchParams.get('created_count')

    if (consentSuccess === 'true') {
      const total = pdlCount ? parseInt(pdlCount) : 0
      const created = createdCount ? parseInt(createdCount) : 0

      let message = 'Bravo ! Votre consentement s\'est effectué sans souci.'
      if (total > 0) {
        message = `Bravo ! ${total} point${total > 1 ? 's' : ''} de livraison détecté${total > 1 ? 's' : ''}`
        if (created > 0) {
          message += ` (${created} nouveau${created > 1 ? 'x' : ''})`
        }
        message += '.'
      }

      setNotification({
        type: 'success',
        message
      })
      // Clear params after showing notification
      setSearchParams({})
      // Refresh PDL list
      queryClient.invalidateQueries({ queryKey: ['pdls'] })

      // Auto-hide after 10 seconds
      setTimeout(() => setNotification(null), 10000)
    } else if (consentError) {
      setNotification({
        type: 'error',
        message: `Erreur lors du consentement : ${consentError}`
      })
      setSearchParams({})

      // Auto-hide after 10 seconds
      setTimeout(() => setNotification(null), 10000)
    }
  }, [searchParams, setSearchParams, queryClient])

  const { data: pdlsResponse, isLoading: pdlsLoading } = useQuery({
    queryKey: ['pdls'],
    queryFn: () => pdlApi.list(),
  })

  const deletePdlMutation = useMutation({
    mutationFn: (id: string) => pdlApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const reorderPdlsMutation = useMutation({
    mutationFn: (orders: Array<{ id: string; order: number }>) => pdlApi.reorderPdls(orders),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
  })

  const getOAuthUrlMutation = useMutation({
    mutationFn: () => oauthApi.getAuthorizeUrl(),
    onSuccess: (response) => {
      if (response.success && response.data) {
        window.location.href = response.data.authorize_url
      }
    },
  })

  const handleStartConsent = () => {
    getOAuthUrlMutation.mutate()
  }

  const pdls = pdlsResponse?.success && Array.isArray(pdlsResponse.data) ? pdlsResponse.data : []

  const activePdlsCount = pdls.filter(pdl => pdl.is_active ?? true).length
  const inactivePdlsCount = pdls.length - activePdlsCount

  const sortedPdls = useMemo(() => {
    // Filter by active status first
    let filteredPdls = showInactive ? [...pdls] : pdls.filter(pdl => pdl.is_active ?? true)

    switch (sortOrder) {
      case 'name':
        return filteredPdls.sort((a, b) => {
          const nameA = (a.name || a.usage_point_id).toLowerCase()
          const nameB = (b.name || b.usage_point_id).toLowerCase()
          return nameA.localeCompare(nameB)
        })
      case 'id':
        return filteredPdls.sort((a, b) => a.usage_point_id.localeCompare(b.usage_point_id))
      case 'date':
        return filteredPdls.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      case 'custom':
      default:
        // Already sorted by display_order from backend
        return filteredPdls
    }
  }, [pdls, sortOrder, showInactive])

  const handleDragStart = (pdl: PDL) => {
    setDraggedPdl(pdl)
  }

  const handleDragOver = (e: React.DragEvent, targetPdl: PDL) => {
    e.preventDefault()
    if (!draggedPdl || draggedPdl.id === targetPdl.id) return

    const draggedIndex = sortedPdls.findIndex(p => p.id === draggedPdl.id)
    const targetIndex = sortedPdls.findIndex(p => p.id === targetPdl.id)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newPdls = [...sortedPdls]
    newPdls.splice(draggedIndex, 1)
    newPdls.splice(targetIndex, 0, draggedPdl)

    // Update display order
    const orders = newPdls.map((pdl, index) => ({
      id: pdl.id,
      order: index
    }))

    reorderPdlsMutation.mutate(orders)
  }

  const handleDragEnd = () => {
    setDraggedPdl(null)
  }

  return (
    <div className="space-y-8">
      {/* Notification Toast */}
      {notification && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          notification.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={24} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={24} />
          )}
          <div className="flex-1">
            <p className={notification.type === 'success'
              ? 'text-green-800 dark:text-green-200 font-medium'
              : 'text-red-800 dark:text-red-200 font-medium'
            }>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold mb-2">Tableau de bord</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez vos points de livraison
        </p>
      </div>

      {/* Info Section */}
      {pdls.length === 0 && (
        <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold mb-2">ℹ️ Prochaines étapes</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Cliquez sur "Consentement Enedis" pour autoriser l'accès à vos données</li>
            <li>Vos points de livraison seront automatiquement détectés et ajoutés</li>
            <li>Cliquez sur "Détails" pour voir le contrat et l'adresse de chaque PDL</li>
            <li>Consultez vos identifiants API dans la section "Mon compte"</li>
          </ol>
        </div>
      )}

      {/* PDL Management */}
      <div className="card">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Points de livraison (PDL)</h2>
              {pdls.length > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {activePdlsCount} actif{activePdlsCount > 1 ? 's' : ''}
                  {inactivePdlsCount > 0 && ` • ${inactivePdlsCount} désactivé${inactivePdlsCount > 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {user?.is_admin && (
                <Link
                  to="/admin/add-pdl"
                  className="btn bg-amber-600 hover:bg-amber-700 text-white text-sm flex items-center justify-center gap-1 w-full sm:w-auto whitespace-nowrap"
                >
                  <UserPlus size={16} />
                  Ajouter PDL (Admin)
                </Link>
              )}
              <button
                onClick={handleStartConsent}
                className="btn btn-primary text-sm flex items-center justify-center gap-1 w-full sm:w-auto whitespace-nowrap"
                disabled={getOAuthUrlMutation.isPending}
              >
                <ExternalLink size={16} />
                Consentement Enedis
              </button>
            </div>
          </div>
          {pdls.length > 1 && (
            <div className="flex items-center justify-end gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-500" />
                <label className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="w-4 h-4 text-primary-600 bg-white dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 accent-primary-600"
                  />
                  <span className="text-sm select-none">Afficher les PDL désactivés</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown size={16} className="text-gray-500" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'name' | 'date' | 'id' | 'custom')}
                  className="input text-sm py-1 px-2 w-auto"
                >
                  <option value="custom">Ordre personnalisé</option>
                  <option value="date">Date d'ajout</option>
                  <option value="name">Nom</option>
                  <option value="id">Numéro PDL</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {pdlsLoading ? (
          <p className="text-gray-500">Chargement...</p>
        ) : pdls.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              Aucun point de livraison détecté
            </p>
            <p className="text-sm text-gray-400">
              Cliquez sur "Consentement Enedis" pour autoriser l'accès et détecter automatiquement vos PDL
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedPdls.map((pdl) => (
              <div
                key={pdl.id}
                draggable={sortOrder === 'custom' && isDraggingEnabled}
                onDragStart={() => handleDragStart(pdl)}
                onDragOver={(e) => handleDragOver(e, pdl)}
                onDragEnd={() => {
                  handleDragEnd()
                  setIsDraggingEnabled(false)
                }}
                className={`${draggedPdl?.id === pdl.id ? 'opacity-50' : ''}`}
              >
                {sortOrder === 'custom' && (
                  <div
                    className="flex items-center gap-2 mb-1 text-gray-400 cursor-move hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    onMouseDown={() => setIsDraggingEnabled(true)}
                    onMouseUp={() => setIsDraggingEnabled(false)}
                  >
                    <GripVertical size={16} />
                    <span className="text-xs select-none">Glissez pour réorganiser</span>
                  </div>
                )}
                <div className="select-text">
                  <PDLCard
                    pdl={pdl}
                    onViewDetails={() => setSelectedPdl(pdl.usage_point_id)}
                    onDelete={() => deletePdlMutation.mutate(pdl.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDL Details Modal */}
      {selectedPdl && (
        <PDLDetails
          usagePointId={selectedPdl}
          onClose={() => setSelectedPdl(null)}
        />
      )}
    </div>
  )
}
