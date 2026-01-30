"""Tests for zone validation."""

import pytest

from src.zones.types import ZoneType
from src.zones.validation import (
    ValidationSeverity,
    ValidationIssue,
    ValidationResult,
    ZoneData,
    ZoneValidator,
    validate_zones_quick,
)


class TestValidationIssue:
    """Tests for ValidationIssue dataclass."""

    def test_create_issue(self):
        """Test creating a validation issue."""
        issue = ValidationIssue(
            code="TEST_ERROR",
            message="Test error message",
            severity=ValidationSeverity.ERROR,
        )
        assert issue.code == "TEST_ERROR"
        assert issue.severity == ValidationSeverity.ERROR

    def test_issue_with_zone_id(self):
        """Test issue with zone ID."""
        issue = ValidationIssue(
            code="ZONE_ERROR",
            message="Zone error",
            severity=ValidationSeverity.WARNING,
            zone_id="zone_1",
        )
        assert issue.zone_id == "zone_1"

    def test_issue_to_dict(self):
        """Test serialization."""
        issue = ValidationIssue(
            code="AREA_TOO_SMALL",
            message="Area too small",
            severity=ValidationSeverity.WARNING,
            zone_id="z1",
            details={"area": 500, "min": 1000},
        )
        d = issue.to_dict()
        assert d["code"] == "AREA_TOO_SMALL"
        assert d["severity"] == "warning"
        assert d["zone_id"] == "z1"


class TestValidationResult:
    """Tests for ValidationResult dataclass."""

    def test_valid_result(self):
        """Test valid result with no issues."""
        result = ValidationResult(valid=True, issues=[])
        assert result.valid is True
        assert len(result.errors) == 0
        assert len(result.warnings) == 0

    def test_result_with_errors(self):
        """Test result with errors."""
        issues = [
            ValidationIssue("ERR1", "Error 1", ValidationSeverity.ERROR),
            ValidationIssue("ERR2", "Error 2", ValidationSeverity.ERROR),
        ]
        result = ValidationResult(valid=False, issues=issues)
        assert result.valid is False
        assert len(result.errors) == 2
        assert len(result.warnings) == 0

    def test_result_with_warnings(self):
        """Test result with warnings."""
        issues = [
            ValidationIssue("WARN1", "Warning 1", ValidationSeverity.WARNING),
            ValidationIssue("INFO1", "Info 1", ValidationSeverity.INFO),
        ]
        result = ValidationResult(valid=True, issues=issues)
        assert result.valid is True
        assert len(result.warnings) == 1
        assert len(result.errors) == 0

    def test_result_to_dict(self):
        """Test serialization."""
        result = ValidationResult(
            valid=True,
            issues=[
                ValidationIssue("W1", "Warning", ValidationSeverity.WARNING),
            ],
        )
        d = result.to_dict()
        assert d["valid"] is True
        assert d["error_count"] == 0
        assert d["warning_count"] == 1


class TestZoneData:
    """Tests for ZoneData dataclass."""

    def test_create_zone_data(self):
        """Test creating zone data."""
        zone = ZoneData(
            id="zone_1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
        )
        assert zone.id == "zone_1"
        assert zone.zone_type == ZoneType.RACKING

    def test_zone_area(self):
        """Test area calculation."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
        )
        assert 9900 < zone.area < 10100  # ~10000

    def test_zone_bounds(self):
        """Test bounds calculation."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.TRAVEL_LANE,
            polygon=[(10, 20), (110, 20), (110, 120), (10, 120)],
        )
        assert zone.bounds == (10, 20, 110, 120)

    def test_zone_empty_polygon(self):
        """Test with empty polygon."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.UNKNOWN,
            polygon=[],
        )
        assert zone.area == 0
        assert zone.bounds == (0, 0, 0, 0)


class TestZoneValidatorInit:
    """Tests for ZoneValidator initialization."""

    def test_default_init(self):
        """Test default initialization."""
        validator = ZoneValidator()
        assert validator.min_confidence == 0.3
        assert validator.max_overlap_ratio == 0.8

    def test_custom_init(self):
        """Test custom initialization."""
        validator = ZoneValidator(
            min_confidence=0.5,
            max_overlap_ratio=0.5,
            strict_area_check=True,
        )
        assert validator.min_confidence == 0.5
        assert validator.strict_area_check is True


class TestZoneValidatorValidate:
    """Tests for validate method."""

    @pytest.fixture
    def validator(self):
        """Create validator instance."""
        return ZoneValidator()

    @pytest.fixture
    def valid_zone(self):
        """Create valid zone data."""
        return ZoneData(
            id="zone_1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (200, 0), (200, 100), (0, 100)],
            confidence=0.9,
        )

    def test_validate_valid_zones(self, validator, valid_zone):
        """Test validation of valid zones."""
        result = validator.validate([valid_zone])
        assert result.valid is True
        assert len(result.errors) == 0

    def test_validate_empty_list(self, validator):
        """Test validation of empty list."""
        result = validator.validate([])
        assert result.valid is True

    def test_invalid_polygon_few_vertices(self, validator):
        """Test zone with too few vertices."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (100, 100)],  # Only 2 points
        )
        result = validator.validate([zone])
        assert result.valid is False
        assert any(i.code == "INVALID_POLYGON" for i in result.errors)

    def test_zero_area_polygon(self, validator):
        """Test zone with zero area."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (100, 0), (0, 0)],  # Degenerate
        )
        result = validator.validate([zone])
        assert result.valid is False

    def test_low_confidence_warning(self, validator):
        """Test low confidence generates warning."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.RACKING,
            polygon=[(0, 0), (200, 0), (200, 100), (0, 100)],
            confidence=0.1,  # Below threshold
        )
        result = validator.validate([zone])
        assert any(i.code == "LOW_CONFIDENCE" for i in result.warnings)

    def test_out_of_bounds_warning(self, validator):
        """Test zone extending outside image bounds."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.RACKING,
            polygon=[(-10, 0), (200, 0), (200, 100), (-10, 100)],
        )
        result = validator.validate([zone], image_bounds=(500, 400))
        assert any(i.code == "OUT_OF_BOUNDS" for i in result.warnings)

    def test_missing_parent_error(self, validator):
        """Test zone referencing non-existent parent."""
        zone = ZoneData(
            id="z1",
            zone_type=ZoneType.AISLE_PATH,
            polygon=[(0, 0), (100, 0), (100, 50), (0, 50)],
            parent_id="non_existent",
        )
        result = validator.validate([zone])
        assert result.valid is False
        assert any(i.code == "MISSING_PARENT" for i in result.errors)

    def test_valid_parent_child(self, validator):
        """Test valid parent-child relationship."""
        parent = ZoneData(
            id="parent",
            zone_type=ZoneType.RACKING_AREA,
            polygon=[(0, 0), (200, 0), (200, 200), (0, 200)],
        )
        child = ZoneData(
            id="child",
            zone_type=ZoneType.AISLE_PATH,
            polygon=[(50, 50), (150, 50), (150, 100), (50, 100)],
            parent_id="parent",
        )
        result = validator.validate([parent, child])
        assert not any(i.code == "MISSING_PARENT" for i in result.issues)


class TestValidateZonesQuick:
    """Tests for validate_zones_quick function."""

    def test_quick_validate_dicts(self):
        """Test quick validation with zone dictionaries."""
        zones = [
            {
                "id": "z1",
                "zone_type": "racking",
                "polygon": [{"x": 0, "y": 0}, {"x": 100, "y": 0}, {"x": 100, "y": 100}, {"x": 0, "y": 100}],
                "confidence": 0.9,
            },
        ]
        result = validate_zones_quick(zones)
        assert isinstance(result, ValidationResult)

    def test_quick_validate_tuple_polygons(self):
        """Test quick validation with tuple polygons."""
        zones = [
            {
                "id": "z1",
                "type": "travel_lane",
                "polygon": [(0, 0), (100, 0), (100, 50), (0, 50)],
            },
        ]
        result = validate_zones_quick(zones)
        assert isinstance(result, ValidationResult)

    def test_quick_validate_empty(self):
        """Test quick validation with empty list."""
        result = validate_zones_quick([])
        assert result.valid is True
