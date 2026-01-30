"""
Tests for color boundary data models.

Task 1.1: ColorBoundaryResult Data Structure
"""

import pytest
import numpy as np
import json

from src.color_boundary.models import DetectedBoundary, ColorBoundaryResult


class TestDetectedBoundary:
    """Tests for DetectedBoundary dataclass."""

    def test_create_boundary_with_all_fields(self):
        """Test creating a DetectedBoundary with all required fields."""
        contour = np.array([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]], dtype=np.int32)
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=10000,
            polygon=polygon,
            confidence=0.95,
        )

        assert boundary.color == "orange"
        assert boundary.area == 10000
        assert len(boundary.polygon) == 4
        assert boundary.confidence == 0.95

    def test_boundary_to_dict_serialization(self):
        """Test that to_dict produces JSON-serializable output."""
        contour = np.array([[[10, 20]], [[110, 20]], [[110, 120]], [[10, 120]]], dtype=np.int32)
        polygon = [(10, 20), (110, 20), (110, 120), (10, 120)]

        boundary = DetectedBoundary(
            contour=contour,
            color="yellow",
            area=10000,
            polygon=polygon,
            confidence=0.92,
        )

        result = boundary.to_dict()

        # Verify structure
        assert "color" in result
        assert "area" in result
        assert "polygon" in result
        assert "confidence" in result
        assert "vertex_count" in result

        # Verify values
        assert result["color"] == "yellow"
        assert result["area"] == 10000
        assert result["vertex_count"] == 4
        assert result["confidence"] == 0.92

        # Verify JSON serializable
        json_str = json.dumps(result)
        assert json_str is not None

    def test_boundary_is_closed_with_valid_polygon(self):
        """Test is_closed returns True for valid closed polygon."""
        contour = np.array([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]], dtype=np.int32)
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=10000,
            polygon=polygon,
        )

        assert boundary.is_closed() is True

    def test_boundary_is_closed_with_line(self):
        """Test is_closed returns False for a line (2 vertices)."""
        contour = np.array([[[0, 0]], [[100, 0]]], dtype=np.int32)
        polygon = [(0, 0), (100, 0)]

        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=0,  # Line has no area
            polygon=polygon,
        )

        assert boundary.is_closed() is False

    def test_boundary_is_closed_with_zero_area(self):
        """Test is_closed returns False when area is 0."""
        contour = np.array([[[0, 0]], [[100, 0]], [[100, 100]]], dtype=np.int32)
        polygon = [(0, 0), (100, 0), (100, 100)]

        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=0,
            polygon=polygon,
        )

        assert boundary.is_closed() is False


class TestColorBoundaryResult:
    """Tests for ColorBoundaryResult dataclass."""

    def create_sample_boundary(self, color: str = "orange", area: int = 10000) -> DetectedBoundary:
        """Helper to create a sample boundary."""
        contour = np.array([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]], dtype=np.int32)
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
        return DetectedBoundary(
            contour=contour,
            color=color,
            area=area,
            polygon=polygon,
            confidence=0.95,
        )

    def test_create_result_with_multiple_boundaries(self):
        """Test creating ColorBoundaryResult with multiple boundaries."""
        boundaries = [
            self.create_sample_boundary("orange", 10000),
            self.create_sample_boundary("yellow", 5000),
            self.create_sample_boundary("blue", 3000),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        assert len(result.boundaries) == 3
        assert result.coverage_ratio == 0.5

    def test_result_to_dict_serialization(self):
        """Test that to_dict produces complete JSON-serializable output."""
        boundaries = [
            self.create_sample_boundary("orange", 10000),
            self.create_sample_boundary("yellow", 5000),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((200, 300), dtype=np.uint8),
            coverage_ratio=0.45,
            image_shape=(200, 300),
        )

        output = result.to_dict()

        # Verify structure
        assert "boundaries" in output
        assert "coverage_ratio" in output
        assert "boundary_count" in output
        assert "image_shape" in output
        assert "colors_detected" in output
        assert "total_boundary_area" in output

        # Verify values
        assert output["boundary_count"] == 2
        assert output["coverage_ratio"] == 0.45
        assert output["image_shape"]["height"] == 200
        assert output["image_shape"]["width"] == 300
        assert set(output["colors_detected"]) == {"orange", "yellow"}
        assert output["total_boundary_area"] == 15000

        # Verify JSON serializable
        json_str = json.dumps(output)
        assert json_str is not None

    def test_result_to_hints_format(self):
        """Test to_hints returns correct structure with detected_colored_boundaries key."""
        boundaries = [
            self.create_sample_boundary("orange", 10000),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        hints = result.to_hints()

        # Verify required keys
        assert "detected_colored_boundaries" in hints
        assert "boundary_coverage_ratio" in hints
        assert "has_predefined_zones" in hints

        # Verify structure of detected_colored_boundaries
        assert len(hints["detected_colored_boundaries"]) == 1
        boundary_hint = hints["detected_colored_boundaries"][0]
        assert "polygon" in boundary_hint
        assert "color" in boundary_hint
        assert "area_px" in boundary_hint
        assert "confidence" in boundary_hint

    def test_result_to_hints_has_predefined_zones_threshold(self):
        """Test has_predefined_zones is True when coverage > 0.1."""
        boundaries = [self.create_sample_boundary("orange", 10000)]

        # High coverage
        result_high = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )
        assert result_high.to_hints()["has_predefined_zones"] is True

        # Low coverage
        result_low = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.05,
            image_shape=(100, 100),
        )
        assert result_low.to_hints()["has_predefined_zones"] is False

    def test_empty_result(self):
        """Test creating empty result with no boundaries."""
        result = ColorBoundaryResult.empty(image_shape=(100, 200))

        assert len(result.boundaries) == 0
        assert result.coverage_ratio == 0.0
        assert result.image_shape == (100, 200)
        assert result.combined_mask.shape == (100, 200)

    def test_get_boundaries_by_color(self):
        """Test filtering boundaries by color."""
        boundaries = [
            self.create_sample_boundary("orange", 10000),
            self.create_sample_boundary("yellow", 5000),
            self.create_sample_boundary("orange", 3000),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        orange_boundaries = result.get_boundaries_by_color("orange")
        assert len(orange_boundaries) == 2

        yellow_boundaries = result.get_boundaries_by_color("yellow")
        assert len(yellow_boundaries) == 1

        blue_boundaries = result.get_boundaries_by_color("blue")
        assert len(blue_boundaries) == 0

    def test_get_closed_boundaries(self):
        """Test filtering for closed boundaries only."""
        contour_closed = np.array([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]], dtype=np.int32)
        contour_line = np.array([[[0, 0]], [[100, 0]]], dtype=np.int32)

        boundaries = [
            DetectedBoundary(
                contour=contour_closed,
                color="orange",
                area=10000,
                polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
            ),
            DetectedBoundary(
                contour=contour_line,
                color="yellow",
                area=0,  # Line
                polygon=[(0, 0), (100, 0)],
            ),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        closed = result.get_closed_boundaries()
        assert len(closed) == 1
        assert closed[0].color == "orange"

    def test_has_sufficient_closed_boundaries(self):
        """Test checking for minimum closed boundary count."""
        boundaries = [
            self.create_sample_boundary("orange", 10000),
            self.create_sample_boundary("yellow", 5000),
            self.create_sample_boundary("blue", 3000),
        ]

        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        assert result.has_sufficient_closed_boundaries(minimum=3) is True
        assert result.has_sufficient_closed_boundaries(minimum=4) is False
        assert result.has_sufficient_closed_boundaries(minimum=2) is True
