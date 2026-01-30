/**
 * Export zones to zones.json format
 */

import type { Zone } from '@/types/zone'
import type { FloorplanTransformer, ZonesJsonZone, ZonesJson } from '@/types/config'
import { mapInternalToExternal, getZoneTypeInfo } from './zoneTypeMapper'
import { generateZoneId } from '@/utils/idGenerator'

/**
 * Export configuration options
 */
export interface ExportConfig {
  /** Project UID for the exported zones */
  projectUid: string
  /** Sublocation UID for the exported zones */
  sublocationUid: string
}

/**
 * Default export configuration
 */
export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  projectUid: '',
  sublocationUid: '',
}

/**
 * Convert an internal Zone object to ZonesJsonZone format
 *
 * @param zone - Internal zone object
 * @param transformer - Coordinate transformer for pixels to mm
 * @param config - Export configuration
 * @returns Zone in zones.json format
 */
function convertToExternalZone(
  zone: Zone,
  transformer: FloorplanTransformer,
  config: ExportConfig
): ZonesJsonZone {
  // Transform coordinates from pixels to mm
  const positionsMm = transformer.polygonToMm(zone.vertices)

  // Map internal type to external type
  const externalType = mapInternalToExternal(zone.type)
  const typeInfo = getZoneTypeInfo(zone.type)

  // Get original zone_id from metadata or generate new one
  const originalZoneId = zone.metadata.customProperties.originalZoneId
  const zoneId = originalZoneId ? parseInt(originalZoneId, 10) : generateZoneId()

  // Get preserved metadata
  const zoneMode = zone.metadata.customProperties.zoneMode || 'ALWAYS_ACTIVE'
  const priority = zone.metadata.customProperties.priority
    ? parseInt(zone.metadata.customProperties.priority, 10)
    : 0
  const sublocationUid =
    zone.metadata.customProperties.sublocationUid || config.sublocationUid
  const projectUid = zone.metadata.customProperties.projectUid || config.projectUid

  const now = new Date().toISOString()

  const externalZone: ZonesJsonZone = {
    name: zone.name,
    uid: zone.id,
    zone_id: zoneId,
    active: zone.metadata.isVisible !== false,
    shape: 'polygon',
    zone_type: {
      id: typeInfo.id,
      name: typeInfo.name,
      display_name: typeInfo.display_name,
    },
    zone_type_name: externalType,
    zone_geometry: {
      positions: positionsMm,
    },
    zone_mode: zoneMode,
    priority: priority,
    sublocation_uid: sublocationUid,
    project_uid: projectUid,
    created_at: zone.createdAt,
    updated_at: now,
  }

  return externalZone
}

/**
 * Export zones to zones.json format
 *
 * @param zones - Array of internal Zone objects
 * @param transformer - Coordinate transformer for pixels to mm
 * @param config - Export configuration
 * @returns ZonesJson object ready for serialization
 */
export function exportZones(
  zones: Zone[],
  transformer: FloorplanTransformer,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): ZonesJson {
  const externalZones: ZonesJsonZone[] = []

  for (const zone of zones) {
    try {
      const externalZone = convertToExternalZone(zone, transformer, config)
      externalZones.push(externalZone)
    } catch (err) {
      console.error(`[zoneExporter] Failed to export zone '${zone.id}':`, err)
    }
  }

  console.log(`[zoneExporter] Exported ${externalZones.length} zones`)

  return {
    zones: externalZones,
  }
}

/**
 * Export zones to JSON string
 *
 * @param zones - Array of internal Zone objects
 * @param transformer - Coordinate transformer for pixels to mm
 * @param config - Export configuration
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @returns JSON string
 */
export function exportZonesToJson(
  zones: Zone[],
  transformer: FloorplanTransformer,
  config: ExportConfig = DEFAULT_EXPORT_CONFIG,
  pretty: boolean = true
): string {
  const zonesJson = exportZones(zones, transformer, config)
  return pretty ? JSON.stringify(zonesJson, null, 2) : JSON.stringify(zonesJson)
}

/**
 * Download zones as a JSON file
 *
 * @param zones - Array of internal Zone objects
 * @param transformer - Coordinate transformer for pixels to mm
 * @param filename - Filename for the download (default: 'zones.json')
 * @param config - Export configuration
 */
export function downloadZonesJson(
  zones: Zone[],
  transformer: FloorplanTransformer,
  filename: string = 'zones.json',
  config: ExportConfig = DEFAULT_EXPORT_CONFIG
): void {
  const jsonString = exportZonesToJson(zones, transformer, config)

  // Create Blob and download link
  const blob = new Blob([jsonString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  // Create temporary link element and trigger download
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()

  // Cleanup
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  console.log(`[zoneExporter] Downloaded ${filename} with ${zones.length} zones`)
}

/**
 * Get statistics about zones to be exported
 */
export function getExportStats(zones: Zone[]): {
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
