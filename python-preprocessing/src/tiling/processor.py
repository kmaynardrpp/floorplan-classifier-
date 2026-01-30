"""
TileProcessor: High-level wrapper for tiled image processing.

Task 4.3: Create TileProcessor Wrapper Class
Task 4.5: Implement Parallel Tile Processing
Task 4.6: Add Progress Tracking for Tiled Processing
"""

from typing import List, Callable, Optional, Any, Dict, TYPE_CHECKING
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np

from .models import ImageTile, TileZoneResult, TilingConfig, Zone
from .tiler import ImageTiler
from .merging import merge_zones, deduplicate_zones, MergedZone
from .smart_boundaries import create_smart_boundaries

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult


@dataclass
class ProcessingProgress:
    """Progress information for tiled processing."""
    total_tiles: int
    completed_tiles: int
    current_tile: Optional[str] = None
    status: str = "pending"  # pending, processing, merging, complete, error
    error_message: Optional[str] = None

    @property
    def progress_percent(self) -> float:
        """Get completion percentage."""
        if self.total_tiles == 0:
            return 100.0
        return (self.completed_tiles / self.total_tiles) * 100

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_tiles": self.total_tiles,
            "completed_tiles": self.completed_tiles,
            "current_tile": self.current_tile,
            "status": self.status,
            "progress_percent": self.progress_percent,
            "error_message": self.error_message,
        }


# Type alias for tile processing function
TileProcessorFn = Callable[[ImageTile], List[Zone]]


class TileProcessor:
    """
    High-level processor for tiled image analysis.

    Handles:
    - Deciding whether to tile
    - Creating tiles with smart boundaries
    - Processing tiles (sequentially or in parallel)
    - Merging results

    Example:
        >>> processor = TileProcessor(config)
        >>> results = processor.process(image, process_single_tile)
    """

    def __init__(
        self,
        config: Optional[TilingConfig] = None,
        progress_callback: Optional[Callable[[ProcessingProgress], None]] = None,
    ):
        """
        Initialize the tile processor.

        Args:
            config: Tiling configuration
            progress_callback: Optional callback for progress updates
        """
        self.config = config or TilingConfig()
        self.progress_callback = progress_callback
        self.tiler = ImageTiler(config=self.config)
        self._progress = ProcessingProgress(total_tiles=0, completed_tiles=0)

    def should_tile(self, image: np.ndarray) -> bool:
        """
        Check if image should be tiled.

        Args:
            image: Input image

        Returns:
            True if image exceeds dimension threshold
        """
        if not self.config.enabled:
            return False
        return self.tiler.should_tile(image)

    def create_tiles(
        self,
        image: np.ndarray,
        phase0_boundaries: Optional["ColorBoundaryResult"] = None,
    ) -> List[ImageTile]:
        """
        Create tiles from image.

        Args:
            image: Input image
            phase0_boundaries: Optional Phase 0 results for smart boundaries

        Returns:
            List of ImageTile objects
        """
        height, width = image.shape[:2]

        if self.config.smart_boundaries and phase0_boundaries is not None:
            # Use smart boundaries
            boundaries = create_smart_boundaries(
                width=width,
                height=height,
                phase0_boundaries=phase0_boundaries,
                tile_size=self.config.tile_size,
                overlap=self.config.overlap,
            )

            # Create tiles from boundaries
            tiles = []
            for i, (x1, y1, x2, y2) in enumerate(boundaries):
                tile_image = image[y1:y2, x1:x2].copy()
                tile = ImageTile(
                    id=f"tile_{i}",
                    image=tile_image,
                    bounds=(x1, y1, x2, y2),
                    overlap_regions=[],  # TODO: Calculate overlaps
                )
                tiles.append(tile)
            return tiles
        else:
            # Use grid-based tiling
            return self.tiler.create_tiles(image)

    def process(
        self,
        image: np.ndarray,
        process_fn: TileProcessorFn,
        phase0_boundaries: Optional["ColorBoundaryResult"] = None,
        parallel: bool = True,
    ) -> List[MergedZone]:
        """
        Process an image with tiling support.

        Args:
            image: Input image
            process_fn: Function to process a single tile, returns zones
            phase0_boundaries: Optional Phase 0 results
            parallel: Whether to process tiles in parallel

        Returns:
            List of merged zones in original image coordinates
        """
        # Check if tiling is needed
        if not self.should_tile(image):
            # Process as single tile
            self._update_progress(1, 0, "processing", "tile_0")
            tile = ImageTile(
                id="tile_0",
                image=image,
                bounds=(0, 0, image.shape[1], image.shape[0]),
                overlap_regions=[],
            )
            zones = process_fn(tile)
            self._update_progress(1, 1, "complete")

            # Convert to MergedZone format
            return [
                MergedZone(
                    id=f"zone_{i}",
                    zone_type=z.zone_type,
                    polygon=z.polygon,
                    confidence=z.confidence,
                    source_zones=[f"tile_0:{z.id}"],
                    metadata=z.metadata.copy(),
                )
                for i, z in enumerate(zones)
            ]

        # Create tiles
        tiles = self.create_tiles(image, phase0_boundaries)
        self._update_progress(len(tiles), 0, "processing")

        # Process tiles
        if parallel and len(tiles) > 1:
            tile_results = self._process_parallel(tiles, process_fn)
        else:
            tile_results = self._process_sequential(tiles, process_fn)

        # Merge results
        self._update_progress(len(tiles), len(tiles), "merging")
        merged = merge_zones(tile_results, self.config.merge_iou_threshold)

        # Deduplicate
        final_zones = deduplicate_zones(merged, iou_threshold=0.9)

        self._update_progress(len(tiles), len(tiles), "complete")
        return final_zones

    def _process_sequential(
        self,
        tiles: List[ImageTile],
        process_fn: TileProcessorFn,
    ) -> List[TileZoneResult]:
        """Process tiles sequentially."""
        results = []
        for i, tile in enumerate(tiles):
            self._update_progress(len(tiles), i, "processing", tile.id)
            try:
                zones = process_fn(tile)
                results.append(TileZoneResult(
                    tile_id=tile.id,
                    zones=zones,
                    bounds=tile.bounds,
                ))
            except Exception as e:
                self._update_progress(len(tiles), i, "error", tile.id, str(e))
                # Continue processing other tiles
                results.append(TileZoneResult(
                    tile_id=tile.id,
                    zones=[],
                    bounds=tile.bounds,
                ))

        return results

    def _process_parallel(
        self,
        tiles: List[ImageTile],
        process_fn: TileProcessorFn,
    ) -> List[TileZoneResult]:
        """Process tiles in parallel using ThreadPoolExecutor."""
        results = [None] * len(tiles)
        completed = 0

        with ThreadPoolExecutor(max_workers=self.config.max_parallel_tiles) as executor:
            future_to_idx = {
                executor.submit(process_fn, tile): i
                for i, tile in enumerate(tiles)
            }

            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                tile = tiles[idx]
                completed += 1

                try:
                    zones = future.result()
                    results[idx] = TileZoneResult(
                        tile_id=tile.id,
                        zones=zones,
                        bounds=tile.bounds,
                    )
                    self._update_progress(len(tiles), completed, "processing", tile.id)
                except Exception as e:
                    results[idx] = TileZoneResult(
                        tile_id=tile.id,
                        zones=[],
                        bounds=tile.bounds,
                    )
                    self._update_progress(len(tiles), completed, "processing", tile.id)

        return [r for r in results if r is not None]

    def _update_progress(
        self,
        total: int,
        completed: int,
        status: str,
        current_tile: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """Update progress and notify callback."""
        self._progress = ProcessingProgress(
            total_tiles=total,
            completed_tiles=completed,
            current_tile=current_tile,
            status=status,
            error_message=error,
        )

        if self.progress_callback:
            self.progress_callback(self._progress)

    @property
    def progress(self) -> ProcessingProgress:
        """Get current processing progress."""
        return self._progress
