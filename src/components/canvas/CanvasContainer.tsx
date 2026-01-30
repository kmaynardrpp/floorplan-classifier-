import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react'
import { Stage, Layer } from 'react-konva'
import type Konva from 'konva'
import { useProjectStore } from '@/store/useProjectStore'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '@/types/store'
import { createZone, type Point, type ZoneType } from '@/types/zone'
import { DrawingPreview } from './DrawingPreview'
import { RectanglePreview } from './RectanglePreview'
import { ZoneTypeSelector } from '../zones/ZoneTypeSelector'
import { useRouteSelection } from '@/hooks/useRouteSelection'

interface CanvasContainerProps {
  children?: ReactNode
}

export function CanvasContainer({ children }: CanvasContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false)

  const setCanvasSize = useProjectStore((state) => state.setCanvasSize)
  const zoom = useProjectStore((state) => state.zoom)
  const panX = useProjectStore((state) => state.panX)
  const panY = useProjectStore((state) => state.panY)
  const setZoom = useProjectStore((state) => state.setZoom)
  const setPan = useProjectStore((state) => state.setPan)
  const clearSelection = useProjectStore((state) => state.clearSelection)
  const editorMode = useProjectStore((state) => state.editorMode)

  // Drawing state and actions
  const drawingMode = useProjectStore((state) => state.drawingMode)
  const drawingVertices = useProjectStore((state) => state.drawingVertices)
  const startDrawing = useProjectStore((state) => state.startDrawing)
  const addDrawingVertex = useProjectStore((state) => state.addDrawingVertex)
  const completeDrawing = useProjectStore((state) => state.completeDrawing)
  const addZone = useProjectStore((state) => state.addZone)

  // Track mouse position for drawing preview
  const [mousePos, setMousePos] = useState<Point | null>(null)

  // Track pending vertices awaiting type selection
  const [pendingVertices, setPendingVertices] = useState<Point[] | null>(null)
  const [selectorPosition, setSelectorPosition] = useState<{ x: number; y: number } | null>(null)

  // Rectangle drawing state
  const [rectStartPoint, setRectStartPoint] = useState<Point | null>(null)
  const [rectCurrentPoint, setRectCurrentPoint] = useState<Point | null>(null)
  const [isDrawingRect, setIsDrawingRect] = useState(false)

  // Route selection hook
  const { handleCanvasClick: handleRouteClick, isActive: isRouteTabActive } = useRouteSelection()

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateDimensions = () => {
      const { width, height } = container.getBoundingClientRect()
      setDimensions({ width, height })
      setCanvasSize(width, height)
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [setCanvasSize])

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()

      const stage = stageRef.current
      if (!stage) return

      const oldScale = zoom
      const pointer = stage.getPointerPosition()

      if (!pointer) return

      // Calculate zoom direction
      const direction = e.evt.deltaY > 0 ? -1 : 1
      const newScale = Math.min(
        Math.max(oldScale + direction * ZOOM_STEP, ZOOM_MIN),
        ZOOM_MAX
      )

      // Calculate new position to zoom towards cursor
      const mousePointTo = {
        x: (pointer.x - panX) / oldScale,
        y: (pointer.y - panY) / oldScale,
      }

      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      }

      setZoom(newScale)
      setPan(newPos.x, newPos.y)
    },
    [zoom, panX, panY, setZoom, setPan]
  )

  // Handle pan start and rectangle drawing start
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Start panning with middle mouse button, when space is held, or in pan mode (left click)
      const isPanTrigger =
        e.evt.button === 1 || // Middle mouse button
        isSpaceHeld || // Space key held
        (editorMode === 'pan' && e.evt.button === 0) // Left click in pan mode

      if (isPanTrigger) {
        setIsPanning(true)
        e.evt.preventDefault()
        return
      }

      // Start rectangle drawing on left click in draw_rect mode
      if (e.evt.button === 0 && editorMode === 'draw_rect' && !isSpaceHeld) {
        const stage = stageRef.current
        if (stage) {
          const pointer = stage.getPointerPosition()
          if (pointer) {
            const imageX = (pointer.x - panX) / zoom
            const imageY = (pointer.y - panY) / zoom
            setRectStartPoint({ x: imageX, y: imageY })
            setRectCurrentPoint({ x: imageX, y: imageY })
            setIsDrawingRect(true)
          }
        }
      }
    },
    [isSpaceHeld, editorMode, panX, panY, zoom]
  )

  // Handle pan move and track mouse for drawing
  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = stageRef.current
      if (!stage) return

      const pointer = stage.getPointerPosition()
      if (pointer) {
        // Convert screen coordinates to image coordinates
        const imageX = (pointer.x - panX) / zoom
        const imageY = (pointer.y - panY) / zoom

        // Track mouse position for polygon drawing preview
        if (drawingMode === 'polygon') {
          setMousePos({ x: imageX, y: imageY })
        }

        // Track mouse position for rectangle drawing preview
        if (isDrawingRect) {
          setRectCurrentPoint({ x: imageX, y: imageY })
        }
      }

      if (!isPanning) return

      const dx = e.evt.movementX
      const dy = e.evt.movementY

      setPan(panX + dx, panY + dy)
    },
    [isPanning, panX, panY, zoom, setPan, drawingMode, isDrawingRect]
  )

  // Handle pan end and rectangle drawing completion
  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      setIsPanning(false)

      // Complete rectangle drawing
      if (isDrawingRect && rectStartPoint && rectCurrentPoint) {
        // Calculate rectangle dimensions
        const width = Math.abs(rectCurrentPoint.x - rectStartPoint.x)
        const height = Math.abs(rectCurrentPoint.y - rectStartPoint.y)

        // Minimum size check (20x20 pixels)
        if (width >= 20 && height >= 20) {
          // Convert rectangle to 4-vertex polygon (clockwise: TL, TR, BR, BL)
          const minX = Math.min(rectStartPoint.x, rectCurrentPoint.x)
          const minY = Math.min(rectStartPoint.y, rectCurrentPoint.y)
          const maxX = Math.max(rectStartPoint.x, rectCurrentPoint.x)
          const maxY = Math.max(rectStartPoint.y, rectCurrentPoint.y)

          const vertices: Point[] = [
            { x: minX, y: minY }, // TL
            { x: maxX, y: minY }, // TR
            { x: maxX, y: maxY }, // BR
            { x: minX, y: maxY }, // BL
          ]

          // Store vertices and show type selector
          setPendingVertices(vertices)
          setSelectorPosition({
            x: e.evt.clientX,
            y: e.evt.clientY,
          })
        }

        // Reset rectangle drawing state
        setRectStartPoint(null)
        setRectCurrentPoint(null)
        setIsDrawingRect(false)
      }
    },
    [isDrawingRect, rectStartPoint, rectCurrentPoint]
  )

  // Handle click on empty canvas to clear selection or place drawing vertices
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Don't handle clicks while panning
      if (isPanning) return

      const stage = stageRef.current
      if (!stage) return

      const pointer = stage.getPointerPosition()
      if (!pointer) return

      // Convert screen coordinates to image coordinates
      const imageX = (pointer.x - panX) / zoom
      const imageY = (pointer.y - panY) / zoom
      const point: Point = { x: imageX, y: imageY }

      // Handle route selection when on route tab
      if (isRouteTabActive) {
        handleRouteClick(point)
        return
      }

      // Handle drawing mode
      if (editorMode === 'draw_polygon') {
        if (!drawingMode) {
          // Start a new polygon
          startDrawing('polygon', point)
        } else {
          // Add vertex to existing polygon
          addDrawingVertex(point)
        }
        return
      }

      // Only clear selection if clicking directly on the stage (not on a shape)
      const clickedOnEmpty = e.target === e.target.getStage()
      if (clickedOnEmpty) {
        clearSelection()
      }
    },
    [clearSelection, isPanning, editorMode, drawingMode, panX, panY, zoom, startDrawing, addDrawingVertex, isRouteTabActive, handleRouteClick]
  )

  // Handle double-click to complete polygon drawing
  const handleDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (drawingMode === 'polygon' && drawingVertices.length >= 3) {
        const vertices = completeDrawing()
        if (vertices) {
          // Store vertices and show type selector
          setPendingVertices(vertices)
          // Position selector at click location
          const stage = stageRef.current
          if (stage) {
            const container = stage.container()
            const rect = container.getBoundingClientRect()
            setSelectorPosition({
              x: e.evt.clientX - rect.left + rect.left,
              y: e.evt.clientY - rect.top + rect.top,
            })
          }
        }
      }
    },
    [drawingMode, drawingVertices.length, completeDrawing]
  )

  // Handle zone type selection after drawing
  const handleTypeSelect = useCallback(
    (type: ZoneType) => {
      if (pendingVertices) {
        const newZone = createZone({
          id: crypto.randomUUID(),
          name: `Zone ${Date.now()}`,
          type,
          vertices: pendingVertices,
        })
        addZone(newZone)
        setPendingVertices(null)
        setSelectorPosition(null)
      }
    },
    [pendingVertices, addZone]
  )

  // Handle type selection cancel
  const handleTypeCancel = useCallback(() => {
    setPendingVertices(null)
    setSelectorPosition(null)
  }, [])

  // Handle space key for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setIsSpaceHeld(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false)
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Determine cursor style based on editor mode and interaction state
  const getCursor = () => {
    // Active panning takes priority
    if (isPanning) return 'grabbing'
    if (isSpaceHeld) return 'grab'

    // Route selection mode
    if (isRouteTabActive) return 'crosshair'

    // Cursor based on editor mode
    switch (editorMode) {
      case 'pan':
        return 'grab'
      case 'draw_polygon':
      case 'draw_rect':
        return 'crosshair'
      case 'edit_vertices':
        return 'crosshair'
      case 'select':
      default:
        return 'default'
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden bg-gray-200 relative"
      style={{ cursor: getCursor() }}
    >
      {dimensions.width > 0 && dimensions.height > 0 && (
        <Stage
          ref={stageRef}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={zoom}
          scaleY={zoom}
          x={panX}
          y={panY}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleStageClick}
          onDblClick={handleDblClick}
        >
          <Layer>
            {children}
            {drawingMode === 'polygon' && (
              <DrawingPreview vertices={drawingVertices} mousePos={mousePos} />
            )}
            {isDrawingRect && rectStartPoint && rectCurrentPoint && (
              <RectanglePreview
                startPoint={rectStartPoint}
                currentPoint={rectCurrentPoint}
              />
            )}
          </Layer>
        </Stage>
      )}
      {/* Zone type selector - shown after drawing completes */}
      {pendingVertices && selectorPosition && (
        <ZoneTypeSelector
          onSelect={handleTypeSelect}
          onCancel={handleTypeCancel}
          position={selectorPosition}
        />
      )}
    </div>
  )
}
