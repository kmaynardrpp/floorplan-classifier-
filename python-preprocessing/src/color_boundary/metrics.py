"""
Metrics calculations for color boundary detection.

Task 1.6: Implement Coverage Ratio Calculation
"""

from typing import List, Tuple, TYPE_CHECKING
import numpy as np
import cv2

if TYPE_CHECKING:
    from .models import DetectedBoundary


def calculate_coverage(
    boundaries: List["DetectedBoundary"],
    image_shape: Tuple[int, int],
) -> float:
    """
    Calculate what percentage of the image is covered by detected boundaries.

    Args:
        boundaries: List of DetectedBoundary objects with polygon data
        image_shape: (height, width) of the original image

    Returns:
        Coverage ratio between 0.0 and 1.0

    Example:
        >>> coverage = calculate_coverage(boundaries, (1000, 2000))
        >>> print(f"Boundaries cover {coverage * 100:.1f}% of image")
    """
    # Handle edge cases
    if not boundaries:
        return 0.0

    height, width = image_shape
    total_pixels = height * width

    if total_pixels == 0:
        return 0.0

    # Calculate total boundary area
    # Use sum of individual areas (may overcount overlaps slightly,
    # but overlapping boundaries are rare in real floorplans)
    total_area = sum(b.area for b in boundaries)

    # Calculate ratio, capping at 1.0
    coverage = min(total_area / total_pixels, 1.0)

    return coverage


def calculate_coverage_from_mask(
    mask: np.ndarray,
) -> float:
    """
    Calculate coverage ratio directly from a binary mask.

    This is more accurate than summing polygon areas because
    it accounts for overlaps automatically.

    Args:
        mask: Binary mask (uint8) where 255 = covered

    Returns:
        Coverage ratio between 0.0 and 1.0
    """
    if mask.size == 0:
        return 0.0

    covered_pixels = np.count_nonzero(mask)
    total_pixels = mask.size

    return covered_pixels / total_pixels


def calculate_coverage_precise(
    boundaries: List["DetectedBoundary"],
    image_shape: Tuple[int, int],
) -> float:
    """
    Calculate precise coverage by drawing polygons to a mask.

    This handles overlapping boundaries correctly by rendering
    all polygons to a single mask.

    Args:
        boundaries: List of DetectedBoundary objects
        image_shape: (height, width) of the original image

    Returns:
        Coverage ratio between 0.0 and 1.0
    """
    if not boundaries:
        return 0.0

    height, width = image_shape
    if height == 0 or width == 0:
        return 0.0

    # Create empty mask
    mask = np.zeros((height, width), dtype=np.uint8)

    # Draw all polygons
    for boundary in boundaries:
        if boundary.polygon:
            pts = np.array(boundary.polygon, dtype=np.int32)
            cv2.fillPoly(mask, [pts], 255)

    return calculate_coverage_from_mask(mask)
