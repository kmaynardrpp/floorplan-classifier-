"""
Coordinate transformation utilities for tile processing.

Task 3.5: Implement Coordinate Transformation (Tile to Original)
"""

from typing import List, Tuple


def tile_to_original(
    point: Tuple[int, int],
    tile_bounds: Tuple[int, int, int, int],
) -> Tuple[int, int]:
    """
    Transform a point from tile coordinates to original image coordinates.

    Args:
        point: (x, y) in tile-local coordinates
        tile_bounds: (x1, y1, x2, y2) of tile in original image

    Returns:
        (x, y) in original image coordinates

    Example:
        >>> tile_to_original((10, 20), (100, 200, 300, 400))
        (110, 220)
    """
    tile_x1, tile_y1 = tile_bounds[0], tile_bounds[1]
    return (point[0] + tile_x1, point[1] + tile_y1)


def original_to_tile(
    point: Tuple[int, int],
    tile_bounds: Tuple[int, int, int, int],
) -> Tuple[int, int]:
    """
    Transform a point from original image coordinates to tile coordinates.

    Args:
        point: (x, y) in original image coordinates
        tile_bounds: (x1, y1, x2, y2) of tile in original image

    Returns:
        (x, y) in tile-local coordinates
    """
    tile_x1, tile_y1 = tile_bounds[0], tile_bounds[1]
    return (point[0] - tile_x1, point[1] - tile_y1)


def transform_polygon(
    polygon: List[Tuple[int, int]],
    tile_bounds: Tuple[int, int, int, int],
) -> List[Tuple[int, int]]:
    """
    Transform all vertices of a polygon from tile to original coordinates.

    Args:
        polygon: List of (x, y) vertices in tile coordinates
        tile_bounds: (x1, y1, x2, y2) of tile in original image

    Returns:
        List of (x, y) vertices in original image coordinates
    """
    return [tile_to_original(pt, tile_bounds) for pt in polygon]


def transform_polygon_to_tile(
    polygon: List[Tuple[int, int]],
    tile_bounds: Tuple[int, int, int, int],
) -> List[Tuple[int, int]]:
    """
    Transform all vertices of a polygon from original to tile coordinates.

    Args:
        polygon: List of (x, y) vertices in original coordinates
        tile_bounds: (x1, y1, x2, y2) of tile in original image

    Returns:
        List of (x, y) vertices in tile-local coordinates
    """
    return [original_to_tile(pt, tile_bounds) for pt in polygon]


def transform_bbox(
    bbox: Tuple[int, int, int, int],
    tile_bounds: Tuple[int, int, int, int],
) -> Tuple[int, int, int, int]:
    """
    Transform a bounding box from tile to original coordinates.

    Args:
        bbox: (x1, y1, x2, y2) in tile coordinates
        tile_bounds: (x1, y1, x2, y2) of tile in original image

    Returns:
        (x1, y1, x2, y2) in original image coordinates
    """
    tile_x1, tile_y1 = tile_bounds[0], tile_bounds[1]
    return (
        bbox[0] + tile_x1,
        bbox[1] + tile_y1,
        bbox[2] + tile_x1,
        bbox[3] + tile_y1,
    )


def is_point_in_tile(
    point: Tuple[int, int],
    tile_bounds: Tuple[int, int, int, int],
) -> bool:
    """
    Check if a point (in original coordinates) is within a tile.

    Args:
        point: (x, y) in original image coordinates
        tile_bounds: (x1, y1, x2, y2) of tile

    Returns:
        True if point is inside tile bounds
    """
    x, y = point
    x1, y1, x2, y2 = tile_bounds
    return x1 <= x < x2 and y1 <= y < y2


def clip_polygon_to_bounds(
    polygon: List[Tuple[int, int]],
    bounds: Tuple[int, int, int, int],
) -> List[Tuple[int, int]]:
    """
    Clip a polygon to fit within given bounds.

    Uses simple coordinate clamping (for basic use cases).
    For precise polygon clipping, use Shapely.

    Args:
        polygon: List of (x, y) vertices
        bounds: (x1, y1, x2, y2) bounding box

    Returns:
        Clipped polygon vertices
    """
    x1, y1, x2, y2 = bounds
    clipped = []

    for px, py in polygon:
        cx = max(x1, min(x2, px))
        cy = max(y1, min(y2, py))
        clipped.append((cx, cy))

    return clipped
