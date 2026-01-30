"""Tests for orientation models."""

import pytest

from src.orientation.models import (
    Orientation,
    OrientationHint,
    OrientationResult,
)


class TestOrientation:
    """Tests for Orientation enum."""

    def test_orientation_values(self):
        """Test orientation enum values."""
        assert Orientation.NORTH.value == 0
        assert Orientation.EAST.value == 90
        assert Orientation.SOUTH.value == 180
        assert Orientation.WEST.value == 270

    def test_orientation_degrees(self):
        """Test degrees property."""
        assert Orientation.NORTH.degrees == 0
        assert Orientation.EAST.degrees == 90
        assert Orientation.SOUTH.degrees == 180
        assert Orientation.WEST.degrees == 270

    def test_correction_degrees(self):
        """Test correction_degrees property."""
        # NORTH needs no correction
        assert Orientation.NORTH.correction_degrees == 0
        # EAST needs 270° correction (rotate counterclockwise)
        assert Orientation.EAST.correction_degrees == 270
        # SOUTH needs 180° correction
        assert Orientation.SOUTH.correction_degrees == 180
        # WEST needs 90° correction
        assert Orientation.WEST.correction_degrees == 90


class TestOrientationHint:
    """Tests for OrientationHint dataclass."""

    def test_create_hint(self):
        """Test creating an orientation hint."""
        hint = OrientationHint(
            source="text_detection",
            orientation=Orientation.NORTH,
            confidence=0.9,
        )
        assert hint.source == "text_detection"
        assert hint.orientation == Orientation.NORTH
        assert hint.confidence == 0.9

    def test_hint_with_details(self):
        """Test hint with additional details."""
        hint = OrientationHint(
            source="line_detection",
            orientation=Orientation.EAST,
            confidence=0.7,
            details={"line_count": 50, "angle_variance": 5.2},
        )
        assert hint.details["line_count"] == 50
        assert hint.details["angle_variance"] == 5.2

    def test_hint_to_dict(self):
        """Test serialization to dict."""
        hint = OrientationHint(
            source="aspect_ratio",
            orientation=Orientation.SOUTH,
            confidence=0.5,
        )
        d = hint.to_dict()
        assert d["source"] == "aspect_ratio"
        assert d["orientation"] == "SOUTH"
        assert d["degrees"] == 180
        assert d["confidence"] == 0.5

    def test_invalid_confidence_low(self):
        """Test that confidence < 0 raises error."""
        with pytest.raises(ValueError, match="confidence"):
            OrientationHint(
                source="test",
                orientation=Orientation.NORTH,
                confidence=-0.1,
            )

    def test_invalid_confidence_high(self):
        """Test that confidence > 1 raises error."""
        with pytest.raises(ValueError, match="confidence"):
            OrientationHint(
                source="test",
                orientation=Orientation.NORTH,
                confidence=1.1,
            )


class TestOrientationResult:
    """Tests for OrientationResult dataclass."""

    def test_create_result(self):
        """Test creating an orientation result."""
        result = OrientationResult(
            detected_orientation=Orientation.NORTH,
            confidence=0.95,
        )
        assert result.detected_orientation == Orientation.NORTH
        assert result.confidence == 0.95

    def test_result_with_hints(self):
        """Test result with hints."""
        hints = [
            OrientationHint("source1", Orientation.NORTH, 0.8),
            OrientationHint("source2", Orientation.NORTH, 0.9),
        ]
        result = OrientationResult(
            detected_orientation=Orientation.NORTH,
            confidence=0.85,
            hints=hints,
        )
        assert len(result.hints) == 2

    def test_needs_correction_false(self):
        """Test needs_correction is False for NORTH."""
        result = OrientationResult(
            detected_orientation=Orientation.NORTH,
            confidence=0.9,
        )
        assert result.needs_correction is False

    def test_needs_correction_true(self):
        """Test needs_correction is True for other orientations."""
        for orientation in [Orientation.EAST, Orientation.SOUTH, Orientation.WEST]:
            result = OrientationResult(
                detected_orientation=orientation,
                confidence=0.9,
            )
            assert result.needs_correction is True

    def test_correction_degrees(self):
        """Test correction_degrees property."""
        result = OrientationResult(
            detected_orientation=Orientation.EAST,
            confidence=0.9,
        )
        assert result.correction_degrees == 270

    def test_result_to_dict(self):
        """Test serialization to dict."""
        result = OrientationResult(
            detected_orientation=Orientation.WEST,
            confidence=0.75,
        )
        d = result.to_dict()
        assert d["detected_orientation"] == "WEST"
        assert d["degrees"] == 270
        assert d["confidence"] == 0.75
        assert d["needs_correction"] is True
        assert d["correction_degrees"] == 90

    def test_no_correction_needed_factory(self):
        """Test no_correction_needed factory method."""
        result = OrientationResult.no_correction_needed()
        assert result.detected_orientation == Orientation.NORTH
        assert result.confidence == 1.0
        assert result.needs_correction is False
        assert len(result.hints) == 1

    def test_invalid_confidence(self):
        """Test invalid confidence raises error."""
        with pytest.raises(ValueError, match="confidence"):
            OrientationResult(
                detected_orientation=Orientation.NORTH,
                confidence=1.5,
            )
