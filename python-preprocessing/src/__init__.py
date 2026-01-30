"""
Floorplan Preprocessing Package

Provides image preprocessing capabilities to augment Gemini AI analysis
for warehouse floorplan zone detection.
"""

from .edge_detection import process_edges, EdgeDetectionResult
from .region_segmentation import process_segmentation, SegmentationResult, RegionType
from .line_detection import process_lines, LineDetectionResult
from .pipeline import (
    preprocess_floorplan,
    PreprocessingConfig,
    PreprocessingResult,
    image_from_base64,
    result_to_json,
)

__all__ = [
    "process_edges",
    "EdgeDetectionResult",
    "process_segmentation",
    "SegmentationResult",
    "RegionType",
    "process_lines",
    "LineDetectionResult",
    "preprocess_floorplan",
    "PreprocessingConfig",
    "PreprocessingResult",
    "image_from_base64",
    "result_to_json",
]
