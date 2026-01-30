# Floorplan Zone Classification & Editor Tool
## Sprint Plan & Task Breakdown

**Version:** 1.0
**Date:** January 19, 2026
**Total Sprints:** 9

---

## Overview

This document breaks down the Floorplan Zone Classification & Editor Tool into 9 sprints, each resulting in a demoable piece of software. Every task is atomic, committable, and includes validation criteria or tests.

### Sprint Summary

| Sprint | Goal | Key Deliverable |
|--------|------|-----------------|
| 1 | Project Foundation & Basic Image Display | Upload and view floorplan with pan/zoom |
| 2 | AI Integration & Basic Zone Rendering | Analyze floorplan with Claude API, display zones |
| 3 | Zone Selection & Undo/Redo Foundation | Select zones, undo/redo system foundation |
| 4 | Vertex Editing & Zone Manipulation | Edit polygon vertices, move zones |
| 5 | Polygon Drawing Tools | Draw new polygons and rectangles |
| 6 | Zone Management Panel | List, filter, search, toggle zones |
| 7 | Custom Zone Types & Metadata | Create custom types, edit zone properties |
| 8 | Export & Import | JSON, GeoJSON, PNG export, import |
| 9 | Polish, Performance & Accessibility | Error handling, optimization, E2E tests |

---

## Sprint 1: Project Foundation & Basic Image Display

### Goal
A working React application that can accept and display a floorplan image with basic canvas controls (pan/zoom).

### Demo
User can drag-drop or select an image file (JPEG/PNG, up to 20MB), see it displayed on a canvas, pan around, and zoom in/out using mouse wheel, keyboard shortcuts, or controls.

### Tasks

#### S1-T01: Initialize Vite + React + TypeScript project
- Initialize project with `npm create vite@latest` using React + TypeScript template
- Enable strict TypeScript configuration in `tsconfig.json`
- Configure path aliases (`@/` for src directory)
- Add `.gitignore`, `.editorconfig`, `.nvmrc` (Node 20.x)
- **Validation:** `npm run dev` starts without errors, TypeScript compiles with no warnings
- **Test:** N/A (project setup)

#### S1-T02: Install and configure Tailwind CSS
- Install Tailwind CSS, PostCSS, Autoprefixer
- Create `tailwind.config.ts` with custom color palette from spec (Appendix B)
- Define CSS custom properties for all zone type colors
- Set up base styles in `index.css`
- **Validation:** Tailwind utility classes render correctly, zone colors available
- **Test:** Visual verification of color palette

#### S1-T03: Install and configure Vitest and Testing Library
- Install `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- Configure `vitest.config.ts` with React plugin and jsdom environment
- Create `src/setupTests.ts` with jest-dom matchers
- Add test scripts: `test`, `test:watch`, `test:coverage` to `package.json`
- **Validation:** Sample test passes with `npm run test`
- **Test:** Verify test runner works with sample passing test

#### S1-T04: Set up ESLint, Prettier, and pre-commit hooks
- Install ESLint with TypeScript and React plugins (`@typescript-eslint/*`, `eslint-plugin-react-hooks`)
- Configure Prettier with consistent settings (single quotes, trailing commas, etc.)
- Install and configure Husky and lint-staged for pre-commit hooks
- Add `lint` and `format` scripts to `package.json`
- **Validation:** `npm run lint` passes, pre-commit hook runs on staged files
- **Test:** Commit with linting error should be rejected

#### S1-T05: Design and document Zustand store schema
- Create `docs/store-schema.md` documenting complete store shape
- Define all slices: `image`, `zones`, `selection`, `viewport`, `history`, `editor`, `ui`
- Document action signatures and state transitions
- Install `zustand` and `immer` (for immutable updates)
- **Validation:** Schema document complete and reviewed
- **Test:** N/A (design task)

#### S1-T06: Create initial Zustand store with image and viewport slices
- Create `src/store/useProjectStore.ts` using Zustand with Immer middleware
- Implement `image` slice: `{ dataUrl: string | null, width: number, height: number, filename: string }`
- Implement `viewport` slice: `{ zoom: number, panX: number, panY: number }`
- Add actions: `setImage`, `clearImage`, `setZoom`, `setPan`, `resetViewport`
- **Validation:** Store actions update state correctly
- **Test:** Unit tests for all store actions

#### S1-T07: Create basic application shell layout
- Create `src/App.tsx` with main layout structure
- Create `src/components/layout/Header.tsx` with logo placeholder, project name display
- Create `src/components/layout/MainLayout.tsx` with flex layout: left sidebar (280px), center canvas, right sidebar (300px, conditional)
- Create `src/components/layout/Toolbar.tsx` placeholder at bottom
- **Validation:** Layout renders with correct structure, responsive at 1280px+ widths
- **Test:** Snapshot test for layout structure

#### S1-T08: Design and implement empty state with upload prompt
- Create `src/components/upload/EmptyState.tsx` showing upload instructions
- Display supported formats (JPEG, PNG), max file size (20MB)
- Include visual drop zone indicator
- Show "Upload Floorplan" call-to-action
- **Validation:** Empty state displays on initial load
- **Test:** Component renders correct instructions

#### S1-T09: Install and configure Konva.js with React-Konva
- Install `konva` and `react-konva`
- Create `src/components/canvas/CanvasContainer.tsx` wrapper component
- Configure canvas to fill available space using ResizeObserver
- Set up responsive canvas sizing with debounced resize handling
- **Validation:** Empty canvas renders and resizes with container
- **Test:** Canvas component mounts, responds to container size changes

#### S1-T10: Create file validation utility
- Create `src/utils/fileValidation.ts`
- Implement `validateImageFile(file: File): ValidationResult`
- Check file type: accept only `image/jpeg`, `image/jpg`, `image/png`
- Check file size: reject files > 20MB (20 * 1024 * 1024 bytes)
- Return structured error messages for each failure case
- **Validation:** Rejects invalid files with appropriate messages
- **Test:** Unit tests for all validation scenarios (wrong type, too large, valid file)

#### S1-T11: Implement image upload via file picker
- Create `src/components/upload/ImageUpload.tsx` with hidden file input
- Create `src/components/upload/UploadButton.tsx` styled button
- Use `validateImageFile` on selection
- Convert valid file to data URL using FileReader
- Update store with image data on success
- **Validation:** Can select valid image, rejects invalid with toast message
- **Test:** Component tests for upload flow, integration with validation

#### S1-T12: Implement image upload via drag-and-drop
- Create `src/components/upload/DropZone.tsx` with drag event handlers
- Handle `dragenter`, `dragleave`, `dragover`, `drop` events
- Add visual feedback: border highlight on drag-over
- Integrate with same validation logic from S1-T10
- Combine with empty state when no image loaded
- **Validation:** Can drop image onto zone, visual feedback works, rejects invalid files
- **Test:** Component tests for drag events and states

#### S1-T13: Display uploaded image on Konva canvas
- Create `src/components/canvas/FloorplanLayer.tsx` using Konva `Image`
- Load image from data URL using `useImage` hook from react-konva
- Position image at canvas origin (0, 0)
- Store and use image natural dimensions
- **Validation:** Uploaded image appears on canvas at correct size
- **Test:** Image loads and renders with correct dimensions

#### S1-T14: Implement canvas zoom functionality
- Add zoom state to viewport slice (initial: 1.0, min: 0.1, max: 5.0)
- Implement wheel-to-zoom with cursor as zoom origin
- Create `src/components/canvas/ZoomControls.tsx` with slider and percentage display
- Add keyboard shortcuts: `+`/`=` zoom in, `-` zoom out, `0` reset to 100%
- **Validation:** Zoom works via wheel, controls, and keyboard
- **Test:** Unit tests for zoom calculations, component tests for controls

#### S1-T15: Implement canvas pan functionality
- Add pan offset state (panX, panY) to viewport slice
- Implement middle-mouse-button drag for panning
- Implement Space+drag for pan mode (hold Space, then drag)
- Create pan toggle in canvas controls area
- Constrain pan to keep image partially visible (at least 100px)
- **Validation:** Can pan canvas, pan constraints work
- **Test:** Unit tests for pan constraints, component tests for interactions

#### S1-T16: Display image information
- Create `src/components/canvas/ImageInfo.tsx` displaying filename and dimensions
- Format as "{filename} - {width} × {height} px"
- Add scale indicator in corner of canvas (updates with zoom level)
- **Validation:** Info displays correctly after image upload
- **Test:** Component renders correct info

#### S1-T17: Create keyboard shortcut system
- Create `src/hooks/useKeyboardShortcuts.ts` hook
- Implement keyboard event listener with modifier key detection
- Support shortcuts: `+`/`-`/`0` (zoom), `Space` (hold for pan)
- Prevent default browser behavior for handled shortcuts
- **Validation:** Shortcuts trigger correct actions
- **Test:** Keyboard event handling tests

#### S1-T18: Write unit tests for Sprint 1 utilities
- Complete test coverage for `fileValidation.ts`
- Complete test coverage for viewport store actions
- Test zoom and pan calculation functions
- Achieve >80% coverage for utility functions
- **Validation:** All tests pass, coverage threshold met
- **Test:** This IS the testing task

---

## Sprint 2: AI Integration & Basic Zone Rendering

### Goal
Connect to Claude API, analyze floorplan images, and display detected zones as static polygon overlays with confidence scores.

### Demo
User uploads image, enters API key (or uses configured key), clicks "Analyze", sees loading indicator with progress, then zones appear as colored semi-transparent overlays. Hovering shows zone info tooltip.

### Tasks

#### S2-T01: Define Zone type system (interfaces, enums, colors)
- Create `src/types/zone.ts` with `Zone`, `Point`, `ZoneMetadata` interfaces per spec
- Create `ZoneType` union type with all predefined types
- Create `src/utils/zoneColors.ts` with `ZONE_COLORS` constant mapping type → hex color
- Add `getZoneColor(type: ZoneType): string` and `getDefaultOpacity(): number` utilities
- Add JSDoc documentation for all types
- **Validation:** Types compile, all zone types have colors
- **Test:** Type tests using `expectTypeOf`, unit tests for color mapping

#### S2-T02: Add zones slice to Zustand store
- Add `zones: Zone[]` to store state
- Add actions: `addZone`, `addZones`, `updateZone`, `removeZone`, `clearZones`
- Add `setZonesFromAnalysis(zones: Zone[])` for bulk replacement
- Integrate with Immer for immutable updates
- **Validation:** Can CRUD zones in store
- **Test:** Store action tests for all zone operations

#### S2-T03: Create ZoneOverlayLayer component
- Create `src/components/canvas/ZoneOverlayLayer.tsx` using Konva `Group`
- Create `src/components/canvas/ZonePolygon.tsx` using Konva `Line` (closed: true)
- Map zones from store to polygon shapes
- Apply zone-type colors with configurable opacity (default 0.5)
- Render zones in order (first = bottom, last = top)
- **Validation:** Hardcoded test zones render as colored polygons
- **Test:** Component renders correct number of polygons with correct colors

#### S2-T04: Create API key configuration
- Create `src/components/settings/ApiKeyModal.tsx` for entering Anthropic API key
- Store key in localStorage (with warning about security)
- Support environment variable `VITE_ANTHROPIC_API_KEY` as fallback
- Create `.env.example` with placeholder
- Add API key validation (check format)
- **Validation:** Can enter, save, and retrieve API key
- **Test:** Component tests for key management flow

#### S2-T05: Install Anthropic SDK and create API service
- Install `@anthropic-ai/sdk`
- Create `src/services/claudeApi.ts`
- Implement `analyzeFloorplan(imageBase64: string, mediaType: string, apiKey: string): Promise<APIResponse>`
- Use exact prompt from spec section 3.4.2
- Configure model as `claude-opus-4-20250514`, max_tokens 8192
- **Validation:** Function compiles, API call structure matches spec
- **Test:** Unit test with mocked SDK client

#### S2-T06: Create Claude API mock for testing
- Create `src/services/__mocks__/claudeApi.ts`
- Implement mock responses for success, rate limit, timeout, invalid response
- Create fixture files with sample zone data
- Configure Vitest to use mocks in test environment
- **Validation:** Tests can run without real API calls
- **Test:** Mock correctly simulates various scenarios

#### S2-T07: Implement API response parser
- Create `src/utils/parseZones.ts`
- Implement `parseZonesFromResponse(content: string): Zone[]`
- Extract JSON from response (handle markdown code blocks with ```json)
- Transform API zone format to app Zone format
- Generate UUIDs for each zone using `crypto.randomUUID()`
- Apply default metadata (colors from type, opacity 0.5, visible true, locked false)
- Set `source: 'ai'`, `createdAt`, `updatedAt` timestamps
- **Validation:** Parses sample API responses correctly
- **Test:** Unit tests for various response formats, edge cases (empty, malformed)

#### S2-T08: Implement retry logic with exponential backoff
- Create `src/utils/retry.ts` with `withRetry<T>(fn, options): Promise<T>`
- Implement exponential backoff: 1s, 2s, 4s delays
- Max 3 retries for rate limit (429) errors only
- No retry for 4xx client errors (except 429) or parsing errors
- **Validation:** Retries occur with correct timing for rate limits
- **Test:** Unit tests for retry logic, timing, and conditions

#### S2-T09: Create AnalyzeButton component
- Create `src/components/analysis/AnalyzeButton.tsx`
- Disable when: no image loaded, no API key configured, analysis in progress
- Show different states: ready, analyzing, disabled
- Trigger analysis on click
- **Validation:** Button enables/disables correctly based on state
- **Test:** Component tests for all states

#### S2-T10: Implement analysis loading state with progress messaging
- Add `analysisState: 'idle' | 'analyzing' | 'error'` to store
- Create `src/components/analysis/AnalyzingOverlay.tsx` with spinner
- Show progress messages: "Sending image...", "Analyzing floorplan...", "Processing zones..."
- Display elapsed time indicator
- Allow cancellation (abort controller)
- **Validation:** Overlay shows during analysis with appropriate messages
- **Test:** Component renders correct states

#### S2-T11: Wire analysis button to API service
- On button click, convert current image to base64
- Call `analyzeFloorplan` with retry wrapper
- Handle loading state transitions
- **Validation:** Click triggers API call with correct data
- **Test:** Integration test with mocked API

#### S2-T12: Parse API response and add zones to store
- On successful API response, call `parseZonesFromResponse`
- Validate parsed zones have required fields
- Add zones to store via `setZonesFromAnalysis`
- Log analysis notes to console for debugging
- **Validation:** Zones appear in store after successful analysis
- **Test:** Integration test for full flow with mock

#### S2-T13: Implement API error handling UI
- Create `src/components/analysis/AnalysisErrorModal.tsx`
- Handle error types: network error, rate limit, timeout, invalid response, API error
- Display user-friendly messages per spec section 7.1
- Show "Retry" button for retryable errors
- Show raw error details in expandable section (for debugging)
- **Validation:** Errors display appropriate messages with retry option
- **Test:** Component tests for different error types

#### S2-T14: Implement analysis result caching
- Create image hash function (simple hash of dataUrl prefix + dimensions)
- Store parsed zones in memory cache with hash key
- Check cache before making API call
- Add "Re-analyze" option (bypasses cache)
- Add visual indicator when showing cached results
- **Validation:** Second analysis of same image uses cache
- **Test:** Cache hit/miss tests

#### S2-T15: Display confidence scores and zone info on hover
- Add hover state handling to `ZonePolygon`
- Create `src/components/canvas/ZoneTooltip.tsx` showing name, type, confidence
- Position tooltip near cursor (offset to avoid overlap)
- Increase polygon opacity on hover
- **Validation:** Tooltip appears on hover with correct data
- **Test:** Component tests for hover interaction and tooltip content

#### S2-T16: Handle offline/network error state
- Detect navigator.onLine status
- Show warning when offline before attempting analysis
- Handle network errors gracefully with clear messaging
- **Validation:** Offline state prevents analysis with explanation
- **Test:** Tests for offline detection

#### S2-T17: Write unit tests for Sprint 2 utilities
- Complete test coverage for `parseZones.ts`
- Complete test coverage for `retry.ts`
- Test zone color utilities
- Test cache logic
- **Validation:** All tests pass, >80% coverage for utilities
- **Test:** This IS the testing task

---

## Sprint 3: Zone Selection & Undo/Redo Foundation

### Goal
Select zones by clicking with visual feedback, view basic properties, and establish undo/redo system foundation that will support all future editing operations.

### Demo
User can click zones to select them (visual highlight), Shift+click to multi-select, see properties panel, and use Ctrl+Z/Ctrl+Shift+Z to undo/redo selection changes. Undo/redo system is ready for editing operations.

### Tasks

#### S3-T01: Design history/undo system architecture
- Document undo/redo approach in `docs/undo-redo-design.md`
- Choose snapshot-based approach (simpler, works with Immer)
- Define which actions are recordable (zone mutations, not UI state)
- Define history entry structure and max history length (50)
- **Validation:** Design document complete
- **Test:** N/A (design task)

#### S3-T02: Add selection slice to store
- Add `selectedZoneIds: string[]` to store
- Add actions: `selectZone`, `deselectZone`, `toggleZoneSelection`, `clearSelection`, `selectAll`
- Add `selectMultiple(ids: string[])` for bulk selection
- **Validation:** Selection state updates correctly
- **Test:** Store action tests for selection operations

#### S3-T03: Add history slice to store
- Add `history: { zones: Zone[] }[]` and `historyIndex: number` to store
- Add `pushHistory()` action that snapshots current zones
- Add `undo()` and `redo()` actions
- Add `canUndo` and `canRedo` computed selectors
- Limit history to 50 entries (drop oldest when exceeded)
- **Validation:** History accumulates, index tracks position
- **Test:** Store tests for history management

#### S3-T04: Create history recording middleware
- Create `recordHistory` helper that wraps zone-mutating actions
- Automatically call `pushHistory` before mutations
- Clear forward history when new action taken after undo
- Skip recording for: selection changes, viewport changes, UI state
- **Validation:** Mutating actions create history entries automatically
- **Test:** Verify history recorded for zone mutations only

#### S3-T05: Implement undo action
- Restore zones from `history[historyIndex - 1]`
- Decrement `historyIndex`
- Clear selection (undone zones may not exist)
- Disable when `historyIndex === 0`
- **Validation:** Undo restores previous zone state
- **Test:** Undo correctly reverts zone changes

#### S3-T06: Implement redo action
- Restore zones from `history[historyIndex + 1]`
- Increment `historyIndex`
- Clear selection
- Disable when at history end
- **Validation:** Redo restores undone state
- **Test:** Redo correctly restores, new action clears forward history

#### S3-T07: Add undo/redo buttons to toolbar
- Create `src/components/toolbar/UndoButton.tsx` and `RedoButton.tsx`
- Disable based on `canUndo`/`canRedo`
- Show tooltip with action hint
- Use icons (↶ ↷ or similar)
- **Validation:** Buttons enable/disable correctly
- **Test:** Button state reflects history position

#### S3-T08: Implement Ctrl+Z / Ctrl+Shift+Z shortcuts
- Add to keyboard shortcuts system
- `Ctrl+Z` → undo
- `Ctrl+Shift+Z` or `Ctrl+Y` → redo
- Prevent browser default undo behavior
- **Validation:** Shortcuts trigger undo/redo
- **Test:** Shortcut handling tests

#### S3-T09: Implement zone selection on click
- Add click handler to `ZonePolygon` component
- On click: call `selectZone(id)` (replaces selection)
- On click empty canvas: call `clearSelection()`
- Store last clicked zone for property panel
- **Validation:** Clicking zone selects it, clicking canvas deselects
- **Test:** Selection behavior tests

#### S3-T10: Add visual styling for selected zones
- Increase opacity to 0.8 for selected zones
- Add thick dashed stroke (strokeWidth: 3, dash: [10, 5])
- Change stroke color to white or contrasting color
- Bring selected zones to front (render last)
- **Validation:** Selected zones visually distinct
- **Test:** Visual styles applied correctly based on selection

#### S3-T11: Implement multi-select with Shift+Click
- Detect Shift key during polygon click
- Shift+click: toggle zone in/out of selection (add if not selected, remove if selected)
- Regular click still replaces entire selection
- **Validation:** Shift+click adds/removes from selection
- **Test:** Multi-select behavior tests

#### S3-T12: Implement Select All (Ctrl+A)
- Add `Ctrl+A` to keyboard shortcuts
- Select all visible, unlocked zones
- **Validation:** All applicable zones selected
- **Test:** Select all behavior with various zone states

#### S3-T13: Sync panel selection with canvas selection
- Clicking zone in panel (to be built) should select on canvas
- Selecting on canvas should highlight in panel
- Scroll panel to show selected zone (prep for Sprint 6)
- **Validation:** Selection state shared between canvas and future panel
- **Test:** Selection sync through store

#### S3-T14: Create basic PropertiesPanel layout
- Create `src/components/properties/PropertiesPanel.tsx` for right sidebar
- Show panel when zone(s) selected, collapse when none selected
- Display panel header with "Properties" or "N zones selected"
- **Validation:** Panel shows/hides based on selection
- **Test:** Panel visibility tests

#### S3-T15: Display zone properties in panel
- Show selected zone: name, type (with color badge), source (AI/Manual)
- Show confidence score for AI zones (as percentage)
- Show vertex count
- Show created/updated timestamps (formatted)
- For multi-select: show "N zones selected", common type if same
- **Validation:** Properties display correctly for single and multi-select
- **Test:** Component renders correct zone data

#### S3-T16: Add editor mode state
- Add `editorMode: 'select' | 'pan' | 'draw_polygon' | 'draw_rect' | 'edit_vertices'` to store
- Default to 'select' mode
- Add `setEditorMode(mode)` action
- **Validation:** Mode state changes correctly
- **Test:** Mode switching tests

#### S3-T17: Create toolbar mode buttons
- Create `src/components/toolbar/ToolButton.tsx` base component
- Add Select (V) button - switches to 'select' mode
- Show active/pressed state for current mode
- Add keyboard shortcut `V` for select mode
- **Validation:** Select button works, shows active state
- **Test:** Toolbar button tests

#### S3-T18: Implement cursor changes based on editor mode
- Update canvas cursor based on current mode
- select: 'default', pan: 'grab'/'grabbing', draw modes: 'crosshair'
- During drag operations, show appropriate cursor
- **Validation:** Cursor changes appropriately per mode
- **Test:** Cursor style tests per mode

#### S3-T19: Write unit tests for Sprint 3
- Test history slice actions thoroughly
- Test selection slice actions
- Test history middleware recording behavior
- Integration test: make changes → undo → redo
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 4: Vertex Editing & Zone Manipulation

### Goal
Edit polygon vertices (move, add, delete), move entire zones, delete zones, duplicate zones. All operations support undo/redo.

### Demo
User selects a zone, sees vertex handles, drags vertices to reshape, clicks edges to add vertices, deletes vertices (min 3), moves entire zone by dragging, duplicates with Ctrl+D, deletes with Delete key. All operations undoable.

### Tasks

#### S4-T01: Implement vertex display for selected zones
- Create `src/components/canvas/VertexHandle.tsx` (small circles at vertices)
- Only render handles for selected zones in 'edit_vertices' mode
- Position handles at each vertex coordinate
- Style: 8px diameter, white fill, dark stroke
- **Validation:** Vertex handles appear when zone selected in edit mode
- **Test:** Correct number of handles at correct positions

#### S4-T02: Add Edit Vertices mode to toolbar
- Add Edit Vertices (E) button to toolbar
- Switch to 'edit_vertices' mode on click
- Add keyboard shortcut `E`
- When entering edit mode, keep current selection
- **Validation:** Mode activates, vertex handles appear for selected zones
- **Test:** Mode activation tests

#### S4-T03: Implement vertex dragging
- Add drag handlers to `VertexHandle` component
- During drag: update vertex position visually (local state)
- On drag end: update zone in store (triggers history)
- Constrain vertex to canvas bounds
- **Validation:** Can drag vertices to new positions
- **Test:** Vertex position updates correctly

#### S4-T04: Add addVertex action to store
- Implement `addVertex(zoneId: string, afterIndex: number, point: Point)` action
- Insert new vertex into vertices array at specified position
- Update `updatedAt` timestamp
- Record in history
- **Validation:** New vertex inserted at correct position
- **Test:** Store action test for vertex insertion

#### S4-T05: Implement "add vertex" on edge click
- Detect clicks on polygon edges (line segments between vertices)
- Use point-to-line-segment distance calculation
- Click within 10px of edge → add vertex at nearest point on edge
- Show cursor change (`copy` or `cell`) when hovering over edge
- **Validation:** Clicking edge adds vertex at that point
- **Test:** Edge hit detection and vertex insertion tests

#### S4-T06: Add removeVertex action to store
- Implement `removeVertex(zoneId: string, vertexIndex: number)` action
- **Enforce minimum 3 vertices** - action should no-op or throw if would go below 3
- Update `updatedAt` timestamp
- Record in history
- **Validation:** Vertex removed, minimum 3 enforced
- **Test:** Store action tests including minimum vertex guard

#### S4-T07: Implement vertex deletion UI
- Delete key when vertex handle focused/hovered → delete vertex
- Add right-click context menu on vertex with "Delete Vertex" option
- Show visual feedback (red highlight) on hover when delete possible
- Disable delete visual when only 3 vertices remain
- **Validation:** Can delete vertices, minimum enforced
- **Test:** Deletion interaction tests

#### S4-T08: Implement zone translation (move entire zone)
- In 'select' mode, allow dragging selected zone(s) to move
- Calculate drag delta and apply to all vertices
- Show move cursor when hovering selected zone
- Support moving multiple selected zones together
- Record single history entry for move operation
- **Validation:** Can drag zones to new positions
- **Test:** Zone translation tests, multi-zone move

#### S4-T09: Add deleteZone action to store
- Implement `deleteZone(zoneId: string)` action
- Implement `deleteZones(zoneIds: string[])` for multi-delete
- Clear deleted zones from selection
- Record in history (single entry for multi-delete)
- **Validation:** Zones removed from store
- **Test:** Delete action tests, selection cleared

#### S4-T10: Implement zone deletion UI
- Add Delete button to toolbar (enabled when zones selected)
- Delete/Backspace key when zones selected → delete zones
- Don't delete if in vertex edit mode with vertex focused
- Add confirmation dialog for deleting >3 zones
- **Validation:** Can delete via button and keyboard
- **Test:** Deletion UI flow tests

#### S4-T11: Add duplicateZone action to store
- Implement `duplicateZone(zoneId: string)` action
- Copy all properties, generate new UUID
- Offset position by (+20px, +20px)
- Set source to 'manual', clear confidence
- Update timestamps
- Record in history
- **Validation:** Duplicate zone created with offset
- **Test:** Duplication creates correct copy

#### S4-T12: Implement zone duplication UI
- Add Ctrl+D keyboard shortcut
- Duplicate all selected zones
- Select duplicated zones (deselect originals)
- **Validation:** Can duplicate via keyboard
- **Test:** Duplication UI tests

#### S4-T13: Add zone locking functionality
- Add `isLocked` to zone metadata (default false)
- Prevent editing locked zones: no vertex move, delete, or zone move
- Show locked visual state (hatched overlay or lock icon)
- Add lock/unlock toggle in properties panel
- Locked zones can still be selected and viewed
- **Validation:** Locked zones cannot be edited
- **Test:** Lock state prevents edit operations

#### S4-T14: Create zone context menu
- Create `src/components/canvas/ZoneContextMenu.tsx`
- Right-click on zone shows menu with: Edit Vertices, Duplicate, Delete, Lock/Unlock
- Position menu at click location
- Close on click outside or Escape
- **Validation:** Context menu appears with all options
- **Test:** Menu renders, options trigger correct actions

#### S4-T15: Write unit tests for Sprint 4
- Test vertex manipulation store actions
- Test edge hit detection algorithm
- Test zone translation calculations
- Test duplication logic
- Integration test: edit vertices → undo → verify restoration
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 5: Polygon Drawing Tools

### Goal
Manually draw new polygons and rectangles to create custom zones with zone type assignment.

### Demo
User selects polygon tool, clicks to place vertices, sees preview, double-clicks to complete, selects zone type from picker, zone appears. Same flow for rectangles with click-drag. All operations undoable.

### Tasks

#### S5-T01: Add drawing state to store
- Add `drawingState: { mode: 'polygon' | 'rect' | null, vertices: Point[], startPoint: Point | null }` to store
- Add actions: `startDrawing`, `addDrawingVertex`, `updateDrawingPreview`, `completeDrawing`, `cancelDrawing`
- **Validation:** Drawing state updates correctly through lifecycle
- **Test:** Store action tests for drawing flow

#### S5-T02: Implement draw polygon mode activation
- Add Draw Polygon (P) button to toolbar
- Set editor mode to 'draw_polygon' on click
- Add keyboard shortcut `P`
- Clear any selection when entering draw mode
- Set cursor to crosshair
- **Validation:** Mode activates, cursor changes
- **Test:** Mode activation tests

#### S5-T03: Implement click-to-place vertices
- In 'draw_polygon' mode, capture canvas clicks
- First click: start drawing, add first vertex
- Subsequent clicks: add vertex to `drawingState.vertices`
- Ignore clicks too close to previous vertex (<5px)
- **Validation:** Clicks add vertices
- **Test:** Click handling and vertex accumulation tests

#### S5-T04: Create DrawingPreview component
- Create `src/components/canvas/DrawingPreview.tsx`
- Render placed vertices as small circles
- Render lines connecting vertices
- Show semi-transparent polygon fill (if 3+ vertices)
- Show line from last vertex to current cursor position
- Update on mouse move
- **Validation:** Preview shows intended polygon shape
- **Test:** Preview renders correctly with partial vertices

#### S5-T05: Implement double-click to complete polygon
- Detect double-click (or click on first vertex) to finish drawing
- Require minimum 3 vertices to complete
- If <3 vertices, show toast "At least 3 points required"
- On valid completion: trigger zone creation flow
- **Validation:** Double-click completes polygon with 3+ vertices
- **Test:** Completion detection and minimum vertex enforcement

#### S5-T06: Implement Escape to cancel drawing
- Escape key during drawing → cancel
- Clear `drawingState`
- Return to select mode
- Show toast "Drawing cancelled"
- **Validation:** Escape cancels drawing, clears preview
- **Test:** Cancel behavior tests

#### S5-T07: Create ZoneTypeSelector component
- Create `src/components/zones/ZoneTypeSelector.tsx`
- List all predefined zone types with color swatches
- Show type name and color preview
- Support keyboard navigation (arrow keys, enter to select)
- Include "Custom..." option at bottom (prep for Sprint 7)
- **Validation:** All zone types selectable with visual feedback
- **Test:** Component renders all types, selection works

#### S5-T08: Create zone creation flow after drawing
- After polygon completed, show `ZoneTypeSelector` in modal/popover
- Generate zone ID with `crypto.randomUUID()`
- Set source to 'manual'
- Apply selected type's color and default metadata
- Add zone to store (triggers history)
- Clear drawing state
- Select newly created zone
- **Validation:** New zone appears with correct type and properties
- **Test:** Full creation flow integration test

#### S5-T09: Implement rectangle drawing mode
- Add Draw Rectangle (R) button to toolbar
- Set editor mode to 'draw_rect' on click
- Add keyboard shortcut `R`
- Set cursor to crosshair
- **Validation:** Mode activates correctly
- **Test:** Mode activation tests

#### S5-T10: Implement click-drag rectangle drawing
- Capture mousedown as rectangle start point
- Track mouse position during drag
- Calculate rectangle from start to current (handle negative dimensions)
- Render rectangle preview during drag
- **Validation:** Rectangle preview follows drag
- **Test:** Rectangle calculation from drag coordinates

#### S5-T11: Complete rectangle on mouse release
- On mouseup, convert rectangle to 4-vertex polygon (clockwise: TL, TR, BR, BL)
- Require minimum size: 20x20 pixels
- If too small, show toast and cancel
- Trigger zone creation flow with polygon vertices
- **Validation:** Rectangle creates zone on release
- **Test:** Rectangle to polygon conversion, minimum size enforcement

#### S5-T12: Add snap-to-grid option
- Add `snapToGrid: boolean` and `gridSize: number` to store (default: false, 10px)
- Add grid snap toggle button to toolbar
- When enabled, snap drawing vertices to nearest grid point
- Show grid overlay when snap enabled
- **Validation:** Vertices snap to grid when enabled
- **Test:** Snap calculation tests

#### S5-T13: Add drawing alignment guides
- Show alignment guides when near existing vertices (within 5px horizontal/vertical)
- Highlight when new vertex aligns with existing vertex
- Show distance indicator from start point during rectangle draw
- **Validation:** Guides appear when aligned
- **Test:** Alignment detection tests

#### S5-T14: Write unit tests for Sprint 5
- Test drawing state management
- Test polygon/rectangle vertex calculations
- Test snap-to-grid calculations
- Test alignment detection
- Integration test: draw polygon → select type → verify zone created
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 6: Zone Management Panel

### Goal
Full zone list sidebar with grouping by type, filtering, search, visibility toggles, and drag-and-drop reordering.

### Demo
User sees all zones listed in left panel grouped by type, can search by name, filter by type, toggle individual/bulk visibility, reorder zones via drag-drop (affects rendering order).

### Tasks

#### S6-T01: Create ZonePanel sidebar component
- Create `src/components/panel/ZonePanel.tsx` for left sidebar
- Fixed width 280px, full height, scrollable content
- Add collapse/expand toggle button
- Panel header with "Zones" title and zone count
- **Validation:** Panel renders in correct position, collapse works
- **Test:** Component renders, collapse toggle works

#### S6-T02: Create ZoneListItem component
- Create `src/components/panel/ZoneListItem.tsx`
- Show: color swatch (12px circle), zone name (truncated if long), type badge
- Hover state with subtle background
- Selected state with highlighted background
- Click to select zone (syncs with canvas selection)
- **Validation:** Items render with correct data, click selects
- **Test:** Component displays zone properties correctly

#### S6-T03: Implement zone grouping by type
- Group zones by `type` in panel display
- Create `src/components/panel/ZoneTypeGroup.tsx` collapsible section
- Show type name, color swatch, and count in header (e.g., "Aisles (3)")
- Expand/collapse on header click
- Store expanded state in local storage
- **Validation:** Zones grouped correctly, groups collapsible
- **Test:** Grouping logic tests

#### S6-T04: Implement zone search
- Add search input to panel header
- Filter displayed zones by name (case-insensitive substring match)
- Highlight matching text in results
- Show "No results" message when no matches
- Clear button (X) for search input
- Debounce search input (150ms)
- **Validation:** Search filters zones correctly
- **Test:** Search filtering tests

#### S6-T05: Implement zone type filter dropdown
- Add filter dropdown button next to search
- Multi-select checkboxes for each zone type
- "All Types" option that checks/unchecks all
- Filter applies in combination with search
- Show active filter indicator on button
- **Validation:** Filter shows only selected types
- **Test:** Filter combination tests

#### S6-T06: Add visibility toggles (per-zone and per-type)
- Add eye icon button to `ZoneListItem`
- Toggle `isVisible` in zone metadata on click
- Hidden zones don't render on canvas (but stay in list, dimmed)
- Add eye icon to `ZoneTypeGroup` header for bulk toggle
- Show mixed state icon when type has some visible, some hidden
- **Validation:** Toggles hide/show zones on canvas
- **Test:** Visibility toggle tests

#### S6-T07: Add "Show All" / "Hide All" buttons
- Add buttons to panel header (or dropdown menu)
- "Show All" sets all zones visible
- "Hide All" sets all zones hidden
- Keyboard shortcuts: could use `Shift+H` for hide all
- **Validation:** Buttons toggle all zone visibility
- **Test:** Show/hide all tests

#### S6-T08: Create ZoneContextMenu for panel
- Right-click on zone item shows context menu
- Options: Select, Edit (enters edit mode), Duplicate, Delete, Lock/Unlock
- "Change Type" submenu with all types
- Options: Show/Hide
- Context-aware options (don't show Delete for locked zones without unlock)
- **Validation:** Context menu appears with correct options
- **Test:** Menu renders with correct options per zone state

#### S6-T09: Implement "Change Type" for zones
- In context menu and properties panel
- Show zone type selector
- Update zone type and apply new type's default color
- For multi-select: update all selected zones
- Record as single history entry
- **Validation:** Can change type of single/multiple zones
- **Test:** Type change tests

#### S6-T10: Implement bulk delete from panel
- "Delete Selected" option when multiple zones selected
- Show confirmation dialog with count: "Delete 5 zones?"
- Delete all selected zones
- Record as single history entry
- **Validation:** Bulk delete works, single undo restores all
- **Test:** Bulk delete tests

#### S6-T11: Implement zone reordering (drag-and-drop)
- Add drag handle (⋮⋮) to `ZoneListItem`
- Allow drag-and-drop reorder within panel
- Update zone order in store (affects canvas z-index: first in list = bottom)
- Show drop indicator line during drag
- Record reorder in history
- **Validation:** Can reorder zones, rendering order changes on canvas
- **Test:** Reorder updates store and canvas correctly

#### S6-T12: Implement panel-canvas selection sync
- Clicking zone in panel selects on canvas (and vice versa)
- Multi-select with Ctrl+click in panel
- Auto-scroll panel to show selected zone when selected via canvas
- Highlight zone on canvas when hovering in panel
- **Validation:** Selection synced bidirectionally, scroll works
- **Test:** Selection sync tests

#### S6-T13: Add localStorage persistence for project
- Auto-save project state to localStorage (debounced, 2 seconds after changes)
- Save: image data, zones, custom types, viewport, editor mode
- Load project state on app start
- Add manual "Save" button (Ctrl+S) with toast confirmation
- Handle storage quota errors gracefully
- **Validation:** Project persists across browser sessions
- **Test:** localStorage persistence tests

#### S6-T14: Write unit tests for Sprint 6
- Test grouping logic
- Test search/filter combinations
- Test visibility toggle logic
- Test reorder operations
- Test localStorage save/load
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 7: Custom Zone Types & Metadata Editing

### Goal
Users can create custom zone types with their own names and colors, and edit all zone metadata (name, description, color, opacity, custom properties).

### Demo
User creates "Pallet Storage" as custom type with teal color, draws a zone with it. User edits zone name, adds description, overrides color, adjusts opacity. Custom types persist across sessions.

### Tasks

#### S7-T01: Add customZoneTypes slice to store
- Add `customZoneTypes: CustomZoneType[]` to store
- Interface: `{ id: string, name: string, label: string, color: string, description?: string }`
- Add actions: `addCustomType`, `updateCustomType`, `removeCustomType`
- Include custom types in localStorage persistence
- **Validation:** Custom types can be CRUD'd in store
- **Test:** Store action tests for custom types

#### S7-T02: Create ColorPicker component
- Create `src/components/common/ColorPicker.tsx`
- Show preset swatches (8-12 common colors)
- Include custom hex input with validation
- Show current color preview
- Support both controlled and uncontrolled modes
- **Validation:** Can select preset or enter custom color
- **Test:** Color selection and validation tests

#### S7-T03: Create AddCustomTypeModal component
- Create `src/components/zones/AddCustomTypeModal.tsx`
- Form fields: name (snake_case, required), label (display name), color (picker), description
- Validate unique name (not conflicting with predefined or existing custom)
- Preview how type will appear in lists
- **Validation:** Modal collects all required data with validation
- **Test:** Form validation tests

#### S7-T04: Add custom types to ZoneTypeSelector
- Include custom types below predefined types (with separator)
- Show custom types with their configured colors
- Add "Create New Type..." option at bottom
- Clicking "Create New Type" opens AddCustomTypeModal
- **Validation:** Custom types appear and are selectable
- **Test:** Custom types integrated into selector

#### S7-T05: Implement zone name and description editing
- Add editable name field in properties panel (click to edit or always editable)
- Double-click zone name in list to inline edit
- Add textarea for description in properties panel
- Auto-save on blur or Enter (for name)
- Validate name is non-empty
- **Validation:** Can edit zone names and descriptions
- **Test:** Editing tests with validation

#### S7-T06: Implement zone color override
- Add color picker to properties panel
- Allow per-zone color override (independent of type color)
- Show "Using type color" vs "Custom color" indicator
- "Reset to type color" button
- **Validation:** Individual zones can have custom colors
- **Test:** Color override tests

#### S7-T07: Implement zone opacity adjustment
- Add opacity slider (0-100%) in properties panel
- Live preview on canvas during adjustment
- Update store on slider release
- Show current value as percentage
- **Validation:** Can adjust individual zone opacity
- **Test:** Opacity adjustment tests

#### S7-T08: Create CustomTypeManager component
- Create `src/components/settings/CustomTypeManager.tsx`
- Access via Settings modal or dedicated panel
- List all custom types with edit/delete options
- Show usage count per type (how many zones use it)
- Prevent delete if type in use (show warning with zone count)
- **Validation:** Can manage all custom types
- **Test:** Custom type management tests

#### S7-T09: Implement custom properties support
- Add `customProperties?: Record<string, string>` to zone metadata
- Create key-value editor in properties panel (expandable section)
- Add/remove property buttons
- Validate unique keys within zone
- **Validation:** Can add/edit/remove custom properties
- **Test:** Custom properties CRUD tests

#### S7-T10: Display zone source and timestamps
- Show source badge: "AI Generated" (with confidence %) or "Manually Created"
- Show created timestamp formatted as relative time ("2 hours ago")
- Show updated timestamp
- Show exact timestamp on hover/tooltip
- **Validation:** Source and timestamps display correctly
- **Test:** Timestamp formatting tests

#### S7-T11: Implement confidence score filter
- Add confidence threshold slider to zone panel filters
- Filter AI-generated zones by minimum confidence (e.g., ">70%")
- Manual zones always pass filter
- Show confidence range indicator
- **Validation:** Can filter zones by confidence level
- **Test:** Confidence filter tests

#### S7-T12: Write unit tests for Sprint 7
- Test custom type validation (unique name, valid color)
- Test zone metadata update actions
- Test color override logic
- Test custom properties operations
- Test confidence filtering
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 8: Export & Import

### Goal
Export zone data as JSON and GeoJSON, import previously exported data, export annotated image as PNG, copy to clipboard.

### Demo
User exports zones as JSON, saves file. User imports JSON file into new session, zones appear. User exports annotated PNG showing floorplan with zone overlays and legend.

### Tasks

#### S8-T01: Create export utilities module
- Create `src/utils/export.ts`
- Implement `formatAsJSON(state: ProjectState): ExportJSON` per spec section 6.1
- Include version, timestamp, project info, zones, custom types
- **Validation:** Output matches spec format exactly
- **Test:** JSON export format tests

#### S8-T02: Create ExportModal component
- Create `src/components/export/ExportModal.tsx`
- Accessible via header Export button and Ctrl+E
- Show export format options as tabs or radio buttons
- Show filename preview
- Export button triggers download
- **Validation:** Modal shows options, triggers export
- **Test:** Modal interaction tests

#### S8-T03: Implement JSON export and download
- Add JSON tab to ExportModal
- Generate JSON with `formatAsJSON`
- Create blob and trigger browser download
- Default filename: `{projectName}_zones.json`
- Allow filename customization
- **Validation:** JSON file downloads with correct content
- **Test:** Export flow tests

#### S8-T04: Implement GeoJSON export
- Create `formatAsGeoJSON(zones: Zone[]): GeoJSON` per spec section 6.2
- Create FeatureCollection with Polygon features
- Close polygon rings (first point = last point)
- Include zone properties in feature properties
- Add GeoJSON tab to ExportModal
- **Validation:** Output is valid GeoJSON (validate against schema)
- **Test:** GeoJSON format validation tests

#### S8-T05: Implement clipboard copy
- Add "Copy to Clipboard" button in export modal
- Copy JSON format to clipboard using Clipboard API
- Show success toast: "Copied to clipboard"
- Handle clipboard API errors (permissions, not available)
- **Validation:** JSON copied to clipboard
- **Test:** Clipboard copy tests (with mock API)

#### S8-T06: Create import utilities module
- Create `src/utils/import.ts`
- Implement `parseImportedJSON(content: string): ImportResult`
- Validate structure against expected format
- Handle version differences (future-proofing)
- Return zones, custom types, and any validation warnings
- **Validation:** Parses valid exports correctly, rejects invalid
- **Test:** Import parsing tests, validation error tests

#### S8-T07: Implement JSON import flow
- Add Import button to header
- Open file picker for .json files
- Parse with `parseImportedJSON`
- Show preview of what will be imported: zone count, types
- Show any validation warnings
- **Validation:** Can select and preview import
- **Test:** Import preview flow tests

#### S8-T08: Implement import merge/replace options
- Show import options modal after file selected
- Options: "Replace All" or "Merge (keep existing, add new)"
- Merge: skip zones with matching IDs, add new zones
- Replace: clear existing zones and custom types first
- Add imported data to store
- Record as single history entry
- **Validation:** Both merge and replace work correctly
- **Test:** Merge vs replace behavior tests

#### S8-T09: Handle import errors gracefully
- Show validation errors for invalid JSON format
- List specific issues (missing fields, wrong types, invalid colors)
- Option to import valid zones only (skip invalid)
- Show count of skipped zones
- **Validation:** Errors displayed clearly, partial import works
- **Test:** Error handling tests for various invalid inputs

#### S8-T10: Implement annotated image export - canvas rendering
- Create `src/utils/imageExport.ts`
- Use Konva stage `toDataURL` or `toCanvas` to export
- Render floorplan image with zone overlays
- Handle zones rendered with their colors and labels
- **Validation:** Export captures visible zones
- **Test:** Canvas export produces valid image data

#### S8-T11: Add image export options
- Add Image tab to ExportModal
- Scale options: 1x, 2x (default), 4x
- Toggle: Show zone labels (zone names on polygons)
- Toggle: Show legend (zone type → color mapping)
- Background color option (white default)
- **Validation:** Options affect output correctly
- **Test:** Option combination tests

#### S8-T12: Create export legend component
- Create `src/components/export/ExportLegend.tsx`
- List zone types used in export with color swatches
- Position in corner of exported image
- Style for readability (white background, border)
- **Validation:** Legend shows correct types and colors
- **Test:** Legend content tests

#### S8-T13: Implement PNG download
- Generate PNG with selected options
- Trigger browser download
- Default filename: `{projectName}_annotated.png`
- Show progress for large/high-res exports
- **Validation:** PNG downloads with zones visible
- **Test:** PNG export flow tests

#### S8-T14: Implement Ctrl+S save shortcut
- Ctrl+S triggers manual save to localStorage
- Show toast: "Project saved"
- If project has name, use it; otherwise prompt for name
- **Validation:** Ctrl+S saves and shows confirmation
- **Test:** Save shortcut tests

#### S8-T15: Write unit tests for Sprint 8
- Test JSON export format compliance
- Test GeoJSON format and validity
- Test import parsing with various inputs
- Test merge vs replace logic
- Test image export (mock canvas API)
- **Validation:** All tests pass
- **Test:** This IS the testing task

---

## Sprint 9: Polish, Error Handling, Performance & Accessibility

### Goal
Comprehensive error handling, performance optimization for large zone counts, keyboard accessibility, responsive design, documentation, and end-to-end tests.

### Demo
App handles all error scenarios gracefully, performs smoothly with 100+ zones, is fully keyboard navigable, works on tablets, has clear documentation. E2E tests validate all critical flows.

### Tasks

#### S9-T01: Implement global error boundary
- Create `src/components/common/ErrorBoundary.tsx`
- Catch React rendering errors
- Show friendly error message with "Reload" button
- Log error details to console for debugging
- Option to report error (link to GitHub issues)
- **Validation:** App doesn't crash on render errors
- **Test:** Error boundary catches thrown errors

#### S9-T02: Create toast notification system
- Create `src/components/common/Toast.tsx` and `ToastContainer.tsx`
- Create `src/hooks/useToast.ts` hook
- Support types: success (green), error (red), warning (yellow), info (blue)
- Auto-dismiss with configurable duration (default 3s, errors 5s)
- Allow manual dismiss
- Stack multiple toasts
- **Validation:** Toasts appear and dismiss correctly
- **Test:** Toast display and dismiss tests

#### S9-T03: Improve all error messages
- Review all error scenarios and improve messages
- Upload errors: specific messages for wrong type, too large, corrupt
- API errors: specific messages with suggested actions
- Add "Learn more" links where helpful
- **Validation:** All errors have clear, actionable messages
- **Test:** Error message content tests

#### S9-T04: Handle WebGL/Canvas errors
- Detect WebGL support on load
- If WebGL unavailable, show warning about reduced performance
- Implement graceful degradation (2D fallback if needed)
- Catch canvas rendering errors
- **Validation:** App works without WebGL (degraded)
- **Test:** Fallback detection tests

#### S9-T05: Handle localStorage quota errors
- Detect quota exceeded errors on save
- Show modal explaining the issue
- Options: "Export and clear" or "Clear cache only"
- Offer to clear analysis cache first (often largest)
- **Validation:** Clear path forward when storage full
- **Test:** Quota error handling tests

#### S9-T06: Optimize canvas rendering for many zones
- Implement viewport culling: only render zones intersecting visible area
- Use Konva layer caching for static elements (floorplan)
- Batch zone state updates
- Debounce rapid changes (e.g., during drag)
- Profile and target 60fps with 100 zones
- **Validation:** Smooth performance with 100+ zones
- **Test:** Performance benchmark with large zone count

#### S9-T07: Optimize image handling
- Resize very large images client-side for display (max 4096px)
- Keep original for export if needed
- Generate thumbnail for faster initial render
- Lazy load high-res version
- **Validation:** Large images (near 20MB) load without lag
- **Test:** Image processing performance tests

#### S9-T08: Add keyboard navigation for zone panel
- Arrow keys to navigate zone list
- Enter to select focused zone
- Tab through interactive elements
- Focus visible styles (outline on focused items)
- Skip hidden zones in navigation
- **Validation:** Can navigate panel with keyboard only
- **Test:** Keyboard navigation tests

#### S9-T09: Improve screen reader accessibility
- Add `aria-label` to all interactive elements
- Add `aria-live` region for zone count and selection changes
- Describe canvas state with visually hidden text
- Use semantic HTML where possible
- Test with screen reader (or axe-core)
- **Validation:** Screen reader announces key information
- **Test:** Accessibility audit with axe-core

#### S9-T10: Add loading states for all async operations
- Loading skeleton for zone panel while analyzing
- Disabled state for buttons during operations
- Loading indicators for export generation
- Progress bars for long operations
- **Validation:** Clear feedback during all loading states
- **Test:** Loading state rendering tests

#### S9-T11: Implement responsive design adjustments
- Collapse sidebars on viewports <1024px (show as drawers)
- Adjust toolbar layout for touch (larger buttons)
- Hide keyboard shortcut hints on touch devices
- Test at 768px, 1024px, 1280px breakpoints
- **Validation:** Usable on tablet-sized screens
- **Test:** Responsive breakpoint tests

#### S9-T12: Add confirmation dialogs for destructive actions
- Confirm: delete multiple zones (>3), clear all zones, replace on import
- Don't confirm: single zone delete (undoable), undo/redo
- "Don't ask again" checkbox (stored in localStorage)
- Reset in settings
- **Validation:** Destructive actions require confirmation
- **Test:** Confirmation dialog tests

#### S9-T13: Create Settings modal
- Create `src/components/settings/SettingsModal.tsx`
- Sections: General, Canvas, Keyboard Shortcuts
- Settings: grid snap default, default opacity, auto-save interval
- Keyboard shortcut reference (read-only list)
- Clear cache / clear storage options
- Reset all settings option
- **Validation:** Settings accessible and functional
- **Test:** Settings persistence tests

#### S9-T14: Add keyboard shortcut help modal
- Trigger with `?` key
- Display all keyboard shortcuts in organized sections
- Searchable list
- Link to documentation
- **Validation:** Help modal shows all shortcuts
- **Test:** Help modal content tests

#### S9-T15: Write README and setup documentation
- Environment setup instructions (Node version, npm install)
- Environment variables (.env setup, API key)
- Development commands (dev, build, test, lint)
- Architecture overview (folder structure, key concepts)
- Deployment instructions
- **Validation:** New developer can set up project following README
- **Test:** N/A (documentation task)

#### S9-T16: Set up Playwright for E2E testing
- Install Playwright with browsers
- Configure `playwright.config.ts`
- Set up test fixtures and helpers
- Create mock API server for E2E tests
- Add E2E test scripts to `package.json`
- **Validation:** Playwright runs sample test
- **Test:** E2E framework setup verification

#### S9-T17: Write E2E tests for image upload flow
- Test drag-and-drop upload
- Test file picker upload
- Test invalid file rejection
- Test image display and zoom/pan
- **Validation:** Upload E2E tests pass
- **Test:** This IS an E2E test task

#### S9-T18: Write E2E tests for AI analysis flow
- Test analyze button enable/disable states
- Test analysis with mock API
- Test loading state display
- Test zone rendering after analysis
- Test error handling
- **Validation:** Analysis E2E tests pass
- **Test:** This IS an E2E test task

#### S9-T19: Write E2E tests for zone editing
- Test zone selection (single and multi)
- Test vertex editing (move, add, delete)
- Test zone move
- Test undo/redo
- **Validation:** Editing E2E tests pass
- **Test:** This IS an E2E test task

#### S9-T20: Write E2E tests for export/import
- Test JSON export and download
- Test JSON import (file upload)
- Test merge vs replace
- Test PNG export
- **Validation:** Export/import E2E tests pass
- **Test:** This IS an E2E test task

#### S9-T21: Code quality review and refactoring
- Review code for consistency
- Extract common patterns into utilities
- Remove dead code
- Ensure consistent naming conventions
- Document complex logic
- **Validation:** Code review checklist complete
- **Test:** Existing tests still pass

---

## Appendix A: Task Dependencies Graph

```
Sprint 1 (Foundation)
    └── Sprint 2 (AI Integration)
          └── Sprint 3 (Selection & Undo)
                ├── Sprint 4 (Vertex Editing)
                │     └── Sprint 5 (Drawing Tools)
                └── Sprint 6 (Zone Panel)
                      └── Sprint 7 (Custom Types)
                            └── Sprint 8 (Export/Import)
                                  └── Sprint 9 (Polish & E2E)
```

## Appendix B: Keyboard Shortcuts Summary

| Shortcut | Action | Sprint |
|----------|--------|--------|
| `V` | Select mode | 3 |
| `E` | Edit vertices mode | 4 |
| `P` | Draw polygon mode | 5 |
| `R` | Draw rectangle mode | 5 |
| `Delete` / `Backspace` | Delete selected | 4 |
| `Ctrl+Z` | Undo | 3 |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo | 3 |
| `Ctrl+A` | Select all | 3 |
| `Ctrl+D` | Duplicate selected | 4 |
| `Ctrl+S` | Save project | 8 |
| `Ctrl+E` | Export dialog | 8 |
| `Space` (hold) | Pan mode | 1 |
| `+` / `=` | Zoom in | 1 |
| `-` | Zoom out | 1 |
| `0` | Reset zoom | 1 |
| `Escape` | Cancel / Deselect | 3, 5 |
| `?` | Keyboard shortcuts help | 9 |

## Appendix C: Testing Strategy Summary

| Sprint | Unit Tests | Integration Tests | E2E Tests |
|--------|------------|-------------------|-----------|
| 1 | File validation, viewport store | Layout rendering | - |
| 2 | Zone parsing, retry logic, colors | API flow (mocked) | - |
| 3 | History store, selection store | Undo/redo flow | - |
| 4 | Vertex operations, edge detection | Edit flow | - |
| 5 | Drawing state, snap calculations | Create zone flow | - |
| 6 | Grouping, filtering, search | Panel-canvas sync | - |
| 7 | Custom type validation, metadata | Type creation flow | - |
| 8 | Export format, import parsing | Export/import flow | - |
| 9 | Error handling, accessibility | Full flows | All critical paths |

---

**Document Status:** Final
**Last Updated:** January 19, 2026
