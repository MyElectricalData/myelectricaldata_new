import { useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'

interface PageTransitionProps {
  children: React.ReactNode
}

/**
 * Composant qui ajoute des transitions fluides entre les pages.
 * Utilise un effet de fade + slide subtil lors du changement de route.
 * Scroll automatiquement vers le haut lors du changement de page.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation()
  const [displayChildren, setDisplayChildren] = useState(children)
  const [transitionState, setTransitionState] = useState<'enter' | 'exit' | 'idle'>('idle')
  const previousPathRef = useRef(location.pathname)

  useEffect(() => {
    // Si le chemin a changé
    if (location.pathname !== previousPathRef.current) {
      // Démarrer l'animation de sortie
      setTransitionState('exit')

      // Après l'animation de sortie, mettre à jour le contenu
      const exitTimer = setTimeout(() => {
        // Scroll vers le haut de manière fluide
        window.scrollTo({ top: 0, behavior: 'smooth' })

        setDisplayChildren(children)
        setTransitionState('enter')

        // Revenir à idle après l'animation d'entrée
        const enterTimer = setTimeout(() => {
          setTransitionState('idle')
        }, 300)

        return () => clearTimeout(enterTimer)
      }, 150)

      previousPathRef.current = location.pathname

      return () => clearTimeout(exitTimer)
    } else {
      // Même chemin, mettre à jour les enfants directement
      setDisplayChildren(children)
    }
  }, [location.pathname, children])

  const getTransitionClasses = () => {
    switch (transitionState) {
      case 'exit':
        return 'opacity-0 translate-y-2 scale-[0.99]'
      case 'enter':
        return 'opacity-100 translate-y-0 scale-100'
      case 'idle':
      default:
        return 'opacity-100 translate-y-0 scale-100'
    }
  }

  return (
    <div
      className={`transition-all duration-200 ease-out ${getTransitionClasses()}`}
      style={{
        transformOrigin: 'top center',
        willChange: transitionState !== 'idle' ? 'opacity, transform' : 'auto'
      }}
    >
      {displayChildren}
    </div>
  )
}
