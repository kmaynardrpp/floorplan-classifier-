/**
 * Enhanced Gemini prompts that incorporate preprocessing hints
 *
 * These prompts guide Gemini to use the computer vision preprocessing data
 * for more accurate zone detection.
 */

import { COARSE_ZONE_TYPES } from '@/types/zone'

/**
 * Preprocessing hints structure from Python backend
 */
export interface PreprocessingHints {
  image_dimensions: {
    width: number
    height: number
  }
  detected_boundaries: {
    description: string
    contour_count: number
    suggested_zone_polygons: Array<{
      id: number
      vertices: Array<{ x: number; y: number }>
      area: number
      suggestion: string
    }>
  }
  region_analysis: {
    description: string
    dense_regions: Array<{
      id: number
      bounding_box: { x: number; y: number; width: number; height: number }
      density_score: number
      area: number
      centroid: { x: number; y: number }
      suggested_type: string
      needs_subdivision: boolean
    }>
    sparse_regions: Array<{
      id: number
      bounding_box: { x: number; y: number; width: number; height: number }
      density_score: number
      area: number
      centroid: { x: number; y: number }
      suggested_type: string
      needs_subdivision: boolean
    }>
  }
  racking_analysis: {
    description: string
    racking_sections: Array<{
      id: number
      orientation: string
      bounding_box: { x: number; y: number; width: number; height: number }
      line_count: number
      average_line_spacing: number
      suggestion: string
    }>
    detected_aisles: Array<{
      id: number
      orientation: string
      width: number
      centerline: Array<{ x: number; y: number }>
      bounding_box: { x: number; y: number; width: number; height: number }
      suggestion: string
      confidence?: number
      detection_method?: string
      line_density?: {
        left_or_top: number
        right_or_bottom: number
      }
    }>
  }
  recommendations: string[]
}

/**
 * System instruction with preprocessing context
 */
export const SYSTEM_INSTRUCTION_WITH_HINTS = `You are a computer vision system specialized in analyzing warehouse floorplan images. You have been provided with PREPROCESSING HINTS from computer vision analysis that you MUST use to improve accuracy.

Your capabilities:
1. See and analyze the uploaded image
2. USE the preprocessing hints to identify zones more accurately
3. Trace zone boundaries using the detected contours and line clusters
4. Output structured JSON with pixel coordinates

CRITICAL RULES:
1. Use the preprocessing hints as your PRIMARY guide for zone detection
2. The preprocessing has already detected orange boundary lines - USE those contours
3. Dense regions are likely RACKING AREAS - mark them as needing subdivision
4. Sparse regions are likely TRAVEL LANES or OPEN FLOOR
5. Line clusters indicate RACKING ROW orientations
6. Detected aisles are paths BETWEEN racking rows

Your output MUST be valid JSON with zone coordinates. No markdown, no explanations.`

/**
 * Generate prompt with preprocessing hints
 */
export function getEnhancedZoneDetectionPrompt(
  imageWidth: number,
  imageHeight: number,
  hints: PreprocessingHints
): string {
  // Format hints for the prompt
  const boundaryHints = hints.detected_boundaries.suggested_zone_polygons
    .slice(0, 10) // Limit to top 10
    .map(
      (p) =>
        `  - Contour ${p.id}: ${p.vertices.length} vertices, area ${p.area}px² - ${p.suggestion}`
    )
    .join('\n')

  const denseRegionHints = hints.region_analysis.dense_regions
    .slice(0, 10)
    .map(
      (r) =>
        `  - Region ${r.id}: bbox(${r.bounding_box.x}, ${r.bounding_box.y}, ${r.bounding_box.width}x${r.bounding_box.height}), density=${r.density_score.toFixed(2)} → ${r.suggested_type}`
    )
    .join('\n')

  const sparseRegionHints = hints.region_analysis.sparse_regions
    .slice(0, 10)
    .map(
      (r) =>
        `  - Region ${r.id}: bbox(${r.bounding_box.x}, ${r.bounding_box.y}, ${r.bounding_box.width}x${r.bounding_box.height}), density=${r.density_score.toFixed(2)} → ${r.suggested_type}`
    )
    .join('\n')

  const rackingHints = hints.racking_analysis.racking_sections
    .slice(0, 10)
    .map(
      (r) =>
        `  - Section ${r.id}: ${r.orientation} orientation, ${r.line_count} lines, spacing=${r.average_line_spacing.toFixed(1)}px`
    )
    .join('\n')

  const aisleHints = hints.racking_analysis.detected_aisles
    .slice(0, 10)
    .map((a) => `  - Aisle ${a.id}: ${a.orientation}, width=${a.width.toFixed(1)}px`)
    .join('\n')

  return `ANALYZE THIS FLOORPLAN IMAGE USING THE PREPROCESSING HINTS BELOW.

## IMAGE DIMENSIONS
${imageWidth} x ${imageHeight} pixels. All coordinates must be within this range.

## PREPROCESSING HINTS (USE THESE!)

### Detected Boundary Contours (Orange Lines)
${boundaryHints || '  No significant contours detected'}

### Dense Regions (Likely Racking/Storage)
${denseRegionHints || '  No dense regions detected'}

### Sparse Regions (Likely Aisles/Travel Lanes)
${sparseRegionHints || '  No sparse regions detected'}

### Racking Line Clusters
${rackingHints || '  No line clusters detected'}

### Detected Aisles
${aisleHints || '  No aisles detected'}

### Recommendations
${hints.recommendations.map((r) => `- ${r}`).join('\n') || '- Use visual analysis'}

## YOUR TASK

1. **Use the boundary contours** as starting points for zone polygons
2. **Mark dense regions as racking_area** with needsSubdivision: true
3. **Mark sparse regions as travel_lane** or open_floor
4. **Trace polygon vertices carefully** - racking areas and travel lanes often have MANY vertices (10-50+)
5. **Use the detected aisle data** to inform subdivision needs

## OUTPUT FORMAT

\`\`\`json
{
  "zones": [
    {
      "name": "Descriptive Zone Name",
      "type": "zone_type",
      "confidence": 0.9,
      "needsSubdivision": false,
      "boundingBox": {"x": 0, "y": 0, "width": 100, "height": 100},
      "vertices": [
        {"x": 0, "y": 0},
        {"x": 100, "y": 0},
        {"x": 100, "y": 100},
        {"x": 0, "y": 100}
      ]
    }
  ]
}
\`\`\`

## ZONE TYPES
${COARSE_ZONE_TYPES.join(', ')}

## CRITICAL REMINDERS
- Travel lanes have COMPLEX shapes - use MANY vertices to trace the orange boundaries accurately
- Racking areas are DENSE with parallel lines - mark ALL of them with needsSubdivision: true
- Use the preprocessing hints - they are based on actual image analysis!
- Output ONLY valid JSON, no markdown code blocks in actual output`
}

/**
 * Generate sub-agent prompt for racking area analysis with hints
 */
export function getEnhancedSubAgentPrompt(
  regionWidth: number,
  regionHeight: number,
  rackingHints: PreprocessingHints['racking_analysis']
): string {
  const firstSection = rackingHints.racking_sections[0]
  const orientation = firstSection?.orientation ?? 'unknown'
  const spacing = firstSection?.average_line_spacing ?? 0

  // Format aisle hints with confidence and line-pair information
  const highConfidenceAisles = rackingHints.detected_aisles.filter(
    (a) => a.confidence && a.confidence >= 0.6
  )
  const linePairAisles = rackingHints.detected_aisles.filter(
    (a) => a.detection_method === 'line_pair'
  )

  const aisleInfo = rackingHints.detected_aisles
    .slice(0, 15)
    .map((a) => {
      let info = `  - ${a.orientation} aisle at width ${a.width.toFixed(1)}px`
      if (a.confidence) {
        info += ` (confidence: ${(a.confidence * 100).toFixed(0)}%)`
      }
      if (a.line_density) {
        info += ` [lines: L=${(a.line_density.left_or_top * 100).toFixed(0)}%, R=${(a.line_density.right_or_bottom * 100).toFixed(0)}%]`
      }
      return info
    })
    .join('\n')

  return `ANALYZE THIS RACKING REGION AND DETECT INDIVIDUAL AISLES AND RACKING ROWS.

## CRITICAL VISUAL PATTERN

AISLES are whitespace corridors bounded by BLACK LINES on BOTH sides:
- VERTICAL AISLES: dark lines on LEFT and RIGHT of whitespace
- HORIZONTAL AISLES: dark lines ABOVE and BELOW whitespace

## REGION DIMENSIONS
${regionWidth} x ${regionHeight} pixels

## PREPROCESSING HINTS (HIGH QUALITY DATA)
- Dominant orientation: ${orientation}
- Average row spacing: ${spacing.toFixed(1)}px
- High-confidence aisles detected: ${highConfidenceAisles.length}
- Line-pair aisles (most accurate): ${linePairAisles.length}

### Detected Aisles (USE THESE AS REFERENCE):
${aisleInfo || '  None pre-detected - analyze visually'}

## YOUR TASK
1. **VERIFY** the pre-detected aisles by looking for whitespace corridors
2. Each aisle MUST have black lines (racking) on BOTH sides
3. **OUTPUT RECTANGULAR ZONES** for each aisle and racking section

## OUTPUT FORMAT
{
  "direction": "horizontal" | "vertical",
  "subdivisions": [
    {
      "type": "aisle_path",
      "name": "Aisle 1",
      "vertices": [{"x": 10, "y": 20}, {"x": 30, "y": 20}, {"x": 30, "y": 400}, {"x": 10, "y": 400}],
      "confidence": 0.9,
      "travelable": true
    },
    {
      "type": "racking",
      "name": "Rack Row A",
      "vertices": [{"x": 30, "y": 20}, {"x": 80, "y": 20}, {"x": 80, "y": 400}, {"x": 30, "y": 400}],
      "confidence": 0.85,
      "travelable": false
    }
  ],
  "analysisNotes": "Verified X pre-detected aisles, found Y total"
}

Output ONLY valid JSON.`
}
