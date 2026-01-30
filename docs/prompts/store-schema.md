# Zustand Store Schema

This document defines the complete state shape for the Floorplan Zone Editor application.

## Store Structure Overview

```typescript
interface ProjectStore {
  // Image state
  image: ImageState

  // Viewport/canvas state
  viewport: ViewportState

  // Zone data
  zones: Zone[]

  // Selection state
  selection: SelectionState

  // History for undo/redo
  history: HistoryState

  // Editor mode
  editor: EditorState

  // UI state
  ui: UIState

  // Custom zone types
  customZoneTypes: CustomZoneType[]

  // Analysis state
  analysis: AnalysisState
}
```

---

## Slice Definitions

### Image Slice

```typescript
interface ImageState {
  dataUrl: string | null
  filename: string | null
  width: number
  height: number
  originalSize: number // bytes
}

// Actions
interface ImageActions {
  setImage: (file: File, dataUrl: string) => void
  clearImage: () => void
}
```

### Viewport Slice

```typescript
interface ViewportState {
  zoom: number // 0.1 to 5.0, default 1.0
  panX: number // horizontal offset
  panY: number // vertical offset
  canvasWidth: number
  canvasHeight: number
}

// Actions
interface ViewportActions {
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setPan: (x: number, y: number) => void
  setCanvasSize: (width: number, height: number) => void
  resetViewport: () => void
}
```

### Zones Slice

```typescript
interface Point {
  x: number
  y: number
}

type ZoneType =
  | 'aisle'
  | 'travel_lane'
  | 'parking_lot'
  | 'open_floor'
  | 'loading_dock'
  | 'intersection'
  | 'restricted'
  | 'pick_area'
  | 'drop_area'
  | 'staging_area'
  | 'charging_station'
  | 'hazard_zone'
  | string // for custom types

interface ZoneMetadata {
  color: string | null // null = use type default
  opacity: number // 0-1, default 0.5
  isVisible: boolean
  isLocked: boolean
  description: string
  customProperties: Record<string, string>
}

interface Zone {
  id: string // UUID
  name: string
  type: ZoneType
  vertices: Point[]
  confidence: number | null // null for manual zones
  source: 'ai' | 'manual'
  metadata: ZoneMetadata
  createdAt: string // ISO timestamp
  updatedAt: string // ISO timestamp
}

// Actions
interface ZonesActions {
  addZone: (zone: Zone) => void
  addZones: (zones: Zone[]) => void
  updateZone: (id: string, updates: Partial<Zone>) => void
  removeZone: (id: string) => void
  removeZones: (ids: string[]) => void
  clearZones: () => void
  setZonesFromAnalysis: (zones: Zone[]) => void
  reorderZones: (fromIndex: number, toIndex: number) => void

  // Vertex operations
  updateVertex: (zoneId: string, vertexIndex: number, point: Point) => void
  addVertex: (zoneId: string, afterIndex: number, point: Point) => void
  removeVertex: (zoneId: string, vertexIndex: number) => void

  // Zone operations
  duplicateZone: (id: string) => void
  translateZone: (id: string, deltaX: number, deltaY: number) => void
  translateZones: (ids: string[], deltaX: number, deltaY: number) => void
}
```

### Selection Slice

```typescript
interface SelectionState {
  selectedZoneIds: string[]
  hoveredZoneId: string | null
  focusedVertexIndex: number | null // for vertex editing
}

// Actions
interface SelectionActions {
  selectZone: (id: string) => void
  selectZones: (ids: string[]) => void
  toggleZoneSelection: (id: string) => void
  deselectZone: (id: string) => void
  clearSelection: () => void
  selectAll: () => void
  setHoveredZone: (id: string | null) => void
  setFocusedVertex: (index: number | null) => void
}
```

### History Slice

```typescript
interface HistoryEntry {
  zones: Zone[]
  timestamp: number
}

interface HistoryState {
  entries: HistoryEntry[]
  currentIndex: number
  maxEntries: number // default 50
}

// Actions
interface HistoryActions {
  pushHistory: () => void
  undo: () => void
  redo: () => void
  clearHistory: () => void
}

// Computed
interface HistoryComputed {
  canUndo: boolean
  canRedo: boolean
}
```

### Editor Slice

```typescript
type EditorMode =
  | 'select'
  | 'pan'
  | 'draw_polygon'
  | 'draw_rect'
  | 'edit_vertices'

interface DrawingState {
  vertices: Point[]
  startPoint: Point | null // for rectangle
  isDrawing: boolean
}

interface EditorState {
  mode: EditorMode
  drawing: DrawingState
  snapToGrid: boolean
  gridSize: number // pixels
}

// Actions
interface EditorActions {
  setMode: (mode: EditorMode) => void
  startDrawing: () => void
  addDrawingVertex: (point: Point) => void
  setDrawingStartPoint: (point: Point) => void
  completeDrawing: () => void
  cancelDrawing: () => void
  setSnapToGrid: (enabled: boolean) => void
  setGridSize: (size: number) => void
}
```

### UI Slice

```typescript
interface UIState {
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  zoneTypeFilter: ZoneType[]
  zoneSearchQuery: string
  expandedZoneGroups: ZoneType[]
  showGridOverlay: boolean
}

// Actions
interface UIActions {
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setZoneTypeFilter: (types: ZoneType[]) => void
  setZoneSearchQuery: (query: string) => void
  toggleZoneGroup: (type: ZoneType) => void
  setShowGridOverlay: (show: boolean) => void
}
```

### Custom Zone Types Slice

```typescript
interface CustomZoneType {
  id: string
  name: string // snake_case identifier
  label: string // display name
  color: string // hex color
  description: string
}

// Actions
interface CustomZoneTypesActions {
  addCustomType: (type: CustomZoneType) => void
  updateCustomType: (id: string, updates: Partial<CustomZoneType>) => void
  removeCustomType: (id: string) => void
}
```

### Analysis Slice

```typescript
type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error'

interface AnalysisState {
  status: AnalysisStatus
  error: string | null
  lastAnalyzedImageHash: string | null
  cachedResults: Map<string, Zone[]>
}

// Actions
interface AnalysisActions {
  startAnalysis: () => void
  completeAnalysis: (zones: Zone[], imageHash: string) => void
  failAnalysis: (error: string) => void
  resetAnalysis: () => void
  clearCache: () => void
}
```

---

## State Persistence

The following slices are persisted to localStorage:

- `image` - Full image data (with size limits)
- `zones` - All zone data
- `customZoneTypes` - User-defined zone types
- `ui` - Panel states and preferences
- `editor.snapToGrid`, `editor.gridSize` - Editor preferences

The following are NOT persisted (session-only):

- `viewport` - Reset on load
- `selection` - Reset on load
- `history` - Reset on load
- `analysis` - Reset on load
- `editor.mode`, `editor.drawing` - Reset on load

---

## Action Categories

### Recordable Actions (create history entry)

- All zone mutations (add, update, remove, reorder)
- Vertex operations (update, add, remove)
- Zone translations
- Zone duplication

### Non-Recordable Actions

- Selection changes
- Viewport changes
- UI state changes
- Editor mode changes
- Drawing state (until completion)

---

## Selectors

```typescript
// Zone selectors
const selectVisibleZones = (state) =>
  state.zones.filter((z) => z.metadata.isVisible)

const selectSelectedZones = (state) =>
  state.zones.filter((z) => state.selection.selectedZoneIds.includes(z.id))

const selectZonesByType = (type: ZoneType) => (state) =>
  state.zones.filter((z) => z.type === type)

const selectFilteredZones = (state) => {
  let zones = state.zones

  // Apply type filter
  if (state.ui.zoneTypeFilter.length > 0) {
    zones = zones.filter((z) => state.ui.zoneTypeFilter.includes(z.type))
  }

  // Apply search filter
  if (state.ui.zoneSearchQuery) {
    const query = state.ui.zoneSearchQuery.toLowerCase()
    zones = zones.filter((z) => z.name.toLowerCase().includes(query))
  }

  return zones
}

// History selectors
const selectCanUndo = (state) => state.history.currentIndex > 0
const selectCanRedo = (state) =>
  state.history.currentIndex < state.history.entries.length - 1
```
