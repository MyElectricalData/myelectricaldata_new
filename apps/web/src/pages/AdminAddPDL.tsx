import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { pdlApi } from '@/api/pdl'
import { useAuth } from '@/hooks/useAuth'

export default function AdminAddPDL() {
  const [userEmail, setUserEmail] = useState('')
  const [usagePointId, setUsagePointId] = useState('')
  const [name, setName] = useState('')
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const { user } = useAuth()

  const addPdlMutation = useMutation({
    mutationFn: (data: { user_email: string; usage_point_id: string; name?: string }) =>
      pdlApi.adminAddPdl(data),
    onSuccess: (_, variables) => {
      const targetUser = variables.user_email === user?.email ? 'votre compte' : `l'utilisateur ${variables.user_email}`
      setNotification({ type: 'success', message: `PDL ajouté avec succès à ${targetUser}` })
      setUserEmail('')
      setUsagePointId('')
      setName('')
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de l\'ajout du PDL'
      setNotification({ type: 'error', message })
    },
  })

  const addToOwnAccountMutation = useMutation({
    mutationFn: (data: { usage_point_id: string; name?: string }) =>
      pdlApi.create(data),
    onSuccess: () => {
      setNotification({ type: 'success', message: 'PDL ajouté avec succès à votre compte' })
      setUserEmail('')
      setUsagePointId('')
      setName('')
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de l\'ajout du PDL'
      setNotification({ type: 'error', message })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!usagePointId) {
      setNotification({ type: 'error', message: 'Le numéro PDL est requis' })
      return
    }

    if (usagePointId.length !== 14 || !/^\d{14}$/.test(usagePointId)) {
      setNotification({ type: 'error', message: 'Le PDL doit contenir exactement 14 chiffres' })
      return
    }

    // If no email provided, add to own account using normal endpoint
    if (!userEmail || userEmail.trim() === '') {
      addToOwnAccountMutation.mutate({
        usage_point_id: usagePointId,
        name: name || undefined,
      })
    } else {
      // Add to specified user account using admin endpoint
      addPdlMutation.mutate({
        user_email: userEmail,
        usage_point_id: usagePointId,
        name: name || undefined,
      })
    }
  }

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
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
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Activity className="text-amber-600 dark:text-amber-400" size={32} />
          Ajouter un PDL à un utilisateur
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Fonction d'administration : ajouter un PDL à n'importe quel utilisateur sans consentement
        </p>
      </div>

      {/* Warning */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
              ⚠️ Accès administrateur uniquement
            </h3>
            <p className="mt-1 text-sm text-orange-700 dark:text-orange-300">
              Cette fonctionnalité permet d'ajouter un PDL à n'importe quel utilisateur sans son consentement.
              À utiliser uniquement à des fins administratives légitimes.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="userEmail" className="block text-sm font-medium mb-2">
              Email de l'utilisateur cible (optionnel)
            </label>
            <input
              type="email"
              id="userEmail"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="utilisateur@example.com (laisser vide pour votre compte)"
              className="input w-full"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Laissez vide pour ajouter le PDL à votre propre compte, ou saisissez l'email d'un utilisateur
            </p>
          </div>

          <div>
            <label htmlFor="usagePointId" className="block text-sm font-medium mb-2">
              Numéro PDL (14 chiffres) *
            </label>
            <input
              type="text"
              id="usagePointId"
              value={usagePointId}
              onChange={(e) => setUsagePointId(e.target.value.replace(/\D/g, '').slice(0, 14))}
              placeholder="00000000000000"
              maxLength={14}
              className="input w-full font-mono"
              required
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Point de Livraison (14 chiffres)
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Nom personnalisé (optionnel)
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maison principale, Appartement, etc."
              maxLength={100}
              className="input w-full"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Un nom personnalisé pour identifier ce PDL
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={addPdlMutation.isPending || addToOwnAccountMutation.isPending}
              className="btn-primary flex-1"
            >
              {(addPdlMutation.isPending || addToOwnAccountMutation.isPending) ? 'Ajout en cours...' : 'Ajouter le PDL'}
            </button>
          </div>
        </form>
      </div>

      {/* Info Section */}
      <div className="card bg-blue-50 dark:bg-blue-900/20">
        <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
          ℹ️ Informations
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
          <li><strong>Sans email :</strong> Le PDL sera ajouté à votre propre compte</li>
          <li><strong>Avec email :</strong> Le PDL sera ajouté au compte de l'utilisateur spécifié (sans son consentement)</li>
          <li>Le PDL sera immédiatement visible dans le compte ciblé</li>
          <li>L'utilisateur pourra ensuite lier son compte Enedis normalement</li>
          <li>Seuls les administrateurs peuvent accéder à cette fonctionnalité</li>
        </ul>
      </div>
    </div>
  )
}
