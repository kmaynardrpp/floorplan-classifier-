"""
Coverage Input Module for Travel Lane Detection

Handles loading and processing of coverage boundaries from JSON data.
Coverage boundaries define 2D areas where travel lane detection should be constrained.

This module supports the pivot to programmatic aisles + AI travel lanes:
- Aisles: 100% programmatic from 1D TDOA schedule data (no AI)
- Travel Lanes: Preprocessor + AI for 2D coverage areas
"""

import numpy as np
import cv2
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class CoverageBoundary:
    """
    A coverage boundary defining where travel lane detection should operate.

    Coverage boundaries come from TDOA schedule data:
    - 1D pairs define aisles (handled programmatically in frontend)
    - 2D pairs define coverage areas for travel lane detection
    """
    uid: str
    coverage_type: str  # "1D" or "2D"
    shape: str  # "POLYGON" or "POLYLINE"
    points: List[Tuple[int, int]]  # In image pixels
    margin: int  # Margin in pixels to expand the boundary

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "uid": self.uid,
            "coverage_type": self.coverage_type,
            "shape": self.shape,
            "points": [{"x": p[0], "y": p[1]} for p in self.points],
            "margin": self.margin,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CoverageBoundary":
        """Create from dict (e.g., from JSON request)."""
        points = []
        for p in data.get("points", []):
            if isinstance(p, dict):
                points.append((p.get("x", 0), p.get("y", 0)))
            elif isinstance(p, (list, tuple)) and len(p) >= 2:
                points.append((p[0], p[1]))

        return cls(
            uid=data.get("uid", ""),
            coverage_type=data.get("coverage_type", data.get("type", "2D")),
            shape=data.get("shape", "POLYGON"),
            points=points,
            margin=data.get("margin", 0),
        )


def load_coverage_from_json(json_data: Dict[str, Any]) -> List[CoverageBoundary]:
    """
    Load coverage boundaries from JSON data.

    Accepts either:
    - A dict with a "boundaries" key containing a list
    - A list of boundary dicts directly

    Args:
        json_data: JSON data containing coverage boundaries

    Returns:
        List of CoverageBoundary objects
    """
    if isinstance(json_data, list):
        boundaries_data = json_data
    elif isinstance(json_data, dict):
        boundaries_data = json_data.get("boundaries", json_data.get("coverage_boundaries", []))
        if not isinstance(boundaries_data, list):
            boundaries_data = []
    else:
        boundaries_data = []

    boundaries = []
    for data in boundaries_data:
        try:
            boundary = CoverageBoundary.from_dict(data)
            if len(boundary.points) >= 3:  # Need at least 3 points for a polygon
                boundaries.append(boundary)
        except Exception as e:
            print(f"Warning: Failed to parse coverage boundary: {e}")

    return boundaries


def coverage_to_mask(
    boundary: CoverageBoundary,
    image_shape: Tuple[int, int],
    expand_margin: bool = True,
) -> np.ndarray:
    """
    Convert a coverage boundary to a binary mask.

    Args:
        boundary: The coverage boundary
        image_shape: (height, width) of the target image
        expand_margin: Whether to expand the boundary by its margin value

    Returns:
        Binary mask (255 inside boundary, 0 outside)
    """
    h, w = image_shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)

    if len(boundary.points) < 3:
        return mask

    # Convert points to numpy array
    points = np.array(boundary.points, dtype=np.int32)

    # Apply margin expansion if requested
    if expand_margin and boundary.margin > 0:
        # Expand the polygon outward by the margin
        # Use convex hull and then dilate
        hull = cv2.convexHull(points)
        temp_mask = np.zeros((h, w), dtype=np.uint8)
        cv2.fillPoly(temp_mask, [hull], 255)

        # Dilate by margin
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (boundary.margin * 2 + 1, boundary.margin * 2 + 1)
        )
        mask = cv2.dilate(temp_mask, kernel)
    else:
        # Fill the polygon directly
        cv2.fillPoly(mask, [points], 255)

    return mask


def clip_image_to_coverage(
    image: np.ndarray,
    boundary: CoverageBoundary,
) -> Tuple[np.ndarray, Tuple[int, int]]:
    """
    Clip an image to a coverage boundary's bounding box.

    Args:
        image: The source image (BGR or grayscale)
        boundary: The coverage boundary

    Returns:
        Tuple of (clipped_image, offset) where offset is (x, y) of the top-left corner
    """
    if len(boundary.points) < 3:
        return image.copy(), (0, 0)

    h, w = image.shape[:2]

    # Get bounding box of the points
    points = np.array(boundary.points)
    x_min, y_min = points.min(axis=0)
    x_max, y_max = points.max(axis=0)

    # Apply margin
    margin = boundary.margin
    x_min = max(0, x_min - margin)
    y_min = max(0, y_min - margin)
    x_max = min(w, x_max + margin)
    y_max = min(h, y_max + margin)

    # Clip the image
    clipped = image[int(y_min):int(y_max), int(x_min):int(x_max)].copy()

    return clipped, (int(x_min), int(y_min))


def filter_2d_coverage_boundaries(
    boundaries: List[CoverageBoundary],
) -> List[CoverageBoundary]:
    """
    Filter boundaries to only include 2D coverage areas.

    1D boundaries define aisles (handled programmatically).
    2D boundaries define travel lane detection areas.

    Args:
        boundaries: List of all coverage boundaries

    Returns:
        List of only 2D coverage boundaries
    """
    return [b for b in boundaries if b.coverage_type == "2D"]


def get_coverage_union_mask(
    boundaries: List[CoverageBoundary],
    image_shape: Tuple[int, int],
) -> np.ndarray:
    """
    Create a union mask of all coverage boundaries.

    Args:
        boundaries: List of coverage boundaries
        image_shape: (height, width) of the target image

    Returns:
        Binary mask where any pixel inside any boundary is 255
    """
    h, w = image_shape[:2]
    union_mask = np.zeros((h, w), dtype=np.uint8)

    for boundary in boundaries:
        mask = coverage_to_mask(boundary, image_shape)
        union_mask = cv2.bitwise_or(union_mask, mask)

    return union_mask
