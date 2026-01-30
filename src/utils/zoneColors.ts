import type { ZoneType, PredefinedZoneType } from '@/types/zone'

/**
 * Zone type color mappings from spec Appendix B
 * Extended with new agentic analysis zone types
 */
export const ZONE_COLORS: Record<PredefinedZoneType, string> = {
  // Original zone types
  aisle: '#4CAF50',
  travel_lane: '#2196F3',
  parking_lot: '#9C27B0',
  open_floor: '#FF9800',
  loading_dock: '#795548',
  intersection: '#FFEB3B',
  restricted: '#F44336',
  pick_area: '#00BCD4',
  drop_area: '#E91E63',
  staging_area: '#607D8B',
  charging_station: '#8BC34A',
  hazard_zone: '#FF5722',
  // New agentic analysis zone types
  aisle_path: '#00E676', // Bright green - clearly travelable
  racking: '#B0BEC5', // Light gray - non-travelable shelving
  racking_area: '#78909C', // Medium gray - parent container
  conveyor_area: '#FF9800', // Orange - equipment zones
  docking_area: '#795548', // Brown - same as loading_dock
  administrative: '#9E9E9E', // Blue gray - office areas
  storage_floor: '#BCAAA4', // Warm gray - bulk storage
  // AI-detected blocked areas
  blocked_area: '#D32F2F', // Red - non-travelable obstacles
} as const

/**
 * Default color for custom/unknown zone types
 */
export const DEFAULT_ZONE_COLOR = '#9E9E9E'

/**
 * Default zone opacity
 */
export const DEFAULT_ZONE_OPACITY = 0.5

/**
 * Get the color for a zone type
 * @param type - The zone type
 * @param customTypes - Optional map of custom zone types to their colors
 * @returns Hex color code
 */
export function getZoneColor(
  type: ZoneType,
  customTypes?: Map<string, string>
): string {
  // Check predefined types first
  if (type in ZONE_COLORS) {
    return ZONE_COLORS[type as PredefinedZoneType]
  }

  // Check custom types
  if (customTypes?.has(type)) {
    return customTypes.get(type) ?? DEFAULT_ZONE_COLOR
  }

  return DEFAULT_ZONE_COLOR
}

/**
 * Get zone type display label
 * @param type - The zone type (snake_case)
 * @returns Human-readable label
 */
export function getZoneTypeLabel(type: ZoneType): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Convert hex color to RGBA
 * @param hex - Hex color code (e.g., #FF5722)
 * @param alpha - Alpha value 0-1
 * @returns RGBA string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
