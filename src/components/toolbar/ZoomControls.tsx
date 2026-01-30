import { useProjectStore } from '@/store/useProjectStore'
import { ZOOM_MIN, ZOOM_MAX } from '@/types/store'

export function ZoomControls() {
  const zoom = useProjectStore((state) => state.zoom)
  const zoomIn = useProjectStore((state) => state.zoomIn)
  const zoomOut = useProjectStore((state) => state.zoomOut)
  const resetZoom = useProjectStore((state) => state.resetZoom)
  const setZoom = useProjectStore((state) => state.setZoom)

  const zoomPercentage = Math.round(zoom * 100)

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setZoom(parseFloat(e.target.value))
  }

  return (
    <div className="flex items-center gap-2">
      {/* Zoom Out Button */}
      <button
        onClick={zoomOut}
        disabled={zoom <= ZOOM_MIN}
        className="flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent"
        title="Zoom out (-)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      </button>

      {/* Zoom Slider */}
      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={0.1}
        value={zoom}
        onChange={handleSliderChange}
        className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-gray-300 accent-primary"
        title={`Zoom: ${zoomPercentage}%`}
      />

      {/* Zoom In Button */}
      <button
        onClick={zoomIn}
        disabled={zoom >= ZOOM_MAX}
        className="flex h-8 w-8 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent"
        title="Zoom in (+)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      </button>

      {/* Zoom Percentage Display */}
      <button
        onClick={resetZoom}
        className="min-w-[52px] rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
        title="Reset zoom (0)"
      >
        {zoomPercentage}%
      </button>
    </div>
  )
}
