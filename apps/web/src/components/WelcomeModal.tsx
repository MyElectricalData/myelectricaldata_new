import { useEffect } from 'react'
import { Zap, Users, BarChart3, Settings, ArrowRight, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface WelcomeModalProps {
  onStartTour: () => void
  onClose: () => void
  userName?: string
}

export function WelcomeModal({ onStartTour, onClose, userName }: WelcomeModalProps) {
  // Scroll to top and lock body scroll when modal is open
  useEffect(() => {
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' })

    // Lock body scroll
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Cleanup: restore scroll on unmount
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Use portal to render modal at document.body level
  // This avoids issues with parent transforms breaking fixed positioning
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors z-10"
          aria-label="Fermer"
        >
          <X size={24} />
        </button>

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 text-white p-8 pb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <Zap size={32} />
            </div>
            <div>
              <h2 className="text-3xl font-bold">
                Bienvenue{userName ? `, ${userName}` : ''} !
              </h2>
              <p className="text-primary-100 mt-1">
                Découvrez MyElectricalData
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 -mt-3">
          <div className="bg-white dark:bg-gray-700 rounded-lg shadow-lg p-6 mb-6">
            <p className="text-gray-600 dark:text-gray-200 text-lg leading-relaxed mb-4">
              MyElectricalData vous aide à visualiser et gérer votre consommation électrique
              grâce aux données Enedis.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-300">
              Prenez quelques minutes pour découvrir les fonctionnalités principales.
            </p>
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <FeatureCard
              icon={<Zap className="text-primary-500" size={24} />}
              title="Données en temps réel"
              description="Accédez à vos données de consommation Enedis mises à jour quotidiennement"
            />
            <FeatureCard
              icon={<BarChart3 className="text-green-500" size={24} />}
              title="Analyses détaillées"
              description="Visualisez vos courbes de consommation avec des graphiques interactifs"
            />
            <FeatureCard
              icon={<Settings className="text-orange-500" size={24} />}
              title="Personnalisation"
              description="Configurez vos heures creuses et optimisez votre contrat"
            />
            <FeatureCard
              icon={<Users className="text-purple-500" size={24} />}
              title="Multi-PDL"
              description="Gérez plusieurs points de livraison depuis une seule interface"
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onStartTour}
              className="flex-1 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 group"
            >
              Démarrer le guide
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Explorer seul
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            Vous pouvez toujours relancer le guide depuis le menu d'aide
          </p>
        </div>
      </div>
    </div>,
    document.body
  )
}

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:border-primary-300 dark:hover:border-primary-600 transition-colors">
      <div className="flex-shrink-0 p-2 bg-white dark:bg-gray-600 rounded-lg h-fit">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          {title}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}
