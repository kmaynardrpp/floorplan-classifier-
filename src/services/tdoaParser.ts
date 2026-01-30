/**
 * Parser for schedule.csv TDOA pair configuration files
 */

import type { TDOAPair, TDOADimension } from '@/types/config'

/**
 * Error thrown when CSV parsing fails
 */
export class CSVParseError extends Error {
  constructor(
    message: string,
    public readonly lineNumber?: number
  ) {
    super(lineNumber ? `Line ${lineNumber}: ${message}` : message)
    this.name = 'CSVParseError'
  }
}

/**
 * Expected CSV headers for schedule.csv
 */
const EXPECTED_HEADERS = [
  '#',
  'Source',
  'Destination',
  'Slot',
  'Dimension',
  'Distance',
  'Boundary',
  'Margin',
]

/**
 * Parse a CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  fields.push(current.trim())

  return fields
}

/**
 * Normalize line endings and split into lines
 */
function splitLines(csvString: string): string[] {
  // Normalize line endings: CRLF -> LF, CR -> LF
  const normalized = csvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalized.split('\n')
}

/**
 * Parse a numeric field, returning NaN if invalid
 */
function parseNumber(value: string): number {
  const trimmed = value.trim()
  if (trimmed === '') return NaN
  return Number(trimmed)
}

/**
 * Validate dimension field
 */
function validateDimension(value: string): TDOADimension {
  const trimmed = value.trim().toUpperCase()
  if (trimmed !== '1D' && trimmed !== '2D') {
    throw new Error(`Invalid dimension: ${value}`)
  }
  return trimmed as TDOADimension
}

/**
 * Parse a single CSV row into a TDOAPair object
 */
function parseRow(fields: string[], lineNumber: number): TDOAPair {
  if (fields.length < EXPECTED_HEADERS.length) {
    throw new CSVParseError(
      `Expected ${EXPECTED_HEADERS.length} columns, got ${fields.length}`,
      lineNumber
    )
  }

  // At this point we know fields has at least EXPECTED_HEADERS.length elements
  const field0 = fields[0] ?? ''
  const field1 = fields[1] ?? ''
  const field2 = fields[2] ?? ''
  const field3 = fields[3] ?? ''
  const field4 = fields[4] ?? ''
  const field5 = fields[5] ?? ''
  const field6 = fields[6] ?? ''
  const field7 = fields[7] ?? ''

  const rowNumber = parseNumber(field0)
  if (Number.isNaN(rowNumber)) {
    throw new CSVParseError(`Invalid row number: ${field0}`, lineNumber)
  }

  const distance = parseNumber(field5)
  if (Number.isNaN(distance)) {
    throw new CSVParseError(`Invalid distance: ${field5}`, lineNumber)
  }

  const margin = parseNumber(field7)
  if (Number.isNaN(margin)) {
    throw new CSVParseError(`Invalid margin: ${field7}`, lineNumber)
  }

  let dimension: TDOADimension
  try {
    dimension = validateDimension(field4)
  } catch {
    throw new CSVParseError(`Invalid dimension: ${field4}`, lineNumber)
  }

  return {
    rowNumber,
    Source: field1.trim(),
    Destination: field2.trim(),
    Slot: field3.trim(),
    Dimension: dimension,
    Distance: distance,
    Boundary: field6.trim(),
    Margin: margin,
  }
}

/**
 * Check if a row is the header row
 */
function isHeaderRow(fields: string[]): boolean {
  if (fields.length === 0) return false
  const firstField = (fields[0] ?? '').trim().toLowerCase()
  return firstField === '#' || firstField === 'id' || firstField === 'row'
}

/**
 * Parse schedule.csv and extract TDOA pairs
 *
 * @param csvString - CSV file contents as string
 * @returns Array of TDOAPair objects
 * @throws CSVParseError if parsing fails
 */
export function parseTDOAPairs(csvString: string): TDOAPair[] {
  const pairs: TDOAPair[] = []
  const lines = splitLines(csvString)

  let headerSkipped = false

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (rawLine === undefined) continue

    const line = rawLine.trim()
    const lineNumber = i + 1

    // Skip empty lines
    if (line === '') continue

    // Skip comment lines
    if (line.startsWith('//') || line.startsWith('#')) continue

    const fields = parseCSVLine(line)

    // Skip header row (first non-empty row with header-like content)
    if (!headerSkipped && isHeaderRow(fields)) {
      headerSkipped = true
      continue
    }

    try {
      const pair = parseRow(fields, lineNumber)
      pairs.push(pair)
    } catch (error) {
      if (error instanceof CSVParseError) {
        throw error
      }
      throw new CSVParseError(
        `Failed to parse row: ${(error as Error).message}`,
        lineNumber
      )
    }
  }

  return pairs
}

/**
 * Filter TDOA pairs to only 1D pairs (aisles)
 *
 * @param pairs - Array of TDOA pairs
 * @returns Array of 1D TDOA pairs only
 */
export function filter1DPairs(pairs: TDOAPair[]): TDOAPair[] {
  return pairs.filter((pair) => pair.Dimension === '1D')
}

/**
 * Filter TDOA pairs to only 2D pairs (coverage areas)
 *
 * @param pairs - Array of TDOA pairs
 * @returns Array of 2D TDOA pairs only
 */
export function filter2DPairs(pairs: TDOAPair[]): TDOAPair[] {
  return pairs.filter((pair) => pair.Dimension === '2D')
}

/**
 * Get unique slot identifiers from TDOA pairs
 *
 * @param pairs - Array of TDOA pairs
 * @returns Array of unique slot strings
 */
export function getUniqueSlots(pairs: TDOAPair[]): string[] {
  const slots = new Set<string>()
  for (const pair of pairs) {
    if (pair.Slot) {
      slots.add(pair.Slot)
    }
  }
  return Array.from(slots).sort()
}

/**
 * Get all unique anchor names referenced in TDOA pairs
 *
 * @param pairs - Array of TDOA pairs
 * @returns Array of unique anchor names
 */
export function getReferencedAnchors(pairs: TDOAPair[]): string[] {
  const names = new Set<string>()
  for (const pair of pairs) {
    if (pair.Source) names.add(pair.Source)
    if (pair.Destination) names.add(pair.Destination)
  }
  return Array.from(names).sort()
}
