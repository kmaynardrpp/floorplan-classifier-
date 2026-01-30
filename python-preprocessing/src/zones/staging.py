"""
Staging area detection logic.

Task 6.3: Staging Area Detection Logic
Task 6.6: Staging Area Detector
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
import cv2


@dataclass
class StagingAreaCandidate:
    """A candidate staging area region."""
    polygon: List[Tuple[int, int]]
    confidence: float
    area: float
    features: Dict[str, Any] = field(default_factory=dict)

    @property
    def bounds(self) -> Tuple[int, int, int, int]:
        """Get bounding box (x1, y1, x2, y2)."""
        if not self.polygon:
            return (0, 0, 0, 0)
        xs = [p[0] for p in self.polygon]
        ys = [p[1] for p in self.polygon]
        return (min(xs), min(ys), max(xs), max(ys))

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "polygon": [{"x": x, "y": y} for x, y in self.polygon],
            "confidence": self.confidence,
            "area": self.area,
            "bounds": self.bounds,
            "features": self.features,
        }


@dataclass
class StagingDetectionResult:
    """Result of staging area detection."""
    candidates: List[StagingAreaCandidate]
    total_staging_area: float
    coverage_ratio: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "candidates": [c.to_dict() for c in self.candidates],
            "total_staging_area": self.total_staging_area,
            "coverage_ratio": self.coverage_ratio,
            "count": len(self.candidates),
        }


class StagingAreaDetector:
    """
    Detects staging areas in floorplan images.

    Staging areas are typically:
    - Near shipping/receiving areas (edges of warehouse)
    - Open floor space (not racking)
    - Yellow or orange color-coded
    - Rectangular or irregular shape
    - Medium to large area

    Example:
        >>> detector = StagingAreaDetector()
        >>> result = detector.detect(image)
        >>> for candidate in result.candidates:
        ...     print(candidate.confidence, candidate.area)
    """

    def __init__(
        self,
        min_area: int = 5000,
        max_area: int = 500000,
        min_confidence: float = 0.3,
        edge_proximity_weight: float = 0.3,
    ):
        """
        Initialize staging area detector.

        Args:
            min_area: Minimum area in pixels to consider
            max_area: Maximum area in pixels to consider
            min_confidence: Minimum confidence threshold
            edge_proximity_weight: Weight for edge proximity scoring
        """
        self.min_area = min_area
        self.max_area = max_area
        self.min_confidence = min_confidence
        self.edge_proximity_weight = edge_proximity_weight

        # Color ranges for staging areas (yellow/orange in HSV)
        self.color_ranges = [
            # Yellow
            ((15, 80, 80), (35, 255, 255)),
            # Orange
            ((5, 100, 100), (20, 255, 255)),
            # Light yellow
            ((20, 50, 200), (40, 150, 255)),
        ]

    def detect(
        self,
        image: np.ndarray,
        mask: Optional[np.ndarray] = None,
    ) -> StagingDetectionResult:
        """
        Detect staging areas in an image.

        Args:
            image: Input image (BGR)
            mask: Optional mask of areas to ignore

        Returns:
            StagingDetectionResult with candidates
        """
        height, width = image.shape[:2]
        total_area = width * height

        # Convert to HSV for color detection
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # Create combined mask for staging area colors
        color_mask = np.zeros((height, width), dtype=np.uint8)
        for lower, upper in self.color_ranges:
            range_mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
            color_mask = cv2.bitwise_or(color_mask, range_mask)

        # Apply optional exclusion mask
        if mask is not None:
            color_mask = cv2.bitwise_and(color_mask, cv2.bitwise_not(mask))

        # Morphological operations to clean up
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_CLOSE, kernel)
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_OPEN, kernel)

        # Find contours
        contours, _ = cv2.findContours(
            color_mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE,
        )

        # Process candidates
        candidates = []
        for contour in contours:
            area = cv2.contourArea(contour)

            # Filter by area
            if area < self.min_area or area > self.max_area:
                continue

            # Simplify contour to polygon
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            polygon = [(int(pt[0][0]), int(pt[0][1])) for pt in approx]

            # Calculate features
            features = self._calculate_features(
                polygon, area, width, height, image
            )

            # Calculate confidence score
            confidence = self._calculate_confidence(features)

            if confidence >= self.min_confidence:
                candidates.append(StagingAreaCandidate(
                    polygon=polygon,
                    confidence=confidence,
                    area=area,
                    features=features,
                ))

        # Sort by confidence
        candidates.sort(key=lambda c: c.confidence, reverse=True)

        # Calculate totals
        total_staging = sum(c.area for c in candidates)
        coverage = total_staging / total_area if total_area > 0 else 0.0

        return StagingDetectionResult(
            candidates=candidates,
            total_staging_area=total_staging,
            coverage_ratio=coverage,
        )

    def _calculate_features(
        self,
        polygon: List[Tuple[int, int]],
        area: float,
        image_width: int,
        image_height: int,
        image: np.ndarray,
    ) -> Dict[str, Any]:
        """Calculate features for a candidate region."""
        if len(polygon) < 3:
            return {"valid": False}

        pts = np.array(polygon, dtype=np.float32)

        # Bounding box
        x, y, w, h = cv2.boundingRect(pts)

        # Distance to edges
        dist_left = x
        dist_right = image_width - (x + w)
        dist_top = y
        dist_bottom = image_height - (y + h)
        min_edge_dist = min(dist_left, dist_right, dist_top, dist_bottom)

        # Relative position
        center_x = x + w / 2
        center_y = y + h / 2
        rel_x = center_x / image_width
        rel_y = center_y / image_height

        # Aspect ratio
        aspect_ratio = w / h if h > 0 else 1.0

        # Rectangularity
        bbox_area = w * h
        rectangularity = area / bbox_area if bbox_area > 0 else 0.0

        # Color analysis in region
        mask = np.zeros((image_height, image_width), dtype=np.uint8)
        cv2.fillPoly(mask, [pts.astype(np.int32)], 255)
        region_hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        mean_hue = cv2.mean(region_hsv[:, :, 0], mask=mask)[0]
        mean_sat = cv2.mean(region_hsv[:, :, 1], mask=mask)[0]

        return {
            "valid": True,
            "area": float(area),
            "width": int(w),
            "height": int(h),
            "aspect_ratio": float(aspect_ratio),
            "rectangularity": float(rectangularity),
            "min_edge_distance": int(min_edge_dist),
            "edge_proximity": float(1.0 - min_edge_dist / (min(image_width, image_height) / 2)),
            "rel_x": float(rel_x),
            "rel_y": float(rel_y),
            "mean_hue": float(mean_hue),
            "mean_saturation": float(mean_sat),
        }

    def _calculate_confidence(self, features: Dict[str, Any]) -> float:
        """Calculate confidence score for a candidate."""
        if not features.get("valid", False):
            return 0.0

        score = 0.0
        weights_total = 0.0

        # Area score (prefer medium-sized areas)
        area = features["area"]
        ideal_min = 10000
        ideal_max = 100000

        if ideal_min <= area <= ideal_max:
            area_score = 1.0
        elif area < ideal_min:
            area_score = area / ideal_min
        else:
            area_score = ideal_max / area

        score += area_score * 0.25
        weights_total += 0.25

        # Edge proximity score (staging near edges is common)
        edge_proximity = features.get("edge_proximity", 0.0)
        score += edge_proximity * self.edge_proximity_weight
        weights_total += self.edge_proximity_weight

        # Rectangularity score
        rectangularity = features.get("rectangularity", 0.0)
        if rectangularity > 0.7:
            rect_score = 1.0
        elif rectangularity > 0.5:
            rect_score = rectangularity
        else:
            rect_score = rectangularity * 0.5

        score += rect_score * 0.2
        weights_total += 0.2

        # Color score (yellow/orange hue range)
        mean_hue = features.get("mean_hue", 0)
        if 10 <= mean_hue <= 40:  # Yellow-orange range
            color_score = 1.0
        elif 5 <= mean_hue <= 50:
            color_score = 0.6
        else:
            color_score = 0.2

        score += color_score * 0.25
        weights_total += 0.25

        # Normalize
        return score / weights_total if weights_total > 0 else 0.0


def detect_staging_from_boundaries(
    image: np.ndarray,
    boundaries: List[Dict[str, Any]],
) -> StagingDetectionResult:
    """
    Detect staging areas using pre-detected boundaries.

    Args:
        image: Input image
        boundaries: List of detected boundaries with polygon and color

    Returns:
        StagingDetectionResult
    """
    detector = StagingAreaDetector()
    height, width = image.shape[:2]
    total_area = width * height

    candidates = []

    for boundary in boundaries:
        polygon = boundary.get("polygon", [])
        color = boundary.get("color", "").lower()

        if not polygon:
            continue

        # Check if color suggests staging
        staging_colors = {"yellow", "orange"}
        if color not in staging_colors:
            continue

        pts = np.array(polygon, dtype=np.float32)
        area = cv2.contourArea(pts)

        if area < detector.min_area or area > detector.max_area:
            continue

        # Calculate features
        features = detector._calculate_features(
            polygon, area, width, height, image
        )
        confidence = detector._calculate_confidence(features)

        # Boost confidence for matching colors
        confidence = min(1.0, confidence * 1.2)

        if confidence >= detector.min_confidence:
            candidates.append(StagingAreaCandidate(
                polygon=polygon,
                confidence=confidence,
                area=area,
                features=features,
            ))

    candidates.sort(key=lambda c: c.confidence, reverse=True)

    total_staging = sum(c.area for c in candidates)
    coverage = total_staging / total_area if total_area > 0 else 0.0

    return StagingDetectionResult(
        candidates=candidates,
        total_staging_area=total_staging,
        coverage_ratio=coverage,
    )
