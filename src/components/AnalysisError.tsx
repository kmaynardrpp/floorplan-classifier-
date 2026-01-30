import { useState } from 'react'
import type { Zone } from '@/types/zone'

interface FailedZoneInfo {
  zoneId: string
  zoneName: string
  error: string
}

interface AnalysisErrorProps {
  /** Main error message */
  error: string
  /** List of zones that failed subdivision */
  failedZones?: FailedZoneInfo[]
  /** Called when user clicks retry for a specific zone */
  onRetryZone?: (zoneId: string) => void
  /** Called when user wants to retry all failed zones */
  onRetryAll?: () => void
  /** Called when user wants to continue with partial results */
  onContinue?: () => void
  /** Called when user wants to dismiss the error */
  onDismiss?: () => void
}

/**
 * Error recovery UI for failed analysis
 * Shows error details and offers retry/continue options
 */
export function AnalysisError({
  error,
  failedZones = [],
  onRetryZone,
  onRetryAll,
  onContinue,
  onDismiss,
}: AnalysisErrorProps) {
  const [showDetails, setShowDetails] = useState(false)
  const hasFailedZones = failedZones.length > 0

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
          !
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">Analysis Error</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-400 hover:text-red-600"
            title="Dismiss"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Failed Zones List */}
      {hasFailedZones && (
        <div className="mt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex w-full items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-90' : ''}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
            <span>
              {failedZones.length} zone{failedZones.length !== 1 ? 's' : ''}{' '}
              failed subdivision
            </span>
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2">
              {failedZones.map((zone) => (
                <div
                  key={zone.zoneId}
                  className="flex items-center justify-between rounded bg-red-100 px-3 py-2"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      {zone.zoneName}
                    </p>
                    <p className="text-xs text-red-600">{zone.error}</p>
                  </div>
                  {onRetryZone && (
                    <button
                      onClick={() => onRetryZone(zone.zoneId)}
                      className="ml-2 rounded bg-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-300"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {hasFailedZones && onRetryAll && (
          <button
            onClick={onRetryAll}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry All Failed
          </button>
        )}
        {hasFailedZones && onContinue && (
          <button
            onClick={onContinue}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Continue with Partial Results
          </button>
        )}
        {!hasFailedZones && onRetryAll && (
          <button
            onClick={onRetryAll}
            className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry Analysis
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Helper function to extract failed zone info from zones
 */
export function getFailedZonesFromZones(zones: Zone[]): FailedZoneInfo[] {
  return zones
    .filter((z) => z.metadata.customProperties.subdivisionFailed === 'true')
    .map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      error:
        (z.metadata.customProperties.subdivisionError as string) ||
        'Unknown error',
    }))
}
