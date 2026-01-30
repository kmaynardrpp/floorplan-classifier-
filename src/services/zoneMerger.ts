/**
 * Zone Merger Service
 *
 * Merges programmatic zones (1D aisles from TDOA) with AI-detected zones
 * (blocked areas from 2D coverage analysis) into a single coherent zone set.
 *
 * This combined zone set is used for:
 * 1. Display in the Post-AI tab
 * 2. Shortest route calculation
 */

import type { Zone, Point } from '@/types/zone'
import type { CoveragePolygon, FloorplanTransformer } from '@/types/config'
import { DEFAULT_ZONE_METADATA, isTravelable } from '@/types/zone'

/**
 * Convert a 2D coverage polygon to a travel_lane zone
 *
 * 2D coverage polygons define areas where travel is allowed.
 * Converting them to travel_lane zones makes them available for routing.
 */
export function coverageToTravelLaneZone(
  coverage: CoveragePolygon,
  transformer: FloorplanTransformer
): Zone {
  // Transform polygon from mm to pixels
  const verticesPixels = coverage.geometry.points.map((p) =>
    transformer.toPixels({ x: p.x, y: p.y })
  )

  const now = new Date().toISOString()

  return {
    id: `travel_lane_coverage_${coverage.uid}`,
    name: `Travel Lane (Coverage ${coverage.uid.slice(0, 8)})`,
    type: 'travel_lane',
    vertices: verticesPixels,
    confidence: 1.0, // Coverage data is definitive
    source: 'coverage',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        coverageUid: coverage.uid,
        coverageType: coverage.type,
        marginMm: String(coverage.geometry.margin),
      },
    },
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Check if two zones overlap (basic bounding box check)
 */
function zonesOverlap(zone1: Zone, zone2: Zone): boolean {
  if (zone1.vertices.length < 3 || zone2.vertices.length < 3) {
    return false
  }

  // Get bounding boxes
  const getBounds = (vertices: Point[]) => {
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
    return { minX, minY, maxX, maxY }
  }

  const b1 = getBounds(zone1.vertices)
  const b2 = getBounds(zone2.vertices)

  return !(
    b1.maxX < b2.minX ||
    b1.minX > b2.maxX ||
    b1.maxY < b2.minY ||
    b1.minY > b2.maxY
  )
}

/**
 * Deduplicate zones, preferring more specific types
 *
 * When two zones significantly overlap:
 * - Keep aisle_path over travel_lane (more specific)
 * - Keep blocked_area over travel_lane (blocked areas take precedence)
 */
function deduplicateOverlappingZones(zones: Zone[]): Zone[] {
  const result: Zone[] = []
  const removed = new Set<string>()

  // Sort zones by specificity: blocked_area > aisle_path > travel_lane > others
  const specificity: Record<string, number> = {
    blocked_area: 3,
    aisle_path: 2,
    travel_lane: 1,
  }

  const sortedZones = [...zones].sort((a, b) => {
    const specA = specificity[a.type] ?? 0
    const specB = specificity[b.type] ?? 0
    return specB - specA // Higher specificity first
  })

  for (const zone of sortedZones) {
    if (removed.has(zone.id)) continue

    // Check for overlapping zones that are less specific
    for (const existing of result) {
      if (zonesOverlap(zone, existing)) {
        const zoneSpec = specificity[zone.type] ?? 0
        const existSpec = specificity[existing.type] ?? 0

        // If existing zone is less specific and overlaps, keep the more specific one
        // But don't remove if they're the same type
        if (zoneSpec > existSpec && zone.type !== existing.type) {
          // Don't remove completely - they might cover different areas
          // Just note the overlap for debugging
          console.log(
            `[zoneMerger] Zone ${zone.id} (${zone.type}) overlaps with ${existing.id} (${existing.type})`
          )
        }
      }
    }

    result.push(zone)
  }

  return result
}

/**
 * Merge programmatic zones with AI-detected zones into a single zone set
 *
 * @param programmaticZones - Zones from TDOA (aisles) - already includes travel lanes from coverage
 * @param aiBlockedZones - Blocked areas detected by AI in 2D coverage regions
 * @param coveragePolygons - Original 2D coverage polygons (for creating travel_lane zones if needed)
 * @param transformer - Coordinate transformer
 * @returns Combined zone set for display and routing
 */
export function mergeZoneSets(
  programmaticZones: Zone[],
  aiBlockedZones: Zone[],
  coveragePolygons: CoveragePolygon[],
  transformer: FloorplanTransformer
): Zone[] {
  const merged: Zone[] = []

  // 1. Add all programmatic zones (aisles from TDOA, travel lanes from coverage)
  merged.push(...programmaticZones)

  // 2. Check if we need to add travel_lane zones from coverage
  //    (only if not already included in programmaticZones)
  const existingCoverageIds = new Set(
    programmaticZones
      .filter((z) => z.source === 'coverage')
      .map((z) => z.metadata.customProperties.coverageUid)
  )

  const coverage2D = coveragePolygons.filter(
    (c) => c.type === '2D' && !c.exclusion
  )

  for (const coverage of coverage2D) {
    if (!existingCoverageIds.has(coverage.uid)) {
      merged.push(coverageToTravelLaneZone(coverage, transformer))
    }
  }

  // 3. Add AI-detected blocked areas
  //    These represent obstacles within 2D coverage regions
  merged.push(...aiBlockedZones)

  // 4. Deduplicate overlapping zones
  const deduplicated = deduplicateOverlappingZones(merged)

  console.log(
    `[zoneMerger] Merged ${programmaticZones.length} programmatic + ${aiBlockedZones.length} AI zones -> ${deduplicated.length} total`
  )

  return deduplicated
}

/**
 * Get travelable zones from a merged zone set (for routing)
 */
export function getTravelableZones(zones: Zone[]): Zone[] {
  return zones.filter((z) => isTravelable(z.type))
}

/**
 * Get blocked/obstacle zones from a merged zone set
 */
export function getBlockedZones(zones: Zone[]): Zone[] {
  return zones.filter((z) => z.type === 'blocked_area')
}

/**
 * Get zones by source
 */
export function getZonesBySource(
  zones: Zone[],
  source: 'tdoa' | 'coverage' | 'ai'
): Zone[] {
  return zones.filter((z) => z.source === source)
}

/**
 * Get merge statistics
 */
export function getMergeStats(
  programmaticZones: Zone[],
  aiBlockedZones: Zone[],
  mergedZones: Zone[]
): {
  inputProgrammatic: number
  inputAIBlocked: number
  outputTotal: number
  outputTravelable: number
  outputBlocked: number
} {
  return {
    inputProgrammatic: programmaticZones.length,
    inputAIBlocked: aiBlockedZones.length,
    outputTotal: mergedZones.length,
    outputTravelable: getTravelableZones(mergedZones).length,
    outputBlocked: getBlockedZones(mergedZones).length,
  }
}
