"""
Closed region detection for fast-track mode eligibility.

Task 7.1: Implement Closed Region Detection
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional, TYPE_CHECKING
import numpy as np
import cv2

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult, DetectedBoundary


@dataclass
class ClosedRegionResult:
    """Result of closed region analysis."""
    has_closed_regions: bool
    closed_region_count: int
    total_boundary_count: int
    closure_ratio: float
    closed_boundaries: List[int] = field(default_factory=list)  # Indices
    details: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_fast_track_eligible(self) -> bool:
        """Check if results qualify for fast-track processing."""
        # Require at least one closed region and good closure ratio
        return self.has_closed_regions and self.closure_ratio >= 0.5

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "has_closed_regions": self.has_closed_regions,
            "closed_region_count": self.closed_region_count,
            "total_boundary_count": self.total_boundary_count,
            "closure_ratio": self.closure_ratio,
            "is_fast_track_eligible": self.is_fast_track_eligible,
            "closed_boundaries": self.closed_boundaries,
            "details": self.details,
        }


class ClosedRegionDetector:
    """
    Detects closed regions in Phase 0 boundary results.

    A closed region is a boundary polygon that forms a complete
    enclosure (the start and end points connect, forming a closed shape).

    This is critical for fast-track mode, which requires well-defined
    zone boundaries to skip detailed analysis.

    Example:
        >>> detector = ClosedRegionDetector()
        >>> result = detector.analyze(phase0_boundaries)
        >>> if result.is_fast_track_eligible:
        ...     use_fast_track_mode()
    """

    def __init__(
        self,
        closure_threshold: float = 10.0,
        min_area_ratio: float = 0.01,
        min_vertices: int = 4,
    ):
        """
        Initialize detector.

        Args:
            closure_threshold: Maximum gap (pixels) between start/end to consider closed
            min_area_ratio: Minimum area as ratio of image area
            min_vertices: Minimum vertices for a valid closed region
        """
        self.closure_threshold = closure_threshold
        self.min_area_ratio = min_area_ratio
        self.min_vertices = min_vertices

    def analyze(
        self,
        boundaries: "ColorBoundaryResult",
        image_size: Optional[Tuple[int, int]] = None,
    ) -> ClosedRegionResult:
        """
        Analyze boundaries for closed regions.

        Args:
            boundaries: Phase 0 color boundary results
            image_size: Optional (width, height) for area ratio calculation

        Returns:
            ClosedRegionResult with analysis
        """
        if not boundaries.boundaries:
            return ClosedRegionResult(
                has_closed_regions=False,
                closed_region_count=0,
                total_boundary_count=0,
                closure_ratio=0.0,
            )

        total_count = len(boundaries.boundaries)
        closed_indices = []
        details = {
            "boundary_analysis": [],
        }

        for i, boundary in enumerate(boundaries.boundaries):
            is_closed, analysis = self._check_closure(boundary, image_size)
            details["boundary_analysis"].append({
                "index": i,
                "is_closed": is_closed,
                **analysis,
            })

            if is_closed:
                closed_indices.append(i)

        closed_count = len(closed_indices)
        closure_ratio = closed_count / total_count if total_count > 0 else 0.0

        return ClosedRegionResult(
            has_closed_regions=closed_count > 0,
            closed_region_count=closed_count,
            total_boundary_count=total_count,
            closure_ratio=closure_ratio,
            closed_boundaries=closed_indices,
            details=details,
        )

    def _check_closure(
        self,
        boundary: "DetectedBoundary",
        image_size: Optional[Tuple[int, int]],
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Check if a boundary forms a closed region.

        Args:
            boundary: Detected boundary to check
            image_size: Optional image dimensions

        Returns:
            (is_closed, analysis_details)
        """
        polygon = boundary.polygon

        # Check minimum vertices
        if len(polygon) < self.min_vertices:
            return False, {
                "reason": "insufficient_vertices",
                "vertex_count": len(polygon),
            }

        # Check if polygon closes (start ≈ end)
        start = np.array(polygon[0])
        end = np.array(polygon[-1])
        gap = np.linalg.norm(start - end)

        if gap > self.closure_threshold:
            return False, {
                "reason": "not_closed",
                "gap": float(gap),
                "threshold": self.closure_threshold,
            }

        # Check area
        pts = np.array(polygon, dtype=np.float32)
        area = cv2.contourArea(pts)

        if image_size:
            image_area = image_size[0] * image_size[1]
            area_ratio = area / image_area
            if area_ratio < self.min_area_ratio:
                return False, {
                    "reason": "area_too_small",
                    "area": float(area),
                    "area_ratio": float(area_ratio),
                    "min_ratio": self.min_area_ratio,
                }
        elif area < 100:  # Absolute minimum
            return False, {
                "reason": "area_too_small",
                "area": float(area),
            }

        # Check convexity (optional, for quality)
        hull = cv2.convexHull(pts)
        hull_area = cv2.contourArea(hull)
        convexity = area / hull_area if hull_area > 0 else 0

        return True, {
            "gap": float(gap),
            "area": float(area),
            "vertex_count": len(polygon),
            "convexity": float(convexity),
        }

    def detect_from_image(
        self,
        image: np.ndarray,
        min_area: int = 1000,
    ) -> ClosedRegionResult:
        """
        Detect closed regions directly from image using edge detection.

        Alternative to using Phase 0 boundaries.

        Args:
            image: Input image (BGR)
            min_area: Minimum contour area

        Returns:
            ClosedRegionResult
        """
        height, width = image.shape[:2]
        image_area = width * height

        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

        # Edge detection
        edges = cv2.Canny(gray, 50, 150)

        # Morphological closing to connect nearby edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        # Find contours
        contours, hierarchy = cv2.findContours(
            edges,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE,
        )

        closed_count = 0
        closed_indices = []

        for i, contour in enumerate(contours):
            area = cv2.contourArea(contour)
            if area < min_area:
                continue

            # Check if closed (contour is inherently closed if found)
            # Filter by area ratio
            area_ratio = area / image_area
            if area_ratio >= self.min_area_ratio:
                closed_count += 1
                closed_indices.append(i)

        total_count = len([c for c in contours if cv2.contourArea(c) >= min_area])
        closure_ratio = closed_count / total_count if total_count > 0 else 0.0

        return ClosedRegionResult(
            has_closed_regions=closed_count > 0,
            closed_region_count=closed_count,
            total_boundary_count=total_count,
            closure_ratio=closure_ratio,
            closed_boundaries=closed_indices,
        )
