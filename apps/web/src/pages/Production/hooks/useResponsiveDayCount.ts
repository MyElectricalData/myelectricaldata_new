import { useState, useEffect, RefObject } from 'react'

/**
 * Hook to calculate the optimal number of days to display in the carousel
 * based on available container width to avoid truncated day labels
 *
 * @param containerRef - Reference to the carousel container element
 * @param minDayWidth - Minimum width per day button in pixels (default: 120px)
 * @param maxDays - Maximum number of days to show (default: 14)
 * @returns Number of days that can fit without truncation
 */
export function useResponsiveDayCount(
  containerRef: RefObject<HTMLDivElement>,
  minDayWidth: number = 120,
  maxDays: number = 14
): number {
  const [visibleDays, setVisibleDays] = useState(7) // Default: 7 days

  useEffect(() => {
    if (!containerRef.current) return

    const calculateVisibleDays = () => {
      if (!containerRef.current) return

      // Get container width
      const containerWidth = containerRef.current.offsetWidth

      // Account for navigation buttons (2 × 40px) + gaps (multiple × 8px)
      const navigationWidth = 80 // Left + right navigation buttons
      const gapWidth = 16 // Total gap space (2 × 8px for each side)
      const exportButtonWidth = 160 // Export JSON button approximate width

      // Available width for day buttons
      const availableWidth = containerWidth - navigationWidth - gapWidth - exportButtonWidth

      // Calculate how many days can fit
      const calculatedDays = Math.floor(availableWidth / minDayWidth)

      // Clamp between 3 and maxDays
      const finalDays = Math.max(3, Math.min(maxDays, calculatedDays))

      setVisibleDays(finalDays)
    }

    // Calculate on mount
    calculateVisibleDays()

    // Recalculate on window resize
    const resizeObserver = new ResizeObserver(calculateVisibleDays)
    resizeObserver.observe(containerRef.current)

    // Cleanup
    return () => {
      resizeObserver.disconnect()
    }
  }, [containerRef, minDayWidth, maxDays])

  return visibleDays
}
