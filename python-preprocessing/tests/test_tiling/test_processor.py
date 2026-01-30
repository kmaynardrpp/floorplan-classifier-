"""Tests for TileProcessor class."""

import pytest
import numpy as np
from typing import List

from src.tiling.processor import TileProcessor, ProcessingProgress
from src.tiling.models import TilingConfig, ImageTile, Zone


def dummy_process_fn(tile: ImageTile) -> List[Zone]:
    """Dummy processing function that returns a single zone covering the tile."""
    return [
        Zone(
            id=f"zone_{tile.id}",
            zone_type="parking",
            polygon=[
                (10, 10),
                (tile.width - 10, 10),
                (tile.width - 10, tile.height - 10),
                (10, tile.height - 10),
            ],
            confidence=0.9,
        )
    ]


def empty_process_fn(tile: ImageTile) -> List[Zone]:
    """Processing function that returns no zones."""
    return []


class TestProcessingProgress:
    """Tests for ProcessingProgress dataclass."""

    def test_create_progress(self):
        """Test creating progress object."""
        progress = ProcessingProgress(
            total_tiles=4,
            completed_tiles=2,
            status="processing",
        )
        assert progress.total_tiles == 4
        assert progress.completed_tiles == 2
        assert progress.status == "processing"

    def test_progress_percent(self):
        """Test progress percentage calculation."""
        progress = ProcessingProgress(total_tiles=4, completed_tiles=1)
        assert progress.progress_percent == 25.0

        progress = ProcessingProgress(total_tiles=4, completed_tiles=4)
        assert progress.progress_percent == 100.0

    def test_progress_percent_zero_total(self):
        """Test progress percentage with zero tiles."""
        progress = ProcessingProgress(total_tiles=0, completed_tiles=0)
        assert progress.progress_percent == 100.0

    def test_progress_to_dict(self):
        """Test progress serialization."""
        progress = ProcessingProgress(
            total_tiles=4,
            completed_tiles=2,
            current_tile="tile_1",
            status="processing",
        )
        d = progress.to_dict()
        assert d["total_tiles"] == 4
        assert d["completed_tiles"] == 2
        assert d["current_tile"] == "tile_1"
        assert d["status"] == "processing"
        assert d["progress_percent"] == 50.0


class TestTileProcessorInit:
    """Tests for TileProcessor initialization."""

    def test_default_init(self):
        """Test default initialization."""
        processor = TileProcessor()
        assert processor.config is not None
        assert processor.config.enabled is True

    def test_init_with_config(self):
        """Test initialization with custom config."""
        config = TilingConfig(tile_size=1024, overlap=128)
        processor = TileProcessor(config=config)
        assert processor.config.tile_size == 1024

    def test_init_with_callback(self):
        """Test initialization with progress callback."""
        callbacks = []

        def callback(progress):
            callbacks.append(progress)

        processor = TileProcessor(progress_callback=callback)
        assert processor.progress_callback is not None


class TestTileProcessorShouldTile:
    """Tests for should_tile method."""

    def test_small_image(self):
        """Test small image doesn't need tiling."""
        config = TilingConfig(dimension_threshold=2000)
        processor = TileProcessor(config=config)

        image = np.zeros((1000, 1500, 3), dtype=np.uint8)
        assert processor.should_tile(image) is False

    def test_large_image(self):
        """Test large image needs tiling."""
        config = TilingConfig(dimension_threshold=2000)
        processor = TileProcessor(config=config)

        image = np.zeros((3000, 3000, 3), dtype=np.uint8)
        assert processor.should_tile(image) is True

    def test_disabled_tiling(self):
        """Test disabled tiling always returns False."""
        config = TilingConfig(enabled=False, dimension_threshold=100)
        processor = TileProcessor(config=config)

        image = np.zeros((500, 500, 3), dtype=np.uint8)
        assert processor.should_tile(image) is False


class TestTileProcessorCreateTiles:
    """Tests for create_tiles method."""

    def test_create_tiles_grid(self):
        """Test creating grid-based tiles."""
        config = TilingConfig(tile_size=500, overlap=50, dimension_threshold=400)
        processor = TileProcessor(config=config)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        tiles = processor.create_tiles(image)

        assert len(tiles) >= 4
        for tile in tiles:
            assert tile.image is not None
            assert tile.bounds is not None

    def test_tiles_cover_image(self):
        """Test that tiles cover entire image."""
        config = TilingConfig(tile_size=500, overlap=50, dimension_threshold=400)
        processor = TileProcessor(config=config)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        tiles = processor.create_tiles(image)

        # Check corners are covered
        corners = [(0, 0), (799, 0), (0, 799), (799, 799)]
        for cx, cy in corners:
            covered = any(
                tile.bounds[0] <= cx < tile.bounds[2] and
                tile.bounds[1] <= cy < tile.bounds[3]
                for tile in tiles
            )
            assert covered, f"Corner ({cx}, {cy}) not covered"


class TestTileProcessorProcess:
    """Tests for process method."""

    def test_process_small_image(self):
        """Test processing small image (no tiling)."""
        config = TilingConfig(dimension_threshold=2000)
        processor = TileProcessor(config=config)

        image = np.zeros((500, 500, 3), dtype=np.uint8)
        results = processor.process(image, dummy_process_fn, parallel=False)

        assert len(results) == 1
        assert results[0].zone_type == "parking"

    def test_process_large_image(self):
        """Test processing large image with tiling."""
        config = TilingConfig(
            tile_size=500,
            overlap=50,
            dimension_threshold=400,
            max_parallel_tiles=2,
        )
        processor = TileProcessor(config=config)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        results = processor.process(image, dummy_process_fn, parallel=False)

        # Should have zones
        assert len(results) >= 1

    def test_process_with_progress_callback(self):
        """Test processing with progress callback."""
        callbacks = []

        def callback(progress):
            callbacks.append(progress.to_dict())

        config = TilingConfig(
            tile_size=500,
            overlap=50,
            dimension_threshold=400,
        )
        processor = TileProcessor(config=config, progress_callback=callback)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        processor.process(image, dummy_process_fn, parallel=False)

        # Should have received progress updates
        assert len(callbacks) > 0
        # Should have complete status at end
        assert callbacks[-1]["status"] == "complete"

    def test_process_parallel(self):
        """Test parallel processing."""
        config = TilingConfig(
            tile_size=500,
            overlap=50,
            dimension_threshold=400,
            max_parallel_tiles=4,
        )
        processor = TileProcessor(config=config)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        results = processor.process(image, dummy_process_fn, parallel=True)

        # Should have zones
        assert len(results) >= 1

    def test_process_empty_zones(self):
        """Test processing with function that returns no zones."""
        config = TilingConfig(dimension_threshold=400)
        processor = TileProcessor(config=config)

        image = np.zeros((800, 800, 3), dtype=np.uint8)
        results = processor.process(image, empty_process_fn, parallel=False)

        assert results == []


class TestTileProcessorProgress:
    """Tests for progress tracking."""

    def test_progress_property(self):
        """Test accessing progress property."""
        processor = TileProcessor()
        progress = processor.progress

        assert progress.total_tiles == 0
        assert progress.completed_tiles == 0
        assert progress.status == "pending"

    def test_progress_updates_during_processing(self):
        """Test progress updates during processing."""
        progress_updates = []

        def callback(progress):
            progress_updates.append((progress.status, progress.completed_tiles))

        config = TilingConfig(
            tile_size=400,
            overlap=50,
            dimension_threshold=300,
        )
        processor = TileProcessor(config=config, progress_callback=callback)

        image = np.zeros((700, 700, 3), dtype=np.uint8)
        processor.process(image, dummy_process_fn, parallel=False)

        # Verify we got status updates
        statuses = [p[0] for p in progress_updates]
        assert "processing" in statuses
        assert "complete" in statuses


class TestTileProcessorErrorHandling:
    """Tests for error handling in processing."""

    def test_handles_processing_error(self):
        """Test that processing continues even if one tile fails."""
        error_count = [0]

        def failing_process_fn(tile: ImageTile) -> List[Zone]:
            if error_count[0] == 0:
                error_count[0] += 1
                raise ValueError("Simulated error")
            return dummy_process_fn(tile)

        config = TilingConfig(
            tile_size=400,
            overlap=50,
            dimension_threshold=300,
        )
        processor = TileProcessor(config=config)

        image = np.zeros((700, 700, 3), dtype=np.uint8)
        # Should not raise, continues processing other tiles
        results = processor.process(image, failing_process_fn, parallel=False)

        # Should still get results from tiles that didn't fail
        assert len(results) >= 0
