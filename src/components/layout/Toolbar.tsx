import { ZoomControls, HistoryControls, ModeButtons } from '@/components/toolbar'

export function Toolbar() {
  return (
    <div className="flex h-12 items-center justify-between border-t border-gray-200 bg-white px-4">
      {/* Left side - Tool buttons */}
      <ModeButtons />

      {/* Center - Zoom controls */}
      <ZoomControls />

      {/* Right side - Undo/Redo */}
      <HistoryControls />
    </div>
  )
}
