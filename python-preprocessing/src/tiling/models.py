"""
Data structures for image tiling.

Task 3.1: Create ImageTile Data Structure
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
import numpy as np


@dataclass
class OverlapRegion:
    """
    Defines an overlap region between adjacent tiles.

    Attributes:
        adjacent_tile_id: ID of the neighboring tile
        region: Bounding box (x1, y1, x2, y2) in this tile's coordinate space
    """
    adjacent_tile_id: str
    region: Tuple[int, int, int, int]  # (x1, y1, x2, y2)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "adjacent_tile_id": self.adjacent_tile_id,
            "region": {
                "x1": self.region[0],
                "y1": self.region[1],
                "x2": self.region[2],
                "y2": self.region[3],
            },
        }


@dataclass
class ImageTile:
    """
    Represents a single tile extracted from a larger image.

    Attributes:
        id: Unique identifier for this tile (e.g., "tile_0_0")
        image: Tile pixel data (numpy array, BGR)
        bounds: (x1, y1, x2, y2) in original image coordinates
        overlap_regions: List of overlap regions with adjacent tiles
    """
    id: str
    image: np.ndarray
    bounds: Tuple[int, int, int, int]  # (x1, y1, x2, y2) in original image
    overlap_regions: List[OverlapRegion] = field(default_factory=list)

    @property
    def x1(self) -> int:
        """Left edge in original image."""
        return self.bounds[0]

    @property
    def y1(self) -> int:
        """Top edge in original image."""
        return self.bounds[1]

    @property
    def x2(self) -> int:
        """Right edge in original image."""
        return self.bounds[2]

    @property
    def y2(self) -> int:
        """Bottom edge in original image."""
        return self.bounds[3]

    @property
    def width(self) -> int:
        """Tile width in pixels."""
        return self.bounds[2] - self.bounds[0]

    @property
    def height(self) -> int:
        """Tile height in pixels."""
        return self.bounds[3] - self.bounds[1]

    @property
    def offset(self) -> Tuple[int, int]:
        """Offset (x, y) from original image origin."""
        return (self.bounds[0], self.bounds[1])

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (without image data)."""
        return {
            "id": self.id,
            "bounds": {
                "x1": self.bounds[0],
                "y1": self.bounds[1],
                "x2": self.bounds[2],
                "y2": self.bounds[3],
            },
            "width": self.width,
            "height": self.height,
            "overlap_regions": [r.to_dict() for r in self.overlap_regions],
        }


@dataclass
class Zone:
    """
    Represents a detected zone (for use in tile results).

    Simplified zone representation for tiling purposes.
    """
    id: str
    zone_type: str
    polygon: List[Tuple[int, int]]
    confidence: float = 0.9
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "zone_type": self.zone_type,
            "polygon": [{"x": x, "y": y} for x, y in self.polygon],
            "confidence": self.confidence,
            "metadata": self.metadata,
        }


@dataclass
class TileZoneResult:
    """
    Results from processing a single tile.

    Attributes:
        tile_id: ID of the processed tile
        zones: List of zones detected in this tile (in tile coordinates)
        bounds: Tile bounds in original image coordinates
    """
    tile_id: str
    zones: List[Zone]
    bounds: Tuple[int, int, int, int]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "tile_id": self.tile_id,
            "zones": [z.to_dict() for z in self.zones],
            "bounds": {
                "x1": self.bounds[0],
                "y1": self.bounds[1],
                "x2": self.bounds[2],
                "y2": self.bounds[3],
            },
        }


@dataclass
class TilingConfig:
    """
    Configuration for tiled processing.

    Task 4.8: Add Tiling Configuration Options
    """
    enabled: bool = True
    dimension_threshold: int = 4000  # Tile if width OR height > this
    tile_size: int = 2048  # Target tile size
    overlap: int = 256  # Overlap between adjacent tiles
    smart_boundaries: bool = True  # Use Phase 0 for smart splits
    merge_iou_threshold: float = 0.3  # IoU threshold for merging zones
    max_parallel_tiles: int = 4  # Max concurrent tile processing

    def __post_init__(self):
        """Validate configuration."""
        if self.overlap >= self.tile_size:
            raise ValueError(f"overlap ({self.overlap}) must be < tile_size ({self.tile_size})")
        if self.merge_iou_threshold < 0 or self.merge_iou_threshold > 1:
            raise ValueError(f"merge_iou_threshold must be 0-1, got {self.merge_iou_threshold}")
        if self.max_parallel_tiles < 1:
            raise ValueError(f"max_parallel_tiles must be >= 1, got {self.max_parallel_tiles}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "enabled": self.enabled,
            "dimension_threshold": self.dimension_threshold,
            "tile_size": self.tile_size,
            "overlap": self.overlap,
            "smart_boundaries": self.smart_boundaries,
            "merge_iou_threshold": self.merge_iou_threshold,
            "max_parallel_tiles": self.max_parallel_tiles,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TilingConfig":
        """Create from dictionary."""
        return cls(
            enabled=data.get("enabled", True),
            dimension_threshold=data.get("dimension_threshold", 4000),
            tile_size=data.get("tile_size", 2048),
            overlap=data.get("overlap", 256),
            smart_boundaries=data.get("smart_boundaries", True),
            merge_iou_threshold=data.get("merge_iou_threshold", 0.3),
            max_parallel_tiles=data.get("max_parallel_tiles", 4),
        )
