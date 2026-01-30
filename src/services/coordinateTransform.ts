import type { Point, BoundingBox } from '@/types/zone'
import type { FloorplanConfig, FloorplanTransformer } from '@/types/config'

/**
 * Transform vertices from cropped image coordinates to full image coordinates
 * @param vertices - Vertices in cropped image space
 * @param offset - Offset of the crop region from the original image origin
 * @returns Vertices in full image space (rounded to integers)
 */
export function transformToFullImage(vertices: Point[], offset: Point): Point[] {
  if (vertices.length === 0) return []

  return vertices.map((v) => ({
    x: Math.round(v.x + offset.x),
    y: Math.round(v.y + offset.y),
  }))
}

/**
 * Transform vertices from full image coordinates to cropped image coordinates
 * @param vertices - Vertices in full image space
 * @param offset - Offset of the crop region from the original image origin
 * @returns Vertices in cropped image space (rounded to integers)
 */
export function transformToCropped(vertices: Point[], offset: Point): Point[] {
  if (vertices.length === 0) return []

  return vertices.map((v) => ({
    x: Math.round(v.x - offset.x),
    y: Math.round(v.y - offset.y),
  }))
}

/**
 * Calculate the bounding box of a set of vertices
 * @param vertices - Array of points
 * @returns Bounding box containing all vertices
 */
export function calculateBoundingBox(vertices: Point[]): BoundingBox {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  if (vertices.length === 1) {
    return {
      x: Math.round(vertices[0]!.x),
      y: Math.round(vertices[0]!.y),
      width: 0,
      height: 0,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const v of vertices) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  }
}

/**
 * Add padding to a bounding box as a percentage
 * @param bounds - Original bounding box
 * @param paddingPercent - Padding as decimal (0.1 = 10% on each side)
 * @returns New bounding box with padding added
 */
export function addPaddingToBounds(
  bounds: BoundingBox,
  paddingPercent: number
): BoundingBox {
  if (paddingPercent <= 0) {
    return { ...bounds }
  }

  const paddingX = bounds.width * paddingPercent
  const paddingY = bounds.height * paddingPercent

  return {
    x: Math.round(bounds.x - paddingX),
    y: Math.round(bounds.y - paddingY),
    width: Math.round(bounds.width + paddingX * 2),
    height: Math.round(bounds.height + paddingY * 2),
  }
}

/**
 * Clamp a bounding box to fit within image dimensions
 * @param bounds - Bounding box to clamp
 * @param imageWidth - Width of the image
 * @param imageHeight - Height of the image
 * @returns Clamped bounding box
 */
export function clampBoundsToImage(
  bounds: BoundingBox,
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  // Clamp x and y to non-negative
  const x = Math.max(0, bounds.x)
  const y = Math.max(0, bounds.y)

  // Calculate how much we shifted
  const shiftX = x - bounds.x
  const shiftY = y - bounds.y

  // Adjust width/height for the shift and clamp to image bounds
  const width = Math.min(bounds.width - shiftX, imageWidth - x)
  const height = Math.min(bounds.height - shiftY, imageHeight - y)

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.max(0, width)),
    height: Math.round(Math.max(0, height)),
  }
}

/**
 * Convert a bounding box to its four corner vertices
 * @param bounds - Bounding box
 * @returns Array of 4 corner points (clockwise from top-left)
 */
export function boundsToVertices(bounds: BoundingBox): Point[] {
  return [
    { x: bounds.x, y: bounds.y }, // Top-left
    { x: bounds.x + bounds.width, y: bounds.y }, // Top-right
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // Bottom-right
    { x: bounds.x, y: bounds.y + bounds.height }, // Bottom-left
  ]
}

/**
 * Check if a point is inside a bounding box
 * @param point - Point to check
 * @param bounds - Bounding box
 * @returns true if point is inside or on the boundary
 */
export function isPointInBounds(point: Point, bounds: BoundingBox): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  )
}

/**
 * Scale vertices by a factor (useful for compressed image coordinate mapping)
 * @param vertices - Vertices to scale
 * @param scaleFactor - Scale factor (e.g., 2 doubles the coordinates)
 * @returns Scaled vertices (rounded to integers)
 */
export function scaleVertices(vertices: Point[], scaleFactor: number): Point[] {
  if (scaleFactor === 1) return vertices

  return vertices.map((v) => ({
    x: Math.round(v.x * scaleFactor),
    y: Math.round(v.y * scaleFactor),
  }))
}

// =============================================================================
// Floorplan Coordinate Transformer (mm ↔ pixels)
// =============================================================================

/**
 * Create a coordinate transformer for converting between real-world mm and image pixels
 *
 * The mm coordinate system typically has Y increasing upward (CAD convention),
 * while pixel coordinates have Y increasing downward (screen convention).
 * This transformer handles the Y-axis flip automatically.
 *
 * IMPORTANT: The floorplan config uses RDB visualization conventions:
 * - image_offset_x/y are PIXEL coordinates of the image CENTER (not mm!)
 * - image_scale needs to be multiplied by 100 to get actual mm/pixel
 *
 * @param config - Floorplan configuration with scale and offset
 * @param options - Optional transformation options
 * @returns FloorplanTransformer object
 */
export function createFloorplanTransformer(
  config: FloorplanConfig,
  options?: { flipY?: boolean; flipX?: boolean }
): FloorplanTransformer {
  const { image_offset_x, image_offset_y, image_scale, width, height } = config
  // Default: flip Y-axis to convert from CAD (Y-up) to screen (Y-down) coordinates
  const flipY = options?.flipY ?? true
  const flipX = options?.flipX ?? false

  // CORRECT: Multiply scale by 100 to get mm/pixel (RDB convention)
  const mm_per_pixel = image_scale * 100

  // CORRECT: image_offset_x/y are PIXEL coordinates of image CENTER
  // Calculate mm coordinates at image edges (extent bounds)
  const x_min_mm = (image_offset_x - width / 2) * mm_per_pixel
  const y_min_mm = (image_offset_y - height / 2) * mm_per_pixel

  /**
   * Convert mm coordinates to pixel coordinates
   * Formula: pixel = (mm - x_min_mm) / mm_per_pixel
   * x_min_mm is the mm coordinate at the left edge of the image
   */
  const toPixels = (point: Point): Point => {
    let x = (point.x - x_min_mm) / mm_per_pixel
    let y = (point.y - y_min_mm) / mm_per_pixel

    // Flip Y axis: transform so that higher mm Y values appear at lower pixel Y (top of screen)
    if (flipY) {
      y = height - y
    }
    if (flipX) {
      x = width - x
    }

    return { x, y }
  }

  /**
   * Convert pixel coordinates to mm coordinates
   */
  const toMm = (point: Point): Point => {
    let pixelX = point.x
    let pixelY = point.y

    // Un-flip axes if needed
    if (flipX) {
      pixelX = width - pixelX
    }
    if (flipY) {
      pixelY = height - pixelY
    }

    // Convert pixels to mm: mm = pixel * mm_per_pixel + x_min_mm
    return {
      x: pixelX * mm_per_pixel + x_min_mm,
      y: pixelY * mm_per_pixel + y_min_mm,
    }
  }

  /**
   * Transform entire polygon from mm to pixels
   */
  const polygonToPixels = (points: Point[]): Point[] => {
    if (points.length === 0) return []
    return points.map(toPixels)
  }

  /**
   * Transform entire polygon from pixels to mm
   */
  const polygonToMm = (points: Point[]): Point[] => {
    if (points.length === 0) return []
    return points.map(toMm)
  }

  /**
   * Check if pixel coordinates are within image bounds
   */
  const isWithinBounds = (point: Point): boolean => {
    return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
  }

  return {
    toPixels,
    toMm,
    polygonToPixels,
    polygonToMm,
    isWithinBounds,
    config,
  }
}

/**
 * Convert a single point from mm to pixels using floorplan config
 * Convenience function when you don't need the full transformer
 *
 * IMPORTANT: Uses RDB visualization conventions - see createFloorplanTransformer
 *
 * @param point - Point in mm coordinates
 * @param config - Floorplan configuration
 * @param options - Optional transformation options (flipY defaults to true)
 * @returns Point in pixel coordinates
 */
export function mmToPixels(
  point: Point,
  config: FloorplanConfig,
  options?: { flipY?: boolean; flipX?: boolean }
): Point {
  const flipY = options?.flipY ?? true
  const flipX = options?.flipX ?? false

  // CORRECT: Multiply scale by 100 to get mm/pixel
  const mm_per_pixel = config.image_scale * 100

  // CORRECT: image_offset is PIXEL center, calculate mm extent
  const x_min_mm = (config.image_offset_x - config.width / 2) * mm_per_pixel
  const y_min_mm = (config.image_offset_y - config.height / 2) * mm_per_pixel

  let x = (point.x - x_min_mm) / mm_per_pixel
  let y = (point.y - y_min_mm) / mm_per_pixel

  if (flipY) {
    y = config.height - y
  }
  if (flipX) {
    x = config.width - x
  }

  return { x, y }
}

/**
 * Convert a single point from pixels to mm using floorplan config
 * Convenience function when you don't need the full transformer
 *
 * IMPORTANT: Uses RDB visualization conventions - see createFloorplanTransformer
 *
 * @param point - Point in pixel coordinates
 * @param config - Floorplan configuration
 * @param options - Optional transformation options (flipY defaults to true)
 * @returns Point in mm coordinates
 */
export function pixelsToMm(
  point: Point,
  config: FloorplanConfig,
  options?: { flipY?: boolean; flipX?: boolean }
): Point {
  const flipY = options?.flipY ?? true
  const flipX = options?.flipX ?? false

  let pixelX = point.x
  let pixelY = point.y

  if (flipX) {
    pixelX = config.width - pixelX
  }
  if (flipY) {
    pixelY = config.height - pixelY
  }

  // CORRECT: Multiply scale by 100 to get mm/pixel
  const mm_per_pixel = config.image_scale * 100

  // CORRECT: image_offset is PIXEL center, calculate mm extent
  const x_min_mm = (config.image_offset_x - config.width / 2) * mm_per_pixel
  const y_min_mm = (config.image_offset_y - config.height / 2) * mm_per_pixel

  return {
    x: pixelX * mm_per_pixel + x_min_mm,
    y: pixelY * mm_per_pixel + y_min_mm,
  }
}

/**
 * Convert distance in pixels to mm
 *
 * @param pixels - Distance in pixels
 * @param config - Floorplan configuration
 * @returns Distance in mm
 */
export function pixelDistanceToMm(
  pixels: number,
  config: FloorplanConfig
): number {
  // CORRECT: Multiply scale by 100 to get mm/pixel
  return pixels * config.image_scale * 100
}

/**
 * Convert distance in mm to pixels
 *
 * @param mm - Distance in mm
 * @param config - Floorplan configuration
 * @returns Distance in pixels
 */
export function mmDistanceToPixels(
  mm: number,
  config: FloorplanConfig
): number {
  // CORRECT: Multiply scale by 100 to get mm/pixel
  return mm / (config.image_scale * 100)
}

// =============================================================================
// Scale Validation and Auto-Correction
// =============================================================================

export interface ScaleValidationResult {
  /** Whether the current scale produces valid coordinates */
  isValid: boolean
  /** Suggested corrected scale if invalid */
  suggestedScale: number | null
  /** Correction factor (e.g., 100 means scale should be 100x larger) */
  correctionFactor: number | null
  /** Diagnostic message */
  message: string
  /** Sample of anchor positions in pixels (for debugging) */
  samplePixelPositions: Array<{ name: string; mm: Point; pixels: Point; inBounds: boolean }>
}

/**
 * Validate that the image_scale produces reasonable pixel coordinates for anchors.
 * If anchors are all out of bounds, suggests a corrected scale.
 *
 * NOTE: With the correct RDB formula (scale*100, offset as pixel center),
 * the scale validation should pass for properly configured floorplans.
 * This function now serves as a diagnostic tool rather than auto-correction.
 *
 * @param config - Floorplan configuration
 * @param anchors - Map of anchor name to anchor data
 * @returns Validation result with diagnostic info
 */
export function validateScale(
  config: FloorplanConfig,
  anchors: Map<string, { position: { x: number; y: number } }>
): ScaleValidationResult {
  if (anchors.size === 0) {
    return {
      isValid: true,
      suggestedScale: null,
      correctionFactor: null,
      message: 'No anchors to validate',
      samplePixelPositions: [],
    }
  }

  const transformer = createFloorplanTransformer(config)
  const samples: ScaleValidationResult['samplePixelPositions'] = []

  // Collect anchor coordinate ranges
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let inBoundsCount = 0

  for (const [name, anchor] of anchors) {
    const mm = { x: anchor.position.x, y: anchor.position.y }
    const pixels = transformer.toPixels(mm)
    const inBounds = transformer.isWithinBounds(pixels)

    if (samples.length < 5) {
      samples.push({ name, mm, pixels, inBounds })
    }

    if (inBounds) inBoundsCount++

    minX = Math.min(minX, anchor.position.x)
    maxX = Math.max(maxX, anchor.position.x)
    minY = Math.min(minY, anchor.position.y)
    maxY = Math.max(maxY, anchor.position.y)
  }

  const totalAnchors = anchors.size
  const inBoundsRatio = inBoundsCount / totalAnchors

  // If most anchors are in bounds, scale is valid
  if (inBoundsRatio >= 0.8) {
    return {
      isValid: true,
      suggestedScale: null,
      correctionFactor: null,
      message: `Scale valid: ${inBoundsCount}/${totalAnchors} anchors in bounds`,
      samplePixelPositions: samples,
    }
  }

  // Calculate what mm_per_pixel would fit the anchor ranges on the image
  // (for diagnostic purposes - the config scale*100 is mm_per_pixel)
  const rangeX = maxX - minX
  const rangeY = maxY - minY

  // Use the larger dimension to calculate required mm_per_pixel
  const requiredMmPerPixelX = rangeX / config.width
  const requiredMmPerPixelY = rangeY / config.height
  const requiredMmPerPixel = Math.max(requiredMmPerPixelX, requiredMmPerPixelY)

  // Current mm_per_pixel is image_scale * 100
  const currentMmPerPixel = config.image_scale * 100

  // Calculate what the raw scale value should be (required mm_per_pixel / 100)
  const suggestedRawScale = requiredMmPerPixel / 100

  // Calculate correction factor
  const correctionFactor = requiredMmPerPixel / currentMmPerPixel

  return {
    isValid: false,
    suggestedScale: suggestedRawScale,
    correctionFactor: correctionFactor,
    message: `Scale appears wrong: only ${inBoundsCount}/${totalAnchors} anchors in bounds. ` +
      `Current scale: ${config.image_scale} (${currentMmPerPixel.toFixed(2)} mm/px), ` +
      `required: ${suggestedRawScale.toFixed(6)} (${requiredMmPerPixel.toFixed(2)} mm/px)`,
    samplePixelPositions: samples,
  }
}

/**
 * Create a floorplan transformer with automatic scale correction if needed.
 * Logs a warning if scale was corrected.
 *
 * @param config - Floorplan configuration
 * @param anchors - Optional anchors for scale validation
 * @param options - Optional transformation options
 * @returns FloorplanTransformer (possibly with corrected scale)
 */
export function createFloorplanTransformerWithValidation(
  config: FloorplanConfig,
  anchors?: Map<string, { position: { x: number; y: number } }>,
  options?: { flipY?: boolean; flipX?: boolean }
): FloorplanTransformer {
  if (!anchors || anchors.size === 0) {
    return createFloorplanTransformer(config, options)
  }

  const validation = validateScale(config, anchors)

  if (validation.isValid) {
    console.log('[coordinateTransform] Scale validation passed')
    return createFloorplanTransformer(config, options)
  }

  // Auto-correct the scale
  console.warn(`[coordinateTransform] ${validation.message}`)
  console.warn(`[coordinateTransform] Auto-correcting scale from ${config.image_scale} to ${validation.suggestedScale}`)

  if (validation.samplePixelPositions.length > 0) {
    console.log('[coordinateTransform] Sample anchor positions (before correction):')
    for (const sample of validation.samplePixelPositions) {
      console.log(`  ${sample.name}: (${sample.mm.x}, ${sample.mm.y}) mm -> (${sample.pixels.x.toFixed(0)}, ${sample.pixels.y.toFixed(0)}) px ${sample.inBounds ? '✓' : '✗'}`)
    }
  }

  const correctedConfig: FloorplanConfig = {
    ...config,
    image_scale: validation.suggestedScale!,
  }

  return createFloorplanTransformer(correctedConfig, options)
}
