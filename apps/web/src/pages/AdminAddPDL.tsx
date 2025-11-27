import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Search,
  User,
  Zap,
  Shield,
  Plus,
  Trash2
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { pdlApi } from '@/api/pdl'
import { adminApi } from '@/api/admin'
import { useAuth } from '@/hooks/useAuth'

// Valeurs standard de puissance souscrite en kVA
const POWER_OPTIONS = [3, 6, 9, 12, 15, 18, 24, 30, 36]

// Types de consommation
const CONSUMPTION_TYPES = [
  { value: 'consumption', label: 'Consommation uniquement', has_consumption: true, has_production: false },
  { value: 'production', label: 'Production uniquement', has_consumption: false, has_production: true },
  { value: 'both', label: 'Consommation + Production', has_consumption: true, has_production: true },
]

interface OffPeakPeriod {
  start: string
  end: string
}

export default function AdminAddPDL() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // États du formulaire principal
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [usagePointId, setUsagePointId] = useState('')
  const [name, setName] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  // Refs pour la navigation au clavier
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // États des options avancées
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [subscribedPower, setSubscribedPower] = useState<number>(6)
  const [offPeakPeriods, setOffPeakPeriods] = useState<OffPeakPeriod[]>([])
  const [isActive, setIsActive] = useState(true)
  const [consumptionType, setConsumptionType] = useState('consumption')
  const [activationDate, setActivationDate] = useState('')
  const [oldestDataDate, setOldestDataDate] = useState('')
  const [checkExisting, setCheckExisting] = useState(true)
  const [addAnother, setAddAnother] = useState(false)

  // État des notifications
  const [notification, setNotification] = useState<{type: 'success' | 'error' | 'warning', message: string} | null>(null)

  // Récupération de la liste des utilisateurs
  const { data: usersResponse, isLoading: isLoadingUsers, error: usersError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const response = await adminApi.listUsers()
      return response.data
    },
    enabled: user?.is_admin === true,
  })

  // Extraire le tableau d'utilisateurs de la réponse API
  const usersData = (usersResponse as { users?: unknown[] })?.users || []

  // Filtrage des utilisateurs
  const filteredUsers = Array.isArray(usersData)
    ? usersData.filter((u: any) => {
        const term = searchTerm.toLowerCase()
        const emailMatch = u.email?.toLowerCase().includes(term)
        const clientIdMatch = u.client_id?.toLowerCase().includes(term)
        return emailMatch || clientIdMatch
      })
    : []

  // Réinitialiser l'index surligné quand les résultats changent
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchTerm])

  // Faire défiler l'élément surligné dans la vue
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('button')
      const highlightedItem = items[highlightedIndex] as HTMLElement
      if (highlightedItem) {
        highlightedItem.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        })
      }
    }
  }, [highlightedIndex])

  // Gestion de la navigation au clavier
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || filteredUsers.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredUsers.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredUsers.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredUsers.length) {
          const selectedUserData = filteredUsers[highlightedIndex]
          setSelectedUser(selectedUserData)
          setSearchTerm((selectedUserData as any).email)
          setShowDropdown(false)
          setHighlightedIndex(-1)
        }
        break
      case 'Escape':
        setShowDropdown(false)
        setHighlightedIndex(-1)
        break
    }
  }

  // Récupération des PDLs existants de l'utilisateur sélectionné
  const { data: userPdls } = useQuery({
    queryKey: ['pdls', selectedUser?.email],
    queryFn: async () => {
      // Cette API n'existe pas encore, mais devrait retourner les PDLs d'un utilisateur spécifique
      // Pour l'instant, on retourne un tableau vide
      return []
    },
    enabled: !!selectedUser,
  })

  // Mutation pour ajouter le PDL
  const addPdlMutation = useMutation({
    mutationFn: async (data: any) => {
      // Préparer les heures creuses au bon format
      const offpeakHours = offPeakPeriods.length > 0
        ? offPeakPeriods.map(p => `${p.start}-${p.end}`)
        : undefined

      const pdlData = {
        usage_point_id: data.usage_point_id,
        name: data.name || undefined,
        subscribed_power: showAdvanced ? subscribedPower : undefined,
        offpeak_hours: showAdvanced && offpeakHours ? offpeakHours : undefined,
        is_active: showAdvanced ? isActive : true,
        has_consumption: showAdvanced ? CONSUMPTION_TYPES.find(t => t.value === consumptionType)?.has_consumption : true,
        has_production: showAdvanced ? CONSUMPTION_TYPES.find(t => t.value === consumptionType)?.has_production : false,
        activation_date: showAdvanced && activationDate ? activationDate : undefined,
        oldest_available_data_date: showAdvanced && oldestDataDate ? oldestDataDate : undefined,
      }

      // Si un utilisateur spécifique est sélectionné ET que ce n'est pas le compte de l'admin connecté
      if (selectedUser && selectedUser.id !== user?.id) {
        return pdlApi.adminAddPdl({
          user_email: selectedUser.email,
          ...pdlData,
        })
      } else {
        // Sinon, ajouter au compte de l'utilisateur connecté
        return pdlApi.create(pdlData)
      }
    },
    onSuccess: () => {
      // Déterminer le message selon le contexte
      const isOwnAccount = !selectedUser || selectedUser.id === user?.id
      const targetUser = isOwnAccount ? 'votre compte' : selectedUser.email

      setNotification({
        type: 'success',
        message: `PDL ${usagePointId} ajouté avec succès à ${targetUser}`
      })

      // Invalider le cache des PDLs pour forcer le rechargement
      queryClient.invalidateQueries({ queryKey: ['pdls'] })

      // Si on a ajouté à un autre utilisateur, invalider aussi le cache de ses PDLs
      if (selectedUser && selectedUser.id !== user?.id) {
        queryClient.invalidateQueries({ queryKey: ['pdls', selectedUser.email] })
      }

      // Réinitialiser le formulaire si on ne veut pas en ajouter un autre
      if (!addAnother) {
        resetForm()

        // Rediriger vers le dashboard après 2 secondes
        setTimeout(() => {
          navigate('/dashboard')
        }, 2000)
      } else {
        // Réinitialiser juste le PDL et le nom
        setUsagePointId('')
        setName('')
      }
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || 'Erreur lors de l\'ajout du PDL'
      setNotification({ type: 'error', message })
    },
  })

  // Vérification de l'unicité du PDL (simulation)
  const checkPdlExists = async (_pdl: string): Promise<boolean> => {
    // Cette API n'existe pas encore, mais devrait vérifier si le PDL existe déjà
    // Pour l'instant, on retourne toujours false
    return false
  }

  // Réinitialisation du formulaire
  const resetForm = () => {
    setSearchTerm('')
    setSelectedUser(null)
    setUsagePointId('')
    setName('')
    setSubscribedPower(6)
    setOffPeakPeriods([])
    setIsActive(true)
    setConsumptionType('consumption')
    setActivationDate('')
    setOldestDataDate('')
    setShowAdvanced(false)
  }

  // Gestion de la soumission du formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation du PDL
    if (!usagePointId) {
      setNotification({ type: 'error', message: 'Le numéro PDL est requis' })
      return
    }

    if (usagePointId.length !== 14 || !/^\d{14}$/.test(usagePointId)) {
      setNotification({ type: 'error', message: 'Le PDL doit contenir exactement 14 chiffres' })
      return
    }

    // Vérifier si le PDL existe déjà
    if (checkExisting) {
      const exists = await checkPdlExists(usagePointId)
      if (exists) {
        setNotification({
          type: 'warning',
          message: 'Ce PDL existe déjà. Voulez-vous continuer ?'
        })
        // TODO: Implémenter la boîte de dialogue de confirmation
        return
      }
    }

    // Validation des heures creuses
    if (showAdvanced && offPeakPeriods.length > 0) {
      for (const period of offPeakPeriods) {
        if (!period.start || !period.end) {
          setNotification({ type: 'error', message: 'Toutes les plages horaires doivent être complètes' })
          return
        }
        if (period.start >= period.end) {
          setNotification({ type: 'error', message: 'L\'heure de fin doit être après l\'heure de début' })
          return
        }
      }
    }

    // Si tout est valide, soumettre
    addPdlMutation.mutate({
      usage_point_id: usagePointId,
      name: name || undefined,
    })
  }

  // Gestion des heures creuses
  const addOffPeakPeriod = () => {
    setOffPeakPeriods([...offPeakPeriods, { start: '00:00', end: '00:00' }])
  }

  const removeOffPeakPeriod = (index: number) => {
    setOffPeakPeriods(offPeakPeriods.filter((_, i) => i !== index))
  }

  const updateOffPeakPeriod = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...offPeakPeriods]
    updated[index][field] = value
    setOffPeakPeriods(updated)
  }

  return (
    <div className="w-full">
      <div className="space-y-6 w-full max-w-4xl mx-auto">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4 transition-colors"
          >
            <ArrowLeft size={16} />
            Retour au Dashboard
          </Link>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Activity className="text-amber-600 dark:text-amber-400" size={32} />
            Ajouter un PDL à un utilisateur
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Fonction d'administration : ajouter un PDL à n'importe quel utilisateur sans consentement
          </p>
        </div>

        {/* Notification Toast - Fixed overlay */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top-5 fade-in duration-300">
            <div className={`p-4 rounded-lg shadow-lg flex items-start gap-3 ${
              notification.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/90 border border-green-200 dark:border-green-800'
                : notification.type === 'warning'
                ? 'bg-yellow-50 dark:bg-yellow-900/90 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-900/90 border border-red-200 dark:border-red-800'
            }`}>
              {notification.type === 'success' ? (
                <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0" size={24} />
              ) : notification.type === 'warning' ? (
                <AlertCircle className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" size={24} />
              ) : (
                <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={24} />
              )}
              <div className="flex-1">
                <p className={
                  notification.type === 'success'
                    ? 'text-green-800 dark:text-green-200 font-medium'
                    : notification.type === 'warning'
                    ? 'text-yellow-800 dark:text-yellow-200 font-medium'
                    : 'text-red-800 dark:text-red-200 font-medium'
                }>
                  {notification.message}
                </p>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4">
          <div className="flex items-start gap-3">
            <Shield className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                Accès administrateur uniquement
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
            {/* Section 1: Sélection de l'utilisateur */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User size={20} />
                Sélection de l'utilisateur
              </h2>

              <div className="relative">
                <label htmlFor="userSearch" className="block text-sm font-medium mb-2 flex items-center gap-2">
                  Rechercher un utilisateur
                  {isLoadingUsers && (
                    <span className="text-xs text-gray-500">(Chargement...)</span>
                  )}
                  {usersError && (
                    <span className="text-xs text-red-500">(Erreur de chargement)</span>
                  )}
                  {usersData && (
                    <span className="text-xs text-green-600">({Array.isArray(usersData) ? usersData.length : 0} utilisateurs)</span>
                  )}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={20} />
                  <input
                    ref={searchInputRef}
                    type="text"
                    id="userSearch"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setSelectedUser(null)
                      setShowDropdown(true)
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={(e) => {
                      // Petit délai pour permettre le clic sur un élément du dropdown
                      setTimeout(() => {
                        // Ne fermer que si on ne clique pas sur un élément du dropdown
                        const dropdown = document.getElementById('user-dropdown')
                        if (!dropdown?.contains(e.relatedTarget as Node)) {
                          setShowDropdown(false)
                          setHighlightedIndex(-1)
                        }
                      }, 200)
                    }}
                    placeholder="Tapez pour rechercher par email ou Client ID..."
                    className="input w-full pl-10"
                    autoComplete="off"
                  />
                  {selectedUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null)
                        setSearchTerm('')
                        setShowDropdown(true)
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Dropdown avec auto-complétion */}
                {showDropdown && searchTerm && filteredUsers.length > 0 && !selectedUser && (
                  <div
                    ref={dropdownRef}
                    id="user-dropdown"
                    className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-64 overflow-y-auto"
                  >
                    <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                      {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''} trouvé{filteredUsers.length > 1 ? 's' : ''}
                    </div>
                    {filteredUsers.map((u: any, index: number) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(u)
                          setSearchTerm(u.email)
                          setShowDropdown(false)
                          setHighlightedIndex(-1)
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors ${
                          index === highlightedIndex
                            ? 'bg-blue-50 dark:bg-blue-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        } ${
                          index !== filteredUsers.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${
                            index === highlightedIndex
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {u.email}
                          </span>
                          {u.is_admin && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                          <span>ID: {u.client_id || 'N/A'}</span>
                          {u.created_at && (
                            <span>• Créé le {new Date(u.created_at).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Message si aucun résultat */}
                {showDropdown && searchTerm && filteredUsers.length === 0 && !selectedUser && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <User className="mx-auto mb-2 opacity-50" size={24} />
                      <p className="text-sm">Aucun utilisateur trouvé</p>
                      <p className="text-xs mt-1">Vérifiez l'orthographe ou essayez un autre terme</p>
                    </div>
                  </div>
                )}

                {/* Suggestion de commencer à taper */}
                {showDropdown && !searchTerm && !selectedUser && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
                    <div className="text-center text-gray-500 dark:text-gray-400">
                      <Search className="mx-auto mb-2 opacity-50" size={24} />
                      <p className="text-sm">Commencez à taper pour rechercher</p>
                      <p className="text-xs mt-1">Recherche par email ou Client ID</p>
                    </div>
                  </div>
                )}
              </div>

              {selectedUser && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Utilisateur sélectionné
                  </h4>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <p><strong>Email :</strong> {selectedUser.email}</p>
                    <p><strong>Client ID :</strong> {selectedUser.client_id}</p>
                    <p><strong>PDLs existants :</strong> {userPdls?.length || 0}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null)
                        setSearchTerm('')
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline mt-2"
                    >
                      Changer d'utilisateur
                    </button>
                  </div>
                </div>
              )}

              {!selectedUser && (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    ℹ️ <strong>Aucun utilisateur sélectionné</strong> : Le PDL sera ajouté à <strong>votre propre compte</strong> ({user?.email})
                  </p>
                </div>
              )}
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Section 2: Informations du PDL */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap size={20} />
                Informations du PDL
              </h2>

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
                  className="input w-full font-mono text-lg"
                  required
                />
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Point de Livraison ({usagePointId.length}/14 chiffres)
                  </p>
                  {checkExisting && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checkExisting}
                        onChange={(e) => setCheckExisting(e.target.checked)}
                        className="rounded"
                      />
                      Vérifier l'unicité
                    </label>
                  )}
                </div>
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
                  placeholder="Maison principale, Appartement Paris, etc."
                  maxLength={100}
                  className="input w-full"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Un nom personnalisé pour identifier facilement ce PDL
                </p>
              </div>
            </div>

            {/* Section 3: Options avancées */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                {showAdvanced ? '−' : '+'} Options avancées
              </button>

              {showAdvanced && (
                <div className="space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                  {/* Puissance souscrite */}
                  <div>
                    <label htmlFor="power" className="block text-sm font-medium mb-2">
                      Puissance souscrite (kVA)
                    </label>
                    <select
                      id="power"
                      value={subscribedPower}
                      onChange={(e) => setSubscribedPower(Number(e.target.value))}
                      className="input w-full"
                    >
                      {POWER_OPTIONS.map(power => (
                        <option key={power} value={power}>
                          {power} kVA
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Heures creuses */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Heures creuses
                    </label>
                    {offPeakPeriods.map((period, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <input
                          type="time"
                          value={period.start}
                          onChange={(e) => updateOffPeakPeriod(index, 'start', e.target.value)}
                          className="input flex-1"
                        />
                        <span className="self-center">à</span>
                        <input
                          type="time"
                          value={period.end}
                          onChange={(e) => updateOffPeakPeriod(index, 'end', e.target.value)}
                          className="input flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => removeOffPeakPeriod(index)}
                          className="p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addOffPeakPeriod}
                      className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <Plus size={16} />
                      Ajouter une plage horaire
                    </button>
                  </div>

                  {/* Type de consommation */}
                  <div>
                    <label htmlFor="type" className="block text-sm font-medium mb-2">
                      Type de consommation
                    </label>
                    <select
                      id="type"
                      value={consumptionType}
                      onChange={(e) => setConsumptionType(e.target.value)}
                      className="input w-full"
                    >
                      {CONSUMPTION_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Statut */}
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">PDL actif</span>
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400 ml-6">
                      Décochez pour créer le PDL en état inactif
                    </p>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="activation" className="block text-sm font-medium mb-2">
                        Date d'activation du contrat
                      </label>
                      <input
                        type="date"
                        id="activation"
                        value={activationDate}
                        onChange={(e) => setActivationDate(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                    <div>
                      <label htmlFor="oldest" className="block text-sm font-medium mb-2">
                        Date de données la plus ancienne
                      </label>
                      <input
                        type="date"
                        id="oldest"
                        value={oldestDataDate}
                        onChange={(e) => setOldestDataDate(e.target.value)}
                        className="input w-full"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <hr className="border-gray-200 dark:border-gray-700" />

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={addPdlMutation.isPending}
                className="btn-primary flex-1"
              >
                {addPdlMutation.isPending ? 'Ajout en cours...' : 'Ajouter le PDL'}
              </button>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={addAnother}
                  onChange={(e) => setAddAnother(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Ajouter un autre PDL</span>
              </label>
            </div>
          </form>
        </div>

        {/* Info Section */}
        <div className="card bg-blue-50 dark:bg-blue-900/20">
          <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">
            Informations importantes
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
            <li><strong>Sans utilisateur sélectionné :</strong> Le PDL sera ajouté à votre propre compte</li>
            <li><strong>Avec utilisateur sélectionné :</strong> Le PDL sera ajouté au compte de l'utilisateur choisi</li>
            <li>Le PDL sera immédiatement visible dans le compte ciblé</li>
            <li>Les données de consommation devront être récupérées manuellement via l'API Enedis</li>
            <li>Le numéro PDL doit être valide et existant chez Enedis</li>
            <li>Les paramètres avancés peuvent être modifiés ultérieurement</li>
          </ul>
        </div>
      </div>
    </div>
  )
}