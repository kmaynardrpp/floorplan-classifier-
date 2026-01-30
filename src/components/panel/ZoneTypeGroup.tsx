import type { Zone, ZoneType } from '@/types/zone'
import { getZoneColor, getZoneTypeLabel } from '@/utils/zoneColors'
import { ZoneListItem } from './ZoneListItem'
import { useProjectStore } from '@/store/useProjectStore'

interface ZoneTypeGroupProps {
  type: ZoneType
  zones: Zone[]
  isExpanded: boolean
  onToggle: () => void
  selectedZoneIds: string[]
  onZoneClick: (zoneId: string, event: React.MouseEvent) => void
  searchQuery?: string
}

export function ZoneTypeGroup({
  type,
  zones,
  isExpanded,
  onToggle,
  selectedZoneIds,
  onZoneClick,
  searchQuery = '',
}: ZoneTypeGroupProps) {
  const updateZone = useProjectStore((state) => state.updateZone)
  const color = getZoneColor(type)
  const label = getZoneTypeLabel(type)

  // Calculate visibility state for the group
  const visibleCount = zones.filter((z) => z.metadata.isVisible).length
  const allVisible = visibleCount === zones.length
  const noneVisible = visibleCount === 0

  // Toggle visibility for all zones in this group
  const handleGroupVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newVisibility = !allVisible
    zones.forEach((zone) => {
      updateZone(zone.id, {
        metadata: {
          ...zone.metadata,
          isVisible: newVisibility,
        },
      })
    })
  }

  return (
    <div className="mb-1">
      {/* Group Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-gray-50"
      >
        {/* Expand/Collapse icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform ${
            isExpanded ? 'rotate-90' : ''
          }`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
          />
        </svg>

        {/* Color swatch */}
        <span
          className="h-3 w-3 flex-shrink-0 rounded-sm"
          style={{ backgroundColor: color }}
        />

        {/* Type label and count */}
        <span className="flex-1 text-sm font-medium text-gray-700">{label}</span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
          {zones.length}
        </span>

        {/* Group visibility toggle */}
        <span
          onClick={handleGroupVisibilityToggle}
          className="rounded p-0.5 hover:bg-gray-200"
          title={allVisible ? 'Hide all' : 'Show all'}
        >
          {allVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 text-gray-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          ) : noneVisible ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            </svg>
          ) : (
            // Mixed visibility - show partial icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-4 w-4 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                strokeDasharray="4 2"
              />
            </svg>
          )}
        </span>
      </button>

      {/* Zone Items */}
      {isExpanded && (
        <div className="ml-4">
          {zones.map((zone) => (
            <ZoneListItem
              key={zone.id}
              zone={zone}
              isSelected={selectedZoneIds.includes(zone.id)}
              onClick={onZoneClick}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}
