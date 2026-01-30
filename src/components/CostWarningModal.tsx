import { useState } from 'react'
import type { CostEstimate } from '@/services/costEstimator'
import { formatCost, getCostWarningText } from '@/services/costEstimator'

interface CostWarningModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Cost estimate to display */
  estimate: CostEstimate
  /** Called when user confirms and wants to proceed */
  onProceed: () => void
  /** Called when user cancels */
  onCancel: () => void
  /** Called when user checks "Don't show again" */
  onDontShowAgain?: (checked: boolean) => void
}

/**
 * Modal warning about estimated API costs before analysis
 * Shows breakdown and allows user to proceed or cancel
 */
export function CostWarningModal({
  isOpen,
  estimate,
  onProceed,
  onCancel,
  onDontShowAgain,
}: CostWarningModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  if (!isOpen) return null

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked)
    onDontShowAgain?.(checked)
  }

  const handleProceed = () => {
    onProceed()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Confirm Analysis Cost
          </h2>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600">{getCostWarningText(estimate)}</p>

          {/* Cost Breakdown */}
          <div className="mt-4 rounded-lg bg-gray-50 p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">
              Cost Breakdown
            </h3>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Main Agent (zone detection)</span>
                <span className="font-medium text-gray-900">
                  {formatCost(estimate.mainAgent)}
                </span>
              </div>
              {estimate.estimatedSubAgents > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Sub-Agents ({estimate.estimatedSubAgents} x{' '}
                    {formatCost(estimate.subAgents / estimate.estimatedSubAgents)})
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCost(estimate.subAgents)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm">
                <span className="font-medium text-gray-700">Estimated Total</span>
                <span className="font-semibold text-gray-900">
                  {estimate.formatted}
                </span>
              </div>
            </div>
          </div>

          {/* Info Note */}
          <p className="mt-3 text-xs text-gray-500">
            Actual costs may vary based on image complexity and number of detected
            racking areas. Sub-agent analysis only runs for areas needing detailed
            aisle detection.
          </p>

          {/* Don't show again checkbox */}
          {onDontShowAgain && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => handleDontShowAgainChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-gray-600">Don't show this warning again</span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Proceed with Analysis
          </button>
        </div>
      </div>
    </div>
  )
}
