/**
 * Parser for floorplans.json configuration files
 */

import type { FloorplanConfig } from '@/types/config'

/**
 * Error thrown when floorplan parsing fails
 */
export class FloorplanParseError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message)
    this.name = 'FloorplanParseError'
  }
}

/**
 * Validates that a value is a number
 */
function assertNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new FloorplanParseError(
      `Field '${fieldName}' must be a number, got ${typeof value}`,
      fieldName
    )
  }
  return value
}

/**
 * Validates that a value is a positive number
 */
function assertPositiveNumber(value: unknown, fieldName: string): number {
  const num = assertNumber(value, fieldName)
  if (num <= 0) {
    throw new FloorplanParseError(
      `Field '${fieldName}' must be positive, got ${num}`,
      fieldName
    )
  }
  return num
}

/**
 * Validates that a value is a non-empty string
 */
function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FloorplanParseError(
      `Field '${fieldName}' must be a non-empty string, got ${typeof value}`,
      fieldName
    )
  }
  return value
}

/**
 * Parse a single floorplan configuration object
 */
function parseFloorplanObject(obj: unknown): FloorplanConfig {
  if (!obj || typeof obj !== 'object') {
    throw new FloorplanParseError('Floorplan must be an object')
  }

  const data = obj as Record<string, unknown>

  return {
    filename: assertString(data.filename, 'filename'),
    width: assertPositiveNumber(data.width, 'width'),
    height: assertPositiveNumber(data.height, 'height'),
    image_offset_x: assertNumber(data.image_offset_x, 'image_offset_x'),
    image_offset_y: assertNumber(data.image_offset_y, 'image_offset_y'),
    image_scale: assertPositiveNumber(data.image_scale, 'image_scale'),
    current_scale:
      data.current_scale !== undefined
        ? assertNumber(data.current_scale, 'current_scale')
        : undefined,
    image_rotation:
      data.image_rotation !== undefined
        ? assertNumber(data.image_rotation, 'image_rotation')
        : undefined,
    sublocation_uid: assertString(data.sublocation_uid, 'sublocation_uid'),
  }
}

/**
 * Parse floorplans.json and extract the floorplan configuration
 *
 * Handles two formats:
 * 1. Array format: { floorplans: [...] } - extracts first floorplan
 * 2. Single object format: { filename, width, ... } - returns directly
 *
 * @param json - Parsed JSON data (unknown type for safety)
 * @returns The parsed FloorplanConfig
 * @throws FloorplanParseError if parsing fails
 */
export function parseFloorplanConfig(json: unknown): FloorplanConfig {
  if (!json || typeof json !== 'object') {
    throw new FloorplanParseError('Input must be a JSON object')
  }

  const data = json as Record<string, unknown>

  // Check for array format: { floorplans: [...] }
  if (Array.isArray(data.floorplans)) {
    const floorplans = data.floorplans as unknown[]
    if (floorplans.length === 0) {
      throw new FloorplanParseError('floorplans array is empty')
    }
    return parseFloorplanObject(floorplans[0])
  }

  // Check if it's already a floorplan object (has filename field)
  if ('filename' in data) {
    return parseFloorplanObject(data)
  }

  throw new FloorplanParseError(
    'Invalid format: expected { floorplans: [...] } or floorplan object with filename'
  )
}

/**
 * Parse floorplans.json and extract all floorplan configurations
 *
 * @param json - Parsed JSON data
 * @returns Array of FloorplanConfig objects
 * @throws FloorplanParseError if parsing fails
 */
export function parseAllFloorplanConfigs(json: unknown): FloorplanConfig[] {
  if (!json || typeof json !== 'object') {
    throw new FloorplanParseError('Input must be a JSON object')
  }

  const data = json as Record<string, unknown>

  if (!Array.isArray(data.floorplans)) {
    throw new FloorplanParseError('Expected floorplans array')
  }

  return (data.floorplans as unknown[]).map((fp, index) => {
    try {
      return parseFloorplanObject(fp)
    } catch (error) {
      if (error instanceof FloorplanParseError) {
        throw new FloorplanParseError(
          `Floorplan at index ${index}: ${error.message}`,
          error.field
        )
      }
      throw error
    }
  })
}
