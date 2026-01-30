/**
 * Blocked Area Detection API
 *
 * Analyzes cropped 2D coverage regions to identify non-travelable areas (obstacles).
 * This replaces the old coarse detection + sub-agent approach.
 *
 * Includes AI-powered verification/adjustment pass that shows detected zones
 * overlaid on the image and allows the AI to refine or add zones.
 */

import type { Point } from '@/types/zone'
import type { PolygonCropResult } from './imageCropper'
import { cropImageWithPadding } from './imageCropper'
import {
  getCentroid,
  constrainZoneToCoverage,
  getPolygonBounds,
} from '@/utils/geometry'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
// Use Sonnet for faster, cheaper blocked area analysis
const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 4096

// =============================================================================
// Programmatic Containment Functions
// =============================================================================

// Note: movePointToward and constrainZoneToCoverage are now imported from @/utils/geometry

/**
 * Apply programmatic containment to all zones
 * Removes zones entirely outside coverage, shrinks zones that partially overlap
 */
export function applyContainmentToZones(
  zones: BlockedAreaResult[],
  coveragePolygon: Point[]
): { zones: BlockedAreaResult[]; removed: number; adjusted: number } {
  const result: BlockedAreaResult[] = []
  let removed = 0
  let adjusted = 0

  for (const zone of zones) {
    const constrainResult = constrainZoneToCoverage(zone.vertices, coveragePolygon)

    if (constrainResult.removedEntirely || constrainResult.vertices === null) {
      console.log(`[containment] Removing zone "${zone.name}" - entirely outside coverage`)
      removed++
      continue
    }

    if (constrainResult.adjustedCount > 0) {
      adjusted++
      console.log(`[containment] Adjusted zone "${zone.name}" (${constrainResult.adjustedCount} vertices)`)
    }

    result.push({
      ...zone,
      vertices: constrainResult.vertices,
    })
  }

  console.log(`[containment] Summary: ${result.length} zones kept, ${removed} removed, ${adjusted} adjusted`)

  return { zones: result, removed, adjusted }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Reason why an area is blocked/non-travelable
 */
export type BlockedAreaReason =
  | 'racking'
  | 'conveyor'
  | 'equipment'
  | 'obstacle'
  | 'other'

/**
 * Result from blocked area detection for a single area
 */
export interface BlockedAreaResult {
  /** Descriptive name for the blocked area */
  name: string
  /** Reason why this area is blocked */
  reason: BlockedAreaReason
  /** Polygon vertices (in cropped image coordinates) */
  vertices: Point[]
  /** AI confidence score 0-1 */
  confidence: number
}

/**
 * Full response from blocked area analysis
 */
export interface BlockedAreaAnalysisResponse {
  /** Detected blocked areas */
  blockedAreas: BlockedAreaResult[]
  /** Raw response from AI for debugging */
  rawResponse: string
}

// Import shared error types and utilities from claudeApi
import { ApiError, type ApiErrorType, getErrorType } from './claudeApi'
export type { ApiErrorType }

/**
 * Error class for blocked area API (extends shared ApiError)
 */
export class BlockedAreaApiError extends ApiError {
  constructor(
    message: string,
    type: ApiErrorType,
    statusCode?: number,
    retryable: boolean = false
  ) {
    super(message, type, statusCode, retryable, 'anthropic')
    this.name = 'BlockedAreaApiError'
  }
}

// =============================================================================
// Prompt
// =============================================================================

/**
 * Generate the prompt for blocked area detection
 */
function getBlockedAreaPrompt(cropWidth: number, cropHeight: number): string {
  return `You are analyzing a CROPPED region of a warehouse floorplan.
This region is a 2D coverage area where robots can potentially travel.

YOUR TASK: Identify NON-TRAVELABLE areas (obstacles) within this region.

Image dimensions: ${cropWidth} x ${cropHeight} pixels. All coordinates must be within this range.

## WHAT TO LOOK FOR

Identify areas that would PHYSICALLY BLOCK travel:

1. **Racking/Shelving** - Dense parallel lines (black/dark), representing storage shelves
   - These appear as groups of parallel vertical OR horizontal lines
   - The lines are shelf uprights viewed from above

2. **Conveyor Belts** - Linear mechanical systems
   - Often show roller patterns or belt textures
   - Usually run in straight lines through the space

3. **Equipment** - Fixed machinery or large equipment
   - Compressors, packaging machines, etc.
   - Usually solid rectangular or irregular shapes

4. **Obstacles** - Walls, pillars, barriers
   - Any fixed structural element blocking travel

## IMPORTANT NOTES

- Focus on OBSTACLES only, not travel paths or open floor
- Return an EMPTY array if the entire region is clear/travelable
- Trace blocked area boundaries accurately with 4+ vertices
- Each blocked area should have at least 4 vertices forming a polygon
- Coordinates must be positive integers within image bounds

## OUTPUT FORMAT (JSON only, no markdown)

{
  "blocked_areas": [
    {
      "name": "Racking Section A",
      "reason": "racking",
      "vertices": [{"x": 10, "y": 20}, {"x": 100, "y": 20}, {"x": 100, "y": 200}, {"x": 10, "y": 200}],
      "confidence": 0.85
    }
  ]
}

## REASON VALUES
- "racking" - Storage shelving/racking systems
- "conveyor" - Conveyor or material handling systems
- "equipment" - Machinery or equipment
- "obstacle" - Fixed obstacles, walls, barriers
- "other" - Other non-travelable features

If no blocked areas are detected, return:
{"blocked_areas": []}`
}

// =============================================================================
// Response Parsing
// =============================================================================

/**
 * Raw blocked area from API response
 */
interface RawBlockedArea {
  name: string
  reason: string
  vertices: Array<{ x: number; y: number }>
  confidence: number
}

/**
 * Raw API response structure
 */
interface RawBlockedAreaResponse {
  blocked_areas: RawBlockedArea[]
}

/**
 * Parse blocked areas from Claude's response
 */
export function parseBlockedAreasFromResponse(
  responseText: string,
  cropWidth: number,
  cropHeight: number
): BlockedAreaResult[] {
  // Try to extract JSON from the response
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  let jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  // Also try finding raw JSON object if no code block
  if (!jsonMatch) {
    const firstBrace = responseText.indexOf('{')
    const lastBrace = responseText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = responseText.slice(firstBrace, lastBrace + 1)
    }
  }

  let parsed: RawBlockedAreaResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new BlockedAreaApiError(
      'Failed to parse blocked areas from API response',
      'invalid_response'
    )
  }

  // Handle empty or missing blocked_areas
  if (!parsed.blocked_areas) {
    // If it's an empty object or missing the key, treat as no blocked areas
    if (typeof parsed === 'object') {
      return []
    }
    throw new BlockedAreaApiError(
      'Invalid response format: missing blocked_areas array',
      'invalid_response'
    )
  }

  if (!Array.isArray(parsed.blocked_areas)) {
    throw new BlockedAreaApiError(
      'Invalid response format: blocked_areas is not an array',
      'invalid_response'
    )
  }

  // Parse and validate each blocked area
  const validReasons: BlockedAreaReason[] = [
    'racking',
    'conveyor',
    'equipment',
    'obstacle',
    'other',
  ]

  return parsed.blocked_areas.map((raw, index) => {
    // Validate required fields
    if (!raw.name || !Array.isArray(raw.vertices)) {
      throw new BlockedAreaApiError(
        `Invalid blocked area at index ${index}: missing required fields`,
        'invalid_response'
      )
    }

    if (raw.vertices.length < 3) {
      throw new BlockedAreaApiError(
        `Invalid blocked area at index ${index}: polygon needs at least 3 vertices`,
        'invalid_response'
      )
    }

    // Validate and clamp vertices to image bounds
    const vertices = raw.vertices.map((v) => ({
      x: Math.max(0, Math.min(cropWidth, Math.round(v.x))),
      y: Math.max(0, Math.min(cropHeight, Math.round(v.y))),
    }))

    // Normalize reason
    const reason: BlockedAreaReason = validReasons.includes(
      raw.reason as BlockedAreaReason
    )
      ? (raw.reason as BlockedAreaReason)
      : 'other'

    return {
      name: raw.name,
      reason,
      vertices,
      confidence:
        typeof raw.confidence === 'number'
          ? Math.max(0, Math.min(1, raw.confidence))
          : 0.5,
    }
  })
}

// =============================================================================
// API Functions
// =============================================================================

// Note: getErrorType is imported from claudeApi.ts

/**
 * Extract text content from Claude API response
 */
function extractTextContent(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'content' in data &&
    Array.isArray((data as { content: unknown[] }).content)
  ) {
    const content = (
      data as { content: Array<{ type: string; text?: string }> }
    ).content
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        return block.text
      }
    }
  }
  throw new BlockedAreaApiError('Invalid API response format', 'invalid_response')
}

/**
 * Analyze a cropped 2D coverage region for blocked areas
 *
 * @param croppedImageDataUrl - Cropped image data URL
 * @param apiKey - Anthropic API key
 * @param cropWidth - Width of the cropped image
 * @param cropHeight - Height of the cropped image
 * @param signal - Optional abort signal
 * @returns BlockedAreaAnalysisResponse with detected blocked areas
 */
export async function analyzeBlockedAreas(
  croppedImageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal?: AbortSignal
): Promise<BlockedAreaAnalysisResponse> {
  // Extract base64 data and media type
  const matches = croppedImageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new BlockedAreaApiError(
      'Invalid image data URL format',
      'invalid_response'
    )
  }

  const mediaType = matches[1] as
    | 'image/jpeg'
    | 'image/png'
    | 'image/gif'
    | 'image/webp'
  const base64Data = matches[2]

  const requestBody = {
    model: CLAUDE_SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: getBlockedAreaPrompt(cropWidth, cropHeight),
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new BlockedAreaApiError(
      'Network error: Unable to reach Claude API',
      'network',
      undefined,
      true
    )
  }

  if (!response.ok) {
    const errorType = getErrorType(response.status)
    const retryable = response.status >= 500 || response.status === 429

    let message = `API request failed with status ${response.status}`
    try {
      const errorBody = await response.json()
      if (errorBody.error?.message) {
        message = errorBody.error.message
      }
    } catch {
      // Ignore JSON parse errors for error body
    }

    throw new BlockedAreaApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()
  const rawResponse = extractTextContent(data)

  // Parse blocked areas from response
  const blockedAreas = parseBlockedAreasFromResponse(
    rawResponse,
    cropWidth,
    cropHeight
  )

  return {
    blockedAreas,
    rawResponse,
  }
}

/**
 * Analyze blocked areas with retry logic
 *
 * @param croppedImageDataUrl - Cropped image data URL
 * @param apiKey - Anthropic API key
 * @param cropWidth - Width of the cropped image
 * @param cropHeight - Height of the cropped image
 * @param signal - Optional abort signal
 * @param maxRetries - Maximum number of retries (default: 2)
 * @returns BlockedAreaAnalysisResponse with detected blocked areas
 */
export async function analyzeBlockedAreasWithRetry(
  croppedImageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal?: AbortSignal,
  maxRetries: number = 2
): Promise<BlockedAreaAnalysisResponse> {
  let lastError: Error | null = null
  let attempts = 0

  while (attempts <= maxRetries) {
    try {
      return await analyzeBlockedAreas(
        croppedImageDataUrl,
        apiKey,
        cropWidth,
        cropHeight,
        signal
      )
    } catch (error) {
      lastError = error as Error

      // Don't retry on abort
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }

      // Don't retry on auth errors
      if (error instanceof BlockedAreaApiError && error.type === 'auth') {
        throw error
      }

      // Retry on retryable errors
      if (
        error instanceof BlockedAreaApiError &&
        error.retryable &&
        attempts < maxRetries
      ) {
        attempts++
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000)
        console.log(
          `[blockedAreaApi] Retry ${attempts}/${maxRetries} after ${delay}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      throw error
    }
  }

  throw lastError
}

// =============================================================================
// Zone Overlay Rendering
// =============================================================================

/**
 * Colors for different blocked area reasons
 */
const ZONE_COLORS: Record<BlockedAreaReason, string> = {
  racking: '#FF6B6B',    // Red
  conveyor: '#4ECDC4',   // Teal
  equipment: '#FFE66D',  // Yellow
  obstacle: '#95E1D3',   // Mint
  other: '#DDA0DD',      // Plum
}

/**
 * Render blocked zones onto an image for AI verification
 *
 * @param imageDataUrl - Base image data URL
 * @param zones - Detected blocked areas to render
 * @param coveragePolygon - Coverage polygon boundary (in local coordinates)
 * @returns Data URL of image with zones overlaid
 */
export async function renderZonesOnImage(
  imageDataUrl: string,
  zones: BlockedAreaResult[],
  coveragePolygon?: Point[]
): Promise<string> {
  // Load the image
  const img = await loadImageFromDataUrl(imageDataUrl)

  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Draw the base image
  ctx.drawImage(img, 0, 0)

  // Draw coverage polygon boundary if provided
  if (coveragePolygon && coveragePolygon.length >= 3) {
    ctx.strokeStyle = '#00FF00'  // Green
    ctx.lineWidth = 2
    ctx.setLineDash([8, 4])  // Dashed line
    ctx.beginPath()
    ctx.moveTo(coveragePolygon[0]!.x, coveragePolygon[0]!.y)
    for (let i = 1; i < coveragePolygon.length; i++) {
      ctx.lineTo(coveragePolygon[i]!.x, coveragePolygon[i]!.y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])  // Reset dash
  }

  // Draw each blocked zone
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!
    const color = ZONE_COLORS[zone.reason] || '#888888'

    // Draw filled polygon with transparency
    ctx.fillStyle = color + '40'  // 25% opacity
    ctx.strokeStyle = color
    ctx.lineWidth = 2

    ctx.beginPath()
    ctx.moveTo(zone.vertices[0]!.x, zone.vertices[0]!.y)
    for (let j = 1; j < zone.vertices.length; j++) {
      ctx.lineTo(zone.vertices[j]!.x, zone.vertices[j]!.y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Draw zone number label at centroid
    const centroid = getCentroid(zone.vertices)
    const label = `${i + 1}`

    ctx.fillStyle = '#FFFFFF'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.font = 'bold 16px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Draw text with outline for visibility
    ctx.strokeText(label, centroid.x, centroid.y)
    ctx.fillText(label, centroid.x, centroid.y)
  }

  return canvas.toDataURL('image/png')
}

/**
 * Load an image from a data URL
 */
function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

// Note: Use getCentroid from @/utils/geometry instead of local getPolygonCentroid

// =============================================================================
// AI Verification/Adjustment
// =============================================================================

/**
 * Generate the prompt for iterative AI verification and adjustment of blocked areas
 */
function getIterativeVerificationPrompt(
  cropWidth: number,
  cropHeight: number,
  existingZones: BlockedAreaResult[],
  coveragePolygon: Point[],
  iterationNumber: number,
  maxIterations: number
): string {
  // Build zone descriptions
  const zoneDescriptions = existingZones.map((zone, i) => ({
    number: i + 1,
    name: zone.name,
    reason: zone.reason,
    vertices: zone.vertices,
    confidence: zone.confidence,
  }))

  // Calculate coverage polygon bounds for reference
  const coverageXs = coveragePolygon.map(p => p.x)
  const coverageYs = coveragePolygon.map(p => p.y)
  const coverageBounds = {
    minX: Math.round(Math.min(...coverageXs)),
    maxX: Math.round(Math.max(...coverageXs)),
    minY: Math.round(Math.min(...coverageYs)),
    maxY: Math.round(Math.max(...coverageYs)),
  }

  return `You are an expert at analyzing warehouse floorplans. Your job is to ACCURATELY detect blocked/non-travelable areas.

## ITERATION ${iterationNumber} of ${maxIterations}

IMAGE DIMENSIONS: ${cropWidth} x ${cropHeight} pixels

## VISUAL ELEMENTS ON THIS IMAGE

1. **GREEN DASHED LINE**: The 2D coverage area boundary (where robots operate)
   - Coverage bounds: X: ${coverageBounds.minX}-${coverageBounds.maxX}, Y: ${coverageBounds.minY}-${coverageBounds.maxY}

2. **COLORED NUMBERED POLYGONS**: Currently detected blocked zones from a previous pass
   - These are SUGGESTIONS - they may be WRONG, MISPOSITIONED, or MISSING areas
   - Colors: Red=racking, Teal=conveyor, Yellow=equipment, Mint=obstacle, Purple=other

${existingZones.length > 0 ? `## CURRENT ZONE DATA (may be inaccurate - verify carefully)
${JSON.stringify(zoneDescriptions, null, 2)}` : `## NO ZONES CURRENTLY DETECTED
You need to detect all blocked areas from scratch by examining the image.`}

## YOUR AUTHORITY - FULL CONTROL

You have COMPLETE AUTHORITY to:
1. **DISCARD** all existing zones and re-detect from scratch if they're wrong
2. **MOVE** any zone to match actual visible obstructions
3. **RESHAPE** polygons with new vertices to trace actual boundaries
4. **DELETE** false positives (zones with no visible obstruction)
5. **ADD** obstructions that were missed (but only if INSIDE coverage!)
6. **SPLIT** or **MERGE** zones as needed

## CRITICAL: WHAT TO DETECT

Look at the ACTUAL IMAGE (not the overlaid polygons) and find:
- **Racking/Shelving**: Dense parallel lines representing storage shelves (black/dark patterns)
- **Conveyors**: Linear mechanical systems with rollers/belt textures
- **Equipment**: Fixed machinery, compressors, packaging machines (solid shapes)
- **Obstacles**: Walls, pillars, barriers, structural elements
- **SOLID GRAY/BLACK BLOCKS**: Any solid-colored dark rectangular or irregular regions
  - These are often equipment, machinery, barriers, or structural elements
  - Mark them as "obstacle" or "equipment" even if you can't identify what they are
  - Pay attention to: dark gray rectangles, black shapes, any solid dark region that contrasts with the floor

## COORDINATE ACCURACY

- Your coordinates must match what you SEE in the image
- DO NOT preserve existing coordinates if they're wrong
- Trace the ACTUAL boundaries of visible obstructions
- Use the pixel positions where you SEE the obstruction edges
- Coordinates range: X: 0-${cropWidth - 1}, Y: 0-${cropHeight - 1}

## POSITION VALIDATION

For each zone you return, verify:
1. Does the polygon COVER a visible obstruction in the image?
2. Do the vertices trace the actual edges you can see?
3. Is the zone type correct for what's visible?

If a current zone is NOWHERE NEAR a visible obstruction, DELETE IT.
If you see an obstruction with NO zone covering it, ADD IT.

## OUTPUT FORMAT (JSON only, no markdown)

{
  "analysis": "What obstructions I see and what changes I'm making",
  "satisfied": false,
  "zones_removed": [1, 3],
  "blocked_areas": [
    {
      "original_number": null,
      "name": "Descriptive Name Based On What I See",
      "reason": "racking|conveyor|equipment|obstacle|other",
      "vertices": [{"x": N, "y": N}, {"x": N, "y": N}, {"x": N, "y": N}, {"x": N, "y": N}],
      "confidence": 0.9,
      "adjustment_note": "Why I placed this zone here"
    }
  ]
}

## SATISFACTION CHECK

Set "satisfied": true ONLY when:
- Every zone accurately covers a VISIBLE obstruction
- Zone boundaries match what you can actually SEE
- No visible obstructions are missing zones
- No zones are placed where there's no obstruction

${iterationNumber === 1 ? `
## FIRST ITERATION
Ignore the existing zone positions if they look wrong. Look at the RAW IMAGE and determine where obstructions actually are. The previous detection may have significant errors.
` : `
## ITERATION ${iterationNumber} - HUNT FOR MISSED OBSTRUCTIONS

Your PRIMARY task this iteration: Find what was MISSED.

SYSTEMATIC SCAN - Check each area:
□ TOP section - any solid dark blocks not covered by zones?
□ MIDDLE section - any gray/black shapes between existing zones?
□ BOTTOM section - anything near the coverage boundary?
□ CORNERS - small obstructions often overlooked here
□ EDGES of existing zones - any adjacent dark areas not included?

WHAT TO LOOK FOR:
- Solid gray rectangles (machinery, equipment)
- Black shapes of any kind (barriers, structures)
- Dark regions that contrast with the lighter floor
- Anything a forklift couldn't drive through

You still have FULL AUTHORITY to ADD new zones, ADJUST existing zones, REMOVE false positives.

Set "satisfied": true ONLY when you've scanned the ENTIRE area and found NO unmarked obstructions.
`}`
}

/**
 * Generate the prompt for final containment pass
 * AI can ONLY adjust vertex coordinates - no adding/removing zones
 */
function getContainmentPrompt(
  cropWidth: number,
  cropHeight: number,
  zones: BlockedAreaResult[],
  coveragePolygon: Point[]
): string {
  const zoneDescriptions = zones.map((zone, i) => ({
    number: i + 1,
    name: zone.name,
    reason: zone.reason,
    vertices: zone.vertices,
  }))

  return `You are performing a FINAL CONTAINMENT CHECK on blocked area polygons.

## THE PROBLEM

Some blocked zones (red polygons) extend OUTSIDE the 2D coverage area (green dashed line).
You must SHRINK these zones so they fit entirely INSIDE coverage.

## STRICT RULES

1. You CANNOT add new zones
2. You CANNOT remove any zones
3. You can ONLY adjust vertex coordinates to SHRINK zones inward

## IMAGE INFO
- Dimensions: ${cropWidth} x ${cropHeight} pixels

## COVERAGE POLYGON (green dashed boundary - zones must be INSIDE this)
${JSON.stringify(coveragePolygon)}

## ZONES TO FIX (${zones.length} zones)
${JSON.stringify(zoneDescriptions, null, 2)}

## ALGORITHM - READ CAREFULLY

For each zone that extends outside coverage:

### Step 1: Find the zone's INTERIOR ANCHOR POINT
- Calculate the CENTROID (average X, average Y) of ALL the zone's vertices
- This is your anchor point to pull vertices toward

### Step 2: For each vertex OUTSIDE coverage
- Draw an imaginary line from that vertex TO the centroid
- Move the vertex ALONG that line toward the centroid
- Stop when the vertex is safely INSIDE coverage (not on the boundary, but INSIDE)

### Step 3: Verify edges don't cross coverage boundary
- After moving vertices, check if any EDGE would still cross outside
- If so, move both endpoints of that edge further toward the centroid

## WRONG vs RIGHT

WRONG approach (what you must NOT do):
- Moving vertex to nearest point on coverage BOUNDARY
- This creates weird shapes that hug the coverage edge

RIGHT approach (what you MUST do):
- Move vertex TOWARD the polygon's own centroid
- The polygon SHRINKS inward, maintaining its general shape
- Result: a smaller version of the same polygon, fully inside coverage

## EXAMPLE

Zone has vertices: A(100,50), B(200,50), C(200,150), D(100,150)
Coverage boundary is at Y=100, so vertices A and B are OUTSIDE (Y=50 < 100)

Centroid = ((100+200+200+100)/4, (50+50+150+150)/4) = (150, 100)

For vertex A(100,50) - OUTSIDE:
- Direction to centroid: toward (150, 100)
- Move A along that line until inside coverage
- New A might be approximately (120, 105)

For vertex B(200,50) - OUTSIDE:
- Direction to centroid: toward (150, 100)
- Move B along that line until inside coverage
- New B might be approximately (180, 105)

Result: Polygon shrinks inward, A and B moved toward center, shape preserved

## OUTPUT FORMAT (JSON only)

{
  "adjustments_made": "Shrunk zones 1,3 toward their centroids to fit inside coverage",
  "blocked_areas": [
    {
      "zone_number": 1,
      "name": "Same name",
      "reason": "same reason",
      "vertices": [{"x": N, "y": N}, ...],
      "was_adjusted": true,
      "adjustment_note": "Moved vertices 1,2 toward centroid (X,Y) to fit inside coverage"
    }
  ]
}

Return ALL ${zones.length} zones. Set was_adjusted: false for zones already inside coverage.`
}

/**
 * Response from containment pass
 */
interface ContainmentResponse {
  adjustments_made: string
  blocked_areas: Array<{
    zone_number: number
    name: string
    reason: string
    vertices: Array<{ x: number; y: number }>
    was_adjusted: boolean
    adjustment_note?: string
  }>
}

/**
 * Parse containment response
 */
function parseContainmentResponse(
  responseText: string,
  expectedZoneCount: number,
  cropWidth: number,
  cropHeight: number
): { zones: BlockedAreaResult[]; summary: string } {
  // Extract JSON
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  let jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  if (!jsonMatch) {
    const firstBrace = responseText.indexOf('{')
    const lastBrace = responseText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = responseText.slice(firstBrace, lastBrace + 1)
    }
  }

  let parsed: ContainmentResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new BlockedAreaApiError('Failed to parse containment response', 'invalid_response')
  }

  if (!parsed.blocked_areas || parsed.blocked_areas.length !== expectedZoneCount) {
    console.warn(`[blockedAreaApi] Containment returned ${parsed.blocked_areas?.length ?? 0} zones, expected ${expectedZoneCount}`)
  }

  const validReasons: BlockedAreaReason[] = ['racking', 'conveyor', 'equipment', 'obstacle', 'other']

  const zones: BlockedAreaResult[] = (parsed.blocked_areas || []).map((raw) => {
    const vertices = raw.vertices.map((v) => ({
      x: Math.max(0, Math.min(cropWidth, Math.round(v.x))),
      y: Math.max(0, Math.min(cropHeight, Math.round(v.y))),
    }))

    const reason: BlockedAreaReason = validReasons.includes(raw.reason as BlockedAreaReason)
      ? (raw.reason as BlockedAreaReason)
      : 'other'

    return {
      name: raw.name,
      reason,
      vertices,
      confidence: 0.9, // High confidence after containment
    }
  })

  return {
    zones,
    summary: parsed.adjustments_made || 'Containment pass complete',
  }
}

/**
 * Perform final containment pass - adjust vertices to be inside coverage
 */
export async function performContainmentPass(
  cropDataUrl: string,
  cropWidth: number,
  cropHeight: number,
  localCoveragePolygon: Point[],
  zones: BlockedAreaResult[],
  apiKey: string,
  signal?: AbortSignal
): Promise<{ zones: BlockedAreaResult[]; summary: string; rawResponse: string }> {
  if (zones.length === 0) {
    return { zones: [], summary: 'No zones to contain', rawResponse: '' }
  }

  // Render zones on image for AI to see
  const annotatedImageUrl = await renderZonesOnImage(cropDataUrl, zones, localCoveragePolygon)

  const matches = annotatedImageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new BlockedAreaApiError('Failed to create annotated image for containment', 'invalid_response')
  }

  const mediaType = matches[1] as 'image/png'
  const base64Data = matches[2]

  const prompt = getContainmentPrompt(cropWidth, cropHeight, zones, localCoveragePolygon)

  console.log(`[blockedAreaApi] Containment pass: ${zones.length} zones`)

  const requestBody = {
    model: CLAUDE_SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Data },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new BlockedAreaApiError('Network error in containment pass', 'network', undefined, true)
  }

  if (!response.ok) {
    const errorType = getErrorType(response.status)
    throw new BlockedAreaApiError(
      `Containment pass failed with status ${response.status}`,
      errorType,
      response.status,
      response.status >= 500 || response.status === 429
    )
  }

  const data = await response.json()
  const rawResponse = extractTextContent(data)

  const result = parseContainmentResponse(rawResponse, zones.length, cropWidth, cropHeight)

  console.log(`[blockedAreaApi] Containment complete: ${result.summary}`)

  return { ...result, rawResponse }
}

/**
 * Raw verification response structure
 */
interface RawVerificationResponse {
  verification_summary?: string
  analysis?: string
  satisfied?: boolean
  zones_removed: number[]
  blocked_areas: Array<{
    original_number: number | null
    name: string
    reason: string
    vertices: Array<{ x: number; y: number }>
    confidence: number
    adjustment_note: string | null
  }>
}

/**
 * Result from verification/adjustment
 */
export interface VerificationResult {
  /** Summary of what was changed */
  summary: string
  /** Numbers of zones that were removed */
  zonesRemoved: number[]
  /** Adjusted/verified blocked areas */
  blockedAreas: BlockedAreaResult[]
  /** Whether any changes were made */
  hasChanges: boolean
  /** Whether the AI is satisfied with the results */
  satisfied: boolean
  /** Raw response for debugging */
  rawResponse: string
}

/**
 * Verify and adjust blocked areas using AI
 *
 * @param cropResult - The cropped image result with coverage polygon
 * @param existingZones - Currently detected blocked areas (in local crop coordinates)
 * @param apiKey - Anthropic API key
 * @param signal - Optional abort signal
 * @returns Verified and adjusted blocked areas
 */
export async function verifyAndAdjustBlockedAreas(
  cropResult: PolygonCropResult,
  existingZones: BlockedAreaResult[],
  apiKey: string,
  signal?: AbortSignal
): Promise<VerificationResult> {
  // If no zones detected, nothing to verify
  if (existingZones.length === 0) {
    console.log('[blockedAreaApi] No zones to verify, skipping verification pass')
    return {
      summary: 'No zones to verify',
      zonesRemoved: [],
      blockedAreas: [],
      hasChanges: false,
      satisfied: true,
      rawResponse: '',
    }
  }

  // Render zones onto the image
  console.log(`[blockedAreaApi] Rendering ${existingZones.length} zones onto image for verification...`)
  const annotatedImageUrl = await renderZonesOnImage(
    cropResult.dataUrl,
    existingZones,
    cropResult.localPolygon
  )

  // Extract base64 data
  const matches = annotatedImageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new BlockedAreaApiError('Failed to create annotated image', 'invalid_response')
  }

  const mediaType = matches[1] as 'image/png'
  const base64Data = matches[2]

  // Build prompt (use iterative prompt with iteration 1 of 1 for single-pass)
  const prompt = getIterativeVerificationPrompt(
    cropResult.width,
    cropResult.height,
    existingZones,
    cropResult.localPolygon,
    1,
    1
  )

  console.log('[blockedAreaApi] Sending verification request to AI...')

  const requestBody = {
    model: CLAUDE_SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new BlockedAreaApiError(
      'Network error: Unable to reach Claude API for verification',
      'network',
      undefined,
      true
    )
  }

  if (!response.ok) {
    const errorType = getErrorType(response.status)
    const retryable = response.status >= 500 || response.status === 429

    let message = `Verification API request failed with status ${response.status}`
    try {
      const errorBody = await response.json()
      if (errorBody.error?.message) {
        message = errorBody.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new BlockedAreaApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()
  const rawResponse = extractTextContent(data)

  // Parse verification response
  const verificationResult = parseVerificationResponse(
    rawResponse,
    cropResult.width,
    cropResult.height,
    existingZones
  )

  console.log(
    `[blockedAreaApi] Verification complete: ${verificationResult.summary}\n` +
    `  Zones removed: ${verificationResult.zonesRemoved.length}\n` +
    `  Final zones: ${verificationResult.blockedAreas.length}\n` +
    `  Has changes: ${verificationResult.hasChanges}`
  )

  return {
    ...verificationResult,
    rawResponse,
  }
}

/**
 * Parse the verification response from AI
 */
function parseVerificationResponse(
  responseText: string,
  cropWidth: number,
  cropHeight: number,
  originalZones: BlockedAreaResult[]
): Omit<VerificationResult, 'rawResponse'> {
  // Extract JSON
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  let jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  if (!jsonMatch) {
    const firstBrace = responseText.indexOf('{')
    const lastBrace = responseText.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = responseText.slice(firstBrace, lastBrace + 1)
    }
  }

  let parsed: RawVerificationResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new BlockedAreaApiError(
      'Failed to parse verification response from AI',
      'invalid_response'
    )
  }

  const validReasons: BlockedAreaReason[] = ['racking', 'conveyor', 'equipment', 'obstacle', 'other']

  // Parse blocked areas
  const blockedAreas: BlockedAreaResult[] = (parsed.blocked_areas || []).map((raw, index) => {
    if (!raw.name || !Array.isArray(raw.vertices) || raw.vertices.length < 3) {
      throw new BlockedAreaApiError(
        `Invalid blocked area at index ${index} in verification response`,
        'invalid_response'
      )
    }

    // Clamp vertices to bounds
    const vertices = raw.vertices.map((v) => ({
      x: Math.max(0, Math.min(cropWidth, Math.round(v.x))),
      y: Math.max(0, Math.min(cropHeight, Math.round(v.y))),
    }))

    const reason: BlockedAreaReason = validReasons.includes(raw.reason as BlockedAreaReason)
      ? (raw.reason as BlockedAreaReason)
      : 'other'

    return {
      name: raw.name,
      reason,
      vertices,
      confidence: typeof raw.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0.5,
    }
  })

  // Determine if changes were made
  const zonesRemoved = parsed.zones_removed || []
  const hasChanges =
    zonesRemoved.length > 0 ||
    blockedAreas.length !== originalZones.length ||
    blockedAreas.some((zone, i) => {
      const original = originalZones[i]
      if (!original) return true
      // Check if vertices changed significantly
      if (zone.vertices.length !== original.vertices.length) return true
      return zone.vertices.some((v, j) => {
        const ov = original.vertices[j]
        if (!ov) return true
        return Math.abs(v.x - ov.x) > 5 || Math.abs(v.y - ov.y) > 5
      })
    })

  // Get satisfaction status
  const satisfied = parsed.satisfied === true

  return {
    summary: parsed.analysis || parsed.verification_summary || 'Verification complete',
    zonesRemoved,
    blockedAreas,
    hasChanges,
    satisfied,
  }
}

/**
 * Full blocked area detection with verification pass
 *
 * @param cropResult - The cropped image result
 * @param apiKey - Anthropic API key
 * @param signal - Optional abort signal
 * @param skipVerification - Skip verification pass (default: false)
 * @returns BlockedAreaAnalysisResponse with verified blocked areas
 */
export async function analyzeBlockedAreasWithVerification(
  cropResult: PolygonCropResult,
  apiKey: string,
  signal?: AbortSignal,
  skipVerification: boolean = false
): Promise<BlockedAreaAnalysisResponse & { verificationResult?: VerificationResult }> {
  // Step 1: Initial detection
  console.log('[blockedAreaApi] Step 1: Initial blocked area detection...')
  const initialResult = await analyzeBlockedAreasWithRetry(
    cropResult.dataUrl,
    apiKey,
    cropResult.width,
    cropResult.height,
    signal
  )

  console.log(`[blockedAreaApi] Initial detection found ${initialResult.blockedAreas.length} zones`)

  // Step 2: Verification pass (if not skipped and zones were found)
  if (skipVerification || initialResult.blockedAreas.length === 0) {
    return initialResult
  }

  console.log('[blockedAreaApi] Step 2: AI verification pass...')
  try {
    const verificationResult = await verifyAndAdjustBlockedAreas(
      cropResult,
      initialResult.blockedAreas,
      apiKey,
      signal
    )

    return {
      blockedAreas: verificationResult.blockedAreas,
      rawResponse: initialResult.rawResponse + '\n\n--- VERIFICATION ---\n\n' + verificationResult.rawResponse,
      verificationResult,
    }
  } catch (error) {
    // If verification fails, return initial results
    console.warn('[blockedAreaApi] Verification pass failed, using initial results:', error)
    return initialResult
  }
}

// =============================================================================
// Wide Buffer Verification (for zones outside coverage)
// =============================================================================

/**
 * Input for wide buffer verification
 * Uses full image coordinates for everything
 */
export interface WideBufferVerificationInput {
  /** Full floorplan image data URL */
  fullImageDataUrl: string
  /** Coverage polygon vertices in full image pixel coordinates */
  coveragePolygon: Point[]
  /** Detected blocked zones in full image pixel coordinates */
  detectedZones: BlockedAreaResult[]
  /** Buffer percentage around coverage polygon (default 0.5 = 50%) */
  bufferPercent?: number
}

/**
 * Result from wide buffer verification
 * Returns zones in full image coordinates
 */
export interface WideBufferVerificationResult extends VerificationResult {
  /** The crop offset used (for debugging) */
  cropOffset: Point
  /** The crop dimensions used (for debugging) */
  cropDimensions: { width: number; height: number }
}

// Note: Use getPolygonBounds from @/utils/geometry instead of local getPolygonBounds

/**
 * Transform points from full image to local crop coordinates
 */
function transformToLocalCoords(points: Point[], offset: Point): Point[] {
  return points.map(p => ({
    x: p.x - offset.x,
    y: p.y - offset.y,
  }))
}

/**
 * Transform points from local crop coordinates to full image
 */
function transformToFullImageCoords(points: Point[], offset: Point): Point[] {
  return points.map(p => ({
    x: p.x + offset.x,
    y: p.y + offset.y,
  }))
}

/**
 * Extended result with iteration info
 */
export interface IterativeVerificationResult extends WideBufferVerificationResult {
  /** Number of iterations completed */
  iterations: number
  /** Whether AI reached satisfaction */
  aiSatisfied: boolean
  /** Summary of all iterations */
  iterationSummaries: string[]
}

/**
 * Minimum number of verification passes to ensure thorough analysis
 */
const MIN_VERIFICATION_PASSES = 2

/**
 * Perform a single verification iteration
 */
async function performVerificationIteration(
  cropDataUrl: string,
  cropWidth: number,
  cropHeight: number,
  localCoveragePolygon: Point[],
  currentZones: BlockedAreaResult[],
  iterationNumber: number,
  maxIterations: number,
  apiKey: string,
  signal?: AbortSignal
): Promise<Omit<VerificationResult, 'rawResponse'> & { rawResponse: string }> {
  // Render zones onto the cropped image
  const annotatedImageUrl = await renderZonesOnImage(
    cropDataUrl,
    currentZones,
    localCoveragePolygon
  )

  // Extract base64 data
  const matches = annotatedImageUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new BlockedAreaApiError('Failed to create annotated image', 'invalid_response')
  }

  const mediaType = matches[1] as 'image/png'
  const base64Data = matches[2]

  // Build iterative prompt
  const prompt = getIterativeVerificationPrompt(
    cropWidth,
    cropHeight,
    currentZones,
    localCoveragePolygon,
    iterationNumber,
    maxIterations
  )

  console.log(`[blockedAreaApi] Iteration ${iterationNumber}/${maxIterations}: Sending to AI...`)

  const requestBody = {
    model: CLAUDE_SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new BlockedAreaApiError(
      'Network error: Unable to reach Claude API',
      'network',
      undefined,
      true
    )
  }

  if (!response.ok) {
    const errorType = getErrorType(response.status)
    const retryable = response.status >= 500 || response.status === 429

    let message = `API request failed with status ${response.status}`
    try {
      const errorBody = await response.json()
      if (errorBody.error?.message) {
        message = errorBody.error.message
      }
    } catch {
      // Ignore
    }

    throw new BlockedAreaApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()
  const rawResponse = extractTextContent(data)

  // Parse response
  const result = parseVerificationResponse(rawResponse, cropWidth, cropHeight, currentZones)

  return { ...result, rawResponse }
}

/**
 * Iteratively verify and adjust blocked areas using AI
 *
 * The AI can adjust zones up to maxIterations times until it's satisfied.
 * Each iteration, the AI sees the current zones rendered on the image and can:
 * - Adjust zone positions and shapes
 * - Remove false positive zones
 * - Add missing zones
 *
 * @param input - Full image, coverage polygon, and detected zones (all in full image coords)
 * @param apiKey - Anthropic API key
 * @param signal - Optional abort signal
 * @param maxIterations - Maximum number of iterations (default: 5)
 * @returns Verified zones in full image coordinates
 */
export async function verifyAndAdjustBlockedAreasWithBuffer(
  input: WideBufferVerificationInput,
  apiKey: string,
  signal?: AbortSignal,
  maxIterations: number = 5
): Promise<IterativeVerificationResult> {
  const { fullImageDataUrl, coveragePolygon, detectedZones, bufferPercent = 0.5 } = input

  // If no zones detected, still allow AI to add zones
  const hasInitialZones = detectedZones.length > 0

  console.log(`[blockedAreaApi] Starting iterative verification (max ${maxIterations} iterations)`)
  console.log(`[blockedAreaApi] Initial zones: ${detectedZones.length}`)

  // Calculate bounding box - use coverage polygon if no zones
  const coverageBbox = getPolygonBounds(coveragePolygon)
  let baseBbox = coverageBbox

  if (hasInitialZones) {
    // Include all zone vertices in the bounding box calculation
    const allZoneVertices = detectedZones.flatMap(z => z.vertices)
    const combinedVertices = [...coveragePolygon, ...allZoneVertices]
    const combinedBbox = getPolygonBounds(combinedVertices)

    baseBbox = {
      x: Math.min(coverageBbox.x, combinedBbox.x),
      y: Math.min(coverageBbox.y, combinedBbox.y),
      width: Math.max(coverageBbox.x + coverageBbox.width, combinedBbox.x + combinedBbox.width) - Math.min(coverageBbox.x, combinedBbox.x),
      height: Math.max(coverageBbox.y + coverageBbox.height, combinedBbox.y + combinedBbox.height) - Math.min(coverageBbox.y, combinedBbox.y),
    }
  }

  console.log(`[blockedAreaApi] Crop bounding box:`, {
    x: Math.round(baseBbox.x),
    y: Math.round(baseBbox.y),
    width: Math.round(baseBbox.width),
    height: Math.round(baseBbox.height),
    bufferPercent,
  })

  // Crop the full image with buffer
  const cropResult = await cropImageWithPadding(fullImageDataUrl, baseBbox, bufferPercent)

  console.log(`[blockedAreaApi] Created wide crop: ${cropResult.width}x${cropResult.height}`)

  // Transform coverage polygon and initial zones to local crop coordinates
  console.log(`[blockedAreaApi] Transforming to local coords with offset: (${cropResult.originalOffset.x}, ${cropResult.originalOffset.y})`)

  const localCoveragePolygon = transformToLocalCoords(coveragePolygon, cropResult.originalOffset)
  const coverageLocalXs = localCoveragePolygon.map(p => p.x)
  const coverageLocalYs = localCoveragePolygon.map(p => p.y)
  console.log(
    `[blockedAreaApi] Coverage polygon in local coords:\n` +
    `  X range: ${Math.round(Math.min(...coverageLocalXs))}-${Math.round(Math.max(...coverageLocalXs))}\n` +
    `  Y range: ${Math.round(Math.min(...coverageLocalYs))}-${Math.round(Math.max(...coverageLocalYs))}`
  )

  let currentLocalZones: BlockedAreaResult[] = detectedZones.map((zone, idx) => {
    const localVerts = transformToLocalCoords(zone.vertices, cropResult.originalOffset)

    // Log each zone's transformation
    const origXs = zone.vertices.map(v => v.x)
    const origYs = zone.vertices.map(v => v.y)
    const localXs = localVerts.map(v => v.x)
    const localYs = localVerts.map(v => v.y)

    console.log(
      `[blockedAreaApi] Initial zone ${idx + 1} "${zone.name}" to local:\n` +
      `  Full image X: ${Math.min(...origXs)}-${Math.max(...origXs)}\n` +
      `  Full image Y: ${Math.min(...origYs)}-${Math.max(...origYs)}\n` +
      `  Local X: ${Math.round(Math.min(...localXs))}-${Math.round(Math.max(...localXs))}\n` +
      `  Local Y: ${Math.round(Math.min(...localYs))}-${Math.round(Math.max(...localYs))}`
    )

    return {
      ...zone,
      vertices: localVerts,
    }
  })

  // Iteration tracking
  let iterations = 0
  let aiSatisfied = false
  const iterationSummaries: string[] = []
  let allRawResponses = ''
  let totalZonesRemoved: number[] = []

  // Iterative verification loop
  while (iterations < maxIterations && !aiSatisfied) {
    iterations++

    if (signal?.aborted) {
      throw new Error('AbortError')
    }

    console.log(`\n[blockedAreaApi] === ITERATION ${iterations}/${maxIterations} ===`)
    console.log(`[blockedAreaApi] Current zones: ${currentLocalZones.length}`)

    try {
      const result = await performVerificationIteration(
        cropResult.dataUrl,
        cropResult.width,
        cropResult.height,
        localCoveragePolygon,
        currentLocalZones,
        iterations,
        maxIterations,
        apiKey,
        signal
      )

      // Track results
      allRawResponses += `\n\n--- ITERATION ${iterations} ---\n${result.rawResponse}`
      iterationSummaries.push(`Iteration ${iterations}: ${result.summary}`)
      totalZonesRemoved = [...totalZonesRemoved, ...result.zonesRemoved]

      // Update zones for next iteration
      currentLocalZones = result.blockedAreas

      console.log(`[blockedAreaApi] Iteration ${iterations} complete:`)
      console.log(`  Summary: ${result.summary}`)
      console.log(`  Zones: ${result.blockedAreas.length}`)
      console.log(`  Has changes: ${result.hasChanges}`)
      console.log(`  AI satisfied: ${result.satisfied}`)

      // Enforce minimum passes before allowing satisfaction
      if (iterations < MIN_VERIFICATION_PASSES) {
        if (result.satisfied) {
          console.log(`[blockedAreaApi] AI satisfied on iteration ${iterations}, but forcing minimum ${MIN_VERIFICATION_PASSES} passes`)
        }
        aiSatisfied = false
      } else {
        // After minimum passes, respect AI satisfaction
        aiSatisfied = result.satisfied

        // If no changes were made and not explicitly satisfied, assume satisfied (only after min passes)
        if (!result.hasChanges && !result.satisfied) {
          console.log(`[blockedAreaApi] No changes made after min passes, treating as satisfied`)
          aiSatisfied = true
        }
      }

    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')) {
        throw error
      }
      // On error, log and continue with current zones
      console.error(`[blockedAreaApi] Iteration ${iterations} failed:`, error)
      iterationSummaries.push(`Iteration ${iterations}: FAILED - ${error instanceof Error ? error.message : 'Unknown error'}`)

      // Break out of loop on error
      break
    }
  }

  // =========================================================================
  // FINAL CONTAINMENT PASS (PROGRAMMATIC)
  // Ensures all zone vertices are inside coverage polygon
  // Uses geometric shrinking toward centroid - no AI involved
  // =========================================================================
  if (currentLocalZones.length > 0) {
    console.log(`\n[blockedAreaApi] === PROGRAMMATIC CONTAINMENT PASS ===`)
    console.log(`[blockedAreaApi] Constraining ${currentLocalZones.length} zones to coverage polygon`)

    const containmentResult = applyContainmentToZones(currentLocalZones, localCoveragePolygon)

    currentLocalZones = containmentResult.zones
    iterationSummaries.push(
      `Containment: ${containmentResult.zones.length} zones kept, ` +
      `${containmentResult.removed} removed (outside), ${containmentResult.adjusted} adjusted`
    )

    console.log(
      `[blockedAreaApi] Containment complete: ` +
      `${containmentResult.zones.length} kept, ${containmentResult.removed} removed, ${containmentResult.adjusted} adjusted`
    )
  }

  // Transform final zones back to full image coordinates
  console.log(`\n[blockedAreaApi] Transforming ${currentLocalZones.length} zones from local to full image coords`)
  console.log(`[blockedAreaApi] Crop offset: (${cropResult.originalOffset.x}, ${cropResult.originalOffset.y})`)

  const fullImageZones: BlockedAreaResult[] = currentLocalZones.map((zone, idx) => {
    const localVertices = zone.vertices
    const fullVertices = transformToFullImageCoords(localVertices, cropResult.originalOffset)

    // Log coordinate transformation for debugging
    const localXs = localVertices.map(v => v.x)
    const localYs = localVertices.map(v => v.y)
    const fullXs = fullVertices.map(v => v.x)
    const fullYs = fullVertices.map(v => v.y)

    console.log(
      `[blockedAreaApi] Zone ${idx + 1} "${zone.name}" transform:\n` +
      `  Local X range: ${Math.min(...localXs)}-${Math.max(...localXs)}\n` +
      `  Local Y range: ${Math.min(...localYs)}-${Math.max(...localYs)}\n` +
      `  Full X range: ${Math.min(...fullXs)}-${Math.max(...fullXs)} (+${cropResult.originalOffset.x})\n` +
      `  Full Y range: ${Math.min(...fullYs)}-${Math.max(...fullYs)} (+${cropResult.originalOffset.y})`
    )

    return {
      ...zone,
      vertices: fullVertices,
    }
  })

  const finalSummary = aiSatisfied
    ? `AI satisfied after ${iterations} iteration(s) + containment. Final: ${fullImageZones.length} zones.`
    : `Reached max iterations (${maxIterations}) + containment. Final: ${fullImageZones.length} zones.`

  console.log(`\n[blockedAreaApi] ${finalSummary}`)

  return {
    summary: finalSummary,
    zonesRemoved: totalZonesRemoved,
    blockedAreas: fullImageZones,
    hasChanges: detectedZones.length !== fullImageZones.length || iterations > 1,
    satisfied: aiSatisfied,
    rawResponse: allRawResponses,
    cropOffset: cropResult.originalOffset,
    cropDimensions: { width: cropResult.width, height: cropResult.height },
    iterations,
    aiSatisfied,
    iterationSummaries,
  }
}
