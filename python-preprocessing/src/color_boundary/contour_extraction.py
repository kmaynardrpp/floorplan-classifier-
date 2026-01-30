"""
Contour extraction and polygon simplification.

Task 1.5: Implement Contour Extraction and Polygon Simplification
"""

import cv2
import numpy as np
from typing import List, Tuple


def extract_contours(
    mask: np.ndarray,
    min_area: int = 1000,
) -> List[np.ndarray]:
    """
    Extract contours from a binary mask, filtering by minimum area.

    Args:
        mask: Binary mask (uint8) with white (255) regions to extract
        min_area: Minimum contour area in pixels to keep

    Returns:
        List of contours (each is Nx1x2 numpy array)

    Example:
        >>> contours = extract_contours(mask, min_area=1000)
    """
    # Handle empty mask
    if mask.size == 0 or np.count_nonzero(mask) == 0:
        return []

    # Find contours
    contours, _ = cv2.findContours(
        mask,
        cv2.RETR_EXTERNAL,  # Only external contours
        cv2.CHAIN_APPROX_SIMPLE  # Compress horizontal/vertical segments
    )

    # Filter by minimum area
    filtered = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area >= min_area:
            filtered.append(contour)

    return filtered


def contour_to_polygon(
    contour: np.ndarray,
    epsilon_factor: float = 0.02,
) -> List[Tuple[int, int]]:
    """
    Simplify a contour to a polygon with fewer vertices.

    Uses Douglas-Peucker algorithm via cv2.approxPolyDP.

    Args:
        contour: OpenCV contour (Nx1x2 array)
        epsilon_factor: Approximation accuracy factor.
            Smaller = more vertices, more accurate.
            Typical values: 0.01-0.05

    Returns:
        List of (x, y) tuples as Python integers

    Example:
        >>> polygon = contour_to_polygon(contour, epsilon_factor=0.02)
        >>> # Returns: [(10, 20), (100, 20), (100, 120), (10, 120)]
    """
    # Calculate approximation epsilon based on perimeter
    perimeter = cv2.arcLength(contour, closed=True)
    epsilon = epsilon_factor * perimeter

    # Approximate the contour
    approx = cv2.approxPolyDP(contour, epsilon, closed=True)

    # Convert to list of (x, y) tuples with Python integers
    polygon = []
    for point in approx:
        x = int(point[0][0])
        y = int(point[0][1])
        polygon.append((x, y))

    return polygon


def extract_polygons(
    mask: np.ndarray,
    min_area: int = 1000,
    epsilon_factor: float = 0.02,
) -> List[List[Tuple[int, int]]]:
    """
    Extract and simplify polygons from a binary mask in one step.

    Convenience function combining extract_contours and contour_to_polygon.

    Args:
        mask: Binary mask
        min_area: Minimum contour area to keep
        epsilon_factor: Polygon simplification factor

    Returns:
        List of polygons, each as list of (x, y) tuples
    """
    contours = extract_contours(mask, min_area)
    return [contour_to_polygon(c, epsilon_factor) for c in contours]


def polygon_area(polygon: List[Tuple[int, int]]) -> float:
    """
    Calculate the area of a polygon using the Shoelace formula.

    Args:
        polygon: List of (x, y) vertices

    Returns:
        Area in square pixels (always positive)
    """
    n = len(polygon)
    if n < 3:
        return 0.0

    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += polygon[i][0] * polygon[j][1]
        area -= polygon[j][0] * polygon[i][1]

    return abs(area) / 2.0


def polygon_to_contour(polygon: List[Tuple[int, int]]) -> np.ndarray:
    """
    Convert a polygon (list of tuples) back to OpenCV contour format.

    Args:
        polygon: List of (x, y) tuples

    Returns:
        OpenCV contour (Nx1x2 array)
    """
    points = np.array(polygon, dtype=np.int32)
    return points.reshape((-1, 1, 2))
