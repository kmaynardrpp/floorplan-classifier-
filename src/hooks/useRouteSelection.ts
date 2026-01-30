/**
 * Hook for handling canvas clicks for route point selection
 */

import { useCallback, useMemo } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import type { Point } from '@/types/zone'
import type { RouteSelectionState } from '@/types/route'

export interface UseRouteSelectionResult {
  /** Handle canvas click for point selection */
  handleCanvasClick: (point: Point) => void
  /** Currently selected start point */
  startPoint: Point | null
  /** Currently selected end point */
  endPoint: Point | null
  /** Current selection state */
  selectionState: RouteSelectionState
  /** Reset selection to initial state */
  reset: () => void
  /** Whether selection is active (on route tab) */
  isActive: boolean
}

/**
 * Hook for route point selection on canvas
 *
 * Selection logic:
 * - First click sets start point
 * - Second click sets end point
 * - Third click resets and sets new start point
 *
 * @returns Object with selection handlers and state
 */
export function useRouteSelection(): UseRouteSelectionResult {
  const activeTab = useProjectStore((s) => s.activeTab)
  const routeStart = useProjectStore((s) => s.routeStart)
  const routeEnd = useProjectStore((s) => s.routeEnd)
  const setRouteStart = useProjectStore((s) => s.setRouteStart)
  const setRouteEnd = useProjectStore((s) => s.setRouteEnd)
  const clearRoute = useProjectStore((s) => s.clearRoute)

  const isActive = activeTab === 'route'

  // Determine current selection state
  const selectionState = useMemo((): RouteSelectionState => {
    if (!routeStart) return 'waiting-for-start'
    if (!routeEnd) return 'waiting-for-end'
    return 'complete'
  }, [routeStart, routeEnd])

  // Handle canvas click
  const handleCanvasClick = useCallback(
    (point: Point) => {
      if (!isActive) return

      if (selectionState === 'waiting-for-start') {
        // First click: set start point
        setRouteStart(point)
      } else if (selectionState === 'waiting-for-end') {
        // Second click: set end point
        setRouteEnd(point)
      } else {
        // Third click: reset and set new start
        clearRoute()
        setRouteStart(point)
      }
    },
    [isActive, selectionState, setRouteStart, setRouteEnd, clearRoute]
  )

  // Reset selection
  const reset = useCallback(() => {
    clearRoute()
  }, [clearRoute])

  return {
    handleCanvasClick,
    startPoint: routeStart,
    endPoint: routeEnd,
    selectionState,
    reset,
    isActive,
  }
}
