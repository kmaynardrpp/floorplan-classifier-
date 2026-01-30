import { useProjectStore } from '@/store/useProjectStore'
import { getZoneTypeLabel, getZoneColor } from '@/utils/zoneColors'

interface ZoneTooltipProps {
  position: { x: number; y: number } | null
}

export function ZoneTooltip({ position }: ZoneTooltipProps) {
  const zones = useProjectStore((state) => state.zones)
  const hoveredZoneId = useProjectStore((state) => state.hoveredZoneId)
  const zoom = useProjectStore((state) => state.zoom)
  const panX = useProjectStore((state) => state.panX)
  const panY = useProjectStore((state) => state.panY)

  const hoveredZone = hoveredZoneId
    ? zones.find((z) => z.id === hoveredZoneId)
    : null

  if (!hoveredZone || !position) return null

  // Convert canvas position to screen position
  const screenX = position.x * zoom + panX
  const screenY = position.y * zoom + panY

  const color = hoveredZone.metadata.color ?? getZoneColor(hoveredZone.type)

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg bg-surface-secondary/95 px-3 py-2 shadow-lg backdrop-blur-sm"
      style={{
        left: screenX + 10,
        top: screenY + 10,
        transform: 'translate(0, -50%)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 rounded"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium text-text-primary">{hoveredZone.name}</span>
      </div>
      <div className="mt-1 text-sm text-text-secondary">
        <span>{getZoneTypeLabel(hoveredZone.type)}</span>
        {hoveredZone.confidence !== null && (
          <span className="ml-2">
            ({Math.round(hoveredZone.confidence * 100)}% confidence)
          </span>
        )}
      </div>
      {hoveredZone.source === 'ai' && (
        <div className="mt-1 text-xs text-primary">AI-detected</div>
      )}
    </div>
  )
}
