import { describe, it, expect } from 'vitest'
import {
  buildNavigationGraph,
  findNearestNode,
  getNodeEdges,
  getNodeById,
  isGraphConnected,
} from './graphBuilder'
import type { Zone } from '@/types/zone'
import { createZone } from '@/types/zone'
import type { NavigationGraph } from '@/types/route'

// Helper to create a travelable zone (2D area style - from coverage)
function makeTravelableZone(
  id: string,
  vertices: Array<{ x: number; y: number }>
): Zone {
  return {
    ...createZone({
      id,
      name: `Zone ${id}`,
      type: 'travel_lane',
      vertices,
    }),
    source: 'coverage', // Mark as 2D area
  }
}

// Helper to create a non-travelable zone
function makeBlockedZone(
  id: string,
  vertices: Array<{ x: number; y: number }>
): Zone {
  return createZone({
    id,
    name: `Zone ${id}`,
    type: 'racking',
    vertices,
  })
}

// Helper to create a 1D aisle zone (from TDOA)
function makeAisleZone(
  id: string,
  vertices: Array<{ x: number; y: number }>
): Zone {
  return {
    ...createZone({
      id,
      name: `Aisle ${id}`,
      type: 'aisle_path',
      vertices,
    }),
    source: 'tdoa', // Mark as 1D aisle
  }
}

describe('graphBuilder', () => {
  describe('buildNavigationGraph', () => {
    it('should return empty graph for no zones', () => {
      const graph = buildNavigationGraph([])

      expect(graph.nodes).toHaveLength(0)
      expect(graph.edges).toHaveLength(0)
    })

    it('should return empty graph for only non-travelable zones', () => {
      const zones = [
        makeBlockedZone('z1', [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
      ]

      const graph = buildNavigationGraph(zones)

      expect(graph.nodes).toHaveLength(0)
    })

    it('should create waypoint nodes for travelable zones', () => {
      const zones = [
        makeTravelableZone('z1', [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
      ]

      const graph = buildNavigationGraph(zones)

      // Should have at least one waypoint (centroid)
      expect(graph.nodes.length).toBeGreaterThanOrEqual(1)
      // All nodes should belong to the zone
      expect(graph.nodes.every((n) => n.zoneId === 'z1')).toBe(true)
      // Centroid (50, 50) should be included as a waypoint
      const hasCentroid = graph.nodes.some(
        (n) =>
          Math.abs(n.position.x - 50) < 1 && Math.abs(n.position.y - 50) < 1
      )
      expect(hasCentroid).toBe(true)
    })

    it('should create edges between adjacent travelable zones', () => {
      const zones = [
        makeTravelableZone('z1', [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
        makeTravelableZone('z2', [
          { x: 100, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
          { x: 100, y: 100 },
        ]),
      ]

      const graph = buildNavigationGraph(zones)

      // Should have waypoints for both zones
      expect(graph.nodes.some((n) => n.zoneId === 'z1')).toBe(true)
      expect(graph.nodes.some((n) => n.zoneId === 'z2')).toBe(true)
      // Should have bidirectional edges between zones
      expect(graph.edges.length).toBeGreaterThanOrEqual(2)
      // Should have cross-zone edges
      const crossZoneEdges = graph.edges.filter((e) => {
        const fromNode = graph.nodes.find((n) => n.id === e.from)
        const toNode = graph.nodes.find((n) => n.id === e.to)
        return fromNode && toNode && fromNode.zoneId !== toNode.zoneId
      })
      expect(crossZoneEdges.length).toBeGreaterThanOrEqual(2)
    })

    it('should not create edges between non-adjacent zones', () => {
      const zones = [
        makeTravelableZone('z1', [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ]),
        makeTravelableZone('z2', [
          { x: 500, y: 500 },
          { x: 600, y: 500 },
          { x: 600, y: 600 },
          { x: 500, y: 600 },
        ]),
      ]

      const graph = buildNavigationGraph(zones)

      // Should have waypoints for both zones
      expect(graph.nodes.some((n) => n.zoneId === 'z1')).toBe(true)
      expect(graph.nodes.some((n) => n.zoneId === 'z2')).toBe(true)
      // No cross-zone edges (zones are too far apart)
      const crossZoneEdges = graph.edges.filter((e) => {
        const fromNode = graph.nodes.find((n) => n.id === e.from)
        const toNode = graph.nodes.find((n) => n.id === e.to)
        return fromNode && toNode && fromNode.zoneId !== toNode.zoneId
      })
      expect(crossZoneEdges).toHaveLength(0)
    })

    it('should create sequential waypoints for 1D aisles', () => {
      // Create a long narrow aisle (1D)
      const zones = [
        makeAisleZone('aisle1', [
          // Vertices for a narrow rectangle: 20 wide, 400 long
          { x: 0, y: 0 },
          { x: 0, y: 400 },
          { x: 20, y: 400 },
          { x: 20, y: 0 },
        ]),
      ]

      const graph = buildNavigationGraph(zones, [], 100) // 100px max step

      // Should have multiple waypoints along the aisle
      expect(graph.nodes.length).toBeGreaterThanOrEqual(3)
      // All nodes should be for the aisle
      expect(graph.nodes.every((n) => n.zoneId === 'aisle1')).toBe(true)
      // Should have start and end waypoints
      const hasStart = graph.nodes.some((n) => n.aislePosition === 'start')
      const hasEnd = graph.nodes.some((n) => n.aislePosition === 'end')
      expect(hasStart).toBe(true)
      expect(hasEnd).toBe(true)
    })

    it('should track aisle zone IDs', () => {
      const zones = [
        makeAisleZone('aisle1', [
          { x: 0, y: 0 },
          { x: 0, y: 200 },
          { x: 20, y: 200 },
          { x: 20, y: 0 },
        ]),
        makeTravelableZone('z1', [
          { x: 50, y: 0 },
          { x: 150, y: 0 },
          { x: 150, y: 100 },
          { x: 50, y: 100 },
        ]),
      ]

      const graph = buildNavigationGraph(zones)

      expect(graph.aisleZoneIds.has('aisle1')).toBe(true)
      expect(graph.aisleZoneIds.has('z1')).toBe(false)
    })
  })

  describe('findNearestNode', () => {
    it('should return null for empty graph', () => {
      const graph: NavigationGraph = { nodes: [], edges: [] }

      expect(findNearestNode({ x: 0, y: 0 }, graph)).toBeNull()
    })

    it('should find nearest node', () => {
      const graph: NavigationGraph = {
        nodes: [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 100, y: 100 }, zoneId: 'z3' },
        ],
        edges: [],
      }

      const nearest = findNearestNode({ x: 90, y: 10 }, graph)

      expect(nearest).not.toBeNull()
      expect(nearest!.id).toBe('n2')
    })
  })

  describe('getNodeEdges', () => {
    it('should return empty array for node with no edges', () => {
      const graph: NavigationGraph = {
        nodes: [{ id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' }],
        edges: [],
      }

      expect(getNodeEdges('n1', graph)).toHaveLength(0)
    })

    it('should return all edges from a node', () => {
      const graph: NavigationGraph = {
        nodes: [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 0, y: 100 }, zoneId: 'z3' },
        ],
        edges: [
          { from: 'n1', to: 'n2', weight: 100 },
          { from: 'n1', to: 'n3', weight: 100 },
          { from: 'n2', to: 'n3', weight: 141 },
        ],
      }

      const n1Edges = getNodeEdges('n1', graph)

      expect(n1Edges).toHaveLength(2)
      expect(n1Edges.map((e) => e.to).sort()).toEqual(['n2', 'n3'])
    })
  })

  describe('getNodeById', () => {
    it('should return undefined for non-existent node', () => {
      const graph: NavigationGraph = { nodes: [], edges: [] }

      expect(getNodeById('n1', graph)).toBeUndefined()
    })

    it('should return node by id', () => {
      const graph: NavigationGraph = {
        nodes: [{ id: 'n1', position: { x: 50, y: 50 }, zoneId: 'z1' }],
        edges: [],
      }

      const node = getNodeById('n1', graph)

      expect(node).toBeDefined()
      expect(node!.position).toEqual({ x: 50, y: 50 })
    })
  })

  describe('isGraphConnected', () => {
    it('should return true for empty graph', () => {
      const graph: NavigationGraph = { nodes: [], edges: [] }

      expect(isGraphConnected(graph)).toBe(true)
    })

    it('should return true for single node', () => {
      const graph: NavigationGraph = {
        nodes: [{ id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' }],
        edges: [],
      }

      expect(isGraphConnected(graph)).toBe(true)
    })

    it('should return true for connected graph', () => {
      const graph: NavigationGraph = {
        nodes: [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 100, y: 100 }, zoneId: 'z3' },
        ],
        edges: [
          { from: 'n1', to: 'n2', weight: 100 },
          { from: 'n2', to: 'n1', weight: 100 },
          { from: 'n2', to: 'n3', weight: 100 },
          { from: 'n3', to: 'n2', weight: 100 },
        ],
      }

      expect(isGraphConnected(graph)).toBe(true)
    })

    it('should return false for disconnected graph', () => {
      const graph: NavigationGraph = {
        nodes: [
          { id: 'n1', position: { x: 0, y: 0 }, zoneId: 'z1' },
          { id: 'n2', position: { x: 100, y: 0 }, zoneId: 'z2' },
          { id: 'n3', position: { x: 500, y: 500 }, zoneId: 'z3' }, // Isolated
        ],
        edges: [
          { from: 'n1', to: 'n2', weight: 100 },
          { from: 'n2', to: 'n1', weight: 100 },
          // n3 has no connections
        ],
      }

      expect(isGraphConnected(graph)).toBe(false)
    })
  })
})
