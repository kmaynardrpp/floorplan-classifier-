/**
 * Tab content for AI-powered zone analysis
 *
 * Shows the combined view of:
 * - 1D aisles (from TDOA data - programmatic)
 * - 2D coverage areas as travel lanes (from coverage.json)
 * - Blocked areas (AI-detected within 2D coverage regions)
 */

import { useProjectStore } from '@/store/useProjectStore'
import { AnalyzeButton } from '@/components/analysis/AnalyzeButton'
import { TravelLaneAnalyzeButton } from '@/components/analysis/TravelLaneAnalyzeButton'
import { isTravelable } from '@/types/zone'

export function PostAIZonesTab() {
  const useAIDetection = useProjectStore((s) => s.useAIDetection)
  const analysisStatus = useProjectStore((s) => s.analysisStatus)
  const zones = useProjectStore((s) => s.zones)
  const programmaticZones = useProjectStore((s) => s.programmaticZones)
  const aiBlockedZones = useProjectStore((s) => s.aiBlockedZones)
  const aiBlockedZonesStatus = useProjectStore((s) => s.aiBlockedZonesStatus)
  const combinedZones = useProjectStore((s) => s.combinedZones)

  // Count zones by type
  const aiZoneCount = zones.filter((z) => z.source === 'ai').length
  const manualZoneCount = zones.filter((z) => z.source === 'manual').length

  // Count programmatic zones by type
  const aisleCount = programmaticZones.filter((z) => z.type === 'aisle_path').length
  const travelLaneCount = programmaticZones.filter((z) => z.type === 'travel_lane').length
  const blockedAreaCount = aiBlockedZones.length

  // Count combined zones
  const combinedTravelable = combinedZones.filter((z) => isTravelable(z.type)).length
  const combinedBlocked = combinedZones.filter((z) => z.type === 'blocked_area').length

  // AI Detection disabled message
  if (!useAIDetection) {
    return (
      <div className="p-4">
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="mx-auto h-8 w-8 text-gray-400 mb-2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700">AI Detection Disabled</p>
          <p className="text-xs text-gray-500 mt-1">
            Enable AI detection using the toggle above to use AI-powered zone analysis.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Section Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Combined Zone View</h3>
        <p className="text-xs text-gray-500 mt-1">
          Programmatic aisles + AI-detected blocked areas
        </p>
      </div>

      {/* Analysis Controls */}
      <div className="space-y-4">
        {/* Blocked Area Detection (within 2D coverage) */}
        <div>
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Blocked Area Detection</h4>
          <AnalyzeButton />
        </div>

        {/* Travel Lane Detection (full image) */}
        <div className="pt-3 border-t border-gray-200">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Travel Lane Detection</h4>
          <TravelLaneAnalyzeButton />
        </div>
      </div>

      {/* Programmatic Zones Summary */}
      {(aisleCount > 0 || travelLaneCount > 0) && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-xs font-medium text-green-800">Programmatic Zones (TDOA)</p>
          <div className="text-xs text-green-700 mt-1 space-y-1">
            {aisleCount > 0 && (
              <p className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                {aisleCount} aisle paths (1D TDOA)
              </p>
            )}
            {travelLaneCount > 0 && (
              <p className="flex items-center gap-1">
                <span className="w-2 h-2 bg-cyan-500 rounded-full" />
                {travelLaneCount} travel lanes (2D coverage)
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI Blocked Zones Summary */}
      {aiBlockedZonesStatus === 'analyzing' && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-xs font-medium text-yellow-800">
            Analyzing 2D coverage regions...
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            AI is detecting blocked areas within coverage regions.
          </p>
        </div>
      )}

      {blockedAreaCount > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs font-medium text-red-800">AI-Detected Blocked Areas</p>
          <div className="text-xs text-red-700 mt-1">
            <p className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              {blockedAreaCount} blocked areas (obstacles, conveyors)
            </p>
          </div>
          <p className="text-xs text-red-600 mt-2">
            These areas are non-travelable and will be avoided in routing.
          </p>
        </div>
      )}

      {/* Legacy AI Zones (if any) */}
      {(aiZoneCount > 0 || manualZoneCount > 0) && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs font-medium text-blue-800">Legacy Detected Zones</p>
          <div className="text-xs text-blue-700 mt-1 space-y-1">
            {aiZoneCount > 0 && (
              <p className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-3 w-3"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                  />
                </svg>
                {aiZoneCount} AI-detected zones
              </p>
            )}
            {manualZoneCount > 0 && (
              <p className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-3 w-3"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                  />
                </svg>
                {manualZoneCount} manually drawn zones
              </p>
            )}
          </div>
        </div>
      )}

      {/* Combined Summary */}
      {combinedZones.length > 0 && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-md">
          <p className="text-xs font-medium text-purple-800">Combined Zone Summary</p>
          <div className="text-xs text-purple-700 mt-1 space-y-1">
            <p className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              {combinedTravelable} travelable zones (for routing)
            </p>
            <p className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              {combinedBlocked} blocked zones (obstacles)
            </p>
          </div>
          <p className="text-xs text-purple-600 mt-2">
            Total: {combinedZones.length} zones
          </p>
        </div>
      )}

      {/* Success Status */}
      {analysisStatus === 'success' && aiZoneCount === 0 && blockedAreaCount === 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-xs text-yellow-800">
            Analysis completed. No blocked areas detected in 2D coverage regions.
          </p>
        </div>
      )}

      {/* Tips */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>Zone sources:</p>
        <ul className="list-disc list-inside pl-2 space-y-0.5">
          <li>
            <span className="text-blue-600">Aisles</span>: From 1D TDOA anchor pairs
          </li>
          <li>
            <span className="text-cyan-600">Travel lanes</span>: From 2D coverage
            polygons
          </li>
          <li>
            <span className="text-red-600">Blocked areas</span>: AI-detected obstacles
          </li>
        </ul>
      </div>
    </div>
  )
}
