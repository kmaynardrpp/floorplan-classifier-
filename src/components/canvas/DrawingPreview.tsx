import { Line, Circle, Group } from 'react-konva'
import type { Point } from '@/types/zone'

interface DrawingPreviewProps {
  vertices: Point[]
  mousePos: Point | null
}

export function DrawingPreview({ vertices, mousePos }: DrawingPreviewProps) {
  if (vertices.length === 0) return null

  // Build the preview points including mouse position
  const previewVertices = mousePos ? [...vertices, mousePos] : vertices

  // Convert to flat array for Konva Line
  const points = previewVertices.flatMap((v) => [v.x, v.y])

  // Build the closing line (from last vertex back to first)
  const closingLine =
    vertices.length >= 2 && mousePos
      ? [mousePos.x, mousePos.y, vertices[0]!.x, vertices[0]!.y]
      : []

  return (
    <Group>
      {/* Main polygon outline (placed vertices + mouse position) */}
      <Line
        points={points}
        stroke="#3B82F6"
        strokeWidth={2}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
      {/* Closing line preview (dashed from mouse to first vertex) */}
      {closingLine.length > 0 && (
        <Line
          points={closingLine}
          stroke="#3B82F6"
          strokeWidth={1}
          dash={[5, 5]}
          opacity={0.5}
          listening={false}
        />
      )}
      {/* Vertex circles */}
      {vertices.map((vertex, index) => (
        <Circle
          key={index}
          x={vertex.x}
          y={vertex.y}
          radius={5}
          fill={index === 0 ? '#10B981' : '#3B82F6'}
          stroke="#FFFFFF"
          strokeWidth={2}
          listening={false}
        />
      ))}
      {/* Mouse position indicator */}
      {mousePos && (
        <Circle
          x={mousePos.x}
          y={mousePos.y}
          radius={4}
          fill="#3B82F6"
          opacity={0.5}
          listening={false}
        />
      )}
    </Group>
  )
}
