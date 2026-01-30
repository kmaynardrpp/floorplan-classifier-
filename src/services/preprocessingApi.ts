/**
 * Preprocessing API Client
 *
 * Calls the Python preprocessing backend to get computer vision hints
 * that augment the Gemini AI analysis.
 */

import type { PreprocessingHints } from './geminiPromptWithHints'

const PREPROCESSING_API_URL =
  import.meta.env.VITE_PREPROCESSING_API_URL || 'http://localhost:8000'

/**
 * Preprocessing configuration options
 */
export interface PreprocessingConfig {
  useColorDetection?: boolean
  useCanny?: boolean
  densityWindow?: number
  minRegionArea?: number
  minLineLength?: number
  lineClusterDistance?: number
  includeVisualizations?: boolean
}

/**
 * Content boundary detected by preprocessing
 */
export interface ContentBoundary {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

/**
 * Aisle candidate from preprocessing (updated with validation fields)
 */
export interface PreprocessingAisle {
  id: number
  orientation: 'horizontal' | 'vertical'
  width: number
  centerline: Array<{ x: number; y: number }>
  bounding_box: { x: number; y: number; width: number; height: number }
  adjacent_cluster_ids: number[]
  confidence: number
  detection_method: string
  two_sided_validated: boolean
  line_density: {
    left_or_top: number
    right_or_bottom: number
  }
}

/**
 * Travel lane suggestion from the preprocessing backend
 */
export interface TravelLaneSuggestion {
  id: number
  coverage_uid: string
  centerline: Array<{ x: number; y: number }>
  width_profile: number[]
  average_width: number
  bounding_box: { x: number; y: number; width: number; height: number }
  confidence: number
  detection_method: string
  orientation: 'horizontal' | 'vertical' | 'diagonal'
}

/**
 * Coverage boundary for constraining travel lane detection
 */
export interface CoverageBoundary {
  uid: string
  coverage_type: '1D' | '2D'
  shape: 'POLYGON' | 'POLYLINE'
  points: Array<{ x: number; y: number }>
  margin: number
}

/**
 * Full preprocessing response from the Python backend
 */
export interface PreprocessingResponse {
  edge_detection: {
    boundary_lines: Array<{
      start: { x: number; y: number }
      end: { x: number; y: number }
      angle: number
      length: number
    }>
    contours: Array<{
      vertices: Array<{ x: number; y: number }>
      area: number
      perimeter: number
    }>
    stats: {
      total_lines: number
      total_contours: number
      horizontal_lines: number
      vertical_lines: number
    }
  }
  region_segmentation: {
    regions: Array<{
      id: number
      bounding_box: { x: number; y: number; width: number; height: number }
      vertices: Array<{ x: number; y: number }>
      area: number
      density_score: number
      region_type: 'dense' | 'sparse' | 'mixed' | 'unknown'
      centroid: { x: number; y: number }
    }>
    stats: {
      total_regions: number
      dense_regions: number
      sparse_regions: number
      total_dense_area: number
      total_sparse_area: number
    }
  }
  line_detection: {
    line_clusters: Array<{
      id: number
      orientation: 'horizontal' | 'vertical'
      dominant_angle: number
      bounding_box: { x: number; y: number; width: number; height: number }
      line_count: number
      average_spacing: number
    }>
    /** @deprecated Aisle detection is now programmatic from TDOA data */
    aisle_candidates: PreprocessingAisle[]
    stats: {
      total_lines: number
      total_clusters: number
      horizontal_clusters: number
      vertical_clusters: number
      total_aisles: number
      high_confidence_aisles?: number
      two_sided_validated_aisles?: number
      margin_filtered?: number
    }
  }
  /** Travel lane suggestions for main corridors (replaces aisle detection for travel paths) */
  travel_lane_suggestions?: TravelLaneSuggestion[]
  gemini_hints: PreprocessingHints
  content_boundary?: ContentBoundary
  aisle_visualization_path?: string
  visualizations?: {
    boundary_mask: string // base64
    density_map: string // base64
    orientation_map: string // base64
  }
}

/**
 * Error class for preprocessing API errors
 */
export class PreprocessingError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'PreprocessingError'
  }
}

/**
 * Check if the preprocessing server is available
 */
export async function checkPreprocessingHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PREPROCESSING_API_URL}/health`, {
      method: 'GET',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Send an image for preprocessing
 *
 * @param imageDataUrl - The image as a data URL (data:image/jpeg;base64,...)
 * @param config - Optional preprocessing configuration
 * @returns Preprocessing response with hints for Gemini
 */
export async function preprocessImage(
  imageDataUrl: string,
  config: PreprocessingConfig = {}
): Promise<PreprocessingResponse> {
  const requestBody = {
    image: imageDataUrl,
    include_visualizations: config.includeVisualizations ?? false,
    use_color_detection: config.useColorDetection ?? true,
    use_canny: config.useCanny ?? true,
    density_window: config.densityWindow ?? 50,
    min_region_area: config.minRegionArea ?? 5000,
    min_line_length: config.minLineLength ?? 30,
    line_cluster_distance: config.lineClusterDistance ?? 100.0,
  }

  let response: Response
  try {
    response = await fetch(`${PREPROCESSING_API_URL}/preprocess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    throw new PreprocessingError(
      'Failed to connect to preprocessing server. Is it running on port 8000?'
    )
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new PreprocessingError(
      `Preprocessing failed: ${errorText}`,
      response.status
    )
  }

  return response.json()
}

/**
 * Extract just the Gemini hints from a full preprocessing response
 */
export function extractGeminiHints(
  response: PreprocessingResponse
): PreprocessingHints {
  return response.gemini_hints
}

/**
 * Get preprocessing statistics summary
 */
export function getPreprocessingSummary(response: PreprocessingResponse): string {
  const { edge_detection, region_segmentation, line_detection } = response

  const parts = []

  if (edge_detection.stats.total_contours > 0) {
    parts.push(`${edge_detection.stats.total_contours} boundary contours`)
  }

  if (region_segmentation.stats.dense_regions > 0) {
    parts.push(`${region_segmentation.stats.dense_regions} dense regions`)
  }

  if (region_segmentation.stats.sparse_regions > 0) {
    parts.push(`${region_segmentation.stats.sparse_regions} sparse regions`)
  }

  if (line_detection.stats.total_clusters > 0) {
    parts.push(`${line_detection.stats.total_clusters} line clusters`)
  }

  if (line_detection.stats.total_aisles > 0) {
    const validated = line_detection.stats.two_sided_validated_aisles ?? 0
    parts.push(
      `${line_detection.stats.total_aisles} potential aisles (${validated} validated)`
    )
  }

  return parts.length > 0
    ? `Preprocessing detected: ${parts.join(', ')}`
    : 'No significant features detected in preprocessing'
}

/**
 * Get aisles that fall within a specific bounding box
 * Used to get relevant preprocessing data for a cropped racking region
 *
 * @deprecated Aisle detection within racking areas is now 100% programmatic from TDOA data.
 * This function is kept for backward compatibility but will be removed in a future version.
 *
 * @param response - Full preprocessing response
 * @param boundingBox - The region to filter to
 * @param padding - Extra padding around the bounding box (default 10px)
 */
export function getAislesInRegion(
  response: PreprocessingResponse,
  boundingBox: { x: number; y: number; width: number; height: number },
  padding: number = 10
): PreprocessingAisle[] {
  const aisles = response.line_detection.aisle_candidates

  // Expand bounding box by padding
  const minX = boundingBox.x - padding
  const maxX = boundingBox.x + boundingBox.width + padding
  const minY = boundingBox.y - padding
  const maxY = boundingBox.y + boundingBox.height + padding

  return aisles.filter((aisle) => {
    const bb = aisle.bounding_box
    const aisleCenterX = bb.x + bb.width / 2
    const aisleCenterY = bb.y + bb.height / 2

    // Check if aisle center is within the region
    return (
      aisleCenterX >= minX &&
      aisleCenterX <= maxX &&
      aisleCenterY >= minY &&
      aisleCenterY <= maxY
    )
  })
}

/**
 * Transform aisle coordinates to be relative to a cropped region
 *
 * @deprecated Aisle detection within racking areas is now 100% programmatic from TDOA data.
 * This function is kept for backward compatibility but will be removed in a future version.
 *
 * @param aisles - Aisles in full image coordinates
 * @param cropOffset - The top-left corner of the crop
 */
export function transformAislesToCropCoordinates(
  aisles: PreprocessingAisle[],
  cropOffset: { x: number; y: number }
): PreprocessingAisle[] {
  return aisles.map((aisle) => ({
    ...aisle,
    centerline: aisle.centerline.map((p) => ({
      x: p.x - cropOffset.x,
      y: p.y - cropOffset.y,
    })),
    bounding_box: {
      ...aisle.bounding_box,
      x: aisle.bounding_box.x - cropOffset.x,
      y: aisle.bounding_box.y - cropOffset.y,
    },
  }))
}

/**
 * Format preprocessing hints as a string for the main agent prompt
 */
export function formatHintsForPrompt(hints: PreprocessingHints): string {
  const lines: string[] = []

  lines.push(`## PREPROCESSING ANALYSIS`)
  lines.push(``)

  // Content boundary
  if (hints.image_dimensions) {
    const cb = hints.image_dimensions
    lines.push(`### Image Dimensions`)
    lines.push(`Image size: ${cb.width}x${cb.height}px`)
    lines.push(``)
  }

  // Dense regions (racking areas)
  if (hints.region_analysis?.dense_regions?.length > 0) {
    lines.push(
      `### Dense Regions (Likely Racking) - ${hints.region_analysis.dense_regions.length} found`
    )
    hints.region_analysis.dense_regions.slice(0, 5).forEach((r) => {
      const bb = r.bounding_box
      lines.push(
        `- Region ${r.id}: (${bb.x}, ${bb.y}) size ${bb.width}x${bb.height}, density=${r.density_score.toFixed(2)} -> Mark as racking_area with needsSubdivision=true`
      )
    })
    if (hints.region_analysis.dense_regions.length > 5) {
      lines.push(
        `  ... and ${hints.region_analysis.dense_regions.length - 5} more`
      )
    }
    lines.push(``)
  }

  // Sparse regions (travel lanes)
  if (hints.region_analysis?.sparse_regions?.length > 0) {
    lines.push(
      `### Sparse Regions (Likely Travel Lanes) - ${hints.region_analysis.sparse_regions.length} found`
    )
    hints.region_analysis.sparse_regions.slice(0, 5).forEach((r) => {
      const bb = r.bounding_box
      lines.push(
        `- Region ${r.id}: (${bb.x}, ${bb.y}) size ${bb.width}x${bb.height} -> ${r.suggested_type}`
      )
    })
    if (hints.region_analysis.sparse_regions.length > 5) {
      lines.push(
        `  ... and ${hints.region_analysis.sparse_regions.length - 5} more`
      )
    }
    lines.push(``)
  }

  // Detected aisles
  if (hints.racking_analysis?.detected_aisles?.length > 0) {
    lines.push(
      `### Detected Aisles - ${hints.racking_analysis.detected_aisles.length} found`
    )
    hints.racking_analysis.detected_aisles.slice(0, 8).forEach((a) => {
      const bb = a.bounding_box
      lines.push(
        `- Aisle ${a.id}: ${a.orientation} at x=${bb.x}, y=${bb.y}, width=${a.width.toFixed(0)}px`
      )
    })
    if (hints.racking_analysis.detected_aisles.length > 8) {
      lines.push(
        `  ... and ${hints.racking_analysis.detected_aisles.length - 8} more`
      )
    }
    lines.push(``)
  }

  // Recommendations
  if (hints.recommendations?.length > 0) {
    lines.push(`### Recommendations`)
    hints.recommendations.forEach((r) => {
      lines.push(`- ${r}`)
    })
  }

  return lines.join('\n')
}
