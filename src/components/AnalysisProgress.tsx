import type {
  BlockedAreaProgress,
  BlockedAreaAnalysisStage,
} from '@/hooks/useBlockedAreaAnalysis'

interface AnalysisProgressProps {
  progress: BlockedAreaProgress
  onCancel?: () => void
}

/**
 * Progress display for blocked area analysis
 * Shows stages: Cropping -> Analyzing -> Transforming -> Complete
 */
export function AnalysisProgress({ progress, onCancel }: AnalysisProgressProps) {
  const stages: { id: BlockedAreaAnalysisStage; label: string }[] = [
    { id: 'cropping', label: 'Cropping coverage areas' },
    { id: 'analyzing', label: 'Detecting blocked areas' },
    { id: 'transforming', label: 'Transforming coordinates' },
  ]

  const getStageStatus = (
    stageId: BlockedAreaAnalysisStage
  ): 'pending' | 'current' | 'completed' => {
    const stageOrder: BlockedAreaAnalysisStage[] = [
      'idle',
      'cropping',
      'analyzing',
      'transforming',
      'complete',
      'error',
    ]
    const currentIndex = stageOrder.indexOf(progress.stage)
    const stageIndex = stageOrder.indexOf(stageId)

    if (progress.stage === 'complete') return 'completed'
    if (progress.stage === 'error') {
      return stageIndex < currentIndex ? 'completed' : 'pending'
    }
    if (stageIndex < currentIndex) return 'completed'
    if (stageIndex === currentIndex) return 'current'
    return 'pending'
  }

  const isError = progress.stage === 'error'
  const isComplete = progress.stage === 'complete'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {isError
            ? 'Analysis Failed'
            : isComplete
              ? 'Analysis Complete'
              : 'Detecting Blocked Areas'}
        </h3>
        {onCancel && progress.stage !== 'complete' && !isError && (
          <button
            onClick={onCancel}
            className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full transition-all duration-300 ${
              isError ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>{progress.message}</span>
          <span>{Math.round(progress.progressPercent)}%</span>
        </div>
      </div>

      {/* Stage List */}
      <div className="space-y-2">
        {stages.map((stage) => {
          const status = getStageStatus(stage.id)
          const isAnalyzingStage = stage.id === 'analyzing'
          const showAreaProgress =
            isAnalyzingStage &&
            status === 'current' &&
            progress.totalAreas > 0

          return (
            <div key={stage.id} className="flex items-center gap-2">
              {/* Status Icon */}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  status === 'completed'
                    ? 'bg-green-100 text-green-600'
                    : status === 'current'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {status === 'completed' ? (
                  '\u2713'
                ) : status === 'current' ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                ) : (
                  '\u25CB'
                )}
              </span>

              {/* Stage Label */}
              <span
                className={`flex-1 text-sm ${
                  status === 'completed'
                    ? 'text-gray-500'
                    : status === 'current'
                      ? 'font-medium text-gray-900'
                      : 'text-gray-400'
                }`}
              >
                {stage.label}
                {showAreaProgress && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({progress.currentArea} of {progress.totalAreas})
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {/* Area messages */}
      {progress.areaMessages && progress.areaMessages.length > 0 && (
        <div className="mt-3 rounded bg-gray-50 p-2">
          <div className="max-h-24 overflow-y-auto text-xs text-gray-600">
            {progress.areaMessages.slice(-4).map((msg, idx) => (
              <div key={idx} className="py-0.5">
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="mt-3 rounded bg-red-50 p-3">
          <p className="text-sm text-red-700">{progress.message}</p>
        </div>
      )}

      {/* Success state */}
      {isComplete && (
        <div className="mt-3 rounded bg-green-50 p-3">
          <p className="text-sm text-green-700">{progress.message}</p>
        </div>
      )}
    </div>
  )
}
