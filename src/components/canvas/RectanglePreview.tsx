import { Rect, Circle, Group } from 'react-konva'
import type { Point } from '@/types/zone'

interface RectanglePreviewProps {
  startPoint: Point
  currentPoint: Point
}

export function RectanglePreview({ startPoint, currentPoint }: RectanglePreviewProps) {
  // Calculate rectangle bounds
  const minX = Math.min(startPoint.x, currentPoint.x)
  const minY = Math.min(startPoint.y, currentPoint.y)
  const width = Math.abs(currentPoint.x - startPoint.x)
  const height = Math.abs(currentPoint.y - startPoint.y)

  // Check if rectangle meets minimum size
  const isValidSize = width >= 20 && height >= 20

  return (
    <Group>
      {/* Rectangle outline */}
      <Rect
        x={minX}
        y={minY}
        width={width}
        height={height}
        stroke={isValidSize ? '#3B82F6' : '#EF4444'}
        strokeWidth={2}
        fill={isValidSize ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
        dash={isValidSize ? undefined : [5, 5]}
        listening={false}
      />
      {/* Corner handles */}
      <Circle
        x={startPoint.x}
        y={startPoint.y}
        radius={5}
        fill="#10B981"
        stroke="#FFFFFF"
        strokeWidth={2}
        listening={false}
      />
      <Circle
        x={currentPoint.x}
        y={currentPoint.y}
        radius={4}
        fill="#3B82F6"
        opacity={0.5}
        listening={false}
      />
      {/* Dimension text */}
      {width > 50 && height > 30 && (
        <Group>
          {/* Width x Height indicator would go here if needed */}
        </Group>
      )}
    </Group>
  )
}
