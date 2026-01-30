import type { Zone } from '@/types/zone'
import { getZoneColor } from '@/utils/zoneColors'
import { useProjectStore } from '@/store/useProjectStore'

interface ZoneListItemProps {
  zone: Zone
  isSelected: boolean
  onClick: (zoneId: string, event: React.MouseEvent) => void
  searchQuery?: string
}

// Highlight matching text in zone name
function HighlightedText({
  text,
  highlight,
}: {
  text: string
  highlight: string
}) {
  if (!highlight) return <>{text}</>

  const parts = text.split(new RegExp(`(${highlight})`, 'gi'))
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={index} className="bg-yellow-200 text-inherit">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

export function ZoneListItem({
  zone,
  isSelected,
  onClick,
  searchQuery = '',
}: ZoneListItemProps) {
  const updateZone = useProjectStore((state) => state.updateZone)
  const color = zone.metadata.color || getZoneColor(zone.type)
  const isVisible = zone.metadata.isVisible
  const isLocked = zone.metadata.isLocked

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateZone(zone.id, {
      metadata: {
        ...zone.metadata,
        isVisible: !isVisible,
      },
    })
  }

  return (
    <div
      className={`group flex cursor-pointer items-center gap-2 px-4 py-1.5 transition-colors ${
        isSelected
          ? 'bg-blue-50 text-blue-900'
          : 'hover:bg-gray-50 text-gray-700'
      } ${!isVisible ? 'opacity-50' : ''}`}
      onClick={(e) => onClick(zone.id, e)}
    >
      {/* Color swatch */}
      <span
        className="h-3 w-3 flex-shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
      />

      {/* Zone name */}
      <span className="min-w-0 flex-1 truncate text-sm">
        <HighlightedText text={zone.name} highlight={searchQuery} />
      </span>

      {/* Lock indicator */}
      {isLocked && (
        <span title="Locked">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
        </span>
      )}

      {/* Visibility toggle */}
      <button
        onClick={handleVisibilityToggle}
        className={`flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
          isSelected ? 'opacity-100' : ''
        } hover:bg-gray-200`}
        title={isVisible ? 'Hide zone' : 'Show zone'}
      >
        {isVisible ? (
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
        ) : (
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
        )}
      </button>
    </div>
  )
}
