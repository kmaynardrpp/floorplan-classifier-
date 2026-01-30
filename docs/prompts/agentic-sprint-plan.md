# Agentic Zone Detection - Sprint Plan

**Version:** 1.0
**Date:** January 23, 2026
**Source Spec:** `docs/tuning-spec.md`
**Total Sprints:** 6
**Total Tasks:** 47

---

## Overview

This plan implements the multi-agent zone detection system specified in `tuning-spec.md`. Each sprint produces demoable, testable software. Every task is atomic, independently committable, and includes validation criteria.

### Architecture Summary

```
Phase 1: Main Agent → Coarse zones (racking_area flagged)
Phase 2: Sub-Agents → Cropped regions → aisle_path + racking subdivisions
Phase 3: Merge → Final zone hierarchy with travelability metadata
```

### Key Concepts

- **Travelable Zones:** `travel_lane`, `aisle_path`, `parking_lot`
- **Non-Travelable Zones:** `racking`, `racking_area`, `docking_area`, `conveyor_area`, `administrative`, `storage_floor`
- **Hierarchy:** Parent `racking_area` zones contain child `aisle_path` and `racking` zones

---

## Sprint 1: Foundation - Type System & Core Utilities

**Goal:** Extend type system for new zone types and travelability. Create core utilities for image manipulation and coordinate transformation.

**Demo Criteria:**
- Unit tests pass for all new types and utilities
- `isTravelable()` correctly classifies all zone types
- Image cropping utility can crop arbitrary regions from a test image
- Coordinate transformation correctly maps between cropped and full image space

---

### Task 1.1: Extend Zone Type Definitions

**File:** `src/types/zone.ts`

**Changes:**
1. Add to `PREDEFINED_ZONE_TYPES`: `aisle_path`, `racking`, `racking_area`, `conveyor_area`, `docking_area`, `administrative`, `storage_floor`
2. Keep existing `aisle` type (general aisle) distinct from `aisle_path` (path between racking)
3. Keep existing `loading_dock` as alias for `docking_area` for backwards compatibility
4. Create `TRAVELABLE_ZONE_TYPES` constant: `['travel_lane', 'aisle_path', 'parking_lot']`
5. Implement `isTravelable(zoneType: string): boolean`
6. Document that `open_floor` and `aisle` are NOT automatically travelable (context-dependent)

**Tests:** `src/types/zone.test.ts`
```typescript
describe('Zone Types', () => {
  describe('PREDEFINED_ZONE_TYPES', () => {
    it('should include all legacy zone types')
    it('should include aisle_path (new)')
    it('should include racking (new)')
    it('should include racking_area (new)')
    it('should keep aisle distinct from aisle_path')
  })

  describe('isTravelable', () => {
    it('should return true for travel_lane')
    it('should return true for aisle_path')
    it('should return true for parking_lot')
    it('should return false for racking')
    it('should return false for racking_area')
    it('should return false for docking_area')
    it('should return false for conveyor_area')
    it('should return false for administrative')
    it('should return false for storage_floor')
    it('should return false for aisle (context-dependent)')
    it('should return false for open_floor (context-dependent)')
    it('should return false for unknown types')
  })
})
```

**Validation:** `npm test -- zone.test.ts` passes

---

### Task 1.2: Add Coarse Zone and SubAgent Interfaces

**File:** `src/types/zone.ts`

**Changes:**
1. Add `CoarseZone` interface:
```typescript
interface CoarseZone {
  id: string
  name: string
  type: CoarseZoneType
  vertices: Point[]
  confidence: number
  needsSubdivision: boolean
  boundingBox: BoundingBox
}
```
2. Add `CoarseZoneType` type union
3. Add `BoundingBox` interface: `{ x: number; y: number; width: number; height: number }`
4. Add `SubAgentInput` interface
5. Add `SubAgentOutput` interface with `direction` and `subdivisions`
6. Add `SubdividedZone` interface

**Tests:** `src/types/zone.test.ts`
```typescript
describe('CoarseZone Interface', () => {
  it('should accept valid CoarseZone with needsSubdivision=true')
  it('should accept valid CoarseZone with needsSubdivision=false')
  it('should require boundingBox with all properties')
})

describe('SubAgentOutput Interface', () => {
  it('should accept horizontal direction')
  it('should accept vertical direction')
  it('should require subdivisions array')
})
```

**Validation:** TypeScript compilation succeeds, tests pass

---

### Task 1.3: Add Zone Colors for New Types

**File:** `src/utils/zoneColors.ts`

**Changes:**
Add color mappings:
| Zone Type | Color | Hex |
|-----------|-------|-----|
| `aisle_path` | Bright Green | `#00E676` |
| `racking` | Light Gray | `#B0BEC5` |
| `racking_area` | Medium Gray | `#78909C` |
| `conveyor_area` | Orange | `#FF9800` |
| `administrative` | Blue Gray | `#9E9E9E` |
| `storage_floor` | Warm Gray | `#BCAAA4` |
| `docking_area` | Brown | `#795548` |

**Tests:** `src/utils/zoneColors.test.ts`
```typescript
describe('Zone Colors', () => {
  it('should return #00E676 for aisle_path')
  it('should return #B0BEC5 for racking')
  it('should return #78909C for racking_area')
  it('should return #FF9800 for conveyor_area')
  it('should return distinct colors for all predefined zone types')
  it('should return fallback color for unknown types')
  it('should return same color for loading_dock and docking_area')
})
```

**Validation:** Tests pass, visual spot-check in dev environment

---

### Task 1.4: Create Image Cropping Utility

**File:** `src/services/imageCropper.ts` (NEW)

**Changes:**
1. Implement `cropImage(imageDataUrl: string, bounds: BoundingBox): Promise<string>`
2. Use `HTMLCanvasElement` with fallback from `OffscreenCanvas` for browser compatibility
3. Clamp bounds to image dimensions (no negative values, no exceeding image size)
4. Implement `cropImageWithPadding(imageDataUrl: string, bounds: BoundingBox, paddingPercent: number): Promise<CropResult>`
5. Return `CropResult` with `dataUrl`, `actualBounds`, `originalOffset`

**Tests:** `src/services/imageCropper.test.ts`
```typescript
describe('cropImage', () => {
  it('should crop an image to specified bounds')
  it('should return a valid base64 data URL')
  it('should clamp bounds to image dimensions')
  it('should handle bounds at image edges')
  it('should handle bounds exceeding image dimensions')
  it('should reject invalid data URLs')
  it('should handle zero-width bounds gracefully')
  it('should handle zero-height bounds gracefully')
  it('should handle negative x/y by clamping to 0')
  it('should work with PNG images')
  it('should work with JPEG images')
})

describe('cropImageWithPadding', () => {
  it('should add padding percentage to bounds')
  it('should clamp padded bounds to image dimensions')
  it('should return correct originalOffset')
  it('should handle 0% padding')
  it('should handle large padding that exceeds image')
})
```

**Validation:** Tests pass, visual verification with sample floorplan

---

### Task 1.5: Create Coordinate Transform and BoundingBox Utilities

**File:** `src/services/coordinateTransform.ts` (NEW)

**Changes:**
1. Implement `transformToFullImage(vertices: Point[], offset: Point): Point[]`
2. Implement `transformToCropped(vertices: Point[], offset: Point): Point[]`
3. Implement `calculateBoundingBox(vertices: Point[]): BoundingBox`
4. Implement `addPaddingToBounds(bounds: BoundingBox, paddingPercent: number): BoundingBox`
5. Implement `clampBoundsToImage(bounds: BoundingBox, imageWidth: number, imageHeight: number): BoundingBox`
6. Implement `boundsToVertices(bounds: BoundingBox): Point[]`
7. All coordinate operations round to integers to prevent precision loss

**Tests:** `src/services/coordinateTransform.test.ts`
```typescript
describe('transformToFullImage', () => {
  it('should add offset to all vertices')
  it('should round coordinates to integers')
  it('should handle empty vertex arrays')
  it('should handle single vertex')
})

describe('transformToCropped', () => {
  it('should subtract offset from all vertices')
  it('should round coordinates to integers')
})

describe('calculateBoundingBox', () => {
  it('should calculate correct bounding box from triangle')
  it('should calculate correct bounding box from rectangle')
  it('should calculate correct bounding box from irregular polygon')
  it('should handle single vertex')
  it('should handle empty array')
})

describe('addPaddingToBounds', () => {
  it('should expand bounds by percentage')
  it('should handle 0% padding')
  it('should handle 50% padding')
})

describe('clampBoundsToImage', () => {
  it('should clamp x to 0 when negative')
  it('should clamp width when exceeds image')
  it('should not modify bounds already within image')
})
```

**Validation:** Tests pass

---

## Sprint 2: Backend API - Multi-Agent Infrastructure

**Goal:** Update Claude API integration for coarse detection, create sub-agent API service with validation, and implement result merging.

**Demo Criteria:**
- Mock API test shows coarse detection returns zones with `needsSubdivision` flags
- Mock sub-agent API returns subdivisions with direction
- Validation catches malformed responses
- Merged results have correct coordinates in full image space

---

### Task 2.1: Update Coarse Detection Prompt

**File:** `src/services/claudeApi.ts`

**Changes:**
1. Update `getZoneDetectionPrompt()` to include visual pattern guidelines from tuning-spec Section 2
2. Add instructions for `racking_area` zones:
   - Mark with `needsSubdivision: true`
   - Do NOT attempt to identify individual aisles
   - Include `boundingBox` in response
3. Add new zone types to prompt
4. Update response parsing to handle `needsSubdivision` and `boundingBox` fields

**Tests:** `src/services/claudeApi.test.ts`
```typescript
describe('Coarse Detection Prompt', () => {
  it('should include racking_area in zone type list')
  it('should instruct AI to set needsSubdivision for racking_area')
  it('should include visual pattern guidelines')
  it('should require boundingBox in response schema')
})

describe('parseZonesFromResponse (Coarse)', () => {
  it('should parse needsSubdivision boolean')
  it('should parse boundingBox object')
  it('should default needsSubdivision to false if missing')
  it('should calculate boundingBox from vertices if missing')
})
```

**Validation:** Manual test with sample floorplan shows racking areas detected with flags

---

### Task 2.2: Create SubAgent Prompt and Types

**File:** `src/services/subAgentApi.ts` (NEW)

**Changes:**
1. Create `SUBAGENT_RACKING_ANALYSIS_PROMPT` constant from tuning-spec Section 3.3.2
2. Export `SubAgentInput`, `SubAgentOutput`, `SubdividedZone` types (reference types from zone.ts)
3. Create prompt template function that substitutes width/height

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('SubAgent Prompt', () => {
  it('should include width and height placeholders')
  it('should specify JSON output format')
  it('should include visual identification guide')
  it('should list both aisle_path and racking as output types')
})
```

**Validation:** Prompt template generates valid prompt strings

---

### Task 2.3: Implement SubAgent API Call

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Implement `analyzeRackingRegion(input: SubAgentInput, apiKey: string, signal?: AbortSignal): Promise<SubAgentOutput>`
2. Use `claude-sonnet-4-20250514` model for cost efficiency
3. Send cropped image with sub-agent prompt
4. Parse JSON response
5. Support abort signal for cancellation

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('analyzeRackingRegion', () => {
  it('should send cropped image to Claude API')
  it('should use sonnet model (claude-sonnet-4-20250514)')
  it('should include crop dimensions in prompt')
  it('should parse JSON response')
  it('should handle API errors')
  it('should abort on signal')
})
```

**Validation:** Mock API call succeeds

---

### Task 2.4: Implement SubAgent Response Parsing

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Create `parseSubAgentResponse(responseText: string): SubAgentOutput`
2. Extract JSON from markdown code blocks (like existing `parseZonesFromResponse`)
3. Validate required fields
4. Normalize direction to lowercase
5. Ensure all vertices are integers

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('parseSubAgentResponse', () => {
  it('should parse valid JSON response')
  it('should extract JSON from markdown code blocks')
  it('should normalize direction to lowercase')
  it('should round vertex coordinates to integers')
  it('should throw on missing direction field')
  it('should throw on missing subdivisions array')
})
```

**Validation:** Parser handles various response formats

---

### Task 2.5: Implement SubAgent Response Validation

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Create `validateSubAgentOutput(output: SubAgentOutput): ValidationResult`
2. Validate:
   - Direction is 'horizontal' or 'vertical'
   - Subdivisions array is non-empty
   - Each subdivision has ≥3 vertices
   - Confidence is 0-1 (warn if outside)
   - No self-intersecting polygons (warn only)
   - No vertices outside crop bounds (warn only)
   - At least one aisle_path exists (warn if missing)
   - At least one racking exists (warn if missing)

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('validateSubAgentOutput', () => {
  it('should return valid: true for correct output')
  it('should error on invalid direction')
  it('should error on empty subdivisions array')
  it('should error on subdivision with < 3 vertices')
  it('should warn on missing aisle_path zones')
  it('should warn on missing racking zones')
  it('should warn on confidence outside 0-1 range')
  it('should warn on vertices outside crop bounds')
  it('should warn on duplicate vertices')
})
```

**Validation:** Validation catches all malformed inputs

---

### Task 2.6: Implement Result Merging Logic

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Create `mergeSubAgentResults(parentZone: CoarseZone, input: SubAgentInput, output: SubAgentOutput): Zone[]`
2. Transform coordinates using `transformToFullImage()`
3. Set metadata using existing `Zone` interface pattern:
```typescript
metadata: {
  ...DEFAULT_ZONE_METADATA,
  customProperties: {
    parentZoneId: parentZone.id,
    direction: output.direction,
    travelable: String(isTravelable(sub.type))
  }
}
```
4. Generate unique IDs with `crypto.randomUUID()`
5. Preserve confidence scores
6. Set `source: 'ai'`

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('mergeSubAgentResults', () => {
  it('should transform vertices by adding offset')
  it('should set parentZoneId in customProperties')
  it('should set direction in customProperties')
  it('should set travelable based on zone type')
  it('should generate unique ids for each zone')
  it('should preserve confidence scores')
  it('should set source to ai')
})
```

**Validation:** Merged zones have correct coordinates

---

### Task 2.7: Create SubAgent Input Preparation

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Create `prepareSubAgentInput(fullImageDataUrl: string, zone: CoarseZone): Promise<SubAgentInput>`
2. Call `cropImageWithPadding()` with 10% padding
3. Store `originalOffset` from crop result
4. Store `cropWidth` and `cropHeight`
5. Store `parentZoneId`

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('prepareSubAgentInput', () => {
  it('should crop image to zone bounding box with 10% padding')
  it('should calculate correct offset from padded bounds')
  it('should store correct crop dimensions')
  it('should store parent zone id')
})
```

**Validation:** Input preparation creates correct cropped images

---

### Task 2.8: Add SubAgent Error Handling and Retry

**File:** `src/services/subAgentApi.ts`

**Changes:**
1. Create `SubAgentError` class extending `ClaudeApiError`
2. Add `parentZoneId` and `validationErrors` to error context
3. Implement retry logic (max 2 retries for transient errors)
4. Do NOT retry on auth errors or validation failures
5. Add configurable timeout (default: 30 seconds)

**Tests:** `src/services/subAgentApi.test.ts`
```typescript
describe('SubAgent Error Handling', () => {
  it('should throw SubAgentError on validation failure')
  it('should include parentZoneId in error')
  it('should retry on 500 errors up to 2 times')
  it('should retry on timeout')
  it('should not retry on 401 errors')
  it('should not retry on validation errors')
  it('should timeout after configured duration')
})
```

**Validation:** Error scenarios handled gracefully

---

## Sprint 3: Analysis Orchestration

**Goal:** Create orchestration hook that coordinates coarse detection and parallel sub-agent analysis with progress reporting, fallback behavior, and integration with existing analysis flow.

**Demo Criteria:**
- Full analysis flow works end-to-end with mocked APIs
- Progress updates show multi-phase analysis
- Failed sub-agents fall back to parent zone
- Analysis can be cancelled mid-flow
- Toggle between agentic and standard analysis modes

---

### Task 3.1: Create useAgenticAnalysis Hook Structure

**File:** `src/hooks/useAgenticAnalysis.ts` (NEW)

**Changes:**
1. Create hook with state:
   - `isAnalyzing: boolean`
   - `stage: AnalysisStage`
   - `progress: AnalysisProgress`
   - `error: Error | null`
2. Define types:
```typescript
type AnalysisStage = 'idle' | 'coarse' | 'subdivision' | 'merging' | 'complete' | 'error'

interface AnalysisProgress {
  stage: AnalysisStage
  percent: number
  message: string
  completedSubAgents: number
  totalSubAgents: number
}
```
3. Export `startAnalysis()` and `cancelAnalysis()` functions

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('useAgenticAnalysis Hook', () => {
  it('should initialize with idle state')
  it('should expose isAnalyzing boolean')
  it('should expose progress object')
  it('should expose error state')
  it('should expose startAnalysis function')
  it('should expose cancelAnalysis function')
})
```

**Validation:** Hook renders without errors

---

### Task 3.2: Implement Coarse Detection Phase

**File:** `src/hooks/useAgenticAnalysis.ts`

**Changes:**
1. In `startAnalysis()`, implement Phase 1:
   - Set stage to 'coarse', progress to 10%
   - Call `analyzeFloorplan()` with updated prompt
   - Parse response into `CoarseZone[]`
   - Separate zones: `needsSubdivision=true` → subdivision list, others → final list
2. Handle compressed image coordinate scaling (check if image was compressed, apply scale factor)

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('Coarse Detection Phase', () => {
  it('should set stage to coarse')
  it('should set progress to 10%')
  it('should call analyzeFloorplan')
  it('should separate zones needing subdivision')
  it('should keep non-subdivision zones in final list')
  it('should handle compressed image coordinate scaling')
})
```

**Validation:** Coarse detection runs and categorizes zones

---

### Task 3.3: Implement Parallel SubAgent Dispatch

**File:** `src/hooks/useAgenticAnalysis.ts`

**Changes:**
1. Implement Phase 2:
   - Set stage to 'subdivision'
   - Prepare inputs for each `racking_area` zone
   - Dispatch sub-agents with concurrency limit (default: 3)
   - Use simple semaphore pattern (no external dependencies)
   - Propagate abort signal to all sub-agent calls
   - Update progress incrementally (30% → 90%)
   - Continue on individual failures, collect results
2. Track `completedSubAgents` and `totalSubAgents` in progress

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('SubAgent Dispatch', () => {
  it('should prepare input for each racking_area zone')
  it('should call analyzeRackingRegion in parallel')
  it('should limit concurrent requests to 3')
  it('should update progress as sub-agents complete')
  it('should continue on individual sub-agent failure')
  it('should collect all successful results')
  it('should propagate abort signal to sub-agents')
  it('should cancel remaining requests on abort')
})
```

**Validation:** Multiple sub-agents run in parallel with progress updates

---

### Task 3.4: Implement Result Merging Phase

**File:** `src/hooks/useAgenticAnalysis.ts`

**Changes:**
1. Implement Phase 3:
   - Set stage to 'merging', progress to 95%
   - Call `mergeSubAgentResults()` for each successful sub-agent
   - Combine with non-subdivided zones
   - **Do NOT include parent `racking_area` zones that were successfully subdivided**
   - Return final `Zone[]` array
2. Set stage to 'complete', progress to 100%

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('Result Merging Phase', () => {
  it('should set stage to merging')
  it('should merge all sub-agent results')
  it('should include non-subdivided zones')
  it('should exclude parent zones that were subdivided')
  it('should set stage to complete at end')
  it('should return combined zone array')
})
```

**Validation:** Final zone list has correct hierarchy

---

### Task 3.5: Implement Fallback Behavior for Failed SubAgents

**File:** `src/hooks/useAgenticAnalysis.ts`

**Changes:**
1. When sub-agent fails:
   - Keep parent `racking_area` zone in final list
   - Add `subdivisionFailed: 'true'` to customProperties
   - Add `subdivisionError: string` with error message
   - Log warning with zone ID and error details
2. Store failed zone inputs for potential retry (Task 3.8)

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('Fallback Behavior', () => {
  it('should keep parent zone on sub-agent failure')
  it('should mark zone with subdivisionFailed metadata')
  it('should include error message in metadata')
  it('should log warning with error details')
  it('should continue processing remaining zones')
  it('should store failed inputs for retry')
})
```

**Validation:** Partial failures handled gracefully

---

### Task 3.6: Add Analysis Settings to Settings Store

**File:** `src/store/useSettingsStore.ts` (create if needed, or add to existing settings)

**Changes:**
1. Add `useAgenticAnalysis: boolean` (default: true)
2. Add `subAgentConcurrency: number` (default: 3, range: 1-5)
3. Add `subAgentTimeout: number` (default: 30000ms)
4. Persist to localStorage
5. Use `Record<string, boolean>` pattern for Zustand/Immer compatibility

**Tests:** `src/store/useSettingsStore.test.ts`
```typescript
describe('Analysis Settings', () => {
  it('should default useAgenticAnalysis to true')
  it('should default subAgentConcurrency to 3')
  it('should persist settings to localStorage')
  it('should load settings from localStorage')
  it('should allow toggling useAgenticAnalysis')
  it('should validate concurrency range 1-5')
})
```

**Validation:** Settings persist across sessions

---

### Task 3.7: Integrate with Existing useAnalysis Hook

**File:** `src/hooks/useAnalysis.ts`

**Changes:**
1. Import `useAgenticAnalysis` hook
2. Read `useAgenticAnalysis` setting from settings store
3. When `useAgentic: true`:
   - Call `startAnalysis()` from agentic hook
   - Forward progress callbacks
4. When `useAgentic: false`:
   - Use existing `analyzeFloorplan()` directly
5. Update store with final zones on completion

**Tests:** `src/hooks/useAnalysis.test.ts`
```typescript
describe('useAnalysis Integration', () => {
  it('should use agentic analysis when setting is true')
  it('should use standard analysis when setting is false')
  it('should forward progress updates from agentic analysis')
  it('should update store with zones on completion')
  it('should handle errors from agentic analysis')
  it('should propagate cancellation')
})
```

**Validation:** Existing analysis hook works with both modes

---

### Task 3.8: Implement Retry for Failed SubAgents

**File:** `src/hooks/useAgenticAnalysis.ts`

**Changes:**
1. Create `retryFailedSubAgent(zoneId: string): Promise<Zone[]>`
2. Retrieve stored failed input by zone ID
3. Re-run sub-agent analysis
4. On success: replace parent zone with subdivisions in store
5. On failure: update error message in metadata

**Tests:** `src/hooks/useAgenticAnalysis.test.ts`
```typescript
describe('Retry Failed SubAgent', () => {
  it('should retry analysis for failed zone')
  it('should replace parent with subdivisions on success')
  it('should update error message on repeated failure')
  it('should throw if zone ID not found in failed list')
})
```

**Validation:** Retry functionality works

---

### Task 3.9: Update Analysis Cache for Agentic Mode

**File:** `src/services/analysisCache.ts` (if exists, otherwise integrate into useAgenticAnalysis)

**Changes:**
1. Add `analysisMode: 'standard' | 'agentic'` to cache key
2. Invalidate cache when switching modes
3. Cache full result including hierarchy metadata
4. Respect existing cache TTL

**Tests:** `src/services/analysisCache.test.ts`
```typescript
describe('Analysis Cache (Agentic)', () => {
  it('should cache agentic results separately from standard')
  it('should invalidate when mode changes')
  it('should preserve hierarchy metadata in cache')
})
```

**Validation:** Cache behaves correctly with mode switching

---

## Sprint 4: Frontend - Zone Hierarchy & Filtering

**Goal:** Update Zone Panel to display hierarchical zones with expand/collapse, travelability filtering, and parent-child navigation.

**Demo Criteria:**
- Zone panel shows tree structure with racking areas as parents
- Child zones indented under parents
- Expand/collapse works
- Travelability filter shows/hides zones correctly
- Properties panel shows hierarchy info

---

### Task 4.1: Add Hierarchy State to Store

**File:** `src/store/useProjectStore.ts`

**Changes:**
1. Add `expandedZoneIds: Record<string, boolean>` (not Set, for Zustand/Immer compatibility)
2. Add `travelabilityFilter: 'all' | 'travelable' | 'non-travelable'`
3. Add `toggleZoneExpanded(zoneId: string)` action
4. Add `setTravelabilityFilter(filter)` action
5. Add `expandAllZones()` action
6. Add `collapseAllZones()` action
7. Add `getChildZones(parentId: string): Zone[]` selector

**Tests:** `src/store/useProjectStore.test.ts`
```typescript
describe('Zone Hierarchy State', () => {
  it('should initialize expandedZoneIds as empty object')
  it('should toggle zone expanded state')
  it('should set travelability filter')
  it('should expand all zones')
  it('should collapse all zones')
  it('should return child zones for parent id')
  it('should return empty array for zones without children')
})
```

**Validation:** Store state updates correctly

---

### Task 4.2: Create Zone Tree Builder Utility

**File:** `src/utils/zoneTree.ts` (NEW)

**Changes:**
1. Create `ZoneTreeNode` interface:
```typescript
interface ZoneTreeNode {
  zone: Zone
  children: ZoneTreeNode[]
  depth: number
}
```
2. Create `buildZoneTree(zones: Zone[], expandedZoneIds: Record<string, boolean>): ZoneTreeNode[]`
3. Group children under parents by `parentZoneId` metadata
4. Sort zones alphabetically within groups
5. Handle circular references gracefully (detect and break loops)
6. Handle orphaned children (parent not in list)

**Tests:** `src/utils/zoneTree.test.ts`
```typescript
describe('Zone Tree Builder', () => {
  it('should return flat list when no parent-child relationships')
  it('should nest children under parent zones')
  it('should sort zones alphabetically')
  it('should set correct depth for nested zones')
  it('should handle zones with missing parents')
  it('should handle circular parent references')
  it('should handle self-referential parentZoneId')
})
```

**Validation:** Tree structure built correctly

---

### Task 4.3: Create ZoneTreeItem Component

**File:** `src/components/panel/ZoneTreeItem.tsx` (NEW - in panel/ to match existing structure)

**Changes:**
1. Render single zone item with:
   - Expand/collapse chevron (if has children)
   - Color chip from `getZoneColor()`
   - Zone name
   - Travelability badge (✓ green or ✕ red)
   - Direction badge (→ or ↓) if direction metadata exists
   - Subdivision failed warning icon if subdivisionFailed
2. Handle click to select zone
3. Handle chevron click to expand/collapse
4. Use Tailwind classes (not separate CSS file)

**Tests:** `src/components/panel/ZoneTreeItem.test.tsx`
```typescript
describe('ZoneTreeItem', () => {
  it('should render zone name')
  it('should render color chip with correct color')
  it('should render travelable badge for travelable zones')
  it('should render blocked badge for non-travelable zones')
  it('should render expand chevron when zone has children')
  it('should not render chevron when zone has no children')
  it('should call onSelect when clicked')
  it('should call onToggleExpand when chevron clicked')
  it('should render direction badge when metadata exists')
  it('should render warning icon for subdivisionFailed zones')
})
```

**Validation:** Component renders correctly

---

### Task 4.4: Update ZonePanel with Tree Structure

**File:** `src/components/panel/ZonePanel.tsx`

**Changes:**
1. Import `buildZoneTree()` and `ZoneTreeItem`
2. Build tree from zones using store state
3. Render `ZoneTreeItem` recursively for children
4. Apply indentation based on depth (depth * 16px or Tailwind ml-4)
5. Wire expand/collapse to store actions
6. Respect `expandedZoneIds` from store

**Tests:** `src/components/panel/ZonePanel.test.tsx`
```typescript
describe('ZonePanel Tree View', () => {
  it('should render zones in tree structure')
  it('should indent child zones')
  it('should hide children when parent collapsed')
  it('should show children when parent expanded')
  it('should highlight selected zone')
})
```

**Validation:** Zone panel displays hierarchy

---

### Task 4.5: Add Travelability Filter and Expand/Collapse All

**File:** `src/components/panel/ZonePanel.tsx`

**Changes:**
1. Add filter UI: segmented control or dropdown (All / Travelable / Non-travelable)
2. Wire to `travelabilityFilter` state
3. Filter displayed zones based on selection (include parents of matching children)
4. Add "Expand All" and "Collapse All" buttons
5. Wire buttons to store actions
6. Show count of visible zones

**Tests:** `src/components/panel/ZonePanel.test.tsx`
```typescript
describe('Travelability Filter', () => {
  it('should show all zones when filter is all')
  it('should show only travelable zones when filter is travelable')
  it('should show only non-travelable when filter is non-travelable')
  it('should include parent zones when children match filter')
  it('should show correct count')
})

describe('Expand/Collapse All', () => {
  it('should expand all zones')
  it('should collapse all zones')
})
```

**Validation:** Filtering and expand/collapse work

---

### Task 4.6: Update Zone Properties Panel for Hierarchy

**File:** `src/components/properties/PropertiesPanel.tsx` (existing file)

**Changes:**
1. Add travelability indicator (prominent, color-coded)
2. Add direction display if present (Horizontal → / Vertical ↓)
3. Add "View Parent" button if `parentZoneId` exists
4. Add child count if zone has children
5. Show subdivision failed warning with error message
6. Show confidence score with progress bar

**Tests:** `src/components/properties/PropertiesPanel.test.tsx`
```typescript
describe('Properties Panel Hierarchy', () => {
  it('should display travelable indicator')
  it('should display direction when present')
  it('should show View Parent button for child zones')
  it('should navigate to parent when clicked')
  it('should show child count for parent zones')
  it('should show warning for subdivisionFailed zones')
  it('should show error message for failed zones')
})
```

**Validation:** Properties show all hierarchy info

---

## Sprint 5: Canvas Rendering - Visual Differentiation

**Goal:** Update canvas to visually distinguish travelable vs non-travelable zones with styling, hatching, and direction indicators.

**Demo Criteria:**
- Travelable zones show solid fill with higher opacity
- Non-travelable zones show hatched pattern with lower opacity
- Direction arrows appear on zones with direction metadata
- Hover shows travelability badge

**Note:** Tasks 5.1-5.5 can be developed in parallel with Sprint 3 (only depends on Sprint 1).

---

### Task 5.1: Create Polygon Centroid Utility

**File:** `src/utils/geometry.ts` (NEW or add to existing)

**Changes:**
1. Implement `getCentroid(vertices: Point[]): Point`
2. Use geometric centroid formula for polygons
3. Handle convex and concave polygons
4. Handle edge cases: empty array, single point, collinear points

**Tests:** `src/utils/geometry.test.ts`
```typescript
describe('getCentroid', () => {
  it('should calculate centroid of triangle')
  it('should calculate centroid of rectangle')
  it('should calculate centroid of irregular polygon')
  it('should handle clockwise vertices')
  it('should handle counter-clockwise vertices')
  it('should handle empty array')
  it('should handle single vertex')
  it('should handle collinear points')
  it('should handle very small polygons')
})
```

**Validation:** Centroids calculated correctly

---

### Task 5.2: Create Zone Style Utility

**File:** `src/utils/zoneStyles.ts` (NEW)

**Changes:**
1. Create `ZoneRenderStyle` interface:
```typescript
interface ZoneRenderStyle {
  fill: string
  stroke: string
  strokeWidth: number
  strokeDash: number[]
  opacity: number
  pattern: 'solid' | 'hatched'
}
```
2. Create `getZoneStyle(zone: Zone): ZoneRenderStyle`
3. Travelable zones: solid pattern, opacity 0.4, strokeWidth 2, no dash
4. Non-travelable: hatched pattern, opacity 0.3, strokeWidth 1, dash [4, 4]
5. Use `getZoneColor()` for base color

**Tests:** `src/utils/zoneStyles.test.ts`
```typescript
describe('getZoneStyle', () => {
  it('should return solid pattern for aisle_path')
  it('should return solid pattern for travel_lane')
  it('should return solid pattern for parking_lot')
  it('should return hatched pattern for racking')
  it('should return hatched pattern for racking_area')
  it('should use higher opacity for travelable zones')
  it('should use dashed stroke for non-travelable zones')
})
```

**Validation:** Styles correct for all zone types

---

### Task 5.3: Create HatchPattern Component

**File:** `src/components/canvas/HatchPattern.tsx` (NEW)

**Changes:**
1. Create Konva component rendering diagonal lines within polygon
2. Props: `vertices`, `color`, `spacing`, `angle`
3. Use Konva `Group` with `clipFunc` to constrain to polygon
4. Calculate line positions from bounding box
5. Optimize: limit line count, cache pattern

**Implementation Notes:**
- Konva doesn't have built-in hatch patterns
- Must render individual `Line` shapes
- Use clipping function for polygon boundary
- Consider performance with many hatched zones

**Tests:** `src/components/canvas/HatchPattern.test.tsx`
```typescript
describe('HatchPattern', () => {
  it('should render diagonal lines')
  it('should respect spacing prop')
  it('should respect angle prop')
  it('should clip lines to polygon boundary')
  it('should handle different polygon shapes')
})
```

**Validation:** Visual test shows correct hatching

---

### Task 5.4: Create DirectionIndicator Component

**File:** `src/components/canvas/DirectionIndicator.tsx` (NEW)

**Changes:**
1. Create Konva `Arrow` component
2. Position at zone centroid (use `getCentroid()`)
3. Rotation: 0° for horizontal, 90° for vertical
4. Use contrasting color (#333 or based on zone color)
5. Scale arrow length based on zone size (min 15px, max 40px)

**Tests:** `src/components/canvas/DirectionIndicator.test.tsx`
```typescript
describe('DirectionIndicator', () => {
  it('should render arrow at zone centroid')
  it('should point right for horizontal direction')
  it('should point down for vertical direction')
  it('should scale arrow based on zone size')
  it('should respect min/max arrow length')
})
```

**Validation:** Arrows display correctly

---

### Task 5.5: Create TravelableBadge Component

**File:** `src/components/canvas/TravelableBadge.tsx` (NEW)

**Changes:**
1. Create Konva `Group` with `Rect` background and `Text`
2. Show ✓ for travelable, ✕ for non-travelable
3. Green background (#00E676) for travelable, red (#F44336) for non-travelable
4. Position at specified point (centroid)
5. Only render when `visible` prop is true

**Tests:** `src/components/canvas/TravelableBadge.test.tsx`
```typescript
describe('TravelableBadge', () => {
  it('should render checkmark for travelable')
  it('should render X for non-travelable')
  it('should use green background for travelable')
  it('should use red background for non-travelable')
  it('should not render when visible is false')
})
```

**Validation:** Badge displays correctly

---

### Task 5.6: Update ZoneOverlayLayer - Apply Styles

**File:** `src/components/canvas/ZoneOverlayLayer.tsx`

**Changes:**
1. Import `getZoneStyle()`
2. Apply style properties to zone polygon `Line` component
3. Use style's fill, stroke, strokeWidth, strokeDash, opacity

**Tests:** `src/components/canvas/ZoneOverlayLayer.test.tsx`
```typescript
describe('ZoneOverlayLayer Styling', () => {
  it('should apply fill color from style')
  it('should apply stroke from style')
  it('should apply opacity from style')
  it('should apply dash pattern for non-travelable')
})
```

**Validation:** Zones render with correct base styles

---

### Task 5.7: Update ZoneOverlayLayer - Add Visual Components

**File:** `src/components/canvas/ZoneOverlayLayer.tsx`

**Changes:**
1. Conditionally render `HatchPattern` for zones with hatched pattern style
2. Conditionally render `DirectionIndicator` when `direction` in customProperties
3. Track hovered zone ID in component state
4. Conditionally render `TravelableBadge` for hovered zone

**Tests:** `src/components/canvas/ZoneOverlayLayer.test.tsx`
```typescript
describe('ZoneOverlayLayer Visual Components', () => {
  it('should render HatchPattern for non-travelable zones')
  it('should not render HatchPattern for travelable zones')
  it('should render DirectionIndicator when direction exists')
  it('should render TravelableBadge on hover')
  it('should hide TravelableBadge when not hovered')
})
```

**Validation:** All visual elements render correctly

---

### Task 5.8: Add Tailwind Styles for Zone UI

**File:** Update component files with Tailwind classes

**Changes:**
1. Add travel badge classes to `ZoneTreeItem`:
   - `.travel-badge-travelable`: `bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-xs`
   - `.travel-badge-blocked`: `bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs`
2. Add direction badge classes: `bg-blue-100 text-blue-800 w-5 h-5 rounded-full flex items-center justify-center text-xs`
3. Add zone item hover/selected states

**Tests:** Visual inspection

**Validation:** Styles render correctly in browser

---

## Sprint 6: Integration, Testing & Polish

**Goal:** End-to-end testing, error handling UI, performance optimization, and documentation.

**Demo Criteria:**
- Complete analysis flow works with real/mock floorplans
- All tests pass
- Error states display and allow recovery
- Documentation complete

---

### Task 6.1: Create API Mock Fixtures

**File:** `src/__tests__/fixtures/apiResponses.ts` (NEW)

**Changes:**
1. Create mock coarse detection response with racking_area zones
2. Create mock sub-agent response with aisle_path and racking
3. Create mock error responses (auth, rate limit, timeout)
4. Create mock partial failure scenario
5. Create mock validation failure scenario

**Tests:** Used by other tests

**Validation:** Fixtures cover all scenarios

---

### Task 6.2: Create Integration Tests

**File:** `src/__tests__/integration/agenticAnalysis.test.ts` (NEW)

**Changes:**
1. Test complete flow: upload → analyze → display with mocked APIs
2. Test coarse zones detected correctly
3. Test sub-agent zones created correctly
4. Test hierarchy displayed in Zone Panel
5. Test canvas renders with visual differentiation
6. Test user cancellation mid-analysis
7. Test mode switching (agentic ↔ standard)

**Tests:**
```typescript
describe('Integration: Agentic Analysis', () => {
  it('should complete full analysis flow')
  it('should display hierarchical zones in panel')
  it('should render canvas with travelable/non-travelable styling')
  it('should handle cancellation mid-analysis')
  it('should handle mode switching')
  it('should handle re-analysis after manual edits')
})
```

**Validation:** Integration tests pass

---

### Task 6.3: Create Multi-Phase Progress UI Component

**File:** `src/components/AnalysisProgress.tsx` (NEW or update existing)

**Changes:**
1. Show multi-stage progress:
   - ✓ Detecting zones (when complete)
   - → Analyzing racking area X of Y (current)
   - ○ Finalizing (pending)
2. Show progress bar
3. Show cancel button
4. Show error state with details

**Tests:** `src/components/AnalysisProgress.test.tsx`
```typescript
describe('AnalysisProgress', () => {
  it('should show detecting stage')
  it('should show analyzing stage with count')
  it('should show finalizing stage')
  it('should show checkmarks for completed stages')
  it('should show cancel button')
  it('should call onCancel when clicked')
})
```

**Validation:** Progress UI displays correctly

---

### Task 6.4: Create Error Recovery UI

**File:** `src/components/AnalysisError.tsx` (NEW or update existing)

**Changes:**
1. Display user-friendly error message
2. List zones that failed subdivision
3. Offer "Retry Failed" button (calls `retryFailedSubAgent`)
4. Offer "Continue with Partial Results" button
5. Show technical details in expandable section

**Tests:** `src/components/AnalysisError.test.tsx`
```typescript
describe('AnalysisError', () => {
  it('should display error message')
  it('should list failed zones')
  it('should offer retry button')
  it('should offer continue button')
  it('should call onRetry when clicked')
  it('should call onContinue when clicked')
})
```

**Validation:** Error UI functional

---

### Task 6.5: Add Cost Estimation Feature

**File:** `src/services/costEstimator.ts` (NEW)

**Changes:**
1. Create `estimateAnalysisCost(imageSize: number, estimatedRackingAreas: number): CostEstimate`
2. Estimate based on:
   - Main agent: ~$0.15
   - Sub-agents: ~$0.05 × racking area count
3. Return `{ mainAgent: number, subAgents: number, total: number, formatted: string }`

**Tests:** `src/services/costEstimator.test.ts`
```typescript
describe('Cost Estimator', () => {
  it('should estimate cost for simple floorplan')
  it('should estimate cost for complex floorplan')
  it('should format cost as currency string')
})
```

**Validation:** Estimates reasonable

---

### Task 6.6: Add Cost Warning Modal

**File:** `src/components/CostWarningModal.tsx` (NEW)

**Changes:**
1. Show estimated cost before starting analysis
2. Show breakdown: main agent + sub-agents
3. "Proceed" and "Cancel" buttons
4. Option to "Don't show again"
5. Only show for agentic analysis mode

**Tests:** `src/components/CostWarningModal.test.tsx`
```typescript
describe('CostWarningModal', () => {
  it('should show estimated cost')
  it('should show breakdown')
  it('should call onProceed when confirmed')
  it('should call onCancel when cancelled')
  it('should hide on dont show again')
})
```

**Validation:** Modal works correctly

---

### Task 6.7: Performance Optimization

**File:** `src/hooks/useAgenticAnalysis.ts` and canvas components

**Changes:**
1. Implement concurrency limiting (use settings)
2. Add per-sub-agent timeout (use settings)
3. Add overall analysis timeout (5 minutes)
4. Optimize HatchPattern: reduce density during pan/zoom
5. Optimize canvas: batch updates, use caching

**Tests:** Performance tests (manual or automated)

**Validation:** Analysis completes in reasonable time, canvas remains responsive

---

### Task 6.8: Add Analysis Settings UI

**File:** `src/components/settings/AnalysisSettings.tsx` (NEW)

**Changes:**
1. Toggle for agentic vs standard analysis
2. Slider for concurrency limit (1-5)
3. Input for sub-agent timeout
4. Show cost implications
5. Wire to settings store

**Tests:** `src/components/settings/AnalysisSettings.test.tsx`
```typescript
describe('AnalysisSettings', () => {
  it('should toggle agentic mode')
  it('should update concurrency')
  it('should update timeout')
  it('should persist changes')
})
```

**Validation:** Settings work and persist

---

### Task 6.9: Update Documentation

**File:** `CLAUDE.md` and `docs/`

**Changes:**
1. Update CLAUDE.md:
   - Add agentic analysis section
   - Document new zone types
   - Document travelability concept
2. Update architecture diagram
3. Add troubleshooting section for common issues
4. Mark sprint plan as complete

**Tests:** N/A - documentation

**Validation:** Documentation accurate and complete

---

## Summary

| Sprint | Tasks | Key Deliverable |
|--------|-------|-----------------|
| 1 | 5 | Type system extended, core utilities ready |
| 2 | 8 | Sub-agent API working, validation complete |
| 3 | 9 | Full orchestration hook, integrated with existing flow |
| 4 | 6 | Zone hierarchy UI complete with filtering |
| 5 | 8 | Canvas visual differentiation complete |
| 6 | 9 | E2E tests, error UI, documentation |

**Total Tasks:** 45

---

## Dependencies Graph

```
Sprint 1 ─────────────────────────────────────────────┐
    │                                                 │
    ▼                                                 │
Sprint 2 (API)                                        │
    │                                                 │
    ▼                                                 │
Sprint 3 (Orchestration)                              │
    │                                                 │
    ▼                                                 ▼
Sprint 4 (UI Hierarchy) ◄─────────────────────  Sprint 5 (Canvas)
    │                                                 │
    └────────────────────┬────────────────────────────┘
                         ▼
                    Sprint 6 (Integration)
```

**Parallel Work Opportunities:**
- Sprint 5 (Tasks 5.1-5.5) can start after Sprint 1 completes
- Sprint 5 canvas work does not depend on Sprints 2-3

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API Cost Overruns | Cost estimation modal, user confirmation |
| Sub-agent Failures | Fallback to parent zone, retry capability |
| Browser Memory (multiple crops) | Sequential fallback if memory constrained |
| Race Conditions (UI edits during analysis) | Disable editing during analysis |
| Coordinate Precision Loss | Round to integers at each transform |
| Hatch Pattern Performance | Reduce density during interactions |
| localStorage Size Limits | Size checking, cleanup logic |
| Claude Response Format Changes | Robust JSON extraction with markdown handling |

---

## Acceptance Criteria

### Per-Sprint
- All tasks in sprint completed
- All tests pass (`npm test`)
- Build succeeds (`npm run build`)
- Demo scenario works as described

### Final
- [ ] Full analysis flow works with sample floorplans
- [ ] Zone hierarchy displays correctly
- [ ] Travelability filter works
- [ ] Canvas shows visual differentiation
- [ ] Error recovery works
- [ ] Settings persist
- [ ] Documentation complete

---

**Document Status:** Final
**Last Updated:** January 23, 2026
**Review Status:** Reviewed and feedback incorporated
