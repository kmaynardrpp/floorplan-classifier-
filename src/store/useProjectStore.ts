import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  type ProjectStore,
  type AnalysisStatus,
  type HistoryEntry,
  type EditorMode,
  type DrawingMode,
  type TravelabilityFilter,
  type ProgrammaticZonesStatus,
  type AIBlockedZonesStatus,
  type TabType,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_DEFAULT,
  ZOOM_STEP,
  HISTORY_MAX_ENTRIES,
} from '@/types/store'
import type { Zone, Point } from '@/types/zone'

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const storeImpl = immer<ProjectStore>((set, get) => ({
  // Image state
  dataUrl: null,
  filename: null,
  width: 0,
  height: 0,
  originalSize: 0,

  // Viewport state
  zoom: ZOOM_DEFAULT,
  panX: 0,
  panY: 0,
  canvasWidth: 0,
  canvasHeight: 0,

  // Zones state
  zones: [] as Zone[],

  // Programmatic zones state
  programmaticZones: [] as Zone[],
  programmaticZonesStatus: 'idle' as ProgrammaticZonesStatus,
  programmaticZonesError: null as string | null,

  // AI blocked zones state (from 2D coverage analysis)
  aiBlockedZones: [] as Zone[],
  aiBlockedZonesStatus: 'idle' as AIBlockedZonesStatus,
  aiBlockedZonesError: null as string | null,

  // Combined zones (merged programmatic + AI)
  combinedZones: [] as Zone[],

  // Selection state
  selectedZoneIds: [] as string[],
  hoveredZoneId: null as string | null,

  // Zone hierarchy state
  expandedZoneIds: [] as string[],
  travelabilityFilter: 'all' as TravelabilityFilter,

  // Analysis state
  analysisStatus: 'idle' as AnalysisStatus,
  analysisError: null as string | null,

  // History state
  history: [] as HistoryEntry[],
  historyIndex: -1,

  // Editor state
  editorMode: 'select' as EditorMode,

  // Drawing state
  drawingMode: null as DrawingMode,
  drawingVertices: [] as Point[],
  drawingStartPoint: null as Point | null,

  // Tab navigation state
  activeTab: 'pre-ai' as TabType,
  useAIDetection: true,

  // Route calculation state
  routeStart: null as Point | null,
  routeEnd: null as Point | null,
  calculatedRoute: null as import('@/types/route').RoutePath | null,
  isCalculatingRoute: false,
  routeError: null as string | null,

  // Image actions
  setImage: (file: File, dataUrl: string) => {
    const img = new Image()
    img.onload = () => {
      set((state) => {
        state.dataUrl = dataUrl
        state.filename = file.name
        state.width = img.width
        state.height = img.height
        state.originalSize = file.size
        // Reset viewport when new image is loaded
        state.zoom = ZOOM_DEFAULT
        state.panX = 0
        state.panY = 0
      })
    }
    img.onerror = (err) => {
      console.error('[setImage] Image failed to load:', err)
    }
    img.src = dataUrl
  },

  clearImage: () => {
    set((state) => {
      state.dataUrl = null
      state.filename = null
      state.width = 0
      state.height = 0
      state.originalSize = 0
      state.zoom = ZOOM_DEFAULT
      state.panX = 0
      state.panY = 0
      // Also clear zones and selection
      state.zones = []
      state.programmaticZones = []
      state.programmaticZonesStatus = 'idle'
      state.programmaticZonesError = null
      state.aiBlockedZones = []
      state.aiBlockedZonesStatus = 'idle'
      state.aiBlockedZonesError = null
      state.combinedZones = []
      state.selectedZoneIds = []
      state.hoveredZoneId = null
      state.analysisStatus = 'idle'
      state.analysisError = null
    })
  },

  // Viewport actions
  setZoom: (zoom: number) => {
    set((state) => {
      state.zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX)
    })
  },

  zoomIn: () => {
    set((state) => {
      state.zoom = clamp(state.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX)
    })
  },

  zoomOut: () => {
    set((state) => {
      state.zoom = clamp(state.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX)
    })
  },

  resetZoom: () => {
    set((state) => {
      state.zoom = ZOOM_DEFAULT
    })
  },

  setPan: (x: number, y: number) => {
    set((state) => {
      state.panX = x
      state.panY = y
    })
  },

  adjustPan: (deltaX: number, deltaY: number) => {
    set((state) => {
      state.panX += deltaX
      state.panY += deltaY
    })
  },

  setCanvasSize: (width: number, height: number) => {
    set((state) => {
      state.canvasWidth = width
      state.canvasHeight = height
    })
  },

  resetViewport: () => {
    set((state) => {
      state.zoom = ZOOM_DEFAULT
      state.panX = 0
      state.panY = 0
    })
  },

  centerImage: () => {
    set((state) => {
      if (
        state.width &&
        state.height &&
        state.canvasWidth &&
        state.canvasHeight
      ) {
        // Center the image in the canvas
        state.panX = (state.canvasWidth - state.width * state.zoom) / 2
        state.panY = (state.canvasHeight - state.height * state.zoom) / 2
      }
    })
  },

  fitToView: () => {
    set((state) => {
      if (
        state.width &&
        state.height &&
        state.canvasWidth &&
        state.canvasHeight
      ) {
        // Calculate zoom to fit image in canvas with some padding
        const padding = 40
        const availableWidth = state.canvasWidth - padding * 2
        const availableHeight = state.canvasHeight - padding * 2

        const scaleX = availableWidth / state.width
        const scaleY = availableHeight / state.height
        const newZoom = clamp(Math.min(scaleX, scaleY), ZOOM_MIN, ZOOM_MAX)

        // Center the image at this zoom level
        state.zoom = newZoom
        state.panX = (state.canvasWidth - state.width * newZoom) / 2
        state.panY = (state.canvasHeight - state.height * newZoom) / 2
      }
    })
  },

  // Helper to record history after zone mutations (call after the mutation)
  _recordHistory: () => {
    set((state) => {
      // Truncate forward history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1)

      // Add current zones as new entry (deep copy)
      newHistory.push({
        zones: JSON.parse(JSON.stringify(state.zones)),
        timestamp: Date.now(),
      })

      // Enforce max entries limit
      if (newHistory.length > HISTORY_MAX_ENTRIES) {
        newHistory.shift()
      }

      state.history = newHistory
      state.historyIndex = newHistory.length - 1
    })
  },

  // Zones actions
  addZone: (zone: Zone) => {
    set((state) => {
      state.zones.push(zone)
    })
    get()._recordHistory()
  },

  addZones: (zones: Zone[]) => {
    set((state) => {
      state.zones.push(...zones)
    })
    get()._recordHistory()
  },

  updateZone: (id: string, updates: Partial<Zone>) => {
    set((state) => {
      const zone = state.zones.find((z) => z.id === id)
      if (zone) {
        Object.assign(zone, updates, { updatedAt: new Date().toISOString() })
      }
    })
    get()._recordHistory()
  },

  removeZone: (id: string) => {
    set((state) => {
      state.zones = state.zones.filter((z) => z.id !== id)
      state.selectedZoneIds = state.selectedZoneIds.filter((zid) => zid !== id)
      if (state.hoveredZoneId === id) {
        state.hoveredZoneId = null
      }
    })
    get()._recordHistory()
  },

  removeZones: (ids: string[]) => {
    set((state) => {
      const idSet = new Set(ids)
      state.zones = state.zones.filter((z) => !idSet.has(z.id))
      state.selectedZoneIds = state.selectedZoneIds.filter(
        (zid) => !idSet.has(zid)
      )
      if (state.hoveredZoneId && idSet.has(state.hoveredZoneId)) {
        state.hoveredZoneId = null
      }
    })
    get()._recordHistory()
  },

  clearZones: () => {
    set((state) => {
      state.zones = []
      state.selectedZoneIds = []
      state.hoveredZoneId = null
    })
    get()._recordHistory()
  },

  setZonesFromAnalysis: (zones: Zone[]) => {
    set((state) => {
      // Replace all AI-generated zones with new ones
      state.zones = state.zones.filter((z) => z.source === 'manual')
      state.zones.push(...zones)
      state.selectedZoneIds = []
      state.hoveredZoneId = null
    })
    get()._recordHistory()
  },

  // Vertex operations - works on zones, programmatic zones, and AI blocked zones
  updateVertex: (zoneId: string, vertexIndex: number, point: Point) => {
    set((state) => {
      // Check all zone arrays
      const zone =
        state.zones.find((z) => z.id === zoneId) ??
        state.aiBlockedZones.find((z) => z.id === zoneId) ??
        state.programmaticZones.find((z) => z.id === zoneId)

      if (zone && vertexIndex >= 0 && vertexIndex < zone.vertices.length) {
        zone.vertices[vertexIndex] = point
        zone.updatedAt = new Date().toISOString()
      }
    })
    get()._recordHistory()
  },

  addVertex: (zoneId: string, afterIndex: number, point: Point) => {
    set((state) => {
      // Check all zone arrays
      const zone =
        state.zones.find((z) => z.id === zoneId) ??
        state.aiBlockedZones.find((z) => z.id === zoneId) ??
        state.programmaticZones.find((z) => z.id === zoneId)

      if (zone && afterIndex >= 0 && afterIndex < zone.vertices.length) {
        zone.vertices.splice(afterIndex + 1, 0, point)
        zone.updatedAt = new Date().toISOString()
      }
    })
    get()._recordHistory()
  },

  removeVertex: (zoneId: string, vertexIndex: number) => {
    set((state) => {
      // Check all zone arrays
      const zone =
        state.zones.find((z) => z.id === zoneId) ??
        state.aiBlockedZones.find((z) => z.id === zoneId) ??
        state.programmaticZones.find((z) => z.id === zoneId)

      // Maintain minimum 3 vertices for a valid polygon
      if (
        zone &&
        zone.vertices.length > 3 &&
        vertexIndex >= 0 &&
        vertexIndex < zone.vertices.length
      ) {
        zone.vertices.splice(vertexIndex, 1)
        zone.updatedAt = new Date().toISOString()
      }
    })
    get()._recordHistory()
  },

  // Selection actions
  selectZone: (id: string) => {
    set((state) => {
      if (!state.selectedZoneIds.includes(id)) {
        state.selectedZoneIds = [id]
      }
    })
  },

  selectZones: (ids: string[]) => {
    set((state) => {
      state.selectedZoneIds = [...new Set(ids)]
    })
  },

  toggleZoneSelection: (id: string) => {
    set((state) => {
      const index = state.selectedZoneIds.indexOf(id)
      if (index === -1) {
        state.selectedZoneIds.push(id)
      } else {
        state.selectedZoneIds.splice(index, 1)
      }
    })
  },

  deselectZone: (id: string) => {
    set((state) => {
      state.selectedZoneIds = state.selectedZoneIds.filter((zid) => zid !== id)
    })
  },

  clearSelection: () => {
    set((state) => {
      state.selectedZoneIds = []
    })
  },

  setHoveredZone: (id: string | null) => {
    set((state) => {
      state.hoveredZoneId = id
    })
  },

  // Zone hierarchy actions
  toggleZoneExpanded: (zoneId: string) => {
    set((state) => {
      const index = state.expandedZoneIds.indexOf(zoneId)
      if (index === -1) {
        state.expandedZoneIds.push(zoneId)
      } else {
        state.expandedZoneIds.splice(index, 1)
      }
    })
  },

  expandAllZones: () => {
    set((state) => {
      // Get all zones that have children (parent zones)
      const parentIds = new Set<string>()
      state.zones.forEach((zone) => {
        const parentId = zone.metadata.customProperties.parentZoneId
        if (parentId) {
          parentIds.add(parentId)
        }
      })
      state.expandedZoneIds = [...parentIds]
    })
  },

  collapseAllZones: () => {
    set((state) => {
      state.expandedZoneIds = []
    })
  },

  setTravelabilityFilter: (filter: TravelabilityFilter) => {
    set((state) => {
      state.travelabilityFilter = filter
    })
  },

  getChildZones: (parentId: string) => {
    const state = get()
    return state.zones.filter(
      (zone) => zone.metadata.customProperties.parentZoneId === parentId
    )
  },

  // Analysis actions
  setAnalysisStatus: (status: AnalysisStatus) => {
    set((state) => {
      state.analysisStatus = status
    })
  },

  setAnalysisError: (error: string | null) => {
    set((state) => {
      state.analysisError = error
    })
  },

  startAnalysis: () => {
    set((state) => {
      state.analysisStatus = 'analyzing'
      state.analysisError = null
    })
  },

  completeAnalysis: () => {
    set((state) => {
      state.analysisStatus = 'success'
      state.analysisError = null
    })
  },

  failAnalysis: (error: string) => {
    set((state) => {
      state.analysisStatus = 'error'
      state.analysisError = error
    })
  },

  resetAnalysis: () => {
    set((state) => {
      state.analysisStatus = 'idle'
      state.analysisError = null
    })
  },

  // History actions
  pushHistory: () => {
    set((state) => {
      // Truncate forward history if we're not at the end
      const newHistory = state.history.slice(0, state.historyIndex + 1)

      // Add current zones as new entry (deep copy)
      newHistory.push({
        zones: JSON.parse(JSON.stringify(state.zones)),
        timestamp: Date.now(),
      })

      // Enforce max entries limit
      if (newHistory.length > HISTORY_MAX_ENTRIES) {
        newHistory.shift()
      }

      state.history = newHistory
      state.historyIndex = newHistory.length - 1
    })
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--
        const entry = state.history[state.historyIndex]
        if (entry) {
          state.zones = JSON.parse(JSON.stringify(entry.zones))
        }
        // Clear selection since undone zones may not exist
        state.selectedZoneIds = []
        state.hoveredZoneId = null
      }
    })
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++
        const entry = state.history[state.historyIndex]
        if (entry) {
          state.zones = JSON.parse(JSON.stringify(entry.zones))
        }
        // Clear selection
        state.selectedZoneIds = []
        state.hoveredZoneId = null
      }
    })
  },

  clearHistory: () => {
    set((state) => {
      state.history = []
      state.historyIndex = -1
    })
  },

  // Editor actions
  setEditorMode: (mode: EditorMode) => {
    set((state) => {
      state.editorMode = mode
    })
  },

  // Drawing actions
  startDrawing: (mode: DrawingMode, startPoint: Point) => {
    set((state) => {
      state.drawingMode = mode
      state.drawingVertices = [startPoint]
      state.drawingStartPoint = startPoint
    })
  },

  addDrawingVertex: (point: Point) => {
    set((state) => {
      if (state.drawingMode) {
        state.drawingVertices.push(point)
      }
    })
  },

  updateDrawingPreview: (point: Point) => {
    set((state) => {
      // For polygon: update the last vertex as preview (mouse position)
      // For rect: the preview is calculated from startPoint and current point
      // This stores the current mouse position for preview rendering
      if (state.drawingMode === 'polygon' && state.drawingVertices.length > 0) {
        // Keep all vertices except add/update preview position
        // The preview will be rendered by the DrawingPreview component
      }
      // For rect mode, we just need the start point and current point
      // Store current point temporarily - the component will use it
      if (state.drawingMode === 'rect' && state.drawingStartPoint) {
        // Rect uses startPoint + current mouse for preview
        // Store in drawingVertices as [startPoint, currentPoint]
        state.drawingVertices = [state.drawingStartPoint, point]
      }
    })
  },

  completeDrawing: () => {
    const state = get()
    if (!state.drawingMode) return null

    let vertices: Point[] | null = null

    if (state.drawingMode === 'polygon') {
      // Need at least 3 vertices for a valid polygon
      if (state.drawingVertices.length >= 3) {
        vertices = [...state.drawingVertices]
      }
    } else if (state.drawingMode === 'rect') {
      // Convert rect (2 points) to 4-vertex polygon
      if (state.drawingVertices.length === 2) {
        const [p1, p2] = state.drawingVertices
        if (p1 && p2) {
          vertices = [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p1.y },
            { x: p2.x, y: p2.y },
            { x: p1.x, y: p2.y },
          ]
        }
      }
    }

    // Reset drawing state
    set((state) => {
      state.drawingMode = null
      state.drawingVertices = []
      state.drawingStartPoint = null
    })

    return vertices
  },

  cancelDrawing: () => {
    set((state) => {
      state.drawingMode = null
      state.drawingVertices = []
      state.drawingStartPoint = null
    })
  },

  // Programmatic zones actions
  setProgrammaticZones: (zones: Zone[]) => {
    set((state) => {
      state.programmaticZones = zones
      state.programmaticZonesStatus = 'success'
      state.programmaticZonesError = null
    })
  },

  clearProgrammaticZones: () => {
    set((state) => {
      state.programmaticZones = []
      state.programmaticZonesStatus = 'idle'
      state.programmaticZonesError = null
    })
  },

  setProgrammaticZonesStatus: (status: ProgrammaticZonesStatus) => {
    set((state) => {
      state.programmaticZonesStatus = status
    })
  },

  setProgrammaticZonesError: (error: string | null) => {
    set((state) => {
      state.programmaticZonesError = error
      if (error) {
        state.programmaticZonesStatus = 'error'
      }
    })
  },

  getAllVisibleZones: () => {
    const state = get()
    // Combine AI/manual zones with programmatic zones
    // Programmatic zones are rendered separately but may need to be combined for operations
    return [...state.zones, ...state.programmaticZones]
  },

  // AI blocked zones actions
  setAIBlockedZones: (zones: Zone[]) => {
    set((state) => {
      state.aiBlockedZones = zones
      state.aiBlockedZonesStatus = 'success'
      state.aiBlockedZonesError = null
    })
  },

  clearAIBlockedZones: () => {
    set((state) => {
      state.aiBlockedZones = []
      state.aiBlockedZonesStatus = 'idle'
      state.aiBlockedZonesError = null
    })
  },

  removeAIBlockedZone: (id: string) => {
    set((state) => {
      state.aiBlockedZones = state.aiBlockedZones.filter((z) => z.id !== id)
      // Also clear selection if the zone was selected
      state.selectedZoneIds = state.selectedZoneIds.filter((zid) => zid !== id)
      if (state.hoveredZoneId === id) {
        state.hoveredZoneId = null
      }
    })
  },

  setAIBlockedZonesStatus: (status: AIBlockedZonesStatus) => {
    set((state) => {
      state.aiBlockedZonesStatus = status
    })
  },

  setAIBlockedZonesError: (error: string | null) => {
    set((state) => {
      state.aiBlockedZonesError = error
      if (error) {
        state.aiBlockedZonesStatus = 'error'
      }
    })
  },

  // Combined zones actions
  setCombinedZones: (zones: Zone[]) => {
    set((state) => {
      state.combinedZones = zones
    })
  },

  clearCombinedZones: () => {
    set((state) => {
      state.combinedZones = []
    })
  },

  // Tab navigation actions
  setActiveTab: (tab: TabType) => {
    set((state) => {
      state.activeTab = tab
    })
  },

  setUseAIDetection: (enabled: boolean) => {
    set((state) => {
      state.useAIDetection = enabled
    })
  },

  // Route calculation actions
  setRouteStart: (point: Point | null) => {
    set((state) => {
      state.routeStart = point
      // Clear calculated route when start changes
      state.calculatedRoute = null
      state.routeError = null
    })
  },

  setRouteEnd: (point: Point | null) => {
    set((state) => {
      state.routeEnd = point
      // Clear calculated route when end changes
      state.calculatedRoute = null
      state.routeError = null
    })
  },

  setCalculatedRoute: (route: import('@/types/route').RoutePath | null) => {
    set((state) => {
      state.calculatedRoute = route
      state.isCalculatingRoute = false
      if (route && !route.success && route.error) {
        state.routeError = route.error
      } else {
        state.routeError = null
      }
    })
  },

  setIsCalculatingRoute: (calculating: boolean) => {
    set((state) => {
      state.isCalculatingRoute = calculating
    })
  },

  setRouteError: (error: string | null) => {
    set((state) => {
      state.routeError = error
    })
  },

  clearRoute: () => {
    set((state) => {
      state.routeStart = null
      state.routeEnd = null
      state.calculatedRoute = null
      state.isCalculatingRoute = false
      state.routeError = null
    })
  },
}))

export const useProjectStore = create<ProjectStore>()(storeImpl)

// Expose store to window for debugging in development
if (import.meta.env.DEV) {
  ;(window as unknown as { __STORE__: typeof useProjectStore }).__STORE__ =
    useProjectStore
}
