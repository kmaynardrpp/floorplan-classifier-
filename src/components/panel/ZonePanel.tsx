import { useState } from 'react'
import { useProjectStore } from '@/store/useProjectStore'
import { ZoneTypeGroup } from './ZoneTypeGroup'
import { ZoneTreeItem } from './ZoneTreeItem'
import { TravelabilityFilter } from './TravelabilityFilter'
import { ConfigFileLoader } from '@/components/config'
import { ZoneImportExport } from '@/components/zones'
import { TabBar, AIToggle, TabContent } from '@/components/tabs'
import {
  buildZoneTree,
  filterTreeByTravelability,
  countZonesByTravelability,
} from '@/utils/zoneHierarchy'
import type { Zone, ZoneType } from '@/types/zone'
import type { TravelabilityFilter as FilterType } from '@/types/store'

interface ZonePanelProps {
  collapsed?: boolean
  onToggleCollapse?: () => void
}

type ViewMode = 'tree' | 'list'

// Group zones by type
function groupZonesByType(zones: Zone[]): Map<ZoneType, Zone[]> {
  const groups = new Map<ZoneType, Zone[]>()

  zones.forEach((zone) => {
    const existing = groups.get(zone.type) || []
    groups.set(zone.type, [...existing, zone])
  })

  return groups
}

export function ZonePanel({ collapsed = false, onToggleCollapse }: ZonePanelProps) {
  const zones = useProjectStore((state) => state.zones)
  const selectedZoneIds = useProjectStore((state) => state.selectedZoneIds)
  const selectZone = useProjectStore((state) => state.selectZone)
  const toggleZoneSelection = useProjectStore((state) => state.toggleZoneSelection)

  // Zone hierarchy state
  const expandedZoneIds = useProjectStore((state) => state.expandedZoneIds)
  const travelabilityFilter = useProjectStore((state) => state.travelabilityFilter)
  const toggleZoneExpanded = useProjectStore((state) => state.toggleZoneExpanded)
  const setTravelabilityFilter = useProjectStore((state) => state.setTravelabilityFilter)

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<ZoneType>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>('tree')

  // Filter zones by search query
  const searchFilteredZones = searchQuery
    ? zones.filter((zone) =>
        zone.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : zones

  // For list view - group filtered zones by type
  const groupedZones = groupZonesByType(searchFilteredZones)

  // For tree view - build hierarchy and filter by travelability
  const travelabilityCounts = countZonesByTravelability(zones)
  const fullTree = buildZoneTree(searchFilteredZones)
  const filteredTree = filterTreeByTravelability(fullTree, travelabilityFilter)

  // Check if a zone is expanded in tree view
  const isZoneExpanded = (zoneId: string) => expandedZoneIds.includes(zoneId)

  // Toggle group expansion
  const toggleGroup = (type: ZoneType) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Handle zone click
  const handleZoneClick = (zoneId: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      toggleZoneSelection(zoneId)
    } else {
      selectZone(zoneId)
    }
  }

  // Expand all groups by default if not explicitly collapsed
  const isGroupExpanded = (type: ZoneType) => {
    // Default to expanded unless explicitly collapsed
    return !expandedGroups.has(type)
  }

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="rounded p-2 text-gray-500 hover:bg-gray-100"
          title="Expand panel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5"
            />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Zones</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {zones.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Collapse panel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <TabBar />
          <AIToggle />
        </div>
      </div>

      {/* Tab Content */}
      <TabContent />

      {/* Config File Loader */}
      <ConfigFileLoader />

      {/* Import/Export */}
      <div className="border-t border-gray-200 px-4 py-2">
        <ZoneImportExport />
      </div>

      {/* Search Input */}
      <div className="border-b border-gray-200 px-4 py-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Search zones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* View Mode Toggle & Travelability Filter */}
      <div className="border-b border-gray-200 px-4 py-2 space-y-2">
        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">View</span>
          <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
            <button
              onClick={() => setViewMode('tree')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Hierarchical tree view"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"
                />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Group by type"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Travelability Filter (only in tree view) */}
        {viewMode === 'tree' && (
          <TravelabilityFilter
            value={travelabilityFilter}
            onChange={(filter: FilterType) => setTravelabilityFilter(filter)}
            counts={travelabilityCounts}
          />
        )}
      </div>

      {/* Zone List */}
      <div className="flex-1 overflow-y-auto">
        {zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="mb-2 h-8 w-8 text-gray-300"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
              />
            </svg>
            <p className="text-sm text-gray-500">No zones yet</p>
            <p className="mt-1 text-xs text-gray-400">
              Draw zones or analyze the floorplan
            </p>
          </div>
        ) : searchFilteredZones.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
            <p className="text-sm text-gray-500">No zones match "{searchQuery}"</p>
          </div>
        ) : viewMode === 'tree' ? (
          /* Tree View */
          <div className="py-2">
            {filteredTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  No {travelabilityFilter === 'travelable' ? 'travelable' : 'blocked'} zones
                </p>
              </div>
            ) : (
              filteredTree.map((node) => (
                <ZoneTreeItem
                  key={node.zone.id}
                  node={node}
                  isSelected={selectedZoneIds.includes(node.zone.id)}
                  isExpanded={isZoneExpanded(node.zone.id)}
                  onSelect={handleZoneClick}
                  onToggleExpand={toggleZoneExpanded}
                  searchQuery={searchQuery}
                />
              ))
            )}
          </div>
        ) : (
          /* List View (group by type) */
          <div className="py-2">
            {Array.from(groupedZones.entries()).map(([type, typeZones]) => (
              <ZoneTypeGroup
                key={type}
                type={type}
                zones={typeZones}
                isExpanded={isGroupExpanded(type)}
                onToggle={() => toggleGroup(type)}
                selectedZoneIds={selectedZoneIds}
                onZoneClick={handleZoneClick}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
