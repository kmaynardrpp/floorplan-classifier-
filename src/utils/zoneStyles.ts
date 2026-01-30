import type { Zone, ZoneSource } from '@/types/zone'
import { isTravelable, isProgrammaticZone, isImportedZone } from '@/types/zone'
import { getZoneColor } from './zoneColors'

/**
 * Render style configuration for a zone polygon
 */
export interface ZoneRenderStyle {
  /** Fill color (hex) */
  fill: string
  /** Stroke color (hex) */
  stroke: string
  /** Stroke width in pixels */
  strokeWidth: number
  /** Dash pattern for stroke [dash, gap] */
  strokeDash: number[]
  /** Fill opacity (0-1) */
  opacity: number
  /** Pattern type for visual differentiation */
  pattern: 'solid' | 'hatched'
}

/**
 * Darken a hex color by a percentage
 * @param hex - Hex color code (e.g., #FF5722)
 * @param percent - Amount to darken (0-1, where 0.2 = 20% darker)
 * @returns Darkened hex color
 */
export function darkenColor(hex: string, percent: number): string {
  // Parse hex color
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // Darken each component
  const factor = 1 - Math.min(1, Math.max(0, percent))
  const newR = Math.round(r * factor)
  const newG = Math.round(g * factor)
  const newB = Math.round(b * factor)

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

/**
 * Lighten a hex color by a percentage
 * @param hex - Hex color code (e.g., #FF5722)
 * @param percent - Amount to lighten (0-1, where 0.2 = 20% lighter)
 * @returns Lightened hex color
 */
export function lightenColor(hex: string, percent: number): string {
  // Parse hex color
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // Lighten each component (move toward 255)
  const factor = Math.min(1, Math.max(0, percent))
  const newR = Math.round(r + (255 - r) * factor)
  const newG = Math.round(g + (255 - g) * factor)
  const newB = Math.round(b + (255 - b) * factor)

  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

/**
 * Get the render style for a zone based on its type and travelability
 * Travelable zones get solid fills with higher opacity
 * Non-travelable zones get hatched patterns with lower opacity
 * @param zone - The zone to style
 * @returns Render style configuration
 */
export function getZoneStyle(zone: Zone): ZoneRenderStyle {
  const baseColor = zone.metadata.color ?? getZoneColor(zone.type)
  const travelable = isTravelable(zone.type)

  if (travelable) {
    // Travelable zones: solid, higher visibility
    return {
      fill: baseColor,
      stroke: darkenColor(baseColor, 0.2),
      strokeWidth: 2,
      strokeDash: [],
      opacity: 0.4,
      pattern: 'solid',
    }
  } else {
    // Non-travelable zones: hatched, lower visibility
    return {
      fill: baseColor,
      stroke: darkenColor(baseColor, 0.3),
      strokeWidth: 1,
      strokeDash: [4, 4],
      opacity: 0.3,
      pattern: 'hatched',
    }
  }
}

/**
 * Get style for a zone in selected state
 * @param zone - The zone to style
 * @returns Render style configuration for selected state
 */
export function getSelectedZoneStyle(zone: Zone): ZoneRenderStyle {
  const baseStyle = getZoneStyle(zone)
  return {
    ...baseStyle,
    strokeWidth: 3,
    strokeDash: [],
    opacity: Math.min(baseStyle.opacity + 0.2, 0.8),
  }
}

/**
 * Get style for a zone in hovered state
 * @param zone - The zone to style
 * @returns Render style configuration for hovered state
 */
export function getHoveredZoneStyle(zone: Zone): ZoneRenderStyle {
  const baseStyle = getZoneStyle(zone)
  return {
    ...baseStyle,
    strokeWidth: 2,
    opacity: Math.min(baseStyle.opacity + 0.1, 0.7),
  }
}

/**
 * Get the appropriate hatch angle for a zone based on its direction
 * @param zone - The zone (checks customProperties.direction)
 * @returns Angle in degrees (0 for vertical lines, 90 for horizontal)
 */
export function getHatchAngle(zone: Zone): number {
  const direction = zone.metadata.customProperties.direction
  // Hatch lines run perpendicular to the direction of travel
  return direction === 'vertical' ? 0 : 90
}

/**
 * Default hatch pattern configuration
 */
export const DEFAULT_HATCH_CONFIG = {
  spacing: 8,
  strokeWidth: 1,
  opacity: 0.5,
} as const

/**
 * Check if a zone should display a direction indicator
 * @param zone - The zone to check
 * @returns true if the zone has direction metadata
 */
export function shouldShowDirectionIndicator(zone: Zone): boolean {
  const direction = zone.metadata.customProperties.direction
  return direction === 'horizontal' || direction === 'vertical'
}

/**
 * Calculate arrow size based on zone area
 * @param zoneArea - Area of the zone in square pixels
 * @returns Arrow length in pixels (clamped between min and max)
 */
export function calculateArrowSize(zoneArea: number): number {
  const minSize = 15
  const maxSize = 40

  // Scale based on sqrt of area (proportional to side length)
  const scale = Math.sqrt(zoneArea) / 10

  return Math.min(maxSize, Math.max(minSize, scale))
}

/**
 * Source-based style modifiers for different zone sources
 */
export interface SourceStyleModifiers {
  /** Stroke dash pattern override */
  strokeDash?: number[]
  /** Additional stroke width */
  strokeWidthAdd: number
  /** Opacity multiplier (applied to base opacity) */
  opacityMultiplier: number
  /** Border color override */
  borderColor?: string
}

/**
 * Get style modifiers based on zone source
 * Programmatic zones (TDOA/coverage) have distinct visual appearance
 * @param source - Zone source type
 * @returns Style modifiers for the source
 */
export function getSourceStyleModifiers(
  source: ZoneSource
): SourceStyleModifiers {
  switch (source) {
    case 'tdoa':
      // TDOA-derived aisles: dotted stroke, slightly more visible
      return {
        strokeDash: [2, 4],
        strokeWidthAdd: 1,
        opacityMultiplier: 1.1,
        borderColor: '#FFA500', // Orange accent
      }
    case 'coverage':
      // Coverage-derived travel lanes: dashed stroke
      return {
        strokeDash: [6, 3],
        strokeWidthAdd: 0,
        opacityMultiplier: 1.0,
        borderColor: '#00CED1', // Dark cyan accent
      }
    case 'imported':
      // Imported zones: double dash
      return {
        strokeDash: [4, 2, 1, 2],
        strokeWidthAdd: 0,
        opacityMultiplier: 1.0,
        borderColor: '#9370DB', // Medium purple accent
      }
    case 'ai':
    case 'manual':
    default:
      // AI and manual zones: no special modifiers
      return {
        strokeWidthAdd: 0,
        opacityMultiplier: 1.0,
      }
  }
}

/**
 * Get the complete render style for a zone including source-based modifiers
 * @param zone - The zone to style
 * @returns Complete render style with source modifiers applied
 */
export function getZoneStyleWithSource(zone: Zone): ZoneRenderStyle {
  const baseStyle = getZoneStyle(zone)
  const sourceModifiers = getSourceStyleModifiers(zone.source)

  return {
    ...baseStyle,
    strokeWidth: baseStyle.strokeWidth + sourceModifiers.strokeWidthAdd,
    strokeDash: sourceModifiers.strokeDash ?? baseStyle.strokeDash,
    opacity: baseStyle.opacity * sourceModifiers.opacityMultiplier,
    stroke: sourceModifiers.borderColor ?? baseStyle.stroke,
  }
}

/**
 * Check if a zone should show a source indicator badge
 * @param zone - The zone to check
 * @returns true if the zone should show its source visually
 */
export function shouldShowSourceIndicator(zone: Zone): boolean {
  return isProgrammaticZone(zone) || isImportedZone(zone)
}
