import { useProjectStore } from '@/store/useProjectStore'

export function ImageInfo() {
  const filename = useProjectStore((state) => state.filename)
  const width = useProjectStore((state) => state.width)
  const height = useProjectStore((state) => state.height)
  const zoom = useProjectStore((state) => state.zoom)

  if (!filename) return null

  const zoomPercentage = Math.round(zoom * 100)

  return (
    <div className="pointer-events-none absolute bottom-14 left-4 z-10 rounded bg-black/60 px-3 py-1.5 text-xs text-white">
      <div className="flex items-center gap-3">
        <span className="font-medium">{width} × {height} px</span>
        <span className="text-white/70">|</span>
        <span>{zoomPercentage}%</span>
      </div>
    </div>
  )
}
