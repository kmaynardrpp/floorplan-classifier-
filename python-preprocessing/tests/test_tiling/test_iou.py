"""Tests for IoU calculation."""

import pytest
import numpy as np

from src.tiling.iou import (
    polygon_to_mask,
    calculate_iou,
    calculate_iou_fast,
    polygon_bounding_box,
    zones_overlap,
)


class TestPolygonToMask:
    """Tests for polygon_to_mask function."""

    def test_rectangle_mask(self):
        """Test creating mask from rectangle polygon."""
        polygon = [(10, 10), (90, 10), (90, 90), (10, 90)]
        mask = polygon_to_mask(polygon, 100, 100)

        assert mask.shape == (100, 100)
        assert mask.dtype == np.uint8

        # Interior should be filled
        assert mask[50, 50] == 1
        # Exterior should be empty
        assert mask[5, 5] == 0
        assert mask[95, 95] == 0

    def test_triangle_mask(self):
        """Test creating mask from triangle polygon."""
        polygon = [(50, 10), (90, 90), (10, 90)]
        mask = polygon_to_mask(polygon, 100, 100)

        # Center of triangle should be filled
        assert mask[60, 50] == 1
        # Outside triangle should be empty
        assert mask[5, 5] == 0

    def test_empty_polygon(self):
        """Test empty polygon returns empty mask."""
        mask = polygon_to_mask([], 100, 100)
        assert np.all(mask == 0)

    def test_polygon_with_two_points(self):
        """Test polygon with < 3 points returns empty mask."""
        mask = polygon_to_mask([(0, 0), (100, 100)], 100, 100)
        assert np.all(mask == 0)


class TestCalculateIou:
    """Tests for calculate_iou function."""

    def test_identical_polygons(self):
        """Test IoU of identical polygons is 1.0."""
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
        iou = calculate_iou(polygon, polygon)
        assert abs(iou - 1.0) < 0.01

    def test_non_overlapping_polygons(self):
        """Test IoU of non-overlapping polygons is 0.0."""
        polygon1 = [(0, 0), (50, 0), (50, 50), (0, 50)]
        polygon2 = [(100, 100), (150, 100), (150, 150), (100, 150)]
        iou = calculate_iou(polygon1, polygon2)
        assert iou == 0.0

    def test_partial_overlap(self):
        """Test IoU of partially overlapping polygons."""
        # Two 100x100 squares with 50px overlap
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(50, 0), (150, 0), (150, 100), (50, 100)]

        iou = calculate_iou(polygon1, polygon2)

        # Overlap = 50*100 = 5000
        # Union = 100*100 + 100*100 - 5000 = 15000
        # IoU = 5000/15000 = 0.333
        assert 0.30 < iou < 0.37

    def test_contained_polygon(self):
        """Test IoU when one polygon is inside another."""
        outer = [(0, 0), (100, 0), (100, 100), (0, 100)]
        inner = [(25, 25), (75, 25), (75, 75), (25, 75)]

        iou = calculate_iou(outer, inner)

        # Overlap = 50*50 = 2500
        # Union = 100*100 = 10000
        # IoU = 2500/10000 = 0.25
        assert 0.24 < iou < 0.26

    def test_empty_polygon1(self):
        """Test IoU with empty first polygon."""
        polygon2 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        iou = calculate_iou([], polygon2)
        assert iou == 0.0

    def test_empty_polygon2(self):
        """Test IoU with empty second polygon."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        iou = calculate_iou(polygon1, [])
        assert iou == 0.0

    def test_with_explicit_bounds(self):
        """Test IoU calculation with explicit bounds."""
        polygon1 = [(10, 10), (60, 10), (60, 60), (10, 60)]
        polygon2 = [(40, 10), (90, 10), (90, 60), (40, 60)]

        iou = calculate_iou(polygon1, polygon2, bounds=(0, 0, 100, 100))
        assert 0.0 < iou < 1.0


class TestCalculateIouFast:
    """Tests for calculate_iou_fast (bounding box)."""

    def test_identical_boxes(self):
        """Test IoU of identical boxes is 1.0."""
        bbox = (0, 0, 100, 100)
        iou = calculate_iou_fast(bbox, bbox)
        assert iou == 1.0

    def test_non_overlapping_boxes(self):
        """Test IoU of non-overlapping boxes is 0.0."""
        bbox1 = (0, 0, 50, 50)
        bbox2 = (100, 100, 150, 150)
        iou = calculate_iou_fast(bbox1, bbox2)
        assert iou == 0.0

    def test_partial_overlap(self):
        """Test IoU of partially overlapping boxes."""
        bbox1 = (0, 0, 100, 100)
        bbox2 = (50, 0, 150, 100)

        iou = calculate_iou_fast(bbox1, bbox2)

        # Same as polygon test
        assert 0.30 < iou < 0.37

    def test_adjacent_boxes(self):
        """Test IoU of adjacent (touching) boxes is 0.0."""
        bbox1 = (0, 0, 100, 100)
        bbox2 = (100, 0, 200, 100)
        iou = calculate_iou_fast(bbox1, bbox2)
        assert iou == 0.0

    def test_contained_box(self):
        """Test IoU when one box is inside another."""
        outer = (0, 0, 100, 100)
        inner = (25, 25, 75, 75)

        iou = calculate_iou_fast(outer, inner)
        assert 0.24 < iou < 0.26


class TestPolygonBoundingBox:
    """Tests for polygon_bounding_box function."""

    def test_rectangle(self):
        """Test bounding box of rectangle."""
        polygon = [(10, 20), (80, 20), (80, 90), (10, 90)]
        bbox = polygon_bounding_box(polygon)
        assert bbox == (10, 20, 80, 90)

    def test_triangle(self):
        """Test bounding box of triangle."""
        polygon = [(50, 10), (90, 90), (10, 90)]
        bbox = polygon_bounding_box(polygon)
        assert bbox == (10, 10, 90, 90)

    def test_empty_polygon(self):
        """Test bounding box of empty polygon."""
        bbox = polygon_bounding_box([])
        assert bbox == (0, 0, 0, 0)

    def test_single_point(self):
        """Test bounding box of single point."""
        bbox = polygon_bounding_box([(50, 50)])
        assert bbox == (50, 50, 50, 50)


class TestZonesOverlap:
    """Tests for zones_overlap function."""

    def test_overlapping_zones(self):
        """Test detecting overlapping zones."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(50, 0), (150, 0), (150, 100), (50, 100)]

        assert zones_overlap(polygon1, polygon2) is True

    def test_non_overlapping_zones(self):
        """Test non-overlapping zones."""
        polygon1 = [(0, 0), (50, 0), (50, 50), (0, 50)]
        polygon2 = [(100, 100), (150, 100), (150, 150), (100, 150)]

        assert zones_overlap(polygon1, polygon2) is False

    def test_overlap_with_threshold(self):
        """Test overlap check with IoU threshold."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(50, 0), (150, 0), (150, 100), (50, 100)]

        # IoU ~0.33, so threshold 0.2 should pass, 0.5 should fail
        assert zones_overlap(polygon1, polygon2, threshold=0.2) is True
        assert zones_overlap(polygon1, polygon2, threshold=0.5) is False

    def test_zero_threshold_any_overlap(self):
        """Test that threshold 0.0 returns true for any bbox overlap."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(99, 0), (199, 0), (199, 100), (99, 100)]

        # Minimal overlap
        assert zones_overlap(polygon1, polygon2, threshold=0.0) is True
