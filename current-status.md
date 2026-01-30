# Floorplan Zone Editor - Current Status & Context

**Generated:** January 26, 2026
**Purpose:** Context transfer file for new Claude sessions

---

## Project Overview

AI-powered warehouse floorplan zone classification tool. Users upload floorplan images, which are analyzed by AI to detect zones (aisles, parking, loading docks, racking, etc.), then interactively edit the detected polygons.

### Core Goals
1. **Accurate Aisle Detection** - Identify the whitespace corridors BETWEEN racking (black lines) that forklifts/robots can travel through
2. **Travel Lane Detection** - Find large white corridors connecting major areas
3. **Zone Classification** - Classify regions as travelable (aisles, travel lanes) or non-travelable (racking, docking areas)
4. **Multi-Agent Analysis** - Use sub-agents to analyze racking areas in detail

### Technology Stack
- **Frontend**: React 19 + TypeScript (strict mode), Vite 7
- **Canvas**: Konva.js for polygon manipulation
- **State**: Zustand + Immer
- **Styling**: Tailwind CSS 4
- **AI**: Claude/Gemini/OpenAI APIs (Opus for main, Sonnet/Flash for sub-agents)
- **Preprocessing**: Python FastAPI server with OpenCV

---

## Architecture

### Two-Phase Multi-Agent System

**Phase 1: Coarse Detection (Main Agent)**
- Identifies all major zones: travel lanes, parking lots, docking areas
- Detects `racking_area` zones that need detailed subdivision
- Flags zones with `needsSubdivision: true`

**Phase 2: Sub-Agent Analysis (for each racking_area)**
- Receives cropped image of racking region
- Identifies `aisle_path` (travelable) and `racking` (non-travelable) zones
- Detects aisle direction (horizontal/vertical)
- Coordinates transformed back to full image space

### Python Preprocessing Server

Runs on `http://localhost:8000` and provides:
- Edge detection using Canny
- Line detection (parallel lines for racking rows)
- **Aisle detection** using multiple methods:
  - `brightness_pattern` - Finds light corridors between dark lines
  - `line_pair` - Edge-based detection using Sobel gradients
  - `whitespace` - Projection-based whitespace analysis
  - `travel_lane_morph` - Morphological operations for large corridors
- Region segmentation (dense vs sparse areas)

---

## Key File Locations

### Frontend (TypeScript)
| File | Purpose |
|------|---------|
| `src/services/subAgentApi.ts` | Sub-agent API calls, JSON parsing with recovery strategies |
| `src/services/claudeApi.ts` | Main Claude API integration |
| `src/services/geminiApi.ts` | Gemini API integration |
| `src/services/preprocessingApi.ts` | Python server client |
| `src/hooks/useAgenticAnalysis.ts` | Multi-agent orchestration |
| `src/store/useProjectStore.ts` | Main state management |

### Python Preprocessing
| File | Purpose |
|------|---------|
| `python-preprocessing/server.py` | FastAPI server, endpoints |
| `python-preprocessing/src/line_detection.py` | Aisle detection algorithms |
| `python-preprocessing/src/pipeline.py` | Main preprocessing pipeline |
| `python-preprocessing/src/edge_detection.py` | Canny edge detection |
| `python-preprocessing/src/region_segmentation.py` | Density-based segmentation |

### Documentation
| File | Purpose |
|------|---------|
| `docs/tuning-spec.md` | Full multi-agent architecture spec |
| `docs/CODEBASE_MAP.md` | Auto-generated codebase map |
| `CLAUDE.md` | Project instructions for Claude |

---

## How to Run (For Autonomous Testing)

### 1. Start Python Preprocessing Server
```bash
cd python-preprocessing
./venv/Scripts/python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start Frontend Dev Server
```bash
npm run dev
# Runs at http://localhost:5173
```

### 3. Verify Servers Running
```bash
# Python server health check
curl http://localhost:8000/health
# Should return: {"status":"healthy","version":"1.0.0"}

# Check ports in use
netstat -ano | findstr ":8000"   # Python server
netstat -ano | findstr ":5173"   # Frontend
```

### 4. Test Preprocessing Endpoint
```bash
# Upload a test image for preprocessing
curl -X POST "http://localhost:8000/preprocess/upload" \
  -F "file=@test_floorplan.png" \
  -F "save_aisle_visualization=true"
```

### 5. Visualization Output Location
Aisle detection visualizations are saved to:
```
C:\Users\KevinMaynard\AppData\Local\Temp\floorplan_preprocessing\
```

---

## MAJOR NEXT STEPS (PRIORITY ORDER)

### 1. Fix Sub-Agent Failures (CRITICAL)

**Problem:** Sub-agents continue to fail when analyzing racking areas.

**Symptoms:**
- JSON parsing errors from truncated responses
- Validation failures for malformed coordinates
- Timeouts on large racking regions

**Files to investigate:**
- `src/services/subAgentApi.ts` - JSON recovery strategies (lines 199-430)
- Check API response handling for each provider (Anthropic, OpenAI, Gemini)

**Current JSON recovery strategies:**
1. Extract from markdown code blocks
2. Find raw JSON object braces
3. Balance braces for complete JSON
4. Parse individual subdivision objects by structure
5. Aggressive recovery finding any subdivision-like objects
6. Last resort: extract vertex arrays and reconstruct

### 2. Improve Aisle Detection Accuracy (CRITICAL - "Last 5%")

**Problem:** Aisles are detected but with significant errors:
- **Too long** - Aisles extend beyond actual corridor boundaries
- **Offset left/right** - Not centered in the whitespace
- **Too wide** - Width exceeds actual corridor width
- **Too much spacing** - Aisles placed on top of racking instead of in whitespace

**Key insight:** The AI should focus on the **whitespace BETWEEN the black lines** (racking). Aisles are the white corridors; racking is the dark parallel lines.

**Files to modify:**
- `python-preprocessing/src/line_detection.py`

**Current detection parameters (may need tuning):**
```python
# Brightness pattern detection
min_aisle_width=8     # Can be too narrow
max_aisle_width=60    # May miss wider aisles
dark_thresh=140       # Threshold for "dark" pixels
light_thresh=210      # Threshold for "light" pixels
min_consistency=8     # Samples an aisle must appear in
num_samples=25        # Rows sampled per racking band

# Line-pair detection
min_aisle_width=10
max_aisle_width=70
min_aisle_length=80
scan_window=30

# Merge distance for deduplication
merge_distance=20
```

**Potential improvements:**
- Tighter width constraints
- Better centerline calculation
- Edge-based boundary detection
- Validate aisles have dark lines on BOTH sides

### 3. Screenshot Reference

A screenshot of the latest analysis run will be provided in the conversation. Use it to:
- Identify specific detection failures
- Compare detected aisles to actual whitespace corridors
- Identify patterns in misdetection

### 4. Fix Visualization Output (NOT SAVING)

**Problem:** Preprocessing visualizations are not being saved to:
```
C:\Users\KevinMaynard\AppData\Local\Temp\floorplan_preprocessing\
```

**Investigation steps:**
1. Check server logs for "Saved aisle visualization" messages
2. Verify `draw_aisles_visualization()` is being called in `server.py`
3. Check `num_aisles > 0` condition (line 145 of server.py)
4. Verify directory permissions

**Files:**
- `python-preprocessing/server.py` (lines 143-155)
- `python-preprocessing/src/pipeline.py` (`draw_aisles_visualization` function)

### 5. Improve Travel Lane Detection

**Problem:** Travel lanes are almost always detected incorrectly.

**Additional issue:** There's a bounding box/margin around floorplans - the area between the actual floorplan content and the image edges. Travel lanes are being detected in this margin area instead of the actual warehouse corridors.

**Potential solutions:**
- Detect the floorplan boundary first (crop to content)
- Filter out lanes that touch image edges
- Require minimum interior content for travel lanes
- Use morphological operations to find only interior corridors

**Files:**
- `python-preprocessing/src/line_detection.py`:
  - `detect_aisles_from_whitespace()` - Current whitespace detection
  - `detect_travel_lanes_morphological()` - Morphological detection

---

## Current Aisle Detection Algorithms

### Method 1: Brightness Pattern (`detect_aisles_from_brightness_pattern`)
1. Find "racking bands" - horizontal regions with high brightness variance
2. Sample multiple rows within each band
3. Find light gaps (potential aisles) in each sampled row
4. Keep only aisles that appear consistently across samples
5. Validate by checking for dark lines on both sides

### Method 2: Line-Pair Detection (`detect_aisles_from_line_pairs`)
1. Use Sobel edge detection to find vertical/horizontal edges
2. Find low-edge-density columns/rows (whitespace corridors)
3. Verify high-edge-density regions on both sides (racking lines)
4. Extract aisle boundaries where this pattern holds

### Method 3: Whitespace Analysis (`detect_aisles_from_whitespace`)
1. Binary threshold the image
2. Use projection analysis (sum pixels per row/column)
3. Find continuous high-whiteness regions
4. Filter by width and length constraints

### Method 4: Morphological Travel Lanes (`detect_travel_lanes_morphological`)
1. Threshold to find light areas
2. Morphological closing to connect nearby regions
3. Morphological opening to remove noise
4. Find contours of remaining white regions
5. Filter by size and aspect ratio

---

## Visual Pattern Recognition Guide

### Vertical Aisles (most common)
```
BLACK LINES │ WHITE SPACE │ BLACK LINES
(racking)   │   (AISLE)   │ (racking)
  ││││││    │             │   ││││││
  ││││││    │   EMPTY     │   ││││││
  ││││││    │   CORRIDOR  │   ││││││
```
- Dark lines on LEFT and RIGHT sides
- Whitespace corridor BETWEEN them
- Runs TOP to BOTTOM

### Horizontal Aisles
```
════════════════════════════════════  <- BLACK LINES

        WHITE WHITESPACE (AISLE)      <- EMPTY SPACE

════════════════════════════════════  <- BLACK LINES
```
- Dark lines ABOVE and BELOW
- Whitespace corridor BETWEEN them
- Runs LEFT to RIGHT

---

## Testing Workflow

### Manual Testing in Browser
1. Open http://localhost:5173
2. Upload a floorplan image
3. Click "Analyze" button
4. Observe zone detection results
5. Check browser console for sub-agent logs

### Automated Testing
```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm run test:coverage      # Coverage report
```

### Test Files
- `src/services/subAgentApi.test.ts` - Sub-agent parsing tests
- `src/services/claudeApi.test.ts` - Claude API tests
- `src/services/coordinateTransform.test.ts` - Coordinate transformation tests

---

## Server Status Commands

```bash
# Check if Python server is running
netstat -ano | findstr ":8000.*LISTENING"

# Kill process by PID (replace XXXX with actual PID)
taskkill //F //PID XXXX

# Check frontend server
netstat -ano | findstr ":5173"

# View server logs (background task output)
# Check Claude Code's task output files in temp directory
```

---

## Known Issues & Gotchas

1. **API Key in Browser**: API key is exposed in browser for direct API calls (security consideration)

2. **Image Size Limits**: Claude API has 5MB/8000px limit; compression auto-applied

3. **Zone Replacement**: Re-analysis replaces AI zones but keeps manual zones

4. **JSON Truncation**: Gemini especially prone to truncating long JSON responses; recovery strategies in `parseSubAgentResponse()`

5. **Coordinate Systems**: Sub-agent coordinates are relative to cropped image; must transform back to full image space

6. **Hot Reload**: Python server with `--reload` flag picks up code changes automatically

---

## Quick Reference: Detection Parameters

| Parameter | Current Value | Purpose |
|-----------|---------------|---------|
| `min_aisle_width` (brightness) | 8px | Minimum detected aisle width |
| `max_aisle_width` (brightness) | 60px | Maximum detected aisle width |
| `dark_thresh` | 140 | Below = dark (racking) |
| `light_thresh` | 210 | Above = light (aisle) |
| `min_consistency` | 8 | Samples aisle must appear in |
| `num_samples` | 25 | Rows sampled per band |
| `merge_distance` | 20px | Deduplication threshold |
| `min_aisle_length` | 80px | Minimum corridor length |

---

## Contact & Resources

- **GitHub Issues**: https://github.com/anthropics/claude-code/issues
- **Tuning Spec**: `docs/tuning-spec.md`
- **Codebase Map**: `docs/CODEBASE_MAP.md`
