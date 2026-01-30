/**
 * Generate travel lane Zone objects from coverage polygons
 */

import type { Zone } from '@/types/zone'
import type { CoveragePolygon, FloorplanTransformer } from '@/types/config'
import { DEFAULT_ZONE_METADATA } from '@/types/zone'
import { filter2DCoverage, filterTravelable } from './coverageParser'

/**
 * Generate a single travel lane zone from a coverage polygon
 *
 * @param polygon - Coverage polygon defining the travel lane
 * @param transformer - Coordinate transformer for mm to pixels
 * @param index - Index for naming (0-based)
 * @returns Zone object or null if generation failed
 */
export function generateTravelLaneFromCoverage(
  polygon: CoveragePolygon,
  transformer: FloorplanTransformer,
  index: number
): Zone | null {
  // Skip exclusion zones (not travelable)
  if (polygon.exclusion) {
    console.warn(
      `[travelLaneGenerator] Skipping exclusion polygon '${polygon.uid}'`
    )
    return null
  }

  // Need at least 3 points for a valid polygon
  if (polygon.geometry.points.length < 3) {
    console.warn(
      `[travelLaneGenerator] Polygon '${polygon.uid}' has fewer than 3 points`
    )
    return null
  }

  // Extract points from geometry (already in mm)
  const pointsMm = polygon.geometry.points.map((p) => ({ x: p.x, y: p.y }))

  // Transform vertices from mm to pixels
  const verticesPixels = transformer.polygonToPixels(pointsMm)

  const now = new Date().toISOString()

  // Create zone object
  const zone: Zone = {
    id: `travel_lane_${polygon.uid}`,
    name: `Travel Lane ${index + 1}`,
    type: 'travel_lane',
    vertices: verticesPixels,
    confidence: 1.0, // Programmatic zones have full confidence
    source: 'coverage',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        coverageUid: polygon.uid,
        coverageType: polygon.type,
        marginMm: String(polygon.geometry.margin || 0),
        thresholdMm: String(polygon.geometry.threshold || 0),
      },
    },
    createdAt: now,
    updatedAt: now,
  }

  return zone
}

/**
 * Generate all travel lane zones from coverage polygons
 *
 * @param polygons - Array of all coverage polygons (will be filtered)
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Array of generated Zone objects
 */
export function generateAllTravelLanes(
  polygons: CoveragePolygon[],
  transformer: FloorplanTransformer
): Zone[] {
  console.log(`[travelLaneGenerator] Input: ${polygons.length} total coverage polygons`)

  // Filter to only 2D, non-exclusion polygons
  const polygons2D = filter2DCoverage(polygons)
  console.log(`[travelLaneGenerator] After 2D filter: ${polygons2D.length} polygons`)

  const travelablePolygons = filterTravelable(polygons2D)
  console.log(`[travelLaneGenerator] After travelable filter: ${travelablePolygons.length} polygons`)

  const zones: Zone[] = []
  const failedPolygons: string[] = []

  travelablePolygons.forEach((polygon, index) => {
    console.log(`[travelLaneGenerator] Processing polygon ${polygon.uid} with ${polygon.geometry.points.length} points`)
    const zone = generateTravelLaneFromCoverage(polygon, transformer, index)
    if (zone) {
      zones.push(zone)
      // Log first few vertices to verify transformation
      const sampleVertices = zone.vertices.slice(0, 3)
      console.log(`[travelLaneGenerator] Created zone ${zone.id}, sample vertices:`, sampleVertices)
    } else {
      failedPolygons.push(polygon.uid)
    }
  })

  if (failedPolygons.length > 0) {
    console.warn(
      `[travelLaneGenerator] Failed to generate ${failedPolygons.length} travel lane zones:`,
      failedPolygons
    )
  }

  console.log(
    `[travelLaneGenerator] Generated ${zones.length} travel lane zones from ${travelablePolygons.length} 2D coverage polygons`
  )

  return zones
}

/**
 * Generate exclusion zones from coverage polygons
 * These represent non-travelable areas
 *
 * @param polygons - Array of all coverage polygons
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Array of generated Zone objects for exclusion areas
 */
export function generateExclusionZones(
  polygons: CoveragePolygon[],
  transformer: FloorplanTransformer
): Zone[] {
  // Filter to only exclusion polygons
  const exclusionPolygons = polygons.filter((p) => p.exclusion)

  const zones: Zone[] = []

  exclusionPolygons.forEach((polygon, index) => {
    // Need at least 3 points for a valid polygon
    if (polygon.geometry.points.length < 3) {
      return
    }

    const pointsMm = polygon.geometry.points.map((p) => ({ x: p.x, y: p.y }))
    const verticesPixels = transformer.polygonToPixels(pointsMm)

    const now = new Date().toISOString()

    const zone: Zone = {
      id: `exclusion_${polygon.uid}`,
      name: `Exclusion Zone ${index + 1}`,
      type: 'restricted',
      vertices: verticesPixels,
      confidence: 1.0,
      source: 'coverage',
      metadata: {
        ...DEFAULT_ZONE_METADATA,
        customProperties: {
          coverageUid: polygon.uid,
          coverageType: polygon.type,
          exclusion: 'true',
        },
      },
      createdAt: now,
      updatedAt: now,
    }

    zones.push(zone)
  })

  return zones
}

/**
 * Get statistics about travel lane generation
 */
export function getTravelLaneGenerationStats(
  polygons: CoveragePolygon[]
): {
  total2DPolygons: number
  travelablePolygons: number
  exclusionPolygons: number
} {
  const type2D = filter2DCoverage(polygons)
  const travelable = filterTravelable(type2D)
  const exclusions = polygons.filter((p) => p.exclusion)

  return {
    total2DPolygons: type2D.length,
    travelablePolygons: travelable.length,
    exclusionPolygons: exclusions.length,
  }
}
