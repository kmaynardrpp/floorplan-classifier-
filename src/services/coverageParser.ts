/**
 * Parser for coverage.json configuration files
 */

import type {
  CoveragePolygon,
  CoverageGeometry,
  CoveragePoint,
} from '@/types/config'

/**
 * Error thrown when coverage parsing fails
 */
export class CoverageParseError extends Error {
  constructor(
    message: string,
    public readonly polygonUid?: string
  ) {
    super(message)
    this.name = 'CoverageParseError'
  }
}

/**
 * Validates that a value is a number
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value)
}

/**
 * Validates that a value is a non-empty string
 */
function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Parse a coverage point
 */
function parseCoveragePoint(obj: unknown): CoveragePoint | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  if (!isValidNumber(data.x) || !isValidNumber(data.y)) {
    return null
  }

  return { x: data.x, y: data.y }
}

/**
 * Parse coverage geometry
 */
function parseCoverageGeometry(obj: unknown): CoverageGeometry | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  // Points array is required
  if (!Array.isArray(data.points)) {
    return null
  }

  const points: CoveragePoint[] = []
  for (const pointData of data.points) {
    const point = parseCoveragePoint(pointData)
    if (point) {
      points.push(point)
    }
  }

  // Need at least 3 points for a valid polygon
  if (points.length < 3) {
    return null
  }

  return {
    shape: isValidString(data.shape) ? data.shape : 'POLYGON',
    margin: isValidNumber(data.margin) ? data.margin : 0,
    threshold: isValidNumber(data.threshold) ? data.threshold : 0,
    points,
  }
}

/**
 * Parse a single coverage polygon object
 */
function parseCoveragePolygonObject(obj: unknown): CoveragePolygon | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  // UID is required for identification
  if (!isValidString(data.uid)) {
    console.warn('[coverageParser] Skipping polygon with invalid uid:', data)
    return null
  }

  // Parse geometry
  const geometry = parseCoverageGeometry(data.geometry)
  if (!geometry) {
    console.warn(
      `[coverageParser] Skipping polygon '${data.uid}' with invalid geometry:`,
      data.geometry
    )
    return null
  }

  // Validate type
  const type = isValidString(data.type) ? data.type.toUpperCase() : '2D'
  if (type !== '1D' && type !== '2D') {
    console.warn(
      `[coverageParser] Polygon '${data.uid}' has invalid type '${data.type}', defaulting to '2D'`
    )
  }

  return {
    uid: data.uid,
    type: type === '1D' ? '1D' : '2D',
    exclusion: typeof data.exclusion === 'boolean' ? data.exclusion : false,
    geometry,
    sublocation_uid: isValidString(data.sublocation_uid)
      ? data.sublocation_uid
      : '',
  }
}

/**
 * Parse coverage.json and extract coverage polygons
 *
 * @param json - Parsed JSON data (unknown type for safety)
 * @returns Array of CoveragePolygon objects
 */
export function parseCoveragePolygons(json: unknown): CoveragePolygon[] {
  const polygons: CoveragePolygon[] = []

  if (!json || typeof json !== 'object') {
    console.warn('[coverageParser] Input is not an object, returning empty array')
    return polygons
  }

  const data = json as Record<string, unknown>

  // Extract location_service_coverage array
  const coverage = data.location_service_coverage
  if (!Array.isArray(coverage)) {
    console.warn(
      '[coverageParser] location_service_coverage is not an array, returning empty array'
    )
    return polygons
  }

  // Parse each polygon
  for (const polygonData of coverage) {
    const polygon = parseCoveragePolygonObject(polygonData)
    if (polygon) {
      polygons.push(polygon)
    }
  }

  return polygons
}

/**
 * Filter coverage polygons to only 1D type (aisle blocks)
 *
 * @param polygons - Array of coverage polygons
 * @returns Array of 1D coverage polygons only
 */
export function filter1DCoverage(
  polygons: CoveragePolygon[]
): CoveragePolygon[] {
  return polygons.filter((p) => p.type === '1D')
}

/**
 * Filter coverage polygons to only 2D type (travel areas)
 *
 * @param polygons - Array of coverage polygons
 * @returns Array of 2D coverage polygons only
 */
export function filter2DCoverage(
  polygons: CoveragePolygon[]
): CoveragePolygon[] {
  return polygons.filter((p) => p.type === '2D')
}

/**
 * Filter coverage polygons to only travelable areas (non-exclusion)
 *
 * @param polygons - Array of coverage polygons
 * @returns Array of travelable coverage polygons
 */
export function filterTravelable(
  polygons: CoveragePolygon[]
): CoveragePolygon[] {
  return polygons.filter((p) => !p.exclusion)
}

/**
 * Filter coverage polygons to only exclusion zones
 *
 * @param polygons - Array of coverage polygons
 * @returns Array of exclusion coverage polygons
 */
export function filterExclusions(
  polygons: CoveragePolygon[]
): CoveragePolygon[] {
  return polygons.filter((p) => p.exclusion)
}

/**
 * Get statistics about coverage polygons
 *
 * @param polygons - Array of coverage polygons
 * @returns Statistics object
 */
export function getCoverageStats(polygons: CoveragePolygon[]): {
  total: number
  type1D: number
  type2D: number
  travelable: number
  exclusions: number
} {
  return {
    total: polygons.length,
    type1D: polygons.filter((p) => p.type === '1D').length,
    type2D: polygons.filter((p) => p.type === '2D').length,
    travelable: polygons.filter((p) => !p.exclusion).length,
    exclusions: polygons.filter((p) => p.exclusion).length,
  }
}
