// User preferences stored in localStorage

export interface UserPreferences {
  onboarding: {
    completed: boolean
    dashboardTourCompleted: boolean
    consumptionTourCompleted: boolean
    skippedAt?: string
  }
  tours: {
    [key: string]: {
      completed: boolean
      completedAt?: string
      stepIndex?: number
    }
  }
  ui: {
    showKeyboardShortcuts: boolean
    reducedMotion: boolean
  }
}

const PREFERENCES_KEY = 'myelectricaldata_preferences'

const DEFAULT_PREFERENCES: UserPreferences = {
  onboarding: {
    completed: false,
    dashboardTourCompleted: false,
    consumptionTourCompleted: false,
  },
  tours: {},
  ui: {
    showKeyboardShortcuts: true,
    reducedMotion: false,
  },
}

/**
 * Get all user preferences from localStorage
 */
export function getUserPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY)
    if (!stored) return DEFAULT_PREFERENCES

    const parsed = JSON.parse(stored)
    // Merge with defaults to ensure all properties exist
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      onboarding: { ...DEFAULT_PREFERENCES.onboarding, ...parsed.onboarding },
      tours: { ...DEFAULT_PREFERENCES.tours, ...parsed.tours },
      ui: { ...DEFAULT_PREFERENCES.ui, ...parsed.ui },
    }
  } catch (error) {
    console.error('Failed to load user preferences:', error)
    return DEFAULT_PREFERENCES
  }
}

/**
 * Save user preferences to localStorage
 */
export function setUserPreferences(preferences: Partial<UserPreferences>): void {
  try {
    const current = getUserPreferences()
    const updated = {
      ...current,
      ...preferences,
      onboarding: { ...current.onboarding, ...preferences.onboarding },
      tours: { ...current.tours, ...preferences.tours },
      ui: { ...current.ui, ...preferences.ui },
    }
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error('Failed to save user preferences:', error)
  }
}

/**
 * Mark onboarding as completed
 */
export function completeOnboarding(): void {
  setUserPreferences({
    onboarding: {
      completed: true,
      dashboardTourCompleted: true,
      consumptionTourCompleted: false,
    },
  })
}

/**
 * Check if user has completed onboarding
 */
export function hasCompletedOnboarding(): boolean {
  return getUserPreferences().onboarding.completed
}

/**
 * Mark a specific tour as completed
 */
export function completeTour(tourId: string): void {
  const preferences = getUserPreferences()
  setUserPreferences({
    tours: {
      ...preferences.tours,
      [tourId]: {
        completed: true,
        completedAt: new Date().toISOString(),
      },
    },
  })
}

/**
 * Check if a specific tour has been completed
 */
export function hasTourCompleted(tourId: string): boolean {
  const preferences = getUserPreferences()
  return preferences.tours[tourId]?.completed ?? false
}

/**
 * Save current step of a tour
 */
export function saveTourProgress(tourId: string, stepIndex: number): void {
  const preferences = getUserPreferences()
  setUserPreferences({
    tours: {
      ...preferences.tours,
      [tourId]: {
        ...preferences.tours[tourId],
        stepIndex,
        completed: false,
      },
    },
  })
}

/**
 * Get saved step index for a tour
 */
export function getTourProgress(tourId: string): number {
  const preferences = getUserPreferences()
  return preferences.tours[tourId]?.stepIndex ?? 0
}

/**
 * Reset all onboarding and tours
 */
export function resetOnboarding(): void {
  setUserPreferences({
    onboarding: DEFAULT_PREFERENCES.onboarding,
    tours: {},
  })
}

/**
 * Skip onboarding
 */
export function skipOnboarding(): void {
  setUserPreferences({
    onboarding: {
      completed: true,
      dashboardTourCompleted: false,
      consumptionTourCompleted: false,
      skippedAt: new Date().toISOString(),
    },
  })
}

/**
 * Update UI preferences
 */
export function updateUIPreferences(ui: Partial<UserPreferences['ui']>): void {
  const preferences = getUserPreferences()
  setUserPreferences({
    ui: {
      ...preferences.ui,
      ...ui,
    },
  })
}

/**
 * Clear all preferences (useful for testing)
 * Available in console as: window.clearOnboarding()
 */
export function clearAllPreferences(): void {
  try {
    localStorage.removeItem(PREFERENCES_KEY)
    console.log('✅ All user preferences cleared. Refresh the page to see onboarding.')
  } catch (error) {
    console.error('Failed to clear preferences:', error)
  }
}

// Make it available globally in development
if (import.meta.env.DEV) {
  (window as any).clearOnboarding = clearAllPreferences
  ;(window as any).getOnboardingState = getUserPreferences
  console.log('🛠️ Debug helpers available:')
  console.log('  - window.clearOnboarding() : Clear onboarding state')
  console.log('  - window.getOnboardingState() : View current state')
}
