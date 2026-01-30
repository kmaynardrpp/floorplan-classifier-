"""
Orientation detection using multiple signals.

Task 5.2: Implement Orientation Detection Logic
"""

from typing import List, Optional, Dict, Any, TYPE_CHECKING
import numpy as np
import cv2

from .models import Orientation, OrientationHint, OrientationResult

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult


class OrientationDetector:
    """
    Detects image orientation using multiple signals.

    Signals used:
    - Text direction (OCR-based)
    - Dominant line directions
    - Boundary polygon analysis
    - Aspect ratio heuristics

    Example:
        >>> detector = OrientationDetector()
        >>> result = detector.detect(image)
        >>> if result.needs_correction:
        ...     image = rotate_image(image, result.correction_degrees)
    """

    def __init__(
        self,
        use_text_detection: bool = True,
        use_line_detection: bool = True,
        use_boundary_analysis: bool = True,
        min_confidence: float = 0.6,
    ):
        """
        Initialize orientation detector.

        Args:
            use_text_detection: Whether to use text-based detection
            use_line_detection: Whether to use line-based detection
            use_boundary_analysis: Whether to use boundary analysis
            min_confidence: Minimum confidence to report detection
        """
        self.use_text_detection = use_text_detection
        self.use_line_detection = use_line_detection
        self.use_boundary_analysis = use_boundary_analysis
        self.min_confidence = min_confidence

    def detect(
        self,
        image: np.ndarray,
        phase0_boundaries: Optional["ColorBoundaryResult"] = None,
    ) -> OrientationResult:
        """
        Detect image orientation.

        Args:
            image: Input image (BGR)
            phase0_boundaries: Optional Phase 0 boundary results

        Returns:
            OrientationResult with detected orientation
        """
        hints = []

        # Collect hints from different sources
        if self.use_line_detection:
            line_hint = self._detect_from_lines(image)
            if line_hint:
                hints.append(line_hint)

        if self.use_boundary_analysis and phase0_boundaries:
            boundary_hint = self._detect_from_boundaries(phase0_boundaries)
            if boundary_hint:
                hints.append(boundary_hint)

        # Analyze aspect ratio
        aspect_hint = self._detect_from_aspect_ratio(image)
        if aspect_hint:
            hints.append(aspect_hint)

        # Combine hints to determine orientation
        return self._combine_hints(hints)

    def _detect_from_lines(self, image: np.ndarray) -> Optional[OrientationHint]:
        """
        Detect orientation from dominant line directions.

        Uses Hough transform to find dominant lines and their directions.
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)

        # Detect lines
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=100,
            minLineLength=100,
            maxLineGap=10,
        )

        if lines is None or len(lines) < 5:
            return None

        # Analyze line angles
        angles = []
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi
            angles.append(angle)

        angles = np.array(angles)

        # Count lines in different directions
        horizontal = np.sum(np.abs(angles) < 15) + np.sum(np.abs(angles) > 165)
        vertical = np.sum((np.abs(angles) > 75) & (np.abs(angles) < 105))

        # Determine orientation based on line dominance
        total = len(angles)
        if total == 0:
            return None

        h_ratio = horizontal / total
        v_ratio = vertical / total

        if h_ratio > 0.4 and v_ratio > 0.4:
            # Good mix of horizontal and vertical lines - likely correct orientation
            return OrientationHint(
                source="line_detection",
                orientation=Orientation.NORTH,
                confidence=min(h_ratio, v_ratio) * 1.5,
                details={
                    "horizontal_ratio": float(h_ratio),
                    "vertical_ratio": float(v_ratio),
                    "total_lines": total,
                },
            )
        elif v_ratio > h_ratio * 2:
            # Mostly vertical lines - might be rotated
            return OrientationHint(
                source="line_detection",
                orientation=Orientation.EAST,
                confidence=0.4,
                details={
                    "horizontal_ratio": float(h_ratio),
                    "vertical_ratio": float(v_ratio),
                    "note": "Mostly vertical lines detected",
                },
            )

        return None

    def _detect_from_boundaries(
        self,
        boundaries: "ColorBoundaryResult",
    ) -> Optional[OrientationHint]:
        """
        Detect orientation from Phase 0 color boundary analysis.

        Analyzes the orientation of detected boundary polygons.
        """
        if not boundaries.boundaries:
            return None

        # Analyze boundary polygons for orientation cues
        horizontal_edges = 0
        vertical_edges = 0

        for boundary in boundaries.boundaries:
            polygon = boundary.polygon
            if len(polygon) < 3:
                continue

            # Analyze edges
            for i in range(len(polygon)):
                p1 = polygon[i]
                p2 = polygon[(i + 1) % len(polygon)]

                dx = abs(p2[0] - p1[0])
                dy = abs(p2[1] - p1[1])

                # Long edges indicate alignment
                length = np.sqrt(dx**2 + dy**2)
                if length < 50:
                    continue

                if dx > dy * 3:  # Horizontal edge
                    horizontal_edges += 1
                elif dy > dx * 3:  # Vertical edge
                    vertical_edges += 1

        total_edges = horizontal_edges + vertical_edges
        if total_edges < 4:
            return None

        # Good balance suggests correct orientation
        h_ratio = horizontal_edges / total_edges
        v_ratio = vertical_edges / total_edges

        if 0.3 < h_ratio < 0.7 and 0.3 < v_ratio < 0.7:
            confidence = 1.0 - abs(h_ratio - 0.5) * 2
            return OrientationHint(
                source="boundary_analysis",
                orientation=Orientation.NORTH,
                confidence=confidence,
                details={
                    "horizontal_edges": horizontal_edges,
                    "vertical_edges": vertical_edges,
                },
            )

        return None

    def _detect_from_aspect_ratio(
        self,
        image: np.ndarray,
    ) -> Optional[OrientationHint]:
        """
        Detect orientation from image aspect ratio.

        Most floorplans are wider than tall (landscape).
        """
        height, width = image.shape[:2]
        aspect_ratio = width / height

        if aspect_ratio > 1.2:
            # Landscape - likely correct
            return OrientationHint(
                source="aspect_ratio",
                orientation=Orientation.NORTH,
                confidence=0.3,
                details={"aspect_ratio": float(aspect_ratio)},
            )
        elif aspect_ratio < 0.8:
            # Portrait - might need rotation
            return OrientationHint(
                source="aspect_ratio",
                orientation=Orientation.EAST,
                confidence=0.2,
                details={"aspect_ratio": float(aspect_ratio)},
            )

        return None

    def _combine_hints(self, hints: List[OrientationHint]) -> OrientationResult:
        """
        Combine multiple hints into a final orientation result.

        Uses weighted voting based on confidence scores.
        """
        if not hints:
            return OrientationResult.no_correction_needed()

        # Weighted voting for each orientation
        votes: Dict[Orientation, float] = {
            Orientation.NORTH: 0.0,
            Orientation.EAST: 0.0,
            Orientation.SOUTH: 0.0,
            Orientation.WEST: 0.0,
        }

        for hint in hints:
            votes[hint.orientation] += hint.confidence

        # Find winning orientation
        best_orientation = max(votes, key=votes.get)
        total_confidence = sum(votes.values())

        if total_confidence == 0:
            return OrientationResult.no_correction_needed()

        confidence = votes[best_orientation] / total_confidence

        # Only return if confidence meets threshold
        if confidence < self.min_confidence:
            return OrientationResult(
                detected_orientation=Orientation.NORTH,
                confidence=1.0 - confidence,
                hints=hints,
            )

        return OrientationResult(
            detected_orientation=best_orientation,
            confidence=confidence,
            hints=hints,
        )
