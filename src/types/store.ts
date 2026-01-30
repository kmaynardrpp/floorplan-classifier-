import type { Zone, Point } from './zone'
import type {
  FloorplanConfig,
  Anchor,
  TDOAPair,
  CoveragePolygon,
} from './config'
import type { RoutePath } from './route'

// Image State
export interface ImageState {
  dataUrl: string | null
  filename: string | null
  width: number
  height: number
  originalSize: number
}

// Viewport State
export interface ViewportState {
  zoom: number
  panX: number
  panY: number
  canvasWidth: number
  canvasHeight: number
}

// Zones State
export interface ZonesState {
  zones: Zone[]
}

// Programmatic Zones State
export type ProgrammaticZonesStatus =
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'

export interface ProgrammaticZonesState {
  /** Zones generated from TDOA and coverage data */
  programmaticZones: Zone[]
  /** Status of programmatic zone generation */
  programmaticZonesStatus: ProgrammaticZonesStatus
  /** Error message if generation failed */
  programmaticZonesError: string | null
}

// AI Blocked Zones State (from 2D coverage analysis)
export type AIBlockedZonesStatus = 'idle' | 'analyzing' | 'success' | 'error'

export interface AIBlockedZonesState {
  /** Blocked areas detected by AI within 2D coverage regions */
  aiBlockedZones: Zone[]
  /** Status of AI blocked zone analysis */
  aiBlockedZonesStatus: AIBlockedZonesStatus
  /** Error message if analysis failed */
  aiBlockedZonesError: string | null
}

// Combined Zones State (merged for display and routing)
export interface CombinedZonesState {
  /** Combined zone set: programmatic + AI blocked areas */
  combinedZones: Zone[]
}

// Selection State
export interface SelectionState {
  selectedZoneIds: string[]
  hoveredZoneId: string | null
}

// Zone Hierarchy State
export type TravelabilityFilter = 'all' | 'travelable' | 'non-travelable'

export interface ZoneHierarchyState {
  /** IDs of zones that are expanded in the tree view */
  expandedZoneIds: string[]
  /** Filter for zone travelability */
  travelabilityFilter: TravelabilityFilter
}

// Analysis State
export type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error'

export interface AnalysisState {
  analysisStatus: AnalysisStatus
  analysisError: string | null
}

// History State
export interface HistoryEntry {
  zones: Zone[]
  timestamp: number
}

export interface HistoryState {
  history: HistoryEntry[]
  historyIndex: number
}

export const HISTORY_MAX_ENTRIES = 50

// Editor Mode
export type EditorMode =
  | 'select'
  | 'pan'
  | 'draw_polygon'
  | 'draw_rect'
  | 'edit_vertices'

export interface EditorState {
  editorMode: EditorMode
}

// Drawing State
export type DrawingMode = 'polygon' | 'rect' | null

export interface DrawingState {
  drawingMode: DrawingMode
  drawingVertices: Point[]
  drawingStartPoint: Point | null
}

// Tab Navigation State
export type TabType = 'pre-ai' | 'post-ai' | 'route'

export interface TabState {
  /** Currently active tab */
  activeTab: TabType
  /** Whether AI detection is enabled */
  useAIDetection: boolean
}

// Tab Navigation Actions
export interface TabActions {
  /** Set the active tab */
  setActiveTab: (tab: TabType) => void
  /** Set whether AI detection is enabled */
  setUseAIDetection: (enabled: boolean) => void
}

// Route Calculation State
export interface RouteCalcState {
  /** Selected start point for route calculation */
  routeStart: Point | null
  /** Selected end point for route calculation */
  routeEnd: Point | null
  /** Calculated route path */
  calculatedRoute: RoutePath | null
  /** Whether route calculation is in progress */
  isCalculatingRoute: boolean
  /** Error message from route calculation */
  routeError: string | null
}

// Route Calculation Actions
export interface RouteCalcActions {
  /** Set route start point */
  setRouteStart: (point: Point | null) => void
  /** Set route end point */
  setRouteEnd: (point: Point | null) => void
  /** Set calculated route */
  setCalculatedRoute: (route: RoutePath | null) => void
  /** Set route calculation in progress */
  setIsCalculatingRoute: (calculating: boolean) => void
  /** Set route error */
  setRouteError: (error: string | null) => void
  /** Clear all route state */
  clearRoute: () => void
}

// Viewport constants
export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 5.0
export const ZOOM_DEFAULT = 1.0
export const ZOOM_STEP = 0.1

// Image Actions
export interface ImageActions {
  setImage: (file: File, dataUrl: string) => void
  clearImage: () => void
}

// Viewport Actions
export interface ViewportActions {
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setPan: (x: number, y: number) => void
  adjustPan: (deltaX: number, deltaY: number) => void
  setCanvasSize: (width: number, height: number) => void
  resetViewport: () => void
  centerImage: () => void
  fitToView: () => void
}

// Zones Actions
export interface ZonesActions {
  addZone: (zone: Zone) => void
  addZones: (zones: Zone[]) => void
  updateZone: (id: string, updates: Partial<Zone>) => void
  removeZone: (id: string) => void
  removeZones: (ids: string[]) => void
  clearZones: () => void
  setZonesFromAnalysis: (zones: Zone[]) => void
  // Vertex operations
  updateVertex: (zoneId: string, vertexIndex: number, point: Point) => void
  addVertex: (zoneId: string, afterIndex: number, point: Point) => void
  removeVertex: (zoneId: string, vertexIndex: number) => void
}

// Selection Actions
export interface SelectionActions {
  selectZone: (id: string) => void
  selectZones: (ids: string[]) => void
  toggleZoneSelection: (id: string) => void
  deselectZone: (id: string) => void
  clearSelection: () => void
  setHoveredZone: (id: string | null) => void
}

// Zone Hierarchy Actions
export interface ZoneHierarchyActions {
  /** Toggle whether a zone is expanded in the tree view */
  toggleZoneExpanded: (zoneId: string) => void
  /** Expand all zones in the tree view */
  expandAllZones: () => void
  /** Collapse all zones in the tree view */
  collapseAllZones: () => void
  /** Set the travelability filter */
  setTravelabilityFilter: (filter: TravelabilityFilter) => void
  /** Get child zones of a parent zone */
  getChildZones: (parentId: string) => Zone[]
}

// Analysis Actions
export interface AnalysisActions {
  setAnalysisStatus: (status: AnalysisStatus) => void
  setAnalysisError: (error: string | null) => void
  startAnalysis: () => void
  completeAnalysis: () => void
  failAnalysis: (error: string) => void
  resetAnalysis: () => void
}

// History Actions
export interface HistoryActions {
  /** Internal helper - records current state before mutations */
  _recordHistory: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  clearHistory: () => void
}

// Editor Actions
export interface EditorActions {
  setEditorMode: (mode: EditorMode) => void
}

// Drawing Actions
export interface DrawingActions {
  startDrawing: (mode: DrawingMode, startPoint: Point) => void
  addDrawingVertex: (point: Point) => void
  updateDrawingPreview: (point: Point) => void
  completeDrawing: () => Point[] | null
  cancelDrawing: () => void
}

// Programmatic Zones Actions
export interface ProgrammaticZonesActions {
  /** Set programmatic zones */
  setProgrammaticZones: (zones: Zone[]) => void
  /** Clear programmatic zones */
  clearProgrammaticZones: () => void
  /** Set generation status */
  setProgrammaticZonesStatus: (status: ProgrammaticZonesStatus) => void
  /** Set generation error */
  setProgrammaticZonesError: (error: string | null) => void
  /** Get all visible zones (AI + manual + programmatic) */
  getAllVisibleZones: () => Zone[]
}

// AI Blocked Zones Actions
export interface AIBlockedZonesActions {
  /** Set AI-detected blocked zones */
  setAIBlockedZones: (zones: Zone[]) => void
  /** Clear AI blocked zones */
  clearAIBlockedZones: () => void
  /** Remove a single AI blocked zone by ID */
  removeAIBlockedZone: (id: string) => void
  /** Set AI analysis status */
  setAIBlockedZonesStatus: (status: AIBlockedZonesStatus) => void
  /** Set AI analysis error */
  setAIBlockedZonesError: (error: string | null) => void
}

// Combined Zones Actions
export interface CombinedZonesActions {
  /** Set combined zones (after merging programmatic + AI) */
  setCombinedZones: (zones: Zone[]) => void
  /** Clear combined zones */
  clearCombinedZones: () => void
}

// Combined store type
export interface ProjectStore
  extends
    ImageState,
    ViewportState,
    ZonesState,
    ProgrammaticZonesState,
    AIBlockedZonesState,
    CombinedZonesState,
    SelectionState,
    ZoneHierarchyState,
    AnalysisState,
    HistoryState,
    EditorState,
    DrawingState,
    TabState,
    RouteCalcState,
    ImageActions,
    ViewportActions,
    ZonesActions,
    ProgrammaticZonesActions,
    AIBlockedZonesActions,
    CombinedZonesActions,
    SelectionActions,
    ZoneHierarchyActions,
    AnalysisActions,
    HistoryActions,
    EditorActions,
    DrawingActions,
    TabActions,
    RouteCalcActions {}

// =============================================================================
// Config Store Types (for TDOA/anchor configuration)
// =============================================================================

/**
 * Config store state for TDOA/anchor configuration data
 */
export interface ConfigState {
  /** Floorplan configuration (from floorplans.json) */
  floorplanConfig: FloorplanConfig | null
  /** Anchors Map keyed by anchor name (from win_anchors.json) */
  anchors: Map<string, Anchor>
  /** TDOA pairs (from schedule.csv) */
  tdoaPairs: TDOAPair[]
  /** Coverage polygons (from coverage.json) */
  coveragePolygons: CoveragePolygon[]
  /** Loading state */
  isLoading: boolean
  /** Array of error messages from parsing */
  loadErrors: string[]
}

/**
 * Config store actions
 */
export interface ConfigActions {
  /** Set floorplan configuration */
  setFloorplanConfig: (config: FloorplanConfig | null) => void
  /** Set anchors Map */
  setAnchors: (anchors: Map<string, Anchor>) => void
  /** Set TDOA pairs */
  setTDOAPairs: (pairs: TDOAPair[]) => void
  /** Set coverage polygons */
  setCoveragePolygons: (polygons: CoveragePolygon[]) => void
  /** Set loading state */
  setLoading: (loading: boolean) => void
  /** Add an error message */
  addError: (error: string) => void
  /** Clear all error messages */
  clearErrors: () => void
  /** Clear all configuration data */
  clearAll: () => void
}

/**
 * Config store derived getters
 */
export interface ConfigGetters {
  /** Get 1D TDOA pairs (aisles) */
  get1DTDOAPairs: () => TDOAPair[]
  /** Get 2D TDOA pairs (coverage) */
  get2DTDOAPairs: () => TDOAPair[]
  /** Get anchor count */
  getAnchorCount: () => number
  /** Check if required data is loaded (floorplan + anchors) */
  hasRequiredData: () => boolean
  /** Check if any config data is loaded */
  hasAnyData: () => boolean
  /** Get all unique anchor names referenced in TDOA pairs */
  getReferencedAnchorNames: () => string[]
  /** Get coverage polygon count */
  getCoverageCount: () => number
}

/**
 * Combined config store type
 */
export interface ConfigStore
  extends ConfigState, ConfigActions, ConfigGetters {}
