import { Loader2 } from 'lucide-react'
import { ReactNode } from 'react'

interface LoadingOverlayProps {
  /** Message principal affiché pendant le chargement */
  message?: string
  /** Sous-message optionnel (ex: "Veuillez patienter...") */
  subMessage?: string
  /** Type de données en cours de chargement pour adapter le message */
  dataType?: 'consumption' | 'production' | 'simulation' | 'balance' | 'admin'
  /** Si true, joue l'animation de sortie (fade out) */
  isExiting?: boolean
  /** Contenu à afficher en arrière-plan (sera flouté) */
  children?: ReactNode
  /** Intensité du flou (défaut: 8px) */
  blurIntensity?: number
}

export function LoadingOverlay({
  message,
  subMessage,
  dataType = 'consumption',
  isExiting = false,
  children,
  blurIntensity = 8
}: LoadingOverlayProps) {
  // Messages par défaut selon le type de données
  const defaultMessages = {
    consumption: {
      message: 'Chargement des données de consommation',
      subMessage: 'Récupération depuis le cache...'
    },
    production: {
      message: 'Chargement des données de production',
      subMessage: 'Récupération depuis le cache...'
    },
    simulation: {
      message: 'Chargement du simulateur',
      subMessage: 'Récupération des données...'
    },
    balance: {
      message: 'Chargement du bilan énergétique',
      subMessage: 'Récupération depuis le cache...'
    },
    admin: {
      message: 'Chargement des statistiques',
      subMessage: 'Récupération des données de la plateforme...'
    }
  }

  const displayMessage = message || defaultMessages[dataType].message
  const displaySubMessage = subMessage || defaultMessages[dataType].subMessage

  // Si pas d'enfants, afficher le loading simple
  if (!children) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-[400px] py-12 ${isExiting ? 'animate-fadeOut' : 'animate-fadeIn'}`}>
        <LoadingCard
          message={displayMessage}
          subMessage={displaySubMessage}
          isExiting={isExiting}
        />
        <LoadingStyles />
      </div>
    )
  }

  // Avec enfants: afficher le contenu flouté en arrière-plan
  return (
    <div className={`relative ${isExiting ? 'animate-fadeOut' : 'animate-fadeIn'}`}>
      {/* Contenu en arrière-plan avec flou */}
      <div
        className="pointer-events-none select-none"
        style={{
          filter: `blur(${blurIntensity}px)`,
          opacity: 0.6
        }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay avec le spinner centré */}
      <div className="absolute inset-0 flex items-center justify-center bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm">
        <LoadingCard
          message={displayMessage}
          subMessage={displaySubMessage}
          isExiting={isExiting}
        />
      </div>

      <LoadingStyles />
    </div>
  )
}

/** Carte de chargement avec spinner et messages */
function LoadingCard({
  message,
  subMessage,
  isExiting
}: {
  message: string
  subMessage: string
  isExiting: boolean
}) {
  return (
    <div className={`flex flex-col items-center gap-4 p-8 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 ${isExiting ? 'animate-scaleOut' : 'animate-scaleIn'}`}>
      {/* Spinner animé */}
      <div className="relative">
        <div className="absolute inset-0 animate-ping opacity-25">
          <Loader2 className="w-12 h-12 text-primary-500" />
        </div>
        <Loader2 className="w-12 h-12 text-primary-600 dark:text-primary-400 animate-spin" />
      </div>

      {/* Message principal */}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center">
        {message}
      </h3>

      {/* Sous-message */}
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
        {subMessage}
      </p>

      {/* Barre de progression animée */}
      <div className="w-48 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
          style={{
            width: '100%',
            animation: 'loading-progress 1.5s ease-in-out infinite'
          }}
        />
      </div>
    </div>
  )
}

/** Styles CSS pour les animations */
function LoadingStyles() {
  return (
    <style>{`
      @keyframes loading-progress {
        0% {
          transform: translateX(-100%);
        }
        50% {
          transform: translateX(0%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      @keyframes scaleIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes scaleOut {
        from {
          opacity: 1;
          transform: scale(1);
        }
        to {
          opacity: 0;
          transform: scale(0.95);
        }
      }

      .animate-fadeIn {
        animation: fadeIn 0.3s ease-out forwards;
      }

      .animate-fadeOut {
        animation: fadeOut 0.3s ease-out forwards;
      }

      .animate-scaleIn {
        animation: scaleIn 0.4s ease-out forwards;
      }

      .animate-scaleOut {
        animation: scaleOut 0.3s ease-out forwards;
      }
    `}</style>
  )
}
