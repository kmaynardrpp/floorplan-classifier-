"""
Zone validation rules and checks.

Task 6.5: Zone Validation Rules
"""

from dataclasses import dataclass, field
from typing import List, Tuple, Dict, Any, Optional
from enum import Enum
import numpy as np
import cv2

from .types import ZoneType, ZONE_PROPERTIES


class ValidationSeverity(Enum):
    """Severity levels for validation issues."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class ValidationIssue:
    """A validation issue found during zone validation."""
    code: str
    message: str
    severity: ValidationSeverity
    zone_id: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "zone_id": self.zone_id,
            "details": self.details,
        }


@dataclass
class ValidationResult:
    """Result of zone validation."""
    valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> List[ValidationIssue]:
        """Get only error-level issues."""
        return [i for i in self.issues if i.severity == ValidationSeverity.ERROR]

    @property
    def warnings(self) -> List[ValidationIssue]:
        """Get only warning-level issues."""
        return [i for i in self.issues if i.severity == ValidationSeverity.WARNING]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "valid": self.valid,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "issues": [i.to_dict() for i in self.issues],
        }


@dataclass
class ZoneData:
    """Zone data for validation."""
    id: str
    zone_type: ZoneType
    polygon: List[Tuple[int, int]]
    confidence: float = 0.9
    parent_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def area(self) -> float:
        """Calculate zone area."""
        if len(self.polygon) < 3:
            return 0.0
        pts = np.array(self.polygon, dtype=np.float32)
        return float(cv2.contourArea(pts))

    @property
    def bounds(self) -> Tuple[int, int, int, int]:
        """Get bounding box."""
        if not self.polygon:
            return (0, 0, 0, 0)
        xs = [p[0] for p in self.polygon]
        ys = [p[1] for p in self.polygon]
        return (min(xs), min(ys), max(xs), max(ys))


class ZoneValidator:
    """
    Validates zones against defined rules.

    Validation rules:
    - Area within expected range for zone type
    - Valid polygon (at least 3 vertices, non-zero area)
    - No overlapping zones of same type
    - Parent-child relationships valid
    - Confidence above threshold

    Example:
        >>> validator = ZoneValidator()
        >>> result = validator.validate([zone1, zone2])
        >>> if not result.valid:
        ...     for issue in result.errors:
        ...         print(issue.message)
    """

    def __init__(
        self,
        min_confidence: float = 0.3,
        max_overlap_ratio: float = 0.8,
        strict_area_check: bool = False,
    ):
        """
        Initialize validator.

        Args:
            min_confidence: Minimum acceptable confidence
            max_overlap_ratio: Maximum allowed overlap between zones
            strict_area_check: Fail if area outside expected range
        """
        self.min_confidence = min_confidence
        self.max_overlap_ratio = max_overlap_ratio
        self.strict_area_check = strict_area_check

    def validate(
        self,
        zones: List[ZoneData],
        image_bounds: Optional[Tuple[int, int]] = None,
    ) -> ValidationResult:
        """
        Validate a list of zones.

        Args:
            zones: List of zones to validate
            image_bounds: Optional (width, height) of source image

        Returns:
            ValidationResult with any issues found
        """
        issues = []

        # Individual zone validation
        for zone in zones:
            zone_issues = self._validate_zone(zone, image_bounds)
            issues.extend(zone_issues)

        # Cross-zone validation
        cross_issues = self._validate_cross_zone(zones)
        issues.extend(cross_issues)

        # Check parent-child relationships
        parent_issues = self._validate_hierarchy(zones)
        issues.extend(parent_issues)

        # Determine overall validity
        has_errors = any(i.severity == ValidationSeverity.ERROR for i in issues)
        valid = not has_errors

        return ValidationResult(valid=valid, issues=issues)

    def _validate_zone(
        self,
        zone: ZoneData,
        image_bounds: Optional[Tuple[int, int]],
    ) -> List[ValidationIssue]:
        """Validate a single zone."""
        issues = []

        # Check polygon validity
        if len(zone.polygon) < 3:
            issues.append(ValidationIssue(
                code="INVALID_POLYGON",
                message=f"Zone {zone.id} has fewer than 3 vertices",
                severity=ValidationSeverity.ERROR,
                zone_id=zone.id,
                details={"vertex_count": len(zone.polygon)},
            ))
            return issues  # Can't validate further

        # Check area
        area = zone.area
        if area <= 0:
            issues.append(ValidationIssue(
                code="ZERO_AREA",
                message=f"Zone {zone.id} has zero or negative area",
                severity=ValidationSeverity.ERROR,
                zone_id=zone.id,
            ))
            return issues

        # Check area against expected range
        props = ZONE_PROPERTIES.get(zone.zone_type)
        if props:
            if area < props.typical_min_area:
                severity = ValidationSeverity.ERROR if self.strict_area_check else ValidationSeverity.WARNING
                issues.append(ValidationIssue(
                    code="AREA_TOO_SMALL",
                    message=f"Zone {zone.id} area ({area:.0f}) below minimum ({props.typical_min_area})",
                    severity=severity,
                    zone_id=zone.id,
                    details={
                        "area": area,
                        "min_expected": props.typical_min_area,
                    },
                ))
            elif area > props.typical_max_area:
                severity = ValidationSeverity.ERROR if self.strict_area_check else ValidationSeverity.WARNING
                issues.append(ValidationIssue(
                    code="AREA_TOO_LARGE",
                    message=f"Zone {zone.id} area ({area:.0f}) exceeds maximum ({props.typical_max_area})",
                    severity=severity,
                    zone_id=zone.id,
                    details={
                        "area": area,
                        "max_expected": props.typical_max_area,
                    },
                ))

        # Check confidence
        if zone.confidence < self.min_confidence:
            issues.append(ValidationIssue(
                code="LOW_CONFIDENCE",
                message=f"Zone {zone.id} confidence ({zone.confidence:.2f}) below threshold",
                severity=ValidationSeverity.WARNING,
                zone_id=zone.id,
                details={"confidence": zone.confidence, "threshold": self.min_confidence},
            ))

        # Check bounds within image
        if image_bounds:
            img_width, img_height = image_bounds
            x1, y1, x2, y2 = zone.bounds

            if x1 < 0 or y1 < 0 or x2 > img_width or y2 > img_height:
                issues.append(ValidationIssue(
                    code="OUT_OF_BOUNDS",
                    message=f"Zone {zone.id} extends outside image bounds",
                    severity=ValidationSeverity.WARNING,
                    zone_id=zone.id,
                    details={
                        "zone_bounds": (x1, y1, x2, y2),
                        "image_size": (img_width, img_height),
                    },
                ))

        return issues

    def _validate_cross_zone(
        self,
        zones: List[ZoneData],
    ) -> List[ValidationIssue]:
        """Validate relationships between zones."""
        issues = []

        # Check for excessive overlap between zones of same type
        for i, zone1 in enumerate(zones):
            for zone2 in zones[i + 1:]:
                # Skip if different types (some overlap is OK)
                if zone1.zone_type != zone2.zone_type:
                    continue

                # Skip if parent-child relationship
                if zone1.parent_id == zone2.id or zone2.parent_id == zone1.id:
                    continue

                # Calculate overlap
                overlap_ratio = self._calculate_overlap_ratio(zone1, zone2)

                if overlap_ratio > self.max_overlap_ratio:
                    issues.append(ValidationIssue(
                        code="EXCESSIVE_OVERLAP",
                        message=f"Zones {zone1.id} and {zone2.id} overlap by {overlap_ratio:.0%}",
                        severity=ValidationSeverity.WARNING,
                        details={
                            "zone1_id": zone1.id,
                            "zone2_id": zone2.id,
                            "overlap_ratio": overlap_ratio,
                        },
                    ))

        return issues

    def _validate_hierarchy(
        self,
        zones: List[ZoneData],
    ) -> List[ValidationIssue]:
        """Validate parent-child zone relationships."""
        issues = []
        zone_map = {z.id: z for z in zones}

        for zone in zones:
            if zone.parent_id is None:
                continue

            parent = zone_map.get(zone.parent_id)
            if parent is None:
                issues.append(ValidationIssue(
                    code="MISSING_PARENT",
                    message=f"Zone {zone.id} references non-existent parent {zone.parent_id}",
                    severity=ValidationSeverity.ERROR,
                    zone_id=zone.id,
                    details={"parent_id": zone.parent_id},
                ))
                continue

            # Check child is contained within parent
            if not self._is_contained(zone, parent):
                issues.append(ValidationIssue(
                    code="CHILD_OUTSIDE_PARENT",
                    message=f"Zone {zone.id} extends outside parent {parent.id}",
                    severity=ValidationSeverity.WARNING,
                    zone_id=zone.id,
                    details={
                        "parent_id": parent.id,
                        "child_bounds": zone.bounds,
                        "parent_bounds": parent.bounds,
                    },
                ))

        return issues

    def _calculate_overlap_ratio(
        self,
        zone1: ZoneData,
        zone2: ZoneData,
    ) -> float:
        """Calculate overlap ratio between two zones."""
        # Simple bounding box overlap for efficiency
        x1_1, y1_1, x2_1, y2_1 = zone1.bounds
        x1_2, y1_2, x2_2, y2_2 = zone2.bounds

        # Intersection
        inter_x1 = max(x1_1, x1_2)
        inter_y1 = max(y1_1, y1_2)
        inter_x2 = min(x2_1, x2_2)
        inter_y2 = min(y2_1, y2_2)

        if inter_x1 >= inter_x2 or inter_y1 >= inter_y2:
            return 0.0

        intersection = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
        smaller_area = min(zone1.area, zone2.area)

        return intersection / smaller_area if smaller_area > 0 else 0.0

    def _is_contained(
        self,
        child: ZoneData,
        parent: ZoneData,
    ) -> bool:
        """Check if child zone is contained within parent."""
        cx1, cy1, cx2, cy2 = child.bounds
        px1, py1, px2, py2 = parent.bounds

        # Allow small margin for numerical errors
        margin = 5
        return (
            cx1 >= px1 - margin and
            cy1 >= py1 - margin and
            cx2 <= px2 + margin and
            cy2 <= py2 + margin
        )


def validate_zones_quick(
    zones: List[Dict[str, Any]],
) -> ValidationResult:
    """
    Quick validation of zone dictionaries.

    Args:
        zones: List of zone dictionaries with polygon, type, etc.

    Returns:
        ValidationResult
    """
    zone_data = []
    for i, z in enumerate(zones):
        polygon = z.get("polygon", [])
        if isinstance(polygon, list) and len(polygon) > 0:
            if isinstance(polygon[0], dict):
                polygon = [(p["x"], p["y"]) for p in polygon]

        zone_data.append(ZoneData(
            id=z.get("id", f"zone_{i}"),
            zone_type=ZoneType.from_string(z.get("zone_type", z.get("type", "unknown"))),
            polygon=polygon,
            confidence=z.get("confidence", 0.9),
            parent_id=z.get("parent_id"),
        ))

    validator = ZoneValidator()
    return validator.validate(zone_data)
