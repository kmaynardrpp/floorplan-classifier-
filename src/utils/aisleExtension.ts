/**
 * Utility for extending aisle endpoints to intersect 2D coverage boundaries or other aisles
 *
 * When 1D aisles are generated from TDOA pairs, their endpoints are at anchor positions.
 * This utility extends those endpoints along the aisle direction until they reach:
 * 1. A 2D coverage boundary (travel area perimeter)
 * 2. Another aisle (creating a connected network)
 */

import type { Zone, Point } from '@/types/zone'
import type { CoveragePolygon, FloorplanTransformer } from '@/types/config'
import {
  rayPolygonIntersection,
  lineSegmentIntersection,
  pointDistance,
  normalizeVector,
  pointInPolygon,
} from './geometry'
import {
  getAisleStartpoint,
  getAisleEndpoint,
  getAisleDirectionVector,
  negateVector,
} from './aisleGeometry'

/**
 * Target where an aisle endpoint should extend to
 */
export interface ExtensionTarget {
  /** Type of target */
  type: '2d_boundary' | 'aisle'
  /** Point where extension intersects the target */
  intersectionPoint: Point
  /** ID of the target (coverage UID or aisle zone ID) */
  targetId: string
  /** Distance from original endpoint to intersection */
  distance: number
}

/**
 * Result of extending an aisle
 */
export interface ExtendedAisle {
  /** The extended aisle zone */
  zone: Zone
  /** Extension at start endpoint (if any) */
  startExtension: ExtensionTarget | null
  /** Extension at end endpoint (if any) */
  endExtension: ExtensionTarget | null
}

/**
 * Convert coverage polygon to pixel coordinates
 */
function coverageToPixelPolygon(
  coverage: CoveragePolygon,
  transformer: FloorplanTransformer
): Point[] {
  return coverage.geometry.points.map((p) =>
    transformer.toPixels({ x: p.x, y: p.y })
  )
}

// NOTE: getAisleCenterline is available for future use but not currently needed
// Keeping the helper functions from aisleGeometry.ts imported for potential future use

/**
 * Find the distance from a point to the nearest edge of a polygon
 */
function distanceToPolygon(point: Point, polygon: Point[]): number {
  let minDistance = Infinity

  for (let i = 0; i < polygon.length; i++) {
    const v1 = polygon[i]!
    const v2 = polygon[(i + 1) % polygon.length]!

    // Calculate distance from point to this edge
    const dx = v2.x - v1.x
    const dy = v2.y - v1.y
    const lengthSquared = dx * dx + dy * dy

    if (lengthSquared === 0) {
      // Edge is a point
      const dist = pointDistance(point, v1)
      if (dist < minDistance) minDistance = dist
      continue
    }

    // Project point onto the line
    let t = ((point.x - v1.x) * dx + (point.y - v1.y) * dy) / lengthSquared
    t = Math.max(0, Math.min(1, t))

    const closest: Point = {
      x: v1.x + t * dx,
      y: v1.y + t * dy,
    }

    const dist = pointDistance(point, closest)
    if (dist < minDistance) minDistance = dist
  }

  return minDistance
}

/**
 * Find where an aisle endpoint should extend to
 *
 * Casts a ray from the endpoint in the aisle direction and finds
 * the closest intersection with a 2D coverage boundary or another aisle.
 *
 * IMPORTANT: If the endpoint is already inside a 2D coverage polygon,
 * we don't extend (the aisle already reaches the coverage area).
 *
 * @param endpoint - The aisle endpoint to extend from
 * @param direction - Unit vector in the direction to extend
 * @param coveragePolygons - 2D coverage polygons (in pixel coordinates)
 * @param otherAisles - Other aisle zones to check for intersection
 * @param maxExtension - Maximum extension distance in pixels
 * @returns ExtensionTarget if intersection found, null otherwise
 */
export function findAisleExtensionTarget(
  endpoint: Point,
  direction: Point,
  coveragePolygons: Array<{ polygon: Point[]; uid: string }>,
  otherAisles: Zone[],
  maxExtension: number = 10000
): ExtensionTarget | null {
  // First check if endpoint is already inside any 2D coverage polygon
  // If so, no extension needed in this direction
  for (const coverage of coveragePolygons) {
    if (pointInPolygon(endpoint, coverage.polygon)) {
      console.log(
        `[aisleExtension] Endpoint already inside coverage ${coverage.uid}, skipping extension`
      )
      return null
    }
  }

  let closestTarget: ExtensionTarget | null = null

  // Normalize direction vector
  const normalizedDir = normalizeVector(direction)

  // Check intersections with 2D coverage boundaries
  for (const coverage of coveragePolygons) {
    const result = rayPolygonIntersection(
      endpoint,
      normalizedDir,
      coverage.polygon
    )

    if (result && result.distance > 0 && result.distance < maxExtension) {
      if (closestTarget === null || result.distance < closestTarget.distance) {
        closestTarget = {
          type: '2d_boundary',
          intersectionPoint: result.point,
          targetId: coverage.uid,
          distance: result.distance,
        }
      }
    }
  }

  // Check intersections with other aisles
  // We check against each edge of the other aisle's polygon
  for (const aisle of otherAisles) {
    if (aisle.vertices.length < 3) continue

    // Create a ray endpoint far away
    const rayEnd: Point = {
      x: endpoint.x + normalizedDir.x * maxExtension,
      y: endpoint.y + normalizedDir.y * maxExtension,
    }

    // Check intersection with each edge of the aisle
    for (let i = 0; i < aisle.vertices.length; i++) {
      const v1 = aisle.vertices[i]!
      const v2 = aisle.vertices[(i + 1) % aisle.vertices.length]!

      const intersection = lineSegmentIntersection(endpoint, rayEnd, v1, v2)

      if (intersection) {
        const distance = pointDistance(endpoint, intersection)

        // Skip very small distances (would be the same aisle)
        if (distance < 10) continue

        if (
          distance < maxExtension &&
          (closestTarget === null || distance < closestTarget.distance)
        ) {
          closestTarget = {
            type: 'aisle',
            intersectionPoint: intersection,
            targetId: aisle.id,
            distance,
          }
        }
      }
    }
  }

  // VALIDATION: If we found a 2D boundary target, check if we're extending too far
  // by checking the distance from the endpoint to the nearest coverage area.
  // If the ray hit a far coverage but there's a closer one nearby (even if not
  // directly in line), we should limit the extension.
  if (closestTarget?.type === '2d_boundary') {
    // Find the nearest coverage polygon (by edge distance, not just ray intersection)
    let nearestCoverageDistance = Infinity
    let nearestCoverageId = ''

    for (const coverage of coveragePolygons) {
      const dist = distanceToPolygon(endpoint, coverage.polygon)
      if (dist < nearestCoverageDistance) {
        nearestCoverageDistance = dist
        nearestCoverageId = coverage.uid
      }
    }

    // If there's a coverage area that's closer than the ray-hit coverage,
    // and the extension would go past it, limit the extension to the nearest distance
    // This prevents aisles from overshooting nearby coverage areas
    if (
      nearestCoverageDistance < closestTarget.distance &&
      nearestCoverageId !== closestTarget.targetId
    ) {
      console.log(
        `[aisleExtension] Limiting extension: ray hit coverage ${closestTarget.targetId} at ${closestTarget.distance.toFixed(0)}px, ` +
          `but coverage ${nearestCoverageId} is only ${nearestCoverageDistance.toFixed(0)}px away. Using nearest distance.`
      )
      // Use the nearest distance instead, projecting the endpoint toward the nearest coverage
      closestTarget = {
        type: '2d_boundary',
        intersectionPoint: {
          x: endpoint.x + normalizedDir.x * nearestCoverageDistance,
          y: endpoint.y + normalizedDir.y * nearestCoverageDistance,
        },
        targetId: nearestCoverageId,
        distance: nearestCoverageDistance,
      }
    }

    // Additional validation: cap extension distance to a reasonable maximum
    // Even if the ray found an intersection, don't extend more than 200px
    // unless the endpoint is already very far from coverage
    const maxReasonableExtension = Math.max(200, nearestCoverageDistance + 50)
    if (closestTarget.distance > maxReasonableExtension) {
      console.log(
        `[aisleExtension] Capping extension from ${closestTarget.distance.toFixed(0)}px to ${maxReasonableExtension.toFixed(0)}px`
      )
      closestTarget = {
        ...closestTarget,
        distance: maxReasonableExtension,
        intersectionPoint: {
          x: endpoint.x + normalizedDir.x * maxReasonableExtension,
          y: endpoint.y + normalizedDir.y * maxReasonableExtension,
        },
      }
    }
  }

  return closestTarget
}

/**
 * Default overhang distance (in pixels) when extending to 2D coverage boundaries.
 * Set to 0 so aisles stop exactly at the 2D coverage boundary.
 * The route calculator will handle connectivity between aisle endpoints and 2D areas.
 */
export const DEFAULT_BOUNDARY_OVERHANG = 0

/**
 * Extend an aisle zone's polygon to reach a target point
 *
 * The extension preserves the aisle width by moving the corner vertices
 * along the aisle direction, maintaining the original rectangle shape.
 *
 * When extending to a 2D boundary, an overhang is added so the aisle
 * extends just barely into the coverage area (not just to the edge).
 *
 * @param aisle - Original aisle zone
 * @param startTarget - Target for start endpoint extension
 * @param endTarget - Target for end endpoint extension
 * @param boundaryOverhang - Distance to extend past 2D boundaries (default: 20px)
 * @returns New zone with extended polygon
 */
export function extendAisleToTargets(
  aisle: Zone,
  startTarget: ExtensionTarget | null,
  endTarget: ExtensionTarget | null,
  boundaryOverhang: number = DEFAULT_BOUNDARY_OVERHANG
): Zone {
  // If no extensions needed, return original
  if (!startTarget && !endTarget) {
    return aisle
  }

  const vertices = aisle.vertices
  if (vertices.length < 4) {
    return aisle
  }

  // Get aisle direction vector (from start to end)
  const direction = getAisleDirectionVector(aisle)

  // Start with a copy of original vertices
  const newVertices: Point[] = [...vertices]

  // For chained aisles, vertices are structured as:
  // [left_0, left_1, ..., left_n, right_n, right_n-1, ..., right_0]
  // where n = number of anchors - 1
  //
  // For a simple 4-vertex rectangle (2 anchors):
  // - v0 = left start, v1 = left end, v2 = right end, v3 = right start
  // - Start edge: v0, v3 (indices 0 and length-1)
  // - End edge: v1, v2 (indices 1 and length-2... wait no, for 4 vertices: 1 and 2)
  //
  // For a 6-vertex chain (3 anchors):
  // - v0, v1, v2 = left edge (start, mid, end)
  // - v3, v4, v5 = right edge reversed (end, mid, start)
  // - Start edge: v0, v5 (indices 0 and length-1)
  // - End edge: v2, v3 (indices length/2-1 and length/2)

  const n = vertices.length
  const halfN = Math.floor(n / 2)

  // Start edge: first left vertex (0) and last right vertex (n-1)
  const startLeftIdx = 0
  const startRightIdx = n - 1

  // End edge: last left vertex (halfN-1) and first right vertex (halfN)
  const endLeftIdx = halfN - 1
  const endRightIdx = halfN

  if (startTarget) {
    // Extend the start edge backward (negative direction)
    const extDir = negateVector(direction)
    // Add overhang for 2D boundary targets so aisle extends just into the coverage
    const overhang = startTarget.type === '2d_boundary' ? boundaryOverhang : 0
    const extDistance = startTarget.distance + overhang

    // Move start edge corners along the extension direction
    newVertices[startLeftIdx] = {
      x: vertices[startLeftIdx]!.x + extDir.x * extDistance,
      y: vertices[startLeftIdx]!.y + extDir.y * extDistance,
    }
    newVertices[startRightIdx] = {
      x: vertices[startRightIdx]!.x + extDir.x * extDistance,
      y: vertices[startRightIdx]!.y + extDir.y * extDistance,
    }

    console.log(
      `[aisleExtension] Extended start by ${extDistance.toFixed(0)}px (${startTarget.distance.toFixed(0)} + ${overhang} overhang) toward ${startTarget.targetId}`
    )
  }

  if (endTarget) {
    // Extend the end edge forward (positive direction)
    // Add overhang for 2D boundary targets so aisle extends just into the coverage
    const overhang = endTarget.type === '2d_boundary' ? boundaryOverhang : 0
    const extDistance = endTarget.distance + overhang

    // Move end edge corners along the direction
    newVertices[endLeftIdx] = {
      x: vertices[endLeftIdx]!.x + direction.x * extDistance,
      y: vertices[endLeftIdx]!.y + direction.y * extDistance,
    }
    newVertices[endRightIdx] = {
      x: vertices[endRightIdx]!.x + direction.x * extDistance,
      y: vertices[endRightIdx]!.y + direction.y * extDistance,
    }

    console.log(
      `[aisleExtension] Extended end by ${extDistance.toFixed(0)}px (${endTarget.distance.toFixed(0)} + ${overhang} overhang) toward ${endTarget.targetId}`
    )
  }

  // Create updated zone
  const now = new Date().toISOString()

  return {
    ...aisle,
    vertices: newVertices,
    metadata: {
      ...aisle.metadata,
      customProperties: {
        ...aisle.metadata.customProperties,
        extended: 'true',
        startExtendedTo: startTarget?.targetId ?? '',
        startExtensionType: startTarget?.type ?? '',
        endExtendedTo: endTarget?.targetId ?? '',
        endExtensionType: endTarget?.type ?? '',
      },
    },
    updatedAt: now,
  }
}

/**
 * Extend all aisles to connect with 2D coverage boundaries and each other
 *
 * @param aisles - Array of aisle zones
 * @param coveragePolygons - 2D coverage polygons
 * @param transformer - Coordinate transformer
 * @param maxExtension - Maximum extension distance in pixels
 * @param boundaryOverhang - Distance to extend past 2D boundaries (default: 20px)
 * @returns Array of extended aisle zones
 */
export function extendAllAisles(
  aisles: Zone[],
  coveragePolygons: CoveragePolygon[],
  transformer: FloorplanTransformer,
  maxExtension: number = 500,
  boundaryOverhang: number = DEFAULT_BOUNDARY_OVERHANG
): ExtendedAisle[] {
  // Filter to 2D, non-exclusion coverage polygons
  const coverage2D = coveragePolygons.filter(
    (c) => c.type === '2D' && !c.exclusion
  )

  // Convert coverage polygons to pixel coordinates
  const coveragePixels = coverage2D.map((c) => ({
    polygon: coverageToPixelPolygon(c, transformer),
    uid: c.uid,
  }))

  const extendedAisles: ExtendedAisle[] = []

  for (const aisle of aisles) {
    // Get other aisles (excluding current)
    const otherAisles = aisles.filter((a) => a.id !== aisle.id)

    // Get aisle endpoints and direction
    const startPoint = getAisleStartpoint(aisle)
    const endPoint = getAisleEndpoint(aisle)
    const direction = getAisleDirectionVector(aisle)

    // Find extension targets for both endpoints
    // Start: extend in negative direction
    const startTarget = findAisleExtensionTarget(
      startPoint,
      negateVector(direction),
      coveragePixels,
      otherAisles,
      maxExtension
    )

    // End: extend in positive direction
    const endTarget = findAisleExtensionTarget(
      endPoint,
      direction,
      coveragePixels,
      otherAisles,
      maxExtension
    )

    // Extend aisle to targets (with overhang for 2D boundaries)
    const extendedZone = extendAisleToTargets(
      aisle,
      startTarget,
      endTarget,
      boundaryOverhang
    )

    extendedAisles.push({
      zone: extendedZone,
      startExtension: startTarget,
      endExtension: endTarget,
    })

    // Log extension info
    if (startTarget || endTarget) {
      console.log(
        `[aisleExtension] Aisle ${aisle.name}: ` +
          `start -> ${startTarget?.type ?? 'none'} (${startTarget?.distance?.toFixed(0) ?? '-'}px), ` +
          `end -> ${endTarget?.type ?? 'none'} (${endTarget?.distance?.toFixed(0) ?? '-'}px)`
      )
    }
  }

  return extendedAisles
}

/**
 * Get just the extended zones from the extension results
 */
export function getExtendedZones(results: ExtendedAisle[]): Zone[] {
  return results.map((r) => r.zone)
}

/**
 * Get statistics about aisle extensions
 */
export function getExtensionStats(results: ExtendedAisle[]): {
  totalAisles: number
  extendedAisles: number
  boundaryExtensions: number
  aisleExtensions: number
} {
  let extendedCount = 0
  let boundaryCount = 0
  let aisleCount = 0

  for (const result of results) {
    const hasExtension = result.startExtension || result.endExtension
    if (hasExtension) {
      extendedCount++
    }

    if (result.startExtension?.type === '2d_boundary') boundaryCount++
    if (result.endExtension?.type === '2d_boundary') boundaryCount++
    if (result.startExtension?.type === 'aisle') aisleCount++
    if (result.endExtension?.type === 'aisle') aisleCount++
  }

  return {
    totalAisles: results.length,
    extendedAisles: extendedCount,
    boundaryExtensions: boundaryCount,
    aisleExtensions: aisleCount,
  }
}

/**
 * Extend aisles to reach travel lane boundaries (both already in pixel space)
 *
 * This is the preferred function for post-processing extension after all zones
 * are generated. It avoids coordinate system issues by operating entirely in
 * pixel space.
 *
 * @param aisles - Aisle zones (already in pixel coordinates)
 * @param travelLanes - Travel lane zones (already in pixel coordinates, source: 'coverage')
 * @param maxExtension - Maximum extension distance in pixels
 * @param boundaryOverhang - Distance to extend past boundaries (default: 5px)
 * @returns Array of extended aisle results
 */
export function extendAislesToTravelLanes(
  aisles: Zone[],
  travelLanes: Zone[],
  maxExtension: number = 500,
  boundaryOverhang: number = DEFAULT_BOUNDARY_OVERHANG
): ExtendedAisle[] {
  // Extract travel lane polygons (already in pixels)
  const travelLanePolygons = travelLanes.map((lane) => ({
    polygon: lane.vertices,
    uid: lane.id,
  }))

  console.log(
    `[aisleExtension] extendAislesToTravelLanes: ${aisles.length} aisles, ${travelLanes.length} travel lanes (all in pixel space)`
  )

  const extendedAisles: ExtendedAisle[] = []

  for (const aisle of aisles) {
    // Get other aisles (excluding current)
    const otherAisles = aisles.filter((a) => a.id !== aisle.id)

    // Get aisle endpoints and direction
    const startPoint = getAisleStartpoint(aisle)
    const endPoint = getAisleEndpoint(aisle)
    const direction = getAisleDirectionVector(aisle)

    // Find extension targets for both endpoints (all in pixel space)
    // Start: extend in negative direction
    const startTarget = findAisleExtensionTarget(
      startPoint,
      negateVector(direction),
      travelLanePolygons,
      otherAisles,
      maxExtension
    )

    // End: extend in positive direction
    const endTarget = findAisleExtensionTarget(
      endPoint,
      direction,
      travelLanePolygons,
      otherAisles,
      maxExtension
    )

    // Extend aisle to targets (with overhang for boundaries)
    const extendedZone = extendAisleToTargets(
      aisle,
      startTarget,
      endTarget,
      boundaryOverhang
    )

    extendedAisles.push({
      zone: extendedZone,
      startExtension: startTarget,
      endExtension: endTarget,
    })

    // Log extension info
    if (startTarget || endTarget) {
      console.log(
        `[aisleExtension] Aisle ${aisle.name}: ` +
          `start -> ${startTarget?.type ?? 'none'} (${startTarget?.distance?.toFixed(0) ?? '-'}px), ` +
          `end -> ${endTarget?.type ?? 'none'} (${endTarget?.distance?.toFixed(0) ?? '-'}px)`
      )
    }
  }

  return extendedAisles
}
