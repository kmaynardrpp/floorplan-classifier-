"""
Integrated Processing Pipeline (IMP-06)

End-to-end pipeline for floorplan zone detection with
caching, adaptive processing, and performance optimization.
"""

from .cache import ResultCache, CacheKey
from .processor import FloorplanProcessor, ProcessingResult
from .runner import PipelineRunner, PipelineConfig

__all__ = [
    "ResultCache",
    "CacheKey",
    "FloorplanProcessor",
    "ProcessingResult",
    "PipelineRunner",
    "PipelineConfig",
]
