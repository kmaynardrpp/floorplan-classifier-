"""
Color Boundary Detection Module (Phase 0)

Detects pre-drawn zone boundaries based on color signatures.
Runs before edge detection as Phase 0 of preprocessing.
"""

from .models import (
    ColorBoundaryResult,
    DetectedBoundary,
)

__all__ = [
    "ColorBoundaryResult",
    "DetectedBoundary",
]
