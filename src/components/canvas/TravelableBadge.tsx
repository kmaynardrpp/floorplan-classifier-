import { Group, Rect, Text } from 'react-konva'
import type { Point } from '@/types/zone'

interface TravelableBadgeProps {
  /** Position for the badge (typically zone centroid) */
  position: Point
  /** Whether the zone is travelable */
  travelable: boolean
  /** Whether the badge should be visible */
  visible?: boolean
}

// Badge colors
const TRAVELABLE_BG = '#00E676'
const TRAVELABLE_TEXT = '#1B5E20'
const NON_TRAVELABLE_BG = '#F44336'
const NON_TRAVELABLE_TEXT = '#FFFFFF'

// Badge dimensions
const BADGE_WIDTH = 24
const BADGE_HEIGHT = 20
const BADGE_RADIUS = 4
const FONT_SIZE = 14

/**
 * Renders a small badge indicating whether a zone is travelable
 * Shows ✓ for travelable zones, ✕ for non-travelable
 */
export function TravelableBadge({
  position,
  travelable,
  visible = true,
}: TravelableBadgeProps) {
  if (!visible) return null

  const bgColor = travelable ? TRAVELABLE_BG : NON_TRAVELABLE_BG
  const textColor = travelable ? TRAVELABLE_TEXT : NON_TRAVELABLE_TEXT
  const symbol = travelable ? '✓' : '✕'

  // Center the badge on the position
  const x = position.x - BADGE_WIDTH / 2
  const y = position.y - BADGE_HEIGHT / 2

  return (
    <Group listening={false}>
      {/* Background */}
      <Rect
        x={x}
        y={y}
        width={BADGE_WIDTH}
        height={BADGE_HEIGHT}
        fill={bgColor}
        cornerRadius={BADGE_RADIUS}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={4}
        shadowOffsetY={2}
      />
      {/* Symbol */}
      <Text
        x={x}
        y={y + 2}
        width={BADGE_WIDTH}
        height={BADGE_HEIGHT}
        text={symbol}
        fontSize={FONT_SIZE}
        fontStyle="bold"
        fill={textColor}
        align="center"
        verticalAlign="middle"
        listening={false}
      />
    </Group>
  )
}

/**
 * Extended badge that shows travelability status with text label
 */
interface TravelableLabelBadgeProps {
  position: Point
  travelable: boolean
  visible?: boolean
}

export function TravelableLabelBadge({
  position,
  travelable,
  visible = true,
}: TravelableLabelBadgeProps) {
  if (!visible) return null

  const bgColor = travelable ? TRAVELABLE_BG : NON_TRAVELABLE_BG
  const textColor = travelable ? TRAVELABLE_TEXT : NON_TRAVELABLE_TEXT
  const label = travelable ? 'Travelable' : 'Blocked'

  const labelWidth = 80
  const labelHeight = 24

  // Center the badge on the position
  const x = position.x - labelWidth / 2
  const y = position.y - labelHeight / 2

  return (
    <Group listening={false}>
      {/* Background */}
      <Rect
        x={x}
        y={y}
        width={labelWidth}
        height={labelHeight}
        fill={bgColor}
        cornerRadius={BADGE_RADIUS}
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={4}
        shadowOffsetY={2}
      />
      {/* Label text */}
      <Text
        x={x}
        y={y + 4}
        width={labelWidth}
        height={labelHeight}
        text={label}
        fontSize={12}
        fontStyle="bold"
        fill={textColor}
        align="center"
        listening={false}
      />
    </Group>
  )
}
