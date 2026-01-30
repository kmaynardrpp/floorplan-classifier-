"""Tests for ImageTiler class."""

import numpy as np
import pytest

from src.tiling.tiler import ImageTiler
from src.tiling.models import TilingConfig


class TestImageTilerInit:
    """Tests for ImageTiler initialization."""

    def test_default_init(self):
        """Test default initialization."""
        tiler = ImageTiler()
        assert tiler.tile_size == 2048
        assert tiler.overlap == 256
        assert tiler.max_dimension == 4000

    def test_custom_init(self):
        """Test initialization with custom parameters."""
        tiler = ImageTiler(tile_size=1024, overlap=128, max_dimension=2000)
        assert tiler.tile_size == 1024
        assert tiler.overlap == 128
        assert tiler.max_dimension == 2000

    def test_init_with_config(self):
        """Test initialization with TilingConfig."""
        config = TilingConfig(tile_size=512, overlap=64, dimension_threshold=1000)
        tiler = ImageTiler(config=config)
        assert tiler.tile_size == 512
        assert tiler.overlap == 64
        assert tiler.max_dimension == 1000

    def test_invalid_overlap(self):
        """Test that overlap >= tile_size raises error."""
        with pytest.raises(ValueError, match="overlap.*must be < tile_size"):
            ImageTiler(tile_size=100, overlap=100)

        with pytest.raises(ValueError, match="overlap.*must be < tile_size"):
            ImageTiler(tile_size=100, overlap=150)


class TestShouldTile:
    """Tests for should_tile decision logic."""

    def test_small_image_no_tile(self):
        """Test that small images don't require tiling."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((500, 800, 3), dtype=np.uint8)
        assert tiler.should_tile(image) is False

    def test_wide_image_needs_tile(self):
        """Test that wide images require tiling."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((500, 1500, 3), dtype=np.uint8)
        assert tiler.should_tile(image) is True

    def test_tall_image_needs_tile(self):
        """Test that tall images require tiling."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((1500, 500, 3), dtype=np.uint8)
        assert tiler.should_tile(image) is True

    def test_large_image_needs_tile(self):
        """Test that large images in both dimensions require tiling."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((2000, 2000, 3), dtype=np.uint8)
        assert tiler.should_tile(image) is True

    def test_exact_threshold(self):
        """Test image exactly at threshold."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((1000, 1000, 3), dtype=np.uint8)
        assert tiler.should_tile(image) is False

    def test_grayscale_image(self):
        """Test with grayscale (2D) image."""
        tiler = ImageTiler(max_dimension=1000)
        image = np.zeros((500, 500), dtype=np.uint8)
        assert tiler.should_tile(image) is False

        large_gray = np.zeros((1500, 500), dtype=np.uint8)
        assert tiler.should_tile(large_gray) is True


class TestCalculateGridBoundaries:
    """Tests for grid boundary calculation."""

    def test_single_tile(self):
        """Test image that fits in single tile."""
        tiler = ImageTiler(tile_size=1000, overlap=100, max_dimension=2000)
        boundaries = tiler._calculate_grid_boundaries(800, 600)
        assert len(boundaries) == 1
        assert boundaries[0] == (0, 0, 800, 600)

    def test_two_horizontal_tiles(self):
        """Test image that needs 2 horizontal tiles."""
        tiler = ImageTiler(tile_size=500, overlap=50, max_dimension=1000)
        # With step = 450, for width 800:
        # tile 0: 0-500, tile 1: 450-800
        boundaries = tiler._calculate_grid_boundaries(800, 400)
        assert len(boundaries) == 2
        assert boundaries[0] == (0, 0, 500, 400)
        assert boundaries[1][0] == 450  # x1
        assert boundaries[1][2] == 800  # x2

    def test_two_vertical_tiles(self):
        """Test image that needs 2 vertical tiles."""
        tiler = ImageTiler(tile_size=500, overlap=50, max_dimension=1000)
        boundaries = tiler._calculate_grid_boundaries(400, 800)
        assert len(boundaries) == 2
        assert boundaries[0] == (0, 0, 400, 500)
        assert boundaries[1][1] == 450  # y1
        assert boundaries[1][3] == 800  # y2

    def test_2x2_grid(self):
        """Test image that creates 2x2 grid."""
        tiler = ImageTiler(tile_size=500, overlap=50, max_dimension=1000)
        boundaries = tiler._calculate_grid_boundaries(800, 800)
        assert len(boundaries) == 4

        # Check corners covered
        corners = [(0, 0), (800, 0), (0, 800), (800, 800)]
        for cx, cy in corners:
            covered = any(
                x1 <= cx <= x2 and y1 <= cy <= y2
                for x1, y1, x2, y2 in boundaries
            )
            assert covered, f"Corner ({cx}, {cy}) not covered"

    def test_overlap_between_tiles(self):
        """Test that adjacent tiles overlap correctly."""
        tiler = ImageTiler(tile_size=500, overlap=100, max_dimension=1000)
        boundaries = tiler._calculate_grid_boundaries(800, 400)

        # With step = 400, tiles should overlap by 100
        assert len(boundaries) == 2
        x1_0, _, x2_0, _ = boundaries[0]
        x1_1, _, x2_1, _ = boundaries[1]

        # Overlap region
        overlap_start = max(x1_0, x1_1)
        overlap_end = min(x2_0, x2_1)
        assert overlap_end - overlap_start == 100


class TestCreateTiles:
    """Tests for tile creation."""

    def test_create_single_tile(self):
        """Test creating tiles from small image."""
        tiler = ImageTiler(tile_size=1000, overlap=100, max_dimension=2000)
        image = np.ones((400, 600, 3), dtype=np.uint8) * 128
        tiles = tiler.create_tiles(image)

        assert len(tiles) == 1
        assert tiles[0].id == "tile_0"
        assert tiles[0].bounds == (0, 0, 600, 400)
        assert tiles[0].image.shape == (400, 600, 3)
        assert np.all(tiles[0].image == 128)

    def test_create_multiple_tiles(self):
        """Test creating multiple tiles."""
        tiler = ImageTiler(tile_size=500, overlap=50, max_dimension=1000)
        image = np.zeros((800, 800, 3), dtype=np.uint8)

        # Add unique colors to each quadrant
        image[:400, :400] = [255, 0, 0]  # Top-left: red
        image[:400, 400:] = [0, 255, 0]  # Top-right: green
        image[400:, :400] = [0, 0, 255]  # Bottom-left: blue
        image[400:, 400:] = [255, 255, 0]  # Bottom-right: yellow

        tiles = tiler.create_tiles(image)
        assert len(tiles) == 4

        # Verify each tile has unique ID
        ids = [t.id for t in tiles]
        assert len(set(ids)) == 4

    def test_tiles_have_correct_images(self):
        """Test that tile images contain correct pixel data."""
        tiler = ImageTiler(tile_size=100, overlap=0, max_dimension=200)

        # Create gradient image
        image = np.zeros((200, 200, 3), dtype=np.uint8)
        for y in range(200):
            for x in range(200):
                image[y, x] = [x, y, 0]

        tiles = tiler.create_tiles(image)
        assert len(tiles) == 4

        # Check each tile's pixel values match source
        for tile in tiles:
            x1, y1, x2, y2 = tile.bounds
            expected = image[y1:y2, x1:x2]
            np.testing.assert_array_equal(tile.image, expected)

    def test_tiles_have_overlap_regions(self):
        """Test that tiles track their overlap regions."""
        tiler = ImageTiler(tile_size=500, overlap=100, max_dimension=1000)
        image = np.zeros((800, 800, 3), dtype=np.uint8)
        tiles = tiler.create_tiles(image)

        # Each interior tile should have overlaps with neighbors
        for tile in tiles:
            x1, y1, x2, y2 = tile.bounds

            # Count expected neighbors
            expected_overlaps = 0
            for other in tiles:
                if other.id == tile.id:
                    continue
                ox1, oy1, ox2, oy2 = other.bounds
                # Check for intersection
                if (x1 < ox2 and x2 > ox1 and y1 < oy2 and y2 > oy1):
                    expected_overlaps += 1

            assert len(tile.overlap_regions) == expected_overlaps


class TestGetTileCount:
    """Tests for tile count calculation."""

    def test_small_image_count(self):
        """Test tile count for small image."""
        tiler = ImageTiler(tile_size=1000, overlap=100, max_dimension=2000)
        count = tiler.get_tile_count(800, 600)
        assert count == 1

    def test_large_image_count(self):
        """Test tile count for large image exceeding threshold."""
        # max_dimension=500 ensures 800x800 triggers tiling
        tiler = ImageTiler(tile_size=500, overlap=50, max_dimension=500)
        count = tiler.get_tile_count(800, 800)
        assert count == 4

    def test_count_matches_create(self):
        """Test that get_tile_count matches actual tile creation."""
        # max_dimension=500 ensures all test sizes trigger tiling
        tiler = ImageTiler(tile_size=500, overlap=100, max_dimension=500)

        for width, height in [(800, 600), (1200, 800), (1000, 1000)]:
            image = np.zeros((height, width, 3), dtype=np.uint8)
            predicted = tiler.get_tile_count(width, height)
            actual = len(tiler.create_tiles(image))
            assert predicted == actual, f"Mismatch for {width}x{height}"
