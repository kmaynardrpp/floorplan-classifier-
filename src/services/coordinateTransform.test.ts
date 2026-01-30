import { describe, it, expect } from 'vitest'
import {
  transformToFullImage,
  transformToCropped,
  calculateBoundingBox,
  addPaddingToBounds,
  clampBoundsToImage,
  boundsToVertices,
  isPointInBounds,
  scaleVertices,
} from './coordinateTransform'

describe('transformToFullImage', () => {
  it('should return empty array for empty input', () => {
    const result = transformToFullImage([], { x: 10, y: 20 })
    expect(result).toEqual([])
  })

  it('should add offset to all vertices', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]
    const offset = { x: 50, y: 100 }

    const result = transformToFullImage(vertices, offset)

    expect(result).toEqual([
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 150, y: 150 },
    ])
  })

  it('should round coordinates to integers', () => {
    const vertices = [{ x: 0.4, y: 0.6 }]
    const offset = { x: 10.3, y: 20.7 }

    const result = transformToFullImage(vertices, offset)

    expect(result).toEqual([{ x: 11, y: 21 }])
  })

  it('should handle single vertex', () => {
    const result = transformToFullImage([{ x: 5, y: 10 }], { x: 100, y: 200 })
    expect(result).toEqual([{ x: 105, y: 210 }])
  })
})

describe('transformToCropped', () => {
  it('should return empty array for empty input', () => {
    const result = transformToCropped([], { x: 10, y: 20 })
    expect(result).toEqual([])
  })

  it('should subtract offset from all vertices', () => {
    const vertices = [
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 150, y: 150 },
    ]
    const offset = { x: 50, y: 100 }

    const result = transformToCropped(vertices, offset)

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ])
  })

  it('should round coordinates to integers', () => {
    const vertices = [{ x: 10.7, y: 21.3 }]
    const offset = { x: 10.3, y: 20.7 }

    const result = transformToCropped(vertices, offset)

    // 10.7 - 10.3 = 0.4 → 0
    // 21.3 - 20.7 = 0.6 → 1
    expect(result).toEqual([{ x: 0, y: 1 }])
  })
})

describe('calculateBoundingBox', () => {
  it('should return zero bounds for empty array', () => {
    const bounds = calculateBoundingBox([])
    expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('should handle single vertex with zero size', () => {
    const bounds = calculateBoundingBox([{ x: 50, y: 100 }])
    expect(bounds).toEqual({ x: 50, y: 100, width: 0, height: 0 })
  })

  it('should calculate correct bounds for rectangle', () => {
    const vertices = [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 70 },
      { x: 10, y: 70 },
    ]

    const bounds = calculateBoundingBox(vertices)

    expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('should handle irregular vertices order', () => {
    const vertices = [
      { x: 110, y: 70 },
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 10, y: 70 },
    ]

    const bounds = calculateBoundingBox(vertices)

    expect(bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('should round to integers', () => {
    const vertices = [
      { x: 10.3, y: 20.7 },
      { x: 110.6, y: 70.4 },
    ]

    const bounds = calculateBoundingBox(vertices)

    expect(bounds.x).toBe(10)
    expect(bounds.y).toBe(21)
    expect(bounds.width).toBe(100)
    expect(bounds.height).toBe(50)
  })
})

describe('addPaddingToBounds', () => {
  it('should return same bounds for 0% padding', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 }
    const result = addPaddingToBounds(bounds, 0)
    expect(result).toEqual(bounds)
  })

  it('should add 10% padding on each side', () => {
    const bounds = { x: 100, y: 100, width: 100, height: 100 }
    const result = addPaddingToBounds(bounds, 0.1)

    // 10% of 100 = 10, so x/y decrease by 10, width/height increase by 20
    expect(result.x).toBe(90)
    expect(result.y).toBe(90)
    expect(result.width).toBe(120)
    expect(result.height).toBe(120)
  })

  it('should handle 50% padding', () => {
    const bounds = { x: 100, y: 100, width: 100, height: 100 }
    const result = addPaddingToBounds(bounds, 0.5)

    expect(result.x).toBe(50)
    expect(result.y).toBe(50)
    expect(result.width).toBe(200)
    expect(result.height).toBe(200)
  })

  it('should round to integers', () => {
    const bounds = { x: 100, y: 100, width: 33, height: 33 }
    const result = addPaddingToBounds(bounds, 0.1)

    expect(Number.isInteger(result.x)).toBe(true)
    expect(Number.isInteger(result.y)).toBe(true)
    expect(Number.isInteger(result.width)).toBe(true)
    expect(Number.isInteger(result.height)).toBe(true)
  })
})

describe('clampBoundsToImage', () => {
  it('should not modify bounds already within image', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 }
    const result = clampBoundsToImage(bounds, 1000, 1000)
    expect(result).toEqual(bounds)
  })

  it('should clamp negative x to 0', () => {
    const bounds = { x: -10, y: 20, width: 100, height: 50 }
    const result = clampBoundsToImage(bounds, 1000, 1000)

    expect(result.x).toBe(0)
    expect(result.width).toBe(90) // Reduced by the shift
  })

  it('should clamp negative y to 0', () => {
    const bounds = { x: 10, y: -20, width: 100, height: 50 }
    const result = clampBoundsToImage(bounds, 1000, 1000)

    expect(result.y).toBe(0)
    expect(result.height).toBe(30) // Reduced by the shift
  })

  it('should clamp width to image bounds', () => {
    const bounds = { x: 950, y: 20, width: 100, height: 50 }
    const result = clampBoundsToImage(bounds, 1000, 1000)

    expect(result.width).toBe(50) // Only 50 pixels available
  })

  it('should clamp height to image bounds', () => {
    const bounds = { x: 10, y: 980, width: 100, height: 50 }
    const result = clampBoundsToImage(bounds, 1000, 1000)

    expect(result.height).toBe(20) // Only 20 pixels available
  })

  it('should handle bounds completely outside image', () => {
    const bounds = { x: 1100, y: 1100, width: 100, height: 100 }
    const result = clampBoundsToImage(bounds, 1000, 1000)

    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })
})

describe('boundsToVertices', () => {
  it('should convert bounds to 4 corner vertices', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 }
    const vertices = boundsToVertices(bounds)

    expect(vertices).toHaveLength(4)
    expect(vertices[0]).toEqual({ x: 10, y: 20 }) // Top-left
    expect(vertices[1]).toEqual({ x: 110, y: 20 }) // Top-right
    expect(vertices[2]).toEqual({ x: 110, y: 70 }) // Bottom-right
    expect(vertices[3]).toEqual({ x: 10, y: 70 }) // Bottom-left
  })

  it('should handle zero-size bounds', () => {
    const bounds = { x: 50, y: 100, width: 0, height: 0 }
    const vertices = boundsToVertices(bounds)

    expect(vertices).toHaveLength(4)
    // All vertices should be at the same point
    for (const v of vertices) {
      expect(v.x).toBe(50)
      expect(v.y).toBe(100)
    }
  })
})

describe('isPointInBounds', () => {
  const bounds = { x: 10, y: 20, width: 100, height: 50 }

  it('should return true for point inside bounds', () => {
    expect(isPointInBounds({ x: 50, y: 40 }, bounds)).toBe(true)
  })

  it('should return true for point on boundary', () => {
    expect(isPointInBounds({ x: 10, y: 20 }, bounds)).toBe(true) // Top-left corner
    expect(isPointInBounds({ x: 110, y: 70 }, bounds)).toBe(true) // Bottom-right corner
    expect(isPointInBounds({ x: 50, y: 20 }, bounds)).toBe(true) // Top edge
  })

  it('should return false for point outside bounds', () => {
    expect(isPointInBounds({ x: 5, y: 40 }, bounds)).toBe(false) // Left of bounds
    expect(isPointInBounds({ x: 50, y: 10 }, bounds)).toBe(false) // Above bounds
    expect(isPointInBounds({ x: 120, y: 40 }, bounds)).toBe(false) // Right of bounds
    expect(isPointInBounds({ x: 50, y: 80 }, bounds)).toBe(false) // Below bounds
  })
})

describe('scaleVertices', () => {
  it('should return same vertices for scale factor 1', () => {
    const vertices = [
      { x: 10, y: 20 },
      { x: 100, y: 50 },
    ]
    const result = scaleVertices(vertices, 1)
    expect(result).toEqual(vertices)
  })

  it('should double coordinates for scale factor 2', () => {
    const vertices = [
      { x: 10, y: 20 },
      { x: 50, y: 100 },
    ]
    const result = scaleVertices(vertices, 2)

    expect(result).toEqual([
      { x: 20, y: 40 },
      { x: 100, y: 200 },
    ])
  })

  it('should halve coordinates for scale factor 0.5', () => {
    const vertices = [
      { x: 100, y: 200 },
      { x: 50, y: 100 },
    ]
    const result = scaleVertices(vertices, 0.5)

    expect(result).toEqual([
      { x: 50, y: 100 },
      { x: 25, y: 50 },
    ])
  })

  it('should round to integers', () => {
    const vertices = [{ x: 10, y: 20 }]
    const result = scaleVertices(vertices, 0.3)

    expect(result).toEqual([{ x: 3, y: 6 }])
  })
})
