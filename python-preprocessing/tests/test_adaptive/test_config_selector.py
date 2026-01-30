"""Tests for adaptive configuration selection."""

import pytest

from src.adaptive.decision_engine import ProcessingMode
from src.adaptive.config_selector import (
    ImageComplexity,
    AdaptiveConfig,
    ConfigSelector,
    estimate_complexity,
)


class TestImageComplexity:
    """Tests for ImageComplexity enum."""

    def test_complexity_values(self):
        """Test complexity enum values."""
        assert ImageComplexity.SIMPLE.value == "simple"
        assert ImageComplexity.MODERATE.value == "moderate"
        assert ImageComplexity.COMPLEX.value == "complex"


class TestAdaptiveConfig:
    """Tests for AdaptiveConfig dataclass."""

    def test_default_config(self):
        """Test default configuration."""
        config = AdaptiveConfig()
        assert config.processing_mode == ProcessingMode.STANDARD
        assert config.tile_enabled is False
        assert config.tile_size == 2048
        assert config.phase0_enabled is True

    def test_custom_config(self):
        """Test custom configuration."""
        config = AdaptiveConfig(
            processing_mode=ProcessingMode.TILED,
            tile_enabled=True,
            tile_size=1024,
        )
        assert config.processing_mode == ProcessingMode.TILED
        assert config.tile_size == 1024

    def test_config_to_dict(self):
        """Test serialization."""
        config = AdaptiveConfig(
            processing_mode=ProcessingMode.FAST_TRACK,
            fast_track_enabled=True,
        )
        d = config.to_dict()
        assert d["processing_mode"] == "fast_track"
        assert d["fast_track_enabled"] is True

    def test_config_from_dict(self):
        """Test deserialization."""
        d = {
            "processing_mode": "tiled",
            "tile_enabled": True,
            "tile_size": 1024,
            "min_zone_area": 500,
        }
        config = AdaptiveConfig.from_dict(d)
        assert config.processing_mode == ProcessingMode.TILED
        assert config.tile_enabled is True
        assert config.tile_size == 1024
        assert config.min_zone_area == 500

    def test_config_from_dict_defaults(self):
        """Test deserialization with defaults."""
        config = AdaptiveConfig.from_dict({})
        assert config.processing_mode == ProcessingMode.STANDARD
        assert config.tile_size == 2048


class TestConfigSelectorInit:
    """Tests for ConfigSelector initialization."""

    def test_default_init(self):
        """Test default initialization."""
        selector = ConfigSelector()
        assert selector.dimension_threshold == 4000
        assert selector.default_preset == "balanced"

    def test_custom_init(self):
        """Test custom initialization."""
        selector = ConfigSelector(
            dimension_threshold=3000,
            default_preset="fast",
        )
        assert selector.dimension_threshold == 3000


class TestConfigSelectorSelect:
    """Tests for select method."""

    @pytest.fixture
    def selector(self):
        return ConfigSelector()

    def test_select_default(self, selector):
        """Test selecting default config."""
        config = selector.select()
        assert isinstance(config, AdaptiveConfig)

    def test_select_by_preset(self, selector):
        """Test selecting by preset name."""
        config = selector.select(preset="fast")
        assert config.processing_mode == ProcessingMode.FAST_TRACK
        assert config.fast_track_enabled is True

    def test_select_large_image(self, selector):
        """Test selecting for large image."""
        config = selector.select(image_dimensions=(6000, 4000))
        assert config.tile_enabled is True
        assert config.processing_mode == ProcessingMode.TILED

    def test_select_very_large_image(self, selector):
        """Test selecting for very large image."""
        config = selector.select(image_dimensions=(10000, 8000))
        assert config.tile_enabled is True
        assert config.tile_overlap == 512  # Increased for very large

    def test_select_simple_complexity(self, selector):
        """Test selecting for simple complexity."""
        config = selector.select(complexity=ImageComplexity.SIMPLE)
        assert config.min_zone_area == 2000
        assert config.simplification_epsilon == 0.03

    def test_select_complex_complexity(self, selector):
        """Test selecting for complex complexity."""
        config = selector.select(complexity=ImageComplexity.COMPLEX)
        assert config.min_zone_area == 500
        assert config.simplification_epsilon == 0.01

    def test_select_fast_track_eligible(self, selector):
        """Test selecting when fast-track eligible."""
        config = selector.select(
            image_dimensions=(2000, 1500),
            fast_track_eligible=True,
        )
        assert config.fast_track_enabled is True
        assert config.processing_mode == ProcessingMode.FAST_TRACK

    def test_select_many_boundaries(self, selector):
        """Test selecting with many boundaries."""
        config = selector.select(boundary_count=60)
        assert config.merge_iou_threshold == 0.25  # Adjusted for complexity

    def test_select_few_boundaries(self, selector):
        """Test selecting with few boundaries."""
        config = selector.select(boundary_count=5)
        assert config.min_zone_area == 2000  # Simpler config

    def test_select_high_coverage(self, selector):
        """Test selecting with high coverage."""
        config = selector.select(coverage_ratio=0.6)
        assert config.fast_track_min_confidence == 0.6

    def test_select_low_coverage(self, selector):
        """Test selecting with low coverage."""
        config = selector.select(coverage_ratio=0.1)
        assert config.min_zone_area == 500  # More sensitive


class TestConfigSelectorForTile:
    """Tests for select_for_tile method."""

    @pytest.fixture
    def selector(self):
        return ConfigSelector()

    def test_select_for_tile_basic(self, selector):
        """Test selecting config for a tile."""
        parent_config = AdaptiveConfig(
            processing_mode=ProcessingMode.TILED,
            tile_enabled=True,
        )

        tile_config = selector.select_for_tile(0, parent_config)

        assert tile_config.tile_enabled is False
        assert tile_config.processing_mode == ProcessingMode.STANDARD

    def test_select_for_edge_tile(self, selector):
        """Test selecting config for edge tile."""
        parent_config = AdaptiveConfig(min_zone_area=1000)

        tile_config = selector.select_for_tile(
            0, parent_config,
            tile_characteristics={"edge_tile": True},
        )

        assert tile_config.min_zone_area == 500  # Reduced

    def test_select_for_high_density_tile(self, selector):
        """Test selecting config for high density tile."""
        parent_config = AdaptiveConfig(simplification_epsilon=0.02)

        tile_config = selector.select_for_tile(
            0, parent_config,
            tile_characteristics={"high_density": True},
        )

        assert tile_config.simplification_epsilon == 0.01  # Finer


class TestConfigSelectorPresets:
    """Tests for preset methods."""

    @pytest.fixture
    def selector(self):
        return ConfigSelector()

    def test_get_preset_exists(self, selector):
        """Test getting existing preset."""
        config = selector.get_preset("fast")
        assert config is not None
        assert config.fast_track_enabled is True

    def test_get_preset_not_exists(self, selector):
        """Test getting non-existent preset."""
        config = selector.get_preset("nonexistent")
        assert config is None

    def test_list_presets(self, selector):
        """Test listing presets."""
        presets = selector.list_presets()
        assert "fast" in presets
        assert "quality" in presets
        assert "large_image" in presets
        assert "balanced" in presets


class TestEstimateComplexity:
    """Tests for estimate_complexity function."""

    def test_estimate_simple(self):
        """Test estimating simple complexity."""
        complexity = estimate_complexity(
            boundary_count=10,
            coverage_ratio=0.5,
            closed_ratio=0.8,
        )
        assert complexity == ImageComplexity.SIMPLE

    def test_estimate_complex_many_boundaries(self):
        """Test estimating complex due to many boundaries."""
        complexity = estimate_complexity(
            boundary_count=50,
            coverage_ratio=0.5,
            closed_ratio=0.8,
        )
        assert complexity == ImageComplexity.COMPLEX

    def test_estimate_complex_low_coverage(self):
        """Test estimating complex due to low coverage."""
        complexity = estimate_complexity(
            boundary_count=10,
            coverage_ratio=0.1,
            closed_ratio=0.8,
        )
        assert complexity == ImageComplexity.COMPLEX

    def test_estimate_complex_low_closed(self):
        """Test estimating complex due to low closed ratio."""
        complexity = estimate_complexity(
            boundary_count=10,
            coverage_ratio=0.5,
            closed_ratio=0.2,
        )
        assert complexity == ImageComplexity.COMPLEX

    def test_estimate_moderate(self):
        """Test estimating moderate complexity."""
        complexity = estimate_complexity(
            boundary_count=25,
            coverage_ratio=0.35,
            closed_ratio=0.5,
        )
        assert complexity == ImageComplexity.MODERATE
