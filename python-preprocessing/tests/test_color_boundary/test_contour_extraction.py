"""
Tests for contour extraction and polygon simplification.

Task 1.5: Implement Contour Extraction and Polygon Simplification
"""

import pytest
import numpy as np
import cv2

from src.color_boundary.contour_extraction import (
    extract_contours,
    contour_to_polygon,
    extract_polygons,
    polygon_area,
    polygon_to_contour,
)


class TestExtractContours:
    """Tests for extract_contours function."""

    def test_single_rectangle_extracted(self):
        """Test that a single rectangle is extracted as one contour."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 20:80] = 255  # 60x60 rectangle

        contours = extract_contours(mask, min_area=100)

        assert len(contours) == 1
        # Area should be approximately 60*60 = 3600 (contour may have slight variation)
        area = cv2.contourArea(contours[0])
        assert 3400 < area < 3700

    def test_small_contours_filtered_out(self):
        """Test that contours below min_area are filtered out."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[10:20, 10:20] = 255  # 10x10 = 100 px area
        mask[50:90, 50:90] = 255  # 40x40 = 1600 px area

        # Filter to keep only contours >= 500 px
        contours = extract_contours(mask, min_area=500)

        assert len(contours) == 1
        # Should only have the larger rectangle
        area = cv2.contourArea(contours[0])
        assert area > 1000

    def test_empty_mask_returns_empty_list(self):
        """Test that empty mask returns empty list."""
        mask = np.zeros((100, 100), dtype=np.uint8)

        contours = extract_contours(mask, min_area=100)

        assert len(contours) == 0

    def test_multiple_shapes_extracted(self):
        """Test that multiple separate shapes are extracted."""
        mask = np.zeros((200, 200), dtype=np.uint8)
        mask[10:50, 10:50] = 255  # Rectangle 1
        mask[100:150, 100:150] = 255  # Rectangle 2
        mask[10:50, 100:150] = 255  # Rectangle 3

        contours = extract_contours(mask, min_area=100)

        assert len(contours) == 3


class TestContourToPolygon:
    """Tests for contour_to_polygon function."""

    def test_rectangle_simplified_to_4_vertices(self):
        """Test that a rectangle mask produces approximately 4 vertices."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 20:80] = 255

        contours = extract_contours(mask, min_area=100)
        polygon = contour_to_polygon(contours[0], epsilon_factor=0.02)

        # A clean rectangle should have 4 vertices
        assert len(polygon) == 4

    def test_complex_shape_simplified(self):
        """Test that complex shape is simplified to reasonable vertex count."""
        # Create a complex shape (star-like)
        mask = np.zeros((100, 100), dtype=np.uint8)
        cv2.circle(mask, (50, 50), 40, 255, -1)

        contours = extract_contours(mask, min_area=100)
        polygon = contour_to_polygon(contours[0], epsilon_factor=0.02)

        # Circle approximation should have <20 vertices with default epsilon
        assert len(polygon) < 20

    def test_returns_python_int_tuples(self):
        """Test that returned coordinates are Python int tuples, not numpy."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 20:80] = 255

        contours = extract_contours(mask, min_area=100)
        polygon = contour_to_polygon(contours[0])

        for x, y in polygon:
            assert isinstance(x, int), f"Expected int, got {type(x)}"
            assert isinstance(y, int), f"Expected int, got {type(y)}"
            # Should not be numpy types
            assert type(x).__module__ == "builtins"
            assert type(y).__module__ == "builtins"

    def test_smaller_epsilon_more_vertices(self):
        """Test that smaller epsilon produces more vertices."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        cv2.circle(mask, (50, 50), 40, 255, -1)

        contours = extract_contours(mask, min_area=100)

        polygon_coarse = contour_to_polygon(contours[0], epsilon_factor=0.05)
        polygon_fine = contour_to_polygon(contours[0], epsilon_factor=0.01)

        assert len(polygon_fine) > len(polygon_coarse)


class TestExtractPolygons:
    """Tests for extract_polygons convenience function."""

    def test_combines_extract_and_simplify(self):
        """Test that extract_polygons combines extraction and simplification."""
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 20:80] = 255

        polygons = extract_polygons(mask, min_area=100, epsilon_factor=0.02)

        assert len(polygons) == 1
        assert len(polygons[0]) == 4  # Rectangle -> 4 vertices


class TestPolygonArea:
    """Tests for polygon_area function."""

    def test_square_area(self):
        """Test area calculation for a square."""
        # 10x10 square
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]

        area = polygon_area(square)

        assert area == 100.0

    def test_triangle_area(self):
        """Test area calculation for a triangle."""
        # Right triangle with legs 10 and 10
        triangle = [(0, 0), (10, 0), (0, 10)]

        area = polygon_area(triangle)

        assert area == 50.0

    def test_empty_polygon_zero_area(self):
        """Test that polygon with < 3 vertices returns 0."""
        assert polygon_area([]) == 0.0
        assert polygon_area([(0, 0)]) == 0.0
        assert polygon_area([(0, 0), (10, 10)]) == 0.0


class TestPolygonToContour:
    """Tests for polygon_to_contour function."""

    def test_roundtrip_conversion(self):
        """Test that polygon converts to contour and back."""
        original = [(10, 20), (100, 20), (100, 80), (10, 80)]

        contour = polygon_to_contour(original)
        polygon = contour_to_polygon(contour, epsilon_factor=0.001)

        # Should get approximately same vertices
        assert len(polygon) == len(original)
        for (ox, oy), (px, py) in zip(original, polygon):
            assert abs(ox - px) <= 1
            assert abs(oy - py) <= 1

    def test_contour_shape_correct(self):
        """Test that contour has correct OpenCV shape."""
        polygon = [(0, 0), (10, 0), (10, 10), (0, 10)]

        contour = polygon_to_contour(polygon)

        assert contour.shape == (4, 1, 2)
        assert contour.dtype == np.int32
