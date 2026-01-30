# Agentic Zone Detection Tuning Specification

**Version:** 1.0
**Date:** January 23, 2026
**Purpose:** Improve zone classification accuracy using multi-agent analysis with focused sub-region processing

---

## 1. Problem Statement

### 1.1 Current Limitations
The single-pass Claude analysis struggles to:
- Distinguish between **travelable aisles** (walkable paths between racking) and **physical racking** (non-travelable metal shelving)
- Accurately detect **travel lanes** vs general open space
- Identify **racking orientation** (horizontal vs vertical)
- Parse dense visual patterns in racking areas

### 1.2 Core Objective
Accurately classify **travelable areas** for routing purposes:

| Travelable | Non-Travelable |
|------------|----------------|
| Travel lanes | Racking (metal shelving) |
| Aisle paths (between racking) | Conveyor equipment |
| Parking lots | Docking bays |
| | Administrative areas |
| | Storage floor cells |

---

## 2. Visual Pattern Recognition Guide

### 2.1 Zone Type Visual Signatures

#### Travel Lanes
```
Visual Pattern: Pure white/blank areas forming path-like structures
Characteristics:
  - Wide, continuous white corridors
  - No internal markings or lines
  - Often run along warehouse perimeter
  - Connect major areas (docks to racking, etc.)
  - Typically 8-15ft wide in real scale
```

#### Racking Areas (contains aisles + physical racking)
```
Visual Pattern: Dense parallel lines with regular white gaps
Characteristics:
  - Repeating horizontal OR vertical black lines
  - Consistent spacing between lines
  - White gaps between line groups = aisle paths
  - Non-rectangular shapes common (L-shaped, jutted edges)
  - Lines represent shelf uprights viewed from above
```

#### Aisle Paths (within racking)
```
Visual Pattern: White gaps/corridors BETWEEN dense line groups
Characteristics:
  - Narrower than travel lanes (typically 4-8ft)
  - Bounded by racking lines on both sides
  - Run perpendicular to racking line direction
  - May have forklift access points
```

#### Parking Lots
```
Visual Pattern: Open areas with forklift/vehicle icons
Characteristics:
  - Small forklift drawings/symbols inside area
  - Rectangular or irregular boundaries
  - Near docking areas or racking zones
  - May have numbered parking spots
```

#### Conveyor Belt Areas
```
Visual Pattern: Thin curvy/wiggly lines with open space
Characteristics:
  - Single or double thin lines (not dense like racking)
  - Often curved or serpentine paths
  - Surrounded by open/empty space
  - May connect processing areas
```

#### Docking Areas
```
Visual Pattern: Lines extending OUTSIDE warehouse boundary
Characteristics:
  - Rectangular bays at warehouse edge
  - Lines/markings extending beyond image boundary
  - Often on one side of building
  - Numbered dock doors common
```

#### Administrative Areas
```
Visual Pattern: Office-like floor plan patterns
Characteristics:
  - Small rectangular rooms
  - Corridor patterns
  - Text labels (office, break room, etc.)
  - Different visual style from warehouse floor
```

#### Storage Floor
```
Visual Pattern: Large cells with sparse markings
Characteristics:
  - Grid-like division into cells/bays
  - Non-dense lines (just boundaries)
  - Open interior per cell
  - May have alphanumeric labels
```

---

## 3. Multi-Agent Architecture

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      MAIN AGENT (Opus/Sonnet)                       │
│  ─────────────────────────────────────────────────────────────────  │
│  1. Analyze full image for coarse zone detection                    │
│  2. Identify "racking_area" zones that need subdivision             │
│  3. Dispatch sub-agents for detailed analysis                       │
│  4. Merge sub-agent results into final zone set                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  SUB-AGENT 1     │ │  SUB-AGENT 2     │ │  SUB-AGENT N     │
│  (Sonnet)        │ │  (Sonnet)        │ │  (Sonnet)        │
│  ──────────────  │ │  ──────────────  │ │  ──────────────  │
│  Cropped Region  │ │  Cropped Region  │ │  Cropped Region  │
│  Racking Area A  │ │  Racking Area B  │ │  Racking Area N  │
│                  │ │                  │ │                  │
│  Output:         │ │  Output:         │ │  Output:         │
│  - aisle_path    │ │  - aisle_path    │ │  - aisle_path    │
│  - racking       │ │  - racking       │ │  - racking       │
│  - direction     │ │  - direction     │ │  - direction     │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### 3.2 Phase 1: Coarse Detection (Main Agent)

**Input:** Full floorplan image
**Output:** Coarse zone boundaries with `needs_subdivision` flag

```typescript
interface CoarseZone {
  id: string
  name: string
  type: CoarseZoneType
  vertices: Point[]
  confidence: number
  needsSubdivision: boolean  // true for racking_area
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

type CoarseZoneType =
  | 'travel_lane'
  | 'racking_area'      // Parent zone - will be subdivided
  | 'parking_lot'
  | 'conveyor_area'
  | 'docking_area'
  | 'administrative'
  | 'storage_floor'
  | 'open_floor'
```

**Main Agent Prompt Addition:**
```
For racking areas (zones with dense parallel lines), mark them as
"racking_area" type and set needsSubdivision: true. Do NOT attempt
to identify individual aisles within racking areas - a specialized
sub-agent will handle that.

Racking areas are identified by:
- Dense parallel lines (black) with white gaps between groups
- Lines can be horizontal OR vertical
- The overall shape may be irregular (L-shaped, with juts)
```

### 3.3 Phase 2: Detailed Analysis (Sub-Agents)

**Input:** Cropped image region of a single `racking_area`
**Output:** Subdivided polygons with travelability classification

#### 3.3.1 Sub-Agent Input Preparation

```typescript
interface SubAgentInput {
  // Cropped image data URL (just the racking_area region)
  croppedImageDataUrl: string

  // Dimensions of the cropped region
  cropWidth: number
  cropHeight: number

  // Original position for coordinate mapping
  originalOffset: {
    x: number
    y: number
  }

  // Parent zone ID for result linking
  parentZoneId: string
}
```

**Cropping Logic:**
```typescript
function prepareSubAgentInput(
  fullImageDataUrl: string,
  zone: CoarseZone
): SubAgentInput {
  // Add padding around bounding box (10% on each side)
  const padding = 0.1
  const paddedBox = {
    x: zone.boundingBox.x - (zone.boundingBox.width * padding),
    y: zone.boundingBox.y - (zone.boundingBox.height * padding),
    width: zone.boundingBox.width * (1 + padding * 2),
    height: zone.boundingBox.height * (1 + padding * 2)
  }

  // Crop image using canvas
  const croppedDataUrl = cropImage(fullImageDataUrl, paddedBox)

  return {
    croppedImageDataUrl: croppedDataUrl,
    cropWidth: paddedBox.width,
    cropHeight: paddedBox.height,
    originalOffset: { x: paddedBox.x, y: paddedBox.y },
    parentZoneId: zone.id
  }
}
```

#### 3.3.2 Sub-Agent Prompt

```typescript
const SUBAGENT_RACKING_ANALYSIS_PROMPT = `
You are analyzing a cropped section of a warehouse floorplan that contains
racking (shelving) and aisles. Your task is to identify:

1. **Aisle Paths** (travelable): The white corridors BETWEEN rows of racking
   where forklifts and workers can travel.

2. **Racking** (non-travelable): The dense parallel lines representing
   physical metal shelving units.

3. **Racking Direction**: Determine if the racking lines run primarily
   HORIZONTAL or VERTICAL in this section.

## Visual Identification Guide

AISLE PATHS look like:
- White/empty corridors running through the racking
- Bounded by dense line groups on both sides
- Typically consistent width throughout
- Run PERPENDICULAR to the racking line direction

RACKING looks like:
- Dense groups of parallel black lines
- Regular spacing between individual lines
- May have subtle internal structure (shelf levels)
- Forms the "walls" that define aisle boundaries

## Output Format

The cropped image is {width}px wide and {height}px tall.
Return ONLY valid JSON:

{
  "direction": "horizontal" | "vertical",
  "subdivisions": [
    {
      "type": "aisle_path",
      "name": "Aisle 1",
      "vertices": [{"x": 10, "y": 20}, ...],
      "confidence": 0.9,
      "travelable": true
    },
    {
      "type": "racking",
      "name": "Rack Row A",
      "vertices": [{"x": 50, "y": 20}, ...],
      "confidence": 0.85,
      "travelable": false
    }
  ],
  "analysisNotes": "Optional observations"
}

## Important Rules

1. Coordinates must be relative to THIS cropped image (0 to {width}, 0 to {height})
2. Every pixel in the racking area should belong to either aisle_path or racking
3. Direction should be the SINGLE dominant orientation (horizontal OR vertical)
4. Polygons should be simple (no self-intersections)
5. Minimum 3 vertices per polygon
`
```

#### 3.3.3 Sub-Agent Output Schema

```typescript
interface SubAgentOutput {
  // Single dominant direction for this zone
  direction: 'horizontal' | 'vertical'

  // Subdivided polygons (in cropped image coordinates)
  subdivisions: SubdividedZone[]

  // Optional analysis notes
  analysisNotes?: string
}

interface SubdividedZone {
  type: 'aisle_path' | 'racking'
  name: string
  vertices: Point[]  // Coordinates relative to cropped image
  confidence: number
  travelable: boolean
}
```

### 3.4 Phase 3: Result Merging

**Transform sub-agent coordinates back to full image space:**

```typescript
function mergeSubAgentResults(
  parentZone: CoarseZone,
  subAgentInput: SubAgentInput,
  subAgentOutput: SubAgentOutput
): Zone[] {
  return subAgentOutput.subdivisions.map((sub, index) => {
    // Transform coordinates from cropped to full image space
    const transformedVertices = sub.vertices.map(v => ({
      x: v.x + subAgentInput.originalOffset.x,
      y: v.y + subAgentInput.originalOffset.y
    }))

    return createZone({
      id: crypto.randomUUID(),
      name: sub.name,
      type: sub.type,
      vertices: transformedVertices,
      confidence: sub.confidence,
      source: 'ai',
      metadata: {
        ...DEFAULT_ZONE_METADATA,
        customProperties: {
          parentZoneId: parentZone.id,
          direction: subAgentOutput.direction,
          travelable: String(sub.travelable)
        }
      }
    })
  })
}
```

---

## 4. Updated Zone Type Definitions

### 4.1 Extended Zone Types

```typescript
export const EXTENDED_ZONE_TYPES = [
  // Travelable zones
  'travel_lane',      // Wide white corridors
  'aisle_path',       // Narrow paths between racking (NEW)
  'parking_lot',      // Forklift parking areas

  // Non-travelable zones
  'racking',          // Physical shelving units (NEW)
  'racking_area',     // Parent zone before subdivision (NEW)
  'conveyor_area',    // Conveyor equipment zones
  'docking_area',     // Loading dock bays
  'administrative',   // Office/admin areas
  'storage_floor',    // Bulk storage cells

  // Existing types retained
  'open_floor',
  'intersection',
  'restricted',
  'pick_area',
  'drop_area',
  'staging_area',
  'charging_station',
  'hazard_zone',
] as const

export const TRAVELABLE_ZONE_TYPES = [
  'travel_lane',
  'aisle_path',
  'parking_lot',
] as const

export function isTravelable(zoneType: string): boolean {
  return TRAVELABLE_ZONE_TYPES.includes(zoneType as any)
}
```

### 4.2 Zone Metadata Extensions

```typescript
interface ExtendedZoneMetadata extends ZoneMetadata {
  customProperties: {
    // For aisle_path and racking zones
    parentZoneId?: string       // Link to parent racking_area
    direction?: 'horizontal' | 'vertical'
    travelable?: 'true' | 'false'

    // Generic custom properties
    [key: string]: string | undefined
  }
}
```

---

## 5. Implementation Plan

### 5.1 New Files to Create

| File | Purpose |
|------|---------|
| `src/services/subAgentApi.ts` | Sub-agent API calls for region analysis |
| `src/services/imageCropper.ts` | Utility for cropping image regions |
| `src/services/coordinateTransform.ts` | Coordinate transformation utilities |
| `src/hooks/useAgenticAnalysis.ts` | Orchestration hook for multi-agent flow |

### 5.2 Files to Modify

| File | Changes |
|------|---------|
| `src/types/zone.ts` | Add new zone types, travelability helpers |
| `src/services/claudeApi.ts` | Update prompt for coarse detection |
| `src/hooks/useAnalysis.ts` | Integrate agentic analysis flow |
| `src/utils/zoneColors.ts` | Add colors for new zone types |

### 5.3 Processing Flow

```typescript
async function analyzeFloorplanAgentic(
  imageDataUrl: string,
  apiKey: string,
  imageWidth: number,
  imageHeight: number,
  onProgress?: (stage: string, progress: number) => void
): Promise<Zone[]> {
  // Phase 1: Coarse detection
  onProgress?.('Detecting zones...', 0.1)
  const coarseZones = await analyzeCoarse(imageDataUrl, apiKey, imageWidth, imageHeight)

  // Phase 2: Identify zones needing subdivision
  const zonesToSubdivide = coarseZones.filter(z => z.needsSubdivision)
  const finalZones: Zone[] = coarseZones.filter(z => !z.needsSubdivision)

  // Phase 3: Parallel sub-agent analysis
  onProgress?.('Analyzing racking areas...', 0.3)
  const subAgentPromises = zonesToSubdivide.map(async (zone, i) => {
    const input = prepareSubAgentInput(imageDataUrl, zone)
    const output = await analyzeRackingRegion(input, apiKey)
    onProgress?.(`Analyzing racking areas...`, 0.3 + (0.6 * (i + 1) / zonesToSubdivide.length))
    return mergeSubAgentResults(zone, input, output)
  })

  const subdivisionResults = await Promise.all(subAgentPromises)

  // Phase 4: Merge all results
  onProgress?.('Finalizing...', 0.95)
  finalZones.push(...subdivisionResults.flat())

  return finalZones
}
```

---

## 6. Quality Assurance

### 6.1 Validation Rules

```typescript
interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function validateSubAgentOutput(output: SubAgentOutput): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Must have at least one subdivision
  if (output.subdivisions.length === 0) {
    errors.push('No subdivisions returned')
  }

  // Direction must be valid
  if (!['horizontal', 'vertical'].includes(output.direction)) {
    errors.push('Invalid direction value')
  }

  // Each subdivision must have valid vertices
  output.subdivisions.forEach((sub, i) => {
    if (sub.vertices.length < 3) {
      errors.push(`Subdivision ${i} has fewer than 3 vertices`)
    }
    if (sub.confidence < 0 || sub.confidence > 1) {
      warnings.push(`Subdivision ${i} has invalid confidence`)
    }
  })

  // Should have both aisle_path and racking types
  const types = new Set(output.subdivisions.map(s => s.type))
  if (!types.has('aisle_path')) {
    warnings.push('No aisle_path zones detected')
  }
  if (!types.has('racking')) {
    warnings.push('No racking zones detected')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
```

### 6.2 Fallback Behavior

If sub-agent analysis fails or returns invalid results:
1. Log warning with details
2. Keep parent `racking_area` zone as-is
3. Mark zone with `subdivisionFailed: true` in metadata
4. Allow manual editing to fix

---

## 7. Frontend Display Specifications

### 7.1 Progress Indication

```
┌─────────────────────────────────────────────┐
│  Analyzing Floorplan                        │
│  ═══════════════════════════════░░░░░░░░░   │
│                                             │
│  ✓ Detecting zones                          │
│  → Analyzing racking area 2 of 5...         │
│  ○ Finalizing                               │
└─────────────────────────────────────────────┘
```

### 7.2 Zone Hierarchy Display

```
Zone Panel
──────────
▾ Racking Area A
  ├─ Aisle Path 1  [→ horizontal]
  ├─ Racking Row 1
  ├─ Aisle Path 2  [→ horizontal]
  └─ Racking Row 2
▾ Racking Area B
  ├─ Aisle Path 3  [↓ vertical]
  └─ Racking Row 3
Travel Lane 1
Parking Lot 1
```

### 7.3 New Zone Colors

```css
/* Add to color palette */
--color-aisle-path: #00E676;    /* Bright green - clearly travelable */
--color-racking: #B0BEC5;       /* Gray - non-travelable */
--color-racking-area: #78909C;  /* Darker gray - parent container */
--color-travel-lane: #2196F3;   /* Blue - major corridors */
--color-conveyor-area: #FF9800; /* Orange - equipment zones */
```

### 7.4 Canvas Rendering Updates

#### 7.4.1 Travelable Zone Styling

```typescript
// src/utils/zoneStyles.ts

interface ZoneRenderStyle {
  fill: string
  stroke: string
  strokeWidth: number
  strokeDash: number[]
  opacity: number
  pattern?: 'solid' | 'hatched' | 'dotted'
}

export function getZoneStyle(zone: Zone): ZoneRenderStyle {
  const isTravelableZone = isTravelable(zone.type)
  const baseColor = getZoneColor(zone.type)

  if (isTravelableZone) {
    return {
      fill: baseColor,
      stroke: darken(baseColor, 0.2),
      strokeWidth: 2,
      strokeDash: [],
      opacity: 0.4,
      pattern: 'solid'
    }
  } else {
    // Non-travelable zones get hatched pattern
    return {
      fill: baseColor,
      stroke: darken(baseColor, 0.3),
      strokeWidth: 1,
      strokeDash: [4, 4],
      opacity: 0.3,
      pattern: 'hatched'
    }
  }
}
```

#### 7.4.2 Zone Overlay Layer Updates

```typescript
// Updates to src/components/canvas/ZoneOverlayLayer.tsx

interface ZonePolygonProps {
  zone: Zone
  isSelected: boolean
  isHovered: boolean
}

function ZonePolygon({ zone, isSelected, isHovered }: ZonePolygonProps) {
  const style = getZoneStyle(zone)
  const travelable = isTravelable(zone.type)

  return (
    <Group>
      {/* Main fill */}
      <Line
        points={flattenVertices(zone.vertices)}
        closed
        fill={style.fill}
        opacity={style.opacity}
        stroke={style.stroke}
        strokeWidth={isSelected ? 3 : style.strokeWidth}
        dash={style.strokeDash}
      />

      {/* Hatched pattern for non-travelable zones */}
      {!travelable && (
        <HatchPattern
          vertices={zone.vertices}
          color={style.stroke}
          spacing={8}
          angle={zone.metadata.customProperties.direction === 'vertical' ? 0 : 90}
        />
      )}

      {/* Direction indicator for aisle/racking zones */}
      {zone.metadata.customProperties.direction && (
        <DirectionIndicator
          zone={zone}
          direction={zone.metadata.customProperties.direction}
        />
      )}

      {/* Travelable badge */}
      {isHovered && (
        <TravelableBadge
          position={getCentroid(zone.vertices)}
          travelable={travelable}
        />
      )}
    </Group>
  )
}
```

#### 7.4.3 Direction Indicator Component

```typescript
// src/components/canvas/DirectionIndicator.tsx

interface DirectionIndicatorProps {
  zone: Zone
  direction: 'horizontal' | 'vertical'
}

function DirectionIndicator({ zone, direction }: DirectionIndicatorProps) {
  const centroid = getCentroid(zone.vertices)
  const arrowLength = 20
  const arrowColor = '#333'

  // Arrow points in direction of travel (perpendicular to racking lines)
  const angle = direction === 'horizontal' ? 0 : 90

  return (
    <Arrow
      x={centroid.x}
      y={centroid.y}
      points={[
        -arrowLength / 2, 0,
        arrowLength / 2, 0
      ]}
      rotation={angle}
      fill={arrowColor}
      stroke={arrowColor}
      strokeWidth={2}
      pointerLength={6}
      pointerWidth={6}
    />
  )
}
```

### 7.5 Zone Panel Enhancements

#### 7.5.1 Hierarchical Zone List

```typescript
// src/components/layout/ZonePanel.tsx

interface ZoneTreeNode {
  zone: Zone
  children: ZoneTreeNode[]
  isExpanded: boolean
}

function buildZoneTree(zones: Zone[]): ZoneTreeNode[] {
  const parentZones = zones.filter(z =>
    !z.metadata.customProperties.parentZoneId
  )

  return parentZones.map(parent => ({
    zone: parent,
    children: zones
      .filter(z => z.metadata.customProperties.parentZoneId === parent.id)
      .map(child => ({ zone: child, children: [], isExpanded: true })),
    isExpanded: true
  }))
}

function ZoneTreeItem({ node, depth = 0 }: { node: ZoneTreeNode; depth?: number }) {
  const { zone, children, isExpanded } = node
  const travelable = isTravelable(zone.type)

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="zone-item">
        {/* Expand/collapse toggle */}
        {children.length > 0 && (
          <button onClick={() => toggleExpand(zone.id)}>
            {isExpanded ? '▾' : '▸'}
          </button>
        )}

        {/* Zone color chip */}
        <span
          className="color-chip"
          style={{ backgroundColor: getZoneColor(zone.type) }}
        />

        {/* Zone name */}
        <span className="zone-name">{zone.name}</span>

        {/* Travelable indicator */}
        <span className={`travel-badge ${travelable ? 'travelable' : 'blocked'}`}>
          {travelable ? '✓' : '✕'}
        </span>

        {/* Direction badge for racking-related zones */}
        {zone.metadata.customProperties.direction && (
          <span className="direction-badge">
            {zone.metadata.customProperties.direction === 'horizontal' ? '→' : '↓'}
          </span>
        )}
      </div>

      {/* Child zones */}
      {isExpanded && children.map(child => (
        <ZoneTreeItem key={child.zone.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}
```

#### 7.5.2 Travelability Filter

```typescript
// Add to zone filter options

type TravelabilityFilter = 'all' | 'travelable' | 'non-travelable'

function filterZonesByTravelability(
  zones: Zone[],
  filter: TravelabilityFilter
): Zone[] {
  switch (filter) {
    case 'travelable':
      return zones.filter(z => isTravelable(z.type))
    case 'non-travelable':
      return zones.filter(z => !isTravelable(z.type))
    default:
      return zones
  }
}
```

### 7.6 Zone Properties Panel Updates

```typescript
// src/components/layout/ZonePropertiesPanel.tsx

function ZonePropertiesPanel({ zone }: { zone: Zone }) {
  const travelable = isTravelable(zone.type)
  const direction = zone.metadata.customProperties.direction
  const parentId = zone.metadata.customProperties.parentZoneId

  return (
    <div className="properties-panel">
      <h3>{zone.name}</h3>

      {/* Type badge with travelability */}
      <div className="type-row">
        <span className="type-label">{zone.type}</span>
        <span className={`travel-indicator ${travelable ? 'yes' : 'no'}`}>
          {travelable ? 'Travelable' : 'Non-travelable'}
        </span>
      </div>

      {/* Direction (for racking-related zones) */}
      {direction && (
        <div className="property-row">
          <label>Direction:</label>
          <span>{direction === 'horizontal' ? 'Horizontal →' : 'Vertical ↓'}</span>
        </div>
      )}

      {/* Parent zone link */}
      {parentId && (
        <div className="property-row">
          <label>Parent Zone:</label>
          <button onClick={() => selectZone(parentId)}>
            View Parent
          </button>
        </div>
      )}

      {/* Confidence score */}
      {zone.confidence !== null && (
        <div className="property-row">
          <label>AI Confidence:</label>
          <span>{Math.round(zone.confidence * 100)}%</span>
        </div>
      )}

      {/* Source indicator */}
      <div className="property-row">
        <label>Source:</label>
        <span>{zone.source === 'ai' ? 'AI Detected' : 'Manual'}</span>
      </div>
    </div>
  )
}
```

### 7.7 Routing Visualization (Future Enhancement)

```typescript
// Preview of routing path visualization

interface TravelPathProps {
  zones: Zone[]
  showConnections: boolean
}

function TravelPathOverlay({ zones, showConnections }: TravelPathProps) {
  const travelableZones = zones.filter(z => isTravelable(z.type))

  // Calculate centroids for connection lines
  const centroids = travelableZones.map(z => ({
    zoneId: z.id,
    point: getCentroid(z.vertices)
  }))

  // Find adjacent travelable zones (simplified)
  const connections = findAdjacentZones(travelableZones)

  return (
    <Layer>
      {/* Highlight travelable area boundaries */}
      {travelableZones.map(zone => (
        <Line
          key={zone.id}
          points={flattenVertices(zone.vertices)}
          closed
          stroke="#00E676"
          strokeWidth={3}
          dash={[]}
          listening={false}
        />
      ))}

      {/* Show connections between adjacent travelable zones */}
      {showConnections && connections.map(([z1, z2], i) => (
        <Line
          key={i}
          points={[
            centroids.find(c => c.zoneId === z1.id)!.point.x,
            centroids.find(c => c.zoneId === z1.id)!.point.y,
            centroids.find(c => c.zoneId === z2.id)!.point.x,
            centroids.find(c => c.zoneId === z2.id)!.point.y,
          ]}
          stroke="#4CAF50"
          strokeWidth={2}
          dash={[5, 5]}
          opacity={0.6}
        />
      ))}
    </Layer>
  )
}
```

### 7.8 Store Updates for Hierarchy

```typescript
// Updates to src/store/useProjectStore.ts

interface ProjectState {
  // ... existing fields ...

  // New: Zone hierarchy tracking
  expandedZoneIds: Set<string>

  // New: Travelability filter
  travelabilityFilter: 'all' | 'travelable' | 'non-travelable'
}

interface ProjectActions {
  // ... existing actions ...

  // New: Hierarchy actions
  toggleZoneExpanded: (zoneId: string) => void
  expandAllZones: () => void
  collapseAllZones: () => void

  // New: Filter actions
  setTravelabilityFilter: (filter: 'all' | 'travelable' | 'non-travelable') => void

  // New: Get child zones
  getChildZones: (parentId: string) => Zone[]
}
```

### 7.9 CSS Styles

```css
/* src/styles/zones.css */

/* Travelable badge */
.travel-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.travel-badge.travelable {
  background-color: #E8F5E9;
  color: #2E7D32;
}

.travel-badge.blocked {
  background-color: #FFEBEE;
  color: #C62828;
}

/* Direction badge */
.direction-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #E3F2FD;
  color: #1565C0;
  font-size: 12px;
  margin-left: 4px;
}

/* Zone tree hierarchy */
.zone-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.zone-item:hover {
  background-color: #F5F5F5;
}

.zone-item.selected {
  background-color: #E3F2FD;
}

.color-chip {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Hatched pattern overlay for non-travelable zones */
.hatch-pattern {
  pointer-events: none;
}

/* Travel indicator in properties panel */
.travel-indicator {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.travel-indicator.yes {
  background-color: #C8E6C9;
  color: #1B5E20;
}

.travel-indicator.no {
  background-color: #FFCDD2;
  color: #B71C1C;
}
```

---

## 8. API Cost Estimation (Updated)

| Scenario | Main Agent | Sub-Agents | Total Est. |
|----------|------------|------------|------------|
| Simple (2 racking areas) | ~$0.15 | 2 × ~$0.05 | ~$0.25 |
| Medium (5 racking areas) | ~$0.15 | 5 × ~$0.05 | ~$0.40 |
| Complex (10 racking areas) | ~$0.15 | 10 × ~$0.05 | ~$0.65 |

*Sub-agents use Sonnet (cheaper) and receive smaller cropped images.*

---

## 9. Testing Scenarios

### 9.1 Visual Pattern Tests

```typescript
describe('Racking Pattern Detection', () => {
  it('should detect horizontal racking (lines run left-right)')
  it('should detect vertical racking (lines run top-bottom)')
  it('should identify aisle paths between racking rows')
  it('should handle L-shaped racking areas')
  it('should handle irregular racking boundaries')
})

describe('Travel Lane Detection', () => {
  it('should identify wide white corridors as travel lanes')
  it('should distinguish travel lanes from aisle paths by width')
  it('should not classify racking gaps as travel lanes')
})

describe('Travelability Classification', () => {
  it('should mark aisle_path as travelable')
  it('should mark racking as non-travelable')
  it('should mark travel_lane as travelable')
  it('should mark parking_lot as travelable')
})
```

### 9.2 Integration Tests

```typescript
describe('Multi-Agent Flow', () => {
  it('should complete coarse detection before sub-agent dispatch')
  it('should correctly crop images for sub-agents')
  it('should transform coordinates back to full image space')
  it('should handle sub-agent failures gracefully')
  it('should merge results maintaining zone hierarchy')
})
```

---

## Appendix A: Example Floorplan Analysis

### Input
```
[Large warehouse floorplan image]
- 3 distinct racking sections
- 2 travel lanes
- 1 parking area
- 1 docking bay
```

### Phase 1 Output (Coarse)
```json
{
  "zones": [
    {"type": "racking_area", "needsSubdivision": true, "id": "ra-1"},
    {"type": "racking_area", "needsSubdivision": true, "id": "ra-2"},
    {"type": "racking_area", "needsSubdivision": true, "id": "ra-3"},
    {"type": "travel_lane", "needsSubdivision": false, "id": "tl-1"},
    {"type": "travel_lane", "needsSubdivision": false, "id": "tl-2"},
    {"type": "parking_lot", "needsSubdivision": false, "id": "pk-1"},
    {"type": "docking_area", "needsSubdivision": false, "id": "dk-1"}
  ]
}
```

### Phase 2 Output (Sub-Agent for ra-1)
```json
{
  "direction": "horizontal",
  "subdivisions": [
    {"type": "aisle_path", "name": "Aisle A1", "travelable": true},
    {"type": "racking", "name": "Rack Row 1", "travelable": false},
    {"type": "aisle_path", "name": "Aisle A2", "travelable": true},
    {"type": "racking", "name": "Rack Row 2", "travelable": false},
    {"type": "aisle_path", "name": "Aisle A3", "travelable": true}
  ]
}
```

### Final Output
```json
{
  "zones": [
    {"type": "aisle_path", "name": "Aisle A1", "travelable": true, "direction": "horizontal"},
    {"type": "racking", "name": "Rack Row 1", "travelable": false, "direction": "horizontal"},
    // ... more from ra-1 ...
    // ... subdivisions from ra-2, ra-3 ...
    {"type": "travel_lane", "name": "Main Corridor", "travelable": true},
    {"type": "travel_lane", "name": "South Corridor", "travelable": true},
    {"type": "parking_lot", "name": "Forklift Parking", "travelable": true},
    {"type": "docking_area", "name": "Dock Bay A", "travelable": false}
  ]
}
```

---

**Document Status:** Draft
**Last Updated:** January 23, 2026
**Author:** AI-assisted specification for Redpoint Positioning
