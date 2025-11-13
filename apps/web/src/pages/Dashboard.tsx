import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { pdlApi } from '@/api/pdl'
import { oauthApi } from '@/api/oauth'
import { logger } from '@/utils/logger'
import { ExternalLink, CheckCircle, XCircle, ArrowUpDown, GripVertical, UserPlus, Filter, Search, Keyboard, X as CloseIcon } from 'lucide-react'
import PDLDetails from '@/components/PDLDetails'
import PDLCard from '@/components/PDLCard'
import { PDLCardSkeleton } from '@/components/Skeleton'
import { WelcomeModal } from '@/components/WelcomeModal'
import { OnboardingTour, type TourStep } from '@/components/OnboardingTour'
import { HelpButton, createDashboardHelpOptions } from '@/components/HelpButton'
import { useAuth } from '@/hooks/useAuth'
import { triggerHaptic } from '@/utils/haptics'
import { useKeyboardShortcuts, formatShortcut, type KeyboardShortcut } from '@/hooks/useKeyboardShortcuts'
import {
  hasCompletedOnboarding,
  completeOnboarding,
  skipOnboarding,
  resetOnboarding,
  hasTourCompleted,
  completeTour,
} from '@/utils/userPreferences'
import type { PDL } from '@/types/api'

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null)
  const [selectedPdl, setSelectedPdl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'name' | 'date' | 'id' | 'custom'>('custom')
  const [draggedPdl, setDraggedPdl] = useState<PDL | null>(null)
  const [dragOverPdl, setDragOverPdl] = useState<PDL | null>(null)
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(false)
  const [showInactive, setShowInactive] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [showOnboardingTour, setShowOnboardingTour] = useState(false)
  const [shouldPulseHelp, setShouldPulseHelp] = useState(false)
  const lastHapticPdlId = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Check if user should see onboarding
  useEffect(() => {
    const shouldShowOnboarding = !hasCompletedOnboarding() && !hasTourCompleted('dashboard-tour')

    // Debug logging
    if (import.meta.env.VITE_DEBUG === 'true') {
      logger.log('Onboarding check:', {
        hasCompletedOnboarding: hasCompletedOnboarding(),
        hasTourCompleted: hasTourCompleted('dashboard-tour'),
        shouldShowOnboarding,
      })
    }

    if (shouldShowOnboarding) {
      // Show welcome modal and pulse help button for first-time users
      setShouldPulseHelp(true)
      const timer = setTimeout(() => {
        setShowWelcomeModal(true)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [])

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
        message += '. Synchronisation automatique en cours...'
      }

      setNotification({
        type: 'success',
        message
      })
      // Clear params after showing notification
      setSearchParams({})
      // Refresh PDL list
      queryClient.invalidateQueries({ queryKey: ['pdls'] })

      // Auto-sync new PDLs after a short delay to let the list refresh
      if (created > 0) {
        setTimeout(async () => {
          // Get the updated PDL list and sync all PDLs
          const data: any = await queryClient.fetchQuery({ queryKey: ['pdls'] })
          if (Array.isArray(data)) {
            // Sync all PDLs in parallel and wait for all to complete
            const syncPromises = data.map((pdl: PDL) =>
              pdlApi.fetchContract(pdl.id).catch((error) => {
                logger.warn(`Failed to sync PDL ${pdl.usage_point_id}:`, error)
                return null
              })
            )

            // Wait for all syncs to complete
            const results = await Promise.all(syncPromises)

            if (import.meta.env.VITE_DEBUG === 'true') {
              logger.log('All sync results:', results)
            }

            // Now refresh the PDL list to show all updated data
            queryClient.invalidateQueries({ queryKey: ['pdls'] })
          }
        }, 1000)
      }

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

  const { data: pdlsData, isLoading: pdlsLoading } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        return response.data as PDL[]
      }
      return []
    },
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

  // Onboarding handlers
  const handleStartTour = () => {
    if (import.meta.env.VITE_DEBUG === 'true') {
      logger.log('Starting tour...')
      logger.log('Consent button exists:', !!document.querySelector('[data-tour="consent-button"]'))
    }
    setShowWelcomeModal(false)
    setShowOnboardingTour(true)
  }

  const handleSkipOnboarding = () => {
    skipOnboarding()
    setShowWelcomeModal(false)
    setShouldPulseHelp(false) // Stop pulsing when user explores alone
  }

  const handleCompleteTour = () => {
    completeTour('dashboard-tour')
    completeOnboarding()
    setShowOnboardingTour(false)
    setShouldPulseHelp(false) // Stop pulsing when tour is completed
  }

  const handleSkipTour = () => {
    skipOnboarding()
    setShowOnboardingTour(false)
    setShouldPulseHelp(false) // Stop pulsing when tour is skipped
  }

  const handleResetOnboarding = () => {
    resetOnboarding()
    setShowWelcomeModal(true)
  }

  // Define keyboard shortcuts
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'c',
      description: 'Démarrer le consentement Enedis',
      action: () => handleStartConsent(),
    },
    {
      key: '?',
      shiftKey: true,
      description: 'Afficher les raccourcis clavier',
      action: () => setShowShortcutsHelp(true),
    },
    {
      key: 'k',
      ctrlKey: true,
      description: 'Rechercher un PDL',
      action: () => searchInputRef.current?.focus(),
    },
    {
      key: 'k',
      metaKey: true,
      description: 'Rechercher un PDL (Mac)',
      action: () => searchInputRef.current?.focus(),
    },
    {
      key: 'Escape',
      description: 'Fermer les modals',
      action: () => {
        setShowShortcutsHelp(false)
        setSelectedPdl(null)
        setSearchQuery('')
      },
      preventDefault: false,
    },
  ]

  // Enable keyboard shortcuts
  useKeyboardShortcuts({ shortcuts })

  const pdls = Array.isArray(pdlsData) ? pdlsData : []

  const activePdlsCount = pdls.filter(pdl => pdl.is_active ?? true).length
  const inactivePdlsCount = pdls.length - activePdlsCount

  // Tour steps - Dynamically adjust based on PDL availability
  const getTourSteps = (): TourStep[] => {
    const steps: TourStep[] = [
      {
        target: '[data-tour="consent-button"]',
        title: '1️⃣ Première étape : Le consentement',
        content: 'Avant toute chose, vous devez autoriser MyElectricalData à accéder à vos données Enedis. Cliquez sur ce bouton pour être redirigé vers le site d\'Enedis. Vos points de livraison (PDL) seront automatiquement détectés et importés.',
        placement: 'bottom',
        action: {
          label: '→ Démarrer le consentement maintenant',
          onClick: handleStartConsent,
        },
      },
    ]

    // Only add PDL-related steps if user has PDLs
    if (pdls.length > 0) {
      steps.push(
        {
          target: '[data-tour="pdl-list"]',
          title: "Vos points de livraison",
          content:
            "Tous vos PDL apparaîtront ici avec leurs informations principales : nom, numéro, statut et dernières données disponibles.",
          placement: "top",
        },
        {
          target: '[data-tour="pdl-actions"]',
          title: "Actions PDL",
          content:
            "Chaque PDL dispose de 4 actions : Détails (voir le contrat), Sync (synchroniser avec Enedis), Désactiver/Activer, et Supprimer.",
          placement: "top",
        },
        {
          target: '[data-tour="pdl-consumption"]',
          title: "Configuration : Consommation",
          content: "Indiquez si ce PDL consomme de l'électricité. Activez cette option pour la plupart des compteurs.",
          placement: "left",
        },
        {
          target: '[data-tour="pdl-power"]',
          title: "Configuration : Puissance souscrite",
          content:
            "Sélectionnez la puissance souscrite de votre contrat (en kVA). Cette information est essentielle pour le simulateur d'offres.",
          placement: "left",
        },
        {
          target: '[data-tour="pdl-offpeak"]',
          title: "Configuration : Heures creuses",
          content:
            "⚠️ Important : Même si vous êtes en tarif BASE, renseignez vos heures creuses. Cela permettra au simulateur de comparer plus précisément les offres HP/HC et TEMPO avec votre profil de consommation.",
          placement: "left",
        },
        {
          target: '[data-tour="pdl-production"]',
          title: "Configuration : Production",
          content: "Activez cette option si vous produisez de l'électricité (panneaux solaires, éolienne, etc.).",
          placement: "left",
        },
        {
          target: '[data-tour="search-bar"]',
          title: "Recherche rapide",
          content:
            "Utilisez la barre de recherche pour trouver rapidement un PDL par nom ou numéro. Raccourci : Ctrl+K",
          placement: "bottom",
        }
      );

      // Add sort options step only if user has multiple PDLs
      if (pdls.length > 1) {
        steps.push({
          target: '[data-tour="sort-options"]',
          title: "Tri et filtres",
          content:
            "Organisez vos PDL par nom, date ou ordre personnalisé. Vous pouvez aussi masquer les PDL désactivés.",
          placement: "left",
        });
      }

      // Navigation steps - always visible
      steps.push(
        {
          target: '[data-tour="nav-consumption"]',
          title: "📊 Page Consommation",
          content:
            "Visualisez vos données de consommation avec des graphiques détaillés par jour, semaine ou mois. Analysez vos pics de consommation et comparez vos périodes.",
          placement: "right",
        },
        {
          target: '[data-tour="nav-simulator"]',
          title: "💰 Simulateur d'offres",
          content:
            "Comparez automatiquement toutes les offres d'électricité disponibles (EDF, Enercoop, Octopus, etc.) avec vos données réelles de consommation pour trouver l'offre la plus avantageuse.",
          placement: "right",
        },
        {
          target: '[data-tour="nav-contribute"]',
          title: "🤝 Contribuer",
          content:
            "Participez au développement du projet : signalez des bugs, proposez des améliorations ou contribuez au code. MyElectricalData est un projet communautaire !",
          placement: "right",
        },
        {
          target: '[data-tour="nav-settings"]',
          title: "⚙️ Mon compte",
          content:
            "Gérez vos informations personnelles, consultez vos identifiants API et configurez vos préférences.",
          placement: "right",
        },
        {
          target: '[data-tour="nav-api-docs"]',
          title: "📚 Documentation API",
          content:
            "Consultez la documentation complète de l'API avec Swagger UI. Testez les endpoints directement depuis votre navigateur.",
          placement: "right",
        }
      );
    } else {
      // If no PDLs, add an informational step
      steps.push({
        target: '[data-tour="consent-button"]',
        title: 'Prochaines étapes',
        content: 'Une fois le consentement effectué et vos PDL importés, vous pourrez accéder à toutes les fonctionnalités : recherche, tri, analyse de consommation, et bien plus !',
        placement: 'bottom',
      })
    }

    return steps
  }

  // Help options
  const helpOptions = createDashboardHelpOptions({
    onStartTour: handleStartTour,
    onShowKeyboardShortcuts: () => setShowShortcutsHelp(true),
    onResetOnboarding: handleResetOnboarding,
  })

  const sortedPdls = useMemo(() => {
    // Filter by active status first
    let filteredPdls = showInactive ? [...pdls] : pdls.filter(pdl => pdl.is_active ?? true)

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filteredPdls = filteredPdls.filter(pdl =>
        (pdl.name?.toLowerCase().includes(query)) ||
        pdl.usage_point_id.toLowerCase().includes(query)
      )
    }

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
  }, [pdls, sortOrder, showInactive, searchQuery])

  const handleDragStart = (pdl: PDL) => {
    setDraggedPdl(pdl)
    // Medium haptic feedback when starting to drag
    triggerHaptic('medium')
    lastHapticPdlId.current = null
  }

  const handleDragOver = (e: React.DragEvent, targetPdl: PDL) => {
    e.preventDefault()
    if (!draggedPdl || draggedPdl.id === targetPdl.id) return

    // Light haptic feedback when hovering over a new target (avoid repeated triggers)
    if (lastHapticPdlId.current !== targetPdl.id) {
      triggerHaptic('light')
      lastHapticPdlId.current = targetPdl.id
    }

    // Update visual indicator
    setDragOverPdl(targetPdl)

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
    setDragOverPdl(null)
    lastHapticPdlId.current = null
    // Success haptic feedback when dropping
    triggerHaptic('success')
  }

  const handleDragLeave = () => {
    setDragOverPdl(null)
  }

  return (
    <div className="pt-6 space-y-4">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
            notification.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}
          role="alert"
          aria-live="polite"
        >
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0 animate-in zoom-in duration-500" size={24} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0 animate-in zoom-in duration-500" size={24} />
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
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Fermer la notification"
          >
            ✕
          </button>
        </div>
      )}

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Tableau de bord</h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
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
                data-tour="consent-button"
              >
                <ExternalLink size={16} />
                Consentement Enedis
              </button>
            </div>
          </div>

          {/* Search Bar */}
          {pdls.length > 0 && (
            <div className="relative" data-tour="search-bar">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher un PDL par nom ou numéro... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10 pr-10 w-full text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Effacer la recherche"
                >
                  <CloseIcon size={16} />
                </button>
              )}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 text-xs text-gray-400 pointer-events-none">
                {!searchQuery && (
                  <>
                    <Keyboard size={12} />
                    <span>Ctrl+K</span>
                  </>
                )}
              </div>
            </div>
          )}

          {pdls.length > 1 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between sm:justify-end gap-3 text-sm" data-tour="sort-options">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-500 flex-shrink-0" />
                <label className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="w-4 h-4 flex-shrink-0 text-primary-600 bg-white dark:bg-gray-800 border-2 border-gray-400 dark:border-gray-500 rounded cursor-pointer focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 accent-primary-600"
                  />
                  <span className="text-sm select-none">Afficher les PDL désactivés</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown size={16} className="text-gray-500 flex-shrink-0" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'name' | 'date' | 'id' | 'custom')}
                  className="input text-sm py-1 px-2 w-full sm:w-auto"
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
          <div className="space-y-3">
            <PDLCardSkeleton />
            <PDLCardSkeleton />
            <PDLCardSkeleton />
          </div>
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
          <div className="space-y-3" data-tour="pdl-list">
            {sortedPdls.map((pdl, index) => (
              <div
                key={pdl.id}
                draggable={sortOrder === 'custom' && isDraggingEnabled}
                onDragStart={() => handleDragStart(pdl)}
                onDragOver={(e) => handleDragOver(e, pdl)}
                onDragLeave={handleDragLeave}
                onDragEnd={() => {
                  handleDragEnd()
                  setIsDraggingEnabled(false)
                }}
                className={`animate-in fade-in slide-in-from-bottom-2 transition-all duration-200 ${
                  draggedPdl?.id === pdl.id
                    ? 'opacity-30 scale-95 cursor-grabbing'
                    : dragOverPdl?.id === pdl.id
                    ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-gray-950 scale-[1.02] shadow-lg'
                    : sortOrder === 'custom' && isDraggingEnabled
                    ? 'hover:ring-2 hover:ring-primary-300 hover:ring-offset-2 dark:hover:ring-offset-gray-950 cursor-grab'
                    : ''
                }`}
                style={{
                  animationDelay: `${index * 50}ms`,
                  animationFillMode: 'backwards'
                }}
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

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <Keyboard size={20} className="text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Raccourcis clavier
                </h3>
              </div>
              <button
                onClick={() => setShowShortcutsHelp(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Fermer"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="space-y-3">
              {shortcuts.filter(s => !s.key.includes('Mac')).map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {shortcut.description}
                  </span>
                  <kbd className="px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm">
                    {formatShortcut(shortcut)}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                💡 Astuce : Les raccourcis ne fonctionnent pas quand vous êtes dans un champ de saisie
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Modal */}
      {showWelcomeModal && (
        <WelcomeModal
          onStartTour={handleStartTour}
          onClose={handleSkipOnboarding}
          userName={user?.email?.split('@')[0]}
        />
      )}

      {/* Onboarding Tour */}
      {showOnboardingTour && (
        <OnboardingTour
          steps={getTourSteps()}
          onComplete={handleCompleteTour}
          onSkip={handleSkipTour}
          tourId="dashboard-tour"
        />
      )}

      {/* Help Button */}
      <HelpButton options={helpOptions} position="bottom-right" shouldPulse={shouldPulseHelp} />
    </div>
  )
}
