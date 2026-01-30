"""
Visualization utilities for tile debugging.

Task 3.7: Implement Tile Visualization
"""

import cv2
import numpy as np
from typing import List, Optional

from .models import ImageTile


# Color palette for tiles
TILE_COLORS = [
    (255, 0, 0),    # Blue
    (0, 255, 0),    # Green
    (0, 0, 255),    # Red
    (255, 255, 0),  # Cyan
    (255, 0, 255),  # Magenta
    (0, 255, 255),  # Yellow
    (128, 0, 255),  # Purple
    (255, 128, 0),  # Orange-ish
]


def visualize_tiles(
    image: np.ndarray,
    tiles: List[ImageTile],
    output_path: str,
    show_labels: bool = True,
    show_overlaps: bool = True,
    alpha: float = 0.2,
) -> str:
    """
    Generate debug visualization showing tile boundaries on original image.

    Args:
        image: Original image
        tiles: List of ImageTile objects
        output_path: Path to save visualization
        show_labels: Whether to show tile ID and dimensions
        show_overlaps: Whether to highlight overlap regions
        alpha: Transparency for tile fill

    Returns:
        Path to saved visualization
    """
    vis = image.copy()
    height, width = vis.shape[:2]

    # Create overlay for transparent fills
    overlay = vis.copy()

    # Draw each tile
    for i, tile in enumerate(tiles):
        color = TILE_COLORS[i % len(TILE_COLORS)]
        x1, y1, x2, y2 = tile.bounds

        # Fill tile area with color
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)

        # Draw border
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)

        # Draw overlap regions if requested
        if show_overlaps:
            for overlap in tile.overlap_regions:
                ox1, oy1, ox2, oy2 = overlap.region
                # Convert to original coordinates
                abs_x1 = x1 + ox1
                abs_y1 = y1 + oy1
                abs_x2 = x1 + ox2
                abs_y2 = y1 + oy2

                # Draw hatched pattern for overlap
                cv2.rectangle(overlay, (abs_x1, abs_y1), (abs_x2, abs_y2), (128, 128, 128), -1)

        # Add label
        if show_labels:
            label = f"{tile.id}"
            dims = f"{tile.width}x{tile.height}"

            # Position label at top-left of tile
            label_x = x1 + 5
            label_y = y1 + 20

            # Draw background for text
            (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(vis, (label_x - 2, label_y - text_h - 2),
                         (label_x + text_w + 2, label_y + 2), (0, 0, 0), -1)
            cv2.putText(vis, label, (label_x, label_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

            # Dimensions below
            cv2.putText(vis, dims, (label_x, label_y + 15),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

    # Blend overlay
    cv2.addWeighted(overlay, alpha, vis, 1 - alpha, 0, vis)

    # Add legend at bottom
    legend_y = height - 50
    cv2.putText(vis, f"Tiles: {len(tiles)}", (10, legend_y),
               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(vis, f"Image: {width}x{height}", (10, legend_y + 20),
               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)

    # Save
    cv2.imwrite(output_path, vis)
    return output_path


def visualize_tile_grid(
    width: int,
    height: int,
    boundaries: List[tuple],
    output_path: str,
) -> str:
    """
    Visualize tile boundaries on a blank canvas.

    Useful for debugging boundary calculations without an actual image.

    Args:
        width: Image width
        height: Image height
        boundaries: List of (x1, y1, x2, y2) boundaries
        output_path: Path to save visualization

    Returns:
        Path to saved visualization
    """
    # Create blank canvas
    vis = np.ones((height, width, 3), dtype=np.uint8) * 255

    # Draw grid lines
    for i, (x1, y1, x2, y2) in enumerate(boundaries):
        color = TILE_COLORS[i % len(TILE_COLORS)]

        # Draw tile boundary
        cv2.rectangle(vis, (x1, y1), (x2, y2), color, 2)

        # Add tile number at center
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        cv2.putText(vis, str(i), (cx - 10, cy + 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

    cv2.imwrite(output_path, vis)
    return output_path
