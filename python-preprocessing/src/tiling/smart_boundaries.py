"""
Smart boundary alignment using Phase 0 color boundaries.

Task 3.6: Implement Smart Boundary Alignment (using Phase 0)
"""

from typing import List, Tuple, Optional, TYPE_CHECKING
import numpy as np

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult, DetectedBoundary


def find_boundary_aligned_splits(
    phase0_boundaries: Optional["ColorBoundaryResult"],
    orientation: str,
    dimension: int,
    tile_size: int = 2048,
    min_tile_size: int = 512,
) -> List[int]:
    """
    Find split positions that align with detected zone boundaries.

    Analyzes Phase 0 color boundaries to find natural split lines
    (vertical or horizontal edges that span significant distance).

    Args:
        phase0_boundaries: Phase 0 detection results
        orientation: 'vertical' or 'horizontal' splits
        dimension: Total dimension (width for vertical, height for horizontal)
        tile_size: Target tile size
        min_tile_size: Minimum allowed tile size

    Returns:
        List of split positions (sorted). Falls back to grid if insufficient.

    Example:
        >>> splits = find_boundary_aligned_splits(result, 'vertical', 5000)
        >>> # Returns [2048, 4096] or natural split points
    """
    # Fallback to grid-based splits
    def grid_splits() -> List[int]:
        splits = []
        pos = tile_size
        while pos < dimension - min_tile_size:
            splits.append(pos)
            pos += tile_size
        return splits

    # If no boundaries or disabled, use grid
    if phase0_boundaries is None or len(phase0_boundaries.boundaries) == 0:
        return grid_splits()

    # Find natural split lines from boundaries
    candidate_splits = _find_natural_splits(
        phase0_boundaries.boundaries,
        orientation,
        dimension,
    )

    # If not enough natural splits, fall back to grid
    expected_splits = (dimension // tile_size) - 1
    if len(candidate_splits) < expected_splits * 0.5:
        return grid_splits()

    # Filter and adjust splits to respect minimum tile size
    valid_splits = _filter_splits(candidate_splits, dimension, min_tile_size)

    if len(valid_splits) == 0:
        return grid_splits()

    return sorted(valid_splits)


def _find_natural_splits(
    boundaries: List["DetectedBoundary"],
    orientation: str,
    dimension: int,
) -> List[int]:
    """
    Find natural split positions from boundary edges.

    Args:
        boundaries: List of detected boundaries
        orientation: 'vertical' or 'horizontal'
        dimension: Total dimension

    Returns:
        List of candidate split positions
    """
    candidates = []

    for boundary in boundaries:
        polygon = boundary.polygon
        if len(polygon) < 3:
            continue

        # Find vertical or horizontal edges
        for i in range(len(polygon)):
            p1 = polygon[i]
            p2 = polygon[(i + 1) % len(polygon)]

            if orientation == 'vertical':
                # Look for vertical edges (same x coordinate)
                if abs(p1[0] - p2[0]) < 5:  # Nearly vertical
                    edge_length = abs(p1[1] - p2[1])
                    if edge_length > 100:  # Significant length
                        x_pos = (p1[0] + p2[0]) // 2
                        if 100 < x_pos < dimension - 100:
                            candidates.append(x_pos)

            else:  # horizontal
                # Look for horizontal edges (same y coordinate)
                if abs(p1[1] - p2[1]) < 5:  # Nearly horizontal
                    edge_length = abs(p1[0] - p2[0])
                    if edge_length > 100:  # Significant length
                        y_pos = (p1[1] + p2[1]) // 2
                        if 100 < y_pos < dimension - 100:
                            candidates.append(y_pos)

    return candidates


def _filter_splits(
    candidates: List[int],
    dimension: int,
    min_tile_size: int,
) -> List[int]:
    """
    Filter and cluster candidate splits to avoid too-small tiles.

    Args:
        candidates: Raw candidate positions
        dimension: Total dimension
        min_tile_size: Minimum tile size

    Returns:
        Filtered and clustered split positions
    """
    if not candidates:
        return []

    # Sort and cluster nearby splits
    sorted_candidates = sorted(set(candidates))
    clustered = []
    cluster_threshold = min_tile_size // 2

    current_cluster = [sorted_candidates[0]]
    for pos in sorted_candidates[1:]:
        if pos - current_cluster[-1] < cluster_threshold:
            current_cluster.append(pos)
        else:
            # Take median of cluster
            median = current_cluster[len(current_cluster) // 2]
            clustered.append(median)
            current_cluster = [pos]

    # Don't forget last cluster
    if current_cluster:
        median = current_cluster[len(current_cluster) // 2]
        clustered.append(median)

    # Filter to ensure minimum tile sizes
    valid = []
    prev_pos = 0

    for pos in clustered:
        if pos - prev_pos >= min_tile_size:
            if dimension - pos >= min_tile_size:
                valid.append(pos)
                prev_pos = pos

    return valid


def create_smart_boundaries(
    width: int,
    height: int,
    phase0_boundaries: Optional["ColorBoundaryResult"],
    tile_size: int = 2048,
    overlap: int = 256,
    min_tile_size: int = 512,
) -> List[Tuple[int, int, int, int]]:
    """
    Create tile boundaries using smart alignment when possible.

    Args:
        width: Image width
        height: Image height
        phase0_boundaries: Phase 0 detection results
        tile_size: Target tile size
        overlap: Overlap between tiles
        min_tile_size: Minimum tile size

    Returns:
        List of (x1, y1, x2, y2) tile boundaries
    """
    # Find split positions
    v_splits = find_boundary_aligned_splits(
        phase0_boundaries, 'vertical', width, tile_size, min_tile_size
    )
    h_splits = find_boundary_aligned_splits(
        phase0_boundaries, 'horizontal', height, tile_size, min_tile_size
    )

    # Add boundaries (0 and dimension)
    x_positions = [0] + v_splits + [width]
    y_positions = [0] + h_splits + [height]

    # Generate tile boundaries with overlap
    boundaries = []

    for i in range(len(y_positions) - 1):
        for j in range(len(x_positions) - 1):
            x1 = max(0, x_positions[j] - (overlap // 2 if j > 0 else 0))
            y1 = max(0, y_positions[i] - (overlap // 2 if i > 0 else 0))
            x2 = min(width, x_positions[j + 1] + (overlap // 2 if j < len(x_positions) - 2 else 0))
            y2 = min(height, y_positions[i + 1] + (overlap // 2 if i < len(y_positions) - 2 else 0))

            boundaries.append((x1, y1, x2, y2))

    return boundaries
