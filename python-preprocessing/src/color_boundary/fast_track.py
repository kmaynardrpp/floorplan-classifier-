"""
Fast-track decision logic for Phase 0 color boundary detection.

Task 2.2: Implement Fast-Track Decision Logic
Task 2.3: Implement Fast-Track Hint Generation
"""

from typing import Dict, Any, List
import cv2
import numpy as np

from src.color_boundary.models import ColorBoundaryResult, DetectedBoundary
from src.config.phase0_config import Phase0Config


def is_boundary_closed(boundary: DetectedBoundary, min_area_ratio: float = 0.01) -> bool:
    """
    Check if a boundary forms a closed region.

    A boundary is considered closed if:
    1. It has at least 3 vertices (minimum for a polygon)
    2. Its area is positive (not a line or degenerate polygon)
    3. The contour forms a valid closed shape

    Args:
        boundary: The detected boundary to check
        min_area_ratio: Minimum area as ratio of expected area (not used directly)

    Returns:
        True if the boundary forms a closed region
    """
    # Need at least 3 points to form a polygon
    if len(boundary.polygon) < 3:
        return False

    # Check that area is positive (closed regions have area)
    if boundary.area <= 0:
        return False

    # Convert polygon to contour format for cv2 analysis
    contour = np.array(boundary.polygon, dtype=np.int32)

    # Check contour area is positive (closed contours have area)
    contour_area = cv2.contourArea(contour)
    if contour_area <= 0:
        return False

    # Additional check: perimeter should exist
    perimeter = cv2.arcLength(contour, closed=True)
    if perimeter <= 0:
        return False

    # Check for reasonable circularity (not a line or degenerate shape)
    # Circularity = 4 * pi * area / perimeter^2
    # A perfect circle has circularity of 1, a line has ~0
    circularity = (4 * np.pi * contour_area) / (perimeter * perimeter) if perimeter > 0 else 0

    # Very low circularity suggests a line-like shape, not a closed region
    if circularity < 0.001:
        return False

    return True


def all_boundaries_closed(boundaries: List[DetectedBoundary]) -> bool:
    """
    Check if all detected boundaries form closed regions.

    Args:
        boundaries: List of detected boundaries

    Returns:
        True if all boundaries are closed regions
    """
    if not boundaries:
        return False

    return all(is_boundary_closed(b) for b in boundaries)


def should_fast_track(color_result: ColorBoundaryResult, config: Phase0Config) -> bool:
    """
    Determine if fast-track mode should be activated.

    Fast-track mode skips Phase 1 edge detection when:
    1. Phase 0 is enabled
    2. Coverage ratio exceeds the configured threshold
    3. Number of detected boundaries meets the minimum
    4. All boundaries form closed regions (REQUIRED)

    Args:
        color_result: The result from ColorBoundaryDetector
        config: Phase 0 configuration

    Returns:
        True if fast-track mode should be used
    """
    # Check if Phase 0 is enabled
    if not config.enabled:
        return False

    # Check basic threshold eligibility
    if not config.is_fast_track_eligible(
        coverage_ratio=color_result.coverage_ratio,
        boundary_count=len(color_result.boundaries),
    ):
        return False

    # REQUIRED: Check if boundaries form closed regions
    if config.require_closed_regions:
        if not all_boundaries_closed(color_result.boundaries):
            return False

    return True


def create_fast_track_hints(color_result: ColorBoundaryResult) -> Dict[str, Any]:
    """
    Generate preprocessing hints when fast-track mode is active.

    Creates a minimal hint structure suitable for direct zone classification
    without running full edge detection.

    Args:
        color_result: The result from ColorBoundaryDetector

    Returns:
        Dictionary of hints for AI zone classification
    """
    boundaries_data = []
    for boundary in color_result.boundaries:
        boundaries_data.append({
            "polygon": boundary.polygon,
            "color": boundary.color,
            "area": boundary.area,
            "confidence": 0.95,  # High confidence for color-detected boundaries
        })

    return {
        "fast_track": True,
        "fast_track_reason": "High coverage of pre-drawn color boundaries detected",
        "detected_colored_boundaries": boundaries_data,
        "boundary_coverage_ratio": color_result.coverage_ratio,
        "has_predefined_zones": True,
        "phase0_complete": True,
        "skip_edge_detection": True,
    }


def merge_color_boundaries_into_hints(
    existing_hints: Dict[str, Any],
    color_result: ColorBoundaryResult,
) -> Dict[str, Any]:
    """
    Merge Phase 0 color boundaries into existing preprocessing hints.

    Used when not fast-tracking to add color boundary information to
    the full pipeline results.

    Args:
        existing_hints: Existing hint dictionary from pipeline
        color_result: The result from ColorBoundaryDetector

    Returns:
        Updated hints dictionary with color boundary information
    """
    boundaries_data = []
    for boundary in color_result.boundaries:
        boundaries_data.append({
            "polygon": boundary.polygon,
            "color": boundary.color,
            "area": boundary.area,
            "confidence": boundary.confidence,
        })

    updated_hints = existing_hints.copy()
    updated_hints["detected_colored_boundaries"] = boundaries_data
    updated_hints["boundary_coverage_ratio"] = color_result.coverage_ratio
    updated_hints["has_predefined_zones"] = len(color_result.boundaries) > 0

    return updated_hints
