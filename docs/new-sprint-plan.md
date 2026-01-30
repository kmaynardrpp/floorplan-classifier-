# TDOA-Based Zone Detection System - Sprint Plan

## Project Overview

Rework the floorplan zone editor to use TDOA anchor data as the primary source of truth for aisle detection, add a 3-tab interface (Pre-AI Zones, Post-AI Zones, Shortest Route), and implement zone import/export in zones.json format.

**Reference Specification:** `docs/new-technique.md`

---

## Sprint 0: Preparation & Sample Data

**Goal:** Create sample data files and establish test fixtures for all subsequent sprints.

**Demo:** Sample files exist and are valid JSON/CSV.

---

### Task 0.1: Create Sample floorplans.json

**File:** `docs/files/floorplans.json`

**Description:** Create a realistic sample floorplan configuration file.

**Acceptance Criteria:**
- [ ] Valid JSON structure matching spec Section 1.1
- [ ] Realistic values: width=11507, height=4276, image_offset_x=5649, image_offset_y=1934, image_scale=0.482276
- [ ] Includes sublocation_uid for consistency with other files
- [ ] Comments in companion README explaining each field

**Validation:**
- JSON parses without error
- Values are within reasonable ranges

**Estimated Complexity:** Low

---

### Task 0.2: Create Sample win_anchors.json

**File:** `docs/files/win_anchors.json`

**Description:** Create sample anchor data with 15+ anchors positioned realistically.

**Acceptance Criteria:**
- [ ] Valid JSON array of anchors
- [ ] 15+ anchors with unique names following pattern "SAV3-XX-XXXXH/G"
- [ ] Positions distributed across the floorplan area
- [ ] All anchors have matching sublocation_uid
- [ ] Includes variety of aisle rows (horizontal and vertical)

**Validation:**
- JSON parses without error
- All anchors have required fields (name, position.x, position.y)

**Estimated Complexity:** Medium

---

### Task 0.3: Create Sample schedule.csv

**File:** `docs/files/schedule.csv`

**Description:** Create TDOA pair schedule with mix of 1D and 2D pairs.

**Acceptance Criteria:**
- [ ] Valid CSV with headers: #,Source,Destination,Slot,Dimension,Distance,Boundary,Margin
- [ ] 20+ rows total
- [ ] 15+ 1D pairs (aisles) with realistic margins (2000-4000mm)
- [ ] 5+ 2D pairs (coverage areas)
- [ ] Source/Destination names match anchors in win_anchors.json
- [ ] Slot identifiers follow pattern (e.g., "17A", "17B", "18A")

**Validation:**
- CSV parses without error
- All Source/Destination values exist in win_anchors.json

**Estimated Complexity:** Medium

---

### Task 0.4: Create Sample coverage.json

**File:** `docs/files/coverage.json`

**Description:** Create coverage polygon data with travel areas and exclusions.

**Acceptance Criteria:**
- [ ] Valid JSON with location_service_coverage array
- [ ] 3+ 2D polygons (travel lanes) with 4-8 vertices each
- [ ] 2+ 1D polygons (aisle blocks)
- [ ] 1+ exclusion polygon (blocked area)
- [ ] Coordinates in mm matching the floorplan coordinate system
- [ ] All polygons have matching sublocation_uid

**Validation:**
- JSON parses without error
- Polygon coordinates are within floorplan bounds

**Estimated Complexity:** Medium

---

### Task 0.5: Create Sample zones.json

**File:** `docs/files/zones.json`

**Description:** Create sample zone export file for import testing.

**Acceptance Criteria:**
- [ ] Valid JSON matching spec Section 1.6
- [ ] 10+ zones of various types (speed_restriction, aisle_path, travel_lane)
- [ ] Mix of shapes (4-vertex rectangles, more complex polygons)
- [ ] Realistic zone_id values
- [ ] Coordinates in mm

**Validation:**
- JSON parses without error
- All required fields present

**Estimated Complexity:** Medium

---

### Task 0.6: Create Test Fixtures Module

**File:** `src/__tests__/fixtures/configData.ts`

**Description:** TypeScript module exporting sample data for unit tests.

**Acceptance Criteria:**
- [ ] Export `sampleFloorplanConfig` constant
- [ ] Export `sampleAnchors` Map
- [ ] Export `sampleTDOAPairs` array
- [ ] Export `sampleCoveragePolygons` array
- [ ] Export `sampleZones` array
- [ ] All fixtures are type-safe and match interfaces

**Validation:**
- TypeScript compilation passes
- Fixtures can be imported in tests

**Estimated Complexity:** Low

---

## Sprint 1: Data Infrastructure & Type System

**Goal:** Establish all TypeScript interfaces, file parsers, and coordinate transformation system. By the end of this sprint, users can load configuration files and see them parsed correctly in the console/dev tools.

**Demo:** Load all 5 config files → Console shows parsed data with correct types → Coordinate transform converts a known point correctly.

---

### Task 1.1: Create Config Type Definitions

**File:** `src/types/config.ts`

**Description:** Define TypeScript interfaces for all configuration file formats.

**Acceptance Criteria:**
- [ ] `FloorplanConfig` interface:
  ```typescript
  interface FloorplanConfig {
    filename: string;
    width: number;
    height: number;
    image_offset_x: number;
    image_offset_y: number;
    image_scale: number;
    current_scale?: number;
    image_rotation?: number;
    sublocation_uid: string;
  }
  ```
- [ ] `AnchorPosition` interface (x, y, z, yaw, sl_uid)
- [ ] `Anchor` interface (name, uid, type, position, locked)
- [ ] `TDOAPair` interface:
  ```typescript
  interface TDOAPair {
    rowNumber: number;  // The "#" column
    Source: string;
    Destination: string;
    Slot: string;
    Dimension: '1D' | '2D';
    Distance: number;
    Boundary: string;
    Margin: number;
  }
  ```
- [ ] `CoverageGeometry` interface (shape, margin, threshold, points)
- [ ] `CoveragePolygon` interface (uid, type, exclusion, geometry, sublocation_uid)
- [ ] `ZoneTypeInfo` interface (id, name, display_name)
- [ ] `ZoneGeometry` interface (positions array)
- [ ] `ZonesJsonZone` interface (full zones.json zone format)
- [ ] `ZonesJson` interface (wrapper with zones array)
- [ ] Export all types from barrel file `src/types/index.ts`

**Tests:** `src/types/config.test.ts`
- Type assertion tests ensuring interfaces match spec examples
- TypeScript compilation passes with no errors

**Estimated Complexity:** Low

---

### Task 1.2: Update Zone Type with New Source Types

**File:** `src/types/zone.ts` (modify)

**Description:** Add new source types for programmatic and imported zones.

**Acceptance Criteria:**
- [ ] Update `source` field type: `'ai' | 'manual' | 'tdoa' | 'coverage' | 'imported'`
- [ ] Add `ZoneSource` type alias for the union
- [ ] Add `isProgrammaticZone(zone: Zone): boolean` helper
- [ ] Add `isImportedZone(zone: Zone): boolean` helper
- [ ] Update `createZone` function to accept new source types

**Tests:** `src/types/zone.test.ts`
- isProgrammaticZone returns true for 'tdoa' and 'coverage' sources
- isProgrammaticZone returns false for 'ai', 'manual', 'imported'
- isImportedZone returns true only for 'imported' source

**Estimated Complexity:** Low

---

### Task 1.3: Implement Floorplan Config Parser

**File:** `src/services/floorplanParser.ts`

**Description:** Parse floorplans.json and extract the active floorplan configuration.

**Acceptance Criteria:**
- [ ] `parseFloorplanConfig(json: unknown): FloorplanConfig` function
- [ ] Handles array format: extracts first floorplan from `floorplans` array
- [ ] Handles single object format: returns object directly
- [ ] Validates required fields exist with type checks:
  - filename (string)
  - width, height (positive numbers)
  - image_offset_x, image_offset_y (numbers)
  - image_scale (positive number)
- [ ] Throws `FloorplanParseError` with descriptive message for malformed input
- [ ] Returns strongly-typed FloorplanConfig

**Tests:** `src/services/floorplanParser.test.ts`
- Parses valid floorplans.json from fixtures correctly
- Extracts first floorplan from array
- Handles single object format
- Throws on missing required fields (test each field)
- Throws on invalid field types (string where number expected)
- Throws on non-object input

**Estimated Complexity:** Low

---

### Task 1.4: Implement Anchor Parser

**File:** `src/services/anchorParser.ts`

**Description:** Parse win_anchors.json and build a Map for O(1) lookup by anchor name.

**Acceptance Criteria:**
- [ ] `parseAnchors(json: unknown): Map<string, Anchor>` function
- [ ] Extracts from `win_anchors` array
- [ ] Creates Map keyed by anchor `name` field (case-sensitive)
- [ ] Validates each anchor has required fields:
  - name (non-empty string)
  - position.x, position.y (numbers)
- [ ] Skips invalid anchors with console.warn (does not throw)
- [ ] Returns empty Map for empty input array
- [ ] `getAnchorByName(anchors: Map<string, Anchor>, name: string): Anchor | undefined` helper

**Tests:** `src/services/anchorParser.test.ts`
- Parses valid win_anchors.json from fixtures
- Returns Map with correct size
- Lookup by name returns correct anchor
- Case-sensitive lookup (SAV3-01-0155G !== sav3-01-0155g)
- Logs warning and skips anchor with missing position
- Logs warning and skips anchor with missing name
- Returns empty Map for empty array
- Returns empty Map for missing win_anchors key

**Estimated Complexity:** Low

---

### Task 1.5: Implement TDOA Schedule Parser (CSV)

**File:** `src/services/tdoaParser.ts`

**Description:** Parse schedule.csv and extract TDOA pairs, distinguishing 1D (aisles) from 2D (coverage).

**Acceptance Criteria:**
- [ ] `parseTDOAPairs(csvString: string): TDOAPair[]` function
- [ ] Parses CSV with headers: #,Source,Destination,Slot,Dimension,Distance,Boundary,Margin
- [ ] Handles header row detection (skips first row)
- [ ] Converts numeric fields (Distance, Margin, #) to numbers
- [ ] Handles quoted fields (e.g., `"value,with,comma"`)
- [ ] Trims whitespace from all fields
- [ ] Skips empty rows
- [ ] Throws `CSVParseError` with line number for malformed rows
- [ ] `filter1DPairs(pairs: TDOAPair[]): TDOAPair[]` - returns only Dimension='1D'
- [ ] `filter2DPairs(pairs: TDOAPair[]): TDOAPair[]` - returns only Dimension='2D'

**Tests:** `src/services/tdoaParser.test.ts`
- Parses valid CSV from fixtures
- Handles quoted fields correctly
- Converts Distance/Margin to numbers
- Handles whitespace in fields
- filter1DPairs returns only Dimension=1D
- filter2DPairs returns only Dimension=2D
- Handles empty CSV (headers only) - returns empty array
- Throws with line number for malformed row (missing columns)
- Handles Windows line endings (CRLF)
- Handles Mac line endings (CR only)

**Estimated Complexity:** Medium (CSV parsing edge cases)

---

### Task 1.6: Implement Coverage Parser

**File:** `src/services/coverageParser.ts`

**Description:** Parse coverage.json and extract coverage polygons.

**Acceptance Criteria:**
- [ ] `parseCoveragePolygons(json: unknown): CoveragePolygon[]` function
- [ ] Extracts from `location_service_coverage` array
- [ ] Validates required geometry fields (shape, points array)
- [ ] Validates each point has x, y coordinates
- [ ] Skips invalid polygons with console.warn
- [ ] `filter1DCoverage(polygons: CoveragePolygon[]): CoveragePolygon[]` - type='1D'
- [ ] `filter2DCoverage(polygons: CoveragePolygon[]): CoveragePolygon[]` - type='2D'
- [ ] `filterTravelable(polygons: CoveragePolygon[]): CoveragePolygon[]` - exclusion=false
- [ ] `filterExclusions(polygons: CoveragePolygon[]): CoveragePolygon[]` - exclusion=true

**Tests:** `src/services/coverageParser.test.ts`
- Parses valid coverage.json from fixtures
- Returns correct number of polygons
- Filter functions work correctly
- Handles missing geometry gracefully (skips with warning)
- Handles polygon with no points (skips with warning)
- Returns empty array for missing location_service_coverage key

**Estimated Complexity:** Low

---

### Task 1.7: Implement Coordinate Transformer

**File:** `src/services/coordinateTransform.ts` (new implementation)

**Description:** Bidirectional coordinate transformation between real-world mm and image pixels.

**Note:** The existing `coordinateTransform.ts` handles crop offsets for sub-agent analysis. This task creates a NEW transformer for mm-to-pixel conversion using floorplan config.

**Acceptance Criteria:**
- [ ] `createFloorplanTransformer(config: FloorplanConfig): FloorplanTransformer` factory
- [ ] `FloorplanTransformer` interface:
  ```typescript
  interface FloorplanTransformer {
    toPixels(point: {x: number, y: number}): Point;
    toMm(point: {x: number, y: number}): Point;
    polygonToPixels(points: Point[]): Point[];
    polygonToMm(points: Point[]): Point[];
    isWithinBounds(point: Point): boolean;
  }
  ```
- [ ] Implements formulas from spec:
  - mm→px: `x = (mmX - offset_x) / scale`, `y = (mmY - offset_y) / scale`
  - px→mm: `mmX = pixelX * scale + offset_x`, `mmY = pixelY * scale + offset_y`
- [ ] `isWithinBounds` checks if pixel coordinates are within 0-width and 0-height
- [ ] Preserves floating point precision (no rounding in transforms)

**Tests:** `src/services/coordinateTransform.test.ts` (expand existing or new file)
- Round-trip conversion preserves values within epsilon (1e-6)
- Known test case: offset(5649, 1934), scale(0.482276) → mm(100000, 50000) → pixels(195635.7, 99717.8) approximately
- toPixels with point at offset returns (0, 0)
- toMm with point (0, 0) returns offset values
- Handles negative coordinate values
- isWithinBounds returns true for valid coordinates
- isWithinBounds returns false for negative coordinates
- isWithinBounds returns false for coordinates beyond image dimensions
- Polygon transforms preserve vertex count and order
- Empty polygon array returns empty array

**Estimated Complexity:** Medium (math precision)

---

### Task 1.8: Create Config Store

**File:** `src/store/useConfigStore.ts`

**Description:** Zustand store for loaded configuration data.

**Acceptance Criteria:**
- [ ] State fields:
  ```typescript
  floorplanConfig: FloorplanConfig | null;
  anchors: Map<string, Anchor>;
  tdoaPairs: TDOAPair[];
  coveragePolygons: CoveragePolygon[];
  isLoading: boolean;
  loadErrors: string[];
  ```
- [ ] Actions:
  - `setFloorplanConfig(config: FloorplanConfig | null)`
  - `setAnchors(anchors: Map<string, Anchor>)`
  - `setTDOAPairs(pairs: TDOAPair[])`
  - `setCoveragePolygons(polygons: CoveragePolygon[])`
  - `setLoading(loading: boolean)`
  - `addError(error: string)`
  - `clearErrors()`
  - `clearAll()` - resets all state to initial values
- [ ] Derived getters (implemented as selectors):
  - `get1DTDOAPairs(): TDOAPair[]`
  - `get2DTDOAPairs(): TDOAPair[]`
  - `getAnchorCount(): number`
  - `hasRequiredData(): boolean` - true if floorplanConfig and anchors loaded
- [ ] Uses immer middleware for immutable updates
- [ ] Initializes anchors as `new Map()`

**Tests:** `src/store/useConfigStore.test.ts`
- Setting config updates state correctly
- Setting anchors with Map works
- Derived getters return correct values
- clearAll resets all state including Map
- Error accumulation works (multiple addError calls)
- clearErrors empties the array
- hasRequiredData returns correct boolean

**Estimated Complexity:** Medium

---

### Task 1.9: Add ConfigStore Types to Store Types File

**File:** `src/types/store.ts` (modify)

**Description:** Add TypeScript interfaces for the config store.

**Acceptance Criteria:**
- [ ] `ConfigState` interface with all state fields
- [ ] `ConfigActions` interface with all action signatures
- [ ] `ConfigStore` interface extending both
- [ ] Export all new types

**Tests:**
- TypeScript compilation passes
- Types match implementation in useConfigStore

**Estimated Complexity:** Low

---

### Task 1.10: Create Config File Loader Component

**File:** `src/components/config/ConfigFileLoader.tsx`

**Description:** UI component for uploading configuration files with status indicators.

**Acceptance Criteria:**
- [ ] Individual file input for each config type:
  - Floorplan Config (accepts .json)
  - Anchors (accepts .json)
  - TDOA Schedule (accepts .csv)
  - Coverage (accepts .json)
- [ ] Status indicator for each:
  - Empty circle when not loaded
  - Checkmark when loaded successfully
  - X mark when load failed
- [ ] Displays filename when loaded (truncated if long)
- [ ] Displays count after parsing:
  - Anchors: "156 anchors"
  - TDOA: "48 pairs (32 1D, 16 2D)"
  - Coverage: "12 polygons"
- [ ] "Clear All" button to reset entire config store
- [ ] Error display area showing loadErrors from store
- [ ] Loading spinner when isLoading is true
- [ ] Calls appropriate parser on file upload
- [ ] Updates store with parsed data or error

**Tests:** `src/components/config/ConfigFileLoader.test.tsx`
- Component renders all file inputs
- File upload triggers parser (mock file)
- Status indicators reflect loaded state
- Count displays show correct numbers
- Clear All resets all states
- Error messages display when parse fails

**Estimated Complexity:** Medium

---

### Task 1.11: Create Config File Loader Barrel Export

**File:** `src/components/config/index.ts`

**Description:** Barrel export for config components.

**Acceptance Criteria:**
- [ ] Exports ConfigFileLoader component

**Validation:**
- Import works: `import { ConfigFileLoader } from '@/components/config'`

**Estimated Complexity:** Low

---

### Task 1.12: Integrate Config Loader into App

**File:** `src/App.tsx` (modify)

**Description:** Add ConfigFileLoader to the application layout.

**Acceptance Criteria:**
- [ ] ConfigFileLoader renders in sidebar area (above or below zone panel)
- [ ] Collapsible section with header "Configuration Files"
- [ ] Collapsed by default to save space
- [ ] Expands on click
- [ ] State persists during session (collapse state in local component state)

**Tests:**
- Integration test: Mount App, verify ConfigFileLoader renders
- Manual verification: Load files, see parsed data in dev tools

**Estimated Complexity:** Low

---

## Sprint 2: Programmatic Zone Generation

**Goal:** Generate aisle zones from 1D TDOA pairs and travel lane zones from 2D coverage polygons. Users can see generated zones on the canvas.

**Demo:** Load config files → Click "Generate Zones" → See aisle rectangles and travel lanes rendered on the floorplan with distinct styling.

---

### Task 2.1: Implement Aisle Rectangle Geometry Calculator

**File:** `src/utils/aisleGeometry.ts`

**Description:** Pure geometry functions for calculating aisle rectangle vertices.

**Acceptance Criteria:**
- [ ] `calculateAisleRectangle(sourcePos: Point, destPos: Point, margin: number): Point[]` function
- [ ] Returns 4 vertices forming a rectangle:
  - Length: distance from source to dest
  - Width: margin (applied perpendicular to the source-dest line)
- [ ] Algorithm:
  ```typescript
  const dx = destPos.x - sourcePos.x;
  const dy = destPos.y - sourcePos.y;
  const angle = Math.atan2(dy, dx);
  const halfWidth = margin / 2;
  const perpX = -Math.sin(angle) * halfWidth;
  const perpY = Math.cos(angle) * halfWidth;
  // Return 4 corners in clockwise order
  ```
- [ ] Returns vertices in consistent winding order (clockwise)
- [ ] Handles edge cases:
  - Zero-length (source === dest): returns empty array
  - Zero margin: returns degenerate rectangle (line)
  - Negative margin: treats as positive (Math.abs)

**Tests:** `src/utils/aisleGeometry.test.ts`
- Horizontal aisle (dy=0): rectangle aligned with X axis
- Vertical aisle (dx=0): rectangle aligned with Y axis
- Diagonal aisle: rectangle at correct angle
- Margin applied correctly to width
- Vertices form valid rectangle (check perpendicularity via dot product)
- Returns empty array for zero-length
- Handles negative margin

**Estimated Complexity:** Medium (geometry math)

---

### Task 2.2: Implement Aisle Zone Generator

**File:** `src/services/aisleGenerator.ts`

**Description:** Generate aisle Zone objects from TDOA pairs using geometry calculator.

**Acceptance Criteria:**
- [ ] `generateAisleFromTDOA(pair: TDOAPair, anchors: Map<string, Anchor>, transformer: FloorplanTransformer): Zone | null`
- [ ] Looks up source and destination anchors by name
- [ ] Returns null with console.warn if either anchor not found
- [ ] Calls `calculateAisleRectangle` with anchor positions and pair.Margin
- [ ] Returns null if rectangle calculation returns empty (zero-length)
- [ ] Transforms vertices from mm to pixels using transformer
- [ ] Returns Zone with:
  ```typescript
  {
    id: `aisle_${pair.Slot}_${pair.rowNumber}`,
    name: `Aisle ${pair.Slot}`,
    type: 'aisle_path',
    vertices: transformedVertices,
    confidence: 1.0,
    source: 'tdoa',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        tdoaSlot: pair.Slot,
        sourceAnchor: pair.Source,
        destAnchor: pair.Destination,
        marginMm: String(pair.Margin),
        distanceMm: String(pair.Distance),
      }
    },
    createdAt: now,
    updatedAt: now,
  }
  ```
- [ ] `generateAllAisles(pairs: TDOAPair[], anchors: Map<string, Anchor>, transformer: FloorplanTransformer): Zone[]`
  - Filters to 1D pairs only
  - Maps each pair through generateAisleFromTDOA
  - Filters out null results

**Tests:** `src/services/aisleGenerator.test.ts`
- Generates valid zone from known anchor positions
- Returns null for missing source anchor
- Returns null for missing destination anchor
- Zone has correct type 'aisle_path'
- Zone has correct source 'tdoa'
- Metadata contains all expected customProperties
- generateAllAisles returns correct count
- generateAllAisles filters to 1D pairs only

**Estimated Complexity:** Medium

---

### Task 2.3: Implement Travel Lane Zone Generator

**File:** `src/services/travelLaneGenerator.ts`

**Description:** Generate travel lane zones from 2D coverage polygons.

**Acceptance Criteria:**
- [ ] `generateTravelLaneFromCoverage(polygon: CoveragePolygon, transformer: FloorplanTransformer, index: number): Zone | null`
- [ ] Returns null if polygon.exclusion is true (not travelable)
- [ ] Returns null if polygon has fewer than 3 points
- [ ] Transforms polygon points from mm to pixels
- [ ] Returns Zone with:
  ```typescript
  {
    id: `travel_lane_${polygon.uid}`,
    name: `Travel Lane ${index + 1}`,
    type: 'travel_lane',
    vertices: transformedVertices,
    confidence: 1.0,
    source: 'coverage',
    metadata: {
      ...DEFAULT_ZONE_METADATA,
      customProperties: {
        coverageUid: polygon.uid,
        coverageType: polygon.type,
        marginMm: String(polygon.geometry.margin || 0),
      }
    },
    createdAt: now,
    updatedAt: now,
  }
  ```
- [ ] `generateAllTravelLanes(polygons: CoveragePolygon[], transformer: FloorplanTransformer): Zone[]`
  - Filters to 2D type and non-exclusion
  - Maps each polygon through generateTravelLaneFromCoverage
  - Filters out null results

**Tests:** `src/services/travelLaneGenerator.test.ts`
- Generates zone from valid coverage polygon
- Transforms coordinates correctly
- Returns null for exclusion polygons
- Returns null for polygons with < 3 points
- Zone has correct type 'travel_lane'
- Zone has correct source 'coverage'
- generateAllTravelLanes filters correctly

**Estimated Complexity:** Medium

---

### Task 2.4: Implement Programmatic Zone Manager

**File:** `src/services/programmaticZoneGenerator.ts`

**Description:** Orchestrate generation of all programmatic zones.

**Acceptance Criteria:**
- [ ] `generateAllProgrammaticZones(configStore: ConfigStoreState, transformer: FloorplanTransformer): Zone[]`
- [ ] Generates aisles from all 1D TDOA pairs
- [ ] Generates travel lanes from all 2D coverage (non-exclusion)
- [ ] Combines into single array
- [ ] `deduplicateZones(zones: Zone[]): Zone[]` helper
  - Removes zones with duplicate IDs
  - Keeps first occurrence
  - Logs warning for duplicates
- [ ] Returns deduplicated combined zone array
- [ ] `getGenerationStats(zones: Zone[]): GenerationStats` helper
  ```typescript
  interface GenerationStats {
    totalZones: number;
    aisleZones: number;
    travelLaneZones: number;
    skippedDuplicates: number;
  }
  ```

**Tests:** `src/services/programmaticZoneGenerator.test.ts`
- Generates expected number of zones from test data
- Combines aisles and travel lanes
- Handles empty config gracefully (returns empty array)
- Handles missing anchors gracefully
- Deduplication removes duplicates
- Stats are accurate

**Estimated Complexity:** Medium

---

### Task 2.5: Add Programmatic Zones State to Project Store

**File:** `src/store/useProjectStore.ts` (modify)

**Description:** Store programmatic zones separately from AI/manual zones.

**Acceptance Criteria:**
- [ ] New state fields:
  ```typescript
  programmaticZones: Zone[];
  programmaticZonesError: string | null;
  isGeneratingProgrammaticZones: boolean;
  ```
- [ ] New actions:
  - `setProgrammaticZones(zones: Zone[])`
  - `clearProgrammaticZones()`
  - `setProgrammaticZonesError(error: string | null)`
  - `setIsGeneratingProgrammaticZones(generating: boolean)`
- [ ] `getAllDisplayedZones()` getter that returns appropriate zones based on context

**Tests:** `src/store/useProjectStore.test.ts` (expand)
- setProgrammaticZones updates state
- clearProgrammaticZones resets array to empty
- Error state management works
- Programmatic zones are separate from regular zones array

**Estimated Complexity:** Low

---

### Task 2.6: Update Store Types for Programmatic Zones

**File:** `src/types/store.ts` (modify)

**Description:** Add types for programmatic zones state and actions.

**Acceptance Criteria:**
- [ ] `ProgrammaticZonesState` interface
- [ ] `ProgrammaticZonesActions` interface
- [ ] Update `ProjectStore` to extend new interfaces

**Tests:**
- TypeScript compilation passes

**Estimated Complexity:** Low

---

### Task 2.7: Create Generate Zones Hook

**File:** `src/hooks/useProgrammaticZones.ts`

**Description:** Custom hook to generate programmatic zones from config data.

**Acceptance Criteria:**
- [ ] `useProgrammaticZones()` hook returns:
  ```typescript
  {
    generate: () => Promise<void>;
    isGenerating: boolean;
    error: string | null;
    stats: GenerationStats | null;
    canGenerate: boolean;  // true if required config is loaded
  }
  ```
- [ ] `generate()` function:
  - Sets isGenerating true
  - Creates transformer from floorplanConfig
  - Calls generateAllProgrammaticZones
  - Updates programmaticZones in project store
  - Handles errors gracefully
  - Sets isGenerating false
- [ ] `canGenerate` checks if floorplanConfig and anchors are loaded
- [ ] Uses useConfigStore for input data
- [ ] Uses useProjectStore to store results

**Tests:** `src/hooks/useProgrammaticZones.test.ts`
- Hook returns correct initial state
- generate() creates zones when config is loaded
- Returns correct stats after generation
- Handles errors gracefully
- canGenerate reflects config state

**Estimated Complexity:** Medium

---

### Task 2.8: Update ZoneOverlayLayer for Source-Based Styling

**File:** `src/components/canvas/ZoneOverlayLayer.tsx` (modify)

**Description:** Add distinct visual styling for programmatic zones.

**Acceptance Criteria:**
- [ ] TDOA-sourced zones ('tdoa'):
  - Blue-tinted fill (#3B82F6 at 40% opacity)
  - Solid stroke
  - "T" badge or indicator
- [ ] Coverage-sourced zones ('coverage'):
  - Green-tinted fill (#10B981 at 40% opacity)
  - Solid stroke
  - "C" badge or indicator
- [ ] Maintain existing travelability styling (hatching for non-travelable)
- [ ] Add source to tooltip display
- [ ] Render programmaticZones in addition to regular zones

**Tests:**
- Visual verification: Different sources render with different colors
- Existing zone rendering still works
- Tooltip shows source type

**Estimated Complexity:** Medium

---

### Task 2.9: Add Programmatic Zones to Hooks Barrel Export

**File:** `src/hooks/index.ts` (modify)

**Description:** Export the new hook.

**Acceptance Criteria:**
- [ ] Export `useProgrammaticZones`

**Validation:**
- Import works: `import { useProgrammaticZones } from '@/hooks'`

**Estimated Complexity:** Low

---

## Sprint 3: Zone Import/Export

**Goal:** Import zones from zones.json format and export current zones to zones.json format.

**Demo:** Import zones.json → See zones on canvas → Modify a zone → Export → Re-import → Verify round-trip fidelity.

---

### Task 3.1: Implement Zone Type Mapper

**File:** `src/services/zoneTypeMapper.ts`

**Description:** Map between zones.json zone types and internal zone types.

**Acceptance Criteria:**
- [ ] Zone type mapping table:
  ```typescript
  const ZONE_TYPE_MAP: Record<string, { internal: ZoneType; id: number; displayName: string }> = {
    'speed_restriction': { internal: 'restricted', id: 29, displayName: 'Speed restriction zone' },
    'height_restriction': { internal: 'restricted', id: 30, displayName: 'Height restriction zone' },
    'keepout': { internal: 'hazard_zone', id: 31, displayName: 'Keep-out zone' },
    'aisle_path': { internal: 'aisle_path', id: 32, displayName: 'Aisle path' },
    'travel_lane': { internal: 'travel_lane', id: 33, displayName: 'Travel lane' },
    // ... more mappings
  };
  ```
- [ ] `mapExternalToInternal(externalType: string): ZoneType`
  - Returns mapped internal type or original if not found
- [ ] `mapInternalToExternal(internalType: ZoneType): string`
  - Returns mapped external type or original if not found
- [ ] `getZoneTypeId(internalType: ZoneType): number`
  - Returns type ID for export
- [ ] `getZoneTypeDisplayName(internalType: ZoneType): string`
  - Returns human-readable display name

**Tests:** `src/services/zoneTypeMapper.test.ts`
- Maps known external types correctly
- Maps known internal types correctly
- Round-trip mapping preserves known types
- Unknown types pass through unchanged
- getZoneTypeId returns correct IDs
- getZoneTypeDisplayName returns correct names

**Estimated Complexity:** Low

---

### Task 3.2: Implement Zone ID Generator

**File:** `src/utils/idGenerator.ts`

**Description:** Generate unique IDs for zones.

**Acceptance Criteria:**
- [ ] `generateZoneId(): number` - Generate incrementing zone_id starting from 1000
- [ ] `generateUID(): string` - Generate UUID v4 for zone IDs
- [ ] `resetZoneIdCounter()` - Reset counter (for testing)
- [ ] Counter persists within session (module-level variable)

**Tests:** `src/utils/idGenerator.test.ts`
- generateZoneId returns incrementing numbers
- Multiple calls return unique values
- generateUID returns valid UUID format (regex match)
- resetZoneIdCounter resets the counter

**Estimated Complexity:** Low

---

### Task 3.3: Implement Zones JSON Parser

**File:** `src/services/zoneImporter.ts`

**Description:** Parse zones.json format.

**Acceptance Criteria:**
- [ ] `parseZonesJson(json: unknown): ZonesJsonZone[]` function
- [ ] Extracts from `zones` array
- [ ] Validates each zone has required fields:
  - name (string)
  - zone_geometry.positions (array with 3+ items)
  - Each position has x, y (numbers)
- [ ] Skips invalid zones with console.warn
- [ ] Applies defaults for optional fields:
  - active: true
  - shape: 'polygon'
  - zone_mode: 'ALWAYS_ACTIVE'
  - priority: 0
- [ ] Throws `ZoneParseError` for completely malformed input

**Tests:** `src/services/zoneImporter.test.ts`
- Parses valid zones.json from fixtures
- Applies defaults for missing optional fields
- Skips zones with missing name
- Skips zones with < 3 positions
- Throws for non-object input

**Estimated Complexity:** Low

---

### Task 3.4: Implement Full Zone Importer

**File:** `src/services/zoneImporter.ts` (expand)

**Description:** Full zone import with coordinate transformation.

**Acceptance Criteria:**
- [ ] `importZones(data: unknown, transformer: FloorplanTransformer): Zone[]`
- [ ] Calls parseZonesJson to get raw zones
- [ ] For each zone:
  - Generates ID if no uid present
  - Maps zone type using zoneTypeMapper
  - Transforms coordinates from mm to pixels
  - Creates internal Zone object with source: 'imported'
  - Preserves original metadata in customProperties:
    - originalZoneId
    - originalType
    - zoneMode
    - priority
- [ ] Returns array of internal Zone objects
- [ ] `ImportOptions` type:
  ```typescript
  interface ImportOptions {
    mode: 'replace' | 'merge';
    skipDuplicates?: boolean;
  }
  ```

**Tests:** `src/services/zoneImporter.test.ts` (expand)
- Imports valid zones.json correctly
- Transforms coordinates correctly
- Generates IDs for zones without uid
- Maps zone types correctly
- Preserves original zone_id in metadata
- Source is 'imported'

**Estimated Complexity:** Medium

---

### Task 3.5: Implement Zone Exporter

**File:** `src/services/zoneExporter.ts`

**Description:** Export internal zones to zones.json format.

**Acceptance Criteria:**
- [ ] `exportZones(zones: Zone[], transformer: FloorplanTransformer, config: ExportConfig): ZonesJson`
  ```typescript
  interface ExportConfig {
    projectUid: string;
    sublocationUid: string;
  }
  ```
- [ ] For each zone:
  - Transforms coordinates from pixels to mm
  - Maps internal type to external type
  - Generates zone_id if not in metadata
  - Creates ZonesJsonZone object:
    ```typescript
    {
      name: zone.name,
      uid: zone.id,
      zone_id: metadata.originalZoneId || generateZoneId(),
      active: true,
      shape: 'polygon',
      zone_type: { id, name, display_name },
      zone_type_name: externalType,
      zone_geometry: { positions: transformedVertices },
      zone_mode: metadata.zoneMode || 'ALWAYS_ACTIVE',
      priority: metadata.priority || 0,
      sublocation_uid: config.sublocationUid,
      project_uid: config.projectUid,
      created_at: zone.createdAt,
      updated_at: new Date().toISOString(),
    }
    ```
- [ ] Returns `{ zones: [...] }` wrapper object
- [ ] `downloadZonesJson(data: ZonesJson, filename: string): void`
  - Creates Blob from JSON
  - Triggers download with specified filename

**Tests:** `src/services/zoneExporter.test.ts`
- Exports zones to valid JSON structure
- Transforms coordinates correctly (pixels to mm)
- Maps zone types correctly
- Generates zone_ids for zones without them
- Preserves existing zone_ids
- downloadZonesJson creates correct Blob (mock download)

**Estimated Complexity:** Medium

---

### Task 3.6: Create Import/Export UI Components

**File:** `src/components/zones/ZoneImportExport.tsx`

**Description:** UI buttons and dialogs for import/export operations.

**Acceptance Criteria:**
- [ ] `ZoneImportButton` component:
  - File input accepting .json
  - On file select, parses and imports zones
  - Shows loading spinner during import
  - Shows success toast with zone count
  - Shows error toast on failure
- [ ] `ZoneExportButton` component:
  - On click, opens filename prompt (default: 'zones.json')
  - Exports current zones (programmatic + manual)
  - Shows success toast on download
  - Disabled if no zones to export
- [ ] Import mode selector (radio buttons):
  - "Replace all zones"
  - "Merge with existing"
- [ ] Uses useProjectStore for zones
- [ ] Uses useConfigStore for transformer config

**Tests:** `src/components/zones/ZoneImportExport.test.tsx`
- Import button renders and accepts file
- Export button renders and triggers download
- Mode selector works
- Disabled state when no zones
- Success/error toasts appear

**Estimated Complexity:** Medium

---

### Task 3.7: Create Zones Component Barrel Export

**File:** `src/components/zones/index.ts`

**Description:** Barrel export for zone components.

**Acceptance Criteria:**
- [ ] Export ZoneImportExport
- [ ] Export ZoneTypeSelector (existing)

**Validation:**
- Import works: `import { ZoneImportExport } from '@/components/zones'`

**Estimated Complexity:** Low

---

### Task 3.8: Wire Import/Export to Zone Panel

**File:** `src/components/panel/ZonePanel.tsx` (modify)

**Description:** Add import/export buttons to the zone panel header.

**Acceptance Criteria:**
- [ ] Import and Export buttons in panel header toolbar
- [ ] Buttons positioned after existing controls
- [ ] Import button disabled when no floorplan config loaded
- [ ] Export button disabled when no zones exist
- [ ] Uses ZoneImportExport components

**Tests:**
- Buttons render in panel header
- Disabled states work correctly
- Import/export functionality accessible

**Estimated Complexity:** Low

---

### Task 3.9: Integration Test: Import/Export Round-Trip

**File:** `src/__tests__/integration/zoneImportExport.test.ts`

**Description:** End-to-end test for import/export fidelity.

**Acceptance Criteria:**
- [ ] Test case 1: Basic round-trip
  - Load floorplan config fixture
  - Import zones.json fixture
  - Verify zone count matches
  - Export zones
  - Re-import exported data
  - Verify zone count still matches
  - Verify zone positions match (within 0.1px tolerance)
- [ ] Test case 2: Metadata preservation
  - Import zone with all metadata fields
  - Export
  - Re-import
  - Verify zone_id preserved
  - Verify zone_type preserved
  - Verify priority preserved
- [ ] Test case 3: Merge mode
  - Import 5 zones
  - Add 2 manual zones
  - Import 3 more zones in merge mode
  - Verify total count is 10

**Tests:** This IS the test file

**Estimated Complexity:** Medium

---

## Sprint 4: Tab Navigation System

**Goal:** Implement 3-tab interface (Pre-AI Zones, Post-AI Zones, Shortest Route) with AI toggle.

**Demo:** Switch between tabs → See different zone sets → Toggle AI mode → See behavior change.

---

### Task 4.1: Add Tab State to Project Store

**File:** `src/store/useProjectStore.ts` (modify)

**Description:** Add tab navigation state and AI toggle.

**Acceptance Criteria:**
- [ ] New state fields:
  ```typescript
  activeTab: 'pre-ai' | 'post-ai' | 'route';
  useAIDetection: boolean;
  ```
- [ ] New actions:
  - `setActiveTab(tab: 'pre-ai' | 'post-ai' | 'route')`
  - `setUseAIDetection(enabled: boolean)`
- [ ] Initialize activeTab to 'pre-ai'
- [ ] Initialize useAIDetection to true

**Tests:** `src/store/useProjectStore.test.ts` (expand)
- Tab state changes correctly
- AI toggle changes correctly
- Initial state has activeTab='pre-ai'
- Initial state has useAIDetection=true

**Estimated Complexity:** Low

---

### Task 4.2: Update Store Types for Tabs

**File:** `src/types/store.ts` (modify)

**Description:** Add types for tab state.

**Acceptance Criteria:**
- [ ] `TabType` type alias: `'pre-ai' | 'post-ai' | 'route'`
- [ ] `TabState` interface
- [ ] `TabActions` interface
- [ ] Update `ProjectStore` to extend new interfaces

**Tests:**
- TypeScript compilation passes

**Estimated Complexity:** Low

---

### Task 4.3: Create TabBar Component

**File:** `src/components/tabs/TabBar.tsx`

**Description:** Tab navigation bar with 3 tabs.

**Acceptance Criteria:**
- [ ] Three tabs with labels:
  - "Pre-AI Zones"
  - "Post-AI Zones"
  - "Shortest Route"
- [ ] Visual indicator for active tab:
  - Active: Blue background, white text
  - Inactive: Transparent background, gray text
  - Hover: Light gray background
- [ ] Click handler calls setActiveTab
- [ ] Accessible:
  - role="tablist" on container
  - role="tab" on each tab
  - aria-selected attribute
  - Keyboard navigation (arrow keys)
- [ ] Responsive: tabs stack on mobile or use scrollable container

**Tests:** `src/components/tabs/TabBar.test.tsx`
- Renders three tabs
- Active tab has visual indicator
- Click changes active tab
- Keyboard left/right navigation works
- ARIA attributes present

**Estimated Complexity:** Medium

---

### Task 4.4: Create AIToggle Component

**File:** `src/components/tabs/AIToggle.tsx`

**Description:** Checkbox toggle for AI detection mode.

**Acceptance Criteria:**
- [ ] Checkbox with label "Use AI Detection"
- [ ] Checked state reflects useAIDetection from store
- [ ] onChange calls setUseAIDetection
- [ ] Tooltip: "Enable AI-powered zone detection. Disable for pure programmatic detection."
- [ ] Styled to match app theme

**Tests:** `src/components/tabs/AIToggle.test.tsx`
- Renders checkbox with label
- Checked state reflects store
- Click toggles state in store

**Estimated Complexity:** Low

---

### Task 4.5: Create PreAIZonesTab Component

**File:** `src/components/tabs/PreAIZonesTab.tsx`

**Description:** Tab content for programmatic zone generation.

**Acceptance Criteria:**
- [ ] Section header: "Programmatic Zone Detection"
- [ ] Source toggles with checkboxes:
  - "1D TDOA Pairs (Aisles)" - shows count when config loaded
  - "2D Coverage (Travel Lanes)" - shows count when config loaded
- [ ] Each toggle enabled/disabled controls what sources are used
- [ ] "Generate Zones" button:
  - Disabled if no config loaded
  - Shows loading state during generation
  - Calls useProgrammaticZones().generate()
- [ ] "Clear Generated" button:
  - Disabled if no programmatic zones exist
  - Clears programmaticZones from store
- [ ] Generated zone count display: "Generated: X aisle zones, Y travel lane zones"
- [ ] Error display area if generation fails
- [ ] Uses useProgrammaticZones hook

**Tests:** `src/components/tabs/PreAIZonesTab.test.tsx`
- Component renders all elements
- Source toggles work
- Generate button triggers generation (mock hook)
- Clear button clears zones
- Displays correct counts
- Shows error when generation fails

**Estimated Complexity:** Medium

---

### Task 4.6: Create PostAIZonesTab Component

**File:** `src/components/tabs/PostAIZonesTab.tsx`

**Description:** Refactor existing AI analysis UI into tab content.

**Acceptance Criteria:**
- [ ] Contains existing AnalyzeButton component
- [ ] Contains existing AnalysisProgress component
- [ ] Contains existing AnalysisError component
- [ ] When useAIDetection is false:
  - Shows message: "AI detection is disabled. Enable it using the toggle above."
  - All controls disabled/hidden
- [ ] When useAIDetection is true:
  - Normal AI analysis functionality
- [ ] No functional changes to existing AI analysis

**Tests:** `src/components/tabs/PostAIZonesTab.test.tsx`
- Renders analysis controls when AI enabled
- Shows disabled message when AI disabled
- Controls disabled when AI disabled

**Estimated Complexity:** Medium (refactoring)

---

### Task 4.7: Create ShortestRouteTab Placeholder

**File:** `src/components/tabs/ShortestRouteTab.tsx`

**Description:** Placeholder tab for route calculator (full implementation in Sprint 5).

**Acceptance Criteria:**
- [ ] Section header: "Route Calculator"
- [ ] Instructions text: "Click two points on the map to calculate the shortest route."
- [ ] Placeholder state displays:
  - Start Point: "Click on map to set..."
  - End Point: "Click on map to set..."
- [ ] Disabled buttons:
  - "Calculate Route" (disabled)
  - "Clear Route" (disabled)
- [ ] Route distance display: "Route Distance: -- m"
- [ ] "Coming in Sprint 5" badge or note

**Tests:** `src/components/tabs/ShortestRouteTab.test.tsx`
- Renders placeholder UI
- Buttons are disabled
- Placeholder text visible

**Estimated Complexity:** Low

---

### Task 4.8: Create Tab Content Container

**File:** `src/components/tabs/TabContent.tsx`

**Description:** Container that renders correct tab content based on active tab.

**Acceptance Criteria:**
- [ ] Reads activeTab from store
- [ ] Renders PreAIZonesTab when activeTab='pre-ai'
- [ ] Renders PostAIZonesTab when activeTab='post-ai'
- [ ] Renders ShortestRouteTab when activeTab='route'
- [ ] Smooth fade transition between tabs (optional CSS animation)

**Tests:** `src/components/tabs/TabContent.test.tsx`
- Renders correct content for each tab value
- Switches correctly when tab changes

**Estimated Complexity:** Low

---

### Task 4.9: Create Tabs Component Barrel Export

**File:** `src/components/tabs/index.ts`

**Description:** Barrel export for tab components.

**Acceptance Criteria:**
- [ ] Export TabBar
- [ ] Export AIToggle
- [ ] Export TabContent
- [ ] Export PreAIZonesTab
- [ ] Export PostAIZonesTab
- [ ] Export ShortestRouteTab

**Validation:**
- Import works: `import { TabBar, TabContent } from '@/components/tabs'`

**Estimated Complexity:** Low

---

### Task 4.10: Update Canvas Zone Filtering by Tab

**File:** `src/components/canvas/ZoneOverlayLayer.tsx` (modify)

**Description:** Filter displayed zones based on active tab.

**Acceptance Criteria:**
- [ ] Read activeTab from store
- [ ] Pre-AI tab (activeTab='pre-ai'):
  - Show programmaticZones only
  - Hide AI zones and manual zones
- [ ] Post-AI tab (activeTab='post-ai'):
  - Show AI zones (source='ai')
  - Show manual zones (source='manual')
  - Hide programmatic zones
- [ ] Route tab (activeTab='route'):
  - Show all travelable zones from any source
  - Use isTravelable() to filter
  - Apply route-specific styling (highlight travelable areas)
- [ ] Existing travelability filter still applies within each tab

**Tests:** `src/components/canvas/ZoneOverlayLayer.test.tsx`
- Correct zones shown for pre-ai tab
- Correct zones shown for post-ai tab
- Correct zones shown for route tab
- Tab switch updates display immediately

**Estimated Complexity:** Medium

---

### Task 4.11: Integrate Tabs into Main Layout

**File:** `src/components/layout/MainLayout.tsx` (modify)

**Description:** Add TabBar and TabContent to application layout.

**Acceptance Criteria:**
- [ ] TabBar renders above sidebar content
- [ ] AIToggle renders next to TabBar (right side)
- [ ] TabContent renders inside sidebar where analysis controls were
- [ ] Existing sidebar structure preserved
- [ ] Layout adapts to tab changes
- [ ] Remove or hide old analysis controls (now in PostAIZonesTab)

**Tests:**
- Visual verification: Tabs appear in correct position
- Tab switching works
- AI toggle works
- Layout looks correct

**Estimated Complexity:** Medium

---

## Sprint 5: Shortest Route Calculator

**Goal:** Implement pathfinding between two user-selected points through travelable zones.

**Demo:** Click start point → Click end point → See calculated route displayed → See distance.

---

### Task 5.1: Create Route Types

**File:** `src/types/route.ts`

**Description:** TypeScript interfaces for route calculation.

**Acceptance Criteria:**
- [ ] Types:
  ```typescript
  interface GraphNode {
    id: string;
    position: Point;
    zoneId: string;
  }

  interface GraphEdge {
    from: string;  // node id
    to: string;    // node id
    weight: number;  // distance in pixels
  }

  interface NavigationGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
  }

  interface PathSegment {
    from: Point;
    to: Point;
    distance: number;
    zoneId: string;
  }

  interface RoutePath {
    points: Point[];
    totalDistance: number;  // in pixels
    segments: PathSegment[];
    success: boolean;
    error?: string;
  }

  interface RouteState {
    startPoint: Point | null;
    endPoint: Point | null;
    calculatedRoute: RoutePath | null;
    isCalculating: boolean;
  }
  ```
- [ ] Export all types from `src/types/index.ts`

**Tests:**
- TypeScript compilation passes

**Estimated Complexity:** Low

---

### Task 5.2: Implement Zone Centroid Calculator

**File:** `src/utils/geometry.ts` (expand)

**Description:** Calculate centroid of a polygon zone.

**Acceptance Criteria:**
- [ ] `calculateCentroid(vertices: Point[]): Point`
- [ ] Uses signed area formula for accurate centroid:
  ```typescript
  // For non-self-intersecting polygon
  let cx = 0, cy = 0, area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    area += cross;
    cx += (vertices[i].x + vertices[j].x) * cross;
    cy += (vertices[i].y + vertices[j].y) * cross;
  }
  area /= 2;
  return { x: cx / (6 * area), y: cy / (6 * area) };
  ```
- [ ] Handles edge cases:
  - Empty array: returns { x: 0, y: 0 }
  - Single point: returns that point
  - Two points: returns midpoint

**Tests:** `src/utils/geometry.test.ts` (expand)
- Rectangle centroid is center
- Triangle centroid is correct
- Handles edge cases

**Estimated Complexity:** Low

---

### Task 5.3: Implement Zone Adjacency Detection

**File:** `src/utils/zoneAdjacency.ts`

**Description:** Detect which zones are adjacent or overlapping.

**Acceptance Criteria:**
- [ ] `areZonesAdjacent(zone1: Zone, zone2: Zone, threshold: number = 5): boolean`
- [ ] Two zones are adjacent if:
  - Their bounding boxes overlap or are within threshold pixels
  - AND they share at least one edge segment within threshold distance
  - OR their polygons intersect
- [ ] Uses bounding box pre-check for performance
- [ ] `getBoundingBox(vertices: Point[]): { minX, minY, maxX, maxY }`
- [ ] `doBoundingBoxesOverlap(bb1, bb2, threshold): boolean`
- [ ] `doEdgesIntersect(p1, p2, p3, p4): boolean` - line segment intersection
- [ ] `pointToSegmentDistance(point, segStart, segEnd): number`

**Tests:** `src/utils/zoneAdjacency.test.ts`
- Adjacent rectangles sharing edge return true
- Separated rectangles return false
- Overlapping rectangles return true
- Zones touching at corner return true (within threshold)
- Non-adjacent zones return false
- Bounding box functions work correctly

**Estimated Complexity:** High (polygon math)

---

### Task 5.4: Implement Graph Builder

**File:** `src/utils/graphBuilder.ts`

**Description:** Build navigation graph from travelable zones.

**Acceptance Criteria:**
- [ ] `buildNavigationGraph(zones: Zone[]): NavigationGraph`
- [ ] For each travelable zone:
  - Create a GraphNode at the zone's centroid
  - Node ID = zone ID
- [ ] For each pair of travelable zones:
  - If areZonesAdjacent returns true, create edge
  - Edge weight = Euclidean distance between centroids
- [ ] `findNearestNode(point: Point, graph: NavigationGraph): GraphNode | null`
  - Returns node closest to point
  - Returns null if no nodes exist
- [ ] Handle isolated zones (zones with no adjacent neighbors)

**Tests:** `src/utils/graphBuilder.test.ts`
- Creates correct number of nodes
- Creates edges between adjacent zones
- Edge weights are correct
- findNearestNode returns closest
- Handles empty zone array
- Handles single zone (no edges)

**Estimated Complexity:** High

---

### Task 5.5: Implement A* Pathfinding

**File:** `src/services/routeCalculator.ts`

**Description:** A* algorithm for finding shortest path.

**Acceptance Criteria:**
- [ ] `findShortestPath(start: Point, end: Point, graph: NavigationGraph): RoutePath`
- [ ] Algorithm:
  1. Find nearest node to start point
  2. Find nearest node to end point
  3. Run A* with Euclidean heuristic
  4. Reconstruct path from visited nodes
- [ ] Returns RoutePath with:
  - `success: true` and path data if found
  - `success: false` and error message if not
- [ ] Handles edge cases:
  - No path exists: returns success=false, error="No path found"
  - Start and end are same node: returns direct path
  - Graph is empty: returns success=false, error="No travelable zones"
- [ ] `calculateRouteDistance(path: Point[]): number` - sum of segment distances
- [ ] Builds PathSegments with zone information

**Tests:** `src/services/routeCalculator.test.ts`
- Finds path between connected nodes
- Returns success=false for disconnected nodes
- Path is optimal for simple test case
- Total distance is correct
- Handles empty graph
- Handles same start/end

**Estimated Complexity:** High (algorithm)

---

### Task 5.6: Add Route State to Project Store

**File:** `src/store/useProjectStore.ts` (modify)

**Description:** Store route calculation state.

**Acceptance Criteria:**
- [ ] New state fields:
  ```typescript
  routeStart: Point | null;
  routeEnd: Point | null;
  calculatedRoute: RoutePath | null;
  isCalculatingRoute: boolean;
  routeError: string | null;
  ```
- [ ] New actions:
  - `setRouteStart(point: Point | null)`
  - `setRouteEnd(point: Point | null)`
  - `setCalculatedRoute(route: RoutePath | null)`
  - `setIsCalculatingRoute(calculating: boolean)`
  - `setRouteError(error: string | null)`
  - `clearRoute()` - resets all route state

**Tests:** `src/store/useProjectStore.test.ts` (expand)
- Route start/end state changes correctly
- clearRoute resets all route state
- calculatedRoute state updates

**Estimated Complexity:** Low

---

### Task 5.7: Update Store Types for Route State

**File:** `src/types/store.ts` (modify)

**Description:** Add types for route state.

**Acceptance Criteria:**
- [ ] `RouteState` interface
- [ ] `RouteActions` interface
- [ ] Update `ProjectStore` to extend new interfaces

**Tests:**
- TypeScript compilation passes

**Estimated Complexity:** Low

---

### Task 5.8: Implement Route Point Selection Hook

**File:** `src/hooks/useRouteSelection.ts`

**Description:** Handle canvas clicks for route point selection.

**Acceptance Criteria:**
- [ ] `useRouteSelection()` hook returns:
  ```typescript
  {
    handleCanvasClick: (point: Point) => void;
    startPoint: Point | null;
    endPoint: Point | null;
    selectionState: 'waiting-for-start' | 'waiting-for-end' | 'complete';
    reset: () => void;
  }
  ```
- [ ] Selection logic:
  - First click sets start point, state → 'waiting-for-end'
  - Second click sets end point, state → 'complete'
  - Third click resets and sets new start point
- [ ] Only active when activeTab === 'route'
- [ ] Uses store actions for state management

**Tests:** `src/hooks/useRouteSelection.test.ts`
- First click sets start
- Second click sets end
- Third click resets and sets new start
- State transitions correctly

**Estimated Complexity:** Medium

---

### Task 5.9: Implement Route Calculator Hook

**File:** `src/hooks/useRouteCalculator.ts`

**Description:** Hook to calculate route using current selection.

**Acceptance Criteria:**
- [ ] `useRouteCalculator()` hook returns:
  ```typescript
  {
    calculate: () => Promise<void>;
    isCalculating: boolean;
    route: RoutePath | null;
    error: string | null;
    canCalculate: boolean;
  }
  ```
- [ ] `calculate()`:
  - Gets start/end from store
  - Builds navigation graph from travelable zones
  - Calls findShortestPath
  - Updates store with result
- [ ] `canCalculate`: true if both start and end points set
- [ ] Handles errors gracefully

**Tests:** `src/hooks/useRouteCalculator.test.ts`
- Hook returns correct initial state
- calculate() computes route
- canCalculate reflects point selection
- Errors are handled

**Estimated Complexity:** Medium

---

### Task 5.10: Create Route Marker Component

**File:** `src/components/canvas/RouteMarker.tsx`

**Description:** Visual markers for start/end points.

**Acceptance Criteria:**
- [ ] Konva components for rendering markers
- [ ] Start marker:
  - Green circle with white "S" or pin icon
  - Position at routeStart point
  - Visible only when routeStart is set
- [ ] End marker:
  - Red circle with white "E" or pin icon
  - Position at routeEnd point
  - Visible only when routeEnd is set
- [ ] Markers render above zones
- [ ] Size appropriate for zoom level (fixed screen size)

**Tests:** `src/components/canvas/RouteMarker.test.tsx`
- Start marker renders at correct position
- End marker renders at correct position
- Markers hidden when points not set
- Correct colors applied

**Estimated Complexity:** Low

---

### Task 5.11: Create Route Overlay Component

**File:** `src/components/canvas/RouteOverlay.tsx`

**Description:** Render calculated route path on canvas.

**Acceptance Criteria:**
- [ ] Konva Line component connecting route waypoints
- [ ] Styling:
  - Stroke color: bright blue (#3B82F6)
  - Stroke width: 4px (scaled for zoom)
  - Dashed line pattern
- [ ] Renders only when calculatedRoute exists and success=true
- [ ] Points array from calculatedRoute.points
- [ ] Optional: Arrow heads showing direction
- [ ] Optional: Distance labels at segments

**Tests:** `src/components/canvas/RouteOverlay.test.tsx`
- Overlay renders route line
- Correct number of points
- Styling applied correctly
- Hidden when no route

**Estimated Complexity:** Medium

---

### Task 5.12: Complete ShortestRouteTab Implementation

**File:** `src/components/tabs/ShortestRouteTab.tsx` (expand)

**Description:** Full route calculator UI.

**Acceptance Criteria:**
- [ ] Section header: "Route Calculator"
- [ ] Instructions: "Click two points on the map to calculate the shortest route."
- [ ] Start point display:
  - Shows coordinates when set: "(X, Y) px" or "(X, Y) m" if config available
  - Shows "Click on map to set..." when not set
  - Green indicator dot
- [ ] End point display:
  - Similar to start point
  - Red indicator dot
- [ ] "Calculate Route" button:
  - Disabled if start or end not set
  - Shows loading state during calculation
  - Calls useRouteCalculator().calculate()
- [ ] "Clear Route" button:
  - Clears start, end, and calculated route
  - Disabled if nothing to clear
- [ ] Route distance display:
  - "Route Distance: X.XX m" when route calculated
  - "Route Distance: -- m" when no route
  - Convert from pixels to meters using floorplan scale
- [ ] Error display for unreachable points
- [ ] Uses hooks: useRouteSelection, useRouteCalculator

**Tests:** `src/components/tabs/ShortestRouteTab.test.tsx`
- All UI elements render
- Calculate button triggers calculation
- Clear button clears everything
- Distance displays correctly
- Error message shows on failure

**Estimated Complexity:** Medium

---

### Task 5.13: Wire Route Selection to Canvas

**File:** `src/components/canvas/CanvasContainer.tsx` (modify)

**Description:** Handle canvas clicks for route selection when on route tab.

**Acceptance Criteria:**
- [ ] Read activeTab from store
- [ ] When activeTab === 'route':
  - Canvas clicks call useRouteSelection().handleCanvasClick
  - Convert screen coordinates to image coordinates
  - Cursor style: crosshair
- [ ] When activeTab !== 'route':
  - Normal click behavior (zone selection, etc.)
  - Normal cursor style
- [ ] Render RouteMarker and RouteOverlay components
- [ ] Click should not interfere with canvas panning

**Tests:** `src/components/canvas/CanvasContainer.test.tsx` (expand)
- Click on route tab triggers selection
- Click on other tabs works normally
- Markers render on canvas
- Route overlay renders on canvas

**Estimated Complexity:** Medium

---

### Task 5.14: Add Route Hooks to Barrel Export

**File:** `src/hooks/index.ts` (modify)

**Description:** Export route hooks.

**Acceptance Criteria:**
- [ ] Export useRouteSelection
- [ ] Export useRouteCalculator

**Validation:**
- Import works: `import { useRouteSelection, useRouteCalculator } from '@/hooks'`

**Estimated Complexity:** Low

---

## Sprint 6: Integration, Polish & Testing

**Goal:** End-to-end testing, error handling improvements, performance optimization, and documentation.

**Demo:** Full workflow demonstration with all features working together smoothly.

---

### Task 6.1: End-to-End Integration Test: Full Workflow

**File:** `src/__tests__/integration/fullWorkflow.test.ts`

**Description:** Complete workflow test covering all features.

**Acceptance Criteria:**
- [ ] Test scenario:
  1. Load all config files (floorplans, anchors, TDOA, coverage)
  2. Switch to Pre-AI tab
  3. Generate programmatic zones
  4. Verify zone count
  5. Switch to Route tab
  6. Select start and end points
  7. Calculate route
  8. Verify route is valid
  9. Export zones
  10. Clear all
  11. Import exported zones
  12. Verify zones restored

**Tests:** This IS the test

**Estimated Complexity:** High

---

### Task 6.2: End-to-End Integration Test: Route Calculation

**File:** `src/__tests__/integration/routeCalculation.test.ts`

**Description:** Route calculation edge cases.

**Acceptance Criteria:**
- [ ] Test cases:
  - Route between adjacent zones
  - Route through multiple zones
  - Route to isolated zone (should fail)
  - Start and end in same zone
  - Start outside all zones (should find nearest)
  - Very long route (performance check)
  - Route with only one travelable zone

**Tests:** This IS the test

**Estimated Complexity:** Medium

---

### Task 6.3: Error Handling Improvements

**Files:** All parser and generator files

**Description:** Comprehensive error handling with user-friendly messages.

**Acceptance Criteria:**
- [ ] All parsers throw errors with:
  - File/source name
  - Line number (where applicable)
  - Specific field that failed
  - Expected vs actual type
- [ ] Error classes:
  - `ConfigParseError`
  - `CSVParseError`
  - `ZoneImportError`
  - `RouteCalculationError`
- [ ] Each error class has `code` property for programmatic handling
- [ ] Coordinate transform errors caught and wrapped
- [ ] User-facing error messages don't expose internal details

**Tests:**
- Verify error messages are descriptive
- Error codes are unique
- Stack traces preserved for debugging

**Estimated Complexity:** Medium

---

### Task 6.4: Toast Notification System

**File:** `src/components/ui/Toast.tsx`

**Description:** Unified toast notification system.

**Acceptance Criteria:**
- [ ] Toast component with types: success, error, warning, info
- [ ] `useToast()` hook for triggering toasts
- [ ] Toast container renders at top-right
- [ ] Auto-dismiss after 5 seconds (configurable)
- [ ] Manual dismiss button
- [ ] Stacking for multiple toasts
- [ ] Use throughout app for feedback

**Tests:**
- Toast renders correctly
- Auto-dismisses
- Can be manually dismissed
- Multiple toasts stack

**Estimated Complexity:** Medium

---

### Task 6.5: Loading States and Progress Indicators

**Files:** Various UI components

**Description:** Consistent loading states for async operations.

**Acceptance Criteria:**
- [ ] File parsing shows "Parsing..." with spinner
- [ ] Zone generation shows "Generating zones..." with spinner
- [ ] Route calculation shows "Calculating route..." with spinner
- [ ] Import/export shows loading state
- [ ] Disable relevant interactions during loading
- [ ] Consistent spinner component used throughout

**Tests:**
- Loading states appear for each async operation
- UI disabled during loading

**Estimated Complexity:** Low

---

### Task 6.6: Performance Optimization: Zone List Virtualization

**File:** `src/components/panel/ZonePanel.tsx` (modify)

**Description:** Virtualize zone list for large zone sets.

**Acceptance Criteria:**
- [ ] Use react-virtual or similar for virtualization
- [ ] Only render visible zone items
- [ ] Maintains scroll position
- [ ] Works with 500+ zones without lag
- [ ] Smooth scrolling experience

**Tests:**
- Render 500 zones without jank
- Panel scrolls smoothly
- All zones accessible via scroll

**Estimated Complexity:** Medium

---

### Task 6.7: Performance Optimization: Memoization

**Files:** Various components and utilities

**Description:** Memoize expensive calculations.

**Acceptance Criteria:**
- [ ] Memoize zone filtering by tab
- [ ] Memoize coordinate transforms (batch)
- [ ] Memoize navigation graph building
- [ ] Use React.memo for zone list items
- [ ] Use useMemo for derived state

**Tests:**
- Verify memoization works (same input = cached result)
- Performance improvement measurable

**Estimated Complexity:** Medium

---

### Task 6.8: Accessibility Improvements

**Files:** Various UI components

**Description:** Ensure accessibility across new components.

**Acceptance Criteria:**
- [ ] ConfigFileLoader: keyboard-accessible file inputs
- [ ] Tab navigation: proper ARIA roles, keyboard support
- [ ] Route selection: screen reader announcements
- [ ] Error messages: ARIA live regions
- [ ] Focus management: focus trapped in modals
- [ ] Color contrast: all text meets WCAG AA

**Tests:**
- Keyboard navigation works throughout
- Screen reader testing (manual)
- Color contrast checker passes

**Estimated Complexity:** Medium

---

### Task 6.9: Update CLAUDE.md Documentation

**File:** `CLAUDE.md` (modify)

**Description:** Document new features.

**Acceptance Criteria:**
- [ ] Add section for TDOA-based zone detection
- [ ] Document tab system and their purposes
- [ ] Document config file formats and loading
- [ ] Document import/export workflow
- [ ] Document route calculator
- [ ] Update project structure section with new files
- [ ] Update key files table

**Tests:**
- Documentation is accurate and complete

**Estimated Complexity:** Low

---

### Task 6.10: Create User Guide

**File:** `docs/USER_GUIDE.md`

**Description:** End-user documentation.

**Acceptance Criteria:**
- [ ] Getting Started section
- [ ] Loading Configuration Files guide
  - What each file is
  - How to obtain them
  - Troubleshooting common issues
- [ ] Generating Zones guide
  - Using Pre-AI tab
  - Understanding zone sources
- [ ] Import/Export guide
  - zones.json format
  - Round-trip workflow
- [ ] Route Calculator guide
  - How to select points
  - Understanding the result
- [ ] Troubleshooting section
  - Common errors and solutions

**Tests:**
- Follow guide to use all features

**Estimated Complexity:** Medium

---

### Task 6.11: Final QA and Bug Fixes

**Description:** Manual testing and bug fixing sprint.

**Acceptance Criteria:**
- [ ] Test all workflows manually
- [ ] Test in Chrome, Firefox, Edge
- [ ] Test responsive design at various sizes
- [ ] Fix any discovered bugs
- [ ] Performance testing with large datasets
- [ ] Create known issues list for any deferred items

**Tests:**
- All manual tests pass
- No critical bugs
- Performance acceptable

**Estimated Complexity:** Medium

---

## Summary

| Sprint | Tasks | Focus |
|--------|-------|-------|
| 0 | 6 tasks | Preparation & Sample Data |
| 1 | 12 tasks | Data Infrastructure & Type System |
| 2 | 9 tasks | Programmatic Zone Generation |
| 3 | 9 tasks | Zone Import/Export |
| 4 | 11 tasks | Tab Navigation System |
| 5 | 14 tasks | Shortest Route Calculator |
| 6 | 11 tasks | Integration, Polish & Testing |

**Total: 72 tasks across 7 sprints**

## Sprint Dependencies

```
Sprint 0 (Sample Data)
    │
    v
Sprint 1 (Data Infrastructure)
    │
    ├───────────────────┐
    v                   v
Sprint 2            Sprint 3
(Zone Generation)   (Import/Export)
    │                   │
    └───────┬───────────┘
            v
        Sprint 4
    (Tab Navigation)
            │
            v
        Sprint 5
    (Route Calculator)
            │
            v
        Sprint 6
    (Integration & Polish)
```

## Demoable Milestones

| Sprint | Demo |
|--------|------|
| 0 | Sample files exist and validate |
| 1 | Load config files → See parsed data in console |
| 2 | Generate zones → See aisles and travel lanes on canvas |
| 3 | Import zones.json → Export → Re-import works |
| 4 | Switch tabs → See different zone views |
| 5 | Click two points → See calculated route with distance |
| 6 | Complete polished application with all features |

---

## Critical Implementation Notes

1. **Coordinate System**: All internal calculations should use millimeters. Convert to pixels only at render time.

2. **Zone Source Tracking**: The `source` field on zones is critical for filtering. Always set it correctly.

3. **Tab State Isolation**: Each tab shows different zones. The underlying data (zones arrays) persists across tabs.

4. **Error Recovery**: Users should be able to recover from any error state. Provide clear "try again" paths.

5. **Performance**: Target 60fps with 500 zones. Profile early if hitting performance issues.

6. **Backwards Compatibility**: Existing AI-based detection must continue to work. Don't break existing features.
