/**
 * Zustand store for TDOA/anchor configuration data
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  FloorplanConfig,
  Anchor,
  TDOAPair,
  CoveragePolygon,
} from '@/types/config'

// =============================================================================
// State Interface
// =============================================================================

interface ConfigState {
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

// =============================================================================
// Actions Interface
// =============================================================================

interface ConfigActions {
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

// =============================================================================
// Derived Getters Interface
// =============================================================================

interface ConfigGetters {
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

// =============================================================================
// Combined Store Interface
// =============================================================================

interface ConfigStore extends ConfigState, ConfigActions, ConfigGetters {}

// =============================================================================
// Initial State
// =============================================================================

const initialState: ConfigState = {
  floorplanConfig: null,
  anchors: new Map(),
  tdoaPairs: [],
  coveragePolygons: [],
  isLoading: false,
  loadErrors: [],
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useConfigStore = create<ConfigStore>()(
  immer((set, get) => ({
    // Initial state
    ...initialState,

    // Actions
    setFloorplanConfig: (config) => {
      set((state) => {
        state.floorplanConfig = config
      })
    },

    setAnchors: (anchors) => {
      set((state) => {
        // Immer doesn't handle Map mutations well, so we replace directly
        state.anchors = anchors
      })
    },

    setTDOAPairs: (pairs) => {
      set((state) => {
        state.tdoaPairs = pairs
      })
    },

    setCoveragePolygons: (polygons) => {
      set((state) => {
        state.coveragePolygons = polygons
      })
    },

    setLoading: (loading) => {
      set((state) => {
        state.isLoading = loading
      })
    },

    addError: (error) => {
      set((state) => {
        state.loadErrors.push(error)
      })
    },

    clearErrors: () => {
      set((state) => {
        state.loadErrors = []
      })
    },

    clearAll: () => {
      set((state) => {
        state.floorplanConfig = null
        state.anchors = new Map()
        state.tdoaPairs = []
        state.coveragePolygons = []
        state.isLoading = false
        state.loadErrors = []
      })
    },

    // Getters
    get1DTDOAPairs: () => {
      return get().tdoaPairs.filter((p) => p.Dimension === '1D')
    },

    get2DTDOAPairs: () => {
      return get().tdoaPairs.filter((p) => p.Dimension === '2D')
    },

    getAnchorCount: () => {
      return get().anchors.size
    },

    hasRequiredData: () => {
      const state = get()
      return state.floorplanConfig !== null && state.anchors.size > 0
    },

    hasAnyData: () => {
      const state = get()
      return (
        state.floorplanConfig !== null ||
        state.anchors.size > 0 ||
        state.tdoaPairs.length > 0 ||
        state.coveragePolygons.length > 0
      )
    },

    getReferencedAnchorNames: () => {
      const state = get()
      const names = new Set<string>()
      for (const pair of state.tdoaPairs) {
        if (pair.Source) names.add(pair.Source)
        if (pair.Destination) names.add(pair.Destination)
      }
      return Array.from(names).sort()
    },

    getCoverageCount: () => {
      return get().coveragePolygons.length
    },
  }))
)

// =============================================================================
// Selector Hooks (for optimized component updates)
// =============================================================================

/**
 * Select floorplan config
 */
export const useFloorplanConfig = () =>
  useConfigStore((state) => state.floorplanConfig)

/**
 * Select anchors Map
 */
export const useAnchors = () => useConfigStore((state) => state.anchors)

/**
 * Select TDOA pairs
 */
export const useTDOAPairs = () => useConfigStore((state) => state.tdoaPairs)

/**
 * Select coverage polygons
 */
export const useCoveragePolygons = () =>
  useConfigStore((state) => state.coveragePolygons)

/**
 * Select loading state
 */
export const useConfigLoading = () => useConfigStore((state) => state.isLoading)

/**
 * Select errors
 */
export const useConfigErrors = () => useConfigStore((state) => state.loadErrors)

/**
 * Select whether required data is loaded
 */
export const useHasRequiredData = () =>
  useConfigStore((state) => state.hasRequiredData())

// =============================================================================
// Debug Helper
// =============================================================================

// Expose store to window for debugging in development
if (import.meta.env.DEV) {
  ;(window as unknown as { __CONFIG_STORE__: typeof useConfigStore }).__CONFIG_STORE__ =
    useConfigStore
}
