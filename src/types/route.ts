/**
 * Types for route calculation and navigation
 */

import type { Point } from './zone'

/**
 * A node in the navigation graph (typically a zone centroid)
 */
export interface GraphNode {
  /** Unique node identifier (usually zone ID) */
  id: string
  /** Position in pixel coordinates */
  position: Point
  /** ID of the zone this node represents */
  zoneId: string
}

/**
 * An edge connecting two nodes in the navigation graph
 */
export interface GraphEdge {
  /** Source node ID */
  from: string
  /** Destination node ID */
  to: string
  /** Edge weight (distance in pixels) */
  weight: number
}

/**
 * Navigation graph for pathfinding
 */
export interface NavigationGraph {
  /** All nodes in the graph */
  nodes: GraphNode[]
  /** All edges connecting nodes */
  edges: GraphEdge[]
}

/**
 * A segment of the calculated route path
 */
export interface PathSegment {
  /** Starting point of the segment */
  from: Point
  /** Ending point of the segment */
  to: Point
  /** Distance of this segment in pixels */
  distance: number
  /** ID of the zone this segment passes through */
  zoneId: string
}

/**
 * Result of route calculation
 */
export interface RoutePath {
  /** Waypoints along the route */
  points: Point[]
  /** Total distance in pixels */
  totalDistance: number
  /** Individual segments with zone information */
  segments: PathSegment[]
  /** Whether pathfinding succeeded */
  success: boolean
  /** Error message if pathfinding failed */
  error?: string
}

/**
 * State for route selection and calculation
 */
export interface RouteState {
  /** Selected start point */
  startPoint: Point | null
  /** Selected end point */
  endPoint: Point | null
  /** Calculated route (null if not calculated) */
  calculatedRoute: RoutePath | null
  /** Whether route calculation is in progress */
  isCalculating: boolean
  /** Error message from route calculation */
  routeError: string | null
}

/**
 * Selection state for route point picking
 */
export type RouteSelectionState =
  | 'waiting-for-start'
  | 'waiting-for-end'
  | 'complete'

/**
 * Empty route result for initialization
 */
export const EMPTY_ROUTE: RoutePath = {
  points: [],
  totalDistance: 0,
  segments: [],
  success: false,
}

/**
 * Create a failed route result with error message
 */
export function createFailedRoute(error: string): RoutePath {
  return {
    ...EMPTY_ROUTE,
    success: false,
    error,
  }
}

/**
 * Create a successful route result
 */
export function createSuccessRoute(
  points: Point[],
  segments: PathSegment[],
  totalDistance: number
): RoutePath {
  return {
    points,
    segments,
    totalDistance,
    success: true,
  }
}
