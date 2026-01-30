/**
 * Travel Lane Analyze Button
 *
 * Button to trigger intensive travel lane detection using Gemini AI.
 * Analyzes each 2D coverage area for travel lanes with precise boundary tracing.
 */

import { useTravelLaneAnalysis } from '@/hooks/useTravelLaneAnalysis'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import { useSettingsStore } from '@/store/useSettingsStore'

interface TravelLaneAnalyzeButtonProps {
  onOpenSettings?: () => void
}

export function TravelLaneAnalyzeButton({ onOpenSettings }: TravelLaneAnalyzeButtonProps) {
  const { analyze, cancel, isAnalyzing, progress, areaResults } = useTravelLaneAnalysis()
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const analysisError = useProjectStore((state) => state.analysisError)
  const geminiApiKey = useSettingsStore((state) => state.geminiApiKey)
  const useIntensiveTravelLaneDetection = useSettingsStore(
    (state) => state.useIntensiveTravelLaneDetection
  )
  const floorplanConfig = useConfigStore((state) => state.floorplanConfig)
  const coveragePolygons = useConfigStore((state) => state.coveragePolygons)

  // Check for env variable as fallback
  const hasEnvKey = !!(import.meta.env.VITE_GEMINI_API_KEY as string | undefined)
  const hasApiKey = !!geminiApiKey || hasEnvKey

  const hasImage = dataUrl !== null
  const hasConfig = floorplanConfig !== null
  const has2DCoverage = coveragePolygons.filter(
    (cp) => cp.type === '2D' && !cp.exclusion
  ).length > 0

  const canAnalyze = hasImage && hasConfig && has2DCoverage && hasApiKey && useIntensiveTravelLaneDetection

  const handleClick = () => {
    if (isAnalyzing) {
      cancel()
    } else if (!hasApiKey && onOpenSettings) {
      onOpenSettings()
    } else if (!useIntensiveTravelLaneDetection && onOpenSettings) {
      onOpenSettings()
    } else {
      analyze()
    }
  }

  const getButtonText = () => {
    if (isAnalyzing) return 'Cancel'
    if (!hasApiKey) return 'Configure Gemini Key'
    if (!useIntensiveTravelLaneDetection) return 'Enable in Settings'
    if (!hasConfig) return 'Load Config First'
    if (!has2DCoverage) return 'No 2D Coverage'
    return 'Detect Travel Lanes (Intensive)'
  }

  const getButtonTooltip = () => {
    if (!hasImage) return 'Load an image first'
    if (!hasApiKey) return 'Configure Gemini API key in Settings'
    if (!useIntensiveTravelLaneDetection) return 'Enable Intensive Travel Lane Detection in Settings'
    if (!hasConfig) return 'Load floorplan configuration (floorplans.json) first'
    if (!has2DCoverage) return 'No 2D coverage polygons found in coverage.json'
    return 'Intensive mode: Precise orange/gray boundary tracing for travel lanes in each 2D coverage area'
  }

  const getButtonIcon = () => {
    if (isAnalyzing) {
      return (
        <svg
          className="h-5 w-5 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
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
      )
    }

    if (!hasApiKey || !useIntensiveTravelLaneDetection) {
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      )
    }

    // Travel lane / road icon
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
        />
      </svg>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={!canAnalyze && !isAnalyzing && hasApiKey && useIntensiveTravelLaneDetection}
        className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
          (!canAnalyze && !isAnalyzing && hasApiKey && useIntensiveTravelLaneDetection)
            ? 'cursor-not-allowed bg-gray-300 text-gray-500'
            : isAnalyzing
              ? 'bg-error text-white hover:bg-error/90'
              : (hasApiKey && useIntensiveTravelLaneDetection)
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-warning text-black hover:bg-warning/90'
        }`}
        title={getButtonTooltip()}
      >
        {getButtonIcon()}
        <span>{getButtonText()}</span>
      </button>

      {/* Progress indicator */}
      {isAnalyzing && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-orange-800">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-orange-200">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium">{progress.progressPercent}%</span>
          </div>
          <p className="mt-1 text-xs text-orange-700">{progress.message}</p>
          {progress.currentArea > 0 && (
            <p className="mt-1 text-xs text-orange-600">
              Processing area {progress.currentArea} of {progress.totalAreas}
            </p>
          )}
        </div>
      )}

      {/* Results summary */}
      {!isAnalyzing && progress.stage === 'complete' && areaResults.length > 0 && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
          <p className="text-xs font-medium text-orange-800">
            Intensive Detection Complete
          </p>
          <div className="mt-1 space-y-1 text-xs text-orange-700">
            <p>Areas analyzed: {areaResults.length}</p>
            <p>Total travel lanes: {areaResults.reduce((sum, r) => sum + r.zones.length, 0)}</p>
            {progress.totalCoveragePercent !== undefined && (
              <p>Average coverage: {progress.totalCoveragePercent}%</p>
            )}
          </div>
          {progress.areaMessages.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-orange-600 cursor-pointer hover:underline">
                Show area details
              </summary>
              <ul className="mt-1 text-xs text-orange-600 space-y-0.5 pl-2">
                {progress.areaMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Error display */}
      {analysisError && !isAnalyzing && (
        <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
          {analysisError}
        </div>
      )}

      {/* Mode indicator */}
      {!isAnalyzing && (
        <p className="text-xs text-text-secondary">
          {useIntensiveTravelLaneDetection ? (
            <>
              <span className="font-medium text-orange-600">Intensive Mode:</span>{' '}
              Traces orange/gray boundaries in each 2D coverage area with verification passes.
            </>
          ) : (
            <>
              <span className="font-medium text-gray-500">Disabled:</span>{' '}
              Enable Intensive Travel Lane Detection in Settings to use this feature.
            </>
          )}
        </p>
      )}
    </div>
  )
}
