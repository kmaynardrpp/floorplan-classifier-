/**
 * Toggle checkbox for AI detection mode
 */

import { useProjectStore } from '@/store/useProjectStore'

export function AIToggle() {
  const useAIDetection = useProjectStore((s) => s.useAIDetection)
  const setUseAIDetection = useProjectStore((s) => s.setUseAIDetection)

  return (
    <label
      className="flex items-center gap-2 cursor-pointer group"
      title="Enable AI-powered zone detection. Disable for pure programmatic detection."
    >
      <div className="relative">
        <input
          type="checkbox"
          checked={useAIDetection}
          onChange={(e) => setUseAIDetection(e.target.checked)}
          className="sr-only peer"
        />
        <div
          className={`w-9 h-5 rounded-full transition-colors ${
            useAIDetection ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            useAIDetection ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">
        AI Detection
      </span>
      {useAIDetection && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="h-3.5 w-3.5 text-blue-600"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
          />
        </svg>
      )}
    </label>
  )
}
