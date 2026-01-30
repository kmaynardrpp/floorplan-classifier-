# Floorplan Zone Classification & Editor Tool

## Specification Document
**Version:** 1.0  
**Date:** January 19, 2026  
**Project:** Redpoint AI Dashboard - Floorplan Analysis Module

---

## 1. Overview

### 1.1 Purpose
A standalone web application for analyzing floorplan images using AI to automatically classify and delineate travelable areas, with interactive editing capabilities for manual refinement and custom zone creation.

### 1.2 Core Objectives
- Accept floorplan images (JPEG, PNG, JPG) via upload
- Use Claude Opus API to analyze and classify zones within the floorplan
- Render detected zones as editable polygons overlaid on the floorplan
- Provide interactive tools for editing, creating, and managing zone polygons
- Export zone data in a structured format for integration with the main dashboard

### 1.3 Target Users
- Warehouse/facility managers configuring zone layouts
- Operations teams defining pick/drop areas
- System integrators testing zone classification accuracy

---

## 2. Functional Requirements

### 2.1 Image Upload & Display

| Requirement | Description |
|-------------|-------------|
| **FR-001** | Accept image uploads via drag-and-drop or file picker |
| **FR-002** | Support formats: `.jpeg`, `.jpg`, `.png` |
| **FR-003** | Maximum file size: 20MB |
| **FR-004** | Display uploaded image as the base canvas layer |
| **FR-005** | Support pan and zoom on the floorplan canvas |
| **FR-006** | Display image dimensions and scale indicator |

### 2.2 AI Zone Classification

| Requirement | Description |
|-------------|-------------|
| **FR-010** | Send floorplan image to Claude Opus API for analysis |
| **FR-011** | Request classification of travelable areas with polygon coordinates |
| **FR-012** | Display loading/progress indicator during API processing |
| **FR-013** | Handle API errors gracefully with user feedback |
| **FR-014** | Cache analysis results to avoid redundant API calls |

#### 2.2.1 Zone Types to Detect (AI-Generated)

| Zone Type | Description | Default Color |
|-----------|-------------|---------------|
| `aisle` | Primary walking/travel corridors | `#4CAF50` (green) |
| `travel_lane` | Vehicle/equipment travel paths | `#2196F3` (blue) |
| `parking_lot` | Vehicle parking areas | `#9C27B0` (purple) |
| `open_floor` | General open travelable space | `#FF9800` (orange) |
| `loading_dock` | Loading/unloading areas | `#795548` (brown) |
| `intersection` | Junction points of multiple paths | `#FFEB3B` (yellow) |
| `restricted` | Areas detected as non-travelable | `#F44336` (red) |

### 2.3 Interactive Polygon Editor

| Requirement | Description |
|-------------|-------------|
| **FR-020** | Display AI-generated polygons as semi-transparent overlays |
| **FR-021** | Select polygons by clicking on them |
| **FR-022** | Multi-select polygons with Shift+Click |
| **FR-023** | Move polygon vertices by dragging |
| **FR-024** | Add new vertices to polygon edges |
| **FR-025** | Delete vertices from polygons (min 3 vertices) |
| **FR-026** | Delete entire polygons |
| **FR-027** | Duplicate existing polygons |
| **FR-028** | Undo/Redo support (Ctrl+Z / Ctrl+Shift+Z) |

### 2.4 Custom Zone Creation

| Requirement | Description |
|-------------|-------------|
| **FR-030** | Draw new polygons freehand (click-to-place vertices) |
| **FR-031** | Draw rectangles with click-drag |
| **FR-032** | Assign zone type to new polygons |
| **FR-033** | Create custom zone types with user-defined names and colors |
| **FR-034** | Edit zone metadata (name, type, description) |

#### 2.4.1 User-Defined Zone Types (Examples)

| Zone Type | Description | Suggested Color |
|-----------|-------------|-----------------|
| `pick_area` | Locations for order picking | `#00BCD4` (cyan) |
| `drop_area` | Locations for item drop-off | `#E91E63` (pink) |
| `staging_area` | Temporary staging zones | `#607D8B` (gray) |
| `charging_station` | Equipment charging locations | `#8BC34A` (light green) |
| `hazard_zone` | Safety/hazard areas | `#FF5722` (deep orange) |
| `custom` | User-defined with custom label | User-selected |

### 2.5 Zone Management Panel

| Requirement | Description |
|-------------|-------------|
| **FR-040** | List all zones in a sidebar panel |
| **FR-041** | Filter zones by type |
| **FR-042** | Search zones by name |
| **FR-043** | Toggle visibility of individual zones |
| **FR-044** | Toggle visibility by zone type |
| **FR-045** | Bulk operations (delete selected, change type) |
| **FR-046** | Reorder zones (affects rendering z-index) |

### 2.6 Data Export & Import

| Requirement | Description |
|-------------|-------------|
| **FR-050** | Export zone data as JSON |
| **FR-051** | Export zone data as GeoJSON |
| **FR-052** | Import previously exported zone configurations |
| **FR-053** | Export annotated floorplan as PNG image |
| **FR-054** | Copy zone data to clipboard |

---

## 3. Technical Architecture

### 3.1 Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Frontend Framework** | React 18+ with TypeScript | Component reusability, type safety |
| **Canvas Rendering** | Fabric.js or Konva.js | Robust polygon manipulation, zoom/pan |
| **State Management** | Zustand or Redux Toolkit | Complex state for undo/redo |
| **Styling** | Tailwind CSS | Rapid UI development |
| **API Client** | Anthropic SDK (@anthropic-ai/sdk) | Official Claude API integration |
| **Build Tool** | Vite | Fast development builds |

### 3.2 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Client)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Image     │  │   Canvas    │  │     Zone Management     │  │
│  │   Upload    │  │   Editor    │  │         Panel           │  │
│  │  Component  │  │  (Fabric.js)│  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │               │
│         └────────────────┼──────────────────────┘               │
│                          │                                      │
│                   ┌──────┴──────┐                               │
│                   │    State    │                               │
│                   │   (Zustand) │                               │
│                   └──────┬──────┘                               │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Backend Proxy (Optional)                      │
│              (Protects API key, adds rate limiting)              │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                           │ HTTPS
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Claude Opus API                              │
│                   (api.anthropic.com)                            │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Models

#### 3.3.1 Zone Object

```typescript
interface Zone {
  id: string;                    // UUID
  name: string;                  // Display name
  type: ZoneType;                // Zone classification
  vertices: Point[];             // Polygon vertices
  metadata: ZoneMetadata;        // Additional properties
  source: 'ai' | 'manual';       // Origin of zone
  confidence?: number;           // AI confidence score (0-1)
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
}

interface Point {
  x: number;                     // X coordinate (pixels from left)
  y: number;                     // Y coordinate (pixels from top)
}

interface ZoneMetadata {
  description?: string;
  color: string;                 // Hex color code
  opacity: number;               // 0-1
  isVisible: boolean;
  isLocked: boolean;
  customProperties?: Record<string, unknown>;
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
  | 'custom';
```

#### 3.3.2 Project State

```typescript
interface ProjectState {
  id: string;
  name: string;
  image: {
    dataUrl: string;
    width: number;
    height: number;
    filename: string;
  } | null;
  zones: Zone[];
  customZoneTypes: CustomZoneType[];
  history: HistoryState[];       // For undo/redo
  historyIndex: number;
  viewport: {
    zoom: number;
    panX: number;
    panY: number;
  };
}

interface CustomZoneType {
  id: string;
  name: string;
  label: string;
  color: string;
  description?: string;
}
```

### 3.4 Claude API Integration

#### 3.4.1 Request Structure

```typescript
const analyzeFloorplan = async (imageBase64: string): Promise<Zone[]> => {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png", // or image/jpeg
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: FLOORPLAN_ANALYSIS_PROMPT,
          },
        ],
      },
    ],
  });
  
  return parseZonesFromResponse(response);
};
```

#### 3.4.2 Analysis Prompt

```typescript
const FLOORPLAN_ANALYSIS_PROMPT = `
Analyze this floorplan image and identify all travelable areas. For each area, provide:

1. Classification type (one of: aisle, travel_lane, parking_lot, open_floor, loading_dock, intersection, restricted)
2. Polygon vertices as [x, y] coordinates in pixels from the top-left corner
3. A confidence score (0-1) for the classification
4. A brief description of the area

Return your analysis as a JSON array with this structure:
{
  "zones": [
    {
      "type": "aisle",
      "name": "Main Aisle A",
      "description": "Primary north-south corridor",
      "confidence": 0.95,
      "vertices": [[x1, y1], [x2, y2], [x3, y3], ...]
    }
  ],
  "image_dimensions": {
    "width": <detected_width>,
    "height": <detected_height>
  },
  "analysis_notes": "Any relevant observations about the floorplan"
}

Guidelines:
- Trace polygon boundaries precisely along visible edges
- Use minimum vertices needed to accurately represent each area
- Identify connecting points between different zone types
- Note any ambiguous or unclear areas in analysis_notes
- Consider typical warehouse/facility layouts when classifying
`;
```

#### 3.4.3 Response Parsing

```typescript
interface APIResponse {
  zones: Array<{
    type: ZoneType;
    name: string;
    description: string;
    confidence: number;
    vertices: [number, number][];
  }>;
  image_dimensions: {
    width: number;
    height: number;
  };
  analysis_notes: string;
}

const parseZonesFromResponse = (response: Message): Zone[] => {
  // Extract JSON from response content
  // Validate structure
  // Transform to Zone objects with generated IDs
  // Apply default colors and metadata
};
```

---

## 4. User Interface Design

### 4.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: Logo | Project Name | Save | Export ▼ | Import | Settings ⚙   │
├────────────────────┬────────────────────────────────────────────────────┤
│                    │                                                    │
│   Zone Panel       │              Canvas Area                           │
│   ─────────────    │              ───────────                           │
│                    │                                                    │
│   [Filter ▼]       │    ┌────────────────────────────────────────┐     │
│   [Search...]      │    │                                        │     │
│                    │    │                                        │     │
│   ▸ Aisles (3)     │    │         Floorplan Image                │     │
│     □ Main Aisle   │    │              with                      │     │
│     □ Aisle B      │    │         Zone Overlays                  │     │
│     □ Aisle C      │    │                                        │     │
│   ▸ Travel Lanes   │    │                                        │     │
│   ▸ Pick Areas     │    │                                        │     │
│   ▸ Drop Areas     │    │                                        │     │
│                    │    └────────────────────────────────────────┘     │
│   [+ Add Zone]     │                                                    │
│   [+ Custom Type]  │    Zoom: [─────●─────] 100%  |  Pan: ✋ enabled   │
│                    │                                                    │
├────────────────────┴────────────────────────────────────────────────────┤
│  Toolbar: Select | Draw Polygon | Draw Rect | Edit | Delete | Undo/Redo│
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Hierarchy

```
App
├── Header
│   ├── Logo
│   ├── ProjectName
│   ├── SaveButton
│   ├── ExportMenu
│   ├── ImportButton
│   └── SettingsButton
├── MainLayout
│   ├── ZonePanel (Left Sidebar)
│   │   ├── FilterDropdown
│   │   ├── SearchInput
│   │   ├── ZoneTypeGroups
│   │   │   └── ZoneListItem (repeated)
│   │   ├── AddZoneButton
│   │   └── AddCustomTypeButton
│   ├── CanvasArea (Center)
│   │   ├── CanvasContainer
│   │   │   ├── FloorplanLayer
│   │   │   └── ZoneOverlayLayer
│   │   └── CanvasControls
│   │       ├── ZoomSlider
│   │       └── PanToggle
│   └── PropertiesPanel (Right Sidebar, contextual)
│       ├── ZoneProperties
│       └── CustomTypeEditor
├── Toolbar (Bottom)
│   ├── SelectTool
│   ├── DrawPolygonTool
│   ├── DrawRectTool
│   ├── EditTool
│   ├── DeleteTool
│   ├── UndoButton
│   └── RedoButton
└── Modals
    ├── ImageUploadModal
    ├── AnalyzingModal
    ├── ExportModal
    └── SettingsModal
```

### 4.3 Interaction States

#### 4.3.1 Canvas Modes

| Mode | Cursor | Behavior |
|------|--------|----------|
| `select` | Default | Click to select zones, drag to move |
| `pan` | Grab/Grabbing | Drag to pan canvas |
| `draw_polygon` | Crosshair | Click to place vertices, double-click to complete |
| `draw_rect` | Crosshair | Click-drag to create rectangle |
| `edit_vertices` | Move | Drag vertices, click edge to add vertex |

#### 4.3.2 Zone Visual States

| State | Appearance |
|-------|------------|
| Default | Semi-transparent fill, solid border |
| Hovered | Increased opacity, highlighted border |
| Selected | Full opacity, thick dashed border, visible vertices |
| Locked | Hatched pattern overlay, dimmed |
| Hidden | Not rendered |

---

## 5. API Security Considerations

### 5.1 API Key Management

**Option A: Backend Proxy (Recommended for Production)**
- Store API key on a backend server
- Frontend calls your proxy endpoint
- Proxy forwards to Claude API with key
- Prevents key exposure in browser

**Option B: Direct Client-Side (Development/Testing Only)**
- Store key in environment variable
- Use `.env.local` (not committed to git)
- Accept risk of key exposure in browser dev tools
- Implement usage limits/monitoring

### 5.2 Proxy Server Example (Express)

```typescript
// server/index.ts
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per window
});

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json({ limit: '25mb' }));
app.use('/api/analyze', limiter);

app.post('/api/analyze', async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;
    
    const response = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
      messages: [/* ... */],
    });
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

app.listen(3001);
```

---

## 6. Export Formats

### 6.1 JSON Export

```json
{
  "version": "1.0",
  "exportedAt": "2026-01-19T14:30:00Z",
  "project": {
    "name": "Warehouse A - Floor 1",
    "imageFilename": "warehouse_a_floor1.png",
    "imageDimensions": {
      "width": 2400,
      "height": 1800
    }
  },
  "zones": [
    {
      "id": "zone_abc123",
      "name": "Main Aisle",
      "type": "aisle",
      "source": "ai",
      "confidence": 0.94,
      "vertices": [
        { "x": 100, "y": 200 },
        { "x": 150, "y": 200 },
        { "x": 150, "y": 800 },
        { "x": 100, "y": 800 }
      ],
      "metadata": {
        "description": "Primary north-south corridor",
        "color": "#4CAF50",
        "opacity": 0.5
      }
    }
  ],
  "customZoneTypes": [
    {
      "id": "custom_type_1",
      "name": "pick_area",
      "label": "Pick Area",
      "color": "#00BCD4"
    }
  ]
}
```

### 6.2 GeoJSON Export

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "zone_abc123",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [[100, 200], [150, 200], [150, 800], [100, 800], [100, 200]]
        ]
      },
      "properties": {
        "name": "Main Aisle",
        "zoneType": "aisle",
        "source": "ai",
        "confidence": 0.94,
        "color": "#4CAF50",
        "description": "Primary north-south corridor"
      }
    }
  ]
}
```

---

## 7. Error Handling

### 7.1 Error Categories

| Category | Examples | User Feedback |
|----------|----------|---------------|
| **Upload Errors** | Invalid file type, file too large | Toast notification with specific issue |
| **API Errors** | Rate limit, timeout, invalid response | Modal with retry option |
| **Parsing Errors** | Malformed AI response | Warning + partial results if available |
| **Canvas Errors** | WebGL not supported | Fallback to 2D canvas |
| **Storage Errors** | localStorage full | Prompt to export/clear data |

### 7.2 Retry Logic

```typescript
const analyzeWithRetry = async (
  imageBase64: string,
  maxRetries = 3,
  backoffMs = 1000
): Promise<Zone[]> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeFloorplan(imageBase64);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      if (isRateLimitError(error)) {
        await delay(backoffMs * attempt);
      } else {
        throw error; // Don't retry non-recoverable errors
      }
    }
  }
};
```

---

## 8. Performance Considerations

### 8.1 Image Optimization

| Technique | Implementation |
|-----------|----------------|
| Client-side resize | Resize large images to max 4096px before upload |
| Compression | Use canvas toBlob with quality 0.85 for JPEG |
| Progressive loading | Show thumbnail while processing |
| Lazy rendering | Only render visible zones at current zoom |

### 8.2 Canvas Optimization

| Technique | Implementation |
|-----------|----------------|
| Layer caching | Cache static floorplan layer |
| Debounced updates | Debounce viewport changes (pan/zoom) |
| Virtualization | Only render polygons in viewport |
| Object pooling | Reuse Fabric.js objects when updating |

---

## 9. Testing Strategy

### 9.1 Test Categories

| Category | Tools | Coverage |
|----------|-------|----------|
| **Unit Tests** | Vitest | Zone utilities, data transformations |
| **Component Tests** | React Testing Library | UI components, interactions |
| **Integration Tests** | Playwright | Full workflows, API mocking |
| **Visual Regression** | Chromatic/Percy | Canvas rendering consistency |

### 9.2 Test Scenarios

```typescript
// Example test cases
describe('Zone Editor', () => {
  it('should create polygon from click sequence');
  it('should select zone on click');
  it('should move vertex on drag');
  it('should undo/redo zone operations');
  it('should export zones as valid JSON');
  it('should import previously exported zones');
});

describe('AI Analysis', () => {
  it('should parse valid API response into zones');
  it('should handle API timeout gracefully');
  it('should display error on invalid response');
  it('should retry on rate limit');
});
```

---

## 10. Future Enhancements (Out of Scope for v1)

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **Multi-floor support** | Handle multiple floor levels | Medium |
| **Scale calibration** | Set real-world measurements | High |
| **Zone templates** | Save/load common zone configurations | Medium |
| **Collaborative editing** | Real-time multi-user editing | Low |
| **Version history** | Track changes over time | Medium |
| **Integration API** | Expose zones to main dashboard | High |
| **Batch processing** | Analyze multiple floorplans | Low |
| **ML refinement** | Learn from user corrections | Low |

---

## 11. Development Phases

### Phase 1: Core Foundation (Week 1-2)
- [ ] Project setup (Vite + React + TypeScript)
- [ ] Basic image upload and display
- [ ] Canvas setup with pan/zoom
- [ ] Claude API integration (direct, no proxy)
- [ ] Basic zone rendering from AI response

### Phase 2: Polygon Editing (Week 2-3)
- [ ] Zone selection
- [ ] Vertex editing (move, add, delete)
- [ ] Polygon drawing tool
- [ ] Rectangle drawing tool
- [ ] Undo/redo system

### Phase 3: Zone Management (Week 3-4)
- [ ] Zone list panel
- [ ] Zone type filtering
- [ ] Visibility toggles
- [ ] Zone properties editing
- [ ] Custom zone type creation

### Phase 4: Export & Polish (Week 4-5)
- [ ] JSON/GeoJSON export
- [ ] Import functionality
- [ ] Image export with annotations
- [ ] Error handling refinement
- [ ] Performance optimization
- [ ] Documentation

---

## 12. Acceptance Criteria

### 12.1 Must Have (MVP)
- [ ] Upload floorplan image (JPEG/PNG)
- [ ] Analyze with Claude Opus and display detected zones
- [ ] Select and view zone properties
- [ ] Edit polygon vertices
- [ ] Draw new polygons manually
- [ ] Assign zone types (including custom)
- [ ] Export zone data as JSON
- [ ] Undo/redo for all operations

### 12.2 Should Have
- [ ] Rectangle drawing tool
- [ ] GeoJSON export
- [ ] Zone visibility toggles
- [ ] Search/filter zones
- [ ] Confidence score display

### 12.3 Nice to Have
- [ ] Annotated image export
- [ ] Keyboard shortcuts
- [ ] Dark mode
- [ ] Touch/tablet support

---

## Appendix A: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `V` | Select tool |
| `P` | Draw polygon tool |
| `R` | Draw rectangle tool |
| `E` | Edit vertices mode |
| `Delete` / `Backspace` | Delete selected zone(s) |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all zones |
| `Ctrl+D` | Duplicate selected |
| `Ctrl+S` | Save project |
| `Ctrl+E` | Export dialog |
| `Space` (hold) | Temporary pan mode |
| `+` / `-` | Zoom in/out |
| `0` | Reset zoom to 100% |
| `Escape` | Cancel current operation / deselect |

---

## Appendix B: Color Palette

```css
/* Zone Type Colors */
--color-aisle: #4CAF50;
--color-travel-lane: #2196F3;
--color-parking-lot: #9C27B0;
--color-open-floor: #FF9800;
--color-loading-dock: #795548;
--color-intersection: #FFEB3B;
--color-restricted: #F44336;
--color-pick-area: #00BCD4;
--color-drop-area: #E91E63;
--color-staging-area: #607D8B;
--color-charging-station: #8BC34A;
--color-hazard-zone: #FF5722;

/* UI Colors */
--color-primary: #1976D2;
--color-secondary: #424242;
--color-background: #FAFAFA;
--color-surface: #FFFFFF;
--color-error: #D32F2F;
--color-success: #388E3C;
```

---

## Appendix C: API Cost Estimation

| Scenario | Tokens (Est.) | Cost (Est.) |
|----------|---------------|-------------|
| Single floorplan analysis | ~5,000 input + ~2,000 output | ~$0.15-0.25 |
| Development (50 analyses) | ~350,000 tokens | ~$10-15 |
| Production (per facility) | ~5-10 analyses | ~$1-3 |

*Note: Costs based on Claude Opus pricing as of January 2026. Verify current rates.*

---

**Document Status:** Draft  
**Last Updated:** January 19, 2026  
**Author:** Kevin @ Redpoint Positioning
