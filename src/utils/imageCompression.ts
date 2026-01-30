/**
 * Claude API has a hard 5MB (5,242,880 bytes) limit per image
 * We target 3MB to leave safety margin for base64 encoding overhead
 */
const TARGET_MAX_BYTES = 3 * 1024 * 1024 // 3MB
// Note: Claude hard limit is 5MB but we target 3MB for safety margin

/**
 * Claude API has a hard 8000 pixel max dimension limit
 * But we use 4000 to keep file size under 5MB
 */
const MAX_DIMENSION = 4000

/**
 * Result of image compression including dimensions for coordinate scaling
 */
export interface CompressionResult {
  dataUrl: string
  originalWidth: number
  originalHeight: number
  compressedWidth: number
  compressedHeight: number
}

/**
 * Compress and resize an image to fit within Claude's 5MB limit
 * @param dataUrl - Original image data URL
 * @returns Compression result with both data URL and dimension info for coordinate scaling
 */
export async function compressImageForApi(
  dataUrl: string
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      try {
        // Store true original dimensions for coordinate scaling
        const trueOriginalWidth = img.width
        const trueOriginalHeight = img.height

        let workingWidth = img.width
        let workingHeight = img.height

        console.log(`Original image: ${workingWidth}x${workingHeight}`)
        console.log(
          `Original size: ${((dataUrl.length * 0.75) / 1024 / 1024).toFixed(2)}MB`
        )

        // First, scale down if any dimension exceeds 4000 pixels
        if (workingWidth > MAX_DIMENSION || workingHeight > MAX_DIMENSION) {
          const dimensionScale = Math.min(
            MAX_DIMENSION / workingWidth,
            MAX_DIMENSION / workingHeight
          )
          workingWidth = Math.round(workingWidth * dimensionScale)
          workingHeight = Math.round(workingHeight * dimensionScale)
          console.log(
            `Scaled to fit max dimension: ${workingWidth}x${workingHeight}`
          )
        }

        // Try progressively smaller sizes and lower quality until under limit
        const scales = [1.0, 0.75, 0.5, 0.4, 0.3, 0.25, 0.2]
        const qualities = [0.85, 0.7, 0.5, 0.3]

        for (const scale of scales) {
          const width = Math.round(workingWidth * scale)
          const height = Math.round(workingHeight * scale)

          // Create canvas at this size
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)

          for (const quality of qualities) {
            // Always use JPEG for compression (much smaller than PNG)
            const result = canvas.toDataURL('image/jpeg', quality)
            const sizeBytes = result.length * 0.75

            console.log(
              `Trying ${width}x${height} @ quality ${quality}: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB`
            )

            if (sizeBytes <= TARGET_MAX_BYTES) {
              console.log(
                `✓ Compressed to ${(sizeBytes / 1024 / 1024).toFixed(2)}MB`
              )
              resolve({
                dataUrl: result,
                originalWidth: trueOriginalWidth,
                originalHeight: trueOriginalHeight,
                compressedWidth: width,
                compressedHeight: height,
              })
              return
            }
          }
        }

        // If we still can't get under the limit, return smallest attempt
        // and let the API return an error
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(workingWidth * 0.15)
        canvas.height = Math.round(workingHeight * 0.15)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const lastResort = canvas.toDataURL('image/jpeg', 0.2)

        console.log(
          `Last resort: ${((lastResort.length * 0.75) / 1024 / 1024).toFixed(2)}MB`
        )
        resolve({
          dataUrl: lastResort,
          originalWidth: trueOriginalWidth,
          originalHeight: trueOriginalHeight,
          compressedWidth: canvas.width,
          compressedHeight: canvas.height,
        })
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'))
    }

    img.src = dataUrl
  })
}

/**
 * Check if an image needs compression for Claude API
 * @param dataUrl - Image data URL
 * @returns true if image exceeds Claude's 5MB limit or 8000px dimension limit
 */
export function needsCompression(dataUrl: string): boolean {
  const estimatedBytes = dataUrl.length * 0.75
  return estimatedBytes > TARGET_MAX_BYTES
}

/**
 * Check if image dimensions exceed Claude's limit
 * This is called after image loads to check dimensions
 */
export function needsDimensionResize(width: number, height: number): boolean {
  return width > MAX_DIMENSION || height > MAX_DIMENSION
}
