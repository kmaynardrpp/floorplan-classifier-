"""Tests for tiling models."""

import numpy as np
import pytest

from src.tiling.models import (
    ImageTile,
    OverlapRegion,
    TileZoneResult,
    TilingConfig,
    Zone,
)


class TestOverlapRegion:
    """Tests for OverlapRegion dataclass."""

    def test_create_overlap_region(self):
        """Test creating an overlap region."""
        overlap = OverlapRegion(
            adjacent_tile_id="tile_1",
            region=(0, 0, 100, 100),
        )
        assert overlap.adjacent_tile_id == "tile_1"
        assert overlap.region == (0, 0, 100, 100)

    def test_overlap_region_to_dict(self):
        """Test serialization to dict."""
        overlap = OverlapRegion(
            adjacent_tile_id="tile_2",
            region=(10, 20, 110, 120),
        )
        d = overlap.to_dict()
        assert d["adjacent_tile_id"] == "tile_2"
        # Region is serialized as a dict
        assert d["region"]["x1"] == 10
        assert d["region"]["y1"] == 20
        assert d["region"]["x2"] == 110
        assert d["region"]["y2"] == 120


class TestImageTile:
    """Tests for ImageTile dataclass."""

    def test_create_image_tile(self):
        """Test creating an image tile."""
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        tile = ImageTile(
            id="tile_0",
            image=image,
            bounds=(0, 0, 100, 100),
            overlap_regions=[],
        )
        assert tile.id == "tile_0"
        assert tile.bounds == (0, 0, 100, 100)
        assert len(tile.overlap_regions) == 0

    def test_image_tile_dimensions(self):
        """Test width and height properties."""
        image = np.zeros((200, 300, 3), dtype=np.uint8)
        tile = ImageTile(
            id="tile_1",
            image=image,
            bounds=(100, 50, 400, 250),
            overlap_regions=[],
        )
        assert tile.width == 300  # 400 - 100
        assert tile.height == 200  # 250 - 50

    def test_image_tile_with_overlaps(self):
        """Test tile with overlap regions."""
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        overlaps = [
            OverlapRegion("tile_1", (80, 0, 100, 100)),
            OverlapRegion("tile_2", (0, 80, 100, 100)),
        ]
        tile = ImageTile(
            id="tile_0",
            image=image,
            bounds=(0, 0, 100, 100),
            overlap_regions=overlaps,
        )
        assert len(tile.overlap_regions) == 2
        assert tile.overlap_regions[0].adjacent_tile_id == "tile_1"

    def test_image_tile_to_dict(self):
        """Test serialization (without image data)."""
        image = np.zeros((50, 50, 3), dtype=np.uint8)
        tile = ImageTile(
            id="tile_0",
            image=image,
            bounds=(0, 0, 50, 50),
            overlap_regions=[OverlapRegion("tile_1", (40, 0, 50, 50))],
        )
        d = tile.to_dict()
        assert d["id"] == "tile_0"
        # Bounds serialized as dict
        assert d["bounds"]["x1"] == 0
        assert d["bounds"]["x2"] == 50
        assert "image" not in d  # Image should not be serialized
        assert len(d["overlap_regions"]) == 1


class TestTileZoneResult:
    """Tests for TileZoneResult dataclass."""

    def test_create_tile_zone_result(self):
        """Test creating a tile zone result."""
        zone = Zone(
            id="zone_0",
            zone_type="parking",
            polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
        )
        result = TileZoneResult(
            tile_id="tile_0",
            zones=[zone],
            bounds=(0, 0, 200, 200),
        )
        assert result.tile_id == "tile_0"
        assert len(result.zones) == 1
        assert result.bounds == (0, 0, 200, 200)

    def test_tile_zone_result_to_dict(self):
        """Test serialization to dict."""
        zone = Zone(id="z1", zone_type="aisle", polygon=[(0, 0), (10, 10)])
        result = TileZoneResult(
            tile_id="tile_1",
            zones=[zone],
            bounds=(100, 100, 300, 300),
        )
        d = result.to_dict()
        assert d["tile_id"] == "tile_1"
        assert len(d["zones"]) == 1
        assert d["zones"][0]["zone_type"] == "aisle"
        assert d["bounds"]["x1"] == 100
        assert d["bounds"]["x2"] == 300


class TestTilingConfig:
    """Tests for TilingConfig dataclass."""

    def test_default_config(self):
        """Test default configuration values."""
        config = TilingConfig()
        assert config.tile_size == 2048
        assert config.overlap == 256
        assert config.dimension_threshold == 4000
        assert config.enabled is True
        assert config.smart_boundaries is True
        assert config.merge_iou_threshold == 0.3
        assert config.max_parallel_tiles == 4

    def test_custom_config(self):
        """Test custom configuration."""
        config = TilingConfig(
            tile_size=1024,
            overlap=128,
            dimension_threshold=2000,
        )
        assert config.tile_size == 1024
        assert config.overlap == 128
        assert config.dimension_threshold == 2000

    def test_config_to_dict(self):
        """Test serialization to dict."""
        config = TilingConfig(tile_size=512, overlap=64, dimension_threshold=1000)
        d = config.to_dict()
        assert d["tile_size"] == 512
        assert d["overlap"] == 64
        assert d["dimension_threshold"] == 1000
        assert "enabled" in d
        assert "smart_boundaries" in d

    def test_config_from_dict(self):
        """Test deserialization from dict."""
        d = {"tile_size": 4096, "overlap": 512, "dimension_threshold": 8000}
        config = TilingConfig.from_dict(d)
        assert config.tile_size == 4096
        assert config.overlap == 512
        assert config.dimension_threshold == 8000

    def test_config_from_dict_partial(self):
        """Test deserialization with partial dict uses defaults."""
        d = {"tile_size": 1024}
        config = TilingConfig.from_dict(d)
        assert config.tile_size == 1024
        assert config.overlap == 256  # default
        assert config.dimension_threshold == 4000  # default

    def test_config_validation_overlap(self):
        """Test that overlap >= tile_size raises error."""
        with pytest.raises(ValueError, match="overlap.*must be < tile_size"):
            TilingConfig(tile_size=100, overlap=100)

    def test_config_validation_iou_threshold(self):
        """Test merge_iou_threshold validation."""
        with pytest.raises(ValueError, match="merge_iou_threshold"):
            TilingConfig(merge_iou_threshold=1.5)

    def test_config_validation_max_parallel(self):
        """Test max_parallel_tiles validation."""
        with pytest.raises(ValueError, match="max_parallel_tiles"):
            TilingConfig(max_parallel_tiles=0)
