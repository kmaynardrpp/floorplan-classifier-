import { useState, useCallback, useEffect, useRef } from 'react'
import { Header, MainLayout, Toolbar } from '@/components/layout'
import { ImageUpload } from '@/components/upload'
import {
  CanvasContainer,
  FloorplanLayer,
  ImageInfo,
  ZoneOverlayLayer,
  ZoneTooltip,
  RouteMarkers,
  RouteOverlay,
} from '@/components/canvas'
import { PropertiesPanel } from '@/components/properties'
import { ZonePanel } from '@/components/panel'
import { useProjectStore } from '@/store/useProjectStore'
import { useKeyboardShortcuts } from '@/hooks'

function App() {
  const dataUrl = useProjectStore((state) => state.dataUrl)
  const canvasWidth = useProjectStore((state) => state.canvasWidth)
  const canvasHeight = useProjectStore((state) => state.canvasHeight)
  const fitToView = useProjectStore((state) => state.fitToView)
  const hasImage = dataUrl !== null
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [mousePosition, setMousePosition] = useState<{
    x: number
    y: number
  } | null>(null)
  const [zonePanelCollapsed, setZonePanelCollapsed] = useState(false)
  const hasFittedRef = useRef(false)

  // Fit image to view when first loaded and canvas is ready
  useEffect(() => {
    if (
      hasImage &&
      canvasWidth > 0 &&
      canvasHeight > 0 &&
      !hasFittedRef.current
    ) {
      fitToView()
      hasFittedRef.current = true
    }
    // Reset the flag when image is cleared
    if (!hasImage) {
      hasFittedRef.current = false
    }
  }, [hasImage, canvasWidth, canvasHeight, fitToView])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }, [])

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  const handleUploadError = (message: string) => {
    setUploadError(message)
    // Auto-clear error after 5 seconds
    setTimeout(() => setUploadError(null), 5000)
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <MainLayout>
        {/* Error toast */}
        {uploadError && (
          <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-lg bg-error px-4 py-3 text-white shadow-lg">
            <div className="flex items-center gap-2">
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
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{uploadError}</span>
              <button
                onClick={() => setUploadError(null)}
                className="ml-2 hover:opacity-80"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {hasImage ? (
          <>
            <div className="flex flex-1 overflow-hidden">
              {/* Left Sidebar - Zone Panel */}
              {!zonePanelCollapsed && (
                <aside className="w-[280px] flex-shrink-0 border-r border-gray-200 bg-white">
                  <ZonePanel
                    collapsed={zonePanelCollapsed}
                    onToggleCollapse={() =>
                      setZonePanelCollapsed(!zonePanelCollapsed)
                    }
                  />
                </aside>
              )}
              {zonePanelCollapsed && (
                <aside className="w-10 flex-shrink-0 border-r border-gray-200 bg-white">
                  <ZonePanel
                    collapsed={zonePanelCollapsed}
                    onToggleCollapse={() =>
                      setZonePanelCollapsed(!zonePanelCollapsed)
                    }
                  />
                </aside>
              )}

              {/* Main Canvas Area */}
              <div
                className="relative flex min-w-0 flex-1 flex-col"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setMousePosition(null)}
              >
                <CanvasContainer>
                  <FloorplanLayer />
                  <ZoneOverlayLayer />
                  <RouteOverlay />
                  <RouteMarkers />
                </CanvasContainer>
                <ImageInfo />
                <ZoneTooltip position={mousePosition} />
              </div>

              {/* Right Sidebar - Properties Panel */}
              <PropertiesPanel />
            </div>
            <Toolbar />
          </>
        ) : (
          <ImageUpload onError={handleUploadError} />
        )}
      </MainLayout>
    </div>
  )
}

export default App
