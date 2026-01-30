"""
IoU (Intersection over Union) calculation for zone matching.

Task 4.1: Implement IoU Calculation for Zone Matching
"""

from typing import List, Tuple, Optional
import numpy as np


def polygon_to_mask(
    polygon: List[Tuple[int, int]],
    width: int,
    height: int,
) -> np.ndarray:
    """
    Convert a polygon to a binary mask.

    Args:
        polygon: List of (x, y) vertices
        width: Mask width
        height: Mask height

    Returns:
        Binary mask (0s and 1s) as numpy array
    """
    import cv2

    mask = np.zeros((height, width), dtype=np.uint8)
    if len(polygon) < 3:
        return mask

    pts = np.array(polygon, dtype=np.int32)
    cv2.fillPoly(mask, [pts], 1)
    return mask


def calculate_iou(
    polygon1: List[Tuple[int, int]],
    polygon2: List[Tuple[int, int]],
    bounds: Optional[Tuple[int, int, int, int]] = None,
) -> float:
    """
    Calculate Intersection over Union between two polygons.

    Args:
        polygon1: First polygon vertices
        polygon2: Second polygon vertices
        bounds: Optional (x1, y1, x2, y2) to limit calculation area

    Returns:
        IoU value between 0.0 and 1.0

    Example:
        >>> iou = calculate_iou(
        ...     [(0, 0), (100, 0), (100, 100), (0, 100)],
        ...     [(50, 0), (150, 0), (150, 100), (50, 100)],
        ... )
        >>> 0.3 < iou < 0.4  # ~1/3 overlap
        True
    """
    if len(polygon1) < 3 or len(polygon2) < 3:
        return 0.0

    # Calculate bounding box for both polygons
    if bounds is None:
        all_points = polygon1 + polygon2
        xs = [p[0] for p in all_points]
        ys = [p[1] for p in all_points]
        x1, y1 = max(0, min(xs)), max(0, min(ys))
        x2, y2 = max(xs), max(ys)
    else:
        x1, y1, x2, y2 = bounds

    width = x2 - x1 + 1
    height = y2 - y1 + 1

    if width <= 0 or height <= 0:
        return 0.0

    # Offset polygons to local coordinates
    offset_poly1 = [(x - x1, y - y1) for x, y in polygon1]
    offset_poly2 = [(x - x1, y - y1) for x, y in polygon2]

    # Create masks
    mask1 = polygon_to_mask(offset_poly1, width, height)
    mask2 = polygon_to_mask(offset_poly2, width, height)

    # Calculate intersection and union
    intersection = np.logical_and(mask1, mask2).sum()
    union = np.logical_or(mask1, mask2).sum()

    if union == 0:
        return 0.0

    return float(intersection) / float(union)


def calculate_iou_fast(
    bbox1: Tuple[int, int, int, int],
    bbox2: Tuple[int, int, int, int],
) -> float:
    """
    Fast IoU calculation using axis-aligned bounding boxes.

    Useful for quick filtering before expensive polygon IoU.

    Args:
        bbox1: (x1, y1, x2, y2) of first region
        bbox2: (x1, y1, x2, y2) of second region

    Returns:
        IoU value between 0.0 and 1.0
    """
    x1_1, y1_1, x2_1, y2_1 = bbox1
    x1_2, y1_2, x2_2, y2_2 = bbox2

    # Calculate intersection
    inter_x1 = max(x1_1, x1_2)
    inter_y1 = max(y1_1, y1_2)
    inter_x2 = min(x2_1, x2_2)
    inter_y2 = min(y2_1, y2_2)

    if inter_x1 >= inter_x2 or inter_y1 >= inter_y2:
        return 0.0

    intersection = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)

    # Calculate union
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union = area1 + area2 - intersection

    if union <= 0:
        return 0.0

    return intersection / union


def polygon_bounding_box(
    polygon: List[Tuple[int, int]],
) -> Tuple[int, int, int, int]:
    """
    Calculate the axis-aligned bounding box of a polygon.

    Args:
        polygon: List of (x, y) vertices

    Returns:
        (x1, y1, x2, y2) bounding box
    """
    if not polygon:
        return (0, 0, 0, 0)

    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return (min(xs), min(ys), max(xs), max(ys))


def zones_overlap(
    polygon1: List[Tuple[int, int]],
    polygon2: List[Tuple[int, int]],
    threshold: float = 0.0,
) -> bool:
    """
    Check if two zones overlap above a given IoU threshold.

    Uses fast bounding box check first, then polygon IoU if needed.

    Args:
        polygon1: First polygon vertices
        polygon2: Second polygon vertices
        threshold: Minimum IoU to consider as overlapping

    Returns:
        True if IoU > threshold
    """
    # Quick bounding box check
    bbox1 = polygon_bounding_box(polygon1)
    bbox2 = polygon_bounding_box(polygon2)

    bbox_iou = calculate_iou_fast(bbox1, bbox2)
    if bbox_iou == 0.0:
        return False

    # For threshold 0, any bbox overlap is sufficient
    if threshold == 0.0:
        return True

    # Calculate precise polygon IoU
    iou = calculate_iou(polygon1, polygon2)
    return iou > threshold
