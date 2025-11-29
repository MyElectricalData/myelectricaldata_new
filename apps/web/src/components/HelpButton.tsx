import { useState, useRef, useEffect } from 'react'
import { HelpCircle, Book, Video, RotateCcw, Keyboard, X } from 'lucide-react'

export interface HelpOption {
  id: string
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}

interface HelpButtonProps {
  options: HelpOption[]
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  shouldPulse?: boolean
}

export function HelpButton({ options, position = 'bottom-right', shouldPulse = false }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const positionClasses = {
    'bottom-right': 'bottom-20 right-6',
    'bottom-left': 'bottom-20 left-6',
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
  }

  const menuPositionClasses = {
    'bottom-right': 'bottom-full right-0 mb-2',
    'bottom-left': 'bottom-full left-0 mb-2',
    'top-right': 'top-full right-0 mt-2',
    'top-left': 'top-full left-0 mt-2',
  }

  const handleOptionClick = (option: HelpOption) => {
    option.onClick()
    setIsOpen(false)
  }

  return (
    <div className={`fixed ${positionClasses[position]} z-40`}>
      {/* Help menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className={`absolute ${menuPositionClasses[position]} w-80 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200`}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle size={20} />
              <h3 className="font-semibold">Centre d'aide</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Options */}
          <div className="p-2">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option)}
                className="w-full px-3 py-3 flex items-start gap-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                role="menuitem"
              >
                <div className="flex-shrink-0 p-2 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white mb-0.5">
                    {option.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Besoin d'aide supplémentaire ? Consultez la{' '}
              <a
                href="/faq"
                className="text-primary-600 dark:text-primary-400 hover:underline"
                onClick={() => setIsOpen(false)}
              >
                FAQ
              </a>
            </p>
          </div>
        </div>
      )}

      {/* Help button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-14 h-14 rounded-full shadow-lg
          bg-primary-500 hover:bg-primary-600
          text-white
          flex items-center justify-center
          transition-all duration-200
          hover:scale-110
          focus:outline-none focus:ring-4 focus:ring-primary-500/50
          ${isOpen ? 'rotate-90' : ''}
        `}
        aria-label={isOpen ? 'Fermer le centre d\'aide' : 'Ouvrir le centre d\'aide'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {isOpen ? <X size={24} /> : <HelpCircle size={24} />}
      </button>

      {/* Pulsing indicator for first-time users */}
      {!isOpen && shouldPulse && (
        <span className="absolute inset-0 rounded-full animate-ping bg-primary-400 opacity-75 pointer-events-none" aria-hidden="true" />
      )}
    </div>
  )
}

// Pre-configured help options for common use cases
export function createDashboardHelpOptions({
  onStartTour,
  onShowKeyboardShortcuts,
  onResetOnboarding,
}: {
  onStartTour: () => void
  onShowKeyboardShortcuts: () => void
  onResetOnboarding: () => void
}): HelpOption[] {
  return [
    {
      id: 'tour',
      icon: <Book size={20} />,
      label: 'Visite guidée',
      description: 'Parcourez les fonctionnalités principales en 5 étapes',
      onClick: onStartTour,
    },
    {
      id: 'shortcuts',
      icon: <Keyboard size={20} />,
      label: 'Raccourcis clavier',
      description: 'Afficher la liste des raccourcis disponibles',
      onClick: onShowKeyboardShortcuts,
    },
    {
      id: 'reset',
      icon: <RotateCcw size={20} />,
      label: 'Accueil complet',
      description: 'Revoir le message de bienvenue et la visite guidée',
      onClick: onResetOnboarding,
    },
  ]
}

export function createConsumptionHelpOptions({
  onStartTour,
  onShowVideoTutorial,
}: {
  onStartTour: () => void
  onShowVideoTutorial?: () => void
}): HelpOption[] {
  const options: HelpOption[] = [
    {
      id: 'tour',
      icon: <Book size={20} />,
      label: 'Guide de consommation',
      description: 'Apprenez à analyser vos graphiques de consommation',
      onClick: onStartTour,
    },
  ]

  if (onShowVideoTutorial) {
    options.push({
      id: 'video',
      icon: <Video size={20} />,
      label: 'Tutoriel vidéo',
      description: 'Regardez une démonstration complète',
      onClick: onShowVideoTutorial,
    })
  }

  return options
}
