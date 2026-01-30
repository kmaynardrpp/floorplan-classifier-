/**
 * Configuration file type definitions for TDOA-based zone detection
 * These interfaces match the JSON/CSV file formats from the spec
 */

import type { Point } from './zone'

// =============================================================================
// Floorplan Configuration (floorplans.json)
// =============================================================================

/**
 * Floorplan configuration defining image scaling and offset relative to real-world coordinates
 *
 * IMPORTANT: Uses RDB visualization conventions:
 * - image_offset_x/y are PIXEL coordinates of the image CENTER (not mm!)
 * - image_scale needs to be multiplied by 100 to get actual mm/pixel
 *
 * Example from floorplans.json:
 *   width: 11507 (pixels)
 *   height: 4276 (pixels)
 *   image_offset_x: 5649 (~= width/2, in pixels)
 *   image_offset_y: 1934 (~= height/2, in pixels)
 *   image_scale: 0.482276 (multiply by 100 → 48.2276 mm/pixel)
 */
export interface FloorplanConfig {
  /** Image filename */
  filename: string
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
  /** X coordinate of image center in PIXELS (not mm!) - typically ~width/2 */
  image_offset_x: number
  /** Y coordinate of image center in PIXELS (not mm!) - typically ~height/2 */
  image_offset_y: number
  /** Scale factor: multiply by 100 to get mm per pixel */
  image_scale: number
  /** Current display scale (optional) */
  current_scale?: number
  /** Image rotation in degrees (optional) */
  image_rotation?: number
  /** Sublocation UID for cross-referencing */
  sublocation_uid: string
}

/**
 * Wrapper for floorplans.json file format
 */
export interface FloorplansJson {
  floorplans: FloorplanConfig[]
}

// =============================================================================
// Anchor Configuration (win_anchors.json)
// =============================================================================

/**
 * 3D position with orientation for an anchor
 */
export interface AnchorPosition {
  /** X position in mm */
  x: number
  /** Y position in mm */
  y: number
  /** Z height in mm */
  z: number
  /** Yaw orientation in degrees */
  yaw: number
  /** Sublocation UID */
  sl_uid: string
}

/**
 * Anchor device definition
 */
export interface Anchor {
  /** Human-readable name (matches schedule.csv Source/Destination) */
  name: string
  /** Unique identifier */
  uid: string
  /** Device type (typically "ANCHOR") */
  type: string
  /** 3D position */
  position: AnchorPosition
  /** Whether position is locked from editing */
  locked: boolean
}

/**
 * Wrapper for win_anchors.json file format
 */
export interface AnchorsJson {
  win_anchors: Anchor[]
}

// =============================================================================
// TDOA Schedule (schedule.csv)
// =============================================================================

/**
 * Dimension type for TDOA pairs
 * - 1D: Aisle detection (anchor-to-anchor line)
 * - 2D: General coverage area
 */
export type TDOADimension = '1D' | '2D'

/**
 * TDOA pair definition from schedule.csv
 * Defines anchor-to-anchor connections for aisle detection
 */
export interface TDOAPair {
  /** Row number from the CSV (the "#" column) */
  rowNumber: number
  /** Source anchor name */
  Source: string
  /** Destination anchor name */
  Destination: string
  /** Slot identifier (e.g., "46B", "17A") */
  Slot: string
  /** Dimension type: 1D for aisles, 2D for coverage */
  Dimension: TDOADimension
  /** Distance between anchors in mm */
  Distance: number
  /** Boundary indicator */
  Boundary: string
  /** Width of the aisle in mm (perpendicular to anchor line) */
  Margin: number
}

// =============================================================================
// Coverage Configuration (coverage.json)
// =============================================================================

/**
 * Point in coverage polygon (mm coordinates)
 */
export interface CoveragePoint {
  x: number
  y: number
}

/**
 * Geometry definition for a coverage polygon
 */
export interface CoverageGeometry {
  /** Shape type (typically "POLYGON") */
  shape: string
  /** Margin in mm */
  margin: number
  /** Threshold in mm */
  threshold: number
  /** Polygon vertices in mm coordinates */
  points: CoveragePoint[]
}

/**
 * Coverage polygon definition
 */
export interface CoveragePolygon {
  /** Unique identifier */
  uid: string
  /** Coverage type: "1D" for aisles, "2D" for travel areas */
  type: '1D' | '2D'
  /** Whether this is an exclusion zone (not travelable) */
  exclusion: boolean
  /** Polygon geometry */
  geometry: CoverageGeometry
  /** Sublocation UID */
  sublocation_uid: string
}

/**
 * Wrapper for coverage.json file format
 */
export interface CoverageJson {
  location_service_coverage: CoveragePolygon[]
}

// =============================================================================
// Zones Import/Export (zones.json)
// =============================================================================

/**
 * Zone type information in zones.json format
 */
export interface ZoneTypeInfo {
  /** Numeric type ID */
  id: number
  /** Type name (snake_case) */
  name: string
  /** Human-readable display name */
  display_name: string
}

/**
 * Zone geometry in zones.json format (mm coordinates)
 */
export interface ZoneGeometry {
  /** Polygon vertices in mm */
  positions: Point[]
}

/**
 * Zone definition in zones.json format
 */
export interface ZonesJsonZone {
  /** Zone display name */
  name: string
  /** Unique zone identifier (optional) */
  uid?: string
  /** Numeric zone ID */
  zone_id: number
  /** Whether zone is active */
  active: boolean
  /** Shape type (typically "polygon") */
  shape: string
  /** Zone type information */
  zone_type: ZoneTypeInfo
  /** Zone type name (snake_case) */
  zone_type_name: string
  /** Polygon geometry */
  zone_geometry: ZoneGeometry
  /** Zone activation mode */
  zone_mode: string
  /** Priority level */
  priority: number
  /** Sublocation UID */
  sublocation_uid: string
  /** Project UID */
  project_uid: string
  /** Creation timestamp (ISO 8601) */
  created_at?: string
  /** Last update timestamp (ISO 8601) */
  updated_at?: string
}

/**
 * Wrapper for zones.json file format
 */
export interface ZonesJson {
  zones: ZonesJsonZone[]
}

// =============================================================================
// Nodes Configuration (nodes.json) - Optional
// =============================================================================

/**
 * Network node definition
 */
export interface NetworkNode {
  /** Hex MAC address */
  mac_address: string
  /** Decimal node ID */
  node_id: number
  /** Node name */
  name: string
  /** Node type: "WIN" for anchor, "TO" for tag */
  node_type: 'WIN' | 'TO' | string
  /** Bridge MAC address */
  bridge_mac_address: string
}

/**
 * Wrapper for nodes.json file format
 */
export interface NodesJson {
  nodes: NetworkNode[]
}

// =============================================================================
// Coordinate Transformer Interface
// =============================================================================

/**
 * Bidirectional coordinate transformer for mm ↔ pixel conversion
 */
export interface FloorplanTransformer {
  /** Convert mm coordinates to pixel coordinates */
  toPixels(point: Point): Point
  /** Convert pixel coordinates to mm coordinates */
  toMm(point: Point): Point
  /** Transform entire polygon from mm to pixels */
  polygonToPixels(points: Point[]): Point[]
  /** Transform entire polygon from pixels to mm */
  polygonToMm(points: Point[]): Point[]
  /** Check if pixel coordinates are within image bounds */
  isWithinBounds(point: Point): boolean
  /** Get the floorplan config */
  readonly config: FloorplanConfig
}

// =============================================================================
// Generation Statistics
// =============================================================================

/**
 * Statistics from programmatic zone generation
 */
export interface GenerationStats {
  /** Total zones generated */
  totalZones: number
  /** Number of aisle zones (from TDOA) */
  aisleZones: number
  /** Number of travel lane zones (from coverage) */
  travelLaneZones: number
  /** Number of duplicate zones skipped */
  skippedDuplicates: number
}

// =============================================================================
// Export Configuration
// =============================================================================

/**
 * Configuration for zone export
 */
export interface ExportConfig {
  /** Project UID for exported zones */
  projectUid: string
  /** Sublocation UID for exported zones */
  sublocationUid: string
}

/**
 * Options for zone import
 */
export interface ImportOptions {
  /** Import mode: replace all or merge with existing */
  mode: 'replace' | 'merge'
  /** Skip zones with duplicate IDs */
  skipDuplicates?: boolean
}
