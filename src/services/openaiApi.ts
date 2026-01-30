import type { CoarseZone, CoarseZoneType, BoundingBox, Point } from '@/types/zone'
import { COARSE_ZONE_TYPES } from '@/types/zone'
import { calculateBoundingBox } from '@/services/coordinateTransform'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
// GPT-4o is OpenAI's most capable vision model
const OPENAI_MODEL = 'gpt-4o'
// GPT-4o-mini for faster, cheaper 2D coverage analysis
const OPENAI_MINI_MODEL = 'gpt-4o-mini'
const MAX_TOKENS = 8192

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
export class OpenAIApiError extends Error {
  constructor(
    message: string,
    public readonly type: ApiErrorType,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message)
    this.name = 'OpenAIApiError'
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

  console.log('Parsing JSON:', jsonStr.substring(0, 200) + '...')

  let parsed: RawApiResponse
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new OpenAIApiError(
      'Failed to parse coarse zones from API response',
      'invalid_response'
    )
  }

  if (!Array.isArray(parsed.zones)) {
    throw new OpenAIApiError(
      'Invalid response format: missing zones array',
      'invalid_response'
    )
  }

  return parsed.zones.map((rawZone, index) => {
    // Validate required fields
    if (!rawZone.name || !rawZone.type || !Array.isArray(rawZone.vertices)) {
      throw new OpenAIApiError(
        `Invalid coarse zone at index ${index}: missing required fields`,
        'invalid_response'
      )
    }

    if (rawZone.vertices.length < 3) {
      throw new OpenAIApiError(
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
 * Analyze a floorplan image using OpenAI API
 * @param imageDataUrl - The image data URL
 * @param apiKey - OpenAI API key
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
  const requestBody = {
    model: OPENAI_MODEL,
    max_tokens: MAX_TOKENS,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a computer vision system specialized in analyzing warehouse floorplan images. You MUST analyze the provided image and output JSON with pixel coordinates for detected zones. You have full capability to:
1. See and analyze the uploaded image
2. Identify visual elements like lines, shapes, and regions
3. Estimate pixel coordinates for zone boundaries
4. Output structured JSON data

CRITICAL: You MUST provide actual numeric pixel coordinates based on your visual analysis. Do NOT refuse or claim you cannot analyze images. Do NOT provide general instructions. Your ONLY output should be the JSON zones object with specific coordinates. Output ONLY valid JSON, no markdown code blocks.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: getZoneDetectionPrompt(imageWidth, imageHeight),
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new OpenAIApiError(
      'Network error: Unable to reach OpenAI API',
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
      console.error('OpenAI API error response:', errorData)
      if (errorData.error?.message) {
        message = errorData.error.message
      }
    } catch {
      // Ignore JSON parse errors
    }

    console.error(`OpenAI API error: ${message} (status: ${response.status})`)
    throw new OpenAIApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  // Extract text from OpenAI response
  let responseText = ''
  if (data.choices?.[0]?.message?.content) {
    responseText = data.choices[0].message.content
  } else {
    throw new OpenAIApiError('Invalid API response format', 'invalid_response')
  }

  console.log('OpenAI raw response:', responseText)

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
 */
function getCoverageAnalysisPrompt(cropWidth: number, cropHeight: number): string {
  return `You are analyzing a CROPPED region of a warehouse floorplan.
This region is a 2D coverage area where forklifts/robots may travel.

Image dimensions: ${cropWidth} x ${cropHeight} pixels. All coordinates must be within this range.

## YOUR TASK: Identify areas within this region that are NOT travelable.

### LOOK FOR:
- **Conveyor belts** (linear mechanical systems, often with rollers or belt textures)
- **Physical obstacles or barriers** (walls, pillars, fixed equipment)
- **Boundary lines** indicating restricted zones
- **Equipment or machinery** blocking paths
- Any area a forklift could NOT physically travel through

### IMPORTANT NOTES:
- Do NOT look for aisles or travel lanes (those come from TDOA data, not AI)
- Only identify BLOCKED areas, not travelable paths
- Return an empty array if the entire region is travelable
- Trace the blocked area boundaries accurately with multiple vertices

## OUTPUT FORMAT

Return a JSON object with this structure:

{
  "blocked_areas": [
    {
      "name": "Conveyor System 1",
      "type": "blocked_area",
      "reason": "conveyor_belt",
      "vertices": [{"x": 10, "y": 20}, {"x": 100, "y": 20}, {"x": 100, "y": 80}, {"x": 10, "y": 80}],
      "confidence": 0.85
    }
  ]
}

### Reason values:
- "conveyor_belt" - Conveyor or material handling systems
- "obstacle" - Fixed obstacles or barriers
- "boundary" - Marked boundary lines indicating restricted zones
- "equipment" - Machinery or equipment
- "other" - Other non-travelable features

If no blocked areas are detected, return:
{
  "blocked_areas": []
}`
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
 * Parse blocked areas from OpenAI's response
 */
export function parseBlockedAreasFromResponse(responseText: string): BlockedArea[] {
  // Try to extract JSON from the response
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = jsonMatch?.[1]?.trim() ?? responseText.trim()

  let parsed: { blocked_areas: RawBlockedArea[] }
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new OpenAIApiError(
      'Failed to parse blocked areas from API response',
      'invalid_response'
    )
  }

  if (!Array.isArray(parsed.blocked_areas)) {
    // If no blocked_areas key but empty object, treat as no blocked areas
    if (typeof parsed === 'object' && Object.keys(parsed).length === 0) {
      return []
    }
    throw new OpenAIApiError(
      'Invalid response format: missing blocked_areas array',
      'invalid_response'
    )
  }

  return parsed.blocked_areas.map((raw, index) => {
    // Validate required fields
    if (!raw.name || !Array.isArray(raw.vertices)) {
      throw new OpenAIApiError(
        `Invalid blocked area at index ${index}: missing required fields`,
        'invalid_response'
      )
    }

    if (raw.vertices.length < 3) {
      throw new OpenAIApiError(
        `Invalid blocked area at index ${index}: polygon needs at least 3 vertices`,
        'invalid_response'
      )
    }

    // Validate reason
    const validReasons = ['conveyor_belt', 'obstacle', 'boundary', 'equipment', 'other']
    const reason = validReasons.includes(raw.reason) ? raw.reason : 'other'

    return {
      name: raw.name,
      type: 'blocked_area' as const,
      reason: reason as BlockedArea['reason'],
      vertices: raw.vertices.map((v) => ({
        x: Math.round(v.x),
        y: Math.round(v.y),
      })),
      confidence:
        typeof raw.confidence === 'number'
          ? Math.max(0, Math.min(1, raw.confidence))
          : 0.5,
    }
  })
}

/**
 * Analyze a cropped 2D coverage region for blocked areas using OpenAI
 *
 * @param croppedImageDataUrl - Cropped image data URL
 * @param apiKey - OpenAI API key
 * @param cropWidth - Width of the cropped image
 * @param cropHeight - Height of the cropped image
 * @param signal - Optional abort signal
 * @returns CoverageAnalysisResult with blocked areas
 */
export async function analyze2DCoverage(
  croppedImageDataUrl: string,
  apiKey: string,
  cropWidth: number,
  cropHeight: number,
  signal?: AbortSignal
): Promise<CoverageAnalysisResult> {
  const requestBody = {
    model: OPENAI_MINI_MODEL, // Use mini for faster/cheaper analysis
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a computer vision system that analyzes warehouse images to identify blocked or non-travelable areas. Output only valid JSON.'
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: croppedImageDataUrl,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: getCoverageAnalysisPrompt(cropWidth, cropHeight),
          },
        ],
      },
    ],
  }

  let response: Response
  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }
    throw new OpenAIApiError(
      'Network error: Unable to reach OpenAI API',
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

    throw new OpenAIApiError(message, errorType, response.status, retryable)
  }

  const data = await response.json()

  // Extract text from OpenAI response
  let responseText = ''
  if (data.choices?.[0]?.message?.content) {
    responseText = data.choices[0].message.content
  } else {
    throw new OpenAIApiError('Invalid API response format', 'invalid_response')
  }

  // Parse blocked areas from response
  const blockedAreas = parseBlockedAreasFromResponse(responseText)

  return {
    blockedAreas,
    rawResponse: responseText,
  }
}
