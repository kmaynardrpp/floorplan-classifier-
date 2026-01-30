import type { Point, BoundingBox } from '@/types/zone'

/**
 * Calculate the centroid (geometric center) of a polygon
 * Uses the formula for the centroid of a simple polygon
 * @param vertices - Array of polygon vertices
 * @returns Centroid point, or {0,0} for empty/invalid input
 */
export function getCentroid(vertices: Point[]): Point {
  if (vertices.length === 0) {
    return { x: 0, y: 0 }
  }

  if (vertices.length === 1) {
    const v = vertices[0]!
    return { x: v.x, y: v.y }
  }

  if (vertices.length === 2) {
    const v0 = vertices[0]!
    const v1 = vertices[1]!
    // Midpoint of line segment
    return {
      x: (v0.x + v1.x) / 2,
      y: (v0.y + v1.y) / 2,
    }
  }

  // Calculate signed area and centroid using the shoelace formula
  let signedArea = 0
  let cx = 0
  let cy = 0

  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]!
    const next = vertices[(i + 1) % vertices.length]!

    const cross = current.x * next.y - next.x * current.y
    signedArea += cross
    cx += (current.x + next.x) * cross
    cy += (current.y + next.y) * cross
  }

  signedArea /= 2

  // Handle degenerate case (collinear points)
  if (Math.abs(signedArea) < 1e-10) {
    // Fall back to simple average
    const sumX = vertices.reduce((sum, v) => sum + v.x, 0)
    const sumY = vertices.reduce((sum, v) => sum + v.y, 0)
    return {
      x: sumX / vertices.length,
      y: sumY / vertices.length,
    }
  }

  const factor = 1 / (6 * signedArea)
  return {
    x: cx * factor,
    y: cy * factor,
  }
}

/**
 * Calculate the bounding box of a polygon
 * @param vertices - Array of polygon vertices
 * @returns Bounding box containing all vertices
 */
export function getPolygonBounds(vertices: Point[]): BoundingBox {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
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

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Calculate the area of a polygon using the shoelace formula
 * @param vertices - Array of polygon vertices
 * @returns Absolute area of the polygon
 */
export function getPolygonArea(vertices: Point[]): number {
  if (vertices.length < 3) return 0

  let area = 0
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i]!
    const next = vertices[(i + 1) % vertices.length]!
    area += current.x * next.y - next.x * current.y
  }

  return Math.abs(area / 2)
}

/**
 * Calculate the distance from a point to a line segment
 * @param point The point to check
 * @param lineStart Start of the line segment
 * @param lineEnd End of the line segment
 * @returns The distance and the closest point on the line segment
 */
export function pointToSegmentDistance(
  point: Point,
  lineStart: Point,
  lineEnd: Point
): { distance: number; closestPoint: Point } {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSquared = dx * dx + dy * dy

  // If the segment is a point, return distance to that point
  if (lengthSquared === 0) {
    const distance = Math.sqrt(
      Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
    )
    return { distance, closestPoint: { ...lineStart } }
  }

  // Calculate projection of point onto line (clamped to segment)
  let t =
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) /
    lengthSquared
  t = Math.max(0, Math.min(1, t))

  const closestPoint: Point = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  }

  const distance = Math.sqrt(
    Math.pow(point.x - closestPoint.x, 2) +
      Math.pow(point.y - closestPoint.y, 2)
  )

  return { distance, closestPoint }
}

/**
 * Find the closest edge of a polygon to a point
 * @param point The point to check
 * @param vertices The polygon vertices
 * @param maxDistance Maximum distance to consider (pixels)
 * @returns The edge index (segment from vertex[index] to vertex[index+1]) and closest point, or null if too far
 */
export function findClosestEdge(
  point: Point,
  vertices: Point[],
  maxDistance: number = 10
): { edgeIndex: number; closestPoint: Point; distance: number } | null {
  if (vertices.length < 2) return null

  let closestEdge: {
    edgeIndex: number
    closestPoint: Point
    distance: number
  } | null = null

  for (let i = 0; i < vertices.length; i++) {
    const start = vertices[i]!
    const end = vertices[(i + 1) % vertices.length]!

    const { distance, closestPoint } = pointToSegmentDistance(point, start, end)

    if (
      distance <= maxDistance &&
      (closestEdge === null || distance < closestEdge.distance)
    ) {
      closestEdge = { edgeIndex: i, closestPoint, distance }
    }
  }

  return closestEdge
}

/**
 * Check if a point is near any vertex of a polygon
 * @param point The point to check
 * @param vertices The polygon vertices
 * @param maxDistance Maximum distance to consider (pixels)
 * @returns The vertex index and distance, or null if too far from any vertex
 */
export function findClosestVertex(
  point: Point,
  vertices: Point[],
  maxDistance: number = 10
): { vertexIndex: number; distance: number } | null {
  let closest: { vertexIndex: number; distance: number } | null = null

  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i]!
    const distance = Math.sqrt(
      Math.pow(point.x - vertex.x, 2) + Math.pow(point.y - vertex.y, 2)
    )

    if (
      distance <= maxDistance &&
      (closest === null || distance < closest.distance)
    ) {
      closest = { vertexIndex: i, distance }
    }
  }

  return closest
}

// =============================================================================
// Ray and Line Intersection Functions
// =============================================================================

/**
 * Find the intersection of two line segments
 *
 * Uses the parametric line intersection formula.
 * Returns null if lines don't intersect within their segment bounds.
 *
 * @param p1 Start of first segment
 * @param p2 End of first segment
 * @param p3 Start of second segment
 * @param p4 End of second segment
 * @returns Intersection point or null if no intersection
 */
export function lineSegmentIntersection(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): Point | null {
  const x1 = p1.x,
    y1 = p1.y
  const x2 = p2.x,
    y2 = p2.y
  const x3 = p3.x,
    y3 = p3.y
  const x4 = p4.x,
    y4 = p4.y

  // Calculate denominators
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)

  // Lines are parallel (or coincident)
  if (Math.abs(denom) < 1e-10) {
    return null
  }

  // Calculate t parameter for first segment
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom

  // Calculate u parameter for second segment
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom

  // Check if intersection is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    }
  }

  return null
}

/**
 * Find the intersection of a ray with a line segment
 *
 * A ray starts at origin and extends infinitely in the direction specified.
 *
 * @param rayOrigin Start point of the ray
 * @param rayDirection Direction vector of the ray (doesn't need to be normalized)
 * @param segStart Start of the segment
 * @param segEnd End of the segment
 * @returns Intersection point and distance along ray, or null if no intersection
 */
export function raySegmentIntersection(
  rayOrigin: Point,
  rayDirection: Point,
  segStart: Point,
  segEnd: Point
): { point: Point; distance: number } | null {
  const x1 = rayOrigin.x,
    y1 = rayOrigin.y
  const dx = rayDirection.x,
    dy = rayDirection.y
  const x3 = segStart.x,
    y3 = segStart.y
  const x4 = segEnd.x,
    y4 = segEnd.y

  // Segment direction
  const sx = x4 - x3
  const sy = y4 - y3

  // Calculate denominator
  const denom = dx * sy - dy * sx

  // Ray and segment are parallel
  if (Math.abs(denom) < 1e-10) {
    return null
  }

  // Calculate t (distance along ray) and u (position along segment)
  const t = ((x3 - x1) * sy - (y3 - y1) * sx) / denom
  const u = ((x3 - x1) * dy - (y3 - y1) * dx) / denom

  // t must be positive (ray goes forward) and u must be in [0,1] (within segment)
  if (t >= 0 && u >= 0 && u <= 1) {
    return {
      point: {
        x: x1 + t * dx,
        y: y1 + t * dy,
      },
      distance: t * Math.sqrt(dx * dx + dy * dy),
    }
  }

  return null
}

/**
 * Find the first intersection of a ray with a polygon boundary
 *
 * Checks all edges of the polygon and returns the closest intersection point.
 *
 * @param rayOrigin Start point of the ray
 * @param rayDirection Direction vector of the ray
 * @param polygon Polygon vertices (closed polygon, first != last)
 * @returns Closest intersection point, distance, and edge index, or null if no intersection
 */
export function rayPolygonIntersection(
  rayOrigin: Point,
  rayDirection: Point,
  polygon: Point[]
): { point: Point; distance: number; edgeIndex: number } | null {
  if (polygon.length < 3) {
    return null
  }

  let closestResult: {
    point: Point
    distance: number
    edgeIndex: number
  } | null = null

  for (let i = 0; i < polygon.length; i++) {
    const segStart = polygon[i]!
    const segEnd = polygon[(i + 1) % polygon.length]!

    const result = raySegmentIntersection(
      rayOrigin,
      rayDirection,
      segStart,
      segEnd
    )

    if (
      result &&
      (closestResult === null || result.distance < closestResult.distance)
    ) {
      // Skip if intersection is at the ray origin (within small epsilon)
      if (result.distance > 1e-6) {
        closestResult = {
          point: result.point,
          distance: result.distance,
          edgeIndex: i,
        }
      }
    }
  }

  return closestResult
}

/**
 * Find all intersections of a ray with a polygon boundary
 *
 * @param rayOrigin Start point of the ray
 * @param rayDirection Direction vector of the ray
 * @param polygon Polygon vertices
 * @returns Array of intersections sorted by distance
 */
export function rayPolygonAllIntersections(
  rayOrigin: Point,
  rayDirection: Point,
  polygon: Point[]
): Array<{ point: Point; distance: number; edgeIndex: number }> {
  if (polygon.length < 3) {
    return []
  }

  const results: Array<{ point: Point; distance: number; edgeIndex: number }> =
    []

  for (let i = 0; i < polygon.length; i++) {
    const segStart = polygon[i]!
    const segEnd = polygon[(i + 1) % polygon.length]!

    const result = raySegmentIntersection(
      rayOrigin,
      rayDirection,
      segStart,
      segEnd
    )

    if (result && result.distance > 1e-6) {
      results.push({
        point: result.point,
        distance: result.distance,
        edgeIndex: i,
      })
    }
  }

  // Sort by distance
  results.sort((a, b) => a.distance - b.distance)

  return results
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 *
 * @param point Point to check
 * @param polygon Polygon vertices
 * @returns true if point is inside the polygon
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) {
    return false
  }

  let inside = false
  const x = point.x
  const y = point.y

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Calculate the distance between two points
 *
 * @param p1 First point
 * @param p2 Second point
 * @returns Euclidean distance
 */
export function pointDistance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Normalize a vector to unit length
 *
 * @param v Vector to normalize
 * @returns Unit vector in the same direction
 */
export function normalizeVector(v: Point): Point {
  const length = Math.sqrt(v.x * v.x + v.y * v.y)
  if (length < 1e-10) {
    return { x: 0, y: 0 }
  }
  return { x: v.x / length, y: v.y / length }
}

/**
 * Check if two polygons overlap (intersect or one contains the other)
 *
 * Uses a combination of:
 * 1. Vertex containment check (any vertex of A inside B or vice versa)
 * 2. Edge intersection check (any edges cross)
 *
 * @param polygonA First polygon vertices
 * @param polygonB Second polygon vertices
 * @returns true if polygons overlap
 */
export function polygonsOverlap(polygonA: Point[], polygonB: Point[]): boolean {
  if (polygonA.length < 3 || polygonB.length < 3) {
    return false
  }

  // Quick bounding box check first (optimization)
  const boundsA = getPolygonBounds(polygonA)
  const boundsB = getPolygonBounds(polygonB)

  // Check if bounding boxes don't overlap
  if (
    boundsA.x + boundsA.width < boundsB.x ||
    boundsB.x + boundsB.width < boundsA.x ||
    boundsA.y + boundsA.height < boundsB.y ||
    boundsB.y + boundsB.height < boundsA.y
  ) {
    return false
  }

  // Check if any vertex of A is inside B
  for (const vertex of polygonA) {
    if (pointInPolygon(vertex, polygonB)) {
      return true
    }
  }

  // Check if any vertex of B is inside A
  for (const vertex of polygonB) {
    if (pointInPolygon(vertex, polygonA)) {
      return true
    }
  }

  // Check if any edges intersect
  for (let i = 0; i < polygonA.length; i++) {
    const a1 = polygonA[i]!
    const a2 = polygonA[(i + 1) % polygonA.length]!

    for (let j = 0; j < polygonB.length; j++) {
      const b1 = polygonB[j]!
      const b2 = polygonB[(j + 1) % polygonB.length]!

      if (lineSegmentIntersection(a1, a2, b1, b2)) {
        return true
      }
    }
  }

  return false
}

/**
 * Find the closest point on a polygon boundary to a given point
 *
 * @param point The point to find closest boundary point for
 * @param polygon The polygon vertices
 * @returns The closest point on the polygon boundary and the distance
 */
export function closestPointOnPolygon(
  point: Point,
  polygon: Point[]
): { closestPoint: Point; distance: number; edgeIndex: number } {
  if (polygon.length < 2) {
    return { closestPoint: { x: 0, y: 0 }, distance: Infinity, edgeIndex: -1 }
  }

  let bestResult = {
    closestPoint: { x: 0, y: 0 },
    distance: Infinity,
    edgeIndex: -1,
  }

  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i]!
    const end = polygon[(i + 1) % polygon.length]!

    const { distance, closestPoint } = pointToSegmentDistance(point, start, end)

    if (distance < bestResult.distance) {
      bestResult = { closestPoint, distance, edgeIndex: i }
    }
  }

  return bestResult
}

/**
 * Move a point that's outside a polygon to inside the polygon
 * by moving it toward the polygon centroid
 *
 * @param point The point to move (if outside)
 * @param polygon The polygon to move the point into
 * @param insetDistance How far inside the boundary to place the point (default 5px)
 * @returns The adjusted point (inside polygon) or original if already inside
 */
export function movePointInsidePolygon(
  point: Point,
  polygon: Point[],
  insetDistance: number = 5
): { point: Point; wasOutside: boolean; distanceMoved: number } {
  if (polygon.length < 3) {
    return { point, wasOutside: false, distanceMoved: 0 }
  }

  // Check if already inside
  if (pointInPolygon(point, polygon)) {
    return { point, wasOutside: false, distanceMoved: 0 }
  }

  // Point is outside - move it toward the centroid
  const centroid = getCentroid(polygon)

  // Direction from point toward centroid
  const dx = centroid.x - point.x
  const dy = centroid.y - point.y
  const dirLength = Math.sqrt(dx * dx + dy * dy)

  if (dirLength < 1e-6) {
    // Point is at centroid (shouldn't happen if outside)
    return { point, wasOutside: true, distanceMoved: 0 }
  }

  // Normalized direction toward centroid
  const direction: Point = { x: dx / dirLength, y: dy / dirLength }

  // Find where the ray from point toward centroid intersects the polygon
  const intersection = rayPolygonIntersection(point, direction, polygon)

  if (!intersection) {
    // Fallback: snap to closest point on polygon boundary
    const { closestPoint } = closestPointOnPolygon(point, polygon)
    const distanceMoved = pointDistance(point, closestPoint)
    return { point: closestPoint, wasOutside: true, distanceMoved }
  }

  // Place the point slightly inside the intersection (insetDistance pixels inside)
  const newPoint: Point = {
    x: intersection.point.x + direction.x * insetDistance,
    y: intersection.point.y + direction.y * insetDistance,
  }

  // Verify the new point is inside (if not, use intersection point)
  if (!pointInPolygon(newPoint, polygon)) {
    // The inset went too far, use the intersection point directly
    const distanceMoved = pointDistance(point, intersection.point)
    return { point: intersection.point, wasOutside: true, distanceMoved }
  }

  const distanceMoved = pointDistance(point, newPoint)
  return { point: newPoint, wasOutside: true, distanceMoved }
}

/**
 * Calculate what percentage of polygonA overlaps with polygonB
 * Uses a sampling approach for speed
 *
 * @param polygonA The polygon to measure overlap for
 * @param polygonB The polygon to check against
 * @param sampleCount Number of sample points (higher = more accurate but slower)
 * @returns Approximate overlap percentage (0-1)
 */
export function polygonOverlapPercentage(
  polygonA: Point[],
  polygonB: Point[],
  sampleCount: number = 100
): number {
  if (polygonA.length < 3 || polygonB.length < 3) {
    return 0
  }

  // Get bounding box of polygon A for sampling
  const bounds = getPolygonBounds(polygonA)

  // Generate sample points within bounding box
  let insideA = 0
  let insideAandB = 0

  for (let i = 0; i < sampleCount; i++) {
    // Random point within bounding box
    const x = bounds.x + Math.random() * bounds.width
    const y = bounds.y + Math.random() * bounds.height
    const point = { x, y }

    if (pointInPolygon(point, polygonA)) {
      insideA++
      if (pointInPolygon(point, polygonB)) {
        insideAandB++
      }
    }
  }

  if (insideA === 0) return 0
  return insideAandB / insideA
}
