/**
 * Polygon Clipping Utilities
 *
 * Wrapper around the polygon-clipping library for polygon boolean operations.
 * Used for future features like hole cutting and intersection detection.
 */

import polygonClipping, {
  type Polygon,
  type MultiPolygon,
} from 'polygon-clipping'
import type { Point } from '@/types/zone'

// =============================================================================
// Type Conversions
// =============================================================================

/**
 * Convert our Point[] format to polygon-clipping's coordinate format
 * polygon-clipping expects [x, y] tuples
 */
export function pointsToRing(points: Point[]): Array<[number, number]> {
  if (points.length < 3) {
    throw new Error('A polygon ring must have at least 3 points')
  }

  const ring = points.map((p): [number, number] => [p.x, p.y])

  // Ensure the ring is closed (first point equals last point)
  const first = ring[0]!
  const last = ring[ring.length - 1]!
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]])
  }

  return ring
}

/**
 * Convert polygon-clipping's coordinate format back to our Point[] format
 */
export function ringToPoints(ring: Array<[number, number]>): Point[] {
  // Remove the closing point if it's a duplicate of the first
  let points = ring.map((coord) => ({ x: coord[0], y: coord[1] }))

  if (points.length > 1) {
    const first = points[0]!
    const last = points[points.length - 1]!
    if (first.x === last.x && first.y === last.y) {
      points = points.slice(0, -1)
    }
  }

  return points
}

/**
 * Convert a single polygon (Point[]) to polygon-clipping Polygon format
 * A Polygon is an array of rings: [outerRing, ...holeRings]
 */
export function pointsToPolygon(points: Point[]): Polygon {
  return [pointsToRing(points)]
}

/**
 * Convert polygon-clipping Polygon back to Point[]
 * Only returns the outer ring (ignores holes)
 */
export function polygonToPoints(polygon: Polygon): Point[] {
  if (polygon.length === 0 || polygon[0]!.length < 3) {
    return []
  }
  return ringToPoints(polygon[0]!)
}

/**
 * Convert MultiPolygon to array of Point[]
 */
export function multiPolygonToPointArrays(
  multiPolygon: MultiPolygon
): Point[][] {
  return multiPolygon.map((polygon) => polygonToPoints(polygon))
}

// =============================================================================
// Boolean Operations
// =============================================================================

/**
 * Compute the union of multiple polygons
 * @param polygons - Array of Point[] polygons
 * @returns Array of Point[] representing the union
 */
export function unionPolygons(polygons: Point[][]): Point[][] {
  if (polygons.length === 0) return []
  if (polygons.length === 1) return polygons

  try {
    const converted = polygons.map(pointsToPolygon)
    const result = polygonClipping.union(converted[0]!, ...converted.slice(1))
    return multiPolygonToPointArrays(result)
  } catch (error) {
    console.error('[polygonClipping] Union failed:', error)
    return polygons // Return original on error
  }
}

/**
 * Compute the intersection of two polygons
 * @param polygon1 - First polygon as Point[]
 * @param polygon2 - Second polygon as Point[]
 * @returns Array of Point[] representing the intersection (may be multiple polygons)
 */
export function intersectPolygons(
  polygon1: Point[],
  polygon2: Point[]
): Point[][] {
  try {
    const p1 = pointsToPolygon(polygon1)
    const p2 = pointsToPolygon(polygon2)
    const result = polygonClipping.intersection(p1, p2)
    return multiPolygonToPointArrays(result)
  } catch (error) {
    console.error('[polygonClipping] Intersection failed:', error)
    return []
  }
}

/**
 * Compute the difference of two polygons (polygon1 - polygon2)
 * This effectively "cuts out" polygon2 from polygon1
 * @param polygon1 - Base polygon as Point[]
 * @param polygon2 - Polygon to subtract as Point[]
 * @returns Array of Point[] representing the difference (may be multiple polygons)
 */
export function differencePolygons(
  polygon1: Point[],
  polygon2: Point[]
): Point[][] {
  try {
    const p1 = pointsToPolygon(polygon1)
    const p2 = pointsToPolygon(polygon2)
    const result = polygonClipping.difference(p1, p2)
    return multiPolygonToPointArrays(result)
  } catch (error) {
    console.error('[polygonClipping] Difference failed:', error)
    return [polygon1] // Return original on error
  }
}

/**
 * Compute the XOR (symmetric difference) of two polygons
 * @param polygon1 - First polygon as Point[]
 * @param polygon2 - Second polygon as Point[]
 * @returns Array of Point[] representing the XOR result
 */
export function xorPolygons(polygon1: Point[], polygon2: Point[]): Point[][] {
  try {
    const p1 = pointsToPolygon(polygon1)
    const p2 = pointsToPolygon(polygon2)
    const result = polygonClipping.xor(p1, p2)
    return multiPolygonToPointArrays(result)
  } catch (error) {
    console.error('[polygonClipping] XOR failed:', error)
    return [polygon1, polygon2] // Return original on error
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if two polygons intersect (have any overlapping area)
 * @param polygon1 - First polygon as Point[]
 * @param polygon2 - Second polygon as Point[]
 * @returns true if the polygons intersect
 */
export function polygonsIntersect(
  polygon1: Point[],
  polygon2: Point[]
): boolean {
  const intersection = intersectPolygons(polygon1, polygon2)
  return intersection.length > 0 && intersection.some((p) => p.length >= 3)
}

/**
 * Cut holes in a base polygon using an array of hole polygons
 * @param basePolygon - The polygon to cut holes in
 * @param holes - Array of polygons representing holes to cut
 * @returns Array of resulting polygons (the base with holes cut out)
 */
export function cutHoles(basePolygon: Point[], holes: Point[][]): Point[][] {
  if (holes.length === 0) return [basePolygon]

  let result: Point[][] = [basePolygon]

  for (const hole of holes) {
    const newResult: Point[][] = []
    for (const polygon of result) {
      const diff = differencePolygons(polygon, hole)
      newResult.push(...diff)
    }
    result = newResult
  }

  return result.filter((p) => p.length >= 3)
}

/**
 * Calculate the area of a polygon using the shoelace formula
 * @param points - Polygon vertices
 * @returns Absolute area (always positive)
 */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0

  let area = 0
  const n = points.length

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const p1 = points[i]!
    const p2 = points[j]!
    area += p1.x * p2.y
    area -= p2.x * p1.y
  }

  return Math.abs(area / 2)
}

/**
 * Check if a polygon is valid (has at least 3 points and positive area)
 * @param points - Polygon vertices
 * @returns true if the polygon is valid
 */
export function isValidPolygon(points: Point[]): boolean {
  if (points.length < 3) return false
  return polygonArea(points) > 0
}

/**
 * Simplify a polygon by removing collinear points
 * @param points - Polygon vertices
 * @param tolerance - Distance tolerance for considering points collinear (default: 1)
 * @returns Simplified polygon
 */
export function simplifyPolygon(
  points: Point[],
  tolerance: number = 1
): Point[] {
  if (points.length <= 3) return points

  const result: Point[] = []

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!
    const curr = points[i]!
    const next = points[(i + 1) % points.length]!

    // Calculate the perpendicular distance from curr to the line prev-next
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const length = Math.sqrt(dx * dx + dy * dy)

    if (length === 0) {
      // prev and next are the same point
      result.push(curr)
      continue
    }

    // Cross product gives area of parallelogram, divide by base for height
    const distance =
      Math.abs(dx * (prev.y - curr.y) - (prev.x - curr.x) * dy) / length

    if (distance > tolerance) {
      result.push(curr)
    }
  }

  return result.length >= 3 ? result : points
}
