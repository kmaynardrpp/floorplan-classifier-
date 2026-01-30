"""
Image tiling logic for processing large images.

Task 3.2: Implement Tiling Decision Logic
Task 3.3: Implement Grid-Based Tile Boundary Calculation
Task 3.4: Implement Tile Creation from Image
"""

import numpy as np
from typing import List, Tuple, Optional, TYPE_CHECKING

from .models import ImageTile, OverlapRegion, TilingConfig

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult


class ImageTiler:
    """
    Splits large images into overlapping tiles for parallel processing.

    Example:
        >>> tiler = ImageTiler(tile_size=2048, overlap=256)
        >>> if tiler.should_tile(image):
        ...     tiles = tiler.create_tiles(image)
        ...     for tile in tiles:
        ...         process(tile)
    """

    def __init__(
        self,
        tile_size: int = 2048,
        overlap: int = 256,
        max_dimension: int = 4000,
        config: Optional[TilingConfig] = None,
    ):
        """
        Initialize the image tiler.

        Args:
            tile_size: Target tile size in pixels
            overlap: Overlap between adjacent tiles in pixels
            max_dimension: Threshold for triggering tiling
            config: Optional TilingConfig to use instead of individual params
        """
        if config is not None:
            self.tile_size = config.tile_size
            self.overlap = config.overlap
            self.max_dimension = config.dimension_threshold
        else:
            self.tile_size = tile_size
            self.overlap = overlap
            self.max_dimension = max_dimension

        # Validate
        if self.overlap >= self.tile_size:
            raise ValueError(f"overlap ({self.overlap}) must be < tile_size ({self.tile_size})")

    def should_tile(self, image: np.ndarray) -> bool:
        """
        Determine if an image requires tiling based on dimensions.

        Args:
            image: Input image (H, W, C) or (H, W)

        Returns:
            True if width OR height exceeds max_dimension
        """
        height, width = image.shape[:2]
        return width > self.max_dimension or height > self.max_dimension

    def _calculate_grid_boundaries(
        self,
        width: int,
        height: int,
    ) -> List[Tuple[int, int, int, int]]:
        """
        Calculate regular grid tile boundaries with overlap.

        Args:
            width: Image width
            height: Image height

        Returns:
            List of (x1, y1, x2, y2) tile boundaries
        """
        # Calculate effective step (how much we advance between tile starts)
        step = self.tile_size - self.overlap

        boundaries = []

        # Generate grid
        y = 0
        row = 0
        while y < height:
            x = 0
            col = 0
            while x < width:
                # Calculate tile bounds
                x1 = x
                y1 = y
                x2 = min(x + self.tile_size, width)
                y2 = min(y + self.tile_size, height)

                boundaries.append((x1, y1, x2, y2))

                # Move to next column
                x += step
                col += 1

                # If we've reached the end but the last tile is too small,
                # adjust to ensure full coverage
                if x >= width and x2 < width:
                    break

            # Move to next row
            y += step
            row += 1

            if y >= height and y2 < height:
                break

        return boundaries

    def _calculate_overlap_regions(
        self,
        tile_bounds: Tuple[int, int, int, int],
        all_boundaries: List[Tuple[int, int, int, int]],
        tile_index: int,
    ) -> List[OverlapRegion]:
        """
        Calculate overlap regions between a tile and its neighbors.

        Args:
            tile_bounds: (x1, y1, x2, y2) of current tile
            all_boundaries: List of all tile boundaries
            tile_index: Index of current tile

        Returns:
            List of OverlapRegion objects
        """
        x1, y1, x2, y2 = tile_bounds
        overlaps = []

        for i, other_bounds in enumerate(all_boundaries):
            if i == tile_index:
                continue

            ox1, oy1, ox2, oy2 = other_bounds

            # Check for overlap
            inter_x1 = max(x1, ox1)
            inter_y1 = max(y1, oy1)
            inter_x2 = min(x2, ox2)
            inter_y2 = min(y2, oy2)

            if inter_x1 < inter_x2 and inter_y1 < inter_y2:
                # Convert to tile-local coordinates
                local_x1 = inter_x1 - x1
                local_y1 = inter_y1 - y1
                local_x2 = inter_x2 - x1
                local_y2 = inter_y2 - y1

                overlaps.append(OverlapRegion(
                    adjacent_tile_id=f"tile_{i}",
                    region=(local_x1, local_y1, local_x2, local_y2),
                ))

        return overlaps

    def create_tiles(
        self,
        image: np.ndarray,
        phase0_boundaries: Optional["ColorBoundaryResult"] = None,
    ) -> List[ImageTile]:
        """
        Create tiles from an image.

        Args:
            image: Input image (H, W, C)
            phase0_boundaries: Optional Phase 0 results for smart boundary alignment

        Returns:
            List of ImageTile objects
        """
        height, width = image.shape[:2]

        # Calculate boundaries (grid-based for now)
        # Smart boundaries are handled in smart_boundaries.py
        boundaries = self._calculate_grid_boundaries(width, height)

        # Create tiles
        tiles = []
        for i, bounds in enumerate(boundaries):
            x1, y1, x2, y2 = bounds

            # Extract tile pixels
            tile_image = image[y1:y2, x1:x2].copy()

            # Calculate overlap regions
            overlaps = self._calculate_overlap_regions(bounds, boundaries, i)

            tile = ImageTile(
                id=f"tile_{i}",
                image=tile_image,
                bounds=bounds,
                overlap_regions=overlaps,
            )
            tiles.append(tile)

        return tiles

    def get_tile_count(self, width: int, height: int) -> int:
        """
        Calculate how many tiles would be created for given dimensions.

        Args:
            width: Image width
            height: Image height

        Returns:
            Number of tiles
        """
        if width <= self.max_dimension and height <= self.max_dimension:
            return 1

        boundaries = self._calculate_grid_boundaries(width, height)
        return len(boundaries)
