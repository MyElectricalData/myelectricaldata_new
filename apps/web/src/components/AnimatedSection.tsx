import { ReactNode } from 'react'

interface AnimatedSectionProps {
  children: ReactNode
  /** Delay in milliseconds before the animation starts */
  delay?: number
  /** Whether the section should be visible/animated */
  isVisible: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Wrapper component that animates its children with a fade-in + slide-up effect.
 * Used for smooth transitions when data finishes loading.
 */
export function AnimatedSection({
  children,
  delay = 0,
  isVisible,
  className = ''
}: AnimatedSectionProps) {
  if (!isVisible) return null

  return (
    <div
      className={`animate-section-enter ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both'
      }}
    >
      {children}

      {/* Animation styles - injected once */}
      <style>{`
        @keyframes sectionEnter {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-section-enter {
          animation: sectionEnter 0.5s ease-out;
        }
      `}</style>
    </div>
  )
}
