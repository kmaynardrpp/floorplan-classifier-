"""
Orientation Detection Module (IMP-03)

Handles multi-orientation detection and correction for floorplan images.
"""

from .models import OrientationHint, OrientationResult
from .detector import OrientationDetector
from .correction import rotate_image, correct_orientation

__all__ = [
    "OrientationHint",
    "OrientationResult",
    "OrientationDetector",
    "rotate_image",
    "correct_orientation",
]
