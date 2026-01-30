import { Circle } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'

interface VertexHandleProps {
  x: number
  y: number
  index: number
  zoneId: string
  onDragStart?: (index: number) => void
  onDragMove?: (index: number, x: number, y: number) => void
  onDragEnd?: (index: number, x: number, y: number) => void
  onDelete?: (index: number) => void
}

export function VertexHandle({
  x,
  y,
  index,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDelete,
}: VertexHandleProps) {
  const handleDragStart = () => {
    onDragStart?.(index)
  }

  const handleDragMove = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Circle
    onDragMove?.(index, node.x(), node.y())
  }

  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Circle
    onDragEnd?.(index, node.x(), node.y())
  }

  const handleContextMenu = (e: KonvaEventObject<PointerEvent>) => {
    // Prevent browser context menu
    e.evt.preventDefault()
    e.cancelBubble = true
    onDelete?.(index)
  }

  const handleDoubleClick = (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true
    onDelete?.(index)
  }

  return (
    <Circle
      x={x}
      y={y}
      radius={5}
      fill="#FFFFFF"
      stroke="#374151"
      strokeWidth={2}
      draggable
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onContextMenu={handleContextMenu}
      onDblClick={handleDoubleClick}
      // Visual feedback on hover
      onMouseEnter={(e) => {
        const stage = e.target.getStage()
        if (stage) {
          stage.container().style.cursor = 'move'
        }
        const circle = e.target as Konva.Circle
        circle.stroke('#3B82F6')
        circle.radius(6)
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage()
        if (stage) {
          stage.container().style.cursor = 'crosshair'
        }
        const circle = e.target as Konva.Circle
        circle.stroke('#374151')
        circle.radius(5)
      }}
    />
  )
}
