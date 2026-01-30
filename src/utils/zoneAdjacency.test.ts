import { describe, it, expect } from 'vitest'
import {
  areZonesAdjacent,
  getZoneCentroidDistance,
  isPointInPolygon,
} from './zoneAdjacency'
import type { Zone } from '@/types/zone'
import { createZone } from '@/types/zone'

// Helper to create a simple zone with vertices
function makeZone(id: string, vertices: Array<{ x: number; y: number }>): Zone {
  return createZone({
    id,
    name: `Zone ${id}`,
    type: 'travel_lane',
    vertices,
  })
}

describe('zoneAdjacency', () => {
  describe('areZonesAdjacent', () => {
    it('should detect adjacent zones sharing an edge', () => {
      // Two rectangles sharing a vertical edge
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 100, y: 100 },
      ])

      expect(areZonesAdjacent(zone1, zone2)).toBe(true)
    })

    it('should detect adjacent zones with small gap', () => {
      // Two rectangles with 5px gap (within default threshold)
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 105, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 105, y: 100 },
      ])

      expect(areZonesAdjacent(zone1, zone2, 10)).toBe(true)
    })

    it('should not detect non-adjacent zones', () => {
      // Two rectangles far apart
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 500, y: 500 },
        { x: 600, y: 500 },
        { x: 600, y: 600 },
        { x: 500, y: 600 },
      ])

      expect(areZonesAdjacent(zone1, zone2)).toBe(false)
    })

    it('should detect overlapping zones', () => {
      // Two overlapping rectangles
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 50, y: 50 },
        { x: 150, y: 50 },
        { x: 150, y: 150 },
        { x: 50, y: 150 },
      ])

      expect(areZonesAdjacent(zone1, zone2)).toBe(true)
    })

    it('should detect corner-touching zones as adjacent', () => {
      // Two rectangles touching at a corner
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ])

      expect(areZonesAdjacent(zone1, zone2, 5)).toBe(true)
    })
  })

  describe('getZoneCentroidDistance', () => {
    it('should calculate distance between zone centroids', () => {
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])
      const zone2 = makeZone('z2', [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 100, y: 100 },
      ])

      // Centroids are at (50, 50) and (150, 50)
      expect(getZoneCentroidDistance(zone1, zone2)).toBe(100)
    })

    it('should handle non-rectangular zones', () => {
      const zone1 = makeZone('z1', [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 30 },
      ])
      const zone2 = makeZone('z2', [
        { x: 100, y: 100 },
        { x: 130, y: 100 },
        { x: 130, y: 130 },
      ])

      // Distance should be positive
      const distance = getZoneCentroidDistance(zone1, zone2)
      expect(distance).toBeGreaterThan(0)
    })
  })

  describe('isPointInPolygon', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]

    it('should return true for point inside polygon', () => {
      expect(isPointInPolygon({ x: 50, y: 50 }, square)).toBe(true)
    })

    it('should return false for point outside polygon', () => {
      expect(isPointInPolygon({ x: 150, y: 50 }, square)).toBe(false)
      expect(isPointInPolygon({ x: -10, y: 50 }, square)).toBe(false)
    })

    it('should handle points on edge as inside', () => {
      // Points on edges are considered inside by ray casting
      expect(isPointInPolygon({ x: 0, y: 50 }, square)).toBe(true)
    })

    it('should work with triangles', () => {
      const triangle = [
        { x: 50, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]

      expect(isPointInPolygon({ x: 50, y: 50 }, triangle)).toBe(true)
      expect(isPointInPolygon({ x: 10, y: 10 }, triangle)).toBe(false)
    })
  })
})
