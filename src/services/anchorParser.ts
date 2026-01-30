/**
 * Parser for win_anchors.json configuration files
 */

import type { Anchor, AnchorPosition } from '@/types/config'

/**
 * Error thrown when anchor parsing fails
 */
export class AnchorParseError extends Error {
  constructor(
    message: string,
    public readonly anchorName?: string
  ) {
    super(message)
    this.name = 'AnchorParseError'
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
 * Parse a single anchor position object
 */
function parseAnchorPosition(obj: unknown): AnchorPosition | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  if (!isValidNumber(data.x) || !isValidNumber(data.y)) {
    return null
  }

  return {
    x: data.x,
    y: data.y,
    z: isValidNumber(data.z) ? data.z : 0,
    yaw: isValidNumber(data.yaw) ? data.yaw : 0,
    sl_uid: isValidString(data.sl_uid) ? data.sl_uid : '',
  }
}

/**
 * Parse a single anchor object
 */
function parseAnchorObject(obj: unknown): Anchor | null {
  if (!obj || typeof obj !== 'object') {
    return null
  }

  const data = obj as Record<string, unknown>

  // Validate required fields
  if (!isValidString(data.name)) {
    console.warn('[anchorParser] Skipping anchor with invalid name:', data)
    return null
  }

  const position = parseAnchorPosition(data.position)
  if (!position) {
    console.warn(
      `[anchorParser] Skipping anchor '${data.name}' with invalid position:`,
      data.position
    )
    return null
  }

  return {
    name: data.name,
    uid: isValidString(data.uid) ? data.uid : '',
    type: isValidString(data.type) ? data.type : 'ANCHOR',
    position,
    locked: typeof data.locked === 'boolean' ? data.locked : false,
  }
}

/**
 * Parse win_anchors.json and build a Map for O(1) lookup by anchor name
 *
 * @param json - Parsed JSON data (unknown type for safety)
 * @returns Map of anchor name to Anchor object
 */
export function parseAnchors(json: unknown): Map<string, Anchor> {
  const anchors = new Map<string, Anchor>()

  if (!json || typeof json !== 'object') {
    console.warn('[anchorParser] Input is not an object, returning empty Map')
    return anchors
  }

  const data = json as Record<string, unknown>

  // Extract win_anchors array
  const winAnchors = data.win_anchors
  if (!Array.isArray(winAnchors)) {
    console.warn(
      '[anchorParser] win_anchors is not an array, returning empty Map'
    )
    return anchors
  }

  // Parse each anchor
  for (const anchorData of winAnchors) {
    const anchor = parseAnchorObject(anchorData)
    if (anchor) {
      // Note: Case-sensitive key lookup
      anchors.set(anchor.name, anchor)
    }
  }

  return anchors
}

/**
 * Get an anchor by name from the anchors Map
 *
 * @param anchors - Map of anchors
 * @param name - Anchor name to look up (case-sensitive)
 * @returns Anchor object or undefined if not found
 */
export function getAnchorByName(
  anchors: Map<string, Anchor>,
  name: string
): Anchor | undefined {
  return anchors.get(name)
}

/**
 * Get all anchor names from the anchors Map
 *
 * @param anchors - Map of anchors
 * @returns Array of anchor names
 */
export function getAnchorNames(anchors: Map<string, Anchor>): string[] {
  return Array.from(anchors.keys())
}

/**
 * Check if all anchor names exist in the anchors Map
 *
 * @param anchors - Map of anchors
 * @param names - Array of anchor names to check
 * @returns Object with found and missing arrays
 */
export function checkAnchorNames(
  anchors: Map<string, Anchor>,
  names: string[]
): { found: string[]; missing: string[] } {
  const found: string[] = []
  const missing: string[] = []

  for (const name of names) {
    if (anchors.has(name)) {
      found.push(name)
    } else {
      missing.push(name)
    }
  }

  return { found, missing }
}
