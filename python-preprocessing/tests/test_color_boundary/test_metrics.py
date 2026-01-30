"""
Tests for coverage ratio calculation.

Task 1.6: Implement Coverage Ratio Calculation
"""

import pytest
import numpy as np

from src.color_boundary.models import DetectedBoundary
from src.color_boundary.metrics import (
    calculate_coverage,
    calculate_coverage_from_mask,
    calculate_coverage_precise,
)


class TestCalculateCoverage:
    """Tests for calculate_coverage function."""

    def create_boundary(self, area: int, polygon: list = None) -> DetectedBoundary:
        """Helper to create a test boundary."""
        if polygon is None:
            # Default square polygon
            polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        return DetectedBoundary(
            contour=np.array([[[0, 0]], [[100, 0]], [[100, 100]], [[0, 100]]], dtype=np.int32),
            color="orange",
            area=area,
            polygon=polygon,
        )

    def test_single_boundary_50_percent(self):
        """Test that boundary covering 50% of image returns 0.5."""
        # Image is 100x100 = 10000 pixels
        # Boundary covers 5000 pixels
        boundary = self.create_boundary(area=5000)

        coverage = calculate_coverage([boundary], (100, 100))

        assert coverage == 0.5

    def test_empty_boundaries_returns_zero(self):
        """Test that empty boundary list returns 0.0."""
        coverage = calculate_coverage([], (100, 100))

        assert coverage == 0.0

    def test_boundaries_exceeding_image_capped_at_one(self):
        """Test that coverage is capped at 1.0 when exceeding image area."""
        # Two boundaries each covering 60% = 120% total
        b1 = self.create_boundary(area=6000)
        b2 = self.create_boundary(area=6000)

        coverage = calculate_coverage([b1, b2], (100, 100))

        assert coverage == 1.0

    def test_zero_size_image_returns_zero(self):
        """Test that zero-size image returns 0.0."""
        boundary = self.create_boundary(area=1000)

        coverage = calculate_coverage([boundary], (0, 0))

        assert coverage == 0.0


class TestCalculateCoverageFromMask:
    """Tests for calculate_coverage_from_mask function."""

    def test_full_mask_returns_one(self):
        """Test that fully white mask returns 1.0."""
        mask = np.ones((100, 100), dtype=np.uint8) * 255

        coverage = calculate_coverage_from_mask(mask)

        assert coverage == 1.0

    def test_empty_mask_returns_zero(self):
        """Test that fully black mask returns 0.0."""
        mask = np.zeros((100, 100), dtype=np.uint8)

        coverage = calculate_coverage_from_mask(mask)

        assert coverage == 0.0

    def test_half_mask_returns_half(self):
        """Test that half-filled mask returns 0.5."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[0:50, :] = 255  # Top half

        coverage = calculate_coverage_from_mask(mask)

        assert coverage == 0.5

    def test_zero_size_mask_returns_zero(self):
        """Test that zero-size mask returns 0.0."""
        mask = np.array([], dtype=np.uint8)

        coverage = calculate_coverage_from_mask(mask)

        assert coverage == 0.0


class TestCalculateCoveragePrecise:
    """Tests for calculate_coverage_precise function."""

    def create_boundary(self, polygon: list, area: int = None) -> DetectedBoundary:
        """Helper to create a boundary with specific polygon."""
        if area is None:
            # Calculate approximate area from polygon
            area = len(polygon) * 1000  # Rough estimate

        pts = np.array(polygon, dtype=np.int32).reshape((-1, 1, 2))

        return DetectedBoundary(
            contour=pts,
            color="orange",
            area=area,
            polygon=polygon,
        )

    def test_single_square_coverage(self):
        """Test coverage for single 50x50 square in 100x100 image."""
        # 50x50 square = 2500 pixels in 10000 pixel image = 25%
        # (fillPoly may include edge pixels, so allow some tolerance)
        polygon = [(25, 25), (75, 25), (75, 75), (25, 75)]
        boundary = self.create_boundary(polygon, area=2500)

        coverage = calculate_coverage_precise([boundary], (100, 100))

        assert 0.24 < coverage < 0.27  # ~25% with edge tolerance

    def test_overlapping_boundaries_counted_once(self):
        """Test that overlapping areas are only counted once."""
        # Two squares that overlap 50%
        polygon1 = [(0, 0), (60, 0), (60, 60), (0, 60)]  # 3600 pixels
        polygon2 = [(30, 0), (90, 0), (90, 60), (30, 60)]  # 3600 pixels, overlaps 1800

        b1 = self.create_boundary(polygon1, area=3600)
        b2 = self.create_boundary(polygon2, area=3600)

        # Sum would be 7200, but actual coverage is 5400 (overlap counted once)
        coverage = calculate_coverage_precise([b1, b2], (100, 100))

        # Coverage should be ~54%, not 72%
        assert 0.50 < coverage < 0.58

    def test_empty_boundaries_returns_zero(self):
        """Test that empty boundaries return 0.0."""
        coverage = calculate_coverage_precise([], (100, 100))

        assert coverage == 0.0

    def test_zero_size_image_returns_zero(self):
        """Test that zero-size image returns 0.0."""
        polygon = [(0, 0), (10, 0), (10, 10), (0, 10)]
        boundary = self.create_boundary(polygon, area=100)

        coverage = calculate_coverage_precise([boundary], (0, 0))

        assert coverage == 0.0
