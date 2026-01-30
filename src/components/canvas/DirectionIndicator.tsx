import { Arrow } from 'react-konva'
import { useMemo } from 'react'
import type { Zone, Point } from '@/types/zone'
import { getCentroid, getPolygonArea } from '@/utils/geometry'
import { calculateArrowSize } from '@/utils/zoneStyles'

interface DirectionIndicatorProps {
  /** Zone to display direction for */
  zone: Zone
  /** Direction of travel (horizontal = →, vertical = ↓) */
  direction: 'horizontal' | 'vertical'
}

/**
 * Renders an arrow indicator showing the direction of travel for a zone
 * Positioned at the zone's centroid
 */
export function DirectionIndicator({ zone, direction }: DirectionIndicatorProps) {
  const { centroid, arrowLength, rotation } = useMemo(() => {
    const centroid = getCentroid(zone.vertices)
    const area = getPolygonArea(zone.vertices)
    const arrowLength = calculateArrowSize(area)

    // Rotation: 0 = pointing right (horizontal), 90 = pointing down (vertical)
    const rotation = direction === 'horizontal' ? 0 : 90

    return { centroid, arrowLength, rotation }
  }, [zone.vertices, direction])

  // Arrow points from center-left to center-right (before rotation)
  const halfLength = arrowLength / 2

  return (
    <Arrow
      x={centroid.x}
      y={centroid.y}
      points={[-halfLength, 0, halfLength, 0]}
      rotation={rotation}
      fill="#333333"
      stroke="#333333"
      strokeWidth={2}
      pointerLength={6}
      pointerWidth={6}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

/**
 * Simplified direction indicator that takes position directly
 */
interface SimpleDirectionIndicatorProps {
  /** Position for the indicator */
  position: Point
  /** Direction of travel */
  direction: 'horizontal' | 'vertical'
  /** Arrow length in pixels */
  size?: number
  /** Arrow color */
  color?: string
}

export function SimpleDirectionIndicator({
  position,
  direction,
  size = 20,
  color = '#333333',
}: SimpleDirectionIndicatorProps) {
  const halfLength = size / 2
  const rotation = direction === 'horizontal' ? 0 : 90

  return (
    <Arrow
      x={position.x}
      y={position.y}
      points={[-halfLength, 0, halfLength, 0]}
      rotation={rotation}
      fill={color}
      stroke={color}
      strokeWidth={2}
      pointerLength={6}
      pointerWidth={6}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
