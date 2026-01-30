import { getZoneColor } from '@/utils/zoneColors'
import { isTravelable } from '@/types/zone'
import { getDirectionDisplay } from '@/utils/zoneHierarchy'
import type { ZoneTreeNode } from '@/utils/zoneHierarchy'

interface ZoneTreeItemProps {
  node: ZoneTreeNode
  isSelected: boolean
  isExpanded: boolean
  onSelect: (zoneId: string, event: React.MouseEvent) => void
  onToggleExpand: (zoneId: string) => void
  searchQuery?: string
}

/**
 * A single zone item in the hierarchical tree view
 * Shows travelability indicator, direction arrow, and expand/collapse for parent zones
 */
export function ZoneTreeItem({
  node,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  searchQuery = '',
}: ZoneTreeItemProps) {
  const { zone, children, depth } = node
  const hasChildren = children.length > 0
  const travelable = isTravelable(zone.type)
  const direction = zone.metadata.customProperties.direction as string | undefined
  const color = zone.metadata.color ?? getZoneColor(zone.type)

  // Highlight search matches
  const highlightMatch = (text: string) => {
    if (!searchQuery) return text
    const index = text.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (index === -1) return text
    const before = text.slice(0, index)
    const match = text.slice(index, index + searchQuery.length)
    const after = text.slice(index + searchQuery.length)
    return (
      <>
        {before}
        <span className="bg-yellow-200 text-yellow-900">{match}</span>
        {after}
      </>
    )
  }

  return (
    <div>
      {/* Zone item row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-gray-50 ${
          isSelected ? 'bg-blue-50 hover:bg-blue-100' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={(e) => onSelect(zone.id, e)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(zone.id)
            }}
            className="flex h-4 w-4 items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Color chip */}
        <span
          className="h-3 w-3 flex-shrink-0 rounded-sm"
          style={{ backgroundColor: color }}
        />

        {/* Zone name */}
        <span
          className={`flex-1 truncate text-sm ${
            isSelected ? 'font-medium text-blue-900' : 'text-gray-700'
          }`}
          title={zone.name}
        >
          {highlightMatch(zone.name)}
        </span>

        {/* Travelable indicator */}
        <span
          className={`flex h-4 w-4 items-center justify-center rounded text-xs font-bold ${
            travelable
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
          title={travelable ? 'Travelable' : 'Non-travelable'}
        >
          {travelable ? '\u2713' : '\u2715'}
        </span>

        {/* Direction indicator */}
        {direction && (
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-700"
            title={`Direction: ${direction}`}
          >
            {getDirectionDisplay(direction)}
          </span>
        )}
      </div>

      {/* Children (if expanded) */}
      {hasChildren && isExpanded && (
        <div>
          {children.map((childNode) => (
            <ZoneTreeItemRecursive
              key={childNode.zone.id}
              node={childNode}
              isSelected={false} // Will be passed by parent
              isExpanded={true}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Recursive wrapper that uses the actual selection state
 * This is used for child nodes
 */
interface ZoneTreeItemRecursiveProps extends Omit<ZoneTreeItemProps, 'isSelected' | 'isExpanded'> {
  isSelected?: boolean
  isExpanded?: boolean
}

function ZoneTreeItemRecursive({
  node,
  onSelect,
  onToggleExpand,
  searchQuery,
}: ZoneTreeItemRecursiveProps) {
  // These will be connected to the store in the parent component
  return (
    <ZoneTreeItem
      node={node}
      isSelected={false}
      isExpanded={true}
      onSelect={onSelect}
      onToggleExpand={onToggleExpand}
      searchQuery={searchQuery}
    />
  )
}
