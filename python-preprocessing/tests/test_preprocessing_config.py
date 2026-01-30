"""
Tests for PreprocessingConfig with Phase 0 integration.

Task 2.4: Integrate Phase 0 into PreprocessingConfig
"""

import pytest
import json

from src.pipeline import PreprocessingConfig
from src.config.phase0_config import Phase0Config


class TestPreprocessingConfigWithPhase0:
    """Tests for PreprocessingConfig Phase 0 integration."""

    def test_default_config_includes_phase0(self):
        """Test that default PreprocessingConfig includes Phase0Config."""
        config = PreprocessingConfig()

        assert hasattr(config, "phase0_config")
        assert isinstance(config.phase0_config, Phase0Config)

    def test_default_phase0_is_enabled(self):
        """Test that Phase 0 is enabled by default."""
        config = PreprocessingConfig()

        assert config.phase0_config.enabled is True

    def test_default_phase0_threshold(self):
        """Test that Phase 0 has expected default threshold."""
        config = PreprocessingConfig()

        assert config.phase0_config.fast_track_threshold == 0.8

    def test_custom_phase0_config(self):
        """Test that custom Phase0Config can be provided."""
        custom_phase0 = Phase0Config(
            enabled=False,
            fast_track_threshold=0.9,
        )
        config = PreprocessingConfig(phase0_config=custom_phase0)

        assert config.phase0_config.enabled is False
        assert config.phase0_config.fast_track_threshold == 0.9

    def test_config_preserves_other_defaults(self):
        """Test that Phase 0 doesn't affect other config defaults."""
        config = PreprocessingConfig()

        assert config.use_color_detection is True
        assert config.use_canny is True
        assert config.density_window == 50
        assert config.min_region_area == 5000
        assert config.min_line_length == 30
        assert config.line_cluster_distance == 100.0

    def test_disabled_phase0_config(self):
        """Test creating config with disabled Phase 0."""
        config = PreprocessingConfig(phase0_config=Phase0Config.disabled())

        assert config.phase0_config.enabled is False
