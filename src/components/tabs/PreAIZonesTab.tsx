/**
 * Tab content for programmatic zone generation
 */

import { useState } from 'react'
import { useProgrammaticZones } from '@/hooks/useProgrammaticZones'
import { useConfigStore } from '@/store/useConfigStore'
import type { GenerationOptions } from '@/services/programmaticZoneGenerator'

export function PreAIZonesTab() {
  // Generation options
  const [generateAisles, setGenerateAisles] = useState(true)
  const [generateTravelLanes, setGenerateTravelLanes] = useState(true)

  // Config store for counts
  const tdoaPairs = useConfigStore((s) => s.tdoaPairs)
  const coveragePolygons = useConfigStore((s) => s.coveragePolygons)
  const hasRequiredData = useConfigStore((s) => s.hasRequiredData)

  // Programmatic zones hook
  const {
    programmaticZones,
    status,
    error,
    generateZones,
    clearZones,
    canGenerate,
    validationErrors,
  } = useProgrammaticZones()

  // Count 1D pairs (aisles) and 2D coverage (travel lanes)
  const aislePairCount = tdoaPairs.filter((p) => p.Dimension === '1D').length
  const travelLaneCoverageCount = coveragePolygons.filter(
    (p) => p.type === '2D' && !p.exclusion
  ).length

  // Count generated zones by type
  const aisleZoneCount = programmaticZones.filter((z) => z.source === 'tdoa').length
  const travelLaneZoneCount = programmaticZones.filter(
    (z) => z.source === 'coverage'
  ).length

  const isGenerating = status === 'generating'
  const hasZones = programmaticZones.length > 0

  const handleGenerate = async () => {
    const options: Partial<GenerationOptions> = {
      generateAisles,
      generateTravelLanes,
      includeExclusions: false,
    }
    await generateZones(options)
  }

  return (
    <div className="p-4 space-y-4">
      {/* Section Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Programmatic Zone Detection
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Generate zones from TDOA and coverage configuration data
        </p>
      </div>

      {/* Config Status */}
      {!hasRequiredData() && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-xs text-yellow-800">
            Load floorplan configuration files to enable zone generation.
          </p>
        </div>
      )}

      {/* Source Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={generateAisles}
            onChange={(e) => setGenerateAisles(e.target.checked)}
            disabled={!canGenerate || isGenerating}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-700">
            1D TDOA Pairs (Aisles)
            {aislePairCount > 0 && (
              <span className="ml-1 text-gray-500">({aislePairCount} pairs)</span>
            )}
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={generateTravelLanes}
            onChange={(e) => setGenerateTravelLanes(e.target.checked)}
            disabled={!canGenerate || isGenerating}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-700">
            2D Coverage (Travel Lanes)
            {travelLaneCoverageCount > 0 && (
              <span className="ml-1 text-gray-500">
                ({travelLaneCoverageCount} polygons)
              </span>
            )}
          </span>
        </label>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && canGenerate && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
          <p className="text-xs font-medium text-orange-800">Warnings:</p>
          <ul className="text-xs text-orange-700 mt-1 list-disc list-inside">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating || (!generateAisles && !generateTravelLanes)}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
            canGenerate && !isGenerating && (generateAisles || generateTravelLanes)
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating...
            </span>
          ) : (
            'Generate Zones'
          )}
        </button>

        <button
          onClick={clearZones}
          disabled={!hasZones || isGenerating}
          className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${
            hasZones && !isGenerating
              ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          Clear
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs font-medium text-red-800">Generation Error</p>
          <p className="text-xs text-red-700 mt-1">{error}</p>
        </div>
      )}

      {/* Generated Zone Count */}
      {hasZones && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-xs font-medium text-green-800">Generated Zones</p>
          <p className="text-xs text-green-700 mt-1">
            {aisleZoneCount > 0 && `${aisleZoneCount} aisle zones`}
            {aisleZoneCount > 0 && travelLaneZoneCount > 0 && ', '}
            {travelLaneZoneCount > 0 && `${travelLaneZoneCount} travel lane zones`}
          </p>
          <p className="text-xs text-green-600 mt-1">
            Total: {programmaticZones.length} zones
          </p>
        </div>
      )}
    </div>
  )
}
