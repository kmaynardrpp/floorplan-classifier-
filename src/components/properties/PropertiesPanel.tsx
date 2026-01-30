import { useProjectStore } from '@/store/useProjectStore'
import { getZoneColor } from '@/utils/zoneColors'

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatZoneType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function PropertiesPanel() {
  const selectedZoneIds = useProjectStore((state) => state.selectedZoneIds)
  const zones = useProjectStore((state) => state.zones)

  // Get selected zones
  const selectedZones = zones.filter((z) => selectedZoneIds.includes(z.id))

  // Don't show panel if nothing is selected
  if (selectedZones.length === 0) {
    return null
  }

  // Single selection view
  if (selectedZones.length === 1) {
    const zone = selectedZones[0]!
    const color = zone.metadata.color ?? getZoneColor(zone.type)

    return (
      <div className="flex h-full w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Properties</h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Zone Name */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Name
            </label>
            <div className="text-sm font-medium text-gray-900">{zone.name}</div>
          </div>

          {/* Zone Type with color badge */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Type
            </label>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm text-gray-900">
                {formatZoneType(zone.type)}
              </span>
            </div>
          </div>

          {/* Source */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Source
            </label>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                zone.source === 'ai'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {zone.source === 'ai' ? 'AI-detected' : 'Manual'}
            </span>
          </div>

          {/* Confidence (AI zones only) */}
          {zone.source === 'ai' && zone.confidence !== null && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Confidence
              </label>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${zone.confidence * 100}%` }}
                  />
                </div>
                <span className="text-sm text-gray-700">
                  {Math.round(zone.confidence * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Vertex Count */}
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Vertices
            </label>
            <div className="text-sm text-gray-900">
              {zone.vertices.length} points
            </div>
          </div>

          {/* Description (if any) */}
          {zone.metadata.description && (
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Description
              </label>
              <div className="text-sm text-gray-700">
                {zone.metadata.description}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="border-t border-gray-100 pt-4">
            <div className="mb-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Created
              </label>
              <div className="text-xs text-gray-500">
                {formatTimestamp(zone.createdAt)}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Updated
              </label>
              <div className="text-xs text-gray-500">
                {formatTimestamp(zone.updatedAt)}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Multi-selection view
  const types = [...new Set(selectedZones.map((z) => z.type))]
  const commonType = types.length === 1 ? types[0] : null
  const aiCount = selectedZones.filter((z) => z.source === 'ai').length
  const manualCount = selectedZones.length - aiCount

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {selectedZones.length} zones selected
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Common Type (if all same type) */}
        {commonType && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Type
            </label>
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: getZoneColor(commonType) }}
              />
              <span className="text-sm text-gray-900">
                {formatZoneType(commonType)}
              </span>
            </div>
          </div>
        )}

        {/* Mixed Types */}
        {!commonType && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Types
            </label>
            <div className="text-sm text-gray-700">
              {types.length} different types
            </div>
          </div>
        )}

        {/* Source breakdown */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Source
          </label>
          <div className="flex flex-wrap gap-2">
            {aiCount > 0 && (
              <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                {aiCount} AI-detected
              </span>
            )}
            {manualCount > 0 && (
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                {manualCount} Manual
              </span>
            )}
          </div>
        </div>

        {/* Total Vertices */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            Total Vertices
          </label>
          <div className="text-sm text-gray-900">
            {selectedZones.reduce((sum, z) => sum + z.vertices.length, 0)} points
          </div>
        </div>
      </div>
    </div>
  )
}
