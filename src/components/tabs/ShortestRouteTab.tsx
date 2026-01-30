/**
 * Tab for route calculator functionality
 * Allows setting start/end points and calculates shortest path
 */

import { useRouteSelection } from '@/hooks/useRouteSelection'
import { useRouteCalculator } from '@/hooks/useRouteCalculator'
import { useProjectStore } from '@/store/useProjectStore'

/**
 * Format distance for display
 */
function formatDistance(pixels: number, scale?: number): string {
  if (scale && scale > 0) {
    // Convert to meters using scale
    const meters = pixels * scale
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`
    }
    return `${meters.toFixed(1)} m`
  }
  // Return pixels if no scale available
  return `${pixels.toFixed(0)} px`
}

export function ShortestRouteTab() {
  const { startPoint, endPoint, selectionState, reset: resetSelection } = useRouteSelection()
  const { calculate, isCalculating, route, error, canCalculate } = useRouteCalculator()
  const hasImage = useProjectStore((s) => s.dataUrl !== null)

  // Handle calculate button click
  const handleCalculate = async () => {
    await calculate()
  }

  // Handle clear button click
  const handleClear = () => {
    resetSelection()
  }

  // Get status text for current selection state
  const getSelectionStatusText = () => {
    switch (selectionState) {
      case 'waiting-for-start':
        return 'Click on the map to set start point'
      case 'waiting-for-end':
        return 'Click on the map to set end point'
      case 'complete':
        return 'Both points set - ready to calculate'
      default:
        return ''
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Section Header */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Route Calculator</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Click two points on the map to calculate the shortest route through travelable zones.
        </p>
      </div>

      {/* No image warning */}
      {!hasImage && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-xs font-medium text-yellow-800">No Image Loaded</p>
          <p className="text-xs text-yellow-700 mt-1">
            Upload a floorplan image to use the route calculator.
          </p>
        </div>
      )}

      {/* Selection Status */}
      {hasImage && (
        <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">{getSelectionStatusText()}</p>
        </div>
      )}

      {/* Point Selection */}
      <div className="space-y-2">
        {/* Start Point */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
          <div
            className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
              startPoint ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-500'
            }`}
          >
            A
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700">Start Point</p>
            {startPoint ? (
              <p className="text-xs text-green-600">
                ({startPoint.x.toFixed(0)}, {startPoint.y.toFixed(0)})
              </p>
            ) : (
              <p className="text-xs text-gray-400">Click on map to set...</p>
            )}
          </div>
        </div>

        {/* End Point */}
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
          <div
            className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
              endPoint ? 'bg-red-500 text-white' : 'bg-gray-300 text-gray-500'
            }`}
          >
            B
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-700">End Point</p>
            {endPoint ? (
              <p className="text-xs text-red-600">
                ({endPoint.x.toFixed(0)}, {endPoint.y.toFixed(0)})
              </p>
            ) : (
              <p className="text-xs text-gray-400">Click on map to set...</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleCalculate}
          disabled={!canCalculate || !hasImage}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
            canCalculate && hasImage
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isCalculating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Calculating...
            </span>
          ) : (
            'Calculate Route'
          )}
        </button>
        <button
          onClick={handleClear}
          disabled={!startPoint && !endPoint && !route}
          className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
            startPoint || endPoint || route
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Clear
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs font-medium text-red-800">Error</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Route Result */}
      {route && (
        <div
          className={`p-3 border rounded-md ${
            route.success
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          {route.success ? (
            <>
              <p className="text-xs font-medium text-green-800">Route Found</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-green-700">Distance:</span>
                  <span className="text-sm font-semibold text-green-900">
                    {formatDistance(route.totalDistance)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-green-700">Waypoints:</span>
                  <span className="text-sm font-semibold text-green-900">
                    {route.points.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-green-700">Segments:</span>
                  <span className="text-sm font-semibold text-green-900">
                    {route.segments.length}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-yellow-800">Route Not Found</p>
              <p className="text-xs text-yellow-700 mt-1">
                {route.error || 'Unable to find a path between the selected points.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* No Route Yet */}
      {!route && !error && hasImage && selectionState === 'complete' && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs font-medium text-gray-700">Ready to Calculate</p>
          <p className="text-xs text-gray-500 mt-1">
            Click "Calculate Route" to find the shortest path between the selected points.
          </p>
        </div>
      )}

      {/* Help Text */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
        <p className="text-xs font-medium text-gray-700">How It Works</p>
        <ul className="text-xs text-gray-500 mt-2 list-disc list-inside space-y-1">
          <li>Routes traverse through travelable zones only</li>
          <li>Uses A* pathfinding algorithm</li>
          <li>Click anywhere to set new points (3rd click resets)</li>
          <li>Generate zones first for accurate routing</li>
        </ul>
      </div>
    </div>
  )
}
