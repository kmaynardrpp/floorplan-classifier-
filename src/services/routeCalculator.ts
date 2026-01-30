/**
 * Route calculation using A* pathfinding algorithm
 *
 * Key constraints enforced:
 * - All points along the route must be within travelable zones
 * - No points within blocked areas
 * - When entering a 1D aisle, must follow it to end or until reaching a 2D area
 * - Maximum step size (handled by graph builder)
 */

import type { Point, Zone } from '@/types/zone'
import type { RoutePath, PathSegment } from '@/types/route'
import { createFailedRoute, createSuccessRoute } from '@/types/route'
import {
  findNearestNode,
  getNodeEdges,
  getNodeById,
  getExtendedNodeById,
  type ExtendedNavigationGraph,
} from '@/utils/graphBuilder'
import { pointInPolygon } from '@/utils/geometry'

/**
 * Priority queue entry for A* algorithm
 */
interface AStarNode {
  nodeId: string
  gScore: number // Cost from start to this node
  fScore: number // gScore + heuristic (estimated total cost)
  /** Track if we're in a 1D aisle to enforce follow-through */
  inAisle: boolean
  /** The aisle zone ID we entered (to track when we exit) */
  aisleZoneId: string | null
}

/**
 * Calculate Euclidean distance between two points (heuristic function)
 */
function euclideanDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
}

/**
 * Check if a point is valid (inside a travelable zone, not in blocked areas)
 */
export function isPointValid(
  point: Point,
  travelableZones: Zone[],
  blockedZones: Zone[]
): boolean {
  // Check if in any blocked area
  for (const blocked of blockedZones) {
    if (pointInPolygon(point, blocked.vertices)) {
      return false
    }
  }

  // Check if in any travelable zone
  for (const zone of travelableZones) {
    if (pointInPolygon(point, zone.vertices)) {
      return true
    }
  }

  return false
}

/**
 * Find the shortest path using A* algorithm with 1D aisle constraints
 *
 * When entering a 1D aisle, the path must follow it to an endpoint (start or end)
 * before exiting to another zone. This prevents mid-aisle exits.
 *
 * @param start - Starting point in pixel coordinates
 * @param end - Ending point in pixel coordinates
 * @param graph - Navigation graph (extended with zone classification)
 * @param travelableZones - All travelable zones for validation
 * @param blockedZones - Blocked areas to avoid
 * @returns RoutePath with path data or error
 */
export function findShortestPath(
  start: Point,
  end: Point,
  graph: ExtendedNavigationGraph,
  travelableZones: Zone[] = [],
  blockedZones: Zone[] = []
): RoutePath {
  // Handle empty graph
  if (graph.nodes.length === 0) {
    return createFailedRoute('No travelable zones available')
  }

  // Validate start point
  if (travelableZones.length > 0 && blockedZones.length > 0) {
    if (!isPointValid(start, travelableZones, blockedZones)) {
      return createFailedRoute('Start point is not in a travelable area')
    }
    if (!isPointValid(end, travelableZones, blockedZones)) {
      return createFailedRoute('End point is not in a travelable area')
    }
  }

  // Find nearest nodes to start and end points
  const startNode = findNearestNode(start, graph, travelableZones, blockedZones)
  const endNode = findNearestNode(end, graph, travelableZones, blockedZones)

  if (!startNode) {
    return createFailedRoute('Could not find start position in any travelable zone')
  }

  if (!endNode) {
    return createFailedRoute('Could not find end position in any travelable zone')
  }

  // If start and end are the same node, return direct path
  if (startNode.id === endNode.id) {
    const distance = euclideanDistance(start, end)
    return createSuccessRoute(
      [start, end],
      [
        {
          from: start,
          to: end,
          distance,
          zoneId: startNode.zoneId,
        },
      ],
      distance
    )
  }

  // Get extended node info
  const startExtNode = getExtendedNodeById(startNode.id, graph)

  // A* algorithm with 1D aisle constraint
  const openSet: AStarNode[] = [
    {
      nodeId: startNode.id,
      gScore: 0,
      fScore: euclideanDistance(startNode.position, endNode.position),
      inAisle: startExtNode?.zoneClass === '1d_aisle',
      aisleZoneId: startExtNode?.zoneClass === '1d_aisle' ? startExtNode.zoneId : null,
    },
  ]
  const cameFrom = new Map<string, string>() // nodeId -> previous nodeId
  const gScores = new Map<string, number>() // nodeId -> gScore
  gScores.set(startNode.id, 0)

  const closedSet = new Set<string>()

  while (openSet.length > 0) {
    // Find node with lowest fScore
    openSet.sort((a, b) => a.fScore - b.fScore)
    const current = openSet.shift()!

    // Check if we reached the goal
    if (current.nodeId === endNode.id) {
      // Reconstruct path
      return reconstructPath(start, end, current.nodeId, cameFrom, graph)
    }

    closedSet.add(current.nodeId)

    // Get current node info
    const currentExtNode = getExtendedNodeById(current.nodeId, graph)

    // Get neighbors
    const edges = getNodeEdges(current.nodeId, graph)

    for (const edge of edges) {
      if (closedSet.has(edge.to)) continue

      const neighborNode = getExtendedNodeById(edge.to, graph)
      if (!neighborNode) continue

      // === 1D AISLE CONSTRAINT ===
      // If we're in a 1D aisle, we can only:
      // 1. Continue along the same aisle
      // 2. Exit at an endpoint (start or end) to a different zone
      if (current.inAisle && current.aisleZoneId) {
        const isStillInSameAisle = neighborNode.zoneId === current.aisleZoneId

        if (!isStillInSameAisle) {
          // Trying to exit the aisle - only allowed at endpoints
          if (
            currentExtNode?.aislePosition !== 'start' &&
            currentExtNode?.aislePosition !== 'end'
          ) {
            // Current node is a mid-point, can't exit here
            continue
          }
        }
      }

      const tentativeGScore = (gScores.get(current.nodeId) ?? Infinity) + edge.weight

      if (tentativeGScore < (gScores.get(edge.to) ?? Infinity)) {
        // This path is better
        cameFrom.set(edge.to, current.nodeId)
        gScores.set(edge.to, tentativeGScore)

        const fScore = tentativeGScore + euclideanDistance(neighborNode.position, endNode.position)

        // Determine if we're entering/continuing in an aisle
        const enteringAisle = neighborNode.zoneClass === '1d_aisle'
        const newAisleZoneId = enteringAisle ? neighborNode.zoneId : null

        // Check if already in open set
        const existingIndex = openSet.findIndex((n) => n.nodeId === edge.to)
        const newNode: AStarNode = {
          nodeId: edge.to,
          gScore: tentativeGScore,
          fScore,
          inAisle: enteringAisle,
          aisleZoneId: newAisleZoneId,
        }

        if (existingIndex === -1) {
          openSet.push(newNode)
        } else {
          openSet[existingIndex] = newNode
        }
      }
    }
  }

  // No path found
  return createFailedRoute('No path found between the selected points')
}

/**
 * Reconstruct the path from A* result
 */
function reconstructPath(
  start: Point,
  end: Point,
  goalNodeId: string,
  cameFrom: Map<string, string>,
  graph: ExtendedNavigationGraph
): RoutePath {
  // Build path from goal to start
  const pathNodeIds: string[] = [goalNodeId]
  let current = goalNodeId

  while (cameFrom.has(current)) {
    current = cameFrom.get(current)!
    pathNodeIds.unshift(current)
  }

  // Convert node IDs to points
  const points: Point[] = [start]
  const segments: PathSegment[] = []
  let totalDistance = 0

  // Add distance from start to first node
  const firstNode = getNodeById(pathNodeIds[0]!, graph)
  if (firstNode) {
    const distToFirst = euclideanDistance(start, firstNode.position)
    segments.push({
      from: start,
      to: firstNode.position,
      distance: distToFirst,
      zoneId: firstNode.zoneId,
    })
    totalDistance += distToFirst
    points.push(firstNode.position)
  }

  // Add path through nodes
  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const fromNode = getNodeById(pathNodeIds[i]!, graph)
    const toNode = getNodeById(pathNodeIds[i + 1]!, graph)

    if (fromNode && toNode) {
      const distance = euclideanDistance(fromNode.position, toNode.position)
      segments.push({
        from: fromNode.position,
        to: toNode.position,
        distance,
        zoneId: toNode.zoneId,
      })
      totalDistance += distance
      points.push(toNode.position)
    }
  }

  // Add distance from last node to end
  const lastNode = getNodeById(pathNodeIds[pathNodeIds.length - 1]!, graph)
  if (lastNode) {
    const distToEnd = euclideanDistance(lastNode.position, end)
    segments.push({
      from: lastNode.position,
      to: end,
      distance: distToEnd,
      zoneId: lastNode.zoneId,
    })
    totalDistance += distToEnd
    points.push(end)
  }

  return createSuccessRoute(points, segments, totalDistance)
}

/**
 * Calculate the total distance of a path
 *
 * @param points - Array of waypoints
 * @returns Total distance in pixels
 */
export function calculateRouteDistance(points: Point[]): number {
  if (points.length < 2) return 0

  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += euclideanDistance(points[i]!, points[i + 1]!)
  }

  return total
}

/**
 * Convert route distance from pixels to meters
 *
 * @param distancePixels - Distance in pixels
 * @param scale - Scale factor (pixels per mm)
 * @returns Distance in meters
 */
export function convertDistanceToMeters(
  distancePixels: number,
  scale: number
): number {
  if (scale === 0) return 0
  const distanceMm = distancePixels / scale
  return distanceMm / 1000 // mm to meters
}

/**
 * Format distance for display
 *
 * @param distanceMeters - Distance in meters
 * @returns Formatted string (e.g., "12.34 m")
 */
export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1) {
    return `${(distanceMeters * 100).toFixed(1)} cm`
  }
  return `${distanceMeters.toFixed(2)} m`
}
