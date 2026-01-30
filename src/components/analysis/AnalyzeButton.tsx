import { useBlockedAreaAnalysis } from '@/hooks/useBlockedAreaAnalysis'
import { useProjectStore } from '@/store/useProjectStore'
import { useConfigStore } from '@/store/useConfigStore'
import { useSettingsStore } from '@/store/useSettingsStore'

interface AnalyzeButtonProps {
  onOpenSettings?: () => void
}

export function AnalyzeButton({ onOpenSettings }: AnalyzeButtonProps) {
  const { analyze, cancel, isAnalyzing } = useBlockedAreaAnalysis()
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const aiBlockedZonesError = useProjectStore((state) => state.aiBlockedZonesError)
  const coveragePolygons = useConfigStore((state) => state.coveragePolygons)
  const floorplanConfig = useConfigStore((state) => state.floorplanConfig)
  const anthropicApiKey = useSettingsStore((state) => state.anthropicApiKey)

  // Check for env variable as fallback (blocked area detection uses Anthropic only)
  const hasEnvKey = !!(import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)
  const hasApiKey = !!anthropicApiKey || hasEnvKey

  const hasImage = dataUrl !== null
  const hasConfig = floorplanConfig !== null
  const has2DCoverage = coveragePolygons.filter(
    (cp) => cp.type === '2D' && !cp.exclusion
  ).length > 0

  const canAnalyze = hasImage && hasConfig && has2DCoverage && hasApiKey

  const handleClick = () => {
    if (isAnalyzing) {
      cancel()
    } else if (!hasApiKey && onOpenSettings) {
      onOpenSettings()
    } else {
      analyze()
    }
  }

  const getButtonText = () => {
    if (isAnalyzing) return 'Cancel'
    if (!hasApiKey) return 'Configure API Key'
    if (!hasConfig) return 'Load Config First'
    if (!has2DCoverage) return 'No 2D Coverage'
    return 'Detect Blocked Areas'
  }

  const getButtonTooltip = () => {
    if (!hasImage) return 'Load an image first'
    if (!hasConfig) return 'Load floorplan configuration (floorplans.json) first'
    if (!has2DCoverage) return 'No 2D coverage polygons found in coverage.json'
    if (!hasApiKey) return 'Configure Anthropic API key in Settings'
    return 'Analyze 2D coverage areas to detect blocked regions'
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

    if (!hasApiKey) {
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
            d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
          />
        </svg>
      )
    }

    // AI/Analysis icon
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
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleClick}
        disabled={!canAnalyze && !isAnalyzing && hasApiKey}
        className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors ${
          (!canAnalyze && !isAnalyzing && hasApiKey)
            ? 'cursor-not-allowed bg-gray-300 text-gray-500'
            : isAnalyzing
              ? 'bg-error text-white hover:bg-error/90'
              : hasApiKey
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-warning text-black hover:bg-warning/90'
        }`}
        title={getButtonTooltip()}
      >
        {getButtonIcon()}
        <span>{getButtonText()}</span>
      </button>

      {aiBlockedZonesError && (
        <div className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
          {aiBlockedZonesError}
        </div>
      )}
    </div>
  )
}
