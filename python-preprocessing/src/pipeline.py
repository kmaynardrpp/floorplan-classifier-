"""
Main Preprocessing Pipeline for Floorplan Analysis

Combines edge detection, region segmentation, and line detection
to produce comprehensive hints for the Gemini AI model.
"""

import cv2
import numpy as np
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import base64
import io
from PIL import Image

from .edge_detection import process_edges, edge_result_to_dict
from .region_segmentation import process_segmentation, segmentation_result_to_dict, RegionType
from .line_detection import process_lines, line_result_to_dict, AisleCandidate
from .boundary_detection import detect_floorplan_boundary, ContentBoundary
from .config.phase0_config import Phase0Config
from .color_boundary.detector import ColorBoundaryDetector
from .color_boundary.models import ColorBoundaryResult
from .color_boundary.fast_track import (
    should_fast_track,
    create_fast_track_hints,
    merge_color_boundaries_into_hints,
)
from .coverage_input import (
    CoverageBoundary,
    load_coverage_from_json,
    coverage_to_mask,
    filter_2d_coverage_boundaries,
    get_coverage_union_mask,
)
from .travel_lane_detection import (
    TravelLaneSuggestion,
    detect_travel_lanes_standalone,
    detect_travel_lanes_within_coverage,
)


@dataclass
class PreprocessingConfig:
    """Configuration for the preprocessing pipeline"""
    # Phase 0: Color boundary detection
    phase0_config: Phase0Config = None  # Will default in __post_init__

    # Edge detection
    use_color_detection: bool = True
    use_canny: bool = True

    # Region segmentation
    density_window: int = 50
    min_region_area: int = 5000

    # Line detection
    min_line_length: int = 30
    line_cluster_distance: float = 100.0

    def __post_init__(self):
        """Initialize default Phase0Config if not provided."""
        if self.phase0_config is None:
            self.phase0_config = Phase0Config.default()


@dataclass
class PreprocessingResult:
    """Combined results from all preprocessing stages"""
    edge_data: Dict[str, Any]
    segmentation_data: Dict[str, Any]
    line_data: Dict[str, Any]
    gemini_hints: Dict[str, Any]
    visualizations: Dict[str, np.ndarray]
    content_boundary: Optional[ContentBoundary] = None  # Detected floorplan boundary
    phase0_result: Optional[ColorBoundaryResult] = None  # Phase 0 color detection result
    fast_track: bool = False  # True if fast-track mode was used
    travel_lane_suggestions: List[TravelLaneSuggestion] = None  # Travel lane detections

    def __post_init__(self):
        if self.travel_lane_suggestions is None:
            self.travel_lane_suggestions = []


def generate_gemini_hints(
    edge_data: Dict[str, Any],
    segmentation_data: Dict[str, Any],
    line_data: Dict[str, Any],
    image_width: int,
    image_height: int,
    content_boundary: Optional[ContentBoundary] = None,
) -> Dict[str, Any]:
    """
    Generate structured hints for the Gemini model based on preprocessing results.

    These hints guide Gemini to:
    1. Focus on detected boundary contours for zone polygons
    2. Use density information to classify regions
    3. Leverage line cluster data for racking/aisle detection
    """
    hints = {
        "image_dimensions": {
            "width": image_width,
            "height": image_height,
        },
        "content_boundary": {
            "description": "Detected floorplan content area (excluding margins)",
            "x": content_boundary.x if content_boundary else 0,
            "y": content_boundary.y if content_boundary else 0,
            "width": content_boundary.width if content_boundary else image_width,
            "height": content_boundary.height if content_boundary else image_height,
            "confidence": content_boundary.confidence if content_boundary else 1.0,
        },
        "detected_boundaries": {
            "description": "Orange/brown boundary lines detected via color filtering",
            "contour_count": len(edge_data.get("contours", [])),
            "suggested_zone_polygons": [],
        },
        "region_analysis": {
            "description": "Density-based region segmentation",
            "dense_regions": [],  # Likely racking/storage
            "sparse_regions": [],  # Likely aisles/travel lanes
        },
        "racking_analysis": {
            "description": "Parallel line clusters indicating racking rows",
            "racking_sections": [],
            "detected_aisles": [],
        },
        "recommendations": [],
    }

    # Process boundary contours as suggested zone polygons
    for i, contour in enumerate(edge_data.get("contours", [])):
        if contour["area"] > 10000:  # Only significant contours
            hints["detected_boundaries"]["suggested_zone_polygons"].append({
                "id": i + 1,
                "vertices": contour["vertices"],
                "area": contour["area"],
                "suggestion": "Consider as zone boundary - trace these vertices",
            })

    # Process segmentation regions
    for region in segmentation_data.get("regions", []):
        region_info = {
            "id": region["id"],
            "bounding_box": region["bounding_box"],
            "density_score": region["density_score"],
            "area": region["area"],
            "centroid": region["centroid"],
        }

        if region["region_type"] == "dense":
            region_info["suggested_type"] = "racking_area"
            region_info["needs_subdivision"] = True
            hints["region_analysis"]["dense_regions"].append(region_info)
        else:
            region_info["suggested_type"] = "travel_lane or open_floor"
            region_info["needs_subdivision"] = False
            hints["region_analysis"]["sparse_regions"].append(region_info)

    # Process line clusters for racking analysis
    for cluster in line_data.get("line_clusters", []):
        hints["racking_analysis"]["racking_sections"].append({
            "id": cluster["id"],
            "orientation": cluster["orientation"],
            "bounding_box": cluster["bounding_box"],
            "line_count": cluster["line_count"],
            "average_line_spacing": cluster["average_spacing"],
            "suggestion": f"Racking area with {cluster['orientation']} rows",
        })

    # Process detected aisles
    for aisle in line_data.get("aisle_candidates", []):
        hints["racking_analysis"]["detected_aisles"].append({
            "id": aisle["id"],
            "orientation": aisle["orientation"],
            "width": aisle["width"],
            "centerline": aisle["centerline"],
            "bounding_box": aisle["bounding_box"],
            "suggestion": f"{aisle['orientation'].capitalize()} aisle path between racking",
        })

    # Generate recommendations
    stats = {
        "boundary_contours": len(edge_data.get("contours", [])),
        "dense_regions": len(hints["region_analysis"]["dense_regions"]),
        "sparse_regions": len(hints["region_analysis"]["sparse_regions"]),
        "racking_sections": len(hints["racking_analysis"]["racking_sections"]),
        "aisles": len(hints["racking_analysis"]["detected_aisles"]),
    }

    if stats["boundary_contours"] > 0:
        hints["recommendations"].append(
            f"Found {stats['boundary_contours']} boundary contours - use these as starting points for zone polygons"
        )

    if stats["dense_regions"] > 0:
        hints["recommendations"].append(
            f"Identified {stats['dense_regions']} dense regions likely to be racking/storage areas"
        )

    if stats["racking_sections"] > 0:
        hints["recommendations"].append(
            f"Detected {stats['racking_sections']} line clusters indicating racking rows"
        )

    if stats["aisles"] > 0:
        hints["recommendations"].append(
            f"Found {stats['aisles']} potential aisles between racking sections"
        )

    return hints


def filter_margin_aisles(
    aisles: list,
    content_boundary: ContentBoundary,
    margin_threshold: int = 20,
) -> list:
    """
    Filter out aisles that are primarily in the margin area (outside content boundary).

    A lane is filtered if:
    - Its center is within margin_threshold of the content boundary edge
    - More than 50% of its area is outside the content boundary

    Args:
        aisles: List of aisle dicts with bounding_box
        content_boundary: The detected content boundary
        margin_threshold: Pixels from boundary edge to consider as margin

    Returns:
        Filtered list of aisles
    """
    cx, cy = content_boundary.x, content_boundary.y
    cw, ch = content_boundary.width, content_boundary.height

    filtered = []
    for aisle in aisles:
        bbox = aisle.get("bounding_box", {})
        x = bbox.get("x", 0)
        y = bbox.get("y", 0)
        w = bbox.get("width", 0)
        h = bbox.get("height", 0)

        if w == 0 or h == 0:
            continue

        # Calculate center
        center_x = x + w / 2
        center_y = y + h / 2

        # Check if center is inside content area with margin
        in_content = (
            cx + margin_threshold < center_x < cx + cw - margin_threshold and
            cy + margin_threshold < center_y < cy + ch - margin_threshold
        )

        if in_content:
            filtered.append(aisle)
        else:
            # Calculate overlap with content area
            overlap_x = max(0, min(x + w, cx + cw) - max(x, cx))
            overlap_y = max(0, min(y + h, cy + ch) - max(y, cy))
            overlap_area = overlap_x * overlap_y
            aisle_area = w * h

            # Keep if >70% overlap with content
            if aisle_area > 0 and overlap_area / aisle_area > 0.7:
                filtered.append(aisle)

    return filtered


def preprocess_floorplan(
    image: np.ndarray,
    config: Optional[PreprocessingConfig] = None,
    coverage_boundaries: Optional[List[CoverageBoundary]] = None,
) -> PreprocessingResult:
    """
    Run the complete preprocessing pipeline on a floorplan image.

    Args:
        image: BGR image (from cv2.imread or decoded from base64)
        config: Optional configuration overrides
        coverage_boundaries: Optional list of coverage boundaries for constrained travel lane detection.
            If provided, travel lanes are detected within 2D coverage areas.
            If not provided, travel lanes are detected anywhere in the image.

    Returns:
        PreprocessingResult with all analysis data and visualizations
    """
    if config is None:
        config = PreprocessingConfig()

    h, w = image.shape[:2]

    # Phase 0: Color boundary detection (IMP-01)
    phase0_result = None
    fast_track = False

    if config.phase0_config.enabled:
        detector = ColorBoundaryDetector(
            min_contour_area=config.phase0_config.min_contour_area,
        )
        phase0_result = detector.detect(image)

        # Check if fast-track mode should be used
        if should_fast_track(phase0_result, config.phase0_config):
            fast_track = True
            # Generate fast-track hints and return early
            gemini_hints = create_fast_track_hints(phase0_result)
            gemini_hints["image_dimensions"] = {"width": w, "height": h}

            return PreprocessingResult(
                edge_data={},
                segmentation_data={},
                line_data={},
                gemini_hints=gemini_hints,
                visualizations={},
                content_boundary=None,
                phase0_result=phase0_result,
                fast_track=True,
            )

    # Stage 0: Detect floorplan content boundary
    content_boundary = detect_floorplan_boundary(image)

    # Stage 1: Edge Detection
    edge_result = process_edges(
        image,
        use_color_detection=config.use_color_detection,
        use_canny=config.use_canny,
    )
    edge_data = edge_result_to_dict(edge_result)

    # Stage 2: Region Segmentation
    segmentation_result = process_segmentation(
        image,
        density_window=config.density_window,
        min_region_area=config.min_region_area,
    )
    segmentation_data = segmentation_result_to_dict(segmentation_result)

    # Stage 3: Line Detection
    line_result = process_lines(
        image,
        min_line_length=config.min_line_length,
        distance_threshold=config.line_cluster_distance,
    )
    line_data = line_result_to_dict(line_result)

    # Stage 4: Filter margin aisles (LEGACY - kept for backward compatibility)
    # Only filter if we detected a content boundary smaller than the image
    if content_boundary.confidence > 0.5:
        original_count = len(line_data.get("aisle_candidates", []))
        line_data["aisle_candidates"] = filter_margin_aisles(
            line_data.get("aisle_candidates", []),
            content_boundary,
        )
        filtered_count = original_count - len(line_data.get("aisle_candidates", []))
        if filtered_count > 0:
            line_data["stats"]["margin_filtered"] = filtered_count

    # Stage 5: Travel Lane Detection (NEW - replaces aisle detection for travel paths)
    # Travel lanes are main corridors, distinct from aisles (which are now programmatic from TDOA)
    travel_lane_suggestions: List[TravelLaneSuggestion] = []

    if coverage_boundaries:
        # Constrained mode: detect travel lanes within 2D coverage areas only
        boundaries_2d = filter_2d_coverage_boundaries(coverage_boundaries)
        for boundary in boundaries_2d:
            mask = coverage_to_mask(boundary, (h, w))
            lanes = detect_travel_lanes_within_coverage(
                image, mask,
                coverage_uid=boundary.uid,
                min_width=40,
                min_length=100,
            )
            travel_lane_suggestions.extend(lanes)
    else:
        # Standalone mode: detect travel lanes anywhere in the image
        travel_lane_suggestions = detect_travel_lanes_standalone(
            image,
            min_width=40,
            min_length=200,
        )

    # Generate Gemini hints (with content boundary)
    gemini_hints = generate_gemini_hints(
        edge_data,
        segmentation_data,
        line_data,
        image_width=w,
        image_height=h,
        content_boundary=content_boundary,
    )

    # Merge Phase 0 color boundaries into hints if present (Task 2.7)
    if phase0_result is not None and len(phase0_result.boundaries) > 0:
        gemini_hints = merge_color_boundaries_into_hints(gemini_hints, phase0_result)

    # Create visualizations
    visualizations = {
        "boundary_mask": edge_result.boundary_mask,
        "density_map": segmentation_result.density_map,
        "orientation_map": line_result.orientation_map,
    }

    return PreprocessingResult(
        edge_data=edge_data,
        segmentation_data=segmentation_data,
        line_data=line_data,
        gemini_hints=gemini_hints,
        visualizations=visualizations,
        content_boundary=content_boundary,
        phase0_result=phase0_result,
        fast_track=fast_track,
        travel_lane_suggestions=travel_lane_suggestions,
    )


def image_from_base64(base64_string: str) -> np.ndarray:
    """Decode a base64 image string to numpy array"""
    # Remove data URL prefix if present
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]

    img_bytes = base64.b64decode(base64_string)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    return image


def numpy_to_base64(image: np.ndarray, format: str = "png") -> str:
    """Encode a numpy array image to base64 string"""
    # Convert BGR to RGB for PIL
    if len(image.shape) == 3:
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    else:
        image_rgb = image

    pil_image = Image.fromarray(image_rgb)
    buffer = io.BytesIO()
    pil_image.save(buffer, format=format.upper())
    buffer.seek(0)

    return base64.b64encode(buffer.read()).decode("utf-8")


def convert_numpy_types(obj: Any) -> Any:
    """Recursively convert numpy types to Python native types for JSON serialization"""
    if isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy_types(item) for item in obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.bool_):
        return bool(obj)
    else:
        return obj


def result_to_json(result: PreprocessingResult, include_visualizations: bool = False) -> Dict[str, Any]:
    """Convert PreprocessingResult to JSON-serializable dict"""
    output = {
        "edge_detection": convert_numpy_types(result.edge_data),
        "region_segmentation": convert_numpy_types(result.segmentation_data),
        "line_detection": convert_numpy_types(result.line_data),
        "gemini_hints": convert_numpy_types(result.gemini_hints),
        "fast_track": result.fast_track,
        "travel_lane_suggestions": [
            lane.to_dict() for lane in (result.travel_lane_suggestions or [])
        ],
    }

    # Include content boundary if detected
    if result.content_boundary:
        output["content_boundary"] = result.content_boundary.to_dict()

    # Include Phase 0 result if present
    if result.phase0_result:
        output["phase0"] = convert_numpy_types(result.phase0_result.to_dict())

    if include_visualizations:
        output["visualizations"] = {
            "boundary_mask": numpy_to_base64(result.visualizations["boundary_mask"]),
            "density_map": numpy_to_base64(result.visualizations["density_map"]),
            "orientation_map": numpy_to_base64(result.visualizations["orientation_map"]),
        }

    return output


def draw_aisles_visualization(
    image: np.ndarray,
    aisles: list,
    output_path: str,
    content_boundary: Optional[ContentBoundary] = None,
) -> str:
    """
    Draw detected aisles on the image and save to a file.

    Enhanced with debug information:
    - Color-coded by confidence (green=high, yellow=medium, red=low)
    - Shows centerlines
    - Shows line density indicators
    - Displays content boundary if provided

    Args:
        image: Original BGR image
        aisles: List of aisle dicts from line_data["aisle_candidates"]
        output_path: Path to save the visualization
        content_boundary: Optional content boundary to display

    Returns:
        Path to the saved visualization
    """
    import os
    import logging

    logger = logging.getLogger(__name__)

    # Create a copy to draw on
    vis = image.copy()
    h, w = vis.shape[:2]

    # Draw content boundary if provided
    if content_boundary:
        bx, by = content_boundary.x, content_boundary.y
        bw, bh = content_boundary.width, content_boundary.height
        cv2.rectangle(vis, (bx, by), (bx + bw, by + bh), (255, 0, 255), 3)  # Magenta
        cv2.putText(vis, f"Content Boundary (conf={content_boundary.confidence:.2f})",
                   (bx + 5, by + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 255), 2)

    # Colors for different detection methods
    method_colors = {
        "brightness_pattern": (0, 255, 0),    # Green - racking aisles
        "line_pair": (255, 0, 255),           # Magenta - edge-based aisles
        "whitespace": (255, 255, 0),          # Cyan - whitespace detection
        "travel_lane": (0, 165, 255),         # Orange - travel lanes
        "travel_lane_morph": (0, 128, 255),   # Dark orange - morphological travel lanes
        "unknown": (128, 128, 128),           # Gray
    }

    # Draw each aisle
    for aisle in aisles:
        bbox = aisle.get("bounding_box", {})
        x = bbox.get("x", 0)
        y = bbox.get("y", 0)
        aw = bbox.get("width", 0)
        ah = bbox.get("height", 0)

        method = aisle.get("detection_method", "unknown")
        confidence = aisle.get("confidence", 0.5)
        two_sided = aisle.get("two_sided_validated", False)

        # Color by confidence (overrides method color for clarity)
        if confidence >= 0.7:
            conf_color = (0, 255, 0)  # Green - high confidence
        elif confidence >= 0.5:
            conf_color = (0, 255, 255)  # Yellow - medium confidence
        else:
            conf_color = (0, 0, 255)  # Red - low confidence

        # Draw filled rectangle with transparency
        overlay = vis.copy()
        cv2.rectangle(overlay, (x, y), (x + aw, y + ah), conf_color, -1)
        alpha = 0.25 + (confidence * 0.25)  # 0.25 to 0.5
        cv2.addWeighted(overlay, alpha, vis, 1 - alpha, 0, vis)

        # Draw border (thicker if two-sided validated)
        border_thickness = 3 if two_sided else 1
        cv2.rectangle(vis, (x, y), (x + aw, y + ah), conf_color, border_thickness)

        # Draw centerline (blue)
        centerline = aisle.get("centerline", [])
        if len(centerline) >= 2:
            start = (centerline[0].get("x", 0), centerline[0].get("y", 0))
            end = (centerline[-1].get("x", 0), centerline[-1].get("y", 0))
            cv2.line(vis, start, end, (255, 0, 0), 2)  # Blue centerline

        # Draw line density indicators (small bars on sides)
        line_density = aisle.get("line_density", {})
        left_density = line_density.get("left_or_top", 0)
        right_density = line_density.get("right_or_bottom", 0)

        bar_width = 5
        max_bar_height = min(ah, 40)

        # Left/top density bar
        bar_height = int(max_bar_height * left_density)
        if bar_height > 0:
            cv2.rectangle(vis, (x - bar_width - 2, y),
                         (x - 2, y + bar_height), (128, 128, 0), -1)

        # Right/bottom density bar
        bar_height = int(max_bar_height * right_density)
        if bar_height > 0:
            cv2.rectangle(vis, (x + aw + 2, y),
                         (x + aw + bar_width + 2, y + bar_height), (128, 128, 0), -1)

        # Draw label with ID, method abbreviation, and confidence
        aisle_id = aisle.get("id", 0)
        orientation = aisle.get("orientation", "?")[0].upper()  # V or H
        method_abbrev = method[:3].upper()
        label = f"{aisle_id}{orientation}:{method_abbrev}:{confidence:.2f}"

        # Position label at top of aisle
        label_x = x + 2
        label_y = y - 5 if y > 20 else y + 15

        # Draw label background
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        cv2.rectangle(vis, (label_x - 1, label_y - text_h - 1),
                     (label_x + text_w + 1, label_y + 1), (0, 0, 0), -1)
        cv2.putText(vis, label, (label_x, label_y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)

    # Draw legend in top-right corner
    legend_x = w - 250
    legend_y = 25

    # Confidence legend
    cv2.putText(vis, "Confidence:", (legend_x, legend_y),
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    legend_y += 20

    for conf_label, color in [("High (>0.7)", (0, 255, 0)), ("Medium (0.5-0.7)", (0, 255, 255)), ("Low (<0.5)", (0, 0, 255))]:
        cv2.rectangle(vis, (legend_x, legend_y - 12), (legend_x + 15, legend_y), color, -1)
        cv2.putText(vis, conf_label, (legend_x + 20, legend_y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
        legend_y += 18

    legend_y += 10
    cv2.putText(vis, "Methods:", (legend_x, legend_y),
               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    legend_y += 18

    for method, color in method_colors.items():
        if method == "unknown":
            continue
        cv2.rectangle(vis, (legend_x, legend_y - 12), (legend_x + 15, legend_y), color, -1)
        cv2.putText(vis, method, (legend_x + 20, legend_y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 255, 255), 1)
        legend_y += 15

    # Stats at bottom-left
    total = len(aisles)
    vertical = len([a for a in aisles if a.get("orientation") == "vertical"])
    horizontal = len([a for a in aisles if a.get("orientation") == "horizontal"])
    validated = len([a for a in aisles if a.get("two_sided_validated", False)])
    high_conf = len([a for a in aisles if a.get("confidence", 0) >= 0.7])

    stats_y = h - 60
    cv2.putText(vis, f"Total: {total} | V:{vertical} H:{horizontal}",
               (20, stats_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    cv2.putText(vis, f"Total: {total} | V:{vertical} H:{horizontal}",
               (20, stats_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    stats_y += 25
    cv2.putText(vis, f"Validated: {validated} | High conf: {high_conf}",
               (20, stats_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    cv2.putText(vis, f"Validated: {validated} | High conf: {high_conf}",
               (20, stats_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Ensure directory exists
    dir_path = os.path.dirname(output_path)
    if dir_path:
        os.makedirs(dir_path, exist_ok=True)

    # Save the visualization
    success = cv2.imwrite(output_path, vis)
    if success:
        logger.info(f"Saved aisle visualization with {total} aisles to: {output_path}")
    else:
        logger.error(f"Failed to save aisle visualization to: {output_path}")

    return output_path
