/**
 * Geometry calculations for aisle zone generation from TDOA pairs
 */

import type { Point } from '@/types/zone'

/**
 * Calculate the 4 vertices of an aisle rectangle from two anchor positions and a margin
 *
 * The rectangle is created with:
 * - Length: distance from source to destination anchor
 * - Width: margin (applied perpendicular to the source-dest line)
 *
 * @param sourcePos - Position of the source anchor (in mm)
 * @param destPos - Position of the destination anchor (in mm)
 * @param margin - Width of the aisle in mm (perpendicular to anchor line)
 * @returns Array of 4 vertices in clockwise order, or empty array if invalid
 */
export function calculateAisleRectangle(
  sourcePos: Point,
  destPos: Point,
  margin: number
): Point[] {
  // Handle edge cases
  if (margin === 0) {
    // Zero margin results in a degenerate rectangle (line)
    // Return empty array as this isn't useful
    return []
  }

  // Calculate direction vector
  const dx = destPos.x - sourcePos.x
  const dy = destPos.y - sourcePos.y

  // Check for zero-length (source === dest)
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length === 0) {
    return []
  }

  // Calculate angle of the line from source to dest
  const angle = Math.atan2(dy, dx)

  // Use absolute value of margin for width calculation
  const halfWidth = Math.abs(margin) / 2

  // Calculate perpendicular offset for width
  // Perpendicular to angle is angle + 90 degrees
  const perpX = -Math.sin(angle) * halfWidth
  const perpY = Math.cos(angle) * halfWidth

  // Create 4 corners of rectangle in clockwise order
  // Starting from source, going clockwise
  const vertices: Point[] = [
    { x: sourcePos.x + perpX, y: sourcePos.y + perpY }, // Source top
    { x: destPos.x + perpX, y: destPos.y + perpY }, // Dest top
    { x: destPos.x - perpX, y: destPos.y - perpY }, // Dest bottom
    { x: sourcePos.x - perpX, y: sourcePos.y - perpY }, // Source bottom
  ]

  return vertices
}

/**
 * Calculate the centroid of a polygon
 *
 * @param vertices - Array of polygon vertices
 * @returns Centroid point
 */
export function calculatePolygonCentroid(vertices: Point[]): Point {
  if (vertices.length === 0) {
    return { x: 0, y: 0 }
  }

  if (vertices.length === 1) {
    return { x: vertices[0]!.x, y: vertices[0]!.y }
  }

  if (vertices.length === 2) {
    // Midpoint for two points
    return {
      x: (vertices[0]!.x + vertices[1]!.x) / 2,
      y: (vertices[0]!.y + vertices[1]!.y) / 2,
    }
  }

  // Use the signed area formula for polygon centroid
  let cx = 0
  let cy = 0
  let signedArea = 0
  const n = vertices.length

  for (let i = 0; i < n; i++) {
    const current = vertices[i]!
    const next = vertices[(i + 1) % n]!

    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    cx += (current.x + next.x) * cross
    cy += (current.y + next.y) * cross
  }

  signedArea /= 2

  // Handle degenerate polygon (zero area)
  if (Math.abs(signedArea) < 1e-10) {
    // Fall back to simple average
    let sumX = 0
    let sumY = 0
    for (const v of vertices) {
      sumX += v.x
      sumY += v.y
    }
    return { x: sumX / n, y: sumY / n }
  }

  cx /= 6 * signedArea
  cy /= 6 * signedArea

  return { x: cx, y: cy }
}

/**
 * Calculate the length of an aisle (distance between anchors)
 *
 * @param sourcePos - Source anchor position
 * @param destPos - Destination anchor position
 * @returns Distance in the same units as input (typically mm)
 */
export function calculateAisleLength(sourcePos: Point, destPos: Point): number {
  const dx = destPos.x - sourcePos.x
  const dy = destPos.y - sourcePos.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Determine the dominant direction of an aisle (horizontal or vertical)
 *
 * @param sourcePos - Source anchor position
 * @param destPos - Destination anchor position
 * @returns 'horizontal' if aisle is more horizontal, 'vertical' if more vertical
 */
export function getAisleDirection(
  sourcePos: Point,
  destPos: Point
): 'horizontal' | 'vertical' {
  const dx = Math.abs(destPos.x - sourcePos.x)
  const dy = Math.abs(destPos.y - sourcePos.y)
  return dx >= dy ? 'horizontal' : 'vertical'
}

/**
 * Check if two rectangles (defined by their vertices) overlap
 *
 * @param rect1 - First rectangle vertices (4 points)
 * @param rect2 - Second rectangle vertices (4 points)
 * @returns true if rectangles overlap
 */
export function doRectanglesOverlap(rect1: Point[], rect2: Point[]): boolean {
  if (rect1.length < 4 || rect2.length < 4) {
    return false
  }

  // Get bounding boxes
  const bb1 = getBoundingBox(rect1)
  const bb2 = getBoundingBox(rect2)

  // Check if bounding boxes overlap
  return !(
    bb1.maxX < bb2.minX ||
    bb1.minX > bb2.maxX ||
    bb1.maxY < bb2.minY ||
    bb1.minY > bb2.maxY
  )
}

/**
 * Get bounding box of a set of points
 */
function getBoundingBox(points: Point[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  return { minX, minY, maxX, maxY }
}

/**
 * Calculate the polygon vertices for a chained aisle from multiple anchor positions
 *
 * Creates a continuous corridor that passes through all anchor positions with
 * consistent width (margin). The polygon "hugs" the anchor path, creating a
 * smooth corridor even when anchors form a curved or angled path.
 *
 * For a chain with anchors [A, B, C, D], this creates a corridor that:
 * - Starts at A with perpendicular endcap
 * - Follows through B and C with proper miter joins at direction changes
 * - Ends at D with perpendicular endcap
 *
 * @param anchorPositions - Ordered array of anchor positions (in mm)
 * @param margin - Width of the aisle in mm (full width, not half)
 * @returns Array of polygon vertices in clockwise order, or empty array if invalid
 */
export function calculateChainedAislePolygon(
  anchorPositions: Point[],
  margin: number
): Point[] {
  // Handle edge cases
  if (margin === 0 || anchorPositions.length < 2) {
    return []
  }

  // For a simple 2-anchor chain, use the regular rectangle function
  if (anchorPositions.length === 2) {
    return calculateAisleRectangle(
      anchorPositions[0]!,
      anchorPositions[1]!,
      margin
    )
  }

  const halfWidth = Math.abs(margin) / 2

  // Build left and right edge points along the path
  const leftEdge: Point[] = []
  const rightEdge: Point[] = []

  for (let i = 0; i < anchorPositions.length; i++) {
    const current = anchorPositions[i]!
    const prev = i > 0 ? anchorPositions[i - 1]! : null
    const next = i < anchorPositions.length - 1 ? anchorPositions[i + 1]! : null

    if (i === 0 && next) {
      // First anchor: perpendicular to direction to next
      const angle = Math.atan2(next.y - current.y, next.x - current.x)
      const perpX = -Math.sin(angle) * halfWidth
      const perpY = Math.cos(angle) * halfWidth

      leftEdge.push({ x: current.x + perpX, y: current.y + perpY })
      rightEdge.push({ x: current.x - perpX, y: current.y - perpY })
    } else if (i === anchorPositions.length - 1 && prev) {
      // Last anchor: perpendicular to direction from prev
      const angle = Math.atan2(current.y - prev.y, current.x - prev.x)
      const perpX = -Math.sin(angle) * halfWidth
      const perpY = Math.cos(angle) * halfWidth

      leftEdge.push({ x: current.x + perpX, y: current.y + perpY })
      rightEdge.push({ x: current.x - perpX, y: current.y - perpY })
    } else if (prev && next) {
      // Middle anchor: use bisector of the angle for smooth miter join
      const inAngle = Math.atan2(current.y - prev.y, current.x - prev.x)
      const outAngle = Math.atan2(next.y - current.y, next.x - current.x)

      // Calculate bisector angle
      const bisectorAngle = (inAngle + outAngle) / 2

      // Calculate the half-angle to determine miter length
      let halfAngle = (outAngle - inAngle) / 2

      // Normalize half angle to [-PI/2, PI/2]
      while (halfAngle > Math.PI / 2) halfAngle -= Math.PI
      while (halfAngle < -Math.PI / 2) halfAngle += Math.PI

      // Miter length (distance from center to edge at corner)
      // Clamp to avoid extremely long miters at sharp angles
      const miterLength =
        Math.abs(Math.cos(halfAngle)) > 0.1
          ? halfWidth / Math.abs(Math.cos(halfAngle))
          : halfWidth * 5 // Max 5x width for very sharp angles

      const clampedMiter = Math.min(miterLength, halfWidth * 3)

      // Perpendicular to bisector
      const perpX = -Math.sin(bisectorAngle) * clampedMiter
      const perpY = Math.cos(bisectorAngle) * clampedMiter

      leftEdge.push({ x: current.x + perpX, y: current.y + perpY })
      rightEdge.push({ x: current.x - perpX, y: current.y - perpY })
    }
  }

  // Combine into a closed polygon: left edge forward, then right edge backward
  const vertices: Point[] = [...leftEdge, ...rightEdge.reverse()]

  return vertices
}

/**
 * Get the start point (first anchor position) of an aisle zone
 * Based on the customProperties stored in the zone metadata
 */
export function getAisleStartpoint(zone: {
  vertices: Point[]
  metadata: { customProperties: Record<string, string> }
}): Point {
  // For a rectangular aisle, the start is the midpoint of the first edge
  if (zone.vertices.length >= 2) {
    const v0 = zone.vertices[0]!
    const v3 = zone.vertices[zone.vertices.length - 1]!
    return {
      x: (v0.x + v3.x) / 2,
      y: (v0.y + v3.y) / 2,
    }
  }
  return zone.vertices[0] ?? { x: 0, y: 0 }
}

/**
 * Get the end point (last anchor position) of an aisle zone
 *
 * For chained aisles, vertices are structured as:
 * [left_0, left_1, ..., left_n, right_n, right_n-1, ..., right_0]
 * So the end edge is at indices (n/2 - 1) and (n/2)
 */
export function getAisleEndpoint(zone: {
  vertices: Point[]
  metadata: { customProperties: Record<string, string> }
}): Point {
  const n = zone.vertices.length
  // For chained aisles, the end edge is at halfN-1 and halfN
  if (n >= 4) {
    const halfN = Math.floor(n / 2)
    const endLeft = zone.vertices[halfN - 1]!
    const endRight = zone.vertices[halfN]!
    return {
      x: (endLeft.x + endRight.x) / 2,
      y: (endLeft.y + endRight.y) / 2,
    }
  }
  return zone.vertices[Math.floor(n / 2)] ?? { x: 0, y: 0 }
}

/**
 * Get the direction vector of an aisle (from start to end)
 * Returns a unit vector
 */
export function getAisleDirectionVector(zone: {
  vertices: Point[]
  metadata: { customProperties: Record<string, string> }
}): Point {
  const start = getAisleStartpoint(zone)
  const end = getAisleEndpoint(zone)

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length === 0) {
    return { x: 1, y: 0 } // Default to horizontal
  }

  return {
    x: dx / length,
    y: dy / length,
  }
}

/**
 * Negate a vector (reverse its direction)
 */
export function negateVector(v: Point): Point {
  return { x: -v.x, y: -v.y }
}
