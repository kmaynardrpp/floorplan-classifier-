# Floorplan Zone Editor

AI-powered floorplan zone classification and editing tool. Upload floorplan images, analyze them with Claude AI to detect zones (aisles, parking, loading docks, etc.), and interactively edit the detected polygons.

## Stack

- **Frontend**: React 19 + TypeScript (strict mode)
- **Canvas**: Konva.js for polygon manipulation
- **State**: Zustand + Immer
- **Styling**: Tailwind CSS 4
- **Build**: Vite 7
- **Testing**: Vitest + Testing Library
- **AI**: Claude API (Opus for main detection, Sonnet for sub-agents)

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Run tests
npm run build    # Production build
```

## Project Structure

```
src/
├── components/   # React components (canvas, layout, upload, settings, panel)
├── hooks/        # useAnalysis, useAgenticAnalysis, useKeyboardShortcuts
├── services/     # Claude API client, sub-agent API, retry logic, caching
├── store/        # Zustand stores (project state, settings)
├── types/        # TypeScript interfaces (Zone, Store)
└── utils/        # File validation, image compression, zone colors, geometry
```

## Key Files

| File | Purpose |
|------|---------|
| `src/store/useProjectStore.ts` | Main state: image, viewport, zones, selection, tabs, route |
| `src/services/claudeApi.ts` | Claude API integration for coarse detection |
| `src/services/subAgentApi.ts` | Sub-agent API for racking area analysis |
| `src/services/routeCalculator.ts` | A* pathfinding through travelable zones |
| `src/hooks/useAgenticAnalysis.ts` | Multi-agent analysis orchestration |
| `src/hooks/useRouteCalculator.ts` | Route calculation hook |
| `src/components/canvas/ZoneOverlayLayer.tsx` | Zone polygon rendering with travelability indicators |
| `src/components/canvas/RouteOverlay.tsx` | Route path visualization |
| `src/utils/graphBuilder.ts` | Navigation graph from travelable zones |
| `src/utils/zoneAdjacency.ts` | Zone adjacency detection |
| `src/utils/imageCompression.ts` | Compress images for API (5MB limit) |
| `src/utils/zoneHierarchy.ts` | Zone tree building and filtering |

## Claude API Limits

- **5MB** max file size per image
- **8000px** max dimension
- Compression auto-applied for large images (targets 3MB, max 4000px)

## Multi-Agent Analysis

The system uses a two-phase multi-agent architecture for detailed zone detection:

### Phase 1: Coarse Detection (Main Agent - Opus)
- Identifies all major zones: travel lanes, parking lots, docking areas, administrative areas
- Detects `racking_area` zones that need detailed subdivision
- Flags zones with `needsSubdivision: true` for further processing

### Phase 2: Sub-Agent Analysis (Sonnet)
- Analyzes each `racking_area` with cropped region images
- Identifies `aisle_path` (travelable) and `racking` (non-travelable) zones
- Detects aisle direction (horizontal/vertical)
- Coordinates transformed back to full image space

### Zone Types and Travelability

**Travelable Zones** (robots/forklifts can traverse):
- `travel_lane` - Main corridors
- `aisle_path` - Paths between racking rows
- `parking_lot` - Vehicle parking areas

**Non-Travelable Zones** (blocked areas):
- `racking` - Physical shelving units
- `racking_area` - Container for racking/aisle zones
- `docking_area` - Loading docks
- `conveyor_area` - Conveyor systems
- `administrative` - Office areas
- `storage_floor` - General storage

### Zone Hierarchy

Zones can have parent-child relationships:
- `racking_area` zones contain child `aisle_path` and `racking` zones
- Use `parentZoneId` in customProperties to link children to parents
- Zone Panel displays hierarchical tree view
- Filter by travelability (All / Travelable / Blocked)

## Canvas Rendering

- Travelable zones: Solid fill, higher opacity
- Non-travelable zones: Hatched pattern, dashed stroke
- Direction indicators: Arrows showing aisle orientation
- Hover badges: Show travelability status

## Tab Navigation

The application has three tabs:

1. **Pre-AI Zones** - Programmatic zone generation from TDOA data
2. **Post-AI Zones** - AI-detected zones with Claude analysis
3. **Shortest Route** - A* pathfinding between two clicked points

## Route Calculator

Click two points on the map to calculate shortest path through travelable zones:
- First click sets start point (green "A" marker)
- Second click sets end point (red "B" marker)
- Third click resets and sets new start
- Route displayed as blue dashed line with direction arrows
- Uses A* algorithm with navigation graph built from zone centroids

## Zone Import/Export

Export zones to `zones.json` format for use with other systems:
- Coordinates transformed from pixels to mm using floorplan config
- Zone types mapped to standard format
- Unique IDs generated for each zone

Import existing zones from `zones.json`:
- Coordinates transformed from mm back to pixels
- Supports merge or replace modes

## Current Status

All implementation complete:
- TDOA-based programmatic zone generation (Sprint 1-2)
- Zone import/export in zones.json format (Sprint 3)
- 3-tab interface with AI toggle (Sprint 4)
- Shortest route calculator with A* pathfinding (Sprint 5)
- Integration tests and polish (Sprint 6)

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
For agentic analysis spec, see [docs/tuning-spec.md](docs/tuning-spec.md).
For TDOA zone detection spec, see [docs/new-technique.md](docs/new-technique.md).
