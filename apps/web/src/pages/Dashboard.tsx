import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { pdlApi } from '@/api/pdl'
import { oauthApi } from '@/api/oauth'
import { logger } from '@/utils/logger'
import { CheckCircle, XCircle, ArrowUpDown, GripVertical, UserPlus, Search, Keyboard, X as CloseIcon, AlertCircle, ChevronDown } from 'lucide-react'
import PDLDetails from '@/components/PDLDetails'
import PDLCard from '@/components/PDLCard'
import { PDLCardSkeleton } from '@/components/Skeleton'
import { WelcomeModal } from '@/components/WelcomeModal'
import { OnboardingTour, type TourStep } from '@/components/OnboardingTour'
import { HelpButton, createDashboardHelpOptions } from '@/components/HelpButton'
import { useAuth } from '@/hooks/useAuth'
import { useIsDemo } from '@/hooks/useIsDemo'
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
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string, title?: string, pdl?: string} | null>(null)
  const [selectedPdl, setSelectedPdl] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<'name' | 'date' | 'id' | 'custom'>('custom')
  const [draggedPdl, setDraggedPdl] = useState<PDL | null>(null)
  const [dragOverPdl, setDragOverPdl] = useState<PDL | null>(null)
  const [isDraggingEnabled, setIsDraggingEnabled] = useState(false)
  const [tempPdlOrder, setTempPdlOrder] = useState<PDL[] | null>(null)
  const showInactive = true // Always show inactive PDLs
  const [inactiveSectionCollapsed, setInactiveSectionCollapsed] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [showOnboardingTour, setShowOnboardingTour] = useState(false)
  const [shouldPulseHelp, setShouldPulseHelp] = useState(false)
  const [syncingPdlIds, setSyncingPdlIds] = useState<Set<string>>(new Set())
  // Use sessionStorage to persist loading state across component remounts
  const [isLoadingAfterConsent, setIsLoadingAfterConsent] = useState(() => {
    return sessionStorage.getItem('consent_loading') === 'true'
  })
  const consentProcessedRef = useRef(false)
  const lastHapticPdlId = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isDemo = useIsDemo()

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

  // Recover error message from sessionStorage after component remount
  // This runs ONCE on mount, before the consent check useEffect
  useEffect(() => {
    const storedErrorData = sessionStorage.getItem('consent_error_data')
    if (storedErrorData) {
      try {
        const errorData = JSON.parse(storedErrorData)
        logger.log('[Dashboard] Recovering error from sessionStorage:', errorData)
        setNotification({
          type: 'error',
          title: errorData.title,
          message: errorData.message,
          pdl: errorData.pdl
        })
        // Start a new auto-hide timer for the recovered message
        const timer = setTimeout(() => {
          setNotification(null)
          sessionStorage.removeItem('consent_error_data')
        }, 15000)
        return () => clearTimeout(timer)
      } catch {
        sessionStorage.removeItem('consent_error_data')
      }
    }
  }, []) // Empty deps = runs once on mount only

  // Check for consent callback parameters
  useEffect(() => {
    const consentSuccess = searchParams.get('consent_success')
    const consentError = searchParams.get('consent_error')
    const pdlCount = searchParams.get('pdl_count')
    const createdCount = searchParams.get('created_count')

    logger.log('[Dashboard] useEffect consent check:', { consentSuccess, consentError, pdlCount, createdCount, processed: consentProcessedRef.current })

    // Skip if already processed (prevents double execution on remount)
    if (consentProcessedRef.current) {
      logger.log('[Dashboard] Consent already processed, skipping')
      return
    }

    if (consentSuccess === 'true') {
      consentProcessedRef.current = true
      logger.log('[Dashboard] Consent success detected, forcing refetch...')
      const total = pdlCount ? parseInt(pdlCount) : 0
      const created = createdCount ? parseInt(createdCount) : 0

      // Show global loading screen immediately (persist in sessionStorage for remounts)
      sessionStorage.setItem('consent_loading', 'true')
      setIsLoadingAfterConsent(true)

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
      // Force immediate refresh of PDL list BEFORE clearing params
      // Remove cache completely to avoid stale data from IndexedDB persistence
      queryClient.removeQueries({ queryKey: ['pdls'] })
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
      // Then refetch fresh data from server
      queryClient.refetchQueries({ queryKey: ['pdls'] }).then(() => {
        // Clear params only after refetch completes
        setSearchParams({})
        // Hide global loading (individual PDL sync will show on cards)
        sessionStorage.removeItem('consent_loading')
        setIsLoadingAfterConsent(false)
      })

      // Auto-sync only NEW PDLs (those without contract info yet)
      if (created > 0) {
        setTimeout(async () => {
          const data: any = await queryClient.fetchQuery({ queryKey: ['pdls'] })
          if (Array.isArray(data)) {
            // Only sync PDLs that don't have contract info yet (new PDLs)
            const newPdls = data.filter((pdl: PDL) => !pdl.subscribed_power)

            if (newPdls.length > 0) {
              // Mark PDLs as syncing BEFORE starting (so UI shows loading immediately)
              const newPdlIds = new Set(newPdls.map((pdl: PDL) => pdl.id))
              setSyncingPdlIds(newPdlIds)

              // Sync each PDL and remove from syncing set when done
              const syncPromises = newPdls.map(async (pdl: PDL) => {
                try {
                  await pdlApi.fetchContract(pdl.id)
                } catch (error) {
                  logger.warn(`Failed to sync PDL ${pdl.usage_point_id}:`, error)
                } finally {
                  // Remove this PDL from syncing set
                  setSyncingPdlIds(prev => {
                    const next = new Set(prev)
                    next.delete(pdl.id)
                    return next
                  })
                  // Refresh PDL list to show updated data for this specific PDL
                  queryClient.refetchQueries({ queryKey: ['pdls'] })
                }
              })

              await Promise.all(syncPromises)
            }
          }
        }, 500) // Reduced delay for faster feedback
      }

      // Auto-hide after 10 seconds
      setTimeout(() => setNotification(null), 10000)
    } else if (consentError) {
      consentProcessedRef.current = true
      const pdlId = searchParams.get('pdl')
      let errorTitle = 'Erreur de consentement'
      let errorMessage = consentError

      if (consentError === 'pdl_already_exists') {
        errorTitle = 'Point de livraison déjà enregistré'
        errorMessage = 'Contactez l\'administrateur si vous pensez qu\'il s\'agit d\'une erreur.'
      } else if (consentError === 'user_not_found') {
        errorTitle = 'Utilisateur non trouvé'
        errorMessage = 'Veuillez vous reconnecter.'
      } else if (consentError === 'no_usage_point_id') {
        errorTitle = 'Aucun PDL détecté'
        errorMessage = 'Aucun point de livraison n\'a été retourné par Enedis.'
      } else if (consentError === 'invalid_pdl_format') {
        errorTitle = 'Numéro PDL invalide'
        errorMessage = 'Enedis a transmis un identifiant incorrect. Veuillez réessayer ou contacter le support.'
      }

      // Store error in sessionStorage to survive component remount (as JSON for rich data)
      const errorData = { title: errorTitle, message: errorMessage, pdl: pdlId || undefined }
      sessionStorage.setItem('consent_error_data', JSON.stringify(errorData))
      setNotification({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
        pdl: pdlId || undefined
      })
      setSearchParams({})

      // Auto-hide after 15 seconds (longer for important errors)
      setTimeout(() => {
        setNotification(null)
        sessionStorage.removeItem('consent_error_data')
      }, 15000)
    }
  }, [searchParams, setSearchParams, queryClient])

  const { data: pdlsData, isLoading: pdlsLoading } = useQuery({
    queryKey: ['pdls'],
    queryFn: async () => {
      logger.log('[Dashboard] Fetching PDLs from API...')
      const response = await pdlApi.list()
      if (response.success && Array.isArray(response.data)) {
        logger.log(`[Dashboard] Received ${response.data.length} PDLs`)
        return response.data as PDL[]
      }
      logger.log('[Dashboard] No PDLs received or error')
      return []
    },
    // Keep data fresh for 30 seconds only - PDLs change often (consent, sync, etc.)
    // Override the global 24h staleTime for this critical query
    staleTime: 30 * 1000,
    // Don't persist to IndexedDB - always fetch fresh (configured in main.tsx)
    gcTime: 5 * 60 * 1000, // 5 minutes in memory only
    // Don't refetch on window focus to preserve drag & drop changes
    refetchOnWindowFocus: false,
  })

  const deletePdlMutation = useMutation({
    mutationFn: (id: string) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdls'] })
    },
    onError: (error: Error) => {
      setNotification({ type: 'error', message: error.message })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  const reorderPdlsMutation = useMutation({
    mutationFn: (orders: Array<{ id: string; order: number }>) => {
      if (isDemo) {
        return Promise.reject(new Error('Modifications désactivées en mode démo'))
      }
      return pdlApi.reorderPdls(orders)
    },
    onMutate: async (orders) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['pdls'] })

      // Snapshot the previous value
      const previousPdls = queryClient.getQueryData(['pdls']) as PDL[] | undefined

      // Optimistically update to the new value
      if (previousPdls && Array.isArray(previousPdls)) {
        const updatedPdls = [...previousPdls]

        // Apply new order
        orders.forEach(({ id, order }) => {
          const pdl = updatedPdls.find(p => p.id === id)
          if (pdl) {
            pdl.display_order = order
          }
        })

        // Sort by new order
        updatedPdls.sort((a, b) => {
          const orderA = a.display_order ?? 999
          const orderB = b.display_order ?? 999
          return orderA - orderB
        })

        queryClient.setQueryData(['pdls'], updatedPdls)
      }

      // Return context with snapshot
      return { previousPdls }
    },
    onSuccess: () => {
      // On success, the optimistic update stays
      setNotification({ type: 'success', message: 'Ordre des PDL mis à jour' })
      setTimeout(() => setNotification(null), 3000)
    },
    onError: (error: Error, _orders, context) => {
      // Rollback to previous value on error
      if (context?.previousPdls) {
        queryClient.setQueryData(['pdls'], context.previousPdls)
      }
      setNotification({ type: 'error', message: error.message })
      setTimeout(() => setNotification(null), 5000)
    },
  })

  const getOAuthUrlMutation = useMutation({
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
    onError: (error: Error) => {
      setNotification({ type: 'error', message: error.message })
      setTimeout(() => setNotification(null), 5000)
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

  // Handle loading state recovery after component remount
  // If we were loading but the component remounted, continue the loading and finish when data is ready
  useEffect(() => {
    if (isLoadingAfterConsent && !pdlsLoading && pdls.length > 0) {
      // Data is loaded, hide the loading screen
      logger.log('[Dashboard] Data loaded after consent, hiding loading screen')
      sessionStorage.removeItem('consent_loading')
      setIsLoadingAfterConsent(false)
    }
  }, [isLoadingAfterConsent, pdlsLoading, pdls.length])

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

  // Separate active and inactive PDLs
  const { activePdls, inactivePdls } = useMemo(() => {
    let filteredPdls = [...pdls]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filteredPdls = filteredPdls.filter(pdl =>
        (pdl.name?.toLowerCase().includes(query)) ||
        pdl.usage_point_id.toLowerCase().includes(query)
      )
    }

    // Sort function
    const sortFn = (list: PDL[]) => {
      switch (sortOrder) {
        case 'name':
          return list.sort((a, b) => {
            const nameA = (a.name || a.usage_point_id).toLowerCase()
            const nameB = (b.name || b.usage_point_id).toLowerCase()
            return nameA.localeCompare(nameB)
          })
        case 'id':
          return list.sort((a, b) => a.usage_point_id.localeCompare(b.usage_point_id))
        case 'date':
          return list.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        case 'custom':
        default:
          return list
      }
    }

    const active = sortFn(filteredPdls.filter(pdl => pdl.is_active ?? true))
    const inactive = sortFn(filteredPdls.filter(pdl => !(pdl.is_active ?? true)))

    return { activePdls: active, inactivePdls: inactive }
  }, [pdls, sortOrder, searchQuery])

  // For drag & drop compatibility, combine lists
  const sortedPdls = useMemo(() => {
    return showInactive ? [...activePdls, ...inactivePdls] : activePdls
  }, [activePdls, inactivePdls, showInactive])

  const handleDragStart = (pdl: PDL) => {
    setDraggedPdl(pdl)
    // Medium haptic feedback when starting to drag
    triggerHaptic('medium')
    lastHapticPdlId.current = null
  }

  const handleDragOver = (e: React.DragEvent, targetPdl: PDL) => {
    e.preventDefault()
    if (!draggedPdl || draggedPdl.id === targetPdl.id) return

    // Calculate if we should swap based on mouse position within the element
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseY = e.clientY
    const elementMiddle = rect.top + rect.height / 2

    // Determine drop position based on which half of the element we're in
    const currentList = tempPdlOrder || sortedPdls
    const draggedIndex = currentList.findIndex(p => p.id === draggedPdl.id)
    const targetIndex = currentList.findIndex(p => p.id === targetPdl.id)

    if (draggedIndex === -1 || targetIndex === -1) return

    // Only swap if we're moving in the intended direction
    let shouldSwap = false
    if (draggedIndex < targetIndex) {
      // Dragging downwards: only swap if mouse is in bottom half
      shouldSwap = mouseY > elementMiddle
    } else if (draggedIndex > targetIndex) {
      // Dragging upwards: only swap if mouse is in top half
      shouldSwap = mouseY < elementMiddle
    }

    if (!shouldSwap) return

    // Light haptic feedback when hovering over a new target (avoid repeated triggers)
    if (lastHapticPdlId.current !== targetPdl.id) {
      triggerHaptic('light')
      lastHapticPdlId.current = targetPdl.id
    }

    // Update visual indicator
    setDragOverPdl(targetPdl)

    // Update temporary order for smooth visual feedback
    const newPdls = [...currentList]
    newPdls.splice(draggedIndex, 1)
    newPdls.splice(targetIndex, 0, draggedPdl)

    setTempPdlOrder(newPdls)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()

    if (!draggedPdl) {
      setTempPdlOrder(null)
      return
    }

    // If there's no temp order, nothing was reordered
    if (!tempPdlOrder) {
      setDraggedPdl(null)
      setDragOverPdl(null)
      return
    }

    // Use the temp order which already has the correct arrangement from handleDragOver
    const orders = tempPdlOrder.map((pdl, index) => ({
      id: pdl.id,
      order: index
    }))

    // Save to backend only once when dropping
    reorderPdlsMutation.mutate(orders, {
      onSettled: () => {
        // Reset temporary order after save (success or error)
        setTempPdlOrder(null)
      }
    })

    // Success haptic feedback when dropping
    triggerHaptic('success')

    // Reset drag state
    setDraggedPdl(null)
    setDragOverPdl(null)
    lastHapticPdlId.current = null
  }

  const handleDragEnd = () => {
    setDraggedPdl(null)
    setDragOverPdl(null)
    setTempPdlOrder(null)
    lastHapticPdlId.current = null
  }

  const handleDragLeave = () => {
    setDragOverPdl(null)
  }

  return (
    <div className="space-y-4">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
            notification.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 shadow-lg'
          }`}
          role="alert"
          aria-live="polite"
        >
          {notification.type === 'success' ? (
            <CheckCircle className="text-green-600 dark:text-green-400 flex-shrink-0 animate-in zoom-in duration-500" size={24} />
          ) : (
            <XCircle className="text-red-600 dark:text-red-400 flex-shrink-0 animate-in zoom-in duration-500 mt-0.5" size={28} />
          )}
          <div className="flex-1 min-w-0">
            {/* Title */}
            {notification.title && (
              <p className={`font-semibold text-base ${
                notification.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {notification.title}
              </p>
            )}
            {/* PDL Number - Highlighted */}
            {notification.pdl && (
              <div className="mt-2 mb-2">
                <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-600">
                  <span className="text-xs text-red-600 dark:text-red-300 mr-2">PDL</span>
                  <span className="font-mono font-bold text-red-800 dark:text-red-100 text-lg tracking-wider">
                    {notification.pdl}
                  </span>
                </span>
              </div>
            )}
            {/* Message */}
            <p className={`text-sm ${
              notification.type === 'success'
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => {
              setNotification(null)
              sessionStorage.removeItem('consent_error_data')
            }}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-1"
            aria-label="Fermer la notification"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      )}


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

      {/* Demo Mode Banner */}
      {isDemo && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Mode Démonstration</h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Vous utilisez un compte de démonstration avec 3 ans de données fictives pré-générées.
                Les modifications (ajout, suppression, renommage de PDL), le consentement Enedis et la récupération de données sont désactivés.
                Toutes les données affichées sont générées automatiquement pour présenter les fonctionnalités de l'application.
              </p>
            </div>
          </div>
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
              <div className="relative group" data-tour="consent-button">
                <button
                  onClick={handleStartConsent}
                  className="px-4 py-0 border-0 bg-[#00a8e0] rounded-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  disabled={getOAuthUrlMutation.isPending || isDemo}
                  aria-describedby="consent-tooltip"
                >
                  <img
                    src="/enedis_azure.png"
                    alt="Consentement Enedis"
                    className="h-14 w-auto"
                  />
                </button>
                {!isDemo && (
                  <div
                    id="consent-tooltip"
                    role="tooltip"
                    className="absolute top-full right-0 mt-2 w-72 p-3 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50"
                  >
                    <div className="absolute bottom-full right-4 border-8 border-transparent border-b-gray-900 dark:border-b-gray-700"></div>
                    <p>En cliquant sur ce bouton, vous allez accéder à votre compte personnel Enedis où vous pourrez donner votre accord pour qu'Enedis nous transmette vos données.</p>
                  </div>
                )}
              </div>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 text-sm" data-tour="sort-options">
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

        {pdlsLoading || isLoadingAfterConsent ? (
          <div className="space-y-4">
            {isLoadingAfterConsent && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="relative mb-4">
                  <div className="w-16 h-16 border-4 border-primary-200 dark:border-primary-800 rounded-full"></div>
                  <div className="absolute inset-0 w-16 h-16 border-4 border-primary-600 dark:border-primary-400 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Chargement de vos points de livraison
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Récupération des données depuis Enedis...
                </p>
              </div>
            )}
            <div className="space-y-3">
              <PDLCardSkeleton />
              <PDLCardSkeleton />
              {!isLoadingAfterConsent && <PDLCardSkeleton />}
            </div>
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
          <div className="space-y-6" data-tour="pdl-list">
            {/* Active PDLs Section */}
            {activePdls.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  PDL actifs ({activePdls.length})
                </div>
                {(tempPdlOrder ? tempPdlOrder.filter(p => p.is_active ?? true) : activePdls).map((pdl, index) => (
                  <div
                    key={pdl.id}
                    draggable={sortOrder === 'custom' && isDraggingEnabled}
                    onDragStart={() => handleDragStart(pdl)}
                    onDragOver={(e) => handleDragOver(e, pdl)}
                    onDrop={handleDrop}
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
                    {sortOrder === 'custom' && !isDemo && (
                      <div
                        className="flex items-center gap-2 mb-1 text-gray-400 cursor-move hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        onMouseDown={() => setIsDraggingEnabled(true)}
                        onMouseUp={() => setIsDraggingEnabled(false)}
                      >
                        <GripVertical size={16} />
                        <span className="text-xs select-none">Glissez pour réorganiser</span>
                      </div>
                    )}
                    <div className={`select-text ${isDemo ? 'opacity-60 pointer-events-none' : ''}`}>
                      <PDLCard
                        pdl={pdl}
                        onViewDetails={() => setSelectedPdl(pdl.usage_point_id)}
                        onDelete={() => deletePdlMutation.mutate(pdl.id)}
                        isDemo={isDemo}
                        allPdls={pdls}
                        isAutoSyncing={syncingPdlIds.has(pdl.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Inactive PDLs Section - Collapsable */}
            {showInactive && inactivePdls.length > 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => setInactiveSectionCollapsed(!inactiveSectionCollapsed)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors w-full"
                >
                  <ChevronDown
                    size={16}
                    className={`transition-transform duration-200 ${inactiveSectionCollapsed ? '-rotate-90' : ''}`}
                  />
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <span>PDL désactivés ({inactivePdls.length})</span>
                </button>
                {!inactiveSectionCollapsed && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {(tempPdlOrder ? tempPdlOrder.filter(p => !(p.is_active ?? true)) : inactivePdls).map((pdl, index) => (
                      <div
                        key={pdl.id}
                        className="animate-in fade-in slide-in-from-bottom-2 transition-all duration-200"
                        style={{
                          animationDelay: `${index * 50}ms`,
                          animationFillMode: 'backwards'
                        }}
                      >
                        <div className={`select-text ${isDemo ? 'opacity-60 pointer-events-none' : ''}`}>
                          <PDLCard
                            pdl={pdl}
                            onViewDetails={() => setSelectedPdl(pdl.usage_point_id)}
                            onDelete={() => deletePdlMutation.mutate(pdl.id)}
                            isDemo={isDemo}
                            allPdls={pdls}
                            compact={true}
                            isAutoSyncing={syncingPdlIds.has(pdl.id)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
