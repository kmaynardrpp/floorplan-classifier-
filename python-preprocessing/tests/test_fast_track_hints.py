"""
Tests for fast-track hint generation.

Task 2.3: Implement Fast-Track Hint Generation
"""

import pytest
import json
import numpy as np

from src.color_boundary.fast_track import (
    create_fast_track_hints,
    merge_color_boundaries_into_hints,
)
from src.color_boundary.models import ColorBoundaryResult, DetectedBoundary


def create_test_boundary(
    color: str = "orange",
    area: int = 5000,
    polygon: list = None,
    confidence: float = 0.9,
) -> DetectedBoundary:
    """Create a boundary for testing."""
    if polygon is None:
        polygon = [(100, 100), (200, 100), (200, 200), (100, 200)]
    contour = np.array(polygon, dtype=np.int32)
    return DetectedBoundary(
        contour=contour,
        color=color,
        area=area,
        polygon=polygon,
        confidence=confidence,
    )


class TestCreateFastTrackHints:
    """Tests for create_fast_track_hints function."""

    def test_hints_have_fast_track_true(self):
        """Test that generated hints have fast_track: true."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["fast_track"] is True

    def test_hints_have_fast_track_reason(self):
        """Test that generated hints include reason for fast-track."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert "fast_track_reason" in hints
        assert len(hints["fast_track_reason"]) > 0

    def test_boundary_confidence_set_to_095(self):
        """Test that boundary confidence is set to 0.95."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary(confidence=0.5)],  # Lower original confidence
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["detected_colored_boundaries"][0]["confidence"] == 0.95

    def test_hints_serializable_to_json(self):
        """Test that generated hints can be serialized to JSON."""
        result = ColorBoundaryResult(
            boundaries=[
                create_test_boundary(color="orange"),
                create_test_boundary(color="yellow"),
            ],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        # Should not raise exception
        json_str = json.dumps(hints)
        assert len(json_str) > 0

        # Should be deserializable
        parsed = json.loads(json_str)
        assert parsed["fast_track"] is True

    def test_hints_include_all_boundaries(self):
        """Test that hints include all detected boundaries."""
        result = ColorBoundaryResult(
            boundaries=[
                create_test_boundary(color="orange", area=5000),
                create_test_boundary(color="yellow", area=3000),
                create_test_boundary(color="blue", area=2000),
            ],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert len(hints["detected_colored_boundaries"]) == 3
        colors = [b["color"] for b in hints["detected_colored_boundaries"]]
        assert "orange" in colors
        assert "yellow" in colors
        assert "blue" in colors

    def test_hints_include_coverage_ratio(self):
        """Test that hints include coverage ratio."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.87,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["boundary_coverage_ratio"] == 0.87

    def test_hints_include_has_predefined_zones(self):
        """Test that hints include has_predefined_zones flag."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["has_predefined_zones"] is True

    def test_hints_include_skip_edge_detection(self):
        """Test that hints indicate edge detection should be skipped."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["skip_edge_detection"] is True

    def test_boundary_polygon_preserved(self):
        """Test that boundary polygon coordinates are preserved."""
        polygon = [(50, 60), (150, 60), (150, 160), (50, 160)]
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary(polygon=polygon)],
            combined_mask=np.zeros((200, 200), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(200, 200),
        )

        hints = create_fast_track_hints(result)

        assert hints["detected_colored_boundaries"][0]["polygon"] == polygon

    def test_boundary_area_preserved(self):
        """Test that boundary area is preserved."""
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary(area=7500)],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )

        hints = create_fast_track_hints(result)

        assert hints["detected_colored_boundaries"][0]["area"] == 7500


class TestMergeColorBoundariesIntoHints:
    """Tests for merge_color_boundaries_into_hints function."""

    def test_merge_adds_boundaries_section(self):
        """Test that merging adds detected_colored_boundaries section."""
        existing_hints = {"some_key": "some_value", "edges": []}
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert "detected_colored_boundaries" in merged
        assert len(merged["detected_colored_boundaries"]) == 1

    def test_merge_preserves_existing_hints(self):
        """Test that merging preserves existing hint data."""
        existing_hints = {
            "edges": [{"x": 1, "y": 2}],
            "regions": [{"id": 1}],
        }
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert merged["edges"] == [{"x": 1, "y": 2}]
        assert merged["regions"] == [{"id": 1}]

    def test_merge_does_not_modify_original(self):
        """Test that merging does not modify the original hints dict."""
        existing_hints = {"key": "value"}
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert "detected_colored_boundaries" not in existing_hints
        assert "detected_colored_boundaries" in merged

    def test_merge_includes_coverage_ratio(self):
        """Test that merged hints include coverage ratio."""
        existing_hints = {}
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.35,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert merged["boundary_coverage_ratio"] == 0.35

    def test_merge_includes_has_predefined_zones(self):
        """Test that merged hints include has_predefined_zones."""
        existing_hints = {}
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary()],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert merged["has_predefined_zones"] is True

    def test_merge_empty_boundaries_sets_predefined_false(self):
        """Test that empty boundaries sets has_predefined_zones to False."""
        existing_hints = {}
        result = ColorBoundaryResult(
            boundaries=[],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.0,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        assert merged["has_predefined_zones"] is False

    def test_merge_preserves_original_confidence(self):
        """Test that merge preserves original boundary confidence."""
        existing_hints = {}
        result = ColorBoundaryResult(
            boundaries=[create_test_boundary(confidence=0.75)],
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,
            image_shape=(100, 100),
        )

        merged = merge_color_boundaries_into_hints(existing_hints, result)

        # Merge should preserve original confidence, unlike fast-track hints
        assert merged["detected_colored_boundaries"][0]["confidence"] == 0.75
