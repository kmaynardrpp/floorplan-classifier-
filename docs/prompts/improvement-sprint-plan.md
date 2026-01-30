# Floorplan Zone Detection - Improvement Implementation Sprint Plan

**Version:** 1.1
**Based on:** [improvements.md](./improvements.md)
**Date:** January 27, 2026

---

## Overview

This sprint plan breaks down the 7 improvements (IMP-01 through IMP-07) into 8 sprints with atomic, committable tasks. Each sprint results in demoable, testable software that builds on previous work.

### Environment Setup

**IMPORTANT:** The Python preprocessing backend MUST always be run from a virtual environment.

```bash
# Initial setup (run once)
cd python-preprocessing
python -m venv venv

# Activate venv (REQUIRED before any work)
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run tests (always from venv)
pytest tests/ -v

# Run the preprocessing server (always from venv)
python -m preprocessing.server
```

All commands in this document assume the venv is activated. Tests will fail and dependencies will be missing if run outside the venv.

### Sprint Summary

| Sprint | Focus | Key Deliverable |
|--------|-------|-----------------|
| 1 | Color Boundary Detection Core | Phase 0 color detection with multi-color support |
| 2 | Color Boundary Integration | Fast-track mode and pipeline integration |
| 3 | Tiled Processing Foundation | Image tiling with coordinate transforms |
| 4 | Tiled Processing Integration | Parallel processing and zone merging |
| 5 | Multi-Orientation Support | Per-region orientation detection and aisle rotation |
| 6 | Enhanced Zone Types & Equipment | Extended taxonomy and equipment signatures |
| 7 | Adaptive Hybrid Decision | Smart CV/AI switching with enhanced hints |
| 8 | Performance Optimization | Progressive loading, caching, parallel sub-agents |

---

## Sprint 1: Color Boundary Detection Core (IMP-01 Part 1)

**Goal:** Implement the core Phase 0 color boundary detection system with multi-color support and polygon extraction.

**Demo:** Run CLI command on test image, output detected color boundaries as JSON with polygon coordinates and coverage stats.

### Tasks

#### Task 1.1: Create ColorBoundaryResult Data Structure
**File:** `src/color_boundary/models.py`

**Description:** Define the data structures for color boundary detection results including `ColorBoundaryResult`, `DetectedBoundary`, and serialization methods.

**Implementation:**
- Create `DetectedBoundary` dataclass with: contour, color, area, polygon, confidence
- Create `ColorBoundaryResult` dataclass with: boundaries list, combined_mask, coverage_ratio
- Implement `to_dict()` method for JSON serialization
- Implement `to_hints()` method for AI preprocessing hints format

**Tests:**
- Unit test: Create `DetectedBoundary`, verify all fields serialize correctly
- Unit test: Create `ColorBoundaryResult` with multiple boundaries, verify coverage calculation
- Unit test: `to_hints()` returns correct structure with `detected_colored_boundaries` key

**Validation:** `pytest tests/test_color_boundary_models.py -v` passes

---

#### Task 1.2: Implement HSV Color Range Configuration
**File:** `src/color_boundary/color_config.py`

**Description:** Create configurable color range definitions with preset ranges for orange, yellow, red, and blue boundaries.

**Implementation:**
- Define `ColorRange` dataclass with lower/upper HSV bounds
- Create `DEFAULT_COLOR_RANGES` dict with presets matching spec
- Implement `ColorRangeConfig` class with validation
- Support loading custom color ranges from YAML config

**Tests:**
- Unit test: Default ranges cover expected HSV values
- Unit test: Custom range validation rejects invalid HSV (>180 hue, >255 sat/val)
- Unit test: YAML loading creates valid `ColorRangeConfig`

**Validation:** `pytest tests/test_color_config.py -v` passes

---

#### Task 1.3: Implement Single-Color Mask Detection
**File:** `src/color_boundary/mask_detection.py`

**Description:** Implement the core color masking function that detects pixels within a specified HSV range.

**Implementation:**
- Function `create_color_mask(image, color_range)` -> binary mask
- Handle BGR to HSV conversion
- Apply `cv2.inRange` for mask creation
- Handle red hue wrap-around (0-10 and 170-180)

**Tests:**
- Unit test: Pure orange image (H=15) -> 100% mask
- Unit test: Blue image -> 0% mask for orange range
- Unit test: Red wrap-around detection works (H=5 and H=175 both detected)
- Unit test: Returns correct dtype (uint8) and shape

**Validation:** `pytest tests/test_mask_detection.py -v` passes

---

#### Task 1.4: Implement Morphological Mask Cleaning
**File:** `src/color_boundary/mask_detection.py`

**Description:** Add morphological operations to clean up detected color masks (close gaps, remove noise).

**Implementation:**
- Function `clean_mask(mask, close_iterations, open_iterations, kernel_size)` -> cleaned mask
- Apply MORPH_CLOSE to fill small gaps in boundary lines
- Apply MORPH_OPEN to remove isolated noise pixels
- Configurable kernel size (default 3x3)

**Tests:**
- Unit test: Single-pixel noise removed by open operation
- Unit test: Small gaps in lines closed by close operation
- Unit test: Large solid regions preserved
- Unit test: Empty mask returns empty mask

**Validation:** `pytest tests/test_mask_cleaning.py -v` passes

---

#### Task 1.5: Implement Contour Extraction and Polygon Simplification
**File:** `src/color_boundary/contour_extraction.py`

**Description:** Extract contours from cleaned masks and simplify to polygon vertices.

**Implementation:**
- Function `extract_contours(mask, min_area)` -> list of contours
- Use `cv2.findContours` with `RETR_EXTERNAL`
- Filter by minimum area threshold
- Function `contour_to_polygon(contour, epsilon_factor)` -> list of (x,y) tuples
- Use `cv2.approxPolyDP` for simplification

**Tests:**
- Unit test: Single rectangle mask -> 4-vertex polygon
- Unit test: Complex shape simplified to reasonable vertex count (<20 for simple shapes)
- Unit test: Small contours below `min_area` filtered out
- Unit test: Returns coordinates as Python int tuples (not numpy)

**Validation:** `pytest tests/test_contour_extraction.py -v` passes

---

#### Task 1.6: Implement Coverage Ratio Calculation
**File:** `src/color_boundary/metrics.py`

**Description:** Calculate what percentage of the image is covered by detected boundaries.

**Implementation:**
- Function `calculate_coverage(boundaries, image_shape)` -> float (0-1)
- Sum areas of all detected boundary polygons
- Divide by total image area
- Handle edge cases (empty boundaries -> 0.0, overlapping boundaries)

**Tests:**
- Unit test: Single boundary covering 50% of image -> 0.5
- Unit test: Empty boundaries -> 0.0
- Unit test: Boundaries exceeding image area -> capped at 1.0 (or handle overlap)

**Validation:** `pytest tests/test_metrics.py -v` passes

---

#### Task 1.7: Implement ColorBoundaryDetector Class
**File:** `src/color_boundary/detector.py`

**Description:** Create the main detector class that orchestrates the full detection pipeline.

**Implementation:**
- Class `ColorBoundaryDetector(color_ranges, min_contour_area)`
- Method `detect(image)` -> `ColorBoundaryResult`
- Iterate through configured color ranges
- Apply mask detection, cleaning, contour extraction for each color
- Combine results and calculate coverage

**Tests:**
- Unit test: Detect orange boundaries on test image with known orange regions
- Unit test: Detect multiple colors (orange + blue) returns both
- Unit test: Image with no colored boundaries returns empty result with coverage=0
- Integration test: Full detection on sample floorplan image

**Validation:** `pytest tests/test_color_boundary_detector.py -v` passes

---

#### Task 1.8: Create Sample Test Images
**File:** `tests/fixtures/color_boundary/`

**Description:** Create synthetic test images with known colored boundaries for reliable unit testing.

**Implementation:**
- `orange_square.png` - White background with orange square (known area)
- `multi_color.png` - Orange, yellow, and blue shapes
- `no_boundaries.png` - Grayscale image with no colored boundaries
- `complex_boundaries.png` - Overlapping/adjacent colored regions
- Generate programmatically in fixture setup (not checked into repo as binaries)

**Tests:**
- Fixture generation test: All images generated with expected dimensions
- Pixel verification: Known color values at expected locations

**Validation:** `pytest tests/fixtures/test_fixture_generation.py -v` passes

---

#### Task 1.9: Create Basic CLI Entry Point
**File:** `src/cli.py`, `src/__main__.py`

**Description:** Create minimal CLI entry point so Sprint 1 demo can run independently.

**Implementation:**
- Create `__main__.py` for `python -m preprocessing` invocation
- Add `color_boundary` subcommand with `detect` action
- Accept image path, output format (json/visual)
- Return JSON with boundaries, coverage, and stats
- **IMPORTANT:** All CLI commands must be run from activated venv

**Tests:**
- CLI test: `python -m preprocessing color_boundary detect test.jpg` produces output
- CLI test: Help flag shows usage information
- CLI test: Invalid path returns non-zero exit code

**Validation:** Manual CLI test from venv + `pytest tests/test_cli_basic.py -v`

---

### Sprint 1 Demo Checklist
- [ ] Venv activated: `source venv/bin/activate` (or Windows equivalent)
- [ ] CLI command: `python -m preprocessing color_boundary detect image.jpg` outputs JSON
- [ ] JSON output includes: boundaries array with polygons, coverage_ratio, color labels
- [ ] Processing completes in <2s for 3000x2000px image
- [ ] All unit tests pass: `pytest tests/test_color_boundary*.py -v`

---

## Sprint 2: Color Boundary Integration (IMP-01 Part 2)

**Goal:** Integrate Phase 0 into the main pipeline with fast-track mode for high-coverage images.

**Demo:** Upload floorplan with pre-drawn orange boundaries, see fast-track mode activate and zones classified without full edge detection.

### Tasks

#### Task 2.1: Define Fast-Track Threshold Configuration
**File:** `src/config/phase0_config.py`

**Description:** Create configuration class for Phase 0 behavior including fast-track threshold.

**Implementation:**
- Dataclass `Phase0Config` with:
  - `enabled: bool = True`
  - `fast_track_threshold: float = 0.8` (coverage ratio to skip Phase 1)
  - `min_boundaries_for_fast_track: int = 3`
  - `color_ranges: dict` (override defaults)
  - `morphology_settings: dict`
- Load from YAML configuration file
- Validate threshold ranges (0.0-1.0)

**Tests:**
- Unit test: Default config has expected values
- Unit test: Invalid threshold (>1.0) raises validation error
- Unit test: YAML loading overrides defaults correctly

**Validation:** `pytest tests/test_phase0_config.py -v` passes

---

#### Task 2.2: Implement Fast-Track Decision Logic
**File:** `src/color_boundary/fast_track.py`

**Description:** Implement logic to determine if fast-track mode should be activated.

**Implementation:**
- Function `should_fast_track(color_result, config)` -> bool
- Check coverage_ratio > threshold
- Check boundary count >= minimum
- **REQUIRED:** Check boundaries form closed regions (use `cv2.isContourConvex` or area validation)
- Images with high coverage but non-closed boundaries should NOT fast-track

**Tests:**
- Unit test: Coverage 0.85, 5 closed boundaries -> True (fast-track)
- Unit test: Coverage 0.85, 2 boundaries -> False (not enough boundaries)
- Unit test: Coverage 0.5, 10 boundaries -> False (coverage too low)
- Unit test: Coverage 0.85, 5 non-closed boundaries -> False (boundaries not closed)
- Unit test: Disabled Phase 0 -> always False

**Validation:** `pytest tests/test_fast_track.py -v` passes

---

#### Task 2.3: Implement Fast-Track Hint Generation
**File:** `src/color_boundary/fast_track.py`

**Description:** Generate minimal preprocessing hints when fast-track mode is active.

**Implementation:**
- Function `create_fast_track_hints(color_result)` -> dict
- Include detected boundaries with high confidence (0.95)
- Include coverage ratio
- Add flag `fast_track: true` and reason
- Skip edge detection hints (not computed)

**Tests:**
- Unit test: Generated hints have `fast_track: true`
- Unit test: Boundary confidence set to 0.95
- Unit test: Hints serializable to JSON

**Validation:** `pytest tests/test_fast_track_hints.py -v` passes

---

#### Task 2.4: Integrate Phase 0 into PreprocessingConfig
**File:** `src/pipeline.py`

**Description:** Add Phase 0 configuration to the main preprocessing config.

**Implementation:**
- Add `phase0_config: Phase0Config` field to `PreprocessingConfig`
- Default to enabled with standard thresholds
- Update config validation

**Tests:**
- Unit test: Default PreprocessingConfig includes Phase0Config
- Unit test: Config serialization includes phase0 settings

**Validation:** `pytest tests/test_preprocessing_config.py -v` passes

---

#### Task 2.5: Integrate Phase 0 into Pipeline Start
**File:** `src/pipeline.py`

**Description:** Add Phase 0 as the first step in `preprocess_floorplan()`.

**Implementation:**
- Run ColorBoundaryDetector before existing Stage 0 (content boundary)
- Store color_result in PreprocessingResult
- Pass color hints to subsequent stages
- Add timing metrics for Phase 0

**Tests:**
- Integration test: Pipeline with Phase 0 enabled detects orange boundaries
- Integration test: Pipeline with Phase 0 disabled skips color detection
- Performance test: Phase 0 adds <2s to total processing time

**Validation:** `pytest tests/test_pipeline_phase0.py -v` passes

---

#### Task 2.6: Implement Fast-Track Pipeline Branch
**File:** `src/pipeline.py`

**Description:** When fast-track triggers, skip Phase 1 edge detection and go directly to classification hints.

**Implementation:**
- After Phase 0, check `should_fast_track()`
- If True: generate fast-track hints, skip Stages 1-3
- If False: continue with full pipeline, merge color boundaries into hints
- Return early with partial PreprocessingResult for fast-track

**Tests:**
- Integration test: High-coverage image triggers fast-track, skips edge detection
- Integration test: Low-coverage image runs full pipeline
- Integration test: Fast-track result has correct structure (missing some stages)

**Validation:** `pytest tests/test_pipeline_fast_track.py -v` passes

---

#### Task 2.7: Update Gemini Hints with Color Boundaries
**File:** `src/pipeline.py`

**Description:** Merge Phase 0 color boundaries into the AI hints when not fast-tracking.

**Implementation:**
- Add `detected_colored_boundaries` section to gemini_hints
- Include polygon, color, area, confidence for each boundary
- Add `boundary_coverage_ratio` field
- Add `has_predefined_zones: bool` field

**Tests:**
- Unit test: Hints include color boundaries when present
- Unit test: Hints structure matches spec schema
- Unit test: Empty color result produces empty boundaries section

**Validation:** `pytest tests/test_gemini_hints_color.py -v` passes

---

#### Task 2.8: Add CLI Command for Phase 0
**File:** `src/cli.py`

**Description:** Add CLI command to run Phase 0 independently for debugging/testing.

**Implementation:**
- Command: `python -m preprocessing phase0 <image_path> [--output json|visual]`
- Options: `--fast-track-threshold`, `--colors orange,yellow,red`
- Output: JSON results or visualization image with boundaries drawn

**Tests:**
- CLI test: Valid image path produces JSON output
- CLI test: Invalid path returns error code
- CLI test: `--output visual` creates PNG file

**Validation:** Manual CLI testing + `pytest tests/test_cli_phase0.py -v`

---

### Sprint 2 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] Test image with orange boundaries: fast-track activates (logged)
- [ ] Test image without boundaries: full pipeline runs
- [ ] Fast-track mode skips expensive edge detection (verify via timing)
- [ ] AI hints include `detected_colored_boundaries` section
- [ ] CLI command works: `python -m preprocessing phase0 test.jpg`

---

## Sprint 3: Tiled Processing Foundation (IMP-02 Part 1)

**Goal:** Implement image tiling system with coordinate transformation, preparing for parallel processing.

**Demo:** Large image (5000x4000px) split into overlapping tiles, visualize tile boundaries, demonstrate coordinate transform from tile to original space.

### Tasks

#### Task 3.1: Create ImageTile Data Structure
**File:** `src/tiling/models.py`

**Description:** Define data structures for image tiles and tile results.

**Implementation:**
- Dataclass `ImageTile`:
  - `id: str` - unique tile identifier
  - `image: np.ndarray` - tile pixel data
  - `bounds: Tuple[int, int, int, int]` - (x1, y1, x2, y2) in original image
  - `overlap_regions: List[OverlapRegion]` - adjacent tile overlaps
- Dataclass `OverlapRegion`:
  - `adjacent_tile_id: str`
  - `region: Tuple[int, int, int, int]`
- Dataclass `TileZoneResult`:
  - `tile_id: str`
  - `zones: List[Zone]`
  - `bounds: Tuple[int, int, int, int]`

**Tests:**
- Unit test: ImageTile created with valid bounds
- Unit test: Bounds correctly define tile region

**Validation:** `pytest tests/test_tile_models.py -v` passes

---

#### Task 3.2: Implement Tiling Decision Logic
**File:** `src/tiling/tiler.py`

**Description:** Determine whether an image requires tiling based on dimension thresholds.

**Implementation:**
- Class `ImageTiler` with configurable thresholds:
  - `tile_size: int = 2048`
  - `overlap: int = 256`
  - `max_dimension: int = 4000`
- Method `should_tile(image)` -> bool
- Check if width OR height exceeds max_dimension

**Tests:**
- Unit test: 3000x2000 image -> False (below threshold)
- Unit test: 5000x3000 image -> True (width exceeds)
- Unit test: 3000x5000 image -> True (height exceeds)
- Unit test: Custom threshold respected

**Validation:** `pytest tests/test_tiling_decision.py -v` passes

---

#### Task 3.3: Implement Grid-Based Tile Boundary Calculation
**File:** `src/tiling/tiler.py`

**Description:** Calculate regular grid tile boundaries with configurable overlap.

**Implementation:**
- Method `_calculate_grid_boundaries(width, height)` -> List[Tuple]
- Calculate effective step size: `tile_size - overlap`
- Generate grid of overlapping tiles covering entire image
- Handle edge tiles (may be smaller than tile_size)

**Tests:**
- Unit test: 4096x4096 with 2048 tiles, 256 overlap -> 4 tiles
- Unit test: 5000x3000 -> tiles cover full image
- Unit test: Adjacent tiles overlap by exactly `overlap` pixels
- Unit test: No gaps between tiles

**Validation:** `pytest tests/test_grid_boundaries.py -v` passes

---

#### Task 3.4: Implement Tile Creation from Image
**File:** `src/tiling/tiler.py`

**Description:** Create tile objects from an image given calculated boundaries.

**Implementation:**
- Method `create_tiles(image, phase0_boundaries=None)` -> List[ImageTile]
- Extract tile pixels using numpy slicing
- Calculate overlap regions with adjacent tiles
- Return list of ImageTile objects

**Tests:**
- Unit test: Tile pixel data matches source region
- Unit test: Tile bounds correctly stored
- Unit test: Overlap regions correctly identify adjacent tiles

**Validation:** `pytest tests/test_tile_creation.py -v` passes

---

#### Task 3.5: Implement Coordinate Transformation (Tile to Original)
**File:** `src/tiling/transforms.py`

**Description:** Transform coordinates from tile space to original image space.

**Implementation:**
- Function `tile_to_original(point, tile_bounds)` -> Tuple[int, int]
- Add tile offset (x1, y1) to point coordinates
- Function `transform_polygon(polygon, tile_bounds)` -> List[Tuple]
- Transform all vertices of a polygon

**Tests:**
- Unit test: Point (10, 20) in tile at (100, 200) -> (110, 220)
- Unit test: Polygon vertices all transformed correctly
- Unit test: Zero offset tile returns unchanged coordinates

**Validation:** `pytest tests/test_coordinate_transform.py -v` passes

---

#### Task 3.6: Implement Smart Boundary Alignment (using Phase 0)
**File:** `src/tiling/smart_boundaries.py`

**Description:** Calculate tile boundaries that align with detected zone boundaries to minimize zones split across tiles.

**Implementation:**
- Function `find_boundary_aligned_splits(phase0_boundaries, orientation, dimension)` -> List[int]
- Analyze Phase 0 boundaries for natural split lines
- Find vertical/horizontal edges that span significant height/width
- Fallback to grid boundaries if insufficient natural splits

**Tests:**
- Unit test: Clear vertical boundary at x=1000 -> split at x=1000
- Unit test: No clear boundaries -> falls back to grid
- Unit test: Splits respect minimum tile size

**Validation:** `pytest tests/test_smart_boundaries.py -v` passes

---

#### Task 3.7: Implement Tile Visualization
**File:** `src/tiling/visualization.py`

**Description:** Generate debug visualization showing tile boundaries on original image.

**Implementation:**
- Function `visualize_tiles(image, tiles, output_path)` -> str
- Draw tile boundaries with different colors
- Label each tile with ID and dimensions
- Highlight overlap regions

**Tests:**
- Unit test: Visualization created for valid tiles
- Unit test: All tile boundaries visible in output
- Visual verification: Overlaps shown correctly

**Validation:** `pytest tests/test_tile_visualization.py -v` + manual visual check

---

#### Task 3.8: Create Large Test Images for Tiling
**File:** `tests/fixtures/tiling/`

**Description:** Generate or provide large test images for tiling tests.

**Implementation:**
- Programmatically generate 5000x4000 test image with grid pattern
- Include colored boundaries at known positions
- Create fixture function that generates on demand (not stored)

**Tests:**
- Fixture test: Large image generated with correct dimensions
- Fixture test: Known features at expected locations

**Validation:** `pytest tests/fixtures/test_large_fixtures.py -v` passes

---

### Sprint 3 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] 5000x4000 image correctly triggers tiling
- [ ] Tiles created with correct overlap
- [ ] Coordinate transform works: tile (100,100) -> original (100+offset, 100+offset)
- [ ] Smart boundaries align with Phase 0 detected edges (or grid fallback with mocked Phase 0)
- [ ] Visualization shows tile grid clearly
- [ ] All tests pass: `pytest tests/test_tiling*.py -v`

---

## Sprint 4: Tiled Processing Integration (IMP-02 Part 2)

**Goal:** Implement parallel tile processing and intelligent zone merging to handle large images end-to-end.

**Demo:** Process 6000x5000px floorplan, see tiles processed in parallel, zones merged seamlessly at boundaries.

### Tasks

#### Task 4.1: Implement IoU (Intersection over Union) Calculation
**File:** `src/tiling/merging.py`

**Description:** Calculate IoU between two polygons for determining merge candidates.

**Implementation:**
- Function `calculate_iou(poly_a, poly_b)` -> float
- Use Shapely library for polygon operations
- Handle invalid polygons gracefully (return 0.0)
- Handle self-intersecting polygons (buffer(0) fix)
- Optimize for common case (non-overlapping)

**Tests:**
- Unit test: Identical polygons -> IoU = 1.0
- Unit test: Non-overlapping polygons -> IoU = 0.0
- Unit test: 50% overlap -> IoU ≈ 0.33 (verify calculation)
- Unit test: Invalid polygon -> 0.0 (no crash)
- Unit test: Self-intersecting polygon -> handled gracefully

**Validation:** `pytest tests/test_iou.py -v` passes

---

#### Task 4.2: Implement Zone Polygon Union
**File:** `src/tiling/merging.py`

**Description:** Merge multiple overlapping zone polygons into a single polygon.

**Implementation:**
- Function `union_zones(zones)` -> Zone
- Use Shapely `unary_union` for polygon union
- Extract exterior coordinates from result
- Preserve metadata from largest contributing zone
- Handle MultiPolygon results (take largest)

**Tests:**
- Unit test: Two overlapping rectangles -> single merged polygon
- Unit test: Properties from largest zone preserved
- Unit test: Confidence = max of input confidences

**Validation:** `pytest tests/test_zone_union.py -v` passes

---

#### Task 4.3: Implement Overlapping Zone Merger
**File:** `src/tiling/merging.py`

**Description:** Find and merge zones that overlap significantly based on IoU threshold.

**Implementation:**
- Function `merge_overlapping_zones(zones, iou_threshold)` -> List[Zone]
- Group zones by type first
- Build overlap graph within each type
- Merge connected components with IoU > threshold
- Return deduplicated zone list

**Tests:**
- Unit test: Two zones with IoU=0.5, threshold=0.3 -> merged
- Unit test: Two zones with IoU=0.2, threshold=0.3 -> not merged
- Unit test: Chain of overlapping zones all merged correctly (A-B, B-C -> ABC)
- Unit test: Different zone types never merged
- Unit test: Self-intersecting polygon handled gracefully (no crash)
- Unit test: Zones overlapping only at corners handled correctly

**Validation:** `pytest tests/test_zone_merging.py -v` passes

---

#### Task 4.4: Implement TileResultMerger Class
**File:** `src/tiling/merger.py`

**Description:** Orchestrate merging of zone results from multiple tiles.

**Implementation:**
- Class `TileResultMerger(iou_threshold)`
- Method `merge(tile_results, image_shape)` -> ZoneResult
- Transform all zones to original coordinates
- Group by zone type
- Apply overlap merging
- Deduplicate edge zones

**Tests:**
- Unit test: Single tile result -> unchanged zones (in original coords)
- Unit test: Two tiles with overlapping zone -> single merged zone
- Integration test: 4-tile grid merges correctly

**Validation:** `pytest tests/test_tile_result_merger.py -v` passes

---

#### Task 4.5: Implement Async Tile Processor
**File:** `src/tiling/processor.py`

**Description:** Process multiple tiles in parallel using asyncio.

**Implementation:**
- Class `TiledZoneDetector(tiler, zone_detector, max_workers)`
- Method `async process(image, phase0_result)` -> ZoneResult
- If `should_tile()` False: process directly
- If True: create tiles, process in parallel with `asyncio.gather`
- Merge results with TileResultMerger

**Tests:**
- Unit test: Small image processed directly (no tiling)
- Unit test: Large image creates multiple parallel tasks
- Integration test: Parallel processing produces same results as sequential
- Performance test: Parallel faster than sequential for 4+ tiles

**Validation:** `pytest tests/test_tiled_processor.py -v` passes

---

#### Task 4.6: Implement Phase 0 Cropping for Tiles
**File:** `src/tiling/processor.py`

**Description:** Crop Phase 0 boundaries to tile region for per-tile processing.

**Implementation:**
- Method `_crop_phase0_to_tile(phase0_result, tile_bounds)` -> ColorBoundaryResult
- Clip boundary polygons to tile bounds
- Recalculate coverage ratio for tile
- Handle boundaries that span multiple tiles

**Tests:**
- Unit test: Boundary fully inside tile -> unchanged
- Unit test: Boundary spanning tile edge -> clipped
- Unit test: Boundary fully outside tile -> excluded
- Unit test: Coverage ratio recalculated for tile area

**Validation:** `pytest tests/test_phase0_cropping.py -v` passes

---

#### Task 4.7: Integrate Tiled Processing into Main Pipeline
**File:** `src/pipeline.py`

**Description:** Add tiled processing as automatic behavior for large images.

**Implementation:**
- Add `TilingConfig` to `PreprocessingConfig`
- In `preprocess_floorplan()`: check `should_tile()` after image load
- If tiling needed: use `TiledZoneDetector` instead of direct processing
- Merge tiled results before generating hints

**Tests:**
- Integration test: Small image uses non-tiled pipeline
- Integration test: Large image automatically tiles
- Integration test: Tiled output matches expected zone structure

**Validation:** `pytest tests/test_pipeline_tiling.py -v` passes

---

#### Task 4.8: Add Tiling Configuration Options
**File:** `src/config/tiling_config.py`

**Description:** Create configurable options for tiled processing behavior.

**Implementation:**
- Dataclass `TilingConfig`:
  - `enabled: bool = True`
  - `dimension_threshold: int = 4000`
  - `tile_size: int = 2048`
  - `overlap: int = 256`
  - `smart_boundaries: bool = True`
  - `merge_iou_threshold: float = 0.3`
  - `max_parallel_tiles: int = 4`
- Load from YAML, validate ranges

**Tests:**
- Unit test: Default values match spec
- Unit test: Invalid overlap > tile_size raises error
- Unit test: YAML loading works

**Validation:** `pytest tests/test_tiling_config.py -v` passes

---

### Sprint 4 Demo Checklist
- [ ] 6000x5000 image processed successfully with tiling
- [ ] Tiles processed in parallel (verify with timing/logs)
- [ ] Zones at tile boundaries merged seamlessly
- [ ] No visible seams in output zone boundaries (visual verification with debug overlay)
- [ ] Seam detection test: Zone at tile boundary has continuous edges (no gaps/steps)
- [ ] Processing time <40s for large image (vs >60s without optimization)
- [ ] All tests pass: `pytest tests/test_tiling*.py tests/test_pipeline_tiling.py -v`
- [ ] All commands run from activated venv

---

## Sprint 5: Multi-Orientation Racking Support (IMP-03)

**Goal:** Implement per-region orientation detection to handle warehouses with mixed horizontal/vertical racking sections.

**Demo:** Process floorplan with both horizontal and vertical racking areas, see correct aisle directions detected for each region.

### Tasks

#### Task 5.1: Create OrientationResult Data Structure
**File:** `src/orientation/models.py`

**Description:** Define data structures for orientation detection results.

**Implementation:**
- Dataclass `OrientationResult`:
  - `angle: float` (0-180 degrees)
  - `confidence: float` (0-1)
  - `classification: str` ('horizontal', 'vertical', 'diagonal', 'unknown')
  - `angle_distribution: Optional[List[Tuple[float, float]]]`
- Method `to_dict()` for serialization

**Tests:**
- Unit test: Angle 0 classifies as horizontal
- Unit test: Angle 90 classifies as vertical
- Unit test: Angle 45 classifies as diagonal
- Unit test: Serialization includes all fields

**Validation:** `pytest tests/test_orientation_models.py -v` passes

---

#### Task 5.2: Implement Hough Line Detection for Orientation
**File:** `src/orientation/detector.py`

**Description:** Detect lines in image region using Hough transform for orientation analysis.

**Implementation:**
- Function `detect_lines_in_region(image, region_mask)` -> List[LineSegment]
- Apply mask to isolate region
- Edge detection with Canny
- Hough line detection with configurable parameters
- Return line segments with angles

**Tests:**
- Unit test: Horizontal lines detected at ~0 degrees
- Unit test: Vertical lines detected at ~90 degrees
- Unit test: Empty region returns empty list

**Validation:** `pytest tests/test_hough_detection.py -v` passes

---

#### Task 5.3: Implement Angle Histogram and Smoothing
**File:** `src/orientation/detector.py`

**Description:** Build weighted histogram of line angles and find dominant orientation.

**Implementation:**
- Function `compute_angle_histogram(lines, weights)` -> Tuple[histogram, bins]
- Weight by line length
- Apply Gaussian smoothing to find peaks
- Return smoothed histogram and bin edges

**Tests:**
- Unit test: All horizontal lines -> peak at 0/180
- Unit test: Mixed orientations -> multiple peaks
- Unit test: Longer lines contribute more to peak

**Validation:** `pytest tests/test_angle_histogram.py -v` passes

---

#### Task 5.4: Implement OrientationDetector Class
**File:** `src/orientation/detector.py`

**Description:** Main class for detecting dominant orientation in image regions.

**Implementation:**
- Class `OrientationDetector`
- Method `detect_orientation(image, region_mask=None)` -> OrientationResult
- Detect lines, compute histogram, find dominant angle
- Classify into horizontal/vertical/diagonal
- Calculate confidence from peak prominence

**Tests:**
- Unit test: Image with horizontal racking -> 'horizontal' classification
- Unit test: Image with vertical racking -> 'vertical' classification
- Unit test: Confidence high for clear orientation, low for mixed

**Validation:** `pytest tests/test_orientation_detector.py -v` passes

---

#### Task 5.5: Implement Per-Region Orientation Analysis
**File:** `src/orientation/region_analyzer.py`

**Description:** Analyze orientation for each detected region independently.

**Implementation:**
- Class `RegionOrientationAnalyzer`
- Method `analyze_regions(image, regions)` -> Dict[str, OrientationResult]
- Create mask for each region
- Run orientation detection on each
- Return mapping of region_id to orientation

**Tests:**
- Unit test: Multiple regions analyzed independently
- Unit test: Each region gets its own orientation result
- Integration test: Mixed-orientation floorplan correctly analyzed

**Validation:** `pytest tests/test_region_orientation.py -v` passes

---

#### Task 5.6: Implement Region Grouping by Orientation
**File:** `src/orientation/region_analyzer.py`

**Description:** Group regions with similar orientations for batch processing.

**Implementation:**
- Method `group_by_orientation(regions, orientations, angle_tolerance)` -> Dict[str, List[Region]]
- Group regions within angle_tolerance of each other
- Return dict with angle keys and region lists
- Identify 'horizontal_regions', 'vertical_regions' groups

**Tests:**
- Unit test: Two regions at 5° and 8° grouped (tolerance 15°)
- Unit test: Regions at 0° and 90° in separate groups
- Unit test: Unknown orientations in 'unknown' group

**Validation:** `pytest tests/test_region_grouping.py -v` passes

---

#### Task 5.7: Implement Image Rotation for Aisle Detection
**File:** `src/orientation/rotation.py`

**Description:** Rotate image regions to align with horizontal for consistent aisle detection.

**Implementation:**
- Function `rotate_to_horizontal(image, region, angle)` -> Tuple[image, transform_fn]
- Calculate rotation needed to make dominant lines horizontal
- Apply cv2.warpAffine with center at region centroid
- Return rotated image and inverse transform function

**Tests:**
- Unit test: 90° rotation converts vertical to horizontal lines
- Unit test: Inverse transform recovers original coordinates
- Unit test: Region stays centered after rotation

**Validation:** `pytest tests/test_rotation.py -v` passes

---

#### Task 5.8: Implement Orientation-Aware Aisle Detector
**File:** `src/orientation/aisle_detector.py`

**Description:** Wrapper around base aisle detector that handles per-region orientation.

**Implementation:**
- Class `OrientationAwareAisleDetector`
- Method `detect_aisles(image, region, orientation)` -> List[DetectedAisle]
- Rotate to horizontal if vertical orientation
- Run base aisle detection
- Transform results back to original coordinates
- Add orientation metadata to aisle results

**Tests:**
- Unit test: Horizontal region processed without rotation
- Unit test: Vertical region rotated, aisles detected, coords transformed back
- Unit test: Aisle metadata includes detected_orientation

**Validation:** `pytest tests/test_orientation_aisle.py -v` passes

---

#### Task 5.9: Update Preprocessing Hints with Orientation Data
**File:** `src/pipeline.py`

**Description:** Add per-region orientation to the AI hints.

**Implementation:**
- Add `region_orientations` section to gemini_hints
- Add `orientation_groups` with horizontal/vertical region lists
- Add `has_mixed_orientations: bool` flag

**Tests:**
- Unit test: Hints include orientation for each region
- Unit test: Mixed orientation flag set correctly
- Integration test: Full pipeline includes orientation in output

**Validation:** `pytest tests/test_hints_orientation.py -v` passes

---

### Sprint 5 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] Floorplan with horizontal racking -> 'horizontal' detected
- [ ] Floorplan with vertical racking -> 'vertical' detected
- [ ] Mixed floorplan -> different orientations per region
- [ ] Aisles correctly detected in both orientations
- [ ] AI hints include `region_orientations` section
- [ ] Processing time increase <20% vs single-orientation

---

## Sprint 6: Enhanced Zone Types & Equipment Detection (IMP-04)

**Goal:** Extend zone taxonomy with new types and implement equipment signature detection for specialized zones.

**Demo:** Process floorplan with turntables, see circular patterns detected and classified as `turntable_area`, staging areas identified near docks.

### Tasks

#### Task 6.1: Extend ZoneType Enum
**File:** `src/types/zone_types.py`

**Description:** Add new zone types to the taxonomy.

**Implementation:**
- Add to ZoneType enum:
  - `TURNTABLE_AREA = "turntable_area"`
  - `STAGING_AREA = "staging_area"`
  - `CROSS_DOCK_LANE = "cross_dock_lane"`
  - `MEZZANINE = "mezzanine"`
  - `CHARGING_STATION = "charging_station"`
  - `MAINTENANCE_AREA = "maintenance_area"`
  - `QUALITY_CONTROL = "quality_control"`
  - `COLD_STORAGE = "cold_storage"`
  - `HAZMAT_AREA = "hazmat_area"`

**Tests:**
- Unit test: All new types accessible via enum
- Unit test: Enum values are lowercase strings
- Unit test: No duplicates in enum

**Validation:** `pytest tests/test_zone_types.py -v` passes

---

#### Task 6.2: Create Zone Type Metadata Registry
**File:** `src/types/zone_metadata.py`

**Description:** Define metadata for each zone type (travelability, speed, detection hints).

**Implementation:**
- Dict `ZONE_TYPE_METADATA` mapping ZoneType to:
  - `travelable: bool`
  - `speed_default: Optional[str]`
  - `description: str`
  - `detection_hints: List[str]`
- Helper function `get_zone_metadata(zone_type)` -> dict
- Helper function `is_travelable(zone_type)` -> bool

**Tests:**
- Unit test: All zone types have metadata entry
- Unit test: `travel_lane` is travelable
- Unit test: `racking` is not travelable
- Unit test: New types have correct travelability

**Validation:** `pytest tests/test_zone_metadata.py -v` passes

---

#### Task 6.3: Implement Circular Pattern Detection (Turntables)
**File:** `src/equipment/turntable_detector.py`

**Description:** Detect circular turntable patterns using Hough circle detection.

**Implementation:**
- Function `detect_turntables(image)` -> List[DetectedEquipment]
- Convert to grayscale, apply blur
- Use cv2.HoughCircles with tuned parameters
- Filter by radius range (30-200 pixels default)
- Return list of DetectedEquipment with center and radius

**Tests:**
- Unit test: Circle image detected as turntable
- Unit test: Rectangle not detected as turntable
- Unit test: Multiple circles detected independently
- Unit test: Noise doesn't produce false positives

**Validation:** `pytest tests/test_turntable_detection.py -v` passes

---

#### Task 6.4: Implement Dock Door Detection
**File:** `src/equipment/dock_detector.py`

**Description:** Detect dock door patterns along building edges.

**Implementation:**
- Function `detect_dock_doors(image)` -> List[DetectedEquipment]
- Look for regular rectangular patterns along image edges
- Detect consistent spacing between doors
- Return equipment with bounds and confidence

**Tests:**
- Unit test: Regular rectangles at edge detected
- Unit test: Interior rectangles not classified as docks
- Unit test: Consistent spacing increases confidence

**Validation:** `pytest tests/test_dock_detection.py -v` passes

---

#### Task 6.5: Implement Conveyor Line Detection
**File:** `src/equipment/conveyor_detector.py`

**Description:** Detect linear conveyor patterns distinct from racking.

**Implementation:**
- Function `detect_conveyor_lines(image)` -> List[DetectedEquipment]
- Detect parallel lines with consistent spacing
- Distinguish from racking by: spacing ratio, line thickness, length
- Connected components form conveyor segments

**Tests:**
- Unit test: Parallel thin lines detected as conveyor
- Unit test: Racking pattern not detected as conveyor
- Unit test: Conveyor bounds calculated correctly

**Validation:** `pytest tests/test_conveyor_detection.py -v` passes

---

#### Task 6.6: Implement Staging Area Detection (Proximity-Based)
**File:** `src/equipment/staging_detector.py`

**Description:** Detect staging areas based on proximity to dock doors and open floor characteristics.

**Implementation:**
- Function `detect_staging_areas(image, dock_doors)` -> List[DetectedEquipment]
- Find open floor regions near detected dock doors
- Check for rectangular shapes with minimal internal features
- Calculate proximity score to nearest dock
- Filter by minimum area and aspect ratio constraints

**Tests:**
- Unit test: Open area adjacent to dock -> staging area detected
- Unit test: Open area far from docks -> not classified as staging
- Unit test: Area with dense features near dock -> not staging
- Unit test: Multiple staging areas detected independently

**Validation:** `pytest tests/test_staging_detection.py -v` passes

---

#### Task 6.7: Create EquipmentSignatureDetector Class
**File:** `src/equipment/detector.py`

**Description:** Orchestrate all equipment detection into single interface.

**Implementation:**
- Class `EquipmentSignatureDetector`
- Method `detect_all(image)` -> List[DetectedEquipment]
- Run turntable, dock, conveyor, **and staging area** detection
- Deduplicate overlapping detections
- Return combined equipment list

**Tests:**
- Unit test: All equipment types detected in single call (including staging)
- Unit test: No duplicates in output
- Integration test: Real floorplan equipment detected

**Validation:** `pytest tests/test_equipment_detector.py -v` passes

---

#### Task 6.8: Update AI Classification Prompt
**File:** `src/prompts/zone_classification.py`

**Description:** Add new zone type descriptions to the Claude prompt.

**Implementation:**
- Add descriptions for all new zone types
- Include visual characteristics and locations
- Add guidance for using equipment signatures
- Update JSON schema example with new types

**Tests:**
- Unit test: Prompt includes all new zone types
- Unit test: Prompt validates against length limits
- Manual test: Claude understands new types in responses

**Validation:** `pytest tests/test_prompts.py -v` + manual Claude testing

---

#### Task 6.9: Integrate Equipment Detection into Pipeline
**File:** `src/pipeline.py`

**Description:** Add equipment detection results to preprocessing hints.

**Implementation:**
- Run EquipmentSignatureDetector after Phase 0
- Add `equipment_signatures` section to gemini_hints
- Include type, location, bounds, confidence for each
- Link equipment to suggested zone types

**Tests:**
- Integration test: Equipment signatures appear in hints
- Integration test: Turntable suggests turntable_area zone
- Integration test: Dock door suggests docking_area zone

**Validation:** `pytest tests/test_pipeline_equipment.py -v` passes

---

### Sprint 6 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] New zone types recognized in system
- [ ] Turntables (circles) detected and classified correctly
- [ ] Dock doors detected along edges
- [ ] Staging areas detected near docks (proximity-based)
- [ ] Equipment signatures appear in AI hints
- [ ] Claude responses include new zone types
- [ ] All tests pass: `pytest tests/test_equipment*.py tests/test_zone*.py -v`

---

## Sprint 7: Adaptive Hybrid Decision & Enhanced Hints (IMP-05, IMP-06)

**Goal:** Implement intelligent CV/AI switching based on region/image characteristics, and enhance the preprocessing hints schema.

**Demo:** Show different CV/AI decisions for different regions, explain decision reasoning in logs, demonstrate enhanced hint structure.

### Tasks

#### Task 7.1: Create HybridDecision Data Structure
**File:** `src/hybrid/models.py`

**Description:** Define data structure for hybrid CV/AI decision results.

**Implementation:**
- Dataclass `HybridDecision`:
  - `use_cv: bool`
  - `aisle_threshold: int`
  - `confidence_threshold: float`
  - `cv_aisles: int`
  - `cv_confidence: float`
  - `factors: dict`
  - `reasoning: str`
- Method `to_dict()` for logging/debugging

**Tests:**
- Unit test: Decision created with all fields
- Unit test: Serialization includes reasoning
- Unit test: use_cv flag correctly set

**Validation:** `pytest tests/test_hybrid_models.py -v` passes

---

#### Task 7.2: Implement Decision Factor Calculation
**File:** `src/hybrid/decision.py`

**Description:** Calculate factors that influence the CV/AI decision.

**Implementation:**
- Function `calculate_factors(preprocessing_result, region, image_stats)` -> dict
- Factors include:
  - `region_area`, `region_area_ratio`
  - `edge_density`, `has_color_boundaries`, `color_boundary_coverage`
  - `orientation_confidence`
  - `image_resolution`, `noise_level`

**Tests:**
- Unit test: Factors calculated for typical region
- Unit test: Large region has high area_ratio
- Unit test: Noisy image has high noise_level

**Validation:** `pytest tests/test_decision_factors.py -v` passes

---

#### Task 7.3: Implement Adaptive Aisle Threshold Calculation
**File:** `src/hybrid/decision.py`

**Description:** Calculate minimum validated aisles required based on factors.

**Implementation:**
- Function `calculate_aisle_threshold(factors)` -> int
- Base threshold = 3
- Increase for large regions (>20% of image)
- Decrease if color boundaries present with high coverage
- Minimum = 2

**Tests:**
- Unit test: Small region -> threshold 3
- Unit test: Large region (25%) -> threshold 5
- Unit test: High color coverage -> threshold reduced
- Unit test: Minimum 2 enforced

**Validation:** `pytest tests/test_aisle_threshold.py -v` passes

---

#### Task 7.4: Implement Adaptive Confidence Threshold Calculation
**File:** `src/hybrid/decision.py`

**Description:** Calculate minimum confidence required based on image quality.

**Implementation:**
- Function `calculate_confidence_threshold(factors)` -> float
- Base threshold = 0.7
- Increase for noisy images
- Decrease for high-resolution images
- Decrease if orientation is clear
- Clamp to 0.5-0.9 range

**Tests:**
- Unit test: Standard image -> threshold 0.7
- Unit test: Noisy image -> threshold 0.8
- Unit test: High-res with clear orientation -> threshold 0.6

**Validation:** `pytest tests/test_confidence_threshold.py -v` passes

---

#### Task 7.5: Implement AdaptiveHybridDecision Class
**File:** `src/hybrid/decision.py`

**Description:** Main class for making CV vs AI decisions.

**Implementation:**
- Class `AdaptiveHybridDecision`
- Method `should_use_cv(preprocessing_result, region, image_stats)` -> HybridDecision
- Calculate factors, thresholds
- Compare CV results against thresholds
- Generate reasoning string

**Tests:**
- Unit test: High CV aisles + high confidence -> use CV
- Unit test: Low CV aisles -> use AI
- Unit test: Low confidence -> use AI
- Unit test: Reasoning explains decision

**Validation:** `pytest tests/test_adaptive_decision.py -v` passes

---

#### Task 7.6: Create Enhanced Preprocessing Hints Schema
**File:** `src/hints/schema.py`

**Description:** Define complete enhanced hints schema with all new fields.

**Implementation:**
- Dataclass `EnhancedPreprocessingHints` with:
  - `edge_detection`, `region_segmentation`, `aisle_detection` (existing)
  - `detected_colored_boundaries`, `boundary_coverage_ratio`
  - `region_orientations`, `orientation_groups`
  - `equipment_signatures`
  - `scale_estimate`, `image_quality`
- Method `to_dict()` for JSON serialization

**Tests:**
- Unit test: Schema includes all specified fields
- Unit test: Serialization produces valid JSON
- Unit test: Optional fields handle None values

**Validation:** `pytest tests/test_hints_schema.py -v` passes

---

#### Task 7.7: Implement Scale Estimation
**File:** `src/hints/scale_estimation.py`

**Description:** Estimate real-world scale from detected features.

**Implementation:**
- Dataclass `ScaleEstimate`:
  - `detected_aisle_width_px`, `estimated_aisle_width_m`
  - `pixels_per_meter`, `confidence`, `method`
- Function `estimate_scale(aisle_widths, dock_doors)` -> ScaleEstimate
- Use typical aisle width (3m) as reference
- Use dock door size if detected

**Tests:**
- Unit test: Aisle width 100px -> ~33 px/m (assuming 3m aisles)
- Unit test: No features -> default scale with low confidence
- Unit test: Multiple methods -> highest confidence used

**Validation:** `pytest tests/test_scale_estimation.py -v` passes

---

#### Task 7.8: Implement Image Quality Metrics
**File:** `src/hints/image_quality.py`

**Description:** Compute image quality metrics for hints.

**Implementation:**
- Dataclass `ImageQualityMetrics`:
  - `resolution`, `estimated_noise`, `contrast_ratio`
  - `edge_density`, `is_high_quality`
- Function `compute_quality_metrics(image)` -> ImageQualityMetrics
- Noise estimation via Laplacian variance
- Contrast from histogram analysis

**Tests:**
- Unit test: Clean image -> low noise, high quality
- Unit test: Noisy image -> high noise value
- Unit test: Low contrast image detected

**Validation:** `pytest tests/test_image_quality.py -v` passes

---

#### Task 7.9: Create Enhanced Hints Prompt Template
**File:** `src/prompts/hints_template.py`

**Description:** Create the prompt template that formats enhanced hints for the AI.

**Implementation:**
- Template `PREPROCESSING_HINTS_PROMPT` with placeholders:
  - `{boundary_summary}` - Color boundaries detected
  - `{orientation_summary}` - Region orientations
  - `{equipment_summary}` - Equipment signatures
  - `{scale.*}` - Scale estimation values
  - `{quality.*}` - Image quality values
- Function `format_hints_prompt(enhanced_hints)` -> str
- Include guidance for AI on using hints

**Tests:**
- Unit test: Template renders with all sections filled
- Unit test: Missing sections gracefully handled
- Unit test: Output within token limits

**Validation:** `pytest tests/test_hints_template.py -v` passes

---

#### Task 7.10: Integrate Adaptive Decision into Pipeline
**File:** `src/pipeline.py`

**Description:** Wire adaptive decision logic into main pipeline.

**Implementation:**
- Use AdaptiveHybridDecision for CV/AI choice per region
- Log decision reasoning for debugging
- Include decision metadata in output

**Tests:**
- Integration test: Pipeline uses adaptive decision
- Integration test: Decision logged for each region

**Validation:** `pytest tests/test_pipeline_decision.py -v` passes

---

#### Task 7.11: Integrate Enhanced Hints into Pipeline
**File:** `src/pipeline.py`

**Description:** Build and output EnhancedPreprocessingHints from pipeline.

**Implementation:**
- Build EnhancedPreprocessingHints with all sections
- Format using hints template for AI prompt
- Include in output metadata

**Tests:**
- Integration test: Enhanced hints have all sections
- Integration test: Formatted prompt included in output

**Validation:** `pytest tests/test_pipeline_hints.py -v` passes

---

### Sprint 7 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] Different regions get different CV/AI decisions
- [ ] Decision reasoning logged: "Using CV: Sufficient validated aisles..."
- [ ] Enhanced hints include all new sections
- [ ] Scale estimation produces reasonable values
- [ ] Image quality metrics computed correctly
- [ ] Formatted hints prompt included in output
- [ ] All tests pass: `pytest tests/test_hybrid*.py tests/test_hints*.py -v`
- [ ] Note: Full demo requires API key for Claude integration testing (mock responses acceptable)

---

## Sprint 8: Performance Optimization (IMP-07)

**Goal:** Implement progressive loading, caching, and parallel processing optimizations to meet performance targets.

**Demo:** Show progressive loading with initial results in <5s, cache hits for repeated images, parallel sub-agent processing reducing total time by >40%.

### Tasks

#### Task 8.1: Implement Progressive Loading Processor
**File:** `src/performance/progressive.py`

**Description:** Process images in two passes: quick low-res for initial results, then full resolution.

**Implementation:**
- Class `ProgressiveProcessor`
- Method `async process_progressive(image, callback)` -> ZoneResult
- Low-res pass at 1500px max dimension
- High-res refinement pass
- Callback for progress updates

**Tests:**
- Unit test: Large image triggers two-pass processing
- Unit test: Small image processed in single pass
- Unit test: Callback receives initial results
- Performance test: Initial results in <5s

**Validation:** `pytest tests/test_progressive.py -v` passes

---

#### Task 8.2: Implement Preprocessing Cache
**File:** `src/performance/cache.py`

**Description:** Cache preprocessing results by image hash to avoid redundant computation.

**Implementation:**
- Class `PreprocessingCache(max_size, ttl_seconds)`
- Method `get_or_compute(image, compute_fn)` -> PreprocessingResult
- Perceptual hash using resized thumbnail
- TTL-based expiration with cachetools
- Thread-safe access

**Tests:**
- Unit test: Same image returns cached result
- Unit test: Different image computes fresh result
- Unit test: Expired entry recomputed
- Unit test: Max size enforced (LRU eviction)

**Validation:** `pytest tests/test_cache.py -v` passes

---

#### Task 8.3: Implement Parallel Sub-Agent Processor
**File:** `src/performance/parallel_agents.py`

**Description:** Process multiple racking regions with sub-agents in parallel with rate limiting.

**Implementation:**
- Class `ParallelSubAgentProcessor(max_concurrent, rate_limit)`
- Method `async process_regions(image, regions, preprocessing)` -> List[SubdivisionResult]
- Semaphore for concurrency control
- Rate limiting between API calls
- Error handling per region

**Tests:**
- Unit test: Concurrency limited to max_concurrent
- Unit test: Rate limiting enforced between calls
- Unit test: Single region failure doesn't stop others
- Performance test: Parallel faster than sequential for 4+ regions

**Validation:** `pytest tests/test_parallel_agents.py -v` passes

---

#### Task 8.4: Implement Early Termination Optimizer
**File:** `src/performance/early_termination.py`

**Description:** Skip expensive processing when Phase 0 provides sufficient coverage.

**Implementation:**
- Class `EarlyTerminationOptimizer`
- Method `should_skip_phase1(phase0_result)` -> bool
- Check coverage > 80%, boundaries >= 3, closed regions
- Method `create_fast_track_hints(phase0_result)` -> PreprocessingHints

**Tests:**
- Unit test: High coverage -> skip Phase 1
- Unit test: Low coverage -> don't skip
- Unit test: High coverage but few boundaries -> don't skip
- Performance test: Early termination saves >50% processing time

**Validation:** `pytest tests/test_early_termination.py -v` passes

---

#### Task 8.5: Add Performance Timing Instrumentation
**File:** `src/performance/timing.py`

**Description:** Add detailed timing instrumentation to all pipeline stages.

**Implementation:**
- Context manager `Timer(stage_name)`
- Decorator `@timed` for functions
- Class `TimingCollector` to aggregate timings
- Method `get_summary()` -> dict with per-stage times

**Tests:**
- Unit test: Timer captures elapsed time
- Unit test: Nested timers work correctly
- Unit test: Summary includes all stages

**Validation:** `pytest tests/test_timing.py -v` passes

---

#### Task 8.6: Implement Memory Usage Monitor
**File:** `src/performance/memory.py`

**Description:** Monitor memory usage during processing to ensure bounded usage.

**Implementation:**
- Function `get_memory_usage()` -> int (bytes)
- Context manager `MemoryTracker(label)`
- Warning when usage exceeds threshold
- Tile cleanup after processing

**Tests:**
- Unit test: Memory usage tracked correctly
- Unit test: Warning logged at threshold
- Integration test: Memory bounded during large image processing

**Validation:** `pytest tests/test_memory.py -v` passes

---

#### Task 8.7: Create Benchmark Test Suite
**File:** `tests/benchmarks/`

**Description:** Create comprehensive benchmark tests for performance validation.

**Implementation:**
- Benchmark: Small image (<2000px) processing time
- Benchmark: Medium image (2000-4000px) processing time
- Benchmark: Large image (>4000px) processing time
- Benchmark: Cache hit latency
- Benchmark: Parallel vs sequential sub-agents

**Tests:**
- Small image: <10s
- Medium image: <20s
- Large image: <40s
- Cache hit: <2s
- Progressive initial: <5s

**Validation:** `pytest tests/benchmarks/ -v --benchmark-only`

---

#### Task 8.8: Integrate All Performance Optimizations
**File:** `src/pipeline.py`

**Description:** Wire all performance optimizations into the main pipeline.

**Implementation:**
- Add caching layer around preprocessing
- Use progressive loading for large images
- Use early termination when applicable
- Use parallel sub-agents for regions
- Add timing instrumentation
- Add memory monitoring

**Tests:**
- Integration test: Cache hit skips processing
- Integration test: Progressive loading works end-to-end
- Integration test: Parallel sub-agents used for multiple regions
- Integration test: Timing summary in output

**Validation:** `pytest tests/test_pipeline_performance.py -v` passes

---

### Sprint 8 Demo Checklist
- [ ] Venv activated before running any commands
- [ ] Progressive loading shows initial results in <5s
- [ ] Same image processed twice: second time <2s (cache hit)
- [ ] 4+ racking regions processed in parallel
- [ ] Total time for large image <40s (down from >60s)
- [ ] Memory usage stays bounded during processing
- [ ] Timing summary shows per-stage breakdown
- [ ] All benchmark targets met (see spec performance targets)
- [ ] All commands run successfully from venv

---

## Appendix: Testing Strategy

**IMPORTANT:** All tests must be run from an activated virtual environment.

```bash
# Before running any tests
cd python-preprocessing
source venv/bin/activate  # Linux/Mac
# or: .\venv\Scripts\activate  # Windows
```

### Test Categories

1. **Unit Tests** (`tests/test_*.py`)
   - Test individual functions/classes in isolation
   - Mock external dependencies
   - Fast execution (<1s per test)

2. **Integration Tests** (`tests/integration/`)
   - Test pipeline stages working together
   - Use real images but mock AI calls
   - Medium execution (1-10s per test)

3. **Benchmark Tests** (`tests/benchmarks/`)
   - Measure performance characteristics
   - Use representative real-world images
   - Run with `--benchmark-only` flag

4. **Visual Tests** (manual)
   - Generate visualization outputs
   - Visual inspection for correctness
   - Documented in test plans

### Test Fixtures

All test images should be:
- Generated programmatically where possible (reproducible)
- Stored in `tests/fixtures/` if needed as files
- Documented with expected detection results

### Continuous Integration

```yaml
# .github/workflows/test.yml
name: Python Preprocessing Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: python-preprocessing

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Create and activate venv
        run: |
          python -m venv venv
          source venv/bin/activate
          pip install -r requirements.txt

      - name: Run tests
        run: |
          source venv/bin/activate
          pytest tests/ -v --cov=src --cov-report=xml

      - name: Run benchmarks
        run: |
          source venv/bin/activate
          pytest tests/benchmarks/ --benchmark-only --benchmark-json=benchmark.json
```

**IMPORTANT:** The venv activation is required in each step because GitHub Actions runs each step in a fresh shell.

---

## Appendix: Configuration Schema

```yaml
# config.yaml
phase0_color_detection:
  enabled: true
  fast_track_threshold: 0.8
  color_ranges:
    orange:
      h_min: 10
      h_max: 25
      s_min: 100
      v_min: 100
    yellow:
      h_min: 25
      h_max: 35
    # ...
  min_contour_area: 1000
  morphology:
    close_iterations: 2
    open_iterations: 1
    kernel_size: 3

tiled_processing:
  enabled: true
  dimension_threshold: 4000
  tile_size: 2048
  overlap: 256
  smart_boundaries: true
  merge_iou_threshold: 0.3
  max_parallel_tiles: 4

performance:
  progressive_loading: true
  cache_enabled: true
  cache_max_size: 100
  cache_ttl_seconds: 3600
  max_parallel_subagents: 4
  rate_limit_seconds: 0.5
```

---

## Appendix: Dependencies

### requirements.txt

```
# Core dependencies
opencv-python>=4.8.0
numpy>=1.24.0
Pillow>=10.0.0

# Geometry operations (IMP-02: tiling)
shapely>=2.0.0

# Caching (IMP-07: performance)
cachetools>=5.3.0

# Signal processing (IMP-03: orientation)
scipy>=1.11.0

# Configuration
pyyaml>=6.0

# Async processing (IMP-02, IMP-07)
aiohttp>=3.9.0

# Testing
pytest>=7.4.0
pytest-asyncio>=0.21.0
pytest-cov>=4.1.0
pytest-benchmark>=4.0.0
```

### Virtual Environment Setup

```bash
# Create venv (run once)
cd python-preprocessing
python -m venv venv

# Activate (REQUIRED before every session)
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Verify installation
python -c "import cv2; import shapely; print('Dependencies OK')"
```

**IMPORTANT:** Never install packages globally. Always use the venv.

---

## Summary

This sprint plan provides 8 sprints with **69 atomic tasks** total. Each task is:
- Independently committable
- Has clear tests for validation
- Builds on previous work

Each sprint produces demoable software that can be tested and built upon. The plan follows the priority order from the improvements specification while ensuring incremental delivery.

### Critical Requirements

1. **Virtual Environment:** ALL Python commands MUST be run from an activated venv
2. **Closed Region Validation:** Fast-track mode requires boundaries to form closed regions (not just high coverage)
3. **Staging Area Detection:** Uses dock proximity (requires dock detection from Task 6.4)
4. **Seam-Free Merging:** Tile boundary zones must merge without visible discontinuities

### Task Count by Sprint

| Sprint | Tasks | Cumulative |
|--------|-------|------------|
| 1 | 9 | 9 |
| 2 | 8 | 17 |
| 3 | 8 | 25 |
| 4 | 8 | 33 |
| 5 | 9 | 42 |
| 6 | 9 | 51 |
| 7 | 11 | 62 |
| 8 | 8 | 70 |
