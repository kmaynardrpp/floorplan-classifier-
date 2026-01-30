/**
 * Route overlay component - renders calculated route path on canvas
 */

import type { ReactElement } from 'react'
import { Line, Group, Arrow } from 'react-konva'
import { useProjectStore } from '@/store/useProjectStore'

const ROUTE_COLOR = '#3B82F6' // Bright blue
const ROUTE_STROKE_WIDTH = 4
const ROUTE_DASH = [10, 5]

/**
 * Route path line overlay
 */
export function RouteOverlay() {
  const activeTab = useProjectStore((s) => s.activeTab)
  const calculatedRoute = useProjectStore((s) => s.calculatedRoute)
  const zoom = useProjectStore((s) => s.zoom)

  // Only show on route tab with valid route
  if (activeTab !== 'route') return null
  if (!calculatedRoute || !calculatedRoute.success) return null
  if (calculatedRoute.points.length < 2) return null

  // Convert points to flat array for Konva Line
  const points = calculatedRoute.points.flatMap((p) => [p.x, p.y])

  // Scale stroke width to maintain consistent screen appearance
  const scaledStrokeWidth = ROUTE_STROKE_WIDTH / zoom
  const scaledDash = ROUTE_DASH.map((d) => d / zoom)

  return (
    <Group listening={false}>
      {/* Shadow/glow effect */}
      <Line
        points={points}
        stroke="rgba(59, 130, 246, 0.3)"
        strokeWidth={scaledStrokeWidth + 4}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      {/* Main route line */}
      <Line
        points={points}
        stroke={ROUTE_COLOR}
        strokeWidth={scaledStrokeWidth}
        dash={scaledDash}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />

      {/* Direction arrows along the path */}
      {calculatedRoute.points.length >= 2 && (
        <RouteArrows
          points={calculatedRoute.points}
          zoom={zoom}
        />
      )}
    </Group>
  )
}

/**
 * Direction arrows along the route
 */
function RouteArrows({
  points,
  zoom,
}: {
  points: { x: number; y: number }[]
  zoom: number
}) {
  if (points.length < 2) return null

  // Add arrow at midpoints of longer segments
  const arrows: ReactElement[] = []
  const arrowSize = 8 / zoom

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!
    const p2 = points[i + 1]!

    // Calculate segment length
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const length = Math.sqrt(dx * dx + dy * dy)

    // Only add arrow if segment is long enough
    if (length > 50 / zoom) {
      // Midpoint
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2

      arrows.push(
        <Arrow
          key={`arrow-${i}`}
          x={midX}
          y={midY}
          points={[0, 0, dx / length * arrowSize * 2, dy / length * arrowSize * 2]}
          pointerLength={arrowSize}
          pointerWidth={arrowSize}
          fill={ROUTE_COLOR}
          stroke={ROUTE_COLOR}
          strokeWidth={1 / zoom}
          listening={false}
        />
      )
    }
  }

  return <>{arrows}</>
}
