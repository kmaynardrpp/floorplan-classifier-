"""Tests for coordinate transformation utilities."""

import pytest

from src.tiling.transforms import (
    tile_to_original,
    original_to_tile,
    transform_polygon,
    transform_polygon_to_tile,
    transform_bbox,
    is_point_in_tile,
    clip_polygon_to_bounds,
)


class TestTileToOriginal:
    """Tests for tile_to_original transformation."""

    def test_basic_transform(self):
        """Test basic coordinate transformation."""
        point = (10, 20)
        tile_bounds = (100, 200, 300, 400)
        result = tile_to_original(point, tile_bounds)
        assert result == (110, 220)

    def test_origin_transform(self):
        """Test transforming tile origin."""
        point = (0, 0)
        tile_bounds = (50, 75, 150, 175)
        result = tile_to_original(point, tile_bounds)
        assert result == (50, 75)

    def test_transform_with_zero_offset(self):
        """Test transform when tile starts at origin."""
        point = (30, 40)
        tile_bounds = (0, 0, 100, 100)
        result = tile_to_original(point, tile_bounds)
        assert result == (30, 40)


class TestOriginalToTile:
    """Tests for original_to_tile transformation."""

    def test_basic_inverse_transform(self):
        """Test basic inverse transformation."""
        point = (110, 220)
        tile_bounds = (100, 200, 300, 400)
        result = original_to_tile(point, tile_bounds)
        assert result == (10, 20)

    def test_tile_origin(self):
        """Test point at tile origin."""
        point = (50, 75)
        tile_bounds = (50, 75, 150, 175)
        result = original_to_tile(point, tile_bounds)
        assert result == (0, 0)

    def test_roundtrip(self):
        """Test that tile_to_original and original_to_tile are inverses."""
        tile_bounds = (100, 200, 500, 600)

        # Start with tile coordinates
        tile_point = (50, 75)
        original = tile_to_original(tile_point, tile_bounds)
        back = original_to_tile(original, tile_bounds)
        assert back == tile_point

        # Start with original coordinates
        original_point = (150, 275)
        tile = original_to_tile(original_point, tile_bounds)
        back = tile_to_original(tile, tile_bounds)
        assert back == original_point


class TestTransformPolygon:
    """Tests for transform_polygon."""

    def test_transform_triangle(self):
        """Test transforming a triangle."""
        polygon = [(0, 0), (100, 0), (50, 100)]
        tile_bounds = (200, 300, 400, 500)
        result = transform_polygon(polygon, tile_bounds)

        assert result == [(200, 300), (300, 300), (250, 400)]

    def test_transform_rectangle(self):
        """Test transforming a rectangle."""
        polygon = [(10, 10), (90, 10), (90, 90), (10, 90)]
        tile_bounds = (100, 100, 200, 200)
        result = transform_polygon(polygon, tile_bounds)

        assert result == [(110, 110), (190, 110), (190, 190), (110, 190)]

    def test_empty_polygon(self):
        """Test transforming empty polygon."""
        polygon = []
        tile_bounds = (100, 100, 200, 200)
        result = transform_polygon(polygon, tile_bounds)
        assert result == []


class TestTransformPolygonToTile:
    """Tests for transform_polygon_to_tile."""

    def test_transform_to_tile(self):
        """Test transforming polygon to tile coordinates."""
        polygon = [(200, 300), (300, 300), (250, 400)]
        tile_bounds = (200, 300, 400, 500)
        result = transform_polygon_to_tile(polygon, tile_bounds)

        assert result == [(0, 0), (100, 0), (50, 100)]

    def test_roundtrip_polygon(self):
        """Test polygon transformation roundtrip."""
        original_polygon = [(50, 60), (150, 60), (150, 160), (50, 160)]
        tile_bounds = (100, 100, 300, 300)

        to_tile = transform_polygon_to_tile(original_polygon, tile_bounds)
        back = transform_polygon(to_tile, tile_bounds)

        assert back == original_polygon


class TestTransformBbox:
    """Tests for transform_bbox."""

    def test_transform_bbox(self):
        """Test bounding box transformation."""
        bbox = (10, 20, 80, 90)
        tile_bounds = (100, 200, 300, 400)
        result = transform_bbox(bbox, tile_bounds)

        assert result == (110, 220, 180, 290)

    def test_transform_bbox_at_origin(self):
        """Test bbox when tile starts at origin."""
        bbox = (10, 20, 80, 90)
        tile_bounds = (0, 0, 100, 100)
        result = transform_bbox(bbox, tile_bounds)

        assert result == (10, 20, 80, 90)


class TestIsPointInTile:
    """Tests for is_point_in_tile."""

    def test_point_inside(self):
        """Test point clearly inside tile."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((150, 150), tile_bounds) is True

    def test_point_outside_left(self):
        """Test point outside to the left."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((50, 150), tile_bounds) is False

    def test_point_outside_right(self):
        """Test point outside to the right."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((250, 150), tile_bounds) is False

    def test_point_outside_top(self):
        """Test point outside above."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((150, 50), tile_bounds) is False

    def test_point_outside_bottom(self):
        """Test point outside below."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((150, 250), tile_bounds) is False

    def test_point_on_left_edge(self):
        """Test point on left edge (inclusive)."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((100, 150), tile_bounds) is True

    def test_point_on_top_edge(self):
        """Test point on top edge (inclusive)."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((150, 100), tile_bounds) is True

    def test_point_on_right_edge(self):
        """Test point on right edge (exclusive)."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((200, 150), tile_bounds) is False

    def test_point_on_bottom_edge(self):
        """Test point on bottom edge (exclusive)."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((150, 200), tile_bounds) is False

    def test_corner_points(self):
        """Test corner points."""
        tile_bounds = (100, 100, 200, 200)
        assert is_point_in_tile((100, 100), tile_bounds) is True  # Top-left
        assert is_point_in_tile((199, 100), tile_bounds) is True  # Top-right inside
        assert is_point_in_tile((100, 199), tile_bounds) is True  # Bottom-left inside
        assert is_point_in_tile((200, 200), tile_bounds) is False  # Bottom-right outside


class TestClipPolygonToBounds:
    """Tests for clip_polygon_to_bounds."""

    def test_polygon_inside_bounds(self):
        """Test polygon already inside bounds."""
        polygon = [(50, 50), (150, 50), (150, 150), (50, 150)]
        bounds = (0, 0, 200, 200)
        result = clip_polygon_to_bounds(polygon, bounds)
        assert result == polygon

    def test_polygon_partially_outside(self):
        """Test polygon with vertices outside bounds."""
        polygon = [(-10, 50), (150, 50), (150, 150), (-10, 150)]
        bounds = (0, 0, 200, 200)
        result = clip_polygon_to_bounds(polygon, bounds)

        # Vertices should be clamped
        assert result[0] == (0, 50)  # -10 clamped to 0
        assert result[3] == (0, 150)

    def test_polygon_completely_outside(self):
        """Test polygon completely outside bounds."""
        polygon = [(-100, -100), (-50, -100), (-50, -50), (-100, -50)]
        bounds = (0, 0, 200, 200)
        result = clip_polygon_to_bounds(polygon, bounds)

        # All vertices clamped to origin corner
        for x, y in result:
            assert x == 0 and y == 0

    def test_clip_to_right_edge(self):
        """Test clipping to right edge."""
        polygon = [(150, 50), (250, 50), (250, 150), (150, 150)]
        bounds = (0, 0, 200, 200)
        result = clip_polygon_to_bounds(polygon, bounds)

        assert result[1] == (200, 50)
        assert result[2] == (200, 150)

    def test_clip_to_bottom_edge(self):
        """Test clipping to bottom edge."""
        polygon = [(50, 150), (150, 150), (150, 250), (50, 250)]
        bounds = (0, 0, 200, 200)
        result = clip_polygon_to_bounds(polygon, bounds)

        assert result[2] == (150, 200)
        assert result[3] == (50, 200)

    def test_empty_polygon(self):
        """Test empty polygon."""
        polygon = []
        bounds = (0, 0, 100, 100)
        result = clip_polygon_to_bounds(polygon, bounds)
        assert result == []
