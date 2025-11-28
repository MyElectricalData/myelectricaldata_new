import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'

export interface TourStep {
  target: string // CSS selector for the element to highlight
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  action?: {
    label: string
    onClick: () => void
  }
}

interface OnboardingTourProps {
  steps: TourStep[]
  onComplete: () => void
  onSkip: () => void
  tourId: string
}

export function OnboardingTour({ steps, onComplete, onSkip }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isVisible, setIsVisible] = useState(false)
  const [spotlightRect, setSpotlightRect] = useState({ top: 0, left: 0, width: 0, height: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const isFirstStep = currentStep === 0

  useEffect(() => {
    if (!step) return

    const updatePosition = () => {
      const targetElement = document.querySelector(step.target)
      if (!targetElement) {
        if (import.meta.env.VITE_DEBUG === 'true') {
          console.warn(`OnboardingTour: Target element not found: ${step.target}`)
          console.log('Available data-tour elements:', Array.from(document.querySelectorAll('[data-tour]')).map(el => el.getAttribute('data-tour')))
        }
        setIsVisible(false)
        return
      }

      if (!tooltipRef.current) {
        // Tooltip not yet mounted, retry after a short delay
        setTimeout(updatePosition, 50)
        return
      }

      // Scroll element into view first, then calculate positions
      targetElement.scrollIntoView({ behavior: 'auto', block: 'center' })

      // Wait for scroll to complete before calculating positions
      setTimeout(() => {
        const targetRect = targetElement.getBoundingClientRect()
        const tooltipRect = tooltipRef.current?.getBoundingClientRect()
        if (!tooltipRect) return

        const placement = step.placement || 'bottom'

        // Calculate spotlight rectangle with padding
        const spotlightPadding = 8

        if (import.meta.env.VITE_DEBUG === 'true') {
          console.log('Target element:', step.target)
          console.log('Target rect:', {
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            bottom: targetRect.bottom,
            right: targetRect.right
          })
          console.log('Window scroll:', { scrollX: window.scrollX, scrollY: window.scrollY })
        }

        // getBoundingClientRect gives viewport-relative coordinates
        // For fixed positioning, use these coordinates directly
        setSpotlightRect({
          top: targetRect.top - spotlightPadding,
          left: targetRect.left - spotlightPadding,
          width: targetRect.width + spotlightPadding * 2,
          height: targetRect.height + spotlightPadding * 2,
        })

        let top = 0
        let left = 0

        // Calculate position based on placement
        switch (placement) {
          case 'top':
            top = targetRect.top - tooltipRect.height - 12
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
            break
          case 'bottom':
            top = targetRect.bottom + 12
            left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
            break
          case 'left':
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
            left = targetRect.left - tooltipRect.width - 12
            break
          case 'right':
            top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
            left = targetRect.right + 12
            break
        }

        // Keep tooltip within viewport
        const padding = 16
        top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding))
        left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding))

        setPosition({ top, left })
        setIsVisible(true)

        // Add highlight to target element
        targetElement.classList.add('onboarding-highlight')
      }, 100)
    }

    // Initial position calculation
    setTimeout(updatePosition, 100)

    // Update position on scroll and resize
    const handleUpdate = () => {
      // Immediate update without delay for scroll/resize
      const targetElement = document.querySelector(step.target)
      if (!targetElement || !tooltipRef.current) return

      const targetRect = targetElement.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()
      const placement = step.placement || 'bottom'
      const spotlightPadding = 8

      // Update spotlight immediately
      setSpotlightRect({
        top: targetRect.top - spotlightPadding,
        left: targetRect.left - spotlightPadding,
        width: targetRect.width + spotlightPadding * 2,
        height: targetRect.height + spotlightPadding * 2,
      })

      // Update tooltip position
      let top = 0
      let left = 0

      switch (placement) {
        case 'top':
          top = targetRect.top - tooltipRect.height - 12
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
          break
        case 'bottom':
          top = targetRect.bottom + 12
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
          break
        case 'left':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
          left = targetRect.left - tooltipRect.width - 12
          break
        case 'right':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
          left = targetRect.right + 12
          break
      }

      const padding = 16
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding))
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding))

      setPosition({ top, left })
    }

    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)

      // Remove highlight from all elements
      document.querySelectorAll('.onboarding-highlight').forEach(el => {
        el.classList.remove('onboarding-highlight')
      })
    }
  }, [step, currentStep])

  const handleNext = () => {
    if (isLastStep) {
      handleComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleComplete = () => {
    setIsVisible(false)
    onComplete()
  }

  const handleSkip = () => {
    setIsVisible(false)
    onSkip()
  }

  if (!step) return null

  // Use portal to render at document.body level
  // This avoids issues with parent transforms breaking fixed positioning
  return createPortal(
    <>
      {/* Backdrop overlay with spotlight using SVG mask */}
      <svg
        className={`fixed inset-0 z-40 transition-opacity duration-300 pointer-events-auto ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleSkip}
        aria-hidden="true"
        style={{ width: '100%', height: '100%', top: 0, left: 0 }}
      >
        <defs>
          <mask id="spotlight-mask">
            {/* White background - visible area */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black spotlight - transparent area */}
            <rect
              x={spotlightRect.left}
              y={spotlightRect.top}
              width={spotlightRect.width}
              height={spotlightRect.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        {/* Dark overlay with mask */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.7)"
          mask="url(#spotlight-mask)"
        />
        {/* Highlight ring around spotlight */}
        <rect
          x={spotlightRect.left}
          y={spotlightRect.top}
          width={spotlightRect.width}
          height={spotlightRect.height}
          rx="8"
          fill="none"
          stroke="rgba(59, 130, 246, 0.8)"
          strokeWidth="3"
          className="pointer-events-none"
        />
      </svg>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={`fixed z-50 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 transition-all duration-200 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
        }}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-content"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? 'w-6 bg-primary-500'
                      : index < currentStep
                      ? 'w-1.5 bg-primary-300 dark:bg-primary-600'
                      : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              {currentStep + 1} / {steps.length}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Fermer le guide"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <h3 id="tour-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            {step.title}
          </h3>
          <p id="tour-content" className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            {step.content}
          </p>
          {step.action && (
            <button
              onClick={step.action.onClick}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {step.action.label}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Passer le guide
          </button>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                onClick={handlePrevious}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors flex items-center gap-1"
                aria-label="Étape précédente"
              >
                <ChevronLeft size={16} />
                Précédent
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-md transition-colors flex items-center gap-1 font-medium"
              aria-label={isLastStep ? 'Terminer le guide' : 'Étape suivante'}
            >
              {isLastStep ? (
                <>
                  Terminer
                  <Check size={16} />
                </>
              ) : (
                <>
                  Suivant
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Global styles for highlighting */}
      <style>{`
        .onboarding-highlight {
          position: relative;
          z-index: 41 !important;
        }
      `}</style>
    </>,
    document.body
  )
}
