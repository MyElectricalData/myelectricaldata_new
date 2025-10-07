import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { pdlApi } from '@/api/pdl'
import { authApi } from '@/api/auth'
import { oauthApi } from '@/api/oauth'
import { ExternalLink, CheckCircle, XCircle, RefreshCw, Copy, ArrowUpDown, GripVertical, UserPlus } from 'lucide-react'
import PDLDetails from '@/components/PDLDetails'
import PDLCard from '@/components/PDLCard'
import { useAuth } from '@/hooks/useAuth'
import type { PDL } from '@/types/api'

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [copiedNewSecret, setCopiedNewSecret] = useState(false)
  const [copiedClientId, setCopiedClientId] = useState(false)
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [selectedPdl, setSelectedPdl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'name' | 'date' | 'id' | 'custom'>('custom')
  const [draggedPdl, setDraggedPdl] = useState<PDL | null>(null)
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

  const { data: credentialsResponse } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => authApi.getCredentials(),
  })

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

  const regenerateSecretMutation = useMutation({
    mutationFn: () => authApi.regenerateSecret(),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setNewSecret(response.data.client_secret)
        setNotification({
          type: 'success',
          message: 'Nouveau client_secret généré avec succès ! Copiez-le maintenant, il ne sera plus affiché.'
        })
        setShowRegenerateConfirm(false)
        queryClient.invalidateQueries({ queryKey: ['credentials'] })
        setTimeout(() => {
          setNotification(null)
          setNewSecret(null)
        }, 60000)
      }
    },
    onError: (error: any) => {
      setNotification({
        type: 'error',
        message: error?.message || 'Erreur lors de la régénération du secret'
      })
      setShowRegenerateConfirm(false)
      setTimeout(() => setNotification(null), 10000)
    }
  })

  const handleStartConsent = () => {
    getOAuthUrlMutation.mutate()
  }

  const handleRegenerateSecret = () => {
    regenerateSecretMutation.mutate()
  }

  const copyNewSecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret)
      setCopiedNewSecret(true)
      setTimeout(() => setCopiedNewSecret(false), 2000)
    }
  }

  const copyClientId = () => {
    if (credentials?.client_id) {
      navigator.clipboard.writeText(credentials.client_id)
      setCopiedClientId(true)
      setTimeout(() => setCopiedClientId(false), 2000)
    }
  }

  const credentials = credentialsResponse?.success ? credentialsResponse.data : null
  const pdls = pdlsResponse?.success && Array.isArray(pdlsResponse.data) ? pdlsResponse.data : []

  const sortedPdls = useMemo(() => {
    const pdlsCopy = [...pdls]

    switch (sortOrder) {
      case 'name':
        return pdlsCopy.sort((a, b) => {
          const nameA = (a.name || a.usage_point_id).toLowerCase()
          const nameB = (b.name || b.usage_point_id).toLowerCase()
          return nameA.localeCompare(nameB)
        })
      case 'id':
        return pdlsCopy.sort((a, b) => a.usage_point_id.localeCompare(b.usage_point_id))
      case 'date':
        return pdlsCopy.sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      case 'custom':
      default:
        // Already sorted by display_order from backend
        return pdlsCopy
    }
  }, [pdls, sortOrder])

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
          Gérez vos identifiants API et vos points de livraison
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
            <li>Utilisez vos identifiants API pour récupérer vos données</li>
          </ol>
        </div>
      )}

      {/* API Credentials */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Identifiants API</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Client ID</label>
            <div className="flex gap-2">
              <div className="input bg-gray-50 dark:bg-gray-900 font-mono text-sm break-all flex-1">
                {credentials?.client_id || 'Chargement...'}
              </div>
              <button
                onClick={copyClientId}
                className="btn btn-secondary flex-shrink-0"
                title="Copier le client_id"
                disabled={!credentials?.client_id}
              >
                {copiedClientId ? '✓' : <Copy size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Client Secret</label>
            <div className="space-y-3">
              {newSecret ? (
                <div className="space-y-3">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-green-800 dark:text-green-200 font-medium mb-2">
                      ✅ Nouveau client_secret généré !
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      Copiez-le maintenant, il ne sera plus jamais affiché.
                    </p>
                    <div className="flex gap-2">
                      <div className="input bg-white dark:bg-gray-900 font-mono text-sm flex-1 break-all">
                        {newSecret}
                      </div>
                      <button
                        onClick={copyNewSecret}
                        className="btn btn-secondary flex-shrink-0"
                        title="Copier"
                      >
                        {copiedNewSecret ? '✓' : <Copy size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {!showRegenerateConfirm ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          ⚠️ Le client_secret n'est jamais stocké ni affiché. Vous l'avez reçu lors de la création de votre compte.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowRegenerateConfirm(true)}
                        className="btn bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-2 justify-center whitespace-nowrap"
                      >
                        <RefreshCw size={18} />
                        Régénérer le client_secret
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200 font-medium mb-2">
                          ⚠️ Attention : Cette action est irréversible
                        </p>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          La régénération du client_secret va :
                        </p>
                        <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside mt-2">
                          <li>Invalider votre ancien client_secret</li>
                          <li>Supprimer toutes vos données en cache</li>
                        </ul>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-2 font-medium">
                          Le nouveau client_secret sera affiché une seule fois. Copiez-le immédiatement !
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleRegenerateSecret}
                          disabled={regenerateSecretMutation.isPending}
                          className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                        >
                          {regenerateSecretMutation.isPending ? 'Régénération...' : 'Confirmer la régénération'}
                        </button>
                        <button
                          onClick={() => setShowRegenerateConfirm(false)}
                          className="btn btn-secondary"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PDL Management */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">Points de livraison (PDL)</h2>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            {pdls.length > 1 && (
              <div className="flex items-center gap-2 text-sm flex-1 sm:flex-initial">
                <ArrowUpDown size={16} className="text-gray-500" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'name' | 'date' | 'id' | 'custom')}
                  className="input text-sm py-1 px-2 flex-1 sm:flex-initial"
                >
                  <option value="custom">Ordre personnalisé</option>
                  <option value="date">Date d'ajout</option>
                  <option value="name">Nom</option>
                  <option value="id">Numéro PDL</option>
                </select>
              </div>
            )}
            {user?.is_admin && (
              <Link
                to="/admin/add-pdl"
                className="btn bg-amber-600 hover:bg-amber-700 text-white text-sm flex items-center gap-1 whitespace-nowrap"
              >
                <UserPlus size={16} />
                Ajouter PDL (Admin)
              </Link>
            )}
            <button
              onClick={handleStartConsent}
              className="btn btn-primary text-sm flex items-center gap-1 whitespace-nowrap"
              disabled={getOAuthUrlMutation.isPending}
            >
              <ExternalLink size={16} />
              Consentement Enedis
            </button>
          </div>
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
                draggable={sortOrder === 'custom'}
                onDragStart={() => handleDragStart(pdl)}
                onDragOver={(e) => handleDragOver(e, pdl)}
                onDragEnd={handleDragEnd}
                className={`${sortOrder === 'custom' ? 'cursor-move' : ''} ${draggedPdl?.id === pdl.id ? 'opacity-50' : ''}`}
              >
                {sortOrder === 'custom' && (
                  <div className="flex items-center gap-2 mb-1 text-gray-400">
                    <GripVertical size={16} />
                    <span className="text-xs">Glissez pour réorganiser</span>
                  </div>
                )}
                <PDLCard
                  pdl={pdl}
                  onViewDetails={() => setSelectedPdl(pdl.usage_point_id)}
                  onDelete={() => deletePdlMutation.mutate(pdl.id)}
                />
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
