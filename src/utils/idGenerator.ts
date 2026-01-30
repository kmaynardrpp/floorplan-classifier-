/**
 * Generate unique IDs for zones
 */

/**
 * Module-level counter for generating incrementing zone IDs
 * Starts at 1000 to allow for reserved IDs below
 */
let zoneIdCounter = 1000

/**
 * Generate a unique incrementing zone_id
 * These are used for zones.json export format
 *
 * @returns Incrementing zone ID number
 */
export function generateZoneId(): number {
  return zoneIdCounter++
}

/**
 * Reset the zone ID counter
 * Primarily used for testing to ensure deterministic IDs
 *
 * @param startValue - Optional starting value (defaults to 1000)
 */
export function resetZoneIdCounter(startValue: number = 1000): void {
  zoneIdCounter = startValue
}

/**
 * Get the current zone ID counter value without incrementing
 *
 * @returns Current counter value
 */
export function getCurrentZoneIdCounter(): number {
  return zoneIdCounter
}

/**
 * Generate a UUID v4 string
 * Used for zone IDs in the internal format
 *
 * @returns UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback implementation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Generate a short unique ID (8 characters)
 * Useful for display purposes
 *
 * @returns Short ID string
 */
export function generateShortId(): string {
  return generateUID().split('-')[0] ?? generateUID().slice(0, 8)
}

/**
 * Validate if a string is a valid UUID format
 *
 * @param id - String to validate
 * @returns true if valid UUID format
 */
export function isValidUID(id: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

/**
 * Generate a zone ID string with a prefix
 *
 * @param prefix - Prefix for the ID (e.g., "zone", "aisle", "travel_lane")
 * @returns Formatted ID string (e.g., "zone_1001")
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateZoneId()}`
}
