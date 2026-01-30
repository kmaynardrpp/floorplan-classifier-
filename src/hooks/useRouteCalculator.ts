/**
 * Hook for calculating routes using the navigation graph
 *
 * Uses combined zones (programmatic aisles + AI blocked areas) for routing.
 * Blocked areas are excluded from travelable zones and used for collision checking.
 */

import { useCallback, useMemo } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { buildNavigationGraph } from '@/utils/graphBuilder'
import { findShortestPath } from '@/services/routeCalculator'
import { isTravelable } from '@/types/zone'
import type { RoutePath } from '@/types/route'

export interface UseRouteCalculatorResult {
  /** Calculate route from current start/end points */
  calculate: () => Promise<void>
  /** Whether calculation is in progress */
  isCalculating: boolean
  /** Calculated route or null */
  route: RoutePath | null
  /** Error message or null */
  error: string | null
  /** Whether calculation can be performed (both points set) */
  canCalculate: boolean
}

/**
 * Hook for route calculation
 *
 * @returns Object with calculate function and state
 */
export function useRouteCalculator(): UseRouteCalculatorResult {
  const routeStart = useProjectStore((s) => s.routeStart)
  const routeEnd = useProjectStore((s) => s.routeEnd)
  const calculatedRoute = useProjectStore((s) => s.calculatedRoute)
  const isCalculating = useProjectStore((s) => s.isCalculatingRoute)
  const routeError = useProjectStore((s) => s.routeError)
  const zones = useProjectStore((s) => s.zones)
  const programmaticZones = useProjectStore((s) => s.programmaticZones)
  const aiBlockedZones = useProjectStore((s) => s.aiBlockedZones)
  const combinedZones = useProjectStore((s) => s.combinedZones)
  const setCalculatedRoute = useProjectStore((s) => s.setCalculatedRoute)
  const setIsCalculatingRoute = useProjectStore((s) => s.setIsCalculatingRoute)
  const setRouteError = useProjectStore((s) => s.setRouteError)

  // Check if calculation can be performed
  const canCalculate = useMemo(() => {
    return routeStart !== null && routeEnd !== null && !isCalculating
  }, [routeStart, routeEnd, isCalculating])

  // Calculate route
  const calculate = useCallback(async () => {
    if (!routeStart || !routeEnd) {
      setRouteError('Both start and end points must be selected')
      return
    }

    setIsCalculatingRoute(true)
    setRouteError(null)

    try {
      // Get all available zones
      // Prefer combined zones if available (programmatic + AI blocked areas merged)
      // Otherwise fall back to combining zones + programmaticZones
      const allZones = combinedZones.length > 0
        ? combinedZones
        : [...zones, ...programmaticZones]

      // Separate travelable zones and blocked zones
      const travelableZones = allZones.filter((z) => isTravelable(z.type))

      // Get blocked zones from multiple sources:
      // 1. AI-detected blocked zones
      // 2. Any zone with type 'blocked_area' in the combined zones
      const blockedZones = [
        ...aiBlockedZones,
        ...allZones.filter((z) => z.type === 'blocked_area' && !aiBlockedZones.some((b) => b.id === z.id)),
      ]

      console.log(
        `[useRouteCalculator] Building graph from ${travelableZones.length} travelable zones ` +
        `(with ${blockedZones.length} blocked areas for collision checking)`
      )

      // Build navigation graph from travelable zones, with blocked zones for collision checking
      // This creates a detailed waypoint mesh with max 4m spacing
      const graph = buildNavigationGraph(travelableZones, blockedZones)

      if (graph.nodes.length === 0) {
        setCalculatedRoute({
          points: [],
          totalDistance: 0,
          segments: [],
          success: false,
          error: 'No travelable zones available for routing',
        })
        return
      }

      console.log(
        `[useRouteCalculator] Graph built: ${graph.nodes.length} nodes, ` +
        `${graph.edges.length / 2} edges, ${graph.aisleZoneIds.size} aisles`
      )

      // Find shortest path with 1D aisle constraints
      const route = findShortestPath(
        routeStart,
        routeEnd,
        graph,
        travelableZones,
        blockedZones
      )

      setCalculatedRoute(route)

      if (route.success) {
        console.log(
          `[useRouteCalculator] Route found: ${route.points.length} waypoints, ${route.totalDistance.toFixed(1)}px`
        )
      } else {
        console.warn(`[useRouteCalculator] Route failed: ${route.error}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Route calculation failed'
      console.error('[useRouteCalculator] Error:', err)
      setRouteError(message)
      setCalculatedRoute({
        points: [],
        totalDistance: 0,
        segments: [],
        success: false,
        error: message,
      })
    } finally {
      setIsCalculatingRoute(false)
    }
  }, [
    routeStart,
    routeEnd,
    zones,
    programmaticZones,
    aiBlockedZones,
    combinedZones,
    setCalculatedRoute,
    setIsCalculatingRoute,
    setRouteError,
  ])

  return {
    calculate,
    isCalculating,
    route: calculatedRoute,
    error: routeError,
    canCalculate,
  }
}
