import { useEffect, useCallback } from 'react'
import { useProjectStore } from '@/store/useProjectStore'

interface ShortcutHandlers {
  onZoomIn?: () => void
  onZoomOut?: () => void
  onResetZoom?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onSelectAll?: () => void
  onEscape?: () => void
}

export function useKeyboardShortcuts(handlers?: ShortcutHandlers) {
  const zoomIn = useProjectStore((state) => state.zoomIn)
  const zoomOut = useProjectStore((state) => state.zoomOut)
  const resetZoom = useProjectStore((state) => state.resetZoom)
  const hasImage = useProjectStore((state) => state.dataUrl !== null)

  // History actions
  const history = useProjectStore((state) => state.history)
  const historyIndex = useProjectStore((state) => state.historyIndex)
  const undo = useProjectStore((state) => state.undo)
  const redo = useProjectStore((state) => state.redo)

  // Selection actions
  const zones = useProjectStore((state) => state.zones)
  const selectZones = useProjectStore((state) => state.selectZones)
  const clearSelection = useProjectStore((state) => state.clearSelection)

  // Editor mode
  const setEditorMode = useProjectStore((state) => state.setEditorMode)

  // Drawing state
  const drawingMode = useProjectStore((state) => state.drawingMode)
  const cancelDrawing = useProjectStore((state) => state.cancelDrawing)

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      // Only handle shortcuts when image is loaded (except for some global ones)
      const key = event.key.toLowerCase()
      const ctrlOrMeta = event.ctrlKey || event.metaKey

      // Zoom shortcuts (when image loaded)
      if (hasImage) {
        // Zoom in: + or =
        if ((key === '+' || key === '=') && !ctrlOrMeta) {
          event.preventDefault()
          handlers?.onZoomIn?.() ?? zoomIn()
          return
        }

        // Zoom out: -
        if (key === '-' && !ctrlOrMeta) {
          event.preventDefault()
          handlers?.onZoomOut?.() ?? zoomOut()
          return
        }

        // Reset zoom: 0
        if (key === '0' && !ctrlOrMeta) {
          event.preventDefault()
          handlers?.onResetZoom?.() ?? resetZoom()
          return
        }
      }

      // Undo: Ctrl+Z
      if (key === 'z' && ctrlOrMeta && !event.shiftKey) {
        event.preventDefault()
        if (handlers?.onUndo) {
          handlers.onUndo()
        } else if (canUndo) {
          undo()
        }
        return
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if (
        (key === 'z' && ctrlOrMeta && event.shiftKey) ||
        (key === 'y' && ctrlOrMeta)
      ) {
        event.preventDefault()
        if (handlers?.onRedo) {
          handlers.onRedo()
        } else if (canRedo) {
          redo()
        }
        return
      }

      // Select All: Ctrl+A (only when image loaded)
      if (key === 'a' && ctrlOrMeta && hasImage) {
        event.preventDefault()
        if (handlers?.onSelectAll) {
          handlers.onSelectAll()
        } else {
          // Select all visible, unlocked zones
          const selectableZoneIds = zones
            .filter((z) => z.metadata.isVisible && !z.metadata.isLocked)
            .map((z) => z.id)
          selectZones(selectableZoneIds)
        }
        return
      }

      // Escape: Cancel drawing first, then deselect
      if (key === 'escape') {
        event.preventDefault()
        if (handlers?.onEscape) {
          handlers.onEscape()
        } else if (drawingMode) {
          // Cancel any active drawing
          cancelDrawing()
        } else {
          clearSelection()
        }
        return
      }

      // Mode shortcuts (when image loaded)
      if (hasImage && !ctrlOrMeta) {
        // V - Select mode
        if (key === 'v') {
          event.preventDefault()
          setEditorMode('select')
          return
        }

        // H - Pan mode (H for Hand)
        if (key === 'h') {
          event.preventDefault()
          setEditorMode('pan')
          return
        }

        // E - Edit vertices mode
        if (key === 'e') {
          event.preventDefault()
          setEditorMode('edit_vertices')
          return
        }

        // P - Draw polygon mode
        if (key === 'p') {
          event.preventDefault()
          setEditorMode('draw_polygon')
          return
        }

        // R - Draw rectangle mode
        if (key === 'r') {
          event.preventDefault()
          setEditorMode('draw_rect')
          return
        }
      }

      // Future shortcuts will be added here:
      // Delete/Backspace - Delete selected
      // Ctrl+D - Duplicate
      // Ctrl+S - Save
    },
    [
      hasImage,
      zoomIn,
      zoomOut,
      resetZoom,
      undo,
      redo,
      canUndo,
      canRedo,
      zones,
      selectZones,
      clearSelection,
      setEditorMode,
      drawingMode,
      cancelDrawing,
      handlers,
    ]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])
}
