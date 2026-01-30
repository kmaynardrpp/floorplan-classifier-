/**
 * Import zones from zones.json format
 */

import type { Zone, Point } from '@/types/zone'
import type { FloorplanTransformer, ZonesJsonZone, ZonesJson } from '@/types/config'
import { DEFAULT_ZONE_METADATA } from '@/types/zone'
import { mapExternalToInternal } from './zoneTypeMapper'
import { generateUID } from '@/utils/idGenerator'

/**
 * Error thrown when zone parsing fails
 */
export class ZoneParseError extends Error {
  constructor(
    message: string,
    public readonly zoneName?: string
  ) {
    super(message)
    this.name = 'ZoneParseError'
  }
}

/**
 * Import options for controlling how zones are imported
 */
export interface ImportOptions {
  /** How to handle existing zones */
  mode: 'replace' | 'merge'
  /** Skip zones that would create duplicate IDs */
  skipDuplicates?: boolean
}

/**
 * Default import options
 */
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  mode: 'replace',
  skipDuplicates: true,
}

/**
 * Validate that a value is a valid number
 */
function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)
}

/**
 * Validate that a value is a non-empty string
 */
function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Parse a single position object from zones.json
 */
function parsePosition(obj: unknown): Point | null {
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
 * Parse a single zone from zones.json format
 */
function parseZoneObject(obj: unknown): ZonesJsonZone | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  // Name is required
  if (!isValidString(data.name)) {
    console.warn('[zoneImporter] Skipping zone with invalid name:', data)
    return null
  }

  // Geometry is required
  const geometry = data.zone_geometry as Record<string, unknown> | undefined
  if (!geometry || typeof geometry !== 'object') {
    console.warn(`[zoneImporter] Skipping zone '${data.name}' with missing geometry`)
    return null
  }

  // Positions array is required
  const positions = geometry.positions
  if (!Array.isArray(positions)) {
    console.warn(`[zoneImporter] Skipping zone '${data.name}' with missing positions`)
    return null
  }

  // Parse positions
  const parsedPositions: Point[] = []
  for (const pos of positions) {
    const point = parsePosition(pos)
    if (point) {
      parsedPositions.push(point)
    }
  }

  // Need at least 3 positions for a valid polygon
  if (parsedPositions.length < 3) {
    console.warn(
      `[zoneImporter] Skipping zone '${data.name}' with fewer than 3 valid positions`
    )
    return null
  }

  // Extract zone type
  const zoneType = data.zone_type as Record<string, unknown> | undefined
  const zoneTypeName = isValidString(data.zone_type_name)
    ? data.zone_type_name
    : isValidString(zoneType?.name)
      ? (zoneType?.name as string)
      : 'other'

  // Build the zone object with defaults
  const zone: ZonesJsonZone = {
    name: data.name,
    uid: isValidString(data.uid) ? data.uid : generateUID(),
    zone_id: isValidNumber(data.zone_id) ? data.zone_id : 0,
    active: typeof data.active === 'boolean' ? data.active : true,
    shape: isValidString(data.shape) ? data.shape : 'polygon',
    zone_type: zoneType
      ? {
          id: isValidNumber(zoneType.id) ? zoneType.id : 0,
          name: isValidString(zoneType.name) ? zoneType.name : zoneTypeName,
          display_name: isValidString(zoneType.display_name)
            ? zoneType.display_name
            : zoneTypeName,
        }
      : { id: 0, name: zoneTypeName, display_name: zoneTypeName },
    zone_type_name: zoneTypeName,
    zone_geometry: {
      positions: parsedPositions,
    },
    zone_mode: isValidString(data.zone_mode) ? data.zone_mode : 'ALWAYS_ACTIVE',
    priority: isValidNumber(data.priority) ? data.priority : 0,
    sublocation_uid: isValidString(data.sublocation_uid) ? data.sublocation_uid : '',
    project_uid: isValidString(data.project_uid) ? data.project_uid : '',
    created_at: isValidString(data.created_at) ? data.created_at : new Date().toISOString(),
    updated_at: isValidString(data.updated_at) ? data.updated_at : new Date().toISOString(),
  }

  return zone
}

/**
 * Parse zones.json format and extract zone objects
 *
 * @param json - Parsed JSON data (unknown type for safety)
 * @returns Array of ZonesJsonZone objects
 * @throws ZoneParseError if input is completely malformed
 */
export function parseZonesJson(json: unknown): ZonesJsonZone[] {
  if (!json || typeof json !== 'object') {
    throw new ZoneParseError('Input is not an object')
  }

  const data = json as ZonesJson

  // Extract zones array
  const zonesArray = data.zones
  if (!Array.isArray(zonesArray)) {
    throw new ZoneParseError('zones field is not an array')
  }

  const zones: ZonesJsonZone[] = []
  let skipped = 0

  for (const zoneData of zonesArray) {
    const zone = parseZoneObject(zoneData)
    if (zone) {
      zones.push(zone)
    } else {
      skipped++
    }
  }

  if (skipped > 0) {
    console.warn(`[zoneImporter] Skipped ${skipped} invalid zones during parsing`)
  }

  return zones
}

/**
 * Convert a ZonesJsonZone to an internal Zone object
 *
 * @param externalZone - Zone from zones.json format
 * @param transformer - Coordinate transformer for mm to pixels
 * @returns Internal Zone object
 */
function convertToInternalZone(
  externalZone: ZonesJsonZone,
  transformer: FloorplanTransformer
): Zone {
  // Transform coordinates from mm to pixels
  const verticesPixels = transformer.polygonToPixels(externalZone.zone_geometry.positions)

  // Map external type to internal type
  const internalType = mapExternalToInternal(externalZone.zone_type_name)

  const now = new Date().toISOString()

  const zone: Zone = {
    id: externalZone.uid || generateUID(),
    name: externalZone.name,
    type: internalType,
    vertices: verticesPixels,
    confidence: 1.0, // Imported zones have full confidence
    source: 'imported',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        originalZoneId: String(externalZone.zone_id),
        originalType: externalZone.zone_type_name,
        zoneMode: externalZone.zone_mode,
        priority: String(externalZone.priority),
        sublocationUid: externalZone.sublocation_uid,
        projectUid: externalZone.project_uid,
      },
    },
    createdAt: externalZone.created_at || now,
    updatedAt: now,
  }

  return zone
}

/**
 * Import zones from zones.json format with coordinate transformation
 *
 * @param data - Raw JSON data (will be parsed)
 * @param transformer - Coordinate transformer for mm to pixels
 * @param options - Import options
 * @returns Array of internal Zone objects
 * @throws ZoneParseError if parsing fails
 */
export function importZones(
  data: unknown,
  transformer: FloorplanTransformer,
  options: ImportOptions = DEFAULT_IMPORT_OPTIONS
): Zone[] {
  // Parse the JSON data
  const externalZones = parseZonesJson(data)

  const zones: Zone[] = []
  const seenIds = new Set<string>()

  for (const externalZone of externalZones) {
    const zone = convertToInternalZone(externalZone, transformer)

    // Handle duplicates
    if (options.skipDuplicates && seenIds.has(zone.id)) {
      console.warn(`[zoneImporter] Skipping duplicate zone ID: ${zone.id}`)
      continue
    }

    seenIds.add(zone.id)
    zones.push(zone)
  }

  console.log(`[zoneImporter] Imported ${zones.length} zones`)
  return zones
}

/**
 * Get statistics about imported zones
 */
export function getImportStats(zones: Zone[]): {
  total: number
  byType: Record<string, number>
  bySource: Record<string, number>
} {
  const byType: Record<string, number> = {}
  const bySource: Record<string, number> = {}

  for (const zone of zones) {
    byType[zone.type] = (byType[zone.type] ?? 0) + 1
    bySource[zone.source] = (bySource[zone.source] ?? 0) + 1
  }

  return {
    total: zones.length,
    byType,
    bySource,
  }
}
