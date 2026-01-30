# New Technique: TDOA-Based Zone Detection & Routing System

## Overview

This specification describes a major rework of the floorplan zone detection system to incorporate real-world anchor positioning data (TDOA pairs) as the primary source of truth for aisle detection, supplemented by coverage polygons for travelable areas. The system will support both programmatic (no AI) and AI-enhanced zone detection modes.

---

## 1. New Data Files

All configuration files will be placed in `docs/files/` directory.

### 1.1 floorplans.json

**Purpose:** Defines image scaling and offset relative to real-world coordinates.

**Structure:**
```json
{
  "floorplans": [{
    "filename": "SAV3_IMAGE_07.15.2022_JD.jpg",
    "width": 11507,              // Image width in pixels
    "height": 4276,              // Image height in pixels
    "image_offset_x": 5649,      // X offset in mm (origin shift)
    "image_offset_y": 1934,      // Y offset in mm (origin shift)
    "image_scale": 0.482276,     // mm per pixel (real-world to image)
    "current_scale": 0.100880623388662,
    "image_rotation": 0,
    "sublocation_uid": "7WaetEwCQ1ymBtuozt3seQ"
  }]
}
```

**Coordinate Transform:**
```typescript
// Real-world mm → Image pixels
function mmToPixels(mmX: number, mmY: number, floorplan: Floorplan): Point {
  return {
    x: (mmX - floorplan.image_offset_x) / floorplan.image_scale,
    y: (mmY - floorplan.image_offset_y) / floorplan.image_scale
  };
}

// Image pixels → Real-world mm
function pixelsToMm(pixelX: number, pixelY: number, floorplan: Floorplan): Point {
  return {
    x: pixelX * floorplan.image_scale + floorplan.image_offset_x,
    y: pixelY * floorplan.image_scale + floorplan.image_offset_y
  };
}
```

### 1.2 win_anchors.json

**Purpose:** Defines anchor locations across the facility with their MAC addresses and names.

**Structure:**
```json
{
  "win_anchors": [{
    "name": "SAV3-08-0207H",       // Human-readable name (matches schedule.csv)
    "uid": "342ky8R1TZ_JUDCIeZDgtA",
    "type": "ANCHOR",
    "position": {
      "x": 182511,                 // X position in mm
      "y": 56412,                  // Y position in mm
      "z": 11565,                  // Z height in mm
      "yaw": 0,
      "sl_uid": "7WaetEwCQ1ymBtuozt3seQ"
    },
    "locked": false
  }]
}
```

**Key Fields:**
- `name` - Used to match with schedule.csv Source/Destination columns
- `position.x`, `position.y` - Real-world coordinates in millimeters

### 1.3 schedule.csv

**Purpose:** Defines TDOA pairs (anchor-to-anchor connections) that form the basis for aisle detection.

**Structure:**
```csv
#,Source,Destination,Slot,Dimension,Distance,Boundary,Margin
148,SAV3-01-0155G,SAV3-01-0272G,46B,1D,43497,No,3000
149,SAV3-02-0156H,SAV3-02-0028H,46A,1D,37651,No,2500
```

**Key Fields:**
- `Source`, `Destination` - Anchor names (match win_anchors.json)
- `Dimension` - **1D** for aisles, **2D** for general coverage
- `Distance` - Distance between anchors in mm
- `Margin` - **Width of the aisle** in mm (perpendicular to anchor line)
- `Slot` - Identifier (e.g., "46B", "46A" indicate aisle numbering)

**1D Pairs are the Holy Grail:**
- 100% of aisles have a 1D TDOA pair going through them
- The pair defines both the length (anchor-to-anchor) and width (margin) of the aisle
- Slot identifiers help group related pairs (e.g., "17A" and "17B" are parallel aisles)

### 1.4 coverage.json

**Purpose:** Defines coverage polygons indicating where vehicles can travel.

**Structure:**
```json
{
  "location_service_coverage": [{
    "uid": "P5J__y7YTFW6lXtzwPO6Wg",
    "type": "2D",                    // "1D" for aisles, "2D" for travel areas
    "exclusion": false,             // true = not travelable
    "geometry": {
      "shape": "POLYGON",
      "margin": 3000,
      "threshold": 1500,
      "points": [
        {"x": 565, "y": 99940},
        {"x": 565, "y": 108512},
        // ... more points
      ]
    },
    "sublocation_uid": "7WaetEwCQ1ymBtuozt3seQ"
  }]
}
```

**Usage:**
- **1D coverage** - Outlines entire aisle blocks (use for general reference, TDOA is primary)
- **2D coverage** - Travel lanes and open travelable areas
- **exclusion: true** - Blocked/non-travelable areas

### 1.5 nodes.json

**Purpose:** Contains all network nodes including anchors with MAC addresses.

**Structure:**
```json
{
  "nodes": [{
    "mac_address": "E4956EA4A181",   // Hex MAC address
    "node_id": 573,                   // Decimal ID
    "name": "e4956ea4a181",
    "node_type": "WIN",               // "WIN" = anchor, "TO" = tag
    "bridge_mac_address": "E4956EA025FF"
  }]
}
```

**Hex-to-Decimal Conversion:**
```typescript
// Node IDs are often in hex in some contexts
function hexToDecimal(hex: string): number {
  return parseInt(hex, 16);
}
```

### 1.6 zones.json (Import/Export Format)

**Purpose:** Standard format for loading and saving zone definitions.

**Structure:**
```json
{
  "zones": [{
    "name": "SRZ_17",
    "zone_id": 428,
    "active": true,
    "shape": "polygon",
    "zone_type": {
      "id": 29,
      "name": "speed_restriction",
      "display_name": "Speed restriction zone"
    },
    "zone_type_name": "speed_restriction",
    "zone_geometry": {
      "positions": [
        {"x": 298590, "y": 149509},
        {"x": 298590, "y": 162500},
        {"x": 306179, "y": 162500},
        {"x": 306179, "y": 149509}
      ]
    },
    "zone_mode": "ALWAYS_ACTIVE",
    "priority": 0,
    "sublocation_uid": "7WaetEwCQ1ymBtuozt3seQ",
    "project_uid": "Wq4j5Rw_RIqPOkqFBv7oUA"
  }]
}
```

**Zone Types (from zones.json):**
- `speed_restriction` - Speed limited areas
- `height_restriction` - Height restricted zones
- `keepout` (KOZ) - Keep-out zones
- Custom types as needed

---

## 2. Coordinate System

### 2.1 Reference Systems

1. **Real-World Coordinates (mm)** - Used in win_anchors.json, zones.json, coverage.json
2. **Image Pixels** - Used for rendering on canvas
3. **Floorplan Transform** - Defined in floorplans.json

### 2.2 Transform Pipeline

```
Real-World (mm) → Apply offset → Scale to pixels → Render on canvas
```

### 2.3 Implementation

```typescript
interface CoordinateTransformer {
  floorplan: FloorplanConfig;

  // Real-world mm to image pixels
  toPixels(point: {x: number, y: number}): Point;

  // Image pixels to real-world mm
  toMm(point: {x: number, y: number}): Point;

  // Transform entire polygon
  polygonToPixels(points: Point[]): Point[];
  polygonToMm(points: Point[]): Point[];
}
```

---

## 3. Web Viewer Rework

### 3.1 New Tab Structure

The viewer will have **3 tabs**:

| Tab | Name | Description |
|-----|------|-------------|
| 1 | **Pre-AI Zones** | Programmatic zone detection using TDOA + coverage data only |
| 2 | **Post-AI Zones** | AI-enhanced zone detection (existing functionality) |
| 3 | **Shortest Route** | Route calculator between two clicked points |

### 3.2 Global Toggle

Add a **checkbox at the top** of the interface:
- [ ] **Use AI Detection**
  - Checked: AI analysis available (existing functionality)
  - Unchecked: Pure programmatic detection using TDOA/coverage data

### 3.3 Tab 1: Pre-AI Zones (Programmatic)

**Data Sources:**
1. **1D TDOA pairs** (schedule.csv) → Individual aisle zones
2. **2D coverage polygons** (coverage.json) → Travel lane zones
3. **1D coverage polygons** (coverage.json) → Aisle block outlines (reference)

**Zone Generation Algorithm:**

```typescript
interface ProgrammaticZoneGenerator {
  // Load and parse all data files
  loadData(): Promise<void>;

  // Generate aisle zones from 1D TDOA pairs
  generateAisleZones(): Zone[];

  // Generate travel lane zones from 2D coverage
  generateTravelLaneZones(): Zone[];

  // Combine all generated zones
  generateAllZones(): Zone[];
}
```

**Aisle Zone Generation from 1D TDOA:**

```typescript
function generateAisleFromTDOA(
  pair: TDOAPair,
  anchors: Map<string, Anchor>
): Zone | null {
  const source = anchors.get(pair.Source);
  const dest = anchors.get(pair.Destination);

  if (!source || !dest) return null;

  // Create rectangle with:
  // - Length: distance from source to dest anchor
  // - Width: pair.Margin (perpendicular to line)

  const dx = dest.position.x - source.position.x;
  const dy = dest.position.y - source.position.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  // Perpendicular offset for width
  const halfWidth = pair.Margin / 2;
  const perpX = -Math.sin(angle) * halfWidth;
  const perpY = Math.cos(angle) * halfWidth;

  // Create 4 corners of rectangle
  const vertices = [
    { x: source.position.x + perpX, y: source.position.y + perpY },
    { x: source.position.x - perpX, y: source.position.y - perpY },
    { x: dest.position.x - perpX, y: dest.position.y - perpY },
    { x: dest.position.x + perpX, y: dest.position.y + perpY }
  ];

  return {
    id: `aisle_${pair.Slot}`,
    name: `Aisle ${pair.Slot}`,
    type: 'aisle_path',
    vertices: transformToPixels(vertices),
    confidence: 1.0,
    source: 'tdoa',
    metadata: {
      tdoaSlot: pair.Slot,
      sourceAnchor: pair.Source,
      destAnchor: pair.Destination,
      marginMm: pair.Margin,
      distanceMm: pair.Distance
    }
  };
}
```

### 3.4 Tab 2: Post-AI Zones

**Existing AI-based detection** with enhancements:
- Can use TDOA data as validation/hints
- Can compare AI results against programmatic baseline
- Retains all current Claude/OpenAI/Gemini functionality

### 3.5 Tab 3: Shortest Route Calculator

**User Interaction:**
1. User clicks **start point** on floorplan
2. User clicks **end point** on floorplan
3. System calculates and displays shortest path through travelable zones

**Algorithm:**

```typescript
interface RouteCalculator {
  // Build navigation graph from travelable zones
  buildGraph(zones: Zone[]): NavigationGraph;

  // Find shortest path using A* or Dijkstra
  findShortestPath(
    start: Point,
    end: Point,
    graph: NavigationGraph
  ): RoutePath;

  // Visualize route on canvas
  renderRoute(path: RoutePath): void;
}

interface NavigationGraph {
  nodes: GraphNode[];      // Centroids of travelable zones + intersection points
  edges: GraphEdge[];      // Connections between adjacent zones
}

interface RoutePath {
  points: Point[];         // Ordered list of waypoints
  totalDistance: number;   // Total path length in mm
  segments: PathSegment[]; // Individual segments with zone info
}
```

**Route Visualization:**
- Draw polyline connecting waypoints
- Highlight path with distinct color (e.g., green or blue)
- Show distance labels
- Animate direction indicators (optional)

---

## 4. Zone Import/Export

### 4.1 Load Zones from zones.json

```typescript
interface ZoneImporter {
  // Load zones.json file
  loadFromFile(file: File): Promise<void>;

  // Parse and transform coordinates
  parseZones(data: ZonesJson): Zone[];

  // Add to current project
  importZones(zones: Zone[], replace: boolean): void;
}

function importZone(zoneData: ZonesJsonZone): Zone {
  return {
    id: zoneData.uid || generateUUID(),
    name: zoneData.name,
    type: mapZoneType(zoneData.zone_type_name),
    vertices: transformToPixels(zoneData.zone_geometry.positions),
    confidence: null,
    source: 'imported',
    metadata: {
      zoneId: zoneData.zone_id,
      priority: zoneData.priority,
      zoneMode: zoneData.zone_mode,
      originalType: zoneData.zone_type
    }
  };
}
```

### 4.2 Save Zones to zones.json Format

```typescript
interface ZoneExporter {
  // Convert internal zones to zones.json format
  exportZones(zones: Zone[]): ZonesJson;

  // Download as file
  downloadAsJson(filename: string): void;
}

function exportZone(zone: Zone, projectUid: string, sublocationUid: string): ZonesJsonZone {
  return {
    name: zone.name,
    zone_id: zone.metadata?.zoneId || generateZoneId(),
    active: true,
    shape: "polygon",
    zone_type: {
      id: getZoneTypeId(zone.type),
      name: zone.type,
      display_name: getZoneTypeDisplayName(zone.type)
    },
    zone_type_name: zone.type,
    zone_geometry: {
      positions: transformToMm(zone.vertices)
    },
    zone_mode: zone.metadata?.zoneMode || "ALWAYS_ACTIVE",
    priority: zone.metadata?.priority || 0,
    sublocation_uid: sublocationUid,
    project_uid: projectUid,
    created_at: zone.createdAt,
    updated_at: new Date().toISOString()
  };
}
```

---

## 5. UI Components

### 5.1 File Upload Section

Add a new section for loading configuration files:

```
┌─────────────────────────────────────────────────┐
│ Configuration Files                              │
├─────────────────────────────────────────────────┤
│ Floorplan Config:  [Choose File] ✓ floorplans.json │
│ Anchors:           [Choose File] ✓ win_anchors.json│
│ TDOA Schedule:     [Choose File] ✓ schedule.csv    │
│ Coverage:          [Choose File] ✓ coverage.json   │
│ Zones (optional):  [Choose File] □ zones.json      │
│                                                    │
│ [Load All Files]  [Clear All]                     │
└─────────────────────────────────────────────────┘
```

### 5.2 Tab Bar

```
┌─────────────────────────────────────────────────────────────┐
│  [Pre-AI Zones]  [Post-AI Zones]  [Shortest Route]          │
├─────────────────────────────────────────────────────────────┤
│  [ ] Use AI Detection                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Pre-AI Zones Tab

```
┌─────────────────────────────────────────────────────────────┐
│ Programmatic Zone Detection                                  │
├─────────────────────────────────────────────────────────────┤
│ Sources:                                                     │
│   ☑ 1D TDOA Pairs (Aisles): 156 pairs loaded                │
│   ☑ 2D Coverage (Travel Lanes): 12 polygons loaded          │
│   ☐ 1D Coverage (Aisle Blocks): 8 polygons loaded           │
│                                                              │
│ [Generate Zones]  [Clear Generated]                         │
│                                                              │
│ Generated: 156 aisle zones, 12 travel lane zones            │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Shortest Route Tab

```
┌─────────────────────────────────────────────────────────────┐
│ Route Calculator                                             │
├─────────────────────────────────────────────────────────────┤
│ Instructions: Click two points on the map                   │
│                                                              │
│ Start Point:  (125.4m, 67.2m) ✓                            │
│ End Point:    Click on map...                               │
│                                                              │
│ [Calculate Route]  [Clear Route]                            │
│                                                              │
│ Route Distance: -- m                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Implementation Phases

### Phase 1: Data Infrastructure
1. Create TypeScript interfaces for all JSON/CSV formats
2. Implement file parsers (JSON, CSV)
3. Implement coordinate transformer (mm ↔ pixels)
4. Add file upload UI components
5. Store loaded data in Zustand store

### Phase 2: Programmatic Zone Generation
1. Implement 1D TDOA pair parsing
2. Implement aisle zone generation algorithm
3. Implement 2D coverage polygon parsing
4. Implement travel lane zone generation
5. Add "Pre-AI Zones" tab with generation controls

### Phase 3: Zone Import/Export
1. Implement zones.json parser
2. Implement zone importer with coordinate transform
3. Implement zone exporter to zones.json format
4. Add import/export UI buttons
5. Handle zone ID generation and metadata preservation

### Phase 4: Tab Navigation & UI
1. Add tab bar component
2. Implement tab switching logic
3. Add AI toggle checkbox
4. Connect tabs to appropriate zone sources
5. Update canvas to render based on active tab

### Phase 5: Shortest Route Calculator
1. Build navigation graph from travelable zones
2. Implement click-to-select start/end points
3. Implement A* or Dijkstra pathfinding
4. Implement route visualization on canvas
5. Add distance display and route clearing

### Phase 6: Integration & Testing
1. Integration tests for coordinate transforms
2. Integration tests for zone generation
3. End-to-end tests for import/export
4. Route calculation tests
5. UI/UX testing and refinements

---

## 7. File Structure Changes

```
src/
├── services/
│   ├── coordinateTransform.ts    # mm ↔ pixels conversion
│   ├── tdoaParser.ts             # Parse schedule.csv
│   ├── anchorParser.ts           # Parse win_anchors.json
│   ├── coverageParser.ts         # Parse coverage.json
│   ├── zoneImporter.ts           # Import zones.json
│   ├── zoneExporter.ts           # Export to zones.json format
│   └── routeCalculator.ts        # Shortest path algorithm
├── store/
│   ├── useProjectStore.ts        # Add: configData, activeTab
│   └── useConfigStore.ts         # NEW: Store for loaded config files
├── components/
│   ├── tabs/
│   │   ├── TabBar.tsx            # Tab navigation component
│   │   ├── PreAIZonesTab.tsx     # Programmatic zone generation
│   │   ├── PostAIZonesTab.tsx    # AI-based detection
│   │   └── ShortestRouteTab.tsx  # Route calculator
│   ├── config/
│   │   └── ConfigFileLoader.tsx  # File upload UI
│   └── canvas/
│       └── RouteOverlay.tsx      # Route path visualization
├── types/
│   ├── config.ts                 # Interfaces for all config files
│   └── route.ts                  # Route calculation types
└── utils/
    └── graphBuilder.ts           # Build navigation graph
```

---

## 8. Store Schema Updates

```typescript
interface ConfigStore {
  // Loaded configuration data
  floorplanConfig: FloorplanConfig | null;
  anchors: Map<string, Anchor>;
  tdoaPairs: TDOAPair[];
  coveragePolygons: CoveragePolygon[];

  // Loading state
  isLoading: boolean;
  loadErrors: string[];

  // Actions
  loadFloorplanConfig(data: any): void;
  loadAnchors(data: any): void;
  loadTDOAPairs(data: string): void;  // CSV string
  loadCoverage(data: any): void;
  clearAll(): void;
}

interface ProjectStore {
  // ... existing fields ...

  // New fields
  activeTab: 'pre-ai' | 'post-ai' | 'route';
  useAIDetection: boolean;

  // Pre-AI generated zones (separate from AI zones)
  programmaticZones: Zone[];

  // Route state
  routeStart: Point | null;
  routeEnd: Point | null;
  calculatedRoute: RoutePath | null;

  // Actions
  setActiveTab(tab: string): void;
  setUseAIDetection(enabled: boolean): void;
  generateProgrammaticZones(): void;
  setRoutePoint(point: Point, isStart: boolean): void;
  calculateRoute(): void;
  clearRoute(): void;
}
```

---

## 9. Testing Strategy

### Unit Tests
- Coordinate transform accuracy
- CSV parsing edge cases
- Aisle rectangle generation math
- Zone type mapping

### Integration Tests
- Full file loading pipeline
- Zone generation from TDOA pairs
- Import/export round-trip fidelity
- Route calculation correctness

### Visual Tests
- Zones render at correct positions
- Route displays correctly
- Tab switching preserves state

---

## 10. Migration Notes

### Backwards Compatibility
- Existing AI-based detection remains fully functional
- New features are additive, not replacing existing functionality
- Zone format internal to app remains unchanged

### Data File Location
- All config files placed in `docs/files/` directory
- Can be loaded via file picker or auto-loaded from default location

### Coordinate Precision
- All calculations done in millimeters internally
- Pixel rounding only at render time
- Preserve full precision in exports
