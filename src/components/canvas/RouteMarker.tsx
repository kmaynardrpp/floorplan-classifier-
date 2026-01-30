/**
 * Visual markers for route start and end points
 */

import { Circle, Group, Text } from 'react-konva'
import { useProjectStore } from '@/store/useProjectStore'

const MARKER_RADIUS = 12
const MARKER_STROKE_WIDTH = 2

/**
 * Start marker (green with "A")
 */
function StartMarker() {
  const routeStart = useProjectStore((s) => s.routeStart)
  const zoom = useProjectStore((s) => s.zoom)

  if (!routeStart) return null

  // Scale marker to maintain consistent screen size
  const scale = 1 / zoom

  return (
    <Group x={routeStart.x} y={routeStart.y}>
      {/* Outer glow/shadow */}
      <Circle
        radius={MARKER_RADIUS * scale + 2}
        fill="rgba(34, 197, 94, 0.3)"
        listening={false}
      />
      {/* Main circle */}
      <Circle
        radius={MARKER_RADIUS * scale}
        fill="#22C55E"
        stroke="#FFFFFF"
        strokeWidth={MARKER_STROKE_WIDTH * scale}
        listening={false}
      />
      {/* Label */}
      <Text
        text="A"
        fontSize={14 * scale}
        fontStyle="bold"
        fill="#FFFFFF"
        align="center"
        verticalAlign="middle"
        offsetX={5 * scale}
        offsetY={7 * scale}
        listening={false}
      />
    </Group>
  )
}

/**
 * End marker (red with "B")
 */
function EndMarker() {
  const routeEnd = useProjectStore((s) => s.routeEnd)
  const zoom = useProjectStore((s) => s.zoom)

  if (!routeEnd) return null

  // Scale marker to maintain consistent screen size
  const scale = 1 / zoom

  return (
    <Group x={routeEnd.x} y={routeEnd.y}>
      {/* Outer glow/shadow */}
      <Circle
        radius={MARKER_RADIUS * scale + 2}
        fill="rgba(239, 68, 68, 0.3)"
        listening={false}
      />
      {/* Main circle */}
      <Circle
        radius={MARKER_RADIUS * scale}
        fill="#EF4444"
        stroke="#FFFFFF"
        strokeWidth={MARKER_STROKE_WIDTH * scale}
        listening={false}
      />
      {/* Label */}
      <Text
        text="B"
        fontSize={14 * scale}
        fontStyle="bold"
        fill="#FFFFFF"
        align="center"
        verticalAlign="middle"
        offsetX={5 * scale}
        offsetY={7 * scale}
        listening={false}
      />
    </Group>
  )
}

/**
 * Combined route markers component
 * Renders start and end markers when set
 */
export function RouteMarkers() {
  const activeTab = useProjectStore((s) => s.activeTab)

  // Only show markers on route tab
  if (activeTab !== 'route') return null

  return (
    <>
      <StartMarker />
      <EndMarker />
    </>
  )
}
