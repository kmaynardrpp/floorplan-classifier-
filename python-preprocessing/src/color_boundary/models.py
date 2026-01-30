"""
Data structures for color boundary detection results.

Task 1.1: ColorBoundaryResult Data Structure
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
import numpy as np


@dataclass
class DetectedBoundary:
    """
    Represents a single detected color boundary region.

    Attributes:
        contour: Raw OpenCV contour array (Nx1x2)
        color: Name of the detected color (e.g., 'orange', 'yellow')
        area: Area in pixels
        polygon: Simplified polygon as list of (x, y) tuples
        confidence: Detection confidence (0.0-1.0), typically 0.95 for color detection
    """
    contour: np.ndarray
    color: str
    area: int
    polygon: List[Tuple[int, int]]
    confidence: float = 0.95

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "color": self.color,
            "area": int(self.area),
            "polygon": [{"x": int(x), "y": int(y)} for x, y in self.polygon],
            "confidence": round(float(self.confidence), 3),
            "vertex_count": len(self.polygon),
        }

    def is_closed(self) -> bool:
        """
        Check if this boundary forms a closed region.

        A boundary is considered closed if:
        - It has at least 3 vertices
        - The area is positive (not a line)
        """
        return len(self.polygon) >= 3 and self.area > 0


@dataclass
class ColorBoundaryResult:
    """
    Combined results from color boundary detection.

    Attributes:
        boundaries: List of all detected boundaries
        combined_mask: Binary mask combining all color detections (uint8)
        coverage_ratio: Fraction of image covered by boundaries (0.0-1.0)
        image_shape: Original image shape (height, width)
    """
    boundaries: List[DetectedBoundary]
    combined_mask: np.ndarray
    coverage_ratio: float
    image_shape: Tuple[int, int] = field(default=(0, 0))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "boundaries": [b.to_dict() for b in self.boundaries],
            "coverage_ratio": round(float(self.coverage_ratio), 4),
            "boundary_count": len(self.boundaries),
            "image_shape": {
                "height": int(self.image_shape[0]),
                "width": int(self.image_shape[1]),
            },
            "colors_detected": list(set(b.color for b in self.boundaries)),
            "total_boundary_area": sum(b.area for b in self.boundaries),
        }

    def to_hints(self) -> Dict[str, Any]:
        """
        Convert to preprocessing hints format for AI phases.

        This format is used to pass color boundary information
        to subsequent processing stages and the AI model.
        """
        return {
            "detected_colored_boundaries": [
                {
                    "polygon": [{"x": int(x), "y": int(y)} for x, y in b.polygon],
                    "color": b.color,
                    "area_px": int(b.area),
                    "confidence": round(float(b.confidence), 3),
                }
                for b in self.boundaries
            ],
            "boundary_coverage_ratio": round(float(self.coverage_ratio), 4),
            "has_predefined_zones": self.coverage_ratio > 0.1,
        }

    def get_boundaries_by_color(self, color: str) -> List[DetectedBoundary]:
        """Get all boundaries of a specific color."""
        return [b for b in self.boundaries if b.color == color]

    def get_closed_boundaries(self) -> List[DetectedBoundary]:
        """Get only boundaries that form closed regions."""
        return [b for b in self.boundaries if b.is_closed()]

    def has_sufficient_closed_boundaries(self, minimum: int = 3) -> bool:
        """
        Check if there are enough closed boundaries for fast-track mode.

        Args:
            minimum: Minimum number of closed boundaries required

        Returns:
            True if closed boundary count >= minimum
        """
        return len(self.get_closed_boundaries()) >= minimum

    @classmethod
    def empty(cls, image_shape: Tuple[int, int] = (0, 0)) -> "ColorBoundaryResult":
        """Create an empty result (no boundaries detected)."""
        mask = np.zeros(image_shape[:2], dtype=np.uint8) if image_shape[0] > 0 else np.array([], dtype=np.uint8)
        return cls(
            boundaries=[],
            combined_mask=mask,
            coverage_ratio=0.0,
            image_shape=image_shape,
        )
