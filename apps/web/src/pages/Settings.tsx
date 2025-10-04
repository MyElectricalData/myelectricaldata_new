import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { Trash2, TrendingUp } from 'lucide-react'

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const { data: usageStatsResponse } = useQuery({
    queryKey: ['usage-stats'],
    queryFn: () => authApi.getUsageStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const usageStats = usageStatsResponse?.success ? usageStatsResponse.data as any : null

  const deleteAccountMutation = useMutation({
    mutationFn: () => authApi.deleteAccount(),
    onSuccess: () => {
      logout()
      navigate('/')
    },
  })

  const handleDeleteAccount = () => {
    if (deleteConfirmText === 'SUPPRIMER') {
      deleteAccountMutation.mutate()
    }
  }

  return (
    <div className="space-y-8 w-full">
      <div>
        <h1 className="text-3xl font-bold mb-2">Mon compte</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gérez votre compte et vos préférences
        </p>
      </div>

      {/* Account Info */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Informations du compte</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <div className="input bg-gray-50 dark:bg-gray-900">
              {user?.email}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">ID utilisateur</label>
            <div className="input bg-gray-50 dark:bg-gray-900 font-mono text-sm">
              {user?.id}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Statut</label>
            <div className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm">
              ● Actif
            </div>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="card border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-blue-600 dark:text-blue-400" size={24} />
          <h2 className="text-xl font-semibold">Utilisation de l'API</h2>
        </div>
        {usageStats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1">Avec cache</p>
                <p className="text-2xl font-bold">
                  {usageStats.cached_requests} / {usageStats.cached_limit}
                </p>
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min((usageStats.cached_requests / usageStats.cached_limit) * 100, 100)}%`
                    }}
                  ></div>
                </div>
              </div>
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <p className="text-sm text-orange-600 dark:text-orange-400 font-medium mb-1">Sans cache</p>
                <p className="text-2xl font-bold">
                  {usageStats.no_cache_requests} / {usageStats.no_cache_limit}
                </p>
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-orange-600 h-2 rounded-full"
                    style={{
                      width: `${Math.min((usageStats.no_cache_requests / usageStats.no_cache_limit) * 100, 100)}%`
                    }}
                  ></div>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Compteurs quotidiens • Réinitialisés à minuit UTC • Date : {usageStats.date}
            </p>
          </div>
        ) : (
          <p className="text-gray-500">Chargement des statistiques...</p>
        )}
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200 dark:border-red-800">
        <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">
          Zone dangereuse
        </h2>

        {!showDeleteConfirm ? (
          <div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              La suppression de votre compte est irréversible. Toutes vos données, PDL et cache seront définitivement supprimés.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
            >
              <Trash2 size={20} />
              Supprimer mon compte
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-800 dark:text-red-200 font-medium mb-2">
                ⚠️ Attention : Cette action est irréversible
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Toutes vos données seront définitivement supprimées :
              </p>
              <ul className="text-sm text-red-700 dark:text-red-300 list-disc list-inside mt-2">
                <li>Votre compte et vos identifiants API</li>
                <li>Tous vos points de livraison (PDL)</li>
                <li>Tous les tokens OAuth Enedis</li>
                <li>Toutes les données en cache</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Tapez <span className="font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">SUPPRIMER</span> pour confirmer
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="SUPPRIMER"
                className="input mb-4"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'SUPPRIMER' || deleteAccountMutation.isPending}
                className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {deleteAccountMutation.isPending ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false)
                  setDeleteConfirmText('')
                }}
                className="btn btn-secondary"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
