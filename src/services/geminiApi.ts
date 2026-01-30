import type { CoarseZone, CoarseZoneType, BoundingBox, Point } from '@/types/zone'
import { COARSE_ZONE_TYPES } from '@/types/zone'
import { calculateBoundingBox } from '@/services/coordinateTransform'
import { pointInPolygon, getCentroid } from '@/utils/geometry'
import { useSettingsStore } from '@/store/useSettingsStore'

// =============================================================================
// Zone-Centric Containment Helpers
// =============================================================================

/**
 * Move a point toward a target by a fraction (0-1)
 */
function movePointToward(point: Point, target: Point, fraction: number): Point {
  return {
    x: point.x + (target.x - point.x) * fraction,
    y: point.y + (target.y - point.y) * fraction,
  }
}

/**
 * Constrain a zone's vertices to be inside a coverage polygon
 * Uses the zone's OWN interior vertices as the anchor point (not coverage centroid)
 *
 * This is the correct algorithm that maintains zone shape integrity:
 * 1. Find which vertices of the zone are already inside coverage
 * 2. Calculate centroid of those inside vertices (anchor point)
 * 3. Move outside vertices toward anchor using binary search
 *
 * @param zoneVertices - The zone's polygon vertices
 * @param coveragePolygon - The coverage boundary polygon
 * @param zoneName - Zone name for logging
 * @returns Adjusted vertices or null if zone is entirely outside coverage
 */
function constrainZoneVerticesToCoverage(
  zoneVertices: Point[],
  coveragePolygon: Point[],
  zoneName: string
): Point[] | null {
  if (zoneVertices.length < 3 || coveragePolygon.length < 3) {
    return null
  }

  // Find which vertices are inside coverage
  const insideFlags = zoneVertices.map(v => pointInPolygon(v, coveragePolygon))
  const insideCount = insideFlags.filter(Boolean).length

  // If all vertices are already inside, return as-is
  if (insideCount === zoneVertices.length) {
    return zoneVertices
  }

  // If NO vertices are inside, the zone is entirely outside - remove it
  if (insideCount === 0) {
    console.warn(`[Gemini] Zone "${zoneName}" entirely outside coverage (0/${zoneVertices.length} inside) - removing`)
    return null
  }

  console.log(`[Gemini] Zone "${zoneName}": ${insideCount}/${zoneVertices.length} vertices inside, adjusting others`)

  // Calculate centroid of vertices that ARE inside coverage (this is the anchor)
  const insideVertices = zoneVertices.filter((_, i) => insideFlags[i])
  const anchorPoint = getCentroid(insideVertices)

  console.log(`[Gemini] Zone "${zoneName}" anchor (centroid of inside vertices): (${Math.round(anchorPoint.x)}, ${Math.round(anchorPoint.y)})`)

  // Move outside vertices toward the anchor point until they're inside
  const adjustedVertices: Point[] = zoneVertices.map((vertex, i) => {
    if (insideFlags[i]) {
      return vertex // Already inside, keep it
    }

    // Binary search to find the point along the line from vertex to anchor that's just inside coverage
    let lo = 0
    let hi = 1
    let bestPoint = anchorPoint // Fallback to anchor if all else fails

    for (let iter = 0; iter < 20; iter++) {
      const mid = (lo + hi) / 2
      const testPoint = movePointToward(vertex, anchorPoint, mid)

      if (pointInPolygon(testPoint, coveragePolygon)) {
        bestPoint = testPoint
        hi = mid // Try to find a point closer to the original
      } else {
        lo = mid // Need to move further toward anchor
      }
    }

    // Move 10% more toward anchor to ensure we're safely INSIDE (not on edge)
    let safePoint = movePointToward(bestPoint, anchorPoint, 0.10)

    // VERIFICATION: Ensure the safe point is actually inside coverage
    // If not, keep moving toward anchor until it is
    let verifyAttempts = 0
    while (!pointInPolygon(safePoint, coveragePolygon) && verifyAttempts < 10) {
      verifyAttempts++
      // Move 20% closer to anchor each attempt
      safePoint = movePointToward(safePoint, anchorPoint, 0.20)
    }

    // Final fallback: if still outside, just use the anchor point (guaranteed inside)
    if (!pointInPolygon(safePoint, coveragePolygon)) {
      console.warn(
        `[Gemini] Zone "${zoneName}" vertex ${i}: Could not find safe point, using anchor`
      )
      safePoint = anchorPoint
    }

    const distance = Math.sqrt(
      Math.pow(safePoint.x - vertex.x, 2) + Math.pow(safePoint.y - vertex.y, 2)
    )

    console.log(
      `[Gemini] Zone "${zoneName}" vertex ${i}: (${Math.round(vertex.x)}, ${Math.round(vertex.y)}) -> ` +
      `(${Math.round(safePoint.x)}, ${Math.round(safePoint.y)}) [moved ${Math.round(distance)}px toward anchor]` +
      (verifyAttempts > 0 ? ` [${verifyAttempts} extra moves for safety]` : '')
    )

    return {
      x: Math.round(safePoint.x),
      y: Math.round(safePoint.y),
    }
  })

  // Final verification: ensure ALL adjusted vertices are inside coverage
  const allInside = adjustedVertices.every(v => pointInPolygon(v, coveragePolygon))
  if (!allInside) {
    console.warn(`[Gemini] Zone "${zoneName}": Some vertices still outside after adjustment - this shouldn't happen`)
  } else {
    console.log(`[Gemini] Zone "${zoneName}": ✓ All ${adjustedVertices.length} vertices verified inside coverage`)
  }

  return adjustedVertices
}

// Gemini model options
// Standard: gemini-2.5-pro - stable, good quality
// Latest: gemini-3-pro-preview - newest preview model
const GEMINI_MODEL_STANDARD = 'gemini-2.5-pro'
const GEMINI_MODEL_LATEST = 'gemini-3-pro-preview'
// Use Gemini 3 Flash Preview for 2D coverage blocked area detection
const GEMINI_COVERAGE_MODEL = 'gemini-3-flash-preview'
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Get the Gemini model to use based on settings
 */
export function getGeminiModel(useLatest: boolean): string {
  return useLatest ? GEMINI_MODEL_LATEST : GEMINI_MODEL_STANDARD
}
// Gemini 2.5 Pro is a "thinking" model that uses tokens for reasoning
// Need high token limit to allow for thinking + actual JSON output
const MAX_TOKENS = 65536
const MAX_INLINE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB for inline data

/**
 * API error types
 */
export type ApiErrorType =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'invalid_response'
  | 'unknown'

/**
 * API error
 */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly type: ApiErrorType,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'GeminiApiError'
  }
}

/**
 * Coarse zone detection result
 */
export interface CoarseZoneDetectionResult {
  zones: CoarseZone[]
  rawResponse: string
}

/**
 * System instruction for Gemini to enforce JSON output
 */
const SYSTEM_INSTRUCTION = `You are a computer vision system specialized in analyzing warehouse floorplan images. You MUST analyze the provided image and output JSON with pixel coordinates for detected zones. You have full capability to:
1. See and analyze the uploaded image
2. Identify visual elements like lines, shapes, and regions
3. Estimate pixel coordinates for zone boundaries
4. Output structured JSON data

CRITICAL: You MUST provide actual numeric pixel coordinates based on your visual analysis. Do NOT refuse or claim you cannot analyze images. Do NOT provide general instructions. Your ONLY output should be valid JSON with the zones object containing specific coordinates. No markdown code blocks.`

/**
 * Generate the zone detection prompt with image dimensions
 */
function getZoneDetectionPrompt(imageWidth: number, imageHeight: number): string {
  return `ANALYZE THIS FLOORPLAN IMAGE AND OUTPUT JSON WITH ZONE COORDINATES.

You are an expert at analyzing warehouse floorplans. Your task is to PRECISELY TRACE zone boundaries in this image.

Image dimensions: ${imageWidth} x ${imageHeight} pixels. All coordinates must be within this range.

## CRITICAL INSTRUCTION: TRACE THE ORANGE/BROWN BOUNDARY LINES

This floorplan has **ORANGE/BROWN colored lines** that mark the boundaries of travel lanes (corridors for forklifts and workers). Your PRIMARY task is to trace these orange boundary lines as accurately as possible.

### STEP 1: Identify ALL Travel Lanes (MOST IMPORTANT)

**What travel lanes look like:**
- They are the **CLEAR/WHITE corridors** bounded by **ORANGE or BROWN lines**
- They form an interconnected network through the warehouse
- They run along the perimeter (edges) of the building
- They cut horizontally and vertically through the warehouse, separating racking sections
- They are **NARROW** relative to racking areas (typically 20-60 pixels wide in this image)
- They have **COMPLEX SHAPES** - L-shaped, T-shaped, or following irregular paths

**How to trace travel lanes:**
- Follow the orange/brown boundary lines closely
- A single travel lane may need 10-30+ vertices to accurately trace its path
- Travel lanes that turn corners need multiple vertices at each turn
- The LEFT edge and RIGHT edge of each travel lane corridor should be traced

**In this specific floorplan, look for:**
- A perimeter travel lane running along the LEFT side, TOP, and portions of the RIGHT
- Horizontal cross-aisles cutting through the middle of the warehouse
- Vertical cross-aisles separating racking sections
- A large travel lane network in the BOTTOM portion connecting to docking areas

### STEP 2: Identify Racking Areas (AFTER travel lanes)

**What racking areas look like:**
- Dense parallel vertical OR horizontal black lines
- The lines represent shelf uprights viewed from above
- They fill the spaces BETWEEN travel lanes

**For each racking section:**
- Trace the boundary where the racking meets travel lanes
- If a travel lane separates two racking sections, they are SEPARATE zones
- Mark as type "racking_area" (aisles within racking are handled separately via programmatic detection)

### STEP 3: Identify Other Zones

- **docking_area**: Bottom edge with semi-circular turnaround areas
- **administrative**: Office rooms (upper right of this image)
- **open_floor**: Large open staging areas
- **parking_lot**: Areas with forklift icons

## OUTPUT REQUIREMENTS

You MUST identify:
- At least 4-6 travel_lane zones (the orange-bounded corridors)
- At least 2-4 racking_area zones (dense line sections)
- Any docking, administrative, or other zones visible

Each travel lane polygon should have MANY vertices (10-30+) to accurately trace the orange boundaries.

## JSON Output Format

\`\`\`json
{
  "zones": [
    {
      "name": "Perimeter Travel Lane - West Side",
      "type": "travel_lane",
      "confidence": 0.9,
      "needsSubdivision": false,
      "boundingBox": {"x": 50, "y": 80, "width": 60, "height": 700},
      "vertices": [
        {"x": 50, "y": 80},
        {"x": 110, "y": 80},
        {"x": 110, "y": 200},
        {"x": 100, "y": 200},
        {"x": 100, "y": 400},
        {"x": 110, "y": 400},
        {"x": 110, "y": 780},
        {"x": 50, "y": 780}
      ]
    },
    {
      "name": "Main Racking Section - Lower Left",
      "type": "racking_area",
      "confidence": 0.85,
      "needsSubdivision": false,
      "boundingBox": {"x": 110, "y": 200, "width": 400, "height": 500},
      "vertices": [
        {"x": 110, "y": 200},
        {"x": 510, "y": 200},
        {"x": 510, "y": 700},
        {"x": 110, "y": 700}
      ]
    }
  ]
}
\`\`\`

## ANTI-PATTERNS - What NOT to Do

❌ Do NOT create large rectangular zones that ignore the orange boundary lines
❌ Do NOT use only 4 vertices for travel lanes - they need MORE vertices to trace curves/turns
❌ Do NOT miss the narrow travel lane corridors - they ARE visible as orange-bounded white paths
❌ Do NOT create one or two giant zones covering most of the image
❌ Do NOT classify travel lanes as "open_floor" - they are specifically "travel_lane"

## Zone Types Available
${COARSE_ZONE_TYPES.join(', ')}

Remember: The orange/brown lines in this image are the KEY to accurate zone detection. TRACE THEM.`
}

/**
 * Raw zone from API response
 */
interface RawZone {
  name: string
  type: string
  confidence: number
  vertices: Array<{ x: number; y: number }>
  needsSubdivision?: boolean
  boundingBox?: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * Raw API response structure
 */
interface RawApiResponse {
  zones: RawZone[]
}

/**
 * Get error type from HTTP status
 */
function getErrorType(status: number): ApiErrorType {
  switch (status) {
    case 401:
    case 403:
      return 'auth'
    case 429:
      return 'rate_limit'
    default:
      return 'unknown'
  }
}

/**
 * Parse coarse zones from response text
 */
export function parseCoarseZonesFromResponse(responseText: string): CoarseZone[] {
  // Try to extract JSON from the response (handle both raw JSON and markdown-wrapped)
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  console.log('Gemini parsing JSON:', jsonStr.substring(0, 200) + '...')

  let parsed: RawApiResponse | RawZone[]
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    console.error('Gemini JSON parse error:', e)
    console.error('Raw response:', responseText.substring(0, 500))
    throw new GeminiApiError(
      'Failed to parse coarse zones from API response',
      'invalid_response'
    )
  }

  // Handle both { zones: [...] } and direct array formats
  let zones: RawZone[]
  if (Array.isArray(parsed)) {
    // Response is a direct array of zones
    zones = parsed
  } else if (Array.isArray(parsed.zones)) {
    // Response is { zones: [...] }
    zones = parsed.zones
  } else {
    throw new GeminiApiError(
      'Invalid response format: missing zones array',
      'invalid_response'
    )
  }

  return zones.map((rawZone, index) => {
    // Validate required fields
    if (!rawZone.name || !rawZone.type || !Array.isArray(rawZone.vertices)) {
      throw new GeminiApiError(
        `Invalid coarse zone at index ${index}: missing required fields`,
        'invalid_response'
      )
    }

    if (rawZone.vertices.length < 3) {
      throw new GeminiApiError(
        `Invalid coarse zone at index ${index}: polygon needs at least 3 vertices`,
        'invalid_response'
      )
    }

    const vertices = rawZone.vertices.map((v) => ({
      x: Math.round(v.x),
      y: Math.round(v.y),
    }))

    // Calculate boundingBox from vertices if not provided
    const boundingBox: BoundingBox = rawZone.boundingBox
      ? {
          x: Math.round(rawZone.boundingBox.x),
          y: Math.round(rawZone.boundingBox.y),
          width: Math.round(rawZone.boundingBox.width),
          height: Math.round(rawZone.boundingBox.height),
        }
      : calculateBoundingBox(vertices)

    // Default needsSubdivision to true for racking_area, false otherwise
    const needsSubdivision =
      typeof rawZone.needsSubdivision === 'boolean'
        ? rawZone.needsSubdivision
        : rawZone.type === 'racking_area'

    return {
      id: crypto.randomUUID(),
      name: rawZone.name,
      type: rawZone.type as CoarseZoneType,
      vertices,
      confidence:
        typeof rawZone.confidence === 'number'
          ? Math.max(0, Math.min(1, rawZone.confidence))
          : 0.5,
      needsSubdivision,
      boundingBox,
    }
  })
}

/**
 * Estimate the size of base64 data in bytes
 */
function estimateBase64Size(base64String: string): number {
  // Base64 encodes 3 bytes into 4 characters
  // So actual byte size is roughly (length * 3) / 4
  return Math.ceil((base64String.length * 3) / 4)
}

/**
 * Analyze a floorplan image using Gemini API
 * Uses inline_data for images under 20MB (recommended for most floorplans)
 *
 * @param imageDataUrl - The image data URL
 * @param apiKey - Gemini API key
 * @param imageWidth - Width of the image being analyzed
 * @param imageHeight - Height of the image being analyzed
 * @param signal - Optional abort signal
 */
export async function analyzeFloorplanCoarse(
  imageDataUrl: string,
  apiKey: string,
  imageWidth: number,
  imageHeight: number,
  signal?: AbortSignal
): Promise<CoarseZoneDetectionResult> {
  // Extract base64 data and media type
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    throw new GeminiApiError('Invalid image data URL format', 'invalid_response')
  }

  const mimeType = matches[1]
  const base64Data = matches[2]

  // Check if image is within inline data limits
  const estimatedSize = estimateBase64Size(base64Data)
  if (estimatedSize > MAX_INLINE_SIZE_BYTES) {
    throw new GeminiApiError(
      `Image too large for Gemini API (${Math.round(estimatedSize / 1024 / 1024)}MB). Maximum inline size is 20MB. Please enable image compression.`,
      'invalid_response'
    )
  }

  const model = getGeminiModel(useSettingsStore.getState().useLatestGeminiModel)
  console.log(`Gemini API: Using ${model} with inline data (${Math.round(estimatedSize / 1024)}KB)`)

  // Build the API URL for the selected model
  const apiUrl = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`

  const requestBody = {
    // System instruction to enforce JSON output behavior
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          {
            text: getZoneDetectionPrompt(imageWidth, imageHeight),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: MAX_TOKENS,
      // Request JSON response format
      responseMimeType: 'application/json',
    },
  }

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new GeminiApiError(
      'Network error: Unable to reach Gemini API',
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
      const errorData = await response.json()
      console.error('Gemini API error response:', errorData)
      if (errorData.error?.message) {
        message = errorData.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    console.error(`Gemini API error: ${message} (status: ${response.status})`)
    throw new GeminiApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  // Extract text from Gemini response
  let responseText = ''
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    responseText = data.candidates[0].content.parts[0].text
  } else if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new GeminiApiError(
      'Gemini blocked the response due to safety filters. Try a different image.',
      'invalid_response'
    )
  } else if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const usage = data.usageMetadata
    console.error('Gemini ran out of tokens:', {
      promptTokens: usage?.promptTokenCount,
      totalTokens: usage?.totalTokenCount,
      thoughtsTokens: usage?.thoughtsTokenCount
    })
    throw new GeminiApiError(
      'Gemini ran out of tokens before completing the response. The model may need more tokens for reasoning.',
      'invalid_response'
    )
  } else {
    console.error('Unexpected Gemini response structure:', JSON.stringify(data, null, 2))
    throw new GeminiApiError('Invalid API response format', 'invalid_response')
  }

  console.log('Gemini raw response:', responseText)

  const zones = parseCoarseZonesFromResponse(responseText)

  return {
    zones,
    rawResponse: responseText,
  }
}

/**
 * Analyze a floorplan image using Gemini API with preprocessing hints
 * This version uses enhanced prompts that incorporate computer vision preprocessing data
 *
 * @param imageDataUrl - The image data URL
 * @param apiKey - Gemini API key
 * @param imageWidth - Width of the image being analyzed
 * @param imageHeight - Height of the image being analyzed
 * @param hints - Preprocessing hints from Python backend
 * @param signal - Optional abort signal
 */
export async function analyzeFloorplanCoarseWithHints(
  imageDataUrl: string,
  apiKey: string,
  imageWidth: number,
  imageHeight: number,
  hints: import('./geminiPromptWithHints').PreprocessingHints,
  signal?: AbortSignal
): Promise<CoarseZoneDetectionResult> {
  // Import the enhanced prompt functions
  const { SYSTEM_INSTRUCTION_WITH_HINTS, getEnhancedZoneDetectionPrompt } = await import('./geminiPromptWithHints')

  // Extract base64 data and media type
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    throw new GeminiApiError('Invalid image data URL format', 'invalid_response')
  }

  const mimeType = matches[1]
  const base64Data = matches[2]

  // Check if image is within inline data limits
  const estimatedSize = estimateBase64Size(base64Data)
  if (estimatedSize > MAX_INLINE_SIZE_BYTES) {
    throw new GeminiApiError(
      `Image too large for Gemini API (${Math.round(estimatedSize / 1024 / 1024)}MB). Maximum inline size is 20MB. Please enable image compression.`,
      'invalid_response'
    )
  }

  // Get the model based on settings
  const useLatestModel = useSettingsStore.getState().useLatestGeminiModel
  const modelToUse = getGeminiModel(useLatestModel)

  console.log(`Gemini API (with hints): Using ${modelToUse} with inline data (${Math.round(estimatedSize / 1024)}KB)`)
  console.log(`Preprocessing hints: ${hints.detected_boundaries.contour_count} contours, ${hints.region_analysis.dense_regions.length} dense regions, ${hints.racking_analysis.detected_aisles.length} aisles`)

  // Build the API URL for the selected model
  const apiUrl = `${GEMINI_API_BASE}/${modelToUse}:generateContent?key=${apiKey}`

  // Generate the enhanced prompt with hints
  const enhancedPrompt = getEnhancedZoneDetectionPrompt(imageWidth, imageHeight, hints)

  const requestBody = {
    // Use enhanced system instruction
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION_WITH_HINTS }]
    },
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          {
            text: enhancedPrompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: MAX_TOKENS,
      // Request JSON response format
      responseMimeType: 'application/json',
    },
  }

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new GeminiApiError(
      'Network error: Unable to reach Gemini API',
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
      const errorData = await response.json()
      console.error('Gemini API error response:', errorData)
      if (errorData.error?.message) {
        message = errorData.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    console.error(`Gemini API error: ${message} (status: ${response.status})`)
    throw new GeminiApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  // Extract text from Gemini response
  let responseText = ''
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    responseText = data.candidates[0].content.parts[0].text
  } else if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new GeminiApiError(
      'Gemini blocked the response due to safety filters. Try a different image.',
      'invalid_response'
    )
  } else if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const usage = data.usageMetadata
    console.error('Gemini ran out of tokens:', {
      promptTokens: usage?.promptTokenCount,
      totalTokens: usage?.totalTokenCount,
      thoughtsTokens: usage?.thoughtsTokenCount
    })
    throw new GeminiApiError(
      'Gemini ran out of tokens before completing the response. The model may need more tokens for reasoning.',
      'invalid_response'
    )
  } else {
    console.error('Unexpected Gemini response structure:', JSON.stringify(data, null, 2))
    throw new GeminiApiError('Invalid API response format', 'invalid_response')
  }

  console.log('Gemini raw response (with hints):', responseText)

  const zones = parseCoarseZonesFromResponse(responseText)

  return {
    zones,
    rawResponse: responseText,
  }
}

// =============================================================================
// 2D Coverage Analysis - Blocked Area Detection
// =============================================================================

/**
 * Blocked area detected within a 2D coverage region
 */
export interface BlockedArea {
  /** Descriptive name */
  name: string
  /** Type is always 'blocked_area' */
  type: 'blocked_area'
  /** Reason for being blocked */
  reason: 'conveyor_belt' | 'obstacle' | 'boundary' | 'equipment' | 'other'
  /** Polygon vertices (in cropped image coordinates) */
  vertices: Point[]
  /** AI confidence score 0-1 */
  confidence: number
}

/**
 * Result of 2D coverage analysis
 */
export interface CoverageAnalysisResult {
  /** Detected blocked areas */
  blockedAreas: BlockedArea[]
  /** Raw response from AI */
  rawResponse: string
}

/**
 * Generate the prompt for 2D coverage blocked area detection
 *
 * This prompt identifies areas where forklifts CANNOT travel.
 * Forklifts can only travel through open whitespace - everything else is blocked.
 */
function getCoverageAnalysisPrompt(cropWidth: number, cropHeight: number): string {
  return `TASK: Identify NON-TRAVELABLE OBSTACLES in this warehouse floorplan image.

IMAGE SIZE: ${cropWidth}px wide × ${cropHeight}px tall
COORDINATE SYSTEM: (0,0) is TOP-LEFT corner. X increases rightward, Y increases downward.
ALL coordinates MUST be between 0 and ${cropWidth - 1} for X, and 0 and ${cropHeight - 1} for Y.

## WHAT YOU'RE LOOKING AT

This is a cropped portion of a warehouse floorplan seen from directly above.
The image may have TRANSPARENT areas (from polygon masking) - IGNORE transparent regions.
Focus ONLY on the visible warehouse floor area.

## IDENTIFY BLOCKED AREAS (where forklifts CANNOT drive)

Look for these PHYSICAL OBSTACLES that block forklift movement:

1. **RACKING/SHELVING** - Dense parallel black lines (most common)
   - These are shelf uprights viewed from above
   - Usually appear as tight rows of thin vertical or horizontal lines
   - Mark the ENTIRE racking block as ONE polygon

2. **WALLS & BARRIERS** - Solid lines dividing space
   - Even thin lines represent walls
   - Mark as narrow rectangular polygons

3. **EQUIPMENT** - Solid dark shapes
   - Machinery, workstations, conveyors
   - Mark the bounding shape

4. **PILLARS/COLUMNS** - Small dark squares or circles
   - Support structures

## DO NOT MARK AS BLOCKED

- WHITE/LIGHT OPEN FLOOR (this is where forklifts CAN drive)
- Transparent/masked out areas
- Faint markings that don't represent physical obstacles

## COORDINATE ACCURACY

CRITICAL: Your coordinates must PRECISELY match what you see:
- Measure from the LEFT edge of the image for X coordinates
- Measure from the TOP edge of the image for Y coordinates
- If a racking block starts at roughly 1/4 of the image width, X would be ~${Math.round(cropWidth / 4)}
- If it's at the vertical middle, Y would be ~${Math.round(cropHeight / 2)}

## OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no explanation):

{
  "blocked_areas": [
    {
      "name": "Racking Section 1",
      "type": "blocked_area",
      "reason": "racking",
      "vertices": [
        {"x": 100, "y": 50},
        {"x": 400, "y": 50},
        {"x": 400, "y": 300},
        {"x": 100, "y": 300}
      ],
      "confidence": 0.9
    }
  ]
}

Reason values: "racking", "obstacle", "conveyor_belt", "equipment", "other"

If the visible area is ENTIRELY clear open floor with no obstacles, return:
{"blocked_areas": []}

NOW analyze the image and return the JSON.`
}

/**
 * Raw blocked area from API response
 */
interface RawBlockedArea {
  name: string
  type: string
  reason: string
  vertices: Array<{ x: number; y: number }>
  confidence: number
}

/**
 * Options for parsing blocked areas
 */
export interface ParseBlockedAreasOptions {
  /** Width of the cropped image (for fallback rectangular bounds check) */
  cropWidth?: number
  /** Height of the cropped image (for fallback rectangular bounds check) */
  cropHeight?: number
  /** The coverage polygon in local crop coordinates (for accurate containment check) */
  coveragePolygon?: Point[]
}

/**
 * Parse blocked areas from Gemini's response
 *
 * Validates that blocked area vertices are within the coverage polygon.
 * Points outside the polygon are snapped to the closest point on the boundary.
 * Zones that are fully outside the polygon are skipped.
 */
export function parseBlockedAreasFromResponse(
  responseText: string,
  options: ParseBlockedAreasOptions = {}
): BlockedArea[] {
  const { cropWidth, cropHeight, coveragePolygon } = options

  console.log('[Gemini] Raw response text:', responseText.substring(0, 500))
  console.log(`[Gemini] Parsing with crop bounds: ${cropWidth ?? 'none'}x${cropHeight ?? 'none'}`)
  if (coveragePolygon) {
    console.log(`[Gemini] Coverage polygon has ${coveragePolygon.length} vertices for containment check`)
  }

  // Try to extract JSON from the response - handle markdown code blocks
  let jsonStr = responseText.trim()

  // Remove markdown code blocks if present
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1].trim()
  }

  // Try to find JSON object if response has extra text
  const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (jsonObjectMatch) {
    jsonStr = jsonObjectMatch[0]
  }

  let parsed: { blocked_areas?: RawBlockedArea[] } | RawBlockedArea[]
  try {
    parsed = JSON.parse(jsonStr)
  } catch (parseError) {
    console.error('[Gemini] JSON parse failed:', parseError)
    console.error('[Gemini] Attempted to parse:', jsonStr.substring(0, 300))
    throw new GeminiApiError(
      'Failed to parse blocked areas from API response',
      'invalid_response'
    )
  }

  // Handle different response formats
  let blockedAreas: RawBlockedArea[]

  if (Array.isArray(parsed)) {
    // Direct array of blocked areas
    blockedAreas = parsed
  } else if (parsed && Array.isArray(parsed.blocked_areas)) {
    // Standard format with blocked_areas key
    blockedAreas = parsed.blocked_areas
  } else if (parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0) {
    // Empty object means no blocked areas
    return []
  } else {
    console.error('[Gemini] Unexpected response structure:', parsed)
    // Try to be lenient - return empty if we can't parse
    return []
  }

  console.log(`[Gemini] Found ${blockedAreas.length} blocked areas in response`)

  const validBlockedAreas: BlockedArea[] = []

  for (let index = 0; index < blockedAreas.length; index++) {
    const raw = blockedAreas[index]!

    // Filter out invalid entries
    if (!raw || typeof raw !== 'object') {
      console.warn(`[Gemini] Skipping invalid entry at index ${index}`)
      continue
    }
    if (!Array.isArray(raw.vertices) || raw.vertices.length < 3) {
      console.warn(`[Gemini] Skipping entry ${index}: insufficient vertices`)
      continue
    }

    // Validate reason
    const validReasons = ['conveyor_belt', 'obstacle', 'boundary', 'equipment', 'racking', 'other']
    const reason = validReasons.includes(raw.reason) ? raw.reason : 'other'
    const name = raw.name || `Blocked Area ${index + 1}`

    // Log raw AI coordinates for debugging
    const rawXs = raw.vertices.map(v => Math.round(v.x))
    const rawYs = raw.vertices.map(v => Math.round(v.y))
    console.log(`[Gemini] Processing "${name}":`, {
      rawXRange: `${Math.min(...rawXs)} to ${Math.max(...rawXs)}`,
      rawYRange: `${Math.min(...rawYs)} to ${Math.max(...rawYs)}`,
      cropBounds: cropWidth && cropHeight ? `${cropWidth}x${cropHeight}` : 'none',
      hasCoveragePolygon: !!coveragePolygon,
      reason,
    })

    // First, get the raw vertices (just rounded, no containment yet)
    const rawVertices = raw.vertices.map((v) => ({
      x: Math.round(v.x),
      y: Math.round(v.y),
    }))

    // Apply zone-centric containment if we have a coverage polygon
    let finalVertices: Point[]

    if (coveragePolygon && coveragePolygon.length >= 3) {
      // Use zone-centric containment: move outside vertices toward the zone's own interior
      const constrainedVertices = constrainZoneVerticesToCoverage(
        rawVertices,
        coveragePolygon,
        name
      )

      if (constrainedVertices === null) {
        // Zone was entirely outside coverage - skip it
        console.warn(
          `[Gemini] ❌ Skipping "${name}": ALL ${raw.vertices.length} vertices were outside the coverage polygon`
        )
        continue
      }

      finalVertices = constrainedVertices
    } else {
      // Fallback: Clamp to rectangular image bounds if provided (no coverage polygon)
      finalVertices = rawVertices.map((v, vIdx) => {
        let x = v.x
        let y = v.y
        const originalX = x
        const originalY = y

        if (cropWidth !== undefined) {
          x = Math.max(0, Math.min(cropWidth - 1, x))
        }
        if (cropHeight !== undefined) {
          y = Math.max(0, Math.min(cropHeight - 1, y))
        }

        if (x !== originalX || y !== originalY) {
          console.warn(
            `[Gemini] ⚠️ Clamped vertex ${vIdx} of "${name}" to rect bounds: ` +
            `(${originalX}, ${originalY}) → (${x}, ${y})`
          )
        }

        return { x, y }
      })
    }

    console.log(`[Gemini] ✓ Accepted "${name}": ${finalVertices.length} vertices, reason: ${reason}`)

    validBlockedAreas.push({
      name,
      type: 'blocked_area' as const,
      reason: reason as BlockedArea['reason'],
      vertices: finalVertices,
      confidence:
        typeof raw.confidence === 'number'
          ? Math.max(0, Math.min(1, raw.confidence))
          : 0.5,
    })
  }

  console.log(`[Gemini] Accepted ${validBlockedAreas.length}/${blockedAreas.length} blocked areas after validation`)

  return validBlockedAreas
}

/**
 * Analyze a cropped 2D coverage region for blocked areas using Gemini
 *
 * @param croppedImageDataUrl - Cropped image data URL
 * @param apiKey - Gemini API key
 * @param cropWidth - Width of the cropped image
 * @param cropHeight - Height of the cropped image
 * @param signal - Optional abort signal
 * @param coveragePolygon - Optional coverage polygon in local crop coordinates (for accurate containment validation)
 * @returns CoverageAnalysisResult with blocked areas
 */
export async function analyze2DCoverage(
  croppedImageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal?: AbortSignal,
  coveragePolygon?: Point[]
): Promise<CoverageAnalysisResult> {
  // Extract base64 data and media type
  const matches = croppedImageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    throw new GeminiApiError('Invalid image data URL format', 'invalid_response')
  }

  const mimeType = matches[1]
  const base64Data = matches[2]

  // Build the API URL using Gemini 2.5 Pro for best blocked area detection accuracy
  const modelToUse = GEMINI_COVERAGE_MODEL
  console.log(`%c[Gemini 2D Coverage] Using model: ${modelToUse}`, 'background: #4285f4; color: white; font-weight: bold; padding: 2px 8px;')
  const apiUrl = `${GEMINI_API_BASE}/${modelToUse}:generateContent?key=${apiKey}`

  const requestBody = {
    systemInstruction: {
      parts: [{ text: 'You are a computer vision system that analyzes warehouse images to identify blocked or non-travelable areas. Output only valid JSON.' }]
    },
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          {
            text: getCoverageAnalysisPrompt(cropWidth, cropHeight),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 16384,
      responseMimeType: 'application/json',
    },
  }

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new GeminiApiError(
      'Network error: Unable to reach Gemini API',
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
      const errorData = await response.json()
      if (errorData.error?.message) {
        message = errorData.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new GeminiApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  // Extract text from Gemini response
  let responseText = ''
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    responseText = data.candidates[0].content.parts[0].text
  } else {
    throw new GeminiApiError('Invalid API response format', 'invalid_response')
  }

  // Parse blocked areas from response with polygon containment validation
  const blockedAreas = parseBlockedAreasFromResponse(responseText, {
    cropWidth,
    cropHeight,
    coveragePolygon,
  })

  console.log(`[Gemini 2D Coverage] Parsed ${blockedAreas.length} blocked areas`)

  return {
    blockedAreas,
    rawResponse: responseText,
  }
}

// =============================================================================
// Intensive Travel Lane Detection - Orange/Gray Boundary Analysis (Cropped Regions)
// =============================================================================

/**
 * Junction information from intensive travel lane detection
 */
export interface TravelLaneJunction {
  id: string
  type: 'straight' | 't_junction' | 'crossroad' | 'fork' | 'dead_end' | 'edge_connection'
  position: Point
  connectedLanes: string[]
}

/**
 * Network metadata from intensive travel lane detection
 */
export interface TravelLaneNetwork {
  isContiguous: boolean
  junctionCount: number
  totalLanes: number
  /** Estimated percentage of the visible area covered by travel lanes (0-100) */
  coveragePercent: number
  /** Whether verification pass confirmed the network */
  verificationPassed: boolean
}

/**
 * Extended zone with intensive detection metadata
 */
export interface IntensiveTravelLaneZone {
  name: string
  type: 'travel_lane'
  confidence: number
  vertices: Point[]
  connections: string[]
  junctionType: 'straight' | 't_junction' | 'crossroad' | 'fork' | 'dead_end' | 'edge_connection'
}

/**
 * Result of intensive travel lane detection for a single cropped region
 */
export interface IntensiveTravelLaneResult {
  network: TravelLaneNetwork
  zones: IntensiveTravelLaneZone[]
  junctions: TravelLaneJunction[]
  rawResponse: string
  /** Number of verification passes completed */
  verificationPasses: number
}

/**
 * System instruction for intensive travel lane detection on cropped regions
 */
const INTENSIVE_SYSTEM_INSTRUCTION = `You are an expert computer vision system specialized in detecting travel lanes (corridors) in warehouse floorplans. You are analyzing a CROPPED REGION of a larger floorplan.

CRITICAL UNDERSTANDING - What is a "Travel Lane":
- Travel lanes are the WHITE/CLEAR CORRIDOR SPACE where forklifts and workers walk
- Orange and gray lines are BOUNDARY MARKERS that define the EDGES of travel lanes
- A travel lane polygon should encompass the AREA BETWEEN two boundary lines
- DO NOT center your polygon ON the boundary line - that's wrong!
- The polygon should cover the TRAVELABLE WHITE SPACE between boundaries

Your task:
1. Find PAIRS of parallel orange/gray boundary lines that define corridor edges
2. Create polygons that fill the WHITE SPACE between these boundary pairs
3. Handle 90-degree turns by using extra vertices at corners (8+ vertices per corner)
4. Orange lines may transition to gray lines - BOTH are valid boundaries
5. Use 20-50+ vertices per lane, especially at curves and corners`

/**
 * Generate the intensive travel lane detection prompt for a cropped region
 */
function getIntensiveTravelLanePromptCropped(
  cropWidth: number,
  cropHeight: number,
  isVerificationPass: boolean = false,
  previousLaneCount?: number
): string {
  const verificationContext = isVerificationPass
    ? `
## VERIFICATION PASS

This is a VERIFICATION pass. In the previous analysis, ${previousLaneCount ?? 0} travel lanes were detected.
Your task is to RE-TRACE and VERIFY:
1. Are polygons covering the WHITE SPACE between boundaries (not centered on the lines)?
2. Are 90-degree corners properly traced with extra vertices?
3. Were any corridors MISSED?

If you find issues, provide CORRECTED lane polygons.
`
    : ''

  return `INTENSIVE TRAVEL LANE DETECTION - CROPPED REGION ANALYSIS
${verificationContext}
You are analyzing a CROPPED PORTION of a warehouse floorplan.
Your task is to detect ALL travel lane CORRIDORS - the travelable white space between boundary lines.

IMAGE DIMENSIONS: ${cropWidth}px wide × ${cropHeight}px tall
ALL coordinates MUST be within: X: 0-${cropWidth - 1}, Y: 0-${cropHeight - 1}

## CRITICAL: Understanding Travel Lanes

**CORRECT**: A travel lane is the WHITE/CLEAR FLOOR SPACE where forklifts travel.
**WRONG**: A travel lane is NOT centered on an orange line.

Think of it this way:
- Orange and gray lines are painted on the floor to mark the EDGES of corridors
- The TRAVELABLE AREA is the space BETWEEN two parallel boundary lines
- Your polygon should FILL the white space between the boundaries

Example: If you see two parallel orange lines 100px apart:
- The LEFT edge of your polygon traces the LEFT orange line
- The RIGHT edge of your polygon traces the RIGHT orange line
- The polygon WIDTH spans the ~100px corridor between them

## STEP 1: FIND BOUNDARY LINE PAIRS

Look for PAIRS of lines that define corridor edges:
- ORANGE/BROWN lines (hue ~15-45°, saturated warm colors)
- GRAY lines (low saturation, medium brightness)
- Lines may TRANSITION from orange to gray - this is normal, both are valid boundaries
- Boundary lines are typically 50-150 pixels apart (corridor width)

## STEP 2: HANDLE 90-DEGREE TURNS (IMPORTANT!)

When a corridor makes a right-angle turn:
1. The corner needs 6-10 extra vertices to trace the turn smoothly
2. Both the INNER corner and OUTER corner must be traced
3. Don't just use 2 vertices for a corner - use many more

Example for an L-shaped corridor turning right:
- Trace down the left edge
- At the corner: add 4-5 vertices following the OUTER curve
- Continue along the bottom edge
- At the far end, cross to the inner edge
- Trace back, at the inner corner: add 4-5 vertices
- The polygon should look like an "L" shape, not two rectangles

## STEP 3: CREATE CORRIDOR POLYGONS

For each corridor section:
1. Identify the TWO boundary lines (left and right edges)
2. Start at one end of the corridor
3. Trace along the LEFT boundary line (place vertices ON the line)
4. At corners, add extra vertices (6-10 per 90° turn)
5. Continue to the far end or where it connects to another corridor
6. Cross over to the RIGHT boundary
7. Trace back along the RIGHT boundary line
8. Close the polygon

VERTEX COUNT:
- Straight sections: 1 vertex every 50-100 pixels
- Curves: 1 vertex every 10-20 pixels
- 90° corners: 6-10 vertices per corner
- Total per lane: 20-60 vertices depending on complexity

## STEP 4: VERIFY COVERAGE

Your polygons should:
- FILL the white corridor space (not be thin lines)
- Have width matching the actual corridor (50-150px typically)
- Cover 15-40% of the visible image area
- NOT overlap with each other
- NOT extend beyond the orange/gray boundaries

## OUTPUT FORMAT

Return ONLY valid JSON:

{
  "travel_lane_network": {
    "is_contiguous": true,
    "junction_count": 3,
    "total_lanes": 4,
    "coverage_percent": 25,
    "verification_passed": true
  },
  "zones": [
    {
      "name": "Main Corridor - Horizontal",
      "type": "travel_lane",
      "confidence": 0.9,
      "vertices": [
        {"x": 10, "y": 100},
        {"x": 500, "y": 100},
        {"x": 500, "y": 180},
        {"x": 10, "y": 180}
      ],
      "connections": ["lane_2"],
      "junction_type": "edge_connection"
    }
  ],
  "junctions": [
    {
      "id": "j1",
      "type": "t_junction",
      "position": {"x": 150, "y": 140},
      "connected_lanes": ["lane_1", "lane_2"]
    }
  ]
}

Note in the example: vertices define a corridor that is ~80px wide (y: 100 to 180),
not a thin line along one boundary.

## JUNCTION TYPES

- "straight": Lane continues without branching
- "t_junction": 3-way intersection
- "crossroad": 4-way intersection
- "fork": Lane splits into 2
- "dead_end": Lane terminates (wall, racking)
- "edge_connection": Lane reaches image boundary

## COMMON MISTAKES TO AVOID

❌ Creating thin polygons that trace ONE boundary line (wrong - needs width!)
❌ Centering polygons ON the orange line (wrong - fill BETWEEN the lines!)
❌ Using only 4 vertices for an L-shaped corridor (need 10-20 for corners!)
❌ Missing transitions where orange becomes gray (both are boundaries!)
❌ Making polygons wider than the actual corridor

✓ Polygons should be as WIDE as the white corridor between boundaries
✓ 90° turns need many extra vertices
✓ Orange AND gray lines are both valid boundary markers

Now analyze this cropped region and return the JSON.`
}

/**
 * Raw intensive zone from API response
 */
interface RawIntensiveZone {
  name: string
  type: string
  confidence: number
  vertices: Array<{ x: number; y: number }>
  connections?: string[]
  junction_type?: string
}

/**
 * Raw intensive junction from API response
 */
interface RawIntensiveJunction {
  id: string
  type: string
  position: { x: number; y: number }
  connected_lanes: string[]
}

/**
 * Raw API response structure for intensive detection
 */
interface RawIntensiveApiResponse {
  travel_lane_network?: {
    is_contiguous?: boolean
    junction_count?: number
    total_lanes?: number
    coverage_percent?: number
    verification_passed?: boolean
  }
  zones?: RawIntensiveZone[]
  junctions?: RawIntensiveJunction[]
}

/**
 * Parse intensive travel lane zones from response text
 */
export function parseIntensiveTravelLanesFromResponse(
  responseText: string,
  imageWidth?: number,
  imageHeight?: number
): IntensiveTravelLaneResult {
  // Try to extract JSON from the response (handle both raw JSON and markdown-wrapped)
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  console.log('[Gemini Intensive] Parsing response:', jsonStr.substring(0, 300) + '...')

  let parsed: RawIntensiveApiResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    console.error('[Gemini Intensive] JSON parse error:', e)
    console.error('[Gemini Intensive] Raw response:', responseText.substring(0, 500))
    throw new GeminiApiError(
      'Failed to parse intensive travel lane response',
      'invalid_response'
    )
  }

  // Parse network metadata
  const network: TravelLaneNetwork = {
    isContiguous: parsed.travel_lane_network?.is_contiguous ?? false,
    junctionCount: parsed.travel_lane_network?.junction_count ?? 0,
    totalLanes: parsed.travel_lane_network?.total_lanes ?? 0,
    coveragePercent: parsed.travel_lane_network?.coverage_percent ?? 0,
    verificationPassed: parsed.travel_lane_network?.verification_passed ?? false,
  }

  // Parse zones
  const zones: IntensiveTravelLaneZone[] = []
  const rawZones = parsed.zones ?? []

  for (let i = 0; i < rawZones.length; i++) {
    const raw = rawZones[i]!

    // Validate required fields
    if (!raw.name || !Array.isArray(raw.vertices) || raw.vertices.length < 3) {
      console.warn(`[Gemini Intensive] Skipping zone ${i}: invalid structure`)
      continue
    }

    // Validate and clamp vertices to image bounds if provided
    const vertices = raw.vertices.map((v) => {
      let x = Math.round(v.x)
      let y = Math.round(v.y)

      if (imageWidth !== undefined) {
        x = Math.max(0, Math.min(imageWidth - 1, x))
      }
      if (imageHeight !== undefined) {
        y = Math.max(0, Math.min(imageHeight - 1, y))
      }

      return { x, y }
    })

    // Only accept travel_lane type in intensive mode
    if (raw.type !== 'travel_lane') {
      console.warn(`[Gemini Intensive] Zone "${raw.name}" has type "${raw.type}", converting to travel_lane`)
    }

    const validJunctionTypes = ['straight', 't_junction', 'crossroad', 'fork', 'dead_end', 'edge_connection']
    const junctionType = validJunctionTypes.includes(raw.junction_type ?? '')
      ? (raw.junction_type as IntensiveTravelLaneZone['junctionType'])
      : 'straight'

    zones.push({
      name: raw.name,
      type: 'travel_lane',
      confidence: typeof raw.confidence === 'number'
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0.8,
      vertices,
      connections: raw.connections ?? [],
      junctionType,
    })
  }

  // Parse junctions
  const junctions: TravelLaneJunction[] = []
  const rawJunctions = parsed.junctions ?? []

  for (const raw of rawJunctions) {
    if (!raw.id || !raw.position) {
      continue
    }

    let x = Math.round(raw.position.x)
    let y = Math.round(raw.position.y)

    if (imageWidth !== undefined) {
      x = Math.max(0, Math.min(imageWidth - 1, x))
    }
    if (imageHeight !== undefined) {
      y = Math.max(0, Math.min(imageHeight - 1, y))
    }

    const validTypes = ['straight', 't_junction', 'crossroad', 'fork', 'dead_end', 'edge_connection']
    const type = validTypes.includes(raw.type)
      ? (raw.type as TravelLaneJunction['type'])
      : 't_junction'

    junctions.push({
      id: raw.id,
      type,
      position: { x, y },
      connectedLanes: raw.connected_lanes ?? [],
    })
  }

  console.log(`[Gemini Intensive] Parsed: ${zones.length} lanes, ${junctions.length} junctions, contiguous: ${network.isContiguous}, coverage: ${network.coveragePercent}%`)

  return {
    network,
    zones,
    junctions,
    rawResponse: responseText,
    verificationPasses: 1, // Will be updated by caller if doing multiple passes
  }
}

/**
 * Perform a single intensive travel lane analysis pass on a cropped image
 */
async function performIntensiveAnalysisPass(
  imageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal: AbortSignal | undefined,
  isVerificationPass: boolean,
  previousLaneCount?: number
): Promise<IntensiveTravelLaneResult> {
  // Extract base64 data and media type
  const matches = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches || !matches[1] || !matches[2]) {
    throw new GeminiApiError('Invalid image data URL format', 'invalid_response')
  }

  const mimeType = matches[1]
  const base64Data = matches[2]

  // Get the model based on settings
  const useLatestModel = useSettingsStore.getState().useLatestGeminiModel
  const modelToUse = getGeminiModel(useLatestModel)

  const passType = isVerificationPass ? 'VERIFICATION' : 'INITIAL'
  console.log(`%c[Gemini INTENSIVE] ${passType} Pass - ${modelToUse}`, 'background: #ff6600; color: white; font-weight: bold; padding: 2px 8px;')

  const apiUrl = `${GEMINI_API_BASE}/${modelToUse}:generateContent?key=${apiKey}`

  const requestBody = {
    systemInstruction: {
      parts: [{ text: INTENSIVE_SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
          {
            text: getIntensiveTravelLanePromptCropped(cropWidth, cropHeight, isVerificationPass, previousLaneCount),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: MAX_TOKENS,
      responseMimeType: 'application/json',
    },
  }

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new GeminiApiError('Network error: Unable to reach Gemini API', 'network', undefined, true)
  }

  if (!response.ok) {
    const errorType = getErrorType(response.status)
    const retryable = response.status >= 500 || response.status === 429

    let message = `API request failed with status ${response.status}`
    try {
      const errorData = await response.json()
      if (errorData.error?.message) {
        message = errorData.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new GeminiApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  let responseText = ''
  if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
    responseText = data.candidates[0].content.parts[0].text
  } else if (data.candidates?.[0]?.finishReason === 'SAFETY') {
    throw new GeminiApiError('Gemini blocked the response due to safety filters.', 'invalid_response')
  } else if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new GeminiApiError('Gemini ran out of tokens during intensive analysis.', 'invalid_response')
  } else {
    throw new GeminiApiError('Invalid API response format', 'invalid_response')
  }

  return parseIntensiveTravelLanesFromResponse(responseText, cropWidth, cropHeight)
}

/**
 * Analyze a cropped 2D coverage region for travel lanes using intensive detection
 *
 * This mode performs deep analysis to precisely trace orange/gray boundary lines.
 * It performs:
 * 1. Initial analysis pass to detect travel lanes
 * 2. Verification pass if coverage is low (<10%) or verification failed
 *
 * @param croppedImageDataUrl - Cropped image data URL (2D coverage region)
 * @param apiKey - Gemini API key
 * @param cropWidth - Width of the cropped image
 * @param cropHeight - Height of the cropped image
 * @param signal - Optional abort signal
 * @param coveragePolygon - Optional coverage polygon in local crop coordinates (for validation)
 */
export async function analyzeFloorplanIntensiveTravelLanes(
  croppedImageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal?: AbortSignal,
  coveragePolygon?: Point[]
): Promise<IntensiveTravelLaneResult> {
  // Check if image is within inline data limits
  const matches = croppedImageDataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches?.[2]) {
    throw new GeminiApiError('Invalid image data URL format', 'invalid_response')
  }

  const estimatedSize = Math.ceil((matches[2].length * 3) / 4)
  if (estimatedSize > MAX_INLINE_SIZE_BYTES) {
    throw new GeminiApiError(
      `Image too large for Gemini API (${Math.round(estimatedSize / 1024 / 1024)}MB). Maximum inline size is 20MB.`,
      'invalid_response'
    )
  }

  console.log(`%c[Gemini INTENSIVE] Cropped Region Analysis - ${cropWidth}x${cropHeight}px`, 'background: #ff6600; color: white; font-weight: bold; padding: 4px 8px;')

  // PASS 1: Initial analysis
  console.log('[Gemini INTENSIVE] Starting PASS 1: Initial analysis...')
  let result = await performIntensiveAnalysisPass(
    croppedImageDataUrl,
    apiKey,
    cropWidth,
    cropHeight,
    signal,
    false // not verification
  )

  console.log(`[Gemini INTENSIVE] Pass 1 result: ${result.zones.length} lanes, coverage: ${result.network.coveragePercent}%, verified: ${result.network.verificationPassed}`)

  // Check if verification pass is needed
  const needsVerification =
    result.network.coveragePercent < 10 ||
    !result.network.verificationPassed ||
    result.zones.length === 0

  if (needsVerification && !signal?.aborted) {
    console.log('%c[Gemini INTENSIVE] Starting PASS 2: Verification...', 'background: #ff8800; color: white; padding: 2px 8px;')

    try {
      const verificationResult = await performIntensiveAnalysisPass(
        croppedImageDataUrl,
        apiKey,
        cropWidth,
        cropHeight,
        signal,
        true, // is verification pass
        result.zones.length
      )

      console.log(`[Gemini INTENSIVE] Pass 2 result: ${verificationResult.zones.length} lanes, coverage: ${verificationResult.network.coveragePercent}%`)

      // Use verification result if it found more lanes or has better coverage
      if (
        verificationResult.zones.length > result.zones.length ||
        verificationResult.network.coveragePercent > result.network.coveragePercent
      ) {
        console.log('[Gemini INTENSIVE] Using verification pass result (better coverage)')
        result = verificationResult
        result.verificationPasses = 2
      } else {
        console.log('[Gemini INTENSIVE] Keeping initial pass result')
        result.verificationPasses = 2
      }
    } catch (verifyError) {
      console.warn('[Gemini INTENSIVE] Verification pass failed, using initial result:', verifyError)
      result.verificationPasses = 1
    }
  }

  // NOTE: Polygon containment validation for travel lanes is DISABLED
  // The AI's travel lane detection should trace boundaries accurately without
  // needing post-processing clipping. Enabling this was causing issues with
  // polygons being incorrectly modified.
  //
  // TODO: Make this a toggle if needed in the future
  if (coveragePolygon && coveragePolygon.length >= 3) {
    console.log(`[Gemini INTENSIVE] Polygon validation DISABLED - keeping ${result.zones.length} zones as-is`)
  }

  // Log final result
  if (result.network.isContiguous && result.network.coveragePercent >= 10) {
    console.log(`%c[Gemini INTENSIVE] ✓ SUCCESS: ${result.zones.length} lanes, ${result.network.coveragePercent}% coverage`,
      'background: #00aa00; color: white; font-weight: bold; padding: 2px 8px;')
  } else {
    console.warn(`%c[Gemini INTENSIVE] ⚠️ LOW COVERAGE: ${result.zones.length} lanes, ${result.network.coveragePercent}% coverage`,
      'background: #ff8800; color: white; font-weight: bold; padding: 2px 8px;')
  }

  return result
}
