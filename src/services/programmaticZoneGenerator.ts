/**
 * Orchestrate generation of all programmatic zones from config data
 *
 * NOTE: Aisle extension is now handled as post-processing in useProgrammaticZones hook
 * to avoid coordinate system issues. The extendAisles option here is deprecated.
 */

import type { Zone } from '@/types/zone'
import type {
  FloorplanTransformer,
  GenerationStats,
  TDOAPair,
  Anchor,
  CoveragePolygon,
} from '@/types/config'
import { generateAllAisles } from './aisleGenerator'
import { generateAllTravelLanes } from './travelLaneGenerator'

/**
 * Options for programmatic zone generation
 */
export interface GenerationOptions {
  /** Generate aisle zones from 1D TDOA pairs */
  generateAisles: boolean
  /** Generate travel lane zones from 2D coverage */
  generateTravelLanes: boolean
  /** Include exclusion zones (non-travelable) */
  includeExclusions: boolean
  /** Extend aisle endpoints to intersect 2D coverage boundaries */
  extendAisles: boolean
  /** Maximum distance (pixels) to extend aisles */
  maxAisleExtension: number
  /** Distance (pixels) to extend past 2D boundaries (overhang into coverage area) */
  aisleOverhang: number
}

/**
 * Default generation options
 */
export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  generateAisles: true,
  generateTravelLanes: true,
  includeExclusions: false,
  extendAisles: true, // Extension now handled as post-processing in useProgrammaticZones
  maxAisleExtension: 500,
  aisleOverhang: 5, // Extend 5px past 2D boundaries (just barely into coverage)
}

/**
 * Generate all programmatic zones from config data
 *
 * @param tdoaPairs - Array of TDOA pairs
 * @param anchors - Map of anchor name to Anchor object
 * @param coveragePolygons - Array of coverage polygons
 * @param transformer - Coordinate transformer for mm to pixels
 * @param options - Generation options
 * @returns Array of generated Zone objects
 */
export function generateAllProgrammaticZones(
  tdoaPairs: TDOAPair[],
  anchors: Map<string, Anchor>,
  coveragePolygons: CoveragePolygon[],
  transformer: FloorplanTransformer,
  options: GenerationOptions = DEFAULT_GENERATION_OPTIONS
): Zone[] {
  const allZones: Zone[] = []

  // Generate aisle zones from 1D TDOA pairs
  // NOTE: Aisle extension is now handled as post-processing in useProgrammaticZones
  // to avoid coordinate system issues (aisles vs coverage in different spaces)
  if (options.generateAisles) {
    const aisleZones = generateAllAisles(tdoaPairs, anchors, transformer)
    allZones.push(...aisleZones)
  }

  // Generate travel lane zones from 2D coverage
  if (options.generateTravelLanes) {
    console.log(`[programmaticZoneGenerator] Generating travel lanes from ${coveragePolygons.length} coverage polygons`)
    const travelLaneZones = generateAllTravelLanes(coveragePolygons, transformer)
    console.log(`[programmaticZoneGenerator] Generated ${travelLaneZones.length} travel lane zones`)
    allZones.push(...travelLaneZones)
  }

  // Deduplicate zones by ID
  const deduplicatedZones = deduplicateZones(allZones)

  console.log(
    `[programmaticZoneGenerator] Generated ${deduplicatedZones.length} total zones`
  )

  return deduplicatedZones
}

/**
 * Deduplicate zones by ID, keeping the first occurrence
 *
 * @param zones - Array of zones
 * @returns Deduplicated array
 */
export function deduplicateZones(zones: Zone[]): Zone[] {
  const seen = new Set<string>()
  const unique: Zone[] = []
  let duplicateCount = 0

  for (const zone of zones) {
    if (seen.has(zone.id)) {
      console.warn(`[programmaticZoneGenerator] Duplicate zone ID: ${zone.id}`)
      duplicateCount++
    } else {
      seen.add(zone.id)
      unique.push(zone)
    }
  }

  if (duplicateCount > 0) {
    console.warn(
      `[programmaticZoneGenerator] Removed ${duplicateCount} duplicate zones`
    )
  }

  return unique
}

/**
 * Get generation statistics without actually generating zones
 *
 * @param zones - Array of generated zones
 * @returns Statistics object
 */
export function getGenerationStats(zones: Zone[]): GenerationStats {
  const aisleZones = zones.filter((z) => z.source === 'tdoa')
  const travelLaneZones = zones.filter((z) => z.source === 'coverage')

  // Count unique IDs to find duplicates
  const uniqueIds = new Set(zones.map((z) => z.id))
  const skippedDuplicates = zones.length - uniqueIds.size

  return {
    totalZones: zones.length,
    aisleZones: aisleZones.length,
    travelLaneZones: travelLaneZones.length,
    skippedDuplicates,
  }
}

/**
 * Validate that all required data is present for zone generation
 */
export function validateGenerationData(
  tdoaPairs: TDOAPair[],
  anchors: Map<string, Anchor>,
  coveragePolygons: CoveragePolygon[],
  options: GenerationOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (options.generateAisles) {
    const pairs1D = tdoaPairs.filter((p) => p.Dimension === '1D')
    if (pairs1D.length === 0) {
      errors.push('No 1D TDOA pairs available for aisle generation')
    }
    if (anchors.size === 0) {
      errors.push('No anchors loaded for aisle generation')
    }
  }

  if (options.generateTravelLanes) {
    const polygons2D = coveragePolygons.filter(
      (p) => p.type === '2D' && !p.exclusion
    )
    if (polygons2D.length === 0) {
      errors.push('No 2D coverage polygons available for travel lane generation')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
