import { describe, it, expect } from 'vitest'
import {
  getCentroid,
  getPolygonBounds,
  getPolygonArea,
  pointToSegmentDistance,
  findClosestEdge,
  findClosestVertex,
} from './geometry'

describe('getCentroid', () => {
  it('should return {0,0} for empty array', () => {
    const centroid = getCentroid([])
    expect(centroid).toEqual({ x: 0, y: 0 })
  })

  it('should return the point itself for single vertex', () => {
    const centroid = getCentroid([{ x: 50, y: 100 }])
    expect(centroid).toEqual({ x: 50, y: 100 })
  })

  it('should return midpoint for two vertices', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ])
    expect(centroid).toEqual({ x: 50, y: 50 })
  })

  it('should calculate centroid of a triangle', () => {
    // Equilateral-ish triangle
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 86.6 },
    ])
    // Centroid should be at approximately (50, 28.87)
    expect(centroid.x).toBeCloseTo(50, 0)
    expect(centroid.y).toBeCloseTo(28.87, 0)
  })

  it('should calculate centroid of a rectangle', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ])
    expect(centroid.x).toBeCloseTo(50, 1)
    expect(centroid.y).toBeCloseTo(25, 1)
  })

  it('should calculate centroid of a square', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    expect(centroid.x).toBeCloseTo(50, 1)
    expect(centroid.y).toBeCloseTo(50, 1)
  })

  it('should handle counter-clockwise vertices', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
    ])
    expect(centroid.x).toBeCloseTo(50, 1)
    expect(centroid.y).toBeCloseTo(50, 1)
  })

  it('should handle irregular polygon', () => {
    // L-shaped polygon
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ])
    // Centroid should be somewhere in the middle of the L
    expect(centroid.x).toBeGreaterThan(0)
    expect(centroid.x).toBeLessThan(100)
    expect(centroid.y).toBeGreaterThan(0)
    expect(centroid.y).toBeLessThan(100)
  })

  it('should handle collinear points (degenerate case)', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ])
    // Should fall back to simple average
    expect(centroid.x).toBeCloseTo(50, 1)
    expect(centroid.y).toBeCloseTo(0, 1)
  })

  it('should handle very small polygons', () => {
    const centroid = getCentroid([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ])
    expect(centroid.x).toBeCloseTo(0.5, 1)
    expect(centroid.y).toBeCloseTo(0.33, 1)
  })
})

describe('getPolygonBounds', () => {
  it('should return zero bounds for empty array', () => {
    const bounds = getPolygonBounds([])
    expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('should handle single point', () => {
    const bounds = getPolygonBounds([{ x: 50, y: 100 }])
    expect(bounds.x).toBe(50)
    expect(bounds.y).toBe(100)
    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
  })

  it('should calculate bounds of rectangle', () => {
    const bounds = getPolygonBounds([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ])
    expect(bounds.x).toBe(10)
    expect(bounds.y).toBe(20)
    expect(bounds.width).toBe(100)
    expect(bounds.height).toBe(50)
  })

  it('should handle irregular polygon', () => {
    const bounds = getPolygonBounds([
      { x: 5, y: 10 },
      { x: 200, y: 50 },
      { x: 150, y: 300 },
      { x: 0, y: 100 },
    ])
    expect(bounds.x).toBe(0)
    expect(bounds.y).toBe(10)
    expect(bounds.width).toBe(200)
    expect(bounds.height).toBe(290)
  })
})

describe('getPolygonArea', () => {
  it('should return 0 for less than 3 vertices', () => {
    expect(getPolygonArea([])).toBe(0)
    expect(getPolygonArea([{ x: 0, y: 0 }])).toBe(0)
    expect(
      getPolygonArea([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ])
    ).toBe(0)
  })

  it('should calculate area of a square', () => {
    const area = getPolygonArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
    expect(area).toBe(100)
  })

  it('should calculate area of a triangle', () => {
    const area = getPolygonArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ])
    expect(area).toBe(50)
  })

  it('should handle clockwise and counter-clockwise', () => {
    const clockwise = getPolygonArea([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
    const counterClockwise = getPolygonArea([
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
    ])
    expect(clockwise).toBe(counterClockwise)
  })
})

describe('pointToSegmentDistance', () => {
  it('should return 0 for point on segment', () => {
    const result = pointToSegmentDistance(
      { x: 50, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    )
    expect(result.distance).toBe(0)
    expect(result.closestPoint).toEqual({ x: 50, y: 0 })
  })

  it('should calculate perpendicular distance', () => {
    const result = pointToSegmentDistance(
      { x: 50, y: 10 },
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    )
    expect(result.distance).toBe(10)
    expect(result.closestPoint).toEqual({ x: 50, y: 0 })
  })

  it('should handle point past segment end', () => {
    const result = pointToSegmentDistance(
      { x: 150, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    )
    expect(result.distance).toBe(50)
    expect(result.closestPoint).toEqual({ x: 100, y: 0 })
  })
})

describe('findClosestEdge', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('should return null for insufficient vertices', () => {
    expect(findClosestEdge({ x: 50, y: 50 }, [], 10)).toBeNull()
    expect(findClosestEdge({ x: 50, y: 50 }, [{ x: 0, y: 0 }], 10)).toBeNull()
  })

  it('should find closest edge', () => {
    const result = findClosestEdge({ x: 50, y: 5 }, square, 10)
    expect(result).not.toBeNull()
    expect(result!.edgeIndex).toBe(0) // Top edge
  })

  it('should return null if point is too far', () => {
    const result = findClosestEdge({ x: 50, y: 50 }, square, 10)
    expect(result).toBeNull()
  })
})

describe('findClosestVertex', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]

  it('should return null for empty vertices', () => {
    expect(findClosestVertex({ x: 0, y: 0 }, [], 10)).toBeNull()
  })

  it('should find closest vertex', () => {
    const result = findClosestVertex({ x: 5, y: 5 }, square, 10)
    expect(result).not.toBeNull()
    expect(result!.vertexIndex).toBe(0) // Top-left corner
  })

  it('should return null if point is too far', () => {
    const result = findClosestVertex({ x: 50, y: 50 }, square, 10)
    expect(result).toBeNull()
  })
})
