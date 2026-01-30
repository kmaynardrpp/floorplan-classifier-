"""
Zone Type Detection Module (IMP-04)

Handles enhanced zone type classification, staging area detection,
and zone validation.
"""

from .types import ZoneType, ZONE_PROPERTIES
from .classifier import ZoneClassifier
from .staging import StagingAreaDetector
from .validation import ZoneValidator, ValidationResult

__all__ = [
    "ZoneType",
    "ZONE_PROPERTIES",
    "ZoneClassifier",
    "StagingAreaDetector",
    "ZoneValidator",
    "ValidationResult",
]
