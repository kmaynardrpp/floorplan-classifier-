/**
 * Utility for cropping images to polygon boundaries
 *
 * Used by the 2D coverage analysis to send cropped regions to AI
 * for blocked area detection.
 */

import type { Point, BoundingBox } from '@/types/zone'

/**
 * Result of cropping an image to a polygon
 */
export interface CropResult {
  /** Cropped image as a data URL */
  croppedDataUrl: string
  /** Bounding box of the crop in original image coordinates */
  boundingBox: BoundingBox
  /** Offset from original image origin (top-left of crop) */
  offset: Point
  /** Width of the cropped image */
  width: number
  /** Height of the cropped image */
  height: number
}

/**
 * Calculate bounding box from polygon vertices
 */
function getBoundingBoxFromPolygon(polygon: Point[]): BoundingBox {
  if (polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const point of polygon) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
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
 * Crop an image to a polygon boundary
 *
 * Creates a rectangular crop that encompasses the polygon with optional padding.
 * The cropped image can then be sent to AI for analysis.
 *
 * @param imageDataUrl - Original image as a data URL
 * @param polygon - Polygon vertices in pixel coordinates
 * @param padding - Additional padding around the bounding box (default: 20px)
 * @returns CropResult with cropped image and coordinate mapping info
 */
export async function cropImageToPolygon(
  imageDataUrl: string,
  polygon: Point[],
  padding: number = 20
): Promise<CropResult> {
  // Load the original image
  const img = await loadImage(imageDataUrl)

  // Calculate bounding box with padding
  const bbox = getBoundingBoxFromPolygon(polygon)

  // Apply padding and clamp to image bounds
  const x = Math.max(0, Math.floor(bbox.x - padding))
  const y = Math.max(0, Math.floor(bbox.y - padding))
  const width = Math.min(img.width - x, Math.ceil(bbox.width + padding * 2))
  const height = Math.min(img.height - y, Math.ceil(bbox.height + padding * 2))

  // Create a canvas for the cropped image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // Draw the cropped region
  ctx.drawImage(
    img,
    x,
    y,
    width,
    height, // Source rectangle
    0,
    0,
    width,
    height // Destination rectangle
  )

  // Convert to data URL
  const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9)

  return {
    croppedDataUrl,
    boundingBox: { x, y, width, height },
    offset: { x, y },
    width,
    height,
  }
}

/**
 * Transform coordinates from cropped image space back to full image space
 *
 * @param point - Point in cropped image coordinates
 * @param offset - Offset of the crop from original image origin
 * @returns Point in original image coordinates
 */
export function transformToOriginalCoords(point: Point, offset: Point): Point {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  }
}

/**
 * Transform an array of vertices from cropped to original coordinates
 *
 * @param vertices - Vertices in cropped image coordinates
 * @param offset - Offset of the crop from original image origin
 * @returns Vertices in original image coordinates
 */
export function transformVerticesToOriginal(
  vertices: Point[],
  offset: Point
): Point[] {
  return vertices.map((v) => transformToOriginalCoords(v, offset))
}

/**
 * Transform coordinates from full image space to cropped image space
 *
 * @param point - Point in original image coordinates
 * @param offset - Offset of the crop from original image origin
 * @returns Point in cropped image coordinates
 */
export function transformToCroppedCoords(point: Point, offset: Point): Point {
  return {
    x: point.x - offset.x,
    y: point.y - offset.y,
  }
}

/**
 * Check if a point is within the cropped region
 *
 * @param point - Point in original image coordinates
 * @param cropResult - The crop result to check against
 * @returns true if the point is within the cropped region
 */
export function isPointInCrop(point: Point, cropResult: CropResult): boolean {
  const { x, y, width, height } = cropResult.boundingBox
  return (
    point.x >= x &&
    point.x <= x + width &&
    point.y >= y &&
    point.y <= y + height
  )
}

/**
 * Crop an image to a bounding box (simpler version for rectangular regions)
 *
 * @param imageDataUrl - Original image as a data URL
 * @param boundingBox - Bounding box to crop to
 * @param padding - Additional padding (default: 20px)
 * @returns CropResult with cropped image
 */
export async function cropImageToBoundingBox(
  imageDataUrl: string,
  boundingBox: BoundingBox,
  padding: number = 20
): Promise<CropResult> {
  // Convert bounding box to polygon (4 corners)
  const polygon: Point[] = [
    { x: boundingBox.x, y: boundingBox.y },
    { x: boundingBox.x + boundingBox.width, y: boundingBox.y },
    {
      x: boundingBox.x + boundingBox.width,
      y: boundingBox.y + boundingBox.height,
    },
    { x: boundingBox.x, y: boundingBox.y + boundingBox.height },
  ]

  return cropImageToPolygon(imageDataUrl, polygon, padding)
}
