import type { BoundingBox, Point } from '@/types/zone'

/**
 * Result from cropping an image with padding
 */
export interface CropResult {
  /** Cropped image as data URL */
  dataUrl: string
  /** Actual bounds used (after clamping) */
  actualBounds: BoundingBox
  /** Offset from original image origin */
  originalOffset: Point
  /** Width of cropped image */
  width: number
  /** Height of cropped image */
  height: number
}

/**
 * Crop an image to specified bounds
 * @param imageDataUrl - Source image as data URL
 * @param bounds - Bounding box to crop (will be clamped to image dimensions)
 * @returns Cropped image as data URL
 */
export async function cropImage(
  imageDataUrl: string,
  bounds: BoundingBox
): Promise<string> {
  const result = await cropImageWithPadding(imageDataUrl, bounds, 0)
  return result.dataUrl
}

/**
 * Crop an image with optional padding around the bounds
 * @param imageDataUrl - Source image as data URL
 * @param bounds - Base bounding box to crop
 * @param paddingPercent - Padding to add as percentage (0.1 = 10% on each side)
 * @returns Crop result with data URL and metadata
 */
export async function cropImageWithPadding(
  imageDataUrl: string,
  bounds: BoundingBox,
  paddingPercent: number = 0
): Promise<CropResult> {
  // Validate input
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image data URL')
  }

  // Load the image
  const img = await loadImage(imageDataUrl)
  const imageWidth = img.width
  const imageHeight = img.height

  // Calculate padded bounds
  const paddedBounds = addPadding(bounds, paddingPercent)

  // Clamp bounds to image dimensions
  const clampedBounds = clampBounds(paddedBounds, imageWidth, imageHeight)

  // Handle edge cases
  if (clampedBounds.width <= 0 || clampedBounds.height <= 0) {
    throw new Error('Crop bounds result in zero-size image')
  }

  // Create canvas and crop
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(clampedBounds.width)
  canvas.height = Math.round(clampedBounds.height)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Draw the cropped portion
  ctx.drawImage(
    img,
    Math.round(clampedBounds.x),
    Math.round(clampedBounds.y),
    Math.round(clampedBounds.width),
    Math.round(clampedBounds.height),
    0,
    0,
    canvas.width,
    canvas.height
  )

  // Get the data URL (preserve format if possible)
  const format = imageDataUrl.includes('image/png') ? 'image/png' : 'image/jpeg'
  const quality = format === 'image/jpeg' ? 0.92 : undefined
  const dataUrl = canvas.toDataURL(format, quality)

  return {
    dataUrl,
    actualBounds: clampedBounds,
    originalOffset: {
      x: Math.round(clampedBounds.x),
      y: Math.round(clampedBounds.y),
    },
    width: canvas.width,
    height: canvas.height,
  }
}

/**
 * Load an image from a data URL
 */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

/**
 * Add padding to bounds as a percentage
 */
function addPadding(bounds: BoundingBox, paddingPercent: number): BoundingBox {
  if (paddingPercent <= 0) return { ...bounds }

  const paddingX = bounds.width * paddingPercent
  const paddingY = bounds.height * paddingPercent

  return {
    x: bounds.x - paddingX,
    y: bounds.y - paddingY,
    width: bounds.width + paddingX * 2,
    height: bounds.height + paddingY * 2,
  }
}

/**
 * Clamp bounds to image dimensions
 */
function clampBounds(
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
 * Get the dimensions of an image from its data URL
 */
export async function getImageDimensions(
  imageDataUrl: string
): Promise<{ width: number; height: number }> {
  const img = await loadImage(imageDataUrl)
  return { width: img.width, height: img.height }
}

/**
 * Result from cropping an image with polygon masking
 */
export interface PolygonCropResult {
  /** Cropped image as data URL (masked to polygon shape) */
  dataUrl: string
  /** Bounding box of the polygon in original image coordinates */
  boundingBox: BoundingBox
  /** Offset from original image origin (same as bounding box x,y) */
  originalOffset: Point
  /** Width of cropped image */
  width: number
  /** Height of cropped image */
  height: number
  /** Polygon vertices transformed to local crop coordinates */
  localPolygon: Point[]
}

/**
 * Crop an image to the EXACT shape of a polygon
 * Areas outside the polygon are made transparent (or filled with background color)
 *
 * @param imageDataUrl - Source image as data URL
 * @param polygon - Array of vertices defining the polygon (in image coordinates)
 * @param paddingPercent - Optional padding around the polygon bounding box (0.05 = 5%)
 * @param backgroundColor - Background color for areas outside polygon (default: transparent)
 * @returns Crop result with masked image and metadata
 */
export async function cropImageWithPolygonMask(
  imageDataUrl: string,
  polygon: Point[],
  paddingPercent: number = 0,
  backgroundColor: string = 'transparent'
): Promise<PolygonCropResult> {
  // Validate input
  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('Invalid image data URL')
  }

  if (!polygon || polygon.length < 3) {
    throw new Error('Polygon must have at least 3 vertices')
  }

  // Load the image
  const img = await loadImage(imageDataUrl)
  const imageWidth = img.width
  const imageHeight = img.height

  // Calculate bounding box of the polygon
  const xs = polygon.map(p => p.x)
  const ys = polygon.map(p => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)

  const baseBounds: BoundingBox = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }

  // Add padding
  const paddedBounds = addPadding(baseBounds, paddingPercent)

  // Clamp bounds to image dimensions
  const clampedBounds = clampBounds(paddedBounds, imageWidth, imageHeight)

  // Debug: Log bounds transformation with explicit values
  console.log(
    `[imageCropper] Polygon crop bounds:\n` +
    `  polygonBbox: minX=${Math.round(minX)}, minY=${Math.round(minY)}, maxX=${Math.round(maxX)}, maxY=${Math.round(maxY)}\n` +
    `  baseBounds: x=${Math.round(baseBounds.x)}, y=${Math.round(baseBounds.y)}, w=${Math.round(baseBounds.width)}, h=${Math.round(baseBounds.height)}\n` +
    `  paddedBounds: x=${Math.round(paddedBounds.x)}, y=${Math.round(paddedBounds.y)}, w=${Math.round(paddedBounds.width)}, h=${Math.round(paddedBounds.height)}\n` +
    `  clampedBounds: x=${Math.round(clampedBounds.x)}, y=${Math.round(clampedBounds.y)}, w=${Math.round(clampedBounds.width)}, h=${Math.round(clampedBounds.height)}\n` +
    `  imageSize: ${imageWidth}x${imageHeight}\n` +
    `  FINAL CROP SIZE: ${Math.round(clampedBounds.width)}x${Math.round(clampedBounds.height)} (AI will receive these dimensions)`
  )

  // Handle edge cases
  if (clampedBounds.width <= 0 || clampedBounds.height <= 0) {
    throw new Error('Crop bounds result in zero-size image')
  }

  // Create canvas
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(clampedBounds.width)
  canvas.height = Math.round(clampedBounds.height)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Transform polygon vertices to local canvas coordinates
  const localPolygon = polygon.map(p => ({
    x: p.x - clampedBounds.x,
    y: p.y - clampedBounds.y,
  }))

  // Fill background first (if not transparent)
  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Create clipping path from polygon
  ctx.beginPath()
  ctx.moveTo(localPolygon[0]!.x, localPolygon[0]!.y)
  for (let i = 1; i < localPolygon.length; i++) {
    ctx.lineTo(localPolygon[i]!.x, localPolygon[i]!.y)
  }
  ctx.closePath()
  ctx.clip()

  // Draw the cropped portion of the image (only visible within the clipping path)
  ctx.drawImage(
    img,
    Math.round(clampedBounds.x),
    Math.round(clampedBounds.y),
    Math.round(clampedBounds.width),
    Math.round(clampedBounds.height),
    0,
    0,
    canvas.width,
    canvas.height
  )

  // Always use PNG to preserve transparency
  const dataUrl = canvas.toDataURL('image/png')

  return {
    dataUrl,
    boundingBox: clampedBounds,
    originalOffset: {
      x: Math.round(clampedBounds.x),
      y: Math.round(clampedBounds.y),
    },
    width: canvas.width,
    height: canvas.height,
    localPolygon,
  }
}
