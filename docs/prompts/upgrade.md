# Floorplan Zone Editor - Upgrade Specification

**Version:** 2.0
**Date:** January 26, 2026
**Purpose:** Comprehensive upgrade plan to resolve detection accuracy issues and improve system robustness
**Status:** Phase 1-3 IMPLEMENTED

---

## Implementation Status

| Phase | Component | Status |
|-------|-----------|--------|
| 1.1 | Floorplan boundary detection | DONE |
| 1.2 | Two-sided aisle validation | DONE |
| 1.3 | Tuned detection parameters | DONE |
| 1.4 | Margin lane filtering | DONE |
| 1.5 | Enhanced visualization | DONE |
| 2.1 | Simplified sub-agent prompt | DONE |
| 2.2 | Preprocessing-augmented prompt | DONE |
| 2.3 | Preprocessing fallback function | DONE |
| 3.1 | Preprocessing API client updates | DONE |
| 3.2 | Format hints for prompts | DONE |

---

## Executive Summary

This specification outlines upgrades across three key areas:
1. **Python Preprocessor Enhancements** - More accurate aisle/travel lane detection
2. **Sub-Agent Improvements** - More robust prompts and error handling
3. **Main Agent Prompt Refinements** - Better coarse detection with preprocessing integration

The goal is to achieve 90%+ accuracy in zone detection, particularly for:
- Aisle paths (whitespace corridors between racking)
- Travel lanes (major warehouse corridors)
- Racking areas (shelving units)

---

## 1. Critical Issues to Address

### 1.1 Sub-Agent Failures (CRITICAL)

**Current Problems:**
- JSON parsing errors from truncated responses
- Validation failures for malformed coordinates
- Timeouts on large racking regions
- Gemini especially prone to truncating long JSON

**Root Causes:**
- Prompts request too many subdivisions (30+ zones)
- No output token budget management
- Recovery strategies are reactive, not proactive

### 1.2 Aisle Detection Accuracy

**Current Problems:**
- Aisles extend beyond actual corridor boundaries (too long)
- Aisles offset left/right (not centered in whitespace)
- Aisles too wide (exceed actual corridor width)
- Aisles placed on racking instead of whitespace

**Root Causes:**
- Detection parameters not tuned for typical warehouse floorplans
- No validation that aisles have dark lines on BOTH sides
- Deduplication merge distance too aggressive

### 1.3 Travel Lane Detection

**Current Problems:**
- Travel lanes detected in margin/border areas
- Interior corridors missed
- Confusion with large whitespace areas

**Root Causes:**
- No floorplan boundary detection (crop to content)
- No filtering of lanes touching image edges
- Morphological detection too permissive

### 1.4 Visualization Not Saving

**Current Problems:**
- Aisle visualizations not appearing in temp folder
- No feedback when visualization fails

**Root Causes:**
- `num_aisles > 0` condition may filter valid results
- Silent failures in `draw_aisles_visualization()`

---

## 2. Python Preprocessor Upgrades

### 2.1 Floorplan Boundary Detection (NEW)

Add automatic detection of the actual floorplan content area, excluding margins/borders.

```python
# NEW FILE: python-preprocessing/src/boundary_detection.py

def detect_floorplan_boundary(image: np.ndarray) -> Tuple[int, int, int, int]:
    """
    Detect the actual floorplan content area, excluding white margins.

    Returns:
        (x, y, width, height) of the content bounding box
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

    # Use Otsu to find content vs background
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Morphological operations to connect content
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # Find the largest contour (should be the floorplan)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return (0, 0, image.shape[1], image.shape[0])

    # Get bounding rect of largest contour
    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    # Add small margin (5px)
    margin = 5
    x = max(0, x - margin)
    y = max(0, y - margin)
    w = min(image.shape[1] - x, w + 2 * margin)
    h = min(image.shape[0] - y, h + 2 * margin)

    return (x, y, w, h)
```

### 2.2 Improved Aisle Detection Parameters

Update `line_detection.py` with better-tuned parameters:

```python
# MODIFIED: detect_aisles() function parameters

# Method 2: Brightness pattern detection - TIGHTEN PARAMETERS
brightness_aisles = detect_aisles_from_brightness_pattern(
    image,
    min_aisle_width=12,    # Increased from 8 - too narrow catches noise
    max_aisle_width=50,    # Decreased from 60 - aisles shouldn't be huge
    dark_thresh=120,       # Decreased from 140 - more aggressive dark detection
    light_thresh=200,      # Decreased from 210 - catch more whitespace
    min_consistency=10,    # Increased from 8 - higher consistency required
    num_samples=30,        # Increased from 25 - more samples for accuracy
)

# Method 3: Line-pair detection - TIGHTEN PARAMETERS
line_pair_aisles = detect_aisles_from_line_pairs(
    image,
    min_aisle_width=12,    # Increased from 10
    max_aisle_width=55,    # Decreased from 70
    min_aisle_length=100,  # Increased from 80
    scan_window=25,        # Decreased from 30 - tighter validation
)

# Deduplication - REDUCE MERGE DISTANCE
deduped_aisles = deduplicate_aisles(aisles, merge_distance=15)  # From 20
```

### 2.3 Two-Sided Validation for Aisles (NEW)

Add explicit validation that aisles have dark content on both sides:

```python
# ADD to detect_aisles_from_brightness_pattern()

def validate_aisle_boundaries(
    gray: np.ndarray,
    aisle_x_start: int,
    aisle_x_end: int,
    y_start: int,
    y_end: int,
    dark_threshold: int = 140,
    min_dark_ratio: float = 0.3
) -> Tuple[bool, float, float]:
    """
    Validate that an aisle has dark content (racking) on both sides.

    Returns:
        (is_valid, left_darkness, right_darkness)
    """
    scan_width = 25  # How far to look on each side

    # Check LEFT side
    left_start = max(0, aisle_x_start - scan_width)
    left_region = gray[y_start:y_end, left_start:aisle_x_start]
    left_dark_pixels = np.sum(left_region < dark_threshold)
    left_total_pixels = left_region.size
    left_darkness = left_dark_pixels / left_total_pixels if left_total_pixels > 0 else 0

    # Check RIGHT side
    right_end = min(gray.shape[1], aisle_x_end + scan_width)
    right_region = gray[y_start:y_end, aisle_x_end:right_end]
    right_dark_pixels = np.sum(right_region < dark_threshold)
    right_total_pixels = right_region.size
    right_darkness = right_dark_pixels / right_total_pixels if right_total_pixels > 0 else 0

    # Both sides must have sufficient dark content
    is_valid = left_darkness >= min_dark_ratio and right_darkness >= min_dark_ratio

    return (is_valid, left_darkness, right_darkness)
```

### 2.4 Travel Lane Interior-Only Filter (NEW)

Filter out travel lanes that are actually margins:

```python
# ADD to detect_travel_lanes_morphological()

def filter_margin_lanes(
    lanes: List[AisleCandidate],
    content_boundary: Tuple[int, int, int, int],
    margin_threshold: int = 20
) -> List[AisleCandidate]:
    """
    Filter out travel lanes that are primarily in the margin area.

    A lane is considered a margin lane if:
    - Its center is within margin_threshold of the content boundary edge
    - More than 50% of its area is outside the content boundary
    """
    cx, cy, cw, ch = content_boundary
    filtered = []

    for lane in lanes:
        x, y, w, h = lane.bounding_box
        lane_center_x = x + w / 2
        lane_center_y = y + h / 2

        # Check if center is inside content area with margin
        in_content = (
            cx + margin_threshold < lane_center_x < cx + cw - margin_threshold and
            cy + margin_threshold < lane_center_y < cy + ch - margin_threshold
        )

        if in_content:
            filtered.append(lane)
        else:
            # Calculate overlap with content area
            overlap_x = max(0, min(x + w, cx + cw) - max(x, cx))
            overlap_y = max(0, min(y + h, cy + ch) - max(y, cy))
            overlap_area = overlap_x * overlap_y
            lane_area = w * h

            # Keep if >70% overlap with content
            if lane_area > 0 and overlap_area / lane_area > 0.7:
                filtered.append(lane)

    return filtered
```

### 2.5 Enhanced Visualization with Debug Info

Update `draw_aisles_visualization()` to include more debug information:

```python
def draw_aisles_visualization(
    image: np.ndarray,
    aisle_candidates: List[dict],
    output_path: str,
    content_boundary: Optional[Tuple[int, int, int, int]] = None
) -> None:
    """Draw aisles on image with enhanced debug info."""
    vis = image.copy()

    # Draw content boundary if provided
    if content_boundary:
        x, y, w, h = content_boundary
        cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 255), 2)  # Magenta

    for i, aisle in enumerate(aisle_candidates):
        bb = aisle.get('bounding_box', {})
        x = bb.get('x', 0)
        y = bb.get('y', 0)
        w = bb.get('width', 0)
        h = bb.get('height', 0)

        confidence = aisle.get('confidence', 0.5)
        method = aisle.get('detection_method', 'unknown')
        orientation = aisle.get('orientation', 'unknown')

        # Color by confidence: green (high) -> yellow -> red (low)
        if confidence >= 0.7:
            color = (0, 255, 0)  # Green
        elif confidence >= 0.5:
            color = (0, 255, 255)  # Yellow
        else:
            color = (0, 0, 255)  # Red

        # Draw bounding box
        cv2.rectangle(vis, (x, y), (x + w, y + h), color, 2)

        # Draw centerline
        centerline = aisle.get('centerline', [])
        if len(centerline) >= 2:
            start = (centerline[0].get('x', 0), centerline[0].get('y', 0))
            end = (centerline[-1].get('x', 0), centerline[-1].get('y', 0))
            cv2.line(vis, start, end, (255, 0, 0), 2)  # Blue centerline

        # Add label with info
        label = f"{i+1}:{method[:3]}:{confidence:.2f}"
        cv2.putText(vis, label, (x, y - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

        # Draw line density indicators (small bars on sides)
        left_density = aisle.get('line_density', {}).get('left_or_top', 0)
        right_density = aisle.get('line_density', {}).get('right_or_bottom', 0)

        bar_width = 5
        bar_height = int(min(h, 50) * left_density)
        cv2.rectangle(vis, (x - bar_width - 2, y), (x - 2, y + bar_height), (128, 128, 0), -1)

        bar_height = int(min(h, 50) * right_density)
        cv2.rectangle(vis, (x + w + 2, y), (x + w + bar_width + 2, y + bar_height), (128, 128, 0), -1)

    # Add legend
    cv2.putText(vis, "Green=High conf, Yellow=Med, Red=Low", (10, 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    cv2.putText(vis, "Blue line=centerline, Cyan bars=line density", (10, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

    cv2.imwrite(output_path, vis)
    logging.info(f"Saved visualization with {len(aisle_candidates)} aisles to {output_path}")
```

### 2.6 New Preprocessing Pipeline

Update `pipeline.py` to integrate all enhancements:

```python
def preprocess_floorplan(
    image: np.ndarray,
    config: Optional[PreprocessingConfig] = None
) -> PreprocessingResult:
    """Enhanced preprocessing pipeline."""
    if config is None:
        config = PreprocessingConfig()

    # STEP 1: Detect floorplan boundary (NEW)
    content_boundary = detect_floorplan_boundary(image)

    # STEP 2: Crop to content area (optional, for cleaner processing)
    cx, cy, cw, ch = content_boundary
    cropped = image[cy:cy+ch, cx:cx+cw]

    # STEP 3: Run existing detection on cropped area
    edge_data = detect_edges(cropped, config)
    segmentation_data = segment_regions(cropped, config)
    line_data = process_lines(cropped, config.min_line_length, config.line_cluster_distance)

    # STEP 4: Transform coordinates back to full image
    line_data_transformed = transform_line_data_coords(line_data, cx, cy)

    # STEP 5: Filter margin lanes (NEW)
    if 'aisle_candidates' in line_data_transformed:
        line_data_transformed['aisle_candidates'] = filter_margin_lanes(
            line_data_transformed['aisle_candidates'],
            content_boundary
        )

    # STEP 6: Generate hints
    hints = generate_gemini_hints(
        edge_data,
        segmentation_data,
        line_data_transformed,
        content_boundary  # Pass boundary info to hints
    )

    return PreprocessingResult(
        edge_data=edge_data,
        segmentation_data=segmentation_data,
        line_data=line_data_transformed,
        gemini_hints=hints,
        content_boundary=content_boundary  # Include in result
    )
```

---

## 3. Sub-Agent Improvements

### 3.1 Simplified Prompt with Strict Output Limits

Replace the current verbose prompt with a more focused one:

```typescript
// REPLACE getSubAgentPrompt() in subAgentApi.ts

export function getSubAgentPrompt(cropWidth: number, cropHeight: number): string {
  return `ANALYZE THIS RACKING SECTION. OUTPUT JSON WITH ZONE COORDINATES.

## PATTERN TO FIND

Racking sections have alternating:
- WHITE CORRIDORS (aisles) = travelable paths
- BLACK LINE GROUPS (racking) = shelving units

## RULES

1. Determine if aisles run VERTICAL (top-to-bottom) or HORIZONTAL (left-to-right)
2. Count the number of aisles visible (typically 3-15)
3. Create RECTANGULAR zones for each aisle and racking section
4. Use exactly 4 vertices per zone (rectangles only)

## STRICT LIMITS

- Maximum 20 zones total (combine small zones if needed)
- Keep JSON under 2000 characters
- Use simple rectangles only (4 vertices each)

## OUTPUT (JSON ONLY, NO MARKDOWN)

Image size: ${cropWidth}x${cropHeight}px

{
  "direction": "vertical",
  "subdivisions": [
    {"type": "aisle_path", "name": "Aisle 1", "vertices": [{"x":10,"y":0},{"x":30,"y":0},{"x":30,"y":${cropHeight}},{"x":10,"y":${cropHeight}}], "confidence": 0.9, "travelable": true},
    {"type": "racking", "name": "Rack A", "vertices": [{"x":30,"y":0},{"x":80,"y":0},{"x":80,"y":${cropHeight}},{"x":30,"y":${cropHeight}}], "confidence": 0.8, "travelable": false}
  ]
}`
}
```

### 3.2 Preprocessing-Augmented Sub-Agent (NEW)

Create a new flow that uses preprocessing data to guide sub-agents:

```typescript
// NEW FUNCTION in subAgentApi.ts

interface PreprocessingAisles {
  aisles: Array<{
    id: number
    orientation: string
    width: number
    centerline: Array<{x: number, y: number}>
    bounding_box: {x: number, y: number, width: number, height: number}
    confidence: number
  }>
}

export function getPreprocessingAugmentedPrompt(
  cropWidth: number,
  cropHeight: number,
  preprocessingData: PreprocessingAisles
): string {
  const aisleHints = preprocessingData.aisles.map((a, i) => {
    const bb = a.bounding_box
    return `  Aisle ${i+1}: x=${bb.x}-${bb.x + bb.width}, y=${bb.y}-${bb.y + bb.height}, conf=${a.confidence.toFixed(2)}`
  }).join('\n')

  return `VERIFY AND REFINE THESE DETECTED AISLES IN THE RACKING IMAGE.

## PREPROCESSING DETECTED ${preprocessingData.aisles.length} POTENTIAL AISLES:

${aisleHints}

## YOUR TASK

1. VERIFY each detected aisle is a real whitespace corridor
2. ADJUST boundaries if they are off (too wide, offset, etc.)
3. ADD any aisles the preprocessing missed
4. REMOVE false positives (non-aisle whitespace)

## OUTPUT (JSON, NO MARKDOWN)

Image size: ${cropWidth}x${cropHeight}px
Direction: ${preprocessingData.aisles[0]?.orientation || 'vertical'}

{
  "direction": "${preprocessingData.aisles[0]?.orientation || 'vertical'}",
  "subdivisions": [
    {"type": "aisle_path", "name": "Aisle 1", "vertices": [...], "confidence": 0.9, "travelable": true},
    {"type": "racking", "name": "Rack A", "vertices": [...], "confidence": 0.8, "travelable": false}
  ],
  "analysisNotes": "Verified X aisles, adjusted Y, removed Z false positives"
}`
}
```

### 3.3 Streaming Response Handler (NEW)

Implement streaming to catch truncation early:

```typescript
// NEW FUNCTION in subAgentApi.ts

async function analyzeWithStreaming(
  input: SubAgentInput,
  apiKey: string,
  provider: ApiProvider,
  onChunk: (chunk: string) => void
): Promise<string> {
  // For Anthropic
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_SUBAGENT_MODEL,
      max_tokens: 4096,
      stream: true,
      messages: [/* ... */]
    }),
  })

  const reader = response.body?.getReader()
  if (!reader) throw new SubAgentError('No response body', 'network')

  let fullText = ''
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    // Parse SSE format and extract text
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'content_block_delta') {
          fullText += data.delta?.text || ''
          onChunk(fullText)

          // Early validation - check if we have complete JSON
          if (fullText.includes('"subdivisions"') && isCompleteJSON(fullText)) {
            // We have enough, can stop early
            reader.cancel()
            return fullText
          }
        }
      }
    }
  }

  return fullText
}

function isCompleteJSON(text: string): boolean {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) return false

  try {
    JSON.parse(text.slice(firstBrace, lastBrace + 1))
    return true
  } catch {
    return false
  }
}
```

### 3.4 Fallback to Preprocessing Results

When AI sub-agent fails, use preprocessing data directly:

```typescript
// NEW FUNCTION in subAgentApi.ts

export function convertPreprocessingToSubdivisions(
  preprocessingData: PreprocessingAisles,
  cropWidth: number,
  cropHeight: number
): SubAgentOutput {
  const subdivisions: SubdividedZone[] = []
  const direction = preprocessingData.aisles[0]?.orientation === 'horizontal'
    ? 'horizontal'
    : 'vertical'

  // Sort aisles by position
  const sortedAisles = [...preprocessingData.aisles].sort((a, b) => {
    return direction === 'vertical'
      ? a.bounding_box.x - b.bounding_box.x
      : a.bounding_box.y - b.bounding_box.y
  })

  let prevEnd = 0
  let aisleNum = 1
  let rackNum = 0

  for (const aisle of sortedAisles) {
    const bb = aisle.bounding_box
    const aisleStart = direction === 'vertical' ? bb.x : bb.y
    const aisleEnd = direction === 'vertical' ? bb.x + bb.width : bb.y + bb.height

    // Add racking before this aisle (if there's a gap)
    if (aisleStart > prevEnd + 5) {
      const rackVertices = direction === 'vertical'
        ? [{x: prevEnd, y: 0}, {x: aisleStart, y: 0}, {x: aisleStart, y: cropHeight}, {x: prevEnd, y: cropHeight}]
        : [{x: 0, y: prevEnd}, {x: cropWidth, y: prevEnd}, {x: cropWidth, y: aisleStart}, {x: 0, y: aisleStart}]

      subdivisions.push({
        type: 'racking',
        name: `Rack Row ${String.fromCharCode(65 + rackNum++)}`,
        vertices: rackVertices,
        confidence: 0.6,
        travelable: false
      })
    }

    // Add the aisle
    const aisleVertices = direction === 'vertical'
      ? [{x: bb.x, y: 0}, {x: bb.x + bb.width, y: 0}, {x: bb.x + bb.width, y: cropHeight}, {x: bb.x, y: cropHeight}]
      : [{x: 0, y: bb.y}, {x: cropWidth, y: bb.y}, {x: cropWidth, y: bb.y + bb.height}, {x: 0, y: bb.y + bb.height}]

    subdivisions.push({
      type: 'aisle_path',
      name: `Aisle ${aisleNum++}`,
      vertices: aisleVertices,
      confidence: aisle.confidence,
      travelable: true
    })

    prevEnd = aisleEnd
  }

  // Add final racking if there's space
  const maxDim = direction === 'vertical' ? cropWidth : cropHeight
  if (prevEnd < maxDim - 5) {
    const rackVertices = direction === 'vertical'
      ? [{x: prevEnd, y: 0}, {x: cropWidth, y: 0}, {x: cropWidth, y: cropHeight}, {x: prevEnd, y: cropHeight}]
      : [{x: 0, y: prevEnd}, {x: cropWidth, y: prevEnd}, {x: cropWidth, y: cropHeight}, {x: 0, y: cropHeight}]

    subdivisions.push({
      type: 'racking',
      name: `Rack Row ${String.fromCharCode(65 + rackNum)}`,
      vertices: rackVertices,
      confidence: 0.6,
      travelable: false
    })
  }

  return {
    direction,
    subdivisions,
    analysisNotes: `Fallback: Generated from preprocessing data (${preprocessingData.aisles.length} detected aisles)`
  }
}
```

---

## 4. Main Agent Prompt Improvements

### 4.1 Preprocessing-Integrated Main Prompt

Add preprocessing hints to the main agent prompt:

```typescript
// MODIFY getZoneDetectionPrompt() in claudeApi.ts

function getZoneDetectionPrompt(
  imageWidth: number,
  imageHeight: number,
  preprocessingHints?: PreprocessingHints
): string {
  let hintSection = ''

  if (preprocessingHints) {
    hintSection = `
## PREPROCESSING ANALYSIS RESULTS

The image has been pre-analyzed. Use these hints to guide your detection:

### Content Boundary
The actual floorplan content is located at:
- X: ${preprocessingHints.contentBoundary.x} to ${preprocessingHints.contentBoundary.x + preprocessingHints.contentBoundary.width}
- Y: ${preprocessingHints.contentBoundary.y} to ${preprocessingHints.contentBoundary.y + preprocessingHints.contentBoundary.height}

### Detected Regions (${preprocessingHints.regions.length} total)
${preprocessingHints.regions.map(r => `- ${r.type} at (${r.x}, ${r.y}): ${r.width}x${r.height}, density=${r.density?.toFixed(2) || 'N/A'}`).join('\n')}

### Detected Line Clusters
${preprocessingHints.lineClusters.map(c => `- ${c.orientation} cluster at (${c.x}, ${c.y}): ${c.lineCount} lines`).join('\n')}

### Potential Aisles (${preprocessingHints.aisles.length} detected)
${preprocessingHints.aisles.slice(0, 10).map(a => `- ${a.orientation} aisle at x=${a.x}, width=${a.width}px, confidence=${a.confidence?.toFixed(2)}`).join('\n')}
${preprocessingHints.aisles.length > 10 ? `... and ${preprocessingHints.aisles.length - 10} more` : ''}

Use this data to VERIFY your visual analysis. Trust the preprocessing for racking areas - mark them as needsSubdivision=true for detailed analysis.
`
  }

  return `You are an expert at analyzing warehouse floorplans...
${hintSection}
... rest of prompt ...`
}
```

### 4.2 Two-Stage Detection Strategy

Implement a clearer separation between travel lanes and racking:

```typescript
// NEW APPROACH: Two-pass detection

async function analyzeFloorplanTwoPass(
  imageDataUrl: string,
  apiKey: string,
  imageWidth: number,
  imageHeight: number,
  preprocessingHints?: PreprocessingHints
): Promise<CoarseZone[]> {

  // PASS 1: Detect travel lanes ONLY
  const travelLanePrompt = getTravelLaneOnlyPrompt(imageWidth, imageHeight, preprocessingHints)
  const travelLanes = await analyzeWithClaude(imageDataUrl, apiKey, travelLanePrompt)

  // PASS 2: Detect racking in remaining areas
  // Create mask from travel lanes to identify remaining spaces
  const rackingPrompt = getRackingAreasPrompt(imageWidth, imageHeight, travelLanes, preprocessingHints)
  const rackingAreas = await analyzeWithClaude(imageDataUrl, apiKey, rackingPrompt)

  return [...travelLanes, ...rackingAreas]
}
```

---

## 5. Integration Flow

### 5.1 Updated Analysis Pipeline

```typescript
// MODIFIED: useAgenticAnalysis.ts

async function analyzeFloorplanAgentic(
  imageDataUrl: string,
  apiKey: string,
  imageWidth: number,
  imageHeight: number,
  provider: ApiProvider,
  onProgress?: (stage: string, progress: number) => void
): Promise<Zone[]> {

  // Phase 0: Run preprocessing (NEW)
  onProgress?.('Running preprocessing...', 0.05)
  const preprocessingResult = await callPreprocessingServer(imageDataUrl)

  // Phase 1: Coarse detection WITH preprocessing hints
  onProgress?.('Detecting zones...', 0.15)
  const coarseZones = await analyzeCoarse(
    imageDataUrl,
    apiKey,
    imageWidth,
    imageHeight,
    preprocessingResult.gemini_hints  // Pass hints
  )

  // Phase 2: Identify zones needing subdivision
  const zonesToSubdivide = coarseZones.filter(z => z.needsSubdivision)
  const finalZones: Zone[] = coarseZones.filter(z => !z.needsSubdivision)

  // Phase 3: Sub-agent analysis WITH preprocessing fallback
  onProgress?.('Analyzing racking areas...', 0.3)

  for (let i = 0; i < zonesToSubdivide.length; i++) {
    const zone = zonesToSubdivide[i]
    onProgress?.(`Analyzing racking area ${i + 1}/${zonesToSubdivide.length}...`,
                 0.3 + (0.6 * (i + 1) / zonesToSubdivide.length))

    try {
      // Try AI sub-agent first
      const input = await prepareSubAgentInput(imageDataUrl, zone, imageWidth, imageHeight)

      // Get cropped preprocessing data for this region
      const croppedPreprocessing = await getCroppedPreprocessingData(
        preprocessingResult,
        zone.boundingBox
      )

      // Use preprocessing-augmented prompt
      const output = await analyzeRackingRegionWithPreprocessing(
        input,
        apiKey,
        provider,
        croppedPreprocessing
      )

      const subdivisions = mergeSubAgentResults(zone, input, output)
      finalZones.push(...subdivisions)

    } catch (error) {
      console.warn(`Sub-agent failed for zone ${zone.id}, using preprocessing fallback`)

      // Fallback: use preprocessing data directly
      const croppedPreprocessing = await getCroppedPreprocessingData(
        preprocessingResult,
        zone.boundingBox
      )

      if (croppedPreprocessing.aisles.length > 0) {
        const fallbackOutput = convertPreprocessingToSubdivisions(
          croppedPreprocessing,
          zone.boundingBox.width,
          zone.boundingBox.height
        )
        const input = await prepareSubAgentInput(imageDataUrl, zone, imageWidth, imageHeight)
        const subdivisions = mergeSubAgentResults(zone, input, fallbackOutput)
        finalZones.push(...subdivisions)
      } else {
        // Keep parent zone as-is if no preprocessing data
        finalZones.push(createZoneFromCoarse(zone, { subdivisionFailed: true }))
      }
    }
  }

  // Phase 4: Post-processing and cleanup
  onProgress?.('Finalizing...', 0.95)

  return deduplicateAndCleanZones(finalZones)
}
```

---

## 6. Implementation Phases

### Phase 1: Preprocessor Fixes (Priority: HIGH)
1. Implement floorplan boundary detection
2. Add two-sided validation for aisles
3. Tune aisle detection parameters
4. Fix visualization saving
5. Add margin lane filtering

**Estimated effort:** 2-3 days

### Phase 2: Sub-Agent Robustness (Priority: HIGH)
1. Simplify sub-agent prompt
2. Add output token limits
3. Implement preprocessing fallback
4. Add early JSON validation

**Estimated effort:** 2-3 days

### Phase 3: Main Agent Integration (Priority: MEDIUM)
1. Add preprocessing hints to main prompt
2. Implement two-pass detection
3. Better coordinate validation

**Estimated effort:** 1-2 days

### Phase 4: Testing & Tuning (Priority: HIGH)
1. Test with diverse floorplan images
2. Tune parameters based on results
3. Document optimal configurations

**Estimated effort:** 2-3 days

---

## 7. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Aisle detection accuracy | ~60% | >90% |
| Travel lane detection | ~40% | >85% |
| Sub-agent success rate | ~70% | >95% |
| JSON parsing failures | ~30% | <5% |
| False positive rate | ~25% | <10% |

---

## 8. Testing Checklist

### Aisle Detection
- [ ] Vertical aisles in horizontal racking
- [ ] Horizontal aisles in vertical racking
- [ ] Narrow aisles (15-25px)
- [ ] Wide aisles (40-60px)
- [ ] Aisles at image edges

### Travel Lane Detection
- [ ] Perimeter lanes
- [ ] Cross-aisles
- [ ] L-shaped lanes
- [ ] T-intersections
- [ ] Lanes near margins (should be filtered)

### Edge Cases
- [ ] Low contrast images
- [ ] Images with colored zones
- [ ] Images with text labels
- [ ] Rotated floorplans
- [ ] Partial floorplans

---

**Document Status:** Draft
**Last Updated:** January 26, 2026
**Author:** Claude (AI-assisted specification)
