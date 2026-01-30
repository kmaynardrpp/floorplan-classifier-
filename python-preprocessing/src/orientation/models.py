"""
Data structures for orientation detection.

Task 5.1: Implement OrientationHint Data Structure
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Tuple
from enum import Enum


class Orientation(Enum):
    """Cardinal orientations for floorplan images."""
    NORTH = 0  # No rotation needed
    EAST = 90  # Rotated 90° clockwise
    SOUTH = 180  # Rotated 180°
    WEST = 270  # Rotated 270° clockwise (90° counter-clockwise)

    @property
    def degrees(self) -> int:
        """Get rotation in degrees."""
        return self.value

    @property
    def correction_degrees(self) -> int:
        """Get degrees needed to correct to NORTH orientation."""
        return (360 - self.value) % 360


@dataclass
class OrientationHint:
    """
    Hint about detected orientation from a single source.

    Attributes:
        source: What detected this hint (e.g., "text_direction", "boundary_lines")
        orientation: Detected orientation
        confidence: Confidence score 0.0-1.0
        details: Additional details about detection
    """
    source: str
    orientation: Orientation
    confidence: float
    details: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        """Validate confidence score."""
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be 0.0-1.0, got {self.confidence}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "source": self.source,
            "orientation": self.orientation.name,
            "degrees": self.orientation.degrees,
            "confidence": self.confidence,
            "details": self.details,
        }


@dataclass
class OrientationResult:
    """
    Combined result from orientation detection.

    Attributes:
        detected_orientation: Most likely orientation
        confidence: Overall confidence score
        hints: Individual hints from different sources
        needs_correction: Whether image needs rotation
    """
    detected_orientation: Orientation
    confidence: float
    hints: List[OrientationHint] = field(default_factory=list)

    def __post_init__(self):
        """Validate fields."""
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be 0.0-1.0, got {self.confidence}")

    @property
    def needs_correction(self) -> bool:
        """Check if image needs rotation correction."""
        return self.detected_orientation != Orientation.NORTH

    @property
    def correction_degrees(self) -> int:
        """Get degrees needed to correct orientation."""
        return self.detected_orientation.correction_degrees

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "detected_orientation": self.detected_orientation.name,
            "degrees": self.detected_orientation.degrees,
            "confidence": self.confidence,
            "needs_correction": self.needs_correction,
            "correction_degrees": self.correction_degrees,
            "hints": [h.to_dict() for h in self.hints],
        }

    @classmethod
    def no_correction_needed(cls) -> "OrientationResult":
        """Create result indicating no correction needed."""
        return cls(
            detected_orientation=Orientation.NORTH,
            confidence=1.0,
            hints=[OrientationHint(
                source="default",
                orientation=Orientation.NORTH,
                confidence=1.0,
            )],
        )
