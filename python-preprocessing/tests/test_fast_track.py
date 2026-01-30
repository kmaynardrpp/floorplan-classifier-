"""
Tests for fast-track decision logic.

Task 2.2: Implement Fast-Track Decision Logic
"""

import pytest
import numpy as np

from src.color_boundary.fast_track import (
    is_boundary_closed,
    all_boundaries_closed,
    should_fast_track,
)
from src.color_boundary.models import ColorBoundaryResult, DetectedBoundary
from src.config.phase0_config import Phase0Config


def create_closed_boundary(
    color: str = "orange",
    area: int = 5000,
    polygon: list = None,
) -> DetectedBoundary:
    """Create a closed boundary for testing."""
    if polygon is None:
        # Default square polygon
        polygon = [(100, 100), (200, 100), (200, 200), (100, 200)]
    contour = np.array(polygon, dtype=np.int32)
    return DetectedBoundary(
        contour=contour,
        color=color,
        area=area,
        polygon=polygon,
        confidence=0.95,
    )


def create_non_closed_boundary(
    color: str = "orange",
    area: int = 0,
) -> DetectedBoundary:
    """Create a non-closed boundary (collinear points) for testing."""
    # Collinear points - these form a line, not a closed region
    polygon = [(100, 100), (150, 100), (200, 100)]  # All on same line
    contour = np.array(polygon, dtype=np.int32)
    return DetectedBoundary(
        contour=contour,
        color=color,
        area=area,  # Zero area for a line
        polygon=polygon,
        confidence=0.5,
    )


def create_degenerate_boundary(color: str = "orange") -> DetectedBoundary:
    """Create a degenerate boundary (too few points) for testing."""
    polygon = [(100, 100), (200, 100)]  # Only 2 points
    contour = np.array(polygon, dtype=np.int32)
    return DetectedBoundary(
        contour=contour,
        color=color,
        area=0,
        polygon=polygon,
        confidence=0.5,
    )


class TestIsBoundaryClosed:
    """Tests for is_boundary_closed function."""

    def test_square_polygon_is_closed(self):
        """Test that a square polygon is considered closed."""
        boundary = create_closed_boundary()
        assert is_boundary_closed(boundary) is True

    def test_triangle_polygon_is_closed(self):
        """Test that a triangle polygon is considered closed."""
        boundary = create_closed_boundary(
            polygon=[(100, 100), (200, 100), (150, 200)],
            area=5000,
        )
        assert is_boundary_closed(boundary) is True

    def test_complex_polygon_is_closed(self):
        """Test that a complex polygon is considered closed."""
        boundary = create_closed_boundary(
            polygon=[
                (100, 100), (150, 80), (200, 100),
                (220, 150), (200, 200), (100, 200),
            ],
            area=10000,
        )
        assert is_boundary_closed(boundary) is True

    def test_two_point_boundary_not_closed(self):
        """Test that a boundary with only 2 points is not closed."""
        boundary = create_degenerate_boundary()
        assert is_boundary_closed(boundary) is False

    def test_zero_area_boundary_not_closed(self):
        """Test that a boundary with zero area is not closed."""
        polygon = [(100, 100), (200, 100), (150, 100)]  # Collinear points
        contour = np.array(polygon, dtype=np.int32)
        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=0,
            polygon=polygon,
            confidence=0.5,
        )
        assert is_boundary_closed(boundary) is False

    def test_negative_area_boundary_not_closed(self):
        """Test that a boundary with negative area is not closed."""
        polygon = [(100, 100), (200, 100), (150, 150)]
        contour = np.array(polygon, dtype=np.int32)
        boundary = DetectedBoundary(
            contour=contour,
            color="orange",
            area=-100,
            polygon=polygon,
            confidence=0.5,
        )
        assert is_boundary_closed(boundary) is False


class TestAllBoundariesClosed:
    """Tests for all_boundaries_closed function."""

    def test_all_closed_returns_true(self):
        """Test returns True when all boundaries are closed."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
        ]
        assert all_boundaries_closed(boundaries) is True

    def test_one_not_closed_returns_false(self):
        """Test returns False when one boundary is not closed."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_non_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
        ]
        assert all_boundaries_closed(boundaries) is False

    def test_empty_list_returns_false(self):
        """Test returns False for empty boundary list."""
        assert all_boundaries_closed([]) is False

    def test_single_closed_boundary_returns_true(self):
        """Test returns True for single closed boundary."""
        boundaries = [create_closed_boundary()]
        assert all_boundaries_closed(boundaries) is True

    def test_single_non_closed_boundary_returns_false(self):
        """Test returns False for single non-closed boundary."""
        boundaries = [create_degenerate_boundary()]
        assert all_boundaries_closed(boundaries) is False


class TestShouldFastTrack:
    """Tests for should_fast_track function."""

    def test_fast_track_when_thresholds_met_and_closed(self):
        """Test fast-track when coverage >= 0.8, boundaries >= 3, all closed."""
        boundaries = [
            create_closed_boundary(color="orange", area=2000),
            create_closed_boundary(color="yellow", area=2000),
            create_closed_boundary(color="blue", area=2000),
            create_closed_boundary(color="orange", area=2000),
            create_closed_boundary(color="yellow", area=2000),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )
        config = Phase0Config(fast_track_threshold=0.8, min_boundaries_for_fast_track=3)

        assert should_fast_track(result, config) is True

    def test_not_fast_track_when_boundaries_too_few(self):
        """Test no fast-track when boundary count below minimum."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )
        config = Phase0Config(fast_track_threshold=0.8, min_boundaries_for_fast_track=3)

        assert should_fast_track(result, config) is False

    def test_not_fast_track_when_coverage_too_low(self):
        """Test no fast-track when coverage below threshold."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.5,  # Below threshold
            image_shape=(100, 100),
        )
        config = Phase0Config(fast_track_threshold=0.8, min_boundaries_for_fast_track=3)

        assert should_fast_track(result, config) is False

    def test_not_fast_track_when_boundaries_not_closed(self):
        """Test no fast-track when boundaries are not closed (REQUIRED check)."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_degenerate_boundary(),  # Not closed
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )
        config = Phase0Config(
            fast_track_threshold=0.8,
            min_boundaries_for_fast_track=3,
            require_closed_regions=True,
        )

        assert should_fast_track(result, config) is False

    def test_not_fast_track_when_disabled(self):
        """Test no fast-track when Phase 0 is disabled."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.95,
            image_shape=(100, 100),
        )
        config = Phase0Config.disabled()

        assert should_fast_track(result, config) is False

    def test_fast_track_when_closed_regions_not_required(self):
        """Test fast-track allowed when closed regions check is disabled."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_degenerate_boundary(),  # Not closed, but check disabled
            create_closed_boundary(color="blue"),
            create_closed_boundary(color="orange"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.85,
            image_shape=(100, 100),
        )
        config = Phase0Config(
            fast_track_threshold=0.8,
            min_boundaries_for_fast_track=3,
            require_closed_regions=False,  # Disabled
        )

        assert should_fast_track(result, config) is True

    def test_fast_track_at_exact_thresholds(self):
        """Test fast-track at exact threshold values."""
        boundaries = [
            create_closed_boundary(color="orange"),
            create_closed_boundary(color="yellow"),
            create_closed_boundary(color="blue"),
        ]
        result = ColorBoundaryResult(
            boundaries=boundaries,
            combined_mask=np.zeros((100, 100), dtype=np.uint8),
            coverage_ratio=0.8,  # Exactly at threshold
            image_shape=(100, 100),
        )
        config = Phase0Config(fast_track_threshold=0.8, min_boundaries_for_fast_track=3)

        assert should_fast_track(result, config) is True
