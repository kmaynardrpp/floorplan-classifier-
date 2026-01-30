/**
 * Build navigation graph from travelable zones for pathfinding
 *
 * This module creates a detailed waypoint mesh for routing:
 * - 2D zones (travel lanes): Grid of waypoints with max spacing
 * - 1D zones (aisles): Waypoints along centerline
 * - Blocked areas: Used to invalidate edges that cross obstacles
 *
 * Key constraints:
 * - All waypoints must be within travelable zones
 * - No waypoints inside blocked areas
 * - Edges cannot cross blocked areas
 * - Maximum step size of 4 meters
 */

import type { Zone, Point } from '@/types/zone'
import type { NavigationGraph, GraphNode, GraphEdge } from '@/types/route'
import { isTravelable } from '@/types/zone'
import {
  getCentroid,
  pointInPolygon,
  lineSegmentIntersection,
  pointDistance,
} from './geometry'
import { areZonesAdjacent } from './zoneAdjacency'
import {
  getAisleStartpoint,
  getAisleEndpoint,
  getAisleDirectionVector,
} from './aisleGeometry'

/**
 * Maximum distance between waypoints in pixels
 * Default: 4 meters = 4000mm, typically ~80-160px depending on scale
 */
const DEFAULT_MAX_STEP_PIXELS = 150 // ~4m at typical warehouse scales

/**
 * Zone classification for routing
 */
export type ZoneClass = '1d_aisle' | '2d_area'

/**
 * Extended graph node with zone classification
 */
export interface ExtendedGraphNode extends GraphNode {
  /** Whether this is a 1D aisle or 2D area */
  zoneClass: ZoneClass
  /** For 1D aisles: 'start', 'end', or 'mid' position */
  aislePosition?: 'start' | 'end' | 'mid'
  /** Index of waypoint within the zone (for ordering) */
  waypointIndex: number
}

/**
 * Extended navigation graph with zone info
 */
export interface ExtendedNavigationGraph extends NavigationGraph {
  nodes: ExtendedGraphNode[]
  /** Map from zone ID to its waypoint node IDs */
  zoneWaypoints: Map<string, string[]>
  /** Set of 1D aisle zone IDs */
  aisleZoneIds: Set<string>
}

/**
 * Check if a zone is a 1D aisle (narrow corridor from TDOA)
 */
export function is1DAisle(zone: Zone): boolean {
  return zone.source === 'tdoa' && zone.type === 'aisle_path'
}

/**
 * Check if a zone is a 2D area (travel lane from coverage)
 */
export function is2DArea(zone: Zone): boolean {
  return zone.source === 'coverage' && zone.type === 'travel_lane'
}

/**
 * Generate waypoints along a 1D aisle centerline
 *
 * @param zone - The aisle zone
 * @param maxStep - Maximum distance between waypoints
 * @returns Array of waypoints with position info
 */
function generateAisleWaypoints(
  zone: Zone,
  maxStep: number
): Array<{ position: Point; aislePosition: 'start' | 'end' | 'mid' }> {
  const start = getAisleStartpoint(zone)
  const end = getAisleEndpoint(zone)
  const direction = getAisleDirectionVector(zone)

  const length = pointDistance(start, end)
  const waypoints: Array<{
    position: Point
    aislePosition: 'start' | 'end' | 'mid'
  }> = []

  // Always include start
  waypoints.push({ position: start, aislePosition: 'start' })

  // Add intermediate waypoints at maxStep intervals
  if (length > maxStep) {
    const numSteps = Math.ceil(length / maxStep)
    const actualStep = length / numSteps

    for (let i = 1; i < numSteps; i++) {
      const t = (i * actualStep) / length
      waypoints.push({
        position: {
          x: start.x + direction.x * t * length,
          y: start.y + direction.y * t * length,
        },
        aislePosition: 'mid',
      })
    }
  }

  // Always include end
  waypoints.push({ position: end, aislePosition: 'end' })

  return waypoints
}

/**
 * Generate waypoints in a grid pattern within a 2D zone
 *
 * @param zone - The travel lane zone
 * @param maxStep - Maximum distance between waypoints
 * @param blockedZones - Blocked areas to avoid
 * @returns Array of waypoints inside the zone and not in blocked areas
 */
function generate2DWaypoints(
  zone: Zone,
  maxStep: number,
  blockedZones: Zone[]
): Point[] {
  const vertices = zone.vertices
  if (vertices.length < 3) return []

  // Get bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const v of vertices) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  const waypoints: Point[] = []

  // Always include centroid
  const centroid = getCentroid(vertices)
  if (isValidWaypoint(centroid, vertices, blockedZones)) {
    waypoints.push(centroid)
  }

  // Generate grid of points
  const gridStep = maxStep * 0.8 // Slightly smaller than max to ensure connectivity
  for (let x = minX + gridStep / 2; x <= maxX; x += gridStep) {
    for (let y = minY + gridStep / 2; y <= maxY; y += gridStep) {
      const point = { x, y }
      if (isValidWaypoint(point, vertices, blockedZones)) {
        waypoints.push(point)
      }
    }
  }

  // If no grid points, at least use centroid
  if (waypoints.length === 0) {
    const centroid = getCentroid(vertices)
    waypoints.push(centroid)
  }

  return waypoints
}

/**
 * Check if a waypoint is valid (inside zone, not in blocked areas)
 */
function isValidWaypoint(
  point: Point,
  zoneVertices: Point[],
  blockedZones: Zone[]
): boolean {
  // Must be inside the zone
  if (!pointInPolygon(point, zoneVertices)) {
    return false
  }

  // Must not be inside any blocked area
  for (const blocked of blockedZones) {
    if (pointInPolygon(point, blocked.vertices)) {
      return false
    }
  }

  return true
}

/**
 * Check if an edge crosses any blocked area
 */
function edgeCrossesBlockedArea(
  from: Point,
  to: Point,
  blockedZones: Zone[]
): boolean {
  for (const blocked of blockedZones) {
    const vertices = blocked.vertices
    if (vertices.length < 3) continue

    // Check if edge intersects any polygon edge
    for (let i = 0; i < vertices.length; i++) {
      const v1 = vertices[i]!
      const v2 = vertices[(i + 1) % vertices.length]!

      if (lineSegmentIntersection(from, to, v1, v2)) {
        return true
      }
    }
  }

  return false
}

/**
 * Build a navigation graph from zones for pathfinding
 *
 * Creates nodes at:
 * - 2D zones: Grid of waypoints within the zone
 * - 1D aisles: Waypoints along the centerline
 *
 * Creates edges between:
 * - Adjacent waypoints within the same zone
 * - Waypoints in adjacent zones (at boundary connection points)
 *
 * Validates that edges don't cross blocked areas.
 *
 * @param zones - Array of zones to build graph from
 * @param blockedZones - Blocked areas to avoid
 * @param maxStepPixels - Maximum distance between waypoints in pixels
 * @param adjacencyThreshold - Maximum distance to consider zones adjacent
 * @returns Navigation graph with nodes and edges
 */
export function buildNavigationGraph(
  zones: Zone[],
  blockedZones: Zone[] = [],
  maxStepPixels: number = DEFAULT_MAX_STEP_PIXELS,
  adjacencyThreshold: number = 50
): ExtendedNavigationGraph {
  // Filter to only travelable zones
  const travelableZones = zones.filter((z) => isTravelable(z.type))

  if (travelableZones.length === 0) {
    return {
      nodes: [],
      edges: [],
      zoneWaypoints: new Map(),
      aisleZoneIds: new Set(),
    }
  }

  const nodes: ExtendedGraphNode[] = []
  const edges: GraphEdge[] = []
  const zoneWaypoints = new Map<string, string[]>()
  const aisleZoneIds = new Set<string>()

  let nodeIdCounter = 0

  // Generate waypoints for each zone
  for (const zone of travelableZones) {
    const isAisle = is1DAisle(zone)
    const zoneClass: ZoneClass = isAisle ? '1d_aisle' : '2d_area'

    if (isAisle) {
      aisleZoneIds.add(zone.id)
    }

    const waypointIds: string[] = []

    if (isAisle) {
      // Generate waypoints along aisle centerline
      const aisleWaypoints = generateAisleWaypoints(zone, maxStepPixels)

      for (let i = 0; i < aisleWaypoints.length; i++) {
        const wp = aisleWaypoints[i]!
        const nodeId = `node-${nodeIdCounter++}`
        nodes.push({
          id: nodeId,
          position: wp.position,
          zoneId: zone.id,
          zoneClass,
          aislePosition: wp.aislePosition,
          waypointIndex: i,
        })
        waypointIds.push(nodeId)
      }

      // Create edges along the aisle (sequential waypoints)
      for (let i = 0; i < waypointIds.length - 1; i++) {
        const fromId = waypointIds[i]!
        const toId = waypointIds[i + 1]!
        const fromNode = nodes.find((n) => n.id === fromId)!
        const toNode = nodes.find((n) => n.id === toId)!
        const distance = pointDistance(fromNode.position, toNode.position)

        // Check if edge crosses blocked area
        if (
          !edgeCrossesBlockedArea(
            fromNode.position,
            toNode.position,
            blockedZones
          )
        ) {
          edges.push({ from: fromId, to: toId, weight: distance })
          edges.push({ from: toId, to: fromId, weight: distance })
        }
      }
    } else {
      // Generate grid of waypoints for 2D area
      const areaWaypoints = generate2DWaypoints(
        zone,
        maxStepPixels,
        blockedZones
      )

      for (let i = 0; i < areaWaypoints.length; i++) {
        const wp = areaWaypoints[i]!
        const nodeId = `node-${nodeIdCounter++}`
        nodes.push({
          id: nodeId,
          position: wp,
          zoneId: zone.id,
          zoneClass,
          waypointIndex: i,
        })
        waypointIds.push(nodeId)
      }

      // Create edges between nearby waypoints in the same zone
      for (let i = 0; i < waypointIds.length; i++) {
        for (let j = i + 1; j < waypointIds.length; j++) {
          const fromId = waypointIds[i]!
          const toId = waypointIds[j]!
          const fromNode = nodes.find((n) => n.id === fromId)!
          const toNode = nodes.find((n) => n.id === toId)!
          const distance = pointDistance(fromNode.position, toNode.position)

          // Only connect if within max step distance
          if (distance <= maxStepPixels * 1.5) {
            // Check if edge crosses blocked area
            if (
              !edgeCrossesBlockedArea(
                fromNode.position,
                toNode.position,
                blockedZones
              )
            ) {
              edges.push({ from: fromId, to: toId, weight: distance })
              edges.push({ from: toId, to: fromId, weight: distance })
            }
          }
        }
      }
    }

    zoneWaypoints.set(zone.id, waypointIds)
  }

  // Create edges between adjacent zones
  // For 1D aisles: only connect at endpoints (start/end)
  // For 2D areas: connect nearby boundary waypoints
  for (let i = 0; i < travelableZones.length; i++) {
    for (let j = i + 1; j < travelableZones.length; j++) {
      const zone1 = travelableZones[i]!
      const zone2 = travelableZones[j]!

      if (!areZonesAdjacent(zone1, zone2, adjacencyThreshold)) {
        continue
      }

      const isAisle1 = aisleZoneIds.has(zone1.id)
      const isAisle2 = aisleZoneIds.has(zone2.id)

      // Get connection candidates based on zone type
      const candidates1 = isAisle1
        ? nodes.filter(
            (n) =>
              n.zoneId === zone1.id &&
              (n.aislePosition === 'start' || n.aislePosition === 'end')
          )
        : nodes.filter((n) => n.zoneId === zone1.id)

      const candidates2 = isAisle2
        ? nodes.filter(
            (n) =>
              n.zoneId === zone2.id &&
              (n.aislePosition === 'start' || n.aislePosition === 'end')
          )
        : nodes.filter((n) => n.zoneId === zone2.id)

      // Find closest pair(s) to connect
      let bestDistance = Infinity
      let bestPair: [ExtendedGraphNode, ExtendedGraphNode] | null = null

      for (const c1 of candidates1) {
        for (const c2 of candidates2) {
          const dist = pointDistance(c1.position, c2.position)
          if (dist < bestDistance && dist <= adjacencyThreshold * 3) {
            bestDistance = dist
            bestPair = [c1, c2]
          }
        }
      }

      if (
        bestPair &&
        !edgeCrossesBlockedArea(
          bestPair[0].position,
          bestPair[1].position,
          blockedZones
        )
      ) {
        edges.push({
          from: bestPair[0].id,
          to: bestPair[1].id,
          weight: bestDistance,
        })
        edges.push({
          from: bestPair[1].id,
          to: bestPair[0].id,
          weight: bestDistance,
        })
      }
    }
  }

  console.log(
    `[graphBuilder] Built graph with ${nodes.length} nodes (${aisleZoneIds.size} aisles) and ${edges.length / 2} edges`
  )

  return { nodes, edges, zoneWaypoints, aisleZoneIds }
}

/**
 * Find the nearest graph node to a given point
 *
 * @param point - The point to find nearest node to
 * @param graph - The navigation graph
 * @param zones - Zones to check point containment
 * @param blockedZones - Blocked areas to check against
 * @returns Nearest valid node or null if none found
 */
export function findNearestNode(
  point: Point,
  graph: NavigationGraph,
  zones?: Zone[],
  blockedZones?: Zone[]
): GraphNode | null {
  if (graph.nodes.length === 0) {
    return null
  }

  // Check if point is in a blocked area
  if (blockedZones) {
    for (const blocked of blockedZones) {
      if (pointInPolygon(point, blocked.vertices)) {
        console.warn('[graphBuilder] Point is inside a blocked area')
        return null
      }
    }
  }

  // If zones provided, prefer nodes in the same zone as the point
  let containingZone: Zone | null = null
  if (zones) {
    for (const zone of zones) {
      if (isTravelable(zone.type) && pointInPolygon(point, zone.vertices)) {
        containingZone = zone
        break
      }
    }
  }

  let nearestNode: GraphNode | null = null
  let nearestDistance = Infinity

  for (const node of graph.nodes) {
    // Prefer nodes in the same zone
    if (containingZone && node.zoneId !== containingZone.id) {
      continue
    }

    const distance = pointDistance(node.position, point)

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestNode = node
    }
  }

  // If no node found in containing zone, search all nodes
  if (!nearestNode) {
    for (const node of graph.nodes) {
      const distance = pointDistance(node.position, point)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestNode = node
      }
    }
  }

  return nearestNode
}

/**
 * Get all edges from a specific node
 *
 * @param nodeId - The node ID to get edges from
 * @param graph - The navigation graph
 * @returns Array of edges originating from this node
 */
export function getNodeEdges(
  nodeId: string,
  graph: NavigationGraph
): GraphEdge[] {
  return graph.edges.filter((e) => e.from === nodeId)
}

/**
 * Get a node by its ID
 *
 * @param nodeId - The node ID to find
 * @param graph - The navigation graph
 * @returns The node or undefined if not found
 */
export function getNodeById(
  nodeId: string,
  graph: NavigationGraph
): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId)
}

/**
 * Get extended node by ID
 */
export function getExtendedNodeById(
  nodeId: string,
  graph: ExtendedNavigationGraph
): ExtendedGraphNode | undefined {
  return graph.nodes.find((n) => n.id === nodeId)
}

/**
 * Check if the graph is connected (all nodes reachable from any node)
 * Uses depth-first search
 *
 * @param graph - The navigation graph
 * @returns true if all nodes are connected
 */
export function isGraphConnected(graph: NavigationGraph): boolean {
  if (graph.nodes.length <= 1) return true

  const visited = new Set<string>()
  const stack: string[] = [graph.nodes[0]!.id]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current)) continue

    visited.add(current)

    const edges = getNodeEdges(current, graph)
    for (const edge of edges) {
      if (!visited.has(edge.to)) {
        stack.push(edge.to)
      }
    }
  }

  return visited.size === graph.nodes.length
}

/**
 * Get statistics about the navigation graph
 */
export function getGraphStats(graph: NavigationGraph): {
  nodeCount: number
  edgeCount: number
  isConnected: boolean
  isolatedNodes: string[]
} {
  const nodeCount = graph.nodes.length
  const edgeCount = graph.edges.length / 2 // Divide by 2 since we have bidirectional edges

  // Find isolated nodes (nodes with no edges)
  const nodesWithEdges = new Set<string>()
  for (const edge of graph.edges) {
    nodesWithEdges.add(edge.from)
    nodesWithEdges.add(edge.to)
  }

  const isolatedNodes = graph.nodes
    .filter((n) => !nodesWithEdges.has(n.id))
    .map((n) => n.id)

  return {
    nodeCount,
    edgeCount,
    isConnected: isGraphConnected(graph),
    isolatedNodes,
  }
}
