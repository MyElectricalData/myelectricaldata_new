import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from '@/stores/notificationStore'
import { authApi } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { useThemeStore } from '@/stores/themeStore'
import { useIsDemo } from '@/hooks/useIsDemo'
import { Trash2, TrendingUp, Copy, RefreshCw, Key, Lock, LogOut, Palette, Eye, EyeOff, Share2, Calendar } from 'lucide-react'
import {
  useDatePreferencesStore,
  getDateRangeFromPreset,
  DATE_PRESET_LABELS,
  DATE_PRESET_DESCRIPTIONS,
  MONTH_LABELS,
  type DatePreset
} from '@/stores/datePreferencesStore'

export default function Settings() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { mode, setMode } = useThemeStore()
  const { preset, customDate, setPreset, setCustomDate } = useDatePreferencesStore()
  const isDemo = useIsDemo()

  // State for password change
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // State for other features
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [copiedNewSecret, setCopiedNewSecret] = useState(false)
  const [copiedClientId, setCopiedClientId] = useState(false)
  const [showSharingConfirm, setShowSharingConfirm] = useState(false)

  const { data: credentialsResponse } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => authApi.getCredentials(),
  })

  const { data: usageStatsResponse } = useQuery({
    queryKey: ['usage-stats'],
    queryFn: () => authApi.getUsageStats(),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const credentials = credentialsResponse?.success ? credentialsResponse.data : null
  const usageStats = usageStatsResponse?.success ? usageStatsResponse.data as any : null

  const changePasswordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      authApi.changePassword(oldPassword, newPassword),
    onSuccess: (response) => {
      if (response.success) {
        toast.success('Mot de passe modifié avec succès !')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || 'Erreur lors du changement de mot de passe')
    }
  })

  const regenerateSecretMutation = useMutation({
    mutationFn: () => authApi.regenerateSecret(),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setNewSecret(response.data.client_secret)
        toast.success('Nouveau client_secret généré avec succès ! Copiez-le maintenant, il ne sera plus affiché.', {
          duration: 60000
        })
        setShowRegenerateConfirm(false)
        queryClient.invalidateQueries({ queryKey: ['credentials'] })
        setTimeout(() => {
          setNewSecret(null)
        }, 60000)
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Erreur lors de la régénération du secret')
      setShowRegenerateConfirm(false)
    }
  })

  const deleteAccountMutation = useMutation({
    mutationFn: () => authApi.deleteAccount(),
    onSuccess: () => {
      logout()
      navigate('/')
    },
  })

  const toggleSharingMutation = useMutation({
    mutationFn: () => authApi.toggleAdminSharing(),
    onSuccess: (response) => {
      if (response.success && response.data) {
        const action = response.data.admin_data_sharing ? 'activé' : 'désactivé'
        toast.success(`Partage avec les administrateurs ${action}`)
        queryClient.invalidateQueries({ queryKey: ['user'] })
        setShowSharingConfirm(false)
      }
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error?.message || 'Erreur lors du changement de partage')
      setShowSharingConfirm(false)
    }
  })

  const handleChangePassword = () => {
    if (isDemo) {
      toast.error('Modification du mot de passe désactivée en mode démo')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }

    if (newPassword.length < 8) {
      toast.error('Le mot de passe doit contenir au moins 8 caractères')
      return
    }

    changePasswordMutation.mutate({ oldPassword, newPassword })
  }

  const handleRegenerateSecret = () => {
    if (isDemo) {
      toast.error('Régénération du client_secret désactivée en mode démo')
      return
    }
    regenerateSecretMutation.mutate()
  }

  const handleDeleteAccount = () => {
    if (isDemo) {
      toast.error('Suppression du compte désactivée en mode démo')
      return
    }
    if (deleteConfirmText === 'SUPPRIMER') {
      deleteAccountMutation.mutate()
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { state: { from: location.pathname } })
  }

  const copyNewSecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret)
      setCopiedNewSecret(true)
      toast.success('Client secret copié dans le presse-papier !')
      setTimeout(() => setCopiedNewSecret(false), 2000)
    }
  }

  const copyClientId = () => {
    if (credentials?.client_id) {
      navigator.clipboard.writeText(credentials.client_id)
      setCopiedClientId(true)
      toast.success('Client ID copié dans le presse-papier !')
      setTimeout(() => setCopiedClientId(false), 2000)
    }
  }


  return (
    <div className="space-y-8 w-full">
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

      {/* API Credentials */}
      <div className="card border-primary-200 dark:border-primary-800">
        <div className="flex items-center gap-2 mb-4">
          <Key className="text-primary-600 dark:text-primary-400" size={24} />
          <h2 className="text-xl font-semibold">Identifiants API</h2>
        </div>
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
                    <div className="space-y-3">
                      {isDemo && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            <strong>Mode Démo :</strong> La régénération du client_secret est désactivée pour le compte de démonstration.
                          </p>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200">
                            ⚠️ Le client_secret n'est jamais stocké ni affiché. Vous l'avez reçu lors de la création de votre compte.
                          </p>
                        </div>
                        <button
                          onClick={() => setShowRegenerateConfirm(true)}
                          className="btn bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-2 justify-center whitespace-nowrap disabled:opacity-50"
                          disabled={isDemo}
                        >
                          <RefreshCw size={18} />
                          Régénérer le client_secret
                        </button>
                      </div>
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

      {/* Change Password */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="text-primary-600 dark:text-primary-400" size={24} />
          <h2 className="text-xl font-semibold">Modifier le mot de passe</h2>
        </div>
        {isDemo && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Mode Démo :</strong> La modification du mot de passe est désactivée pour le compte de démonstration.
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Mot de passe actuel</label>
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
                disabled={isDemo}
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showOldPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
                disabled={isDemo}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Confirmer le nouveau mot de passe</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
                disabled={isDemo}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={isDemo || !oldPassword || !newPassword || !confirmPassword || changePasswordMutation.isPending}
            className="btn btn-primary disabled:opacity-50"
          >
            {changePasswordMutation.isPending ? 'Modification...' : 'Modifier le mot de passe'}
          </button>
        </div>
      </div>

      {/* Theme Selector */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="text-primary-600 dark:text-primary-400" size={24} />
          <h2 className="text-xl font-semibold">Thème</h2>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choisissez l'apparence de l'interface
          </p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setMode('light')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                mode === 'light'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">☀️</div>
                <div className="text-sm font-medium">Clair</div>
              </div>
            </button>
            <button
              onClick={() => setMode('dark')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                mode === 'dark'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">🌙</div>
                <div className="text-sm font-medium">Sombre</div>
              </div>
            </button>
            <button
              onClick={() => setMode('system')}
              className={`p-4 rounded-lg border-2 transition-colors ${
                mode === 'system'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
              }`}
            >
              <div className="text-center">
                <div className="text-2xl mb-2">💻</div>
                <div className="text-sm font-medium">Système</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Default Date Range */}
      <div className="card border-teal-200 dark:border-teal-800">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="text-teal-600 dark:text-teal-400" size={24} />
          <h2 className="text-xl font-semibold">Période d'analyse</h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choisissez la période de référence pour l'affichage de vos données de consommation et production.
          </p>

          {/* Preset Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['tempo', 'rolling', 'calendar', 'custom'] as DatePreset[]).map((presetKey) => (
              <button
                key={presetKey}
                onClick={() => setPreset(presetKey)}
                className={`p-4 rounded-lg border-2 transition-colors text-left ${
                  preset === presetKey
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-700'
                }`}
              >
                <div className="font-medium text-sm mb-1">{DATE_PRESET_LABELS[presetKey]}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {DATE_PRESET_DESCRIPTIONS[presetKey]}
                </div>
              </button>
            ))}
          </div>

          {/* Custom Date Selection - Only visible when custom preset is selected */}
          {preset === 'custom' && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Date de début personnalisée :
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Jour :</label>
                  <select
                    value={customDate.day}
                    onChange={(e) => setCustomDate({ ...customDate, day: parseInt(e.target.value) })}
                    className="input w-20"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Mois :</label>
                  <select
                    value={customDate.month}
                    onChange={(e) => setCustomDate({ ...customDate, month: parseInt(e.target.value) })}
                    className="input w-40"
                  >
                    {MONTH_LABELS.map((label, index) => (
                      <option key={index + 1} value={index + 1}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Preview of current selection */}
          <div className="p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg">
            <p className="text-sm text-teal-800 dark:text-teal-200 mb-2">
              <strong>Aperçu de la plage actuelle :</strong>
            </p>
            {(() => {
              const { start, end } = getDateRangeFromPreset(preset, customDate)
              const formatDisplayDate = (dateStr: string) => {
                const date = new Date(dateStr + 'T12:00:00')
                return date.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })
              }
              return (
                <>
                  <p className="text-sm text-teal-700 dark:text-teal-300 mb-3">
                    Du <span className="font-semibold">{formatDisplayDate(start)}</span> au{' '}
                    <span className="font-semibold">{formatDisplayDate(end)}</span>
                  </p>
                  {preset === 'tempo' && (
                    <p className="text-xs text-teal-600 dark:text-teal-400 border-t border-teal-200 dark:border-teal-700 pt-3">
                      💡 <strong>Période recommandée pour le simulateur</strong> : l'Année Tempo (1er septembre → 31 août) est idéale pour comparer les offres tarifaires, car elle correspond à la saison Tempo complète avec ses 22 jours Rouge. Cela permet une comparaison précise des offres EJP, Tempo et autres tarifs saisonniers.
                    </p>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Admin Data Sharing */}
      <div className="card border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="text-purple-600 dark:text-purple-400" size={24} />
          <h2 className="text-xl font-semibold">Partage avec les administrateurs</h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Autorisez les administrateurs à accéder à vos données de consommation pour faciliter le débogage et le support technique.
          </p>

          {isDemo && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Mode Démo :</strong> Le partage des données est désactivé pour le compte de démonstration.
              </p>
            </div>
          )}

          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <p className="text-sm text-purple-800 dark:text-purple-200 mb-2">
              <strong>Données partagées :</strong>
            </p>
            <ul className="text-sm text-purple-700 dark:text-purple-300 list-disc list-inside space-y-1">
              <li>Vos points de livraison (PDL)</li>
              <li>Les données de consommation en cache</li>
              <li>Les données de production en cache</li>
              <li>Les informations de contrat</li>
            </ul>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                user?.admin_data_sharing
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
              }`}>
                {user?.admin_data_sharing ? '● Partage actif' : '○ Partage désactivé'}
              </span>
              {user?.admin_data_sharing_enabled_at && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Activé le {new Date(user.admin_data_sharing_enabled_at).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>

            {!showSharingConfirm ? (
              <button
                onClick={() => setShowSharingConfirm(true)}
                disabled={isDemo}
                className={`btn ${user?.admin_data_sharing
                  ? 'btn-secondary'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
                } disabled:opacity-50`}
              >
                {user?.admin_data_sharing ? 'Revoquer le partage' : 'Activer le partage'}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => toggleSharingMutation.mutate()}
                  disabled={toggleSharingMutation.isPending}
                  className={`btn ${user?.admin_data_sharing
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                  } text-white disabled:opacity-50`}
                >
                  {toggleSharingMutation.isPending ? 'En cours...' : 'Confirmer'}
                </button>
                <button
                  onClick={() => setShowSharingConfirm(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Session Security Info */}
      <div className="card border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 mb-4">
          <Key className="text-green-600 dark:text-green-400" size={24} />
          <h2 className="text-xl font-semibold">Sécurité de session</h2>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200 mb-2">
            🔒 Votre session est protégée par un cookie httpOnly sécurisé
          </p>
          <ul className="text-sm text-green-700 dark:text-green-300 list-disc list-inside space-y-1">
            <li>Le token de session n'est pas accessible par JavaScript (protection XSS)</li>
            <li>Durée de validité : 30 jours</li>
            <li>Pour l'API, utilisez vos identifiants client_id / client_secret</li>
          </ul>
        </div>
      </div>

      {/* Logout */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Déconnexion</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Déconnectez-vous de votre compte sur cet appareil
        </p>
        <button
          onClick={handleLogout}
          className="btn btn-secondary flex items-center gap-2"
        >
          <LogOut size={20} />
          Se déconnecter
        </button>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200 dark:border-red-800">
        <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">
          Zone dangereuse
        </h2>

        {isDemo && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Mode Démo :</strong> La suppression du compte est désactivée pour le compte de démonstration.
            </p>
          </div>
        )}

        {!showDeleteConfirm ? (
          <div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              La suppression de votre compte est irréversible. Toutes vos données, PDL et cache seront définitivement supprimés.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50"
              disabled={isDemo}
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
