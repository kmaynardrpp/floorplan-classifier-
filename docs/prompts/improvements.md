# Floorplan Zone Detection System - Improvement Specification

**Document Version:** 1.0  
**Date:** January 27, 2026  
**Author:** Solution Delivery  
**Status:** DRAFT  
**Related Architecture:** [Floorplan Zone Detection - Architecture Overview](https://redpointpositioning.atlassian.net/wiki/spaces/SD/pages/3738370050/Floorplan+Zone+Detection+-+Architecture+Overview)

---

## Executive Summary

This specification outlines enhancements to the Floorplan Zone Detection system to improve accuracy, performance, and reliability when processing large, complex warehouse floorplans. The improvements address limitations discovered during testing with high-resolution images containing pre-drawn boundaries, multi-orientation racking layouts, and specialized equipment areas.

### Key Improvements

| ID | Improvement | Priority | Effort |
|----|-------------|----------|--------|
| IMP-01 | Phase 0: Color Boundary Detection | High | Medium |
| IMP-02 | Multi-Scale Tiled Processing | High | High |
| IMP-03 | Multi-Orientation Racking Support | High | Medium |
| IMP-04 | Enhanced Zone Type Detection | Medium | Low |
| IMP-05 | Adaptive Hybrid Decision Threshold | Medium | Medium |
| IMP-06 | Preprocessing Hint Enhancement | Medium | Low |
| IMP-07 | Performance Optimization | Low | High |

---

## IMP-01: Phase 0 - Color Boundary Detection

### Problem Statement

Many warehouse floorplans arrive with pre-drawn zone boundaries (typically in orange, yellow, or red). The current system ignores these visual cues and relies entirely on edge detection and AI analysis to re-discover boundaries that already exist.

### Proposed Solution

Add a new **Phase 0** preprocessing step that detects colored boundary lines before any other processing occurs. This phase extracts closed regions defined by colored lines and passes them as high-confidence zone candidates to subsequent phases.

### Technical Specification

#### 1. Color Detection Pipeline

```python
class ColorBoundaryDetector:
    """
    Detects pre-drawn zone boundaries based on color signatures.
    Runs before edge detection (Phase 0).
    """
    
    # Default color ranges (HSV format)
    DEFAULT_COLOR_RANGES = {
        'orange': {
            'lower': np.array([10, 100, 100]),
            'upper': np.array([25, 255, 255])
        },
        'yellow': {
            'lower': np.array([25, 100, 100]),
            'upper': np.array([35, 255, 255])
        },
        'red_low': {
            'lower': np.array([0, 100, 100]),
            'upper': np.array([10, 255, 255])
        },
        'red_high': {
            'lower': np.array([160, 100, 100]),
            'upper': np.array([180, 255, 255])
        },
        'blue': {
            'lower': np.array([100, 100, 100]),
            'upper': np.array([130, 255, 255])
        }
    }
    
    def __init__(self, color_ranges: dict = None, min_contour_area: int = 1000):
        self.color_ranges = color_ranges or self.DEFAULT_COLOR_RANGES
        self.min_contour_area = min_contour_area
    
    def detect(self, image: np.ndarray) -> ColorBoundaryResult:
        """
        Main detection method.
        
        Args:
            image: BGR image array
            
        Returns:
            ColorBoundaryResult containing detected boundaries and metadata
        """
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        all_contours = []
        color_masks = {}
        
        for color_name, range_config in self.color_ranges.items():
            mask = cv2.inRange(hsv, range_config['lower'], range_config['upper'])
            mask = self._clean_mask(mask)
            color_masks[color_name] = mask
            
            contours, _ = cv2.findContours(
                mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            for contour in contours:
                if cv2.contourArea(contour) >= self.min_contour_area:
                    all_contours.append({
                        'contour': contour,
                        'color': color_name,
                        'area': cv2.contourArea(contour),
                        'polygon': self._contour_to_polygon(contour)
                    })
        
        return ColorBoundaryResult(
            boundaries=all_contours,
            combined_mask=self._combine_masks(color_masks),
            coverage_ratio=self._calculate_coverage(all_contours, image.shape)
        )
    
    def _clean_mask(self, mask: np.ndarray) -> np.ndarray:
        """Apply morphological operations to clean up the mask."""
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
        return mask
    
    def _contour_to_polygon(self, contour: np.ndarray) -> List[Tuple[int, int]]:
        """Convert OpenCV contour to polygon coordinates."""
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)
        return [(int(pt[0][0]), int(pt[0][1])) for pt in approx]
    
    def _calculate_coverage(self, contours: list, image_shape: tuple) -> float:
        """Calculate what percentage of the image is covered by detected boundaries."""
        total_area = sum(c['area'] for c in contours)
        image_area = image_shape[0] * image_shape[1]
        return total_area / image_area if image_area > 0 else 0.0
```

#### 2. Data Structures

```python
@dataclass
class ColorBoundaryResult:
    boundaries: List[DetectedBoundary]
    combined_mask: np.ndarray
    coverage_ratio: float
    
    def to_hints(self) -> dict:
        """Convert to preprocessing hints format for AI phases."""
        return {
            'detected_colored_boundaries': [
                {
                    'polygon': b['polygon'],
                    'color': b['color'],
                    'area_px': b['area'],
                    'confidence': 0.95  # High confidence for color-detected boundaries
                }
                for b in self.boundaries
            ],
            'boundary_coverage_ratio': self.coverage_ratio,
            'has_predefined_zones': self.coverage_ratio > 0.1
        }
```

#### 3. Integration with Existing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS IMAGE                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 PHASE 0: COLOR BOUNDARY DETECTION (NEW)                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │
│  │ HSV Conversion  │→ │ Color Masking   │→ │ Contour Extract │          │
│  │                 │  │ (Multi-color)   │  │ + Simplify      │          │
│  └─────────────────┘  └─────────────────┘  └────────┬────────┘          │
│                                                      │                   │
│                                    ┌─────────────────┴─────────────────┐ │
│                                    │ Coverage > 80%?                   │ │
│                                    │ YES → Fast-track to classification│ │
│                                    │ NO  → Continue to Phase 1         │ │
│                                    └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                        [PHASE 1: PREPROCESSING - existing]
```

#### 4. Fast-Track Classification Mode

When Phase 0 detects high boundary coverage (>80%), the system can skip expensive edge detection and region segmentation:

```python
def process_floorplan(image: np.ndarray) -> ZoneResult:
    # Phase 0: Color boundary detection
    color_result = color_detector.detect(image)
    
    if color_result.coverage_ratio > 0.8:
        # Fast-track: boundaries already defined, only need classification
        return fast_track_classification(image, color_result)
    
    # Standard path: continue with Phase 1
    preprocessing_result = preprocess(image)
    preprocessing_result.merge_color_boundaries(color_result)
    
    # Continue to Phase 2...
```

### Acceptance Criteria

- [ ] Detects orange, yellow, red, and blue boundary lines with >90% recall
- [ ] Generates closed polygon regions from detected boundaries
- [ ] Correctly calculates coverage ratio
- [ ] Fast-track mode activates when coverage >80%
- [ ] Processing time for Phase 0 alone <2 seconds for 5000x3000px images
- [ ] Gracefully handles images with no colored boundaries (returns empty result)

### Configuration Options

```yaml
phase0_color_detection:
  enabled: true
  color_ranges:
    orange:
      h_min: 10
      h_max: 25
      s_min: 100
      v_min: 100
    # ... additional colors
  min_contour_area: 1000  # pixels
  fast_track_threshold: 0.8  # coverage ratio to skip Phase 1
  morphology:
    close_iterations: 2
    open_iterations: 1
    kernel_size: 3
```

---

## IMP-02: Multi-Scale Tiled Processing

### Problem Statement

Large warehouse floorplans (>4000px in any dimension) contain fine details that are lost when the image is resized or processed as a whole. Claude's vision capabilities have optimal performance at certain resolutions, and very large images may exceed context limits or lose critical detail.

### Proposed Solution

Implement a tiled processing approach that breaks large images into overlapping tiles, processes each tile independently, and merges results with intelligent overlap resolution.

### Technical Specification

#### 1. Tiling Strategy

```python
class ImageTiler:
    """
    Breaks large images into overlapping tiles for processing.
    """
    
    DEFAULT_TILE_SIZE = 2048  # pixels
    DEFAULT_OVERLAP = 256    # pixels
    MAX_IMAGE_DIMENSION = 4000  # threshold for tiling
    
    def __init__(
        self,
        tile_size: int = DEFAULT_TILE_SIZE,
        overlap: int = DEFAULT_OVERLAP,
        use_smart_boundaries: bool = True
    ):
        self.tile_size = tile_size
        self.overlap = overlap
        self.use_smart_boundaries = use_smart_boundaries
    
    def should_tile(self, image: np.ndarray) -> bool:
        """Determine if image requires tiling."""
        height, width = image.shape[:2]
        return width > self.MAX_IMAGE_DIMENSION or height > self.MAX_IMAGE_DIMENSION
    
    def create_tiles(
        self,
        image: np.ndarray,
        phase0_boundaries: Optional[ColorBoundaryResult] = None
    ) -> List[ImageTile]:
        """
        Create tiles from the image.
        
        If smart_boundaries is enabled and Phase 0 boundaries are provided,
        tiles will be aligned to zone boundaries where possible.
        """
        height, width = image.shape[:2]
        tiles = []
        
        if self.use_smart_boundaries and phase0_boundaries:
            tile_bounds = self._calculate_smart_boundaries(
                width, height, phase0_boundaries
            )
        else:
            tile_bounds = self._calculate_grid_boundaries(width, height)
        
        for i, bounds in enumerate(tile_bounds):
            x1, y1, x2, y2 = bounds
            tile_image = image[y1:y2, x1:x2].copy()
            
            tiles.append(ImageTile(
                id=f"tile_{i}",
                image=tile_image,
                bounds=bounds,
                overlap_regions=self._calculate_overlap_regions(bounds, tile_bounds)
            ))
        
        return tiles
    
    def _calculate_grid_boundaries(
        self,
        width: int,
        height: int
    ) -> List[Tuple[int, int, int, int]]:
        """Calculate regular grid tile boundaries with overlap."""
        boundaries = []
        effective_step = self.tile_size - self.overlap
        
        y = 0
        while y < height:
            x = 0
            while x < width:
                x1 = x
                y1 = y
                x2 = min(x + self.tile_size, width)
                y2 = min(y + self.tile_size, height)
                
                boundaries.append((x1, y1, x2, y2))
                x += effective_step
            y += effective_step
        
        return boundaries
    
    def _calculate_smart_boundaries(
        self,
        width: int,
        height: int,
        phase0_boundaries: ColorBoundaryResult
    ) -> List[Tuple[int, int, int, int]]:
        """
        Calculate tile boundaries that align with detected zone boundaries
        where possible, minimizing zones split across tiles.
        """
        # Find natural vertical and horizontal split lines from boundaries
        vertical_splits = self._find_boundary_aligned_splits(
            phase0_boundaries, 'vertical', width
        )
        horizontal_splits = self._find_boundary_aligned_splits(
            phase0_boundaries, 'horizontal', height
        )
        
        # Fall back to grid if not enough natural splits found
        if len(vertical_splits) < 2 or len(horizontal_splits) < 2:
            return self._calculate_grid_boundaries(width, height)
        
        # Generate tiles from split lines
        boundaries = []
        for i in range(len(horizontal_splits) - 1):
            for j in range(len(vertical_splits) - 1):
                # Add overlap
                x1 = max(0, vertical_splits[j] - self.overlap // 2)
                y1 = max(0, horizontal_splits[i] - self.overlap // 2)
                x2 = min(width, vertical_splits[j + 1] + self.overlap // 2)
                y2 = min(height, horizontal_splits[i + 1] + self.overlap // 2)
                
                boundaries.append((x1, y1, x2, y2))
        
        return boundaries


@dataclass
class ImageTile:
    id: str
    image: np.ndarray
    bounds: Tuple[int, int, int, int]  # x1, y1, x2, y2 in original image
    overlap_regions: List[OverlapRegion]
    
    def transform_to_original(self, polygon: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Transform polygon coordinates from tile space to original image space."""
        x_offset, y_offset = self.bounds[0], self.bounds[1]
        return [(x + x_offset, y + y_offset) for x, y in polygon]
```

#### 2. Parallel Tile Processing

```python
class TiledZoneDetector:
    """
    Processes image tiles in parallel and merges results.
    """
    
    def __init__(
        self,
        tiler: ImageTiler,
        zone_detector: ZoneDetector,
        max_workers: int = 4
    ):
        self.tiler = tiler
        self.zone_detector = zone_detector
        self.max_workers = max_workers
    
    async def process(
        self,
        image: np.ndarray,
        phase0_result: Optional[ColorBoundaryResult] = None
    ) -> ZoneResult:
        """
        Process image with tiling if necessary.
        """
        if not self.tiler.should_tile(image):
            # Small image: process directly
            return await self.zone_detector.process(image, phase0_result)
        
        # Large image: tile and process
        tiles = self.tiler.create_tiles(image, phase0_result)
        
        # Process tiles in parallel
        tile_results = await asyncio.gather(*[
            self._process_tile(tile, phase0_result)
            for tile in tiles
        ])
        
        # Merge results
        return self._merge_tile_results(tile_results, image.shape)
    
    async def _process_tile(
        self,
        tile: ImageTile,
        phase0_result: Optional[ColorBoundaryResult]
    ) -> TileZoneResult:
        """Process a single tile."""
        # Crop Phase 0 boundaries to tile region
        tile_phase0 = self._crop_phase0_to_tile(phase0_result, tile.bounds)
        
        # Run zone detection on tile
        zones = await self.zone_detector.process(tile.image, tile_phase0)
        
        # Transform coordinates back to original image space
        transformed_zones = [
            zone.transform(tile.transform_to_original)
            for zone in zones
        ]
        
        return TileZoneResult(
            tile_id=tile.id,
            zones=transformed_zones,
            bounds=tile.bounds
        )
    
    def _merge_tile_results(
        self,
        tile_results: List[TileZoneResult],
        image_shape: tuple
    ) -> ZoneResult:
        """
        Merge zone results from multiple tiles.
        Handles overlapping zones using IoU-based merging.
        """
        all_zones = []
        
        for result in tile_results:
            all_zones.extend(result.zones)
        
        # Group zones by type
        zones_by_type = defaultdict(list)
        for zone in all_zones:
            zones_by_type[zone.zone_type].append(zone)
        
        # Merge overlapping zones within each type
        merged_zones = []
        for zone_type, zones in zones_by_type.items():
            merged = self._merge_overlapping_zones(zones)
            merged_zones.extend(merged)
        
        return ZoneResult(zones=merged_zones)
    
    def _merge_overlapping_zones(
        self,
        zones: List[Zone],
        iou_threshold: float = 0.3
    ) -> List[Zone]:
        """
        Merge zones that overlap significantly.
        Uses IoU (Intersection over Union) to determine overlap.
        """
        if len(zones) <= 1:
            return zones
        
        # Build overlap graph
        merged = []
        used = set()
        
        for i, zone_a in enumerate(zones):
            if i in used:
                continue
            
            merge_group = [zone_a]
            used.add(i)
            
            for j, zone_b in enumerate(zones[i + 1:], start=i + 1):
                if j in used:
                    continue
                
                iou = self._calculate_iou(zone_a.polygon, zone_b.polygon)
                if iou > iou_threshold:
                    merge_group.append(zone_b)
                    used.add(j)
            
            # Merge the group into a single zone
            if len(merge_group) == 1:
                merged.append(merge_group[0])
            else:
                merged.append(self._union_zones(merge_group))
        
        return merged
    
    def _calculate_iou(
        self,
        poly_a: List[Tuple[int, int]],
        poly_b: List[Tuple[int, int]]
    ) -> float:
        """Calculate Intersection over Union for two polygons."""
        from shapely.geometry import Polygon
        
        shape_a = Polygon(poly_a)
        shape_b = Polygon(poly_b)
        
        if not shape_a.is_valid or not shape_b.is_valid:
            return 0.0
        
        intersection = shape_a.intersection(shape_b).area
        union = shape_a.union(shape_b).area
        
        return intersection / union if union > 0 else 0.0
    
    def _union_zones(self, zones: List[Zone]) -> Zone:
        """Create a union of multiple zones."""
        from shapely.geometry import Polygon
        from shapely.ops import unary_union
        
        shapes = [Polygon(z.polygon) for z in zones]
        merged_shape = unary_union(shapes)
        
        # Use properties from the largest zone
        primary_zone = max(zones, key=lambda z: Polygon(z.polygon).area)
        
        return Zone(
            zone_type=primary_zone.zone_type,
            polygon=list(merged_shape.exterior.coords),
            confidence=max(z.confidence for z in zones),
            metadata={
                'merged_from': len(zones),
                'merge_method': 'iou_union'
            }
        )
```

#### 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LARGE IMAGE INPUT                                │
│                         (>4000px dimension)                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TILING DECISION                                  │
│  • Check dimensions against threshold                                    │
│  • If Phase 0 boundaries available, use smart boundary alignment        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Tile 1   │   │  Tile 2   │   │  Tile N   │
            │ (2048x    │   │ (2048x    │   │ (2048x    │
            │  2048)    │   │  2048)    │   │  2048)    │
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │               │               │
                  ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Phase 1-3 │   │ Phase 1-3 │   │ Phase 1-3 │
            │ Processing│   │ Processing│   │ Processing│
            │ (parallel)│   │ (parallel)│   │ (parallel)│
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │               │               │
                  └───────────────┼───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TILE RESULT MERGER                               │
│  • Transform tile coordinates to original image space                    │
│  • Group zones by type                                                   │
│  • Merge overlapping zones using IoU threshold                          │
│  • Resolve conflicts in overlap regions                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MERGED ZONE OUTPUT                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Acceptance Criteria

- [ ] Correctly identifies images requiring tiling based on dimension threshold
- [ ] Creates overlapping tiles with configurable overlap size
- [ ] Smart boundary mode aligns tiles to Phase 0 boundaries when available
- [ ] Parallel processing of tiles reduces total processing time
- [ ] IoU-based merging correctly combines zones split across tiles
- [ ] No visible seams or discontinuities in merged zone boundaries
- [ ] Memory usage remains bounded regardless of input image size

### Configuration Options

```yaml
tiled_processing:
  enabled: true
  dimension_threshold: 4000  # pixels
  tile_size: 2048
  overlap: 256
  smart_boundaries: true
  merge_iou_threshold: 0.3
  max_parallel_tiles: 4
```

---

## IMP-03: Multi-Orientation Racking Support

### Problem Statement

The current system detects a single dominant orientation for racking areas and uses this for all aisle detection. Many warehouses contain racking sections with different orientations (e.g., horizontal in receiving areas, vertical in main storage).

### Proposed Solution

Implement per-region orientation detection that identifies the dominant direction within each racking area independently.

### Technical Specification

#### 1. Orientation Detection

```python
class OrientationDetector:
    """
    Detects dominant line orientation within image regions.
    """
    
    def detect_orientation(
        self,
        image: np.ndarray,
        region_mask: Optional[np.ndarray] = None
    ) -> OrientationResult:
        """
        Detect dominant orientation in an image or masked region.
        
        Returns:
            OrientationResult with angle, confidence, and classification
        """
        # Apply region mask if provided
        if region_mask is not None:
            analysis_image = cv2.bitwise_and(image, image, mask=region_mask)
        else:
            analysis_image = image
        
        # Convert to grayscale and detect edges
        gray = cv2.cvtColor(analysis_image, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Detect lines using Hough transform
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=50,
            minLineLength=100,
            maxLineGap=10
        )
        
        if lines is None or len(lines) == 0:
            return OrientationResult(
                angle=0,
                confidence=0,
                classification='unknown'
            )
        
        # Calculate angle distribution
        angles = []
        weights = []  # weight by line length
        
        for line in lines:
            x1, y1, x2, y2 = line[0]
            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
            angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
            
            # Normalize to 0-180 range
            angle = angle % 180
            
            angles.append(angle)
            weights.append(length)
        
        # Find dominant orientation using weighted histogram
        hist, bin_edges = np.histogram(
            angles,
            bins=180,
            range=(0, 180),
            weights=weights
        )
        
        # Smooth histogram to find peaks
        from scipy.ndimage import gaussian_filter1d
        smoothed = gaussian_filter1d(hist, sigma=5)
        
        dominant_angle = bin_edges[np.argmax(smoothed)]
        confidence = np.max(smoothed) / np.sum(smoothed) if np.sum(smoothed) > 0 else 0
        
        # Classify orientation
        classification = self._classify_angle(dominant_angle)
        
        return OrientationResult(
            angle=dominant_angle,
            confidence=confidence,
            classification=classification,
            angle_distribution=list(zip(bin_edges[:-1], smoothed.tolist()))
        )
    
    def _classify_angle(self, angle: float) -> str:
        """Classify angle into orientation category."""
        # Normalize to 0-90 range (symmetric)
        normalized = angle if angle <= 90 else 180 - angle
        
        if normalized < 15:
            return 'horizontal'
        elif normalized > 75:
            return 'vertical'
        else:
            return 'diagonal'


@dataclass
class OrientationResult:
    angle: float  # degrees, 0-180
    confidence: float  # 0-1
    classification: str  # 'horizontal', 'vertical', 'diagonal', 'unknown'
    angle_distribution: Optional[List[Tuple[float, float]]] = None
```

#### 2. Per-Region Orientation Analysis

```python
class RegionOrientationAnalyzer:
    """
    Analyzes orientation for each detected region independently.
    """
    
    def __init__(self, orientation_detector: OrientationDetector):
        self.detector = orientation_detector
    
    def analyze_regions(
        self,
        image: np.ndarray,
        regions: List[DetectedRegion]
    ) -> Dict[str, OrientationResult]:
        """
        Detect orientation for each region.
        
        Args:
            image: Full image
            regions: List of detected regions with polygon boundaries
            
        Returns:
            Dictionary mapping region_id to OrientationResult
        """
        results = {}
        
        for region in regions:
            # Create mask for this region
            mask = np.zeros(image.shape[:2], dtype=np.uint8)
            cv2.fillPoly(mask, [np.array(region.polygon)], 255)
            
            # Detect orientation within region
            orientation = self.detector.detect_orientation(image, mask)
            results[region.id] = orientation
        
        return results
    
    def group_by_orientation(
        self,
        regions: List[DetectedRegion],
        orientations: Dict[str, OrientationResult],
        angle_tolerance: float = 15.0
    ) -> Dict[str, List[DetectedRegion]]:
        """
        Group regions by similar orientation.
        
        Useful for batch processing regions with the same orientation
        using shared aisle detection parameters.
        """
        groups = defaultdict(list)
        
        for region in regions:
            orientation = orientations.get(region.id)
            if orientation is None:
                groups['unknown'].append(region)
                continue
            
            # Find matching group
            matched = False
            for group_angle in list(groups.keys()):
                if group_angle == 'unknown':
                    continue
                if abs(float(group_angle) - orientation.angle) < angle_tolerance:
                    groups[group_angle].append(region)
                    matched = True
                    break
            
            if not matched:
                groups[str(orientation.angle)].append(region)
        
        return dict(groups)
```

#### 3. Modified Aisle Detection

```python
class OrientationAwareAisleDetector:
    """
    Detects aisles using per-region orientation information.
    """
    
    def __init__(self, base_detector: AisleDetector):
        self.base_detector = base_detector
    
    def detect_aisles(
        self,
        image: np.ndarray,
        region: DetectedRegion,
        orientation: OrientationResult
    ) -> List[DetectedAisle]:
        """
        Detect aisles within a region using region-specific orientation.
        """
        # Rotate image to align with horizontal if needed
        if orientation.classification == 'vertical':
            rotated_image, transform = self._rotate_to_horizontal(
                image, region, orientation.angle
            )
        else:
            rotated_image = image
            transform = lambda x: x
        
        # Run standard aisle detection on rotated image
        aisles = self.base_detector.detect(rotated_image, region)
        
        # Transform aisle coordinates back to original orientation
        if orientation.classification == 'vertical':
            aisles = [
                self._inverse_transform_aisle(aisle, transform)
                for aisle in aisles
            ]
        
        # Add orientation metadata
        for aisle in aisles:
            aisle.metadata['detected_orientation'] = orientation.classification
            aisle.metadata['orientation_angle'] = orientation.angle
        
        return aisles
    
    def _rotate_to_horizontal(
        self,
        image: np.ndarray,
        region: DetectedRegion,
        angle: float
    ) -> Tuple[np.ndarray, Callable]:
        """
        Rotate image region to make racking horizontal.
        Returns rotated image and inverse transform function.
        """
        # Calculate rotation needed
        rotation_angle = 90 - angle if angle > 45 else -angle
        
        # Get region center
        center = self._polygon_centroid(region.polygon)
        
        # Create rotation matrix
        M = cv2.getRotationMatrix2D(center, rotation_angle, 1.0)
        
        # Rotate image
        rotated = cv2.warpAffine(
            image,
            M,
            (image.shape[1], image.shape[0]),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT
        )
        
        # Create inverse transform
        M_inv = cv2.getRotationMatrix2D(center, -rotation_angle, 1.0)
        
        def inverse_transform(point):
            pt = np.array([[point[0], point[1], 1]])
            transformed = M_inv @ pt.T
            return (int(transformed[0, 0]), int(transformed[1, 0]))
        
        return rotated, inverse_transform
```

#### 4. Updated Preprocessing Hints

```python
def generate_preprocessing_hints(
    image: np.ndarray,
    regions: List[DetectedRegion],
    orientations: Dict[str, OrientationResult]
) -> dict:
    """
    Generate enhanced preprocessing hints including per-region orientation.
    """
    return {
        # Existing hints...
        'edge_detection': {...},
        'region_segmentation': {...},
        
        # NEW: Per-region orientation data
        'region_orientations': {
            region.id: {
                'angle': orientations[region.id].angle,
                'classification': orientations[region.id].classification,
                'confidence': orientations[region.id].confidence
            }
            for region in regions
            if region.id in orientations
        },
        
        # NEW: Orientation groups for AI context
        'orientation_groups': {
            'horizontal_regions': [
                r.id for r in regions
                if orientations.get(r.id, {}).classification == 'horizontal'
            ],
            'vertical_regions': [
                r.id for r in regions
                if orientations.get(r.id, {}).classification == 'vertical'
            ],
            'mixed_orientation': len(set(
                orientations.get(r.id, OrientationResult(0, 0, 'unknown')).classification
                for r in regions
            )) > 1
        }
    }
```

### Acceptance Criteria

- [ ] Correctly identifies horizontal, vertical, and diagonal orientations
- [ ] Per-region orientation detection with >85% accuracy
- [ ] Aisle detection works correctly for both horizontal and vertical racking
- [ ] Handles warehouses with mixed orientations in different sections
- [ ] Orientation metadata included in zone output
- [ ] Processing time increase <20% compared to single-orientation mode

---

## IMP-04: Enhanced Zone Type Detection

### Problem Statement

Current zone types don't cover all features found in complex warehouse floorplans, including turntable conveyors, staging areas, and cross-dock lanes.

### Proposed Solution

Extend the zone type taxonomy with additional types and add detection signatures for specialized equipment.

### Technical Specification

#### 1. Extended Zone Type Taxonomy

```python
class ZoneType(Enum):
    # Existing types
    TRAVEL_LANE = "travel_lane"
    AISLE_PATH = "aisle_path"
    PARKING_LOT = "parking_lot"
    RACKING = "racking"
    RACKING_AREA = "racking_area"
    DOCKING_AREA = "docking_area"
    CONVEYOR_AREA = "conveyor_area"
    ADMINISTRATIVE = "administrative"
    STORAGE_FLOOR = "storage_floor"
    
    # NEW types
    TURNTABLE_AREA = "turntable_area"      # Circular conveyor/turntable zones
    STAGING_AREA = "staging_area"           # Temporary staging near docks
    CROSS_DOCK_LANE = "cross_dock_lane"     # Directional cross-dock paths
    MEZZANINE = "mezzanine"                 # Elevated platform areas
    CHARGING_STATION = "charging_station"   # Forklift/equipment charging
    MAINTENANCE_AREA = "maintenance_area"   # Equipment maintenance zones
    QUALITY_CONTROL = "quality_control"     # QC/inspection areas
    COLD_STORAGE = "cold_storage"           # Refrigerated zones
    HAZMAT_AREA = "hazmat_area"             # Hazardous material storage


ZONE_TYPE_METADATA = {
    ZoneType.TRAVEL_LANE: {
        "travelable": True,
        "speed_default": "normal",
        "description": "Main corridors for vehicle movement"
    },
    ZoneType.TURNTABLE_AREA: {
        "travelable": False,
        "speed_default": None,
        "description": "Circular conveyor or turntable equipment",
        "detection_hints": ["circular_shape", "conveyor_connection"]
    },
    ZoneType.STAGING_AREA: {
        "travelable": True,
        "speed_default": "slow",
        "description": "Temporary staging zones near docks or processing",
        "detection_hints": ["near_docking", "open_floor", "rectangular"]
    },
    ZoneType.CROSS_DOCK_LANE: {
        "travelable": True,
        "speed_default": "normal",
        "directional": True,
        "description": "Lanes for direct dock-to-dock movement",
        "detection_hints": ["connects_docks", "wide_lane"]
    },
    # ... additional metadata
}
```

#### 2. Equipment Signature Detection

```python
class EquipmentSignatureDetector:
    """
    Detects specific equipment patterns in floorplan images.
    """
    
    def detect_turntables(self, image: np.ndarray) -> List[DetectedEquipment]:
        """
        Detect circular turntable/conveyor patterns.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect circles using Hough transform
        circles = cv2.HoughCircles(
            gray,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=100,
            param1=50,
            param2=30,
            minRadius=30,
            maxRadius=200
        )
        
        equipment = []
        if circles is not None:
            for circle in circles[0]:
                x, y, radius = circle
                equipment.append(DetectedEquipment(
                    type='turntable',
                    center=(int(x), int(y)),
                    radius=int(radius),
                    confidence=0.8
                ))
        
        return equipment
    
    def detect_dock_doors(self, image: np.ndarray) -> List[DetectedEquipment]:
        """
        Detect dock door patterns along building edges.
        """
        # Implementation: Look for regular rectangular patterns
        # along image edges with consistent spacing
        pass
    
    def detect_conveyor_lines(self, image: np.ndarray) -> List[DetectedEquipment]:
        """
        Detect linear conveyor patterns.
        """
        # Implementation: Detect parallel lines with consistent spacing
        # that don't match racking patterns
        pass


@dataclass
class DetectedEquipment:
    type: str
    center: Tuple[int, int]
    radius: Optional[int] = None  # For circular equipment
    bounds: Optional[Tuple[int, int, int, int]] = None  # For rectangular
    confidence: float = 0.0
```

#### 3. Classification Enhancement for AI

Update the Claude prompt to include new zone types:

```python
ZONE_CLASSIFICATION_PROMPT_ADDITION = """
## Additional Zone Types to Detect

In addition to standard zones, identify these specialized areas:

1. **turntable_area**: Circular equipment patterns, typically conveyor turntables
   - Visual: Circular shapes, often connected to conveyor lines
   - Location: Usually along conveyor paths or at intersections

2. **staging_area**: Open floor space used for temporary staging
   - Visual: Open rectangular areas near docks or processing zones
   - Location: Adjacent to docking_area or conveyor_area
   - Distinct from travel_lane: May have markings for pallet positions

3. **cross_dock_lane**: Wide lanes connecting dock areas
   - Visual: Wider than standard travel lanes, may have directional markings
   - Location: Runs from one dock area to another
   - Purpose: Facilitates direct transfer without storage

4. **charging_station**: Forklift/equipment charging areas
   - Visual: Small rectangular zones, often along walls
   - May have electrical conduit markings

When equipment signatures are provided in preprocessing hints, use these to
inform zone classification. Circular equipment signatures suggest turntable_area.
"""
```

### Acceptance Criteria

- [ ] All new zone types properly defined with metadata
- [ ] Turntable detection identifies circular patterns with >80% precision
- [ ] Staging areas correctly distinguished from travel lanes
- [ ] AI prompt updated with new zone type descriptions
- [ ] Zone output schema supports new types
- [ ] Backward compatible with existing zone type consumers

---

## IMP-05: Adaptive Hybrid Decision Threshold

### Problem Statement

The fixed threshold (`validated_aisles >= 3`) for choosing between CV and AI aisle detection doesn't account for region size, image quality, or preprocessing confidence.

### Proposed Solution

Implement an adaptive threshold calculation that considers multiple factors.

### Technical Specification

```python
class AdaptiveHybridDecision:
    """
    Determines whether to use CV or AI for aisle subdivision
    based on multiple factors.
    """
    
    # Base thresholds
    MIN_AISLES_BASE = 3
    MIN_CONFIDENCE_BASE = 0.7
    
    def should_use_cv(
        self,
        preprocessing_result: PreprocessingResult,
        region: DetectedRegion,
        image_stats: ImageStats
    ) -> HybridDecision:
        """
        Determine whether CV results are sufficient or AI is needed.
        
        Returns:
            HybridDecision with recommendation and reasoning
        """
        factors = self._calculate_factors(
            preprocessing_result, region, image_stats
        )
        
        # Calculate adaptive thresholds
        aisle_threshold = self._calculate_aisle_threshold(factors)
        confidence_threshold = self._calculate_confidence_threshold(factors)
        
        # Evaluate CV quality
        cv_aisles = preprocessing_result.validated_aisles
        cv_confidence = preprocessing_result.aisle_confidence_mean
        
        use_cv = (
            cv_aisles >= aisle_threshold and
            cv_confidence >= confidence_threshold
        )
        
        return HybridDecision(
            use_cv=use_cv,
            aisle_threshold=aisle_threshold,
            confidence_threshold=confidence_threshold,
            cv_aisles=cv_aisles,
            cv_confidence=cv_confidence,
            factors=factors,
            reasoning=self._generate_reasoning(use_cv, factors)
        )
    
    def _calculate_factors(
        self,
        preprocessing_result: PreprocessingResult,
        region: DetectedRegion,
        image_stats: ImageStats
    ) -> dict:
        """Calculate decision factors."""
        return {
            'region_area': region.area,
            'region_area_ratio': region.area / image_stats.total_area,
            'edge_density': preprocessing_result.edge_density,
            'has_color_boundaries': preprocessing_result.color_boundaries_present,
            'color_boundary_coverage': preprocessing_result.color_boundary_coverage,
            'orientation_confidence': preprocessing_result.orientation_confidence,
            'image_resolution': image_stats.resolution,
            'noise_level': image_stats.estimated_noise
        }
    
    def _calculate_aisle_threshold(self, factors: dict) -> int:
        """
        Calculate minimum aisles required based on region size.
        Larger regions need more validated aisles for confidence.
        """
        base = self.MIN_AISLES_BASE
        
        # Scale with region size
        if factors['region_area_ratio'] > 0.2:
            base += 2  # Large region: need more aisles
        elif factors['region_area_ratio'] > 0.1:
            base += 1
        
        # Reduce threshold if color boundaries present
        if factors['has_color_boundaries'] and factors['color_boundary_coverage'] > 0.5:
            base -= 1
        
        return max(2, base)  # Minimum of 2
    
    def _calculate_confidence_threshold(self, factors: dict) -> float:
        """
        Calculate minimum confidence required based on image quality.
        """
        base = self.MIN_CONFIDENCE_BASE
        
        # Increase threshold for noisy images
        if factors['noise_level'] > 0.3:
            base += 0.1
        
        # Decrease threshold for high-resolution images
        if factors['image_resolution'] > 5000:
            base -= 0.05
        
        # Decrease threshold if orientation is clear
        if factors['orientation_confidence'] > 0.9:
            base -= 0.05
        
        return min(0.9, max(0.5, base))
    
    def _generate_reasoning(self, use_cv: bool, factors: dict) -> str:
        """Generate human-readable reasoning for the decision."""
        if use_cv:
            return (
                f"Using CV: Sufficient validated aisles with adequate confidence. "
                f"Region covers {factors['region_area_ratio']*100:.1f}% of image."
            )
        else:
            return (
                f"Using AI: CV results insufficient. "
                f"Factors: edge_density={factors['edge_density']:.2f}, "
                f"noise={factors['noise_level']:.2f}"
            )


@dataclass
class HybridDecision:
    use_cv: bool
    aisle_threshold: int
    confidence_threshold: float
    cv_aisles: int
    cv_confidence: float
    factors: dict
    reasoning: str
```

### Acceptance Criteria

- [ ] Adaptive threshold produces different values based on region/image characteristics
- [ ] Large regions require more validated aisles
- [ ] Color boundary presence reduces threshold appropriately
- [ ] Decision reasoning is logged for debugging
- [ ] Overall accuracy improves compared to fixed threshold

---

## IMP-06: Preprocessing Hint Enhancement

### Problem Statement

Current preprocessing hints don't include all information useful for AI analysis, such as detected equipment signatures, scale estimates, and orientation groups.

### Proposed Solution

Extend the preprocessing hints schema with additional contextual information.

### Technical Specification

```python
@dataclass
class EnhancedPreprocessingHints:
    """
    Extended preprocessing hints for AI phases.
    """
    
    # Existing fields
    edge_detection: EdgeDetectionHints
    region_segmentation: RegionSegmentationHints
    aisle_detection: AisleDetectionHints
    
    # NEW: Phase 0 color boundaries
    detected_colored_boundaries: List[ColorBoundaryHint]
    boundary_coverage_ratio: float
    
    # NEW: Per-region orientations
    region_orientations: Dict[str, RegionOrientationHint]
    orientation_groups: OrientationGroups
    
    # NEW: Equipment signatures
    equipment_signatures: List[EquipmentSignatureHint]
    
    # NEW: Scale estimation
    scale_estimate: ScaleEstimate
    
    # NEW: Image quality metrics
    image_quality: ImageQualityMetrics
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'edge_detection': asdict(self.edge_detection),
            'region_segmentation': asdict(self.region_segmentation),
            'aisle_detection': asdict(self.aisle_detection),
            'detected_colored_boundaries': [
                asdict(b) for b in self.detected_colored_boundaries
            ],
            'boundary_coverage_ratio': self.boundary_coverage_ratio,
            'region_orientations': {
                k: asdict(v) for k, v in self.region_orientations.items()
            },
            'orientation_groups': asdict(self.orientation_groups),
            'equipment_signatures': [
                asdict(e) for e in self.equipment_signatures
            ],
            'scale_estimate': asdict(self.scale_estimate),
            'image_quality': asdict(self.image_quality)
        }


@dataclass
class ColorBoundaryHint:
    polygon: List[Tuple[int, int]]
    color: str
    area_px: int
    confidence: float


@dataclass
class RegionOrientationHint:
    angle: float
    classification: str  # 'horizontal', 'vertical', 'diagonal'
    confidence: float


@dataclass
class OrientationGroups:
    horizontal_regions: List[str]
    vertical_regions: List[str]
    diagonal_regions: List[str]
    has_mixed_orientations: bool


@dataclass
class EquipmentSignatureHint:
    type: str  # 'turntable', 'dock_door', 'conveyor', etc.
    location: Tuple[int, int]
    bounds: Optional[Tuple[int, int, int, int]] = None
    radius: Optional[int] = None
    confidence: float = 0.0


@dataclass
class ScaleEstimate:
    """
    Estimated real-world scale based on detected features.
    """
    detected_aisle_width_px: Optional[float] = None
    estimated_aisle_width_m: float = 3.0  # default assumption
    pixels_per_meter: Optional[float] = None
    confidence: float = 0.0
    method: str = 'default'  # 'aisle_width', 'dock_door', 'default'


@dataclass
class ImageQualityMetrics:
    resolution: Tuple[int, int]
    estimated_noise: float
    contrast_ratio: float
    edge_density: float
    is_high_quality: bool
```

### Updated AI Prompt Section

```python
PREPROCESSING_HINTS_PROMPT = """
## Preprocessing Analysis Results

The following preprocessing analysis has been performed on this image:

### Color Boundaries Detected
{boundary_summary}

### Region Orientations
{orientation_summary}

### Equipment Signatures
{equipment_summary}

### Scale Estimate
- Estimated aisle width: {scale.estimated_aisle_width_m}m
- Confidence: {scale.confidence}
- Method: {scale.method}

### Image Quality
- Resolution: {quality.resolution}
- Quality assessment: {'High' if quality.is_high_quality else 'Standard'}

Use these hints to inform your zone detection. Pre-detected colored boundaries
should be treated as high-confidence zone edges. Equipment signatures indicate
specialized zone types.
"""
```

### Acceptance Criteria

- [ ] All new hint fields populated correctly
- [ ] Hints serializable to JSON for API transport
- [ ] Scale estimation provides reasonable values
- [ ] Image quality metrics accurately reflect input characteristics
- [ ] AI phases can parse and utilize enhanced hints

---

## IMP-07: Performance Optimization

### Problem Statement

Processing large, complex floorplans can be slow, especially when multiple AI calls are required for sub-agent analysis.

### Proposed Solution

Implement optimizations including progressive loading, caching, and parallel processing.

### Technical Specification

#### 1. Progressive Loading

```python
class ProgressiveProcessor:
    """
    Processes images progressively, starting with low resolution
    for quick initial results, then refining with high resolution.
    """
    
    LOW_RES_MAX = 1500  # pixels
    
    async def process_progressive(
        self,
        image: np.ndarray,
        callback: Optional[Callable] = None
    ) -> ZoneResult:
        """
        Process image in two passes:
        1. Low-resolution for quick initial zones
        2. High-resolution for refinement
        """
        height, width = image.shape[:2]
        
        # Phase 1: Low-resolution processing
        if max(width, height) > self.LOW_RES_MAX:
            scale = self.LOW_RES_MAX / max(width, height)
            low_res = cv2.resize(image, None, fx=scale, fy=scale)
            
            # Quick initial detection
            initial_zones = await self._quick_detect(low_res)
            
            # Notify callback with initial results
            if callback:
                callback(ProgressUpdate(
                    phase='initial',
                    zones=self._scale_zones(initial_zones, 1/scale),
                    confidence='low',
                    message='Initial detection complete, refining...'
                ))
        else:
            initial_zones = None
        
        # Phase 2: Full-resolution processing
        # Focus on areas flagged as uncertain or needing subdivision
        final_zones = await self._full_detect(
            image,
            initial_hints=initial_zones
        )
        
        if callback:
            callback(ProgressUpdate(
                phase='final',
                zones=final_zones,
                confidence='high',
                message='Detection complete'
            ))
        
        return final_zones
```

#### 2. Preprocessing Cache

```python
class PreprocessingCache:
    """
    Caches preprocessing results by image hash to avoid
    redundant computation.
    """
    
    def __init__(self, max_size: int = 100, ttl_seconds: int = 3600):
        self.cache = TTLCache(maxsize=max_size, ttl=ttl_seconds)
    
    def get_or_compute(
        self,
        image: np.ndarray,
        compute_fn: Callable[[np.ndarray], PreprocessingResult]
    ) -> PreprocessingResult:
        """
        Return cached result or compute and cache.
        """
        image_hash = self._compute_hash(image)
        
        if image_hash in self.cache:
            return self.cache[image_hash]
        
        result = compute_fn(image)
        self.cache[image_hash] = result
        
        return result
    
    def _compute_hash(self, image: np.ndarray) -> str:
        """Compute perceptual hash of image."""
        # Resize to small fixed size for hashing
        small = cv2.resize(image, (32, 32))
        return hashlib.md5(small.tobytes()).hexdigest()
```

#### 3. Parallel Sub-Agent Processing

```python
class ParallelSubAgentProcessor:
    """
    Processes multiple racking areas with sub-agents in parallel.
    """
    
    def __init__(self, max_concurrent: int = 4, rate_limit: float = 0.5):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.rate_limit = rate_limit
        self.last_call_time = 0
    
    async def process_regions(
        self,
        image: np.ndarray,
        regions: List[DetectedRegion],
        preprocessing: PreprocessingResult
    ) -> List[SubdivisionResult]:
        """
        Process multiple regions in parallel with rate limiting.
        """
        tasks = [
            self._process_with_limit(image, region, preprocessing)
            for region in regions
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle any exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logging.error(f"Region {regions[i].id} failed: {result}")
                processed_results.append(SubdivisionResult(
                    region_id=regions[i].id,
                    success=False,
                    error=str(result)
                ))
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def _process_with_limit(
        self,
        image: np.ndarray,
        region: DetectedRegion,
        preprocessing: PreprocessingResult
    ) -> SubdivisionResult:
        """Process single region with concurrency and rate limiting."""
        async with self.semaphore:
            # Rate limiting
            elapsed = time.time() - self.last_call_time
            if elapsed < self.rate_limit:
                await asyncio.sleep(self.rate_limit - elapsed)
            
            self.last_call_time = time.time()
            
            # Process region
            return await self._call_sub_agent(image, region, preprocessing)
```

#### 4. Early Termination for High-Coverage Phase 0

```python
class EarlyTerminationOptimizer:
    """
    Skips expensive processing when Phase 0 provides sufficient coverage.
    """
    
    COVERAGE_THRESHOLD = 0.8
    
    def should_skip_phase1(
        self,
        phase0_result: ColorBoundaryResult
    ) -> bool:
        """
        Determine if Phase 1 preprocessing can be skipped.
        """
        return (
            phase0_result.coverage_ratio > self.COVERAGE_THRESHOLD and
            len(phase0_result.boundaries) >= 3 and
            self._boundaries_are_closed(phase0_result.boundaries)
        )
    
    def create_fast_track_hints(
        self,
        phase0_result: ColorBoundaryResult
    ) -> PreprocessingHints:
        """
        Create minimal preprocessing hints from Phase 0 results only.
        """
        return PreprocessingHints(
            detected_colored_boundaries=phase0_result.to_hints()['detected_colored_boundaries'],
            boundary_coverage_ratio=phase0_result.coverage_ratio,
            fast_track=True,
            fast_track_reason='High Phase 0 coverage'
        )
```

### Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Small image (<2000px) | ~15s | <10s |
| Medium image (2000-4000px) | ~30s | <20s |
| Large image (>4000px) | ~60s+ | <40s |
| Cache hit processing | N/A | <2s |
| Initial progressive result | N/A | <5s |

### Acceptance Criteria

- [ ] Progressive loading provides initial results within 5 seconds
- [ ] Cache hit rate >50% for repeated similar images
- [ ] Parallel sub-agent processing reduces time by >40% for multi-region images
- [ ] Early termination correctly triggers for high-coverage Phase 0 results
- [ ] Memory usage remains bounded during parallel processing
- [ ] Rate limiting prevents API throttling

---

## Implementation Priority

### Phase 1 (Immediate Impact)

1. **IMP-01**: Color Boundary Detection - Immediate win for floorplans with pre-drawn boundaries
2. **IMP-02**: Tiled Processing - Essential for large images

### Phase 2 (Accuracy Improvements)

3. **IMP-03**: Multi-Orientation Support - Critical for complex warehouses
4. **IMP-05**: Adaptive Hybrid Threshold - Improves CV/AI decision quality

### Phase 3 (Polish)

5. **IMP-04**: Enhanced Zone Types - Better classification
6. **IMP-06**: Enhanced Hints - More context for AI
7. **IMP-07**: Performance Optimization - Speed improvements

---

## Testing Requirements

### Unit Tests

- Color detection accuracy on sample boundary colors
- Tiling boundary calculation correctness
- Orientation detection across various angles
- IoU merge algorithm correctness
- Adaptive threshold calculations

### Integration Tests

- End-to-end processing of sample warehouse floorplans
- Tile merge produces contiguous zones
- Phase 0 fast-track produces valid results
- Parallel processing maintains consistency

### Benchmark Tests

- Processing time for various image sizes
- Memory usage during tiled processing
- Cache effectiveness measurement
- Comparison of CV vs AI accuracy

---

## Dependencies

### Python Packages

```
opencv-python>=4.8.0
numpy>=1.24.0
scipy>=1.11.0
shapely>=2.0.0
cachetools>=5.3.0
```

### External Services

- Claude API (Opus for coarse detection, Sonnet for sub-agents)
- Existing preprocessing server infrastructure

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-27 | Solution Delivery | Initial specification |
