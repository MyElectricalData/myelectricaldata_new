import { useState, useEffect, RefObject } from 'react'

/**
 * Hook pour calculer le nombre optimal de jours visibles dans un carousel
 * en fonction de la largeur du conteneur
 *
 * @param containerRef - Référence au conteneur du carousel
 * @param minItemWidth - Largeur minimale d'un élément en pixels (défaut: 120)
 * @param maxItems - Nombre maximum d'éléments à afficher (défaut: 14)
 * @returns Le nombre d'éléments à afficher
 */
export function useResponsiveDayCount(
  containerRef: RefObject<HTMLDivElement>,
  minItemWidth: number = 120,
  maxItems: number = 14
): number {
  const [visibleDayCount, setVisibleDayCount] = useState(7)

  useEffect(() => {
    const calculateVisibleDays = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      // Account for navigation buttons (approx 100px total) and gaps
      const availableWidth = containerWidth - 100
      const calculatedCount = Math.floor(availableWidth / minItemWidth)

      // Clamp between 3 and maxItems
      setVisibleDayCount(Math.max(3, Math.min(maxItems, calculatedCount)))
    }

    // Initial calculation
    calculateVisibleDays()

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(calculateVisibleDays)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [containerRef, minItemWidth, maxItems])

  return visibleDayCount
}
