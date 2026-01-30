/**
 * Map between zones.json zone types and internal zone types
 */

import type { ZoneType } from '@/types/zone'

/**
 * Zone type mapping entry
 */
export interface ZoneTypeMapping {
  /** Internal zone type used by the application */
  internal: ZoneType
  /** Numeric type ID for zones.json format */
  id: number
  /** Human-readable display name */
  displayName: string
}

/**
 * Mapping table from external zone type names to internal types
 */
const ZONE_TYPE_MAP: Record<string, ZoneTypeMapping> = {
  // Speed and restriction zones
  speed_restriction: { internal: 'restricted', id: 29, displayName: 'Speed restriction zone' },
  height_restriction: { internal: 'restricted', id: 30, displayName: 'Height restriction zone' },
  keepout: { internal: 'hazard_zone', id: 31, displayName: 'Keep-out zone' },

  // Navigation zones
  aisle_path: { internal: 'aisle_path', id: 32, displayName: 'Aisle path' },
  travel_lane: { internal: 'travel_lane', id: 33, displayName: 'Travel lane' },
  parking_lot: { internal: 'parking_lot', id: 34, displayName: 'Parking lot' },

  // Operational zones
  docking_area: { internal: 'docking_area', id: 35, displayName: 'Docking area' },
  charging_station: { internal: 'charging_station', id: 36, displayName: 'Charging station' },
  conveyor_area: { internal: 'conveyor_area', id: 37, displayName: 'Conveyor area' },

  // Storage zones
  racking: { internal: 'racking', id: 38, displayName: 'Racking' },
  racking_area: { internal: 'racking_area', id: 39, displayName: 'Racking area' },
  storage_floor: { internal: 'storage_floor', id: 40, displayName: 'Storage floor' },

  // Other zones
  hazard_zone: { internal: 'hazard_zone', id: 41, displayName: 'Hazard zone' },
  restricted: { internal: 'restricted', id: 42, displayName: 'Restricted zone' },
  staging_area: { internal: 'staging_area', id: 43, displayName: 'Staging area' },
  administrative: { internal: 'administrative', id: 44, displayName: 'Administrative area' },
  other: { internal: 'other', id: 99, displayName: 'Other zone' },
}

/**
 * Reverse mapping from internal type to external name
 */
const INTERNAL_TO_EXTERNAL_MAP: Record<ZoneType, string> = {
  restricted: 'speed_restriction',
  hazard_zone: 'keepout',
  aisle_path: 'aisle_path',
  travel_lane: 'travel_lane',
  parking_lot: 'parking_lot',
  docking_area: 'docking_area',
  charging_station: 'charging_station',
  conveyor_area: 'conveyor_area',
  racking: 'racking',
  racking_area: 'racking_area',
  storage_floor: 'storage_floor',
  staging_area: 'staging_area',
  administrative: 'administrative',
  other: 'other',
}

/**
 * Map external zone type name to internal zone type
 *
 * @param externalType - Zone type name from zones.json
 * @returns Internal zone type
 */
export function mapExternalToInternal(externalType: string): ZoneType {
  const normalized = externalType.toLowerCase().trim()
  const mapping = ZONE_TYPE_MAP[normalized]

  if (mapping) {
    return mapping.internal
  }

  // Check if it's already a valid internal type
  if (normalized in INTERNAL_TO_EXTERNAL_MAP) {
    return normalized as ZoneType
  }

  console.warn(`[zoneTypeMapper] Unknown external type '${externalType}', defaulting to 'other'`)
  return 'other'
}

/**
 * Map internal zone type to external zone type name
 *
 * @param internalType - Internal zone type
 * @returns External zone type name for zones.json
 */
export function mapInternalToExternal(internalType: ZoneType): string {
  return INTERNAL_TO_EXTERNAL_MAP[internalType] ?? internalType
}

/**
 * Get the numeric type ID for a zone type
 *
 * @param internalType - Internal zone type
 * @returns Numeric type ID for zones.json
 */
export function getZoneTypeId(internalType: ZoneType): number {
  const externalName = mapInternalToExternal(internalType)
  const mapping = ZONE_TYPE_MAP[externalName]
  return mapping?.id ?? 99 // Default to 'other' ID
}

/**
 * Get the human-readable display name for a zone type
 *
 * @param internalType - Internal zone type
 * @returns Display name string
 */
export function getZoneTypeDisplayName(internalType: ZoneType): string {
  const externalName = mapInternalToExternal(internalType)
  const mapping = ZONE_TYPE_MAP[externalName]
  return mapping?.displayName ?? internalType
}

/**
 * Get full type info for a zone type
 *
 * @param internalType - Internal zone type
 * @returns Object with id, name, and display_name for zones.json
 */
export function getZoneTypeInfo(internalType: ZoneType): {
  id: number
  name: string
  display_name: string
} {
  const externalName = mapInternalToExternal(internalType)
  const mapping = ZONE_TYPE_MAP[externalName]

  return {
    id: mapping?.id ?? 99,
    name: externalName,
    display_name: mapping?.displayName ?? internalType,
  }
}

/**
 * Get all known external zone type names
 */
export function getAllExternalTypes(): string[] {
  return Object.keys(ZONE_TYPE_MAP)
}

/**
 * Check if an external type name is known
 */
export function isKnownExternalType(externalType: string): boolean {
  return externalType.toLowerCase().trim() in ZONE_TYPE_MAP
}
