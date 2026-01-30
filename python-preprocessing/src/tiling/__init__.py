"""
Tiled Processing Module (IMP-02)

Handles large images by splitting them into overlapping tiles,
processing each tile independently, and merging results.
"""

from .models import ImageTile, OverlapRegion, TileZoneResult, TilingConfig, Zone
from .tiler import ImageTiler
from .transforms import tile_to_original, transform_polygon, original_to_tile
from .iou import calculate_iou, calculate_iou_fast, zones_overlap
from .merging import merge_zones, MergedZone, find_merge_candidates
from .processor import TileProcessor, ProcessingProgress

__all__ = [
    # Models
    "ImageTile",
    "OverlapRegion",
    "TileZoneResult",
    "TilingConfig",
    "Zone",
    # Tiler
    "ImageTiler",
    # Transforms
    "tile_to_original",
    "transform_polygon",
    "original_to_tile",
    # IoU
    "calculate_iou",
    "calculate_iou_fast",
    "zones_overlap",
    # Merging
    "merge_zones",
    "MergedZone",
    "find_merge_candidates",
    # Processor
    "TileProcessor",
    "ProcessingProgress",
]
