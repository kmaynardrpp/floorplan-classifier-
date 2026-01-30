import { describe, it, expect } from 'vitest'
import {
  findShortestPath,
  calculateRouteDistance,
  convertDistanceToMeters,
  formatDistance,
} from './routeCalculator'
import type { ExtendedNavigationGraph, ExtendedGraphNode } from '@/utils/graphBuilder'
import type { Point } from '@/types/zone'

/**
 * Helper to create an ExtendedNavigationGraph from simple node/edge definitions
 */
function createGraph(
  nodes: Array<{ id: string; position: Point; zoneId: string; zoneClass?: '1d_aisle' | '2d_area'; aislePosition?: 'start' | 'end' | 'mid' }>,
  edges: Array<{ from: string; to: string; weight: number }>
): ExtendedNavigationGraph {
  const extendedNodes: ExtendedGraphNode[] = nodes.map((n, i) => ({
    id: n.id,
    position: n.position,
    zoneId: n.zoneId,
    zoneClass: n.zoneClass ?? '2d_area',
    aislePosition: n.aislePosition,
    waypointIndex: i,
  }))

  return {
    nodes: extendedNodes,
    edges,
    zoneWaypoints: new Map(),
    aisleZoneIds: new Set(),
  }
}

describe('routeCalculator', () => {
  describe('findShortestPath', () => {
    it('should return error for empty graph', () => {
      const graph = createGraph([], [])
      const start: Point = { x: 0, y: 0 }
      const end: Point = { x: 100, y: 100 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No travelable zones')
    })

    it('should find direct path when start and end are same node', () => {
      const graph = createGraph(
        [{ id: 'n1', position: { x: 50, y: 50 }, zoneId: 'z1' }],
        []
      )
      const start: Point = { x: 40, y: 40 }
      const end: Point = { x: 60, y: 60 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(true)
      expect(result.points.length).toBe(2)
      expect(result.points[0]).toEqual(start)
      expect(result.points[1]).toEqual(end)
    })

    it('should find path through connected nodes', () => {
      const graph = createGraph(
        [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 100, y: 100 }, zoneId: 'z3' },
        ],
        [
          { from: 'n1', to: 'n2', weight: 100 },
          { from: 'n2', to: 'n1', weight: 100 },
          { from: 'n2', to: 'n3', weight: 100 },
          { from: 'n3', to: 'n2', weight: 100 },
        ]
      )
      const start: Point = { x: 0, y: 0 }
      const end: Point = { x: 100, y: 100 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(true)
      expect(result.points.length).toBeGreaterThan(2)
      expect(result.totalDistance).toBeGreaterThan(0)
    })

    it('should return error when no path exists', () => {
      const graph = createGraph(
        [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 100 }, zoneId: 'z2' },
        ],
        [] // No edges connecting the nodes
      )
      const start: Point = { x: 0, y: 0 }
      const end: Point = { x: 100, y: 100 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(false)
      expect(result.error).toContain('No path found')
    })

    it('should choose shortest path when multiple paths exist', () => {
      // Create a graph with two paths: short (direct) and long (via detour)
      const graph = createGraph(
        [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 50, y: 100 }, zoneId: 'z3' }, // Detour node
        ],
        [
          // Direct path: n1 -> n2 (100 units)
          { from: 'n1', to: 'n2', weight: 100 },
          { from: 'n2', to: 'n1', weight: 100 },
          // Detour path: n1 -> n3 -> n2 (much longer)
          { from: 'n1', to: 'n3', weight: 112 }, // ~sqrt(50^2 + 100^2)
          { from: 'n3', to: 'n1', weight: 112 },
          { from: 'n3', to: 'n2', weight: 112 },
          { from: 'n2', to: 'n3', weight: 112 },
        ]
      )
      const start: Point = { x: 0, y: 0 }
      const end: Point = { x: 100, y: 0 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(true)
      // Path includes: start->n1, n1->n2, n2->end = 3 segments for direct path
      // Detour would be: start->n1, n1->n3, n3->n2, n2->end = 4 segments
      expect(result.segments.length).toBeLessThanOrEqual(3)
      // The direct path total distance should be less than the detour (~224)
      expect(result.totalDistance).toBeLessThan(200)
    })

    it('should enforce 1D aisle exit constraints', () => {
      // Create a graph with a 1D aisle that has mid-point waypoints
      // The path should not be able to exit from the mid-point
      const aisleZoneIds = new Set(['aisle1'])
      const graph: ExtendedNavigationGraph = {
        nodes: [
          { id: 'start2d', position: { x: 0, y: 0 }, zoneId: 'z1', zoneClass: '2d_area', waypointIndex: 0 },
          { id: 'aisleStart', position: { x: 50, y: 0 }, zoneId: 'aisle1', zoneClass: '1d_aisle', aislePosition: 'start', waypointIndex: 0 },
          { id: 'aisleMid', position: { x: 50, y: 50 }, zoneId: 'aisle1', zoneClass: '1d_aisle', aislePosition: 'mid', waypointIndex: 1 },
          { id: 'aisleEnd', position: { x: 50, y: 100 }, zoneId: 'aisle1', zoneClass: '1d_aisle', aislePosition: 'end', waypointIndex: 2 },
          { id: 'end2d', position: { x: 100, y: 50 }, zoneId: 'z2', zoneClass: '2d_area', waypointIndex: 0 },
        ],
        edges: [
          // Connect 2D area to aisle start
          { from: 'start2d', to: 'aisleStart', weight: 50 },
          { from: 'aisleStart', to: 'start2d', weight: 50 },
          // Aisle internal edges
          { from: 'aisleStart', to: 'aisleMid', weight: 50 },
          { from: 'aisleMid', to: 'aisleStart', weight: 50 },
          { from: 'aisleMid', to: 'aisleEnd', weight: 50 },
          { from: 'aisleEnd', to: 'aisleMid', weight: 50 },
          // Connect aisle end to exit 2D
          { from: 'aisleEnd', to: 'end2d', weight: 70 },
          { from: 'end2d', to: 'aisleEnd', weight: 70 },
          // Shortcut edge from mid to end2d (should NOT be used)
          { from: 'aisleMid', to: 'end2d', weight: 50 },
          { from: 'end2d', to: 'aisleMid', weight: 50 },
        ],
        zoneWaypoints: new Map([
          ['aisle1', ['aisleStart', 'aisleMid', 'aisleEnd']],
          ['z1', ['start2d']],
          ['z2', ['end2d']],
        ]),
        aisleZoneIds,
      }

      const start: Point = { x: 0, y: 0 }
      const end: Point = { x: 100, y: 50 }

      const result = findShortestPath(start, end, graph)

      expect(result.success).toBe(true)
      // The path should go through: start2d -> aisleStart -> aisleMid -> aisleEnd -> end2d
      // NOT: start2d -> aisleStart -> aisleMid -> end2d (violates aisle constraint)
      // Check that aisleEnd is in the path
      const nodePositions = result.points.map(p => `${p.x},${p.y}`)
      // The aisle end position (50,100) should be in the path
      expect(nodePositions).toContain('50,100')
    })
  })

  describe('calculateRouteDistance', () => {
    it('should return 0 for empty array', () => {
      expect(calculateRouteDistance([])).toBe(0)
    })

    it('should return 0 for single point', () => {
      expect(calculateRouteDistance([{ x: 0, y: 0 }])).toBe(0)
    })

    it('should calculate distance for two points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]
      expect(calculateRouteDistance(points)).toBe(5) // 3-4-5 triangle
    })

    it('should calculate total distance for multiple points', () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 3, y: 4 }, // Distance: 5
        { x: 3, y: 8 }, // Distance: 4
      ]
      expect(calculateRouteDistance(points)).toBe(9)
    })
  })

  describe('convertDistanceToMeters', () => {
    it('should return 0 for zero scale', () => {
      expect(convertDistanceToMeters(1000, 0)).toBe(0)
    })

    it('should convert pixels to meters correctly', () => {
      // If scale = 10 pixels/mm, then 10000 pixels = 1000mm = 1m
      expect(convertDistanceToMeters(10000, 10)).toBe(1)
    })

    it('should handle fractional results', () => {
      // 500 pixels at 10 px/mm = 50mm = 0.05m
      expect(convertDistanceToMeters(500, 10)).toBe(0.05)
    })
  })

  describe('formatDistance', () => {
    it('should format small distances in cm', () => {
      expect(formatDistance(0.5)).toBe('50.0 cm')
      expect(formatDistance(0.123)).toBe('12.3 cm')
    })

    it('should format distances >= 1m in meters', () => {
      expect(formatDistance(1)).toBe('1.00 m')
      expect(formatDistance(12.345)).toBe('12.35 m')
    })

    it('should handle zero', () => {
      expect(formatDistance(0)).toBe('0.0 cm')
    })
  })
})
