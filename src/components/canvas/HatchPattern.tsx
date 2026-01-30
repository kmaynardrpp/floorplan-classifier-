import { Group, Line } from 'react-konva'
import { useMemo } from 'react'
import type { Context } from 'konva/lib/Context'
import type { Point } from '@/types/zone'
import { getPolygonBounds } from '@/utils/geometry'

interface HatchPatternProps {
  /** Polygon vertices to fill with hatch pattern */
  vertices: Point[]
  /** Color of the hatch lines */
  color: string
  /** Spacing between hatch lines in pixels */
  spacing?: number
  /** Angle of hatch lines in degrees (0 = vertical, 90 = horizontal) */
  angle?: number
  /** Line width */
  strokeWidth?: number
  /** Opacity of the hatch lines */
  opacity?: number
}

/**
 * Renders a diagonal hatch pattern within a polygon
 * Uses clipping to constrain lines to the polygon boundary
 */
export function HatchPattern({
  vertices,
  color,
  spacing = 8,
  angle = 45,
  strokeWidth = 1,
  opacity = 0.5,
}: HatchPatternProps) {
  // Calculate hatch lines based on polygon bounds and angle
  const hatchLines = useMemo(() => {
    if (vertices.length < 3) return []

    const bounds = getPolygonBounds(vertices)
    const lines: number[][] = []

    // Calculate the diagonal length to ensure we cover the entire area
    const diagonal = Math.sqrt(bounds.width ** 2 + bounds.height ** 2)

    // Convert angle to radians
    const radians = (angle * Math.PI) / 180
    const sin = Math.sin(radians)
    const cos = Math.cos(radians)

    // Center of the polygon
    const cx = bounds.x + bounds.width / 2
    const cy = bounds.y + bounds.height / 2

    // Number of lines needed to cover the area
    const numLines = Math.ceil(diagonal / spacing) * 2

    for (let i = -numLines; i <= numLines; i++) {
      const offset = i * spacing

      // Line perpendicular to the angle, offset from center
      // Start and end points of a line that spans the diagonal
      const x1 = cx + offset * cos - diagonal * sin
      const y1 = cy + offset * sin + diagonal * cos
      const x2 = cx + offset * cos + diagonal * sin
      const y2 = cy + offset * sin - diagonal * cos

      lines.push([x1, y1, x2, y2])
    }

    return lines
  }, [vertices, spacing, angle])

  // Create clip function from polygon vertices
  const clipFunc = useMemo(() => {
    if (vertices.length < 3) return undefined

    return (ctx: Context) => {
      ctx.beginPath()
      ctx.moveTo(vertices[0]!.x, vertices[0]!.y)
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i]!.x, vertices[i]!.y)
      }
      ctx.closePath()
    }
  }, [vertices])

  if (vertices.length < 3 || !clipFunc) return null

  return (
    <Group clipFunc={clipFunc}>
      {hatchLines.map((points, index) => (
        <Line
          key={index}
          points={points}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  )
}
