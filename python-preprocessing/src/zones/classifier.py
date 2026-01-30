"""
Zone type classification using visual and geometric features.

Task 6.2: Implement Zone Type Classifier
Task 6.4: Zone Type Confidence Scoring
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
import cv2

from .types import ZoneType, ZONE_PROPERTIES, ZoneProperties


@dataclass
class ClassificationResult:
    """Result of zone classification."""
    zone_type: ZoneType
    confidence: float
    alternative_types: List[Tuple[ZoneType, float]] = field(default_factory=list)
    features: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "zone_type": self.zone_type.value,
            "confidence": self.confidence,
            "alternative_types": [
                {"type": t.value, "confidence": c}
                for t, c in self.alternative_types
            ],
            "features": self.features,
        }


class ZoneClassifier:
    """
    Classifies zones based on visual and geometric features.

    Uses a combination of:
    - Area analysis
    - Aspect ratio
    - Color distribution
    - Shape analysis
    - Position context

    Example:
        >>> classifier = ZoneClassifier()
        >>> result = classifier.classify(image_region, polygon)
        >>> print(result.zone_type, result.confidence)
    """

    def __init__(
        self,
        min_confidence: float = 0.3,
        use_color: bool = True,
        use_geometry: bool = True,
    ):
        """
        Initialize classifier.

        Args:
            min_confidence: Minimum confidence to return a specific type
            use_color: Whether to use color-based classification
            use_geometry: Whether to use geometry-based classification
        """
        self.min_confidence = min_confidence
        self.use_color = use_color
        self.use_geometry = use_geometry

    def classify(
        self,
        image_region: Optional[np.ndarray],
        polygon: List[Tuple[int, int]],
        context: Optional[Dict[str, Any]] = None,
    ) -> ClassificationResult:
        """
        Classify a zone based on its features.

        Args:
            image_region: Cropped image region (BGR), may be None
            polygon: Zone polygon vertices
            context: Optional context (neighboring zones, etc.)

        Returns:
            ClassificationResult with type and confidence
        """
        features = {}
        scores: Dict[ZoneType, float] = {t: 0.0 for t in ZoneType}

        # Geometry-based features
        if self.use_geometry and polygon:
            geo_features = self._extract_geometry_features(polygon)
            features.update(geo_features)
            geo_scores = self._score_from_geometry(geo_features)
            for zone_type, score in geo_scores.items():
                scores[zone_type] += score * 0.5

        # Color-based features
        if self.use_color and image_region is not None and image_region.size > 0:
            color_features = self._extract_color_features(image_region)
            features.update(color_features)
            color_scores = self._score_from_color(color_features)
            for zone_type, score in color_scores.items():
                scores[zone_type] += score * 0.3

        # Context-based scoring
        if context:
            context_scores = self._score_from_context(context)
            for zone_type, score in context_scores.items():
                scores[zone_type] += score * 0.2

        # Find best match
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        best_type, best_score = sorted_scores[0]

        # Normalize confidence
        total_score = sum(s for _, s in sorted_scores[:3]) or 1.0
        confidence = best_score / total_score if best_score > 0 else 0.0

        # Apply minimum confidence threshold
        if confidence < self.min_confidence:
            best_type = ZoneType.UNKNOWN
            confidence = 1.0 - confidence

        # Get alternatives
        alternatives = [
            (t, s / total_score)
            for t, s in sorted_scores[1:4]
            if s > 0
        ]

        return ClassificationResult(
            zone_type=best_type,
            confidence=confidence,
            alternative_types=alternatives,
            features=features,
        )

    def _extract_geometry_features(
        self,
        polygon: List[Tuple[int, int]],
    ) -> Dict[str, Any]:
        """Extract geometric features from polygon."""
        if len(polygon) < 3:
            return {"valid": False}

        # Convert to numpy array
        pts = np.array(polygon, dtype=np.float32)

        # Calculate area
        area = cv2.contourArea(pts)

        # Calculate bounding box
        x, y, w, h = cv2.boundingRect(pts)
        bbox_area = w * h

        # Aspect ratio
        aspect_ratio = w / h if h > 0 else 1.0

        # Rectangularity (how rectangular is the shape)
        rectangularity = area / bbox_area if bbox_area > 0 else 0.0

        # Perimeter
        perimeter = cv2.arcLength(pts, closed=True)

        # Compactness (circularity)
        compactness = (4 * np.pi * area) / (perimeter ** 2) if perimeter > 0 else 0.0

        # Number of vertices
        n_vertices = len(polygon)

        # Simplified polygon vertex count
        epsilon = 0.02 * perimeter
        simplified = cv2.approxPolyDP(pts, epsilon, closed=True)
        n_simplified_vertices = len(simplified)

        return {
            "valid": True,
            "area": float(area),
            "width": int(w),
            "height": int(h),
            "aspect_ratio": float(aspect_ratio),
            "rectangularity": float(rectangularity),
            "compactness": float(compactness),
            "perimeter": float(perimeter),
            "n_vertices": n_vertices,
            "n_simplified_vertices": n_simplified_vertices,
        }

    def _extract_color_features(
        self,
        image_region: np.ndarray,
    ) -> Dict[str, Any]:
        """Extract color features from image region."""
        if image_region.size == 0:
            return {"color_valid": False}

        # Convert to HSV
        hsv = cv2.cvtColor(image_region, cv2.COLOR_BGR2HSV)

        # Mean and std of HSV
        mean_hsv = np.mean(hsv, axis=(0, 1))
        std_hsv = np.std(hsv, axis=(0, 1))

        # Dominant hue bucket
        hue = hsv[:, :, 0].flatten()
        hist, _ = np.histogram(hue, bins=12, range=(0, 180))
        dominant_hue_bucket = int(np.argmax(hist))

        # Color name mapping
        hue_names = [
            "red", "orange", "yellow", "yellow-green",
            "green", "cyan", "blue", "purple",
            "magenta", "pink", "red", "red"
        ]
        dominant_color = hue_names[dominant_hue_bucket]

        # Saturation level
        mean_sat = mean_hsv[1]
        if mean_sat < 30:
            saturation_level = "low"
        elif mean_sat < 100:
            saturation_level = "medium"
        else:
            saturation_level = "high"

        return {
            "color_valid": True,
            "mean_hue": float(mean_hsv[0]),
            "mean_saturation": float(mean_hsv[1]),
            "mean_value": float(mean_hsv[2]),
            "std_hue": float(std_hsv[0]),
            "dominant_color": dominant_color,
            "saturation_level": saturation_level,
        }

    def _score_from_geometry(
        self,
        features: Dict[str, Any],
    ) -> Dict[ZoneType, float]:
        """Score zone types based on geometry features."""
        scores = {t: 0.0 for t in ZoneType}

        if not features.get("valid", False):
            return scores

        area = features["area"]
        aspect_ratio = features["aspect_ratio"]
        rectangularity = features["rectangularity"]

        # Score based on area ranges
        for zone_type, props in ZONE_PROPERTIES.items():
            if props.typical_min_area <= area <= props.typical_max_area:
                # Area in expected range
                area_score = 1.0
            elif area < props.typical_min_area:
                # Too small
                ratio = area / props.typical_min_area
                area_score = max(0, ratio)
            else:
                # Too large
                ratio = props.typical_max_area / area
                area_score = max(0, ratio)

            scores[zone_type] += area_score * 0.5

        # Score based on shape expectations
        if aspect_ratio > 3.0 or aspect_ratio < 0.33:
            # Narrow corridor shape
            scores[ZoneType.TRAVEL_LANE] += 0.3
            scores[ZoneType.AISLE_PATH] += 0.3
            scores[ZoneType.CONVEYOR_AREA] += 0.2
        elif 0.8 < aspect_ratio < 1.2:
            # Square shape
            scores[ZoneType.PARKING_LOT] += 0.2
            scores[ZoneType.STAGING_AREA] += 0.1
            scores[ZoneType.OBSTACLE] += 0.2
        else:
            # Rectangular
            scores[ZoneType.RACKING] += 0.2
            scores[ZoneType.RACKING_AREA] += 0.2
            scores[ZoneType.ADMINISTRATIVE] += 0.1

        # High rectangularity
        if rectangularity > 0.85:
            scores[ZoneType.RACKING] += 0.2
            scores[ZoneType.PARKING_LOT] += 0.1

        return scores

    def _score_from_color(
        self,
        features: Dict[str, Any],
    ) -> Dict[ZoneType, float]:
        """Score zone types based on color features."""
        scores = {t: 0.0 for t in ZoneType}

        if not features.get("color_valid", False):
            return scores

        dominant_color = features.get("dominant_color", "")

        # Match colors to zone types
        color_map = {
            "orange": [ZoneType.RACKING, ZoneType.RACKING_AREA, ZoneType.STAGING_AREA],
            "yellow": [ZoneType.STAGING_AREA, ZoneType.BULK_STORAGE, ZoneType.RACKING_AREA],
            "blue": [ZoneType.TRAVEL_LANE, ZoneType.SHIPPING, ZoneType.AISLE_PATH],
            "green": [ZoneType.TRAVEL_LANE, ZoneType.RECEIVING, ZoneType.AISLE_PATH],
            "red": [ZoneType.RESTRICTED, ZoneType.OBSTACLE, ZoneType.RACKING],
            "purple": [ZoneType.CONVEYOR_AREA],
            "gray": [ZoneType.DOCKING_AREA, ZoneType.PARKING_LOT],
        }

        matching_types = color_map.get(dominant_color, [])
        for zone_type in matching_types:
            scores[zone_type] += 0.5

        # Low saturation often means administrative or infrastructure
        if features.get("saturation_level") == "low":
            scores[ZoneType.ADMINISTRATIVE] += 0.2
            scores[ZoneType.STORAGE_FLOOR] += 0.1

        return scores

    def _score_from_context(
        self,
        context: Dict[str, Any],
    ) -> Dict[ZoneType, float]:
        """Score zone types based on context."""
        scores = {t: 0.0 for t in ZoneType}

        # If near edge of image, might be staging/receiving
        if context.get("near_edge", False):
            scores[ZoneType.STAGING_AREA] += 0.2
            scores[ZoneType.RECEIVING] += 0.2
            scores[ZoneType.SHIPPING] += 0.2
            scores[ZoneType.DOCKING_AREA] += 0.3

        # If surrounded by racking
        if context.get("adjacent_to_racking", False):
            scores[ZoneType.AISLE_PATH] += 0.4
            scores[ZoneType.CROSS_AISLE] += 0.2

        # If inside a racking_area container
        if context.get("parent_type") == "racking_area":
            scores[ZoneType.AISLE_PATH] += 0.3
            scores[ZoneType.RACKING] += 0.3

        return scores
