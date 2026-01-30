import { useProjectStore } from '@/store/useProjectStore'
import { ToolButton } from './ToolButton'

// Select icon (cursor/arrow)
const SelectIcon = () => (
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
      d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59"
    />
  </svg>
)

// Pan icon (hand)
const PanIcon = () => (
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
      d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075-5.925v3m0-3a1.575 1.575 0 013.15 0v1.5m-3.15 1.5l.075 5.925m3.075-7.425a1.575 1.575 0 013.15 0v3.15M15 9v1.5m-3-3.75V6m-3-1.5V4.5m0 3.75V12m3 4.5v.75M9 21v-3m3 3v-4.5m3 4.5v-3m0-3.75v-3"
    />
  </svg>
)

// Edit Vertices icon (pencil with points)
const EditVerticesIcon = () => (
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
      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
    />
  </svg>
)

// Draw Polygon icon (polygon shape)
const DrawPolygonIcon = () => (
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
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
    />
  </svg>
)

// Draw Rectangle icon (simple rectangle)
const DrawRectIcon = () => (
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
      d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
    />
  </svg>
)

export function ModeButtons() {
  const editorMode = useProjectStore((state) => state.editorMode)
  const setEditorMode = useProjectStore((state) => state.setEditorMode)
  const hasImage = useProjectStore((state) => state.dataUrl !== null)

  return (
    <div className="flex items-center gap-1">
      <ToolButton
        icon={<SelectIcon />}
        label="Select"
        shortcut="V"
        isActive={editorMode === 'select'}
        disabled={!hasImage}
        onClick={() => setEditorMode('select')}
      />
      <ToolButton
        icon={<PanIcon />}
        label="Pan"
        shortcut="H"
        isActive={editorMode === 'pan'}
        disabled={!hasImage}
        onClick={() => setEditorMode('pan')}
      />
      <ToolButton
        icon={<EditVerticesIcon />}
        label="Edit Vertices"
        shortcut="E"
        isActive={editorMode === 'edit_vertices'}
        disabled={!hasImage}
        onClick={() => setEditorMode('edit_vertices')}
      />
      <ToolButton
        icon={<DrawPolygonIcon />}
        label="Draw Polygon"
        shortcut="P"
        isActive={editorMode === 'draw_polygon'}
        disabled={!hasImage}
        onClick={() => setEditorMode('draw_polygon')}
      />
      <ToolButton
        icon={<DrawRectIcon />}
        label="Draw Rectangle"
        shortcut="R"
        isActive={editorMode === 'draw_rect'}
        disabled={!hasImage}
        onClick={() => setEditorMode('draw_rect')}
      />
    </div>
  )
}
