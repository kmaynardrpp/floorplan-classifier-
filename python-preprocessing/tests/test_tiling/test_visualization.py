"""Tests for tile visualization utilities."""

import os
import tempfile

import cv2
import numpy as np
import pytest

from src.tiling.models import ImageTile, OverlapRegion
from src.tiling.visualization import (
    visualize_tiles,
    visualize_tile_grid,
    TILE_COLORS,
)


class TestVisualizeTiles:
    """Tests for visualize_tiles function."""

    @pytest.fixture
    def sample_image(self):
        """Create sample test image."""
        return np.ones((500, 800, 3), dtype=np.uint8) * 200

    @pytest.fixture
    def sample_tiles(self):
        """Create sample tiles for visualization."""
        # Create 2 tiles with some overlap
        tile1 = ImageTile(
            id="tile_0",
            image=np.zeros((300, 500, 3), dtype=np.uint8),
            bounds=(0, 0, 500, 300),
            overlap_regions=[
                OverlapRegion("tile_1", (400, 0, 500, 300)),
            ],
        )
        tile2 = ImageTile(
            id="tile_1",
            image=np.zeros((300, 400, 3), dtype=np.uint8),
            bounds=(400, 0, 800, 300),
            overlap_regions=[
                OverlapRegion("tile_0", (0, 0, 100, 300)),
            ],
        )
        return [tile1, tile2]

    def test_creates_output_file(self, sample_image, sample_tiles):
        """Test that visualization creates output file."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(sample_image, sample_tiles, output_path)
            assert result == output_path
            assert os.path.exists(output_path)

            # Read back and verify it's a valid image
            vis = cv2.imread(output_path)
            assert vis is not None
            assert vis.shape[:2] == sample_image.shape[:2]
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_no_labels(self, sample_image, sample_tiles):
        """Test visualization without labels."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(
                sample_image, sample_tiles, output_path,
                show_labels=False,
            )
            assert os.path.exists(result)
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_no_overlaps(self, sample_image, sample_tiles):
        """Test visualization without overlap highlighting."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(
                sample_image, sample_tiles, output_path,
                show_overlaps=False,
            )
            assert os.path.exists(result)
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_custom_alpha(self, sample_image, sample_tiles):
        """Test visualization with custom alpha."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(
                sample_image, sample_tiles, output_path,
                alpha=0.5,
            )
            assert os.path.exists(result)
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_empty_tiles_list(self, sample_image):
        """Test visualization with no tiles."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(sample_image, [], output_path)
            assert os.path.exists(result)

            # Should still have legend
            vis = cv2.imread(output_path)
            assert vis is not None
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_many_tiles_cycles_colors(self):
        """Test that many tiles cycle through colors."""
        image = np.ones((1000, 1000, 3), dtype=np.uint8) * 200

        # Create more tiles than colors
        tiles = []
        for i in range(len(TILE_COLORS) + 3):
            tiles.append(ImageTile(
                id=f"tile_{i}",
                image=np.zeros((100, 100, 3), dtype=np.uint8),
                bounds=(0, i * 100, 100, (i + 1) * 100),
                overlap_regions=[],
            ))

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tiles(image, tiles, output_path)
            assert os.path.exists(result)
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)


class TestVisualizeTileGrid:
    """Tests for visualize_tile_grid function."""

    def test_creates_output_file(self):
        """Test that grid visualization creates output file."""
        boundaries = [(0, 0, 500, 300), (400, 0, 800, 300)]

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tile_grid(800, 300, boundaries, output_path)
            assert result == output_path
            assert os.path.exists(output_path)

            # Read back and verify
            vis = cv2.imread(output_path)
            assert vis is not None
            assert vis.shape[:2] == (300, 800)
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_white_background(self):
        """Test that grid has white background."""
        boundaries = [(0, 0, 100, 100)]

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            visualize_tile_grid(100, 100, boundaries, output_path)
            vis = cv2.imread(output_path)

            # Check corners are white (or near-white due to grid lines)
            # Center should be white
            center_pixel = vis[50, 50]
            assert np.all(center_pixel >= 200), "Background should be white"
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_empty_boundaries(self):
        """Test grid visualization with no boundaries."""
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            result = visualize_tile_grid(500, 300, [], output_path)
            assert os.path.exists(result)

            # Should still create blank canvas
            vis = cv2.imread(output_path)
            assert vis is not None
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)

    def test_tile_numbers_visible(self):
        """Test that tile numbers are rendered."""
        boundaries = [
            (0, 0, 200, 200),
            (200, 0, 400, 200),
            (0, 200, 200, 400),
            (200, 200, 400, 400),
        ]

        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            output_path = f.name

        try:
            visualize_tile_grid(400, 400, boundaries, output_path)
            vis = cv2.imread(output_path)

            # The visualization should not be pure white
            # (tiles and numbers should be drawn)
            white_pixels = np.sum(np.all(vis == 255, axis=2))
            total_pixels = vis.shape[0] * vis.shape[1]
            assert white_pixels < total_pixels, "Some content should be drawn"
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)


class TestTileColors:
    """Tests for TILE_COLORS constant."""

    def test_colors_defined(self):
        """Test that colors are defined."""
        assert len(TILE_COLORS) >= 8

    def test_colors_are_bgr_tuples(self):
        """Test that colors are valid BGR tuples."""
        for color in TILE_COLORS:
            assert isinstance(color, tuple)
            assert len(color) == 3
            assert all(0 <= c <= 255 for c in color)

    def test_colors_are_distinct(self):
        """Test that colors are reasonably distinct."""
        # No two colors should be identical
        color_set = set(TILE_COLORS)
        assert len(color_set) == len(TILE_COLORS)
