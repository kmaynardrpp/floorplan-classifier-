/**
 * Zone adjacency detection for navigation graph building
 */

import type { Point } from '@/types/zone'
import type { Zone } from '@/types/zone'

/**
 * Bounding box with min/max coordinates
 */
export interface BoundingBoxMinMax {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Get the min/max bounding box of a set of points
 */
export function getBoundingBox(vertices: Point[]): BoundingBoxMinMax {
  if (vertices.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const v of vertices) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Check if two bounding boxes overlap or are within threshold distance
 */
export function doBoundingBoxesOverlap(
  bb1: BoundingBoxMinMax,
  bb2: BoundingBoxMinMax,
  threshold: number = 0
): boolean {
  return !(
    bb1.maxX + threshold < bb2.minX ||
    bb1.minX - threshold > bb2.maxX ||
    bb1.maxY + threshold < bb2.minY ||
    bb1.minY - threshold > bb2.maxY
  )
}

/**
 * Check if two line segments intersect
 * Uses cross product method
 */
export function doSegmentsIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): boolean {
  // Calculate cross products
  const d1 = crossProduct(p3, p4, p1)
  const d2 = crossProduct(p3, p4, p2)
  const d3 = crossProduct(p1, p2, p3)
  const d4 = crossProduct(p1, p2, p4)

  // Check if segments straddle each other
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }

  // Check for collinear cases
  if (d1 === 0 && onSegment(p3, p4, p1)) return true
  if (d2 === 0 && onSegment(p3, p4, p2)) return true
  if (d3 === 0 && onSegment(p1, p2, p3)) return true
  if (d4 === 0 && onSegment(p1, p2, p4)) return true

  return false
}

/**
 * Calculate cross product of vectors (p2-p1) x (p3-p1)
 */
function crossProduct(p1: Point, p2: Point, p3: Point): number {
  return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
}

/**
 * Check if point p is on segment p1-p2 (assuming collinear)
 */
function onSegment(p1: Point, p2: Point, p: Point): boolean {
  return (
    p.x >= Math.min(p1.x, p2.x) &&
    p.x <= Math.max(p1.x, p2.x) &&
    p.y >= Math.min(p1.y, p2.y) &&
    p.y <= Math.max(p1.y, p2.y)
  )
}

/**
 * Calculate distance from a point to a line segment
 */
export function pointToSegmentDistance(
  point: Point,
  segStart: Point,
  segEnd: Point
): number {
  const dx = segEnd.x - segStart.x
  const dy = segEnd.y - segStart.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) {
    // Segment is a point
    return Math.sqrt(
      Math.pow(point.x - segStart.x, 2) + Math.pow(point.y - segStart.y, 2)
    )
  }

  // Project point onto line, clamped to segment
  let t =
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closestX = segStart.x + t * dx
  const closestY = segStart.y + t * dy

  return Math.sqrt(
    Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2)
  )
}

/**
 * Calculate minimum distance between two line segments
 */
export function segmentToSegmentDistance(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point
): number {
  // If segments intersect, distance is 0
  if (doSegmentsIntersect(a1, a2, b1, b2)) {
    return 0
  }

  // Check distances from each endpoint to the other segment
  const d1 = pointToSegmentDistance(a1, b1, b2)
  const d2 = pointToSegmentDistance(a2, b1, b2)
  const d3 = pointToSegmentDistance(b1, a1, a2)
  const d4 = pointToSegmentDistance(b2, a1, a2)

  return Math.min(d1, d2, d3, d4)
}

/**
 * Check if two polygons share an edge or are very close
 */
export function doPolygonsShareEdge(
  vertices1: Point[],
  vertices2: Point[],
  threshold: number = 5
): boolean {
  // Check each edge of polygon1 against each edge of polygon2
  for (let i = 0; i < vertices1.length; i++) {
    const a1 = vertices1[i]!
    const a2 = vertices1[(i + 1) % vertices1.length]!

    for (let j = 0; j < vertices2.length; j++) {
      const b1 = vertices2[j]!
      const b2 = vertices2[(j + 1) % vertices2.length]!

      const dist = segmentToSegmentDistance(a1, a2, b1, b2)
      if (dist <= threshold) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if a point is inside a polygon using ray casting
 */
export function isPointInPolygon(point: Point, vertices: Point[]): boolean {
  if (vertices.length < 3) return false

  let inside = false
  const n = vertices.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]!
    const vj = vertices[j]!

    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Check if two polygons intersect (share area)
 */
export function doPolygonsIntersect(
  vertices1: Point[],
  vertices2: Point[]
): boolean {
  // Check if any edge of polygon1 intersects any edge of polygon2
  for (let i = 0; i < vertices1.length; i++) {
    const a1 = vertices1[i]!
    const a2 = vertices1[(i + 1) % vertices1.length]!

    for (let j = 0; j < vertices2.length; j++) {
      const b1 = vertices2[j]!
      const b2 = vertices2[(j + 1) % vertices2.length]!

      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }

  // Check if one polygon is completely inside the other
  if (vertices1.length > 0 && isPointInPolygon(vertices1[0]!, vertices2)) {
    return true
  }
  if (vertices2.length > 0 && isPointInPolygon(vertices2[0]!, vertices1)) {
    return true
  }

  return false
}

/**
 * Check if two zones are adjacent (can be traversed between)
 *
 * Two zones are considered adjacent if:
 * - Their bounding boxes overlap or are within threshold pixels
 * - AND they share at least one edge within threshold distance
 * - OR their polygons intersect
 *
 * @param zone1 - First zone
 * @param zone2 - Second zone
 * @param threshold - Maximum distance to consider zones adjacent (default: 5px)
 * @returns true if zones are adjacent
 */
export function areZonesAdjacent(
  zone1: Zone,
  zone2: Zone,
  threshold: number = 5
): boolean {
  // Quick bounding box check first (optimization)
  const bb1 = getBoundingBox(zone1.vertices)
  const bb2 = getBoundingBox(zone2.vertices)

  if (!doBoundingBoxesOverlap(bb1, bb2, threshold)) {
    return false
  }

  // Check for polygon intersection
  if (doPolygonsIntersect(zone1.vertices, zone2.vertices)) {
    return true
  }

  // Check for shared edges within threshold
  if (doPolygonsShareEdge(zone1.vertices, zone2.vertices, threshold)) {
    return true
  }

  return false
}

/**
 * Calculate distance between zone centroids
 */
export function getZoneCentroidDistance(zone1: Zone, zone2: Zone): number {
  const c1 = getZoneCentroid(zone1)
  const c2 = getZoneCentroid(zone2)

  return Math.sqrt(Math.pow(c2.x - c1.x, 2) + Math.pow(c2.y - c1.y, 2))
}

/**
 * Calculate zone centroid using the signed area formula
 */
function getZoneCentroid(zone: Zone): Point {
  const vertices = zone.vertices
  if (vertices.length === 0) return { x: 0, y: 0 }
  if (vertices.length === 1) return { x: vertices[0]!.x, y: vertices[0]!.y }
  if (vertices.length === 2) {
    return {
      x: (vertices[0]!.x + vertices[1]!.x) / 2,
      y: (vertices[0]!.y + vertices[1]!.y) / 2,
    }
  }

  let cx = 0
  let cy = 0
  let signedArea = 0

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]!
    const next = vertices[(i + 1) % vertices.length]!

    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    cx += (current.x + next.x) * cross
    cy += (current.y + next.y) * cross
  }

  signedArea /= 2

  if (Math.abs(signedArea) < 1e-10) {
    // Fallback for degenerate polygons
    let sumX = 0
    let sumY = 0
    for (const v of vertices) {
      sumX += v.x
      sumY += v.y
    }
    return { x: sumX / vertices.length, y: sumY / vertices.length }
  }

  cx /= 6 * signedArea
  cy /= 6 * signedArea

  return { x: cx, y: cy }
}
