"""
Tests for Phase 0 Configuration.

Task 2.1: Define Fast-Track Threshold Configuration
"""

import pytest
import tempfile
import os

from src.config.phase0_config import Phase0Config, MorphologySettings


class TestMorphologySettings:
    """Tests for MorphologySettings dataclass."""

    def test_default_values(self):
        """Test default morphology settings."""
        settings = MorphologySettings()

        assert settings.kernel_size == 3
        assert settings.close_iterations == 2
        assert settings.open_iterations == 1

    def test_custom_values(self):
        """Test custom morphology settings."""
        settings = MorphologySettings(
            kernel_size=5,
            close_iterations=3,
            open_iterations=2,
        )

        assert settings.kernel_size == 5
        assert settings.close_iterations == 3
        assert settings.open_iterations == 2

    def test_invalid_kernel_size(self):
        """Test that invalid kernel size raises ValueError."""
        with pytest.raises(ValueError, match="kernel_size must be >= 1"):
            MorphologySettings(kernel_size=0)

    def test_invalid_close_iterations(self):
        """Test that invalid close_iterations raises ValueError."""
        with pytest.raises(ValueError, match="close_iterations must be >= 0"):
            MorphologySettings(close_iterations=-1)

    def test_invalid_open_iterations(self):
        """Test that invalid open_iterations raises ValueError."""
        with pytest.raises(ValueError, match="open_iterations must be >= 0"):
            MorphologySettings(open_iterations=-1)

    def test_to_dict(self):
        """Test serialization to dictionary."""
        settings = MorphologySettings(kernel_size=5, close_iterations=3, open_iterations=2)
        result = settings.to_dict()

        assert result == {
            "kernel_size": 5,
            "close_iterations": 3,
            "open_iterations": 2,
        }

    def test_from_dict(self):
        """Test deserialization from dictionary."""
        data = {"kernel_size": 7, "close_iterations": 4, "open_iterations": 3}
        settings = MorphologySettings.from_dict(data)

        assert settings.kernel_size == 7
        assert settings.close_iterations == 4
        assert settings.open_iterations == 3


class TestPhase0Config:
    """Tests for Phase0Config dataclass."""

    def test_default_values(self):
        """Test default Phase0 configuration values."""
        config = Phase0Config()

        assert config.enabled is True
        assert config.fast_track_threshold == 0.8
        assert config.min_boundaries_for_fast_track == 3
        assert config.require_closed_regions is True
        assert config.color_ranges is None
        assert config.min_contour_area == 1000
        assert isinstance(config.morphology_settings, MorphologySettings)

    def test_default_factory(self):
        """Test Phase0Config.default() creates expected config."""
        config = Phase0Config.default()

        assert config.enabled is True
        assert config.fast_track_threshold == 0.8

    def test_disabled_factory(self):
        """Test Phase0Config.disabled() creates disabled config."""
        config = Phase0Config.disabled()

        assert config.enabled is False

    def test_custom_values(self):
        """Test Phase0 configuration with custom values."""
        config = Phase0Config(
            enabled=True,
            fast_track_threshold=0.9,
            min_boundaries_for_fast_track=5,
            require_closed_regions=False,
            min_contour_area=500,
        )

        assert config.fast_track_threshold == 0.9
        assert config.min_boundaries_for_fast_track == 5
        assert config.require_closed_regions is False
        assert config.min_contour_area == 500

    def test_invalid_threshold_too_high(self):
        """Test that threshold > 1.0 raises validation error."""
        with pytest.raises(ValueError, match="fast_track_threshold must be between 0.0 and 1.0"):
            Phase0Config(fast_track_threshold=1.5)

    def test_invalid_threshold_too_low(self):
        """Test that threshold < 0.0 raises validation error."""
        with pytest.raises(ValueError, match="fast_track_threshold must be between 0.0 and 1.0"):
            Phase0Config(fast_track_threshold=-0.1)

    def test_valid_threshold_boundary_values(self):
        """Test that boundary values (0.0 and 1.0) are valid."""
        config_zero = Phase0Config(fast_track_threshold=0.0)
        assert config_zero.fast_track_threshold == 0.0

        config_one = Phase0Config(fast_track_threshold=1.0)
        assert config_one.fast_track_threshold == 1.0

    def test_invalid_min_boundaries(self):
        """Test that min_boundaries < 1 raises validation error."""
        with pytest.raises(ValueError, match="min_boundaries_for_fast_track must be >= 1"):
            Phase0Config(min_boundaries_for_fast_track=0)

    def test_invalid_min_contour_area(self):
        """Test that min_contour_area < 0 raises validation error."""
        with pytest.raises(ValueError, match="min_contour_area must be >= 0"):
            Phase0Config(min_contour_area=-100)

    def test_to_dict(self):
        """Test serialization to dictionary."""
        config = Phase0Config(
            enabled=True,
            fast_track_threshold=0.85,
            min_boundaries_for_fast_track=4,
            require_closed_regions=True,
            min_contour_area=500,
        )
        result = config.to_dict()

        assert result["enabled"] is True
        assert result["fast_track_threshold"] == 0.85
        assert result["min_boundaries_for_fast_track"] == 4
        assert result["require_closed_regions"] is True
        assert result["min_contour_area"] == 500
        assert "morphology_settings" in result
        assert "color_ranges" not in result  # None values not included

    def test_to_dict_with_color_ranges(self):
        """Test serialization includes color_ranges when provided."""
        config = Phase0Config(
            color_ranges={"orange": {"lower": [10, 100, 100], "upper": [25, 255, 255]}}
        )
        result = config.to_dict()

        assert "color_ranges" in result
        assert "orange" in result["color_ranges"]

    def test_from_dict(self):
        """Test deserialization from dictionary."""
        data = {
            "enabled": False,
            "fast_track_threshold": 0.75,
            "min_boundaries_for_fast_track": 2,
            "require_closed_regions": False,
            "min_contour_area": 2000,
            "morphology_settings": {
                "kernel_size": 5,
                "close_iterations": 3,
                "open_iterations": 2,
            },
        }
        config = Phase0Config.from_dict(data)

        assert config.enabled is False
        assert config.fast_track_threshold == 0.75
        assert config.min_boundaries_for_fast_track == 2
        assert config.require_closed_regions is False
        assert config.min_contour_area == 2000
        assert config.morphology_settings.kernel_size == 5

    def test_from_dict_defaults(self):
        """Test that from_dict uses defaults for missing fields."""
        data = {}
        config = Phase0Config.from_dict(data)

        assert config.enabled is True
        assert config.fast_track_threshold == 0.8
        assert config.min_boundaries_for_fast_track == 3

    def test_from_yaml(self):
        """Test loading configuration from YAML file."""
        yaml_content = """
phase0:
  enabled: true
  fast_track_threshold: 0.9
  min_boundaries_for_fast_track: 5
  require_closed_regions: true
  min_contour_area: 750
  morphology_settings:
    kernel_size: 5
    close_iterations: 2
    open_iterations: 1
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            yaml_path = f.name

        try:
            config = Phase0Config.from_yaml(yaml_path)

            assert config.enabled is True
            assert config.fast_track_threshold == 0.9
            assert config.min_boundaries_for_fast_track == 5
            assert config.min_contour_area == 750
            assert config.morphology_settings.kernel_size == 5
        finally:
            os.unlink(yaml_path)

    def test_from_yaml_overrides_defaults(self):
        """Test that YAML loading overrides defaults correctly."""
        yaml_content = """
phase0:
  fast_track_threshold: 0.6
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            yaml_path = f.name

        try:
            config = Phase0Config.from_yaml(yaml_path)

            # Overridden value
            assert config.fast_track_threshold == 0.6
            # Default values
            assert config.enabled is True
            assert config.min_boundaries_for_fast_track == 3
        finally:
            os.unlink(yaml_path)


class TestFastTrackEligibility:
    """Tests for fast-track eligibility checking."""

    def test_eligible_when_thresholds_met(self):
        """Test eligibility when all thresholds are met."""
        config = Phase0Config(
            fast_track_threshold=0.8,
            min_boundaries_for_fast_track=3,
        )

        assert config.is_fast_track_eligible(coverage_ratio=0.85, boundary_count=5) is True

    def test_not_eligible_when_disabled(self):
        """Test not eligible when Phase 0 is disabled."""
        config = Phase0Config.disabled()

        assert config.is_fast_track_eligible(coverage_ratio=0.95, boundary_count=10) is False

    def test_not_eligible_coverage_too_low(self):
        """Test not eligible when coverage is below threshold."""
        config = Phase0Config(fast_track_threshold=0.8)

        assert config.is_fast_track_eligible(coverage_ratio=0.5, boundary_count=10) is False

    def test_not_eligible_boundary_count_too_low(self):
        """Test not eligible when boundary count is below minimum."""
        config = Phase0Config(min_boundaries_for_fast_track=3)

        assert config.is_fast_track_eligible(coverage_ratio=0.9, boundary_count=2) is False

    def test_eligible_at_exact_thresholds(self):
        """Test eligibility at exact threshold values."""
        config = Phase0Config(
            fast_track_threshold=0.8,
            min_boundaries_for_fast_track=3,
        )

        assert config.is_fast_track_eligible(coverage_ratio=0.8, boundary_count=3) is True

    def test_not_eligible_just_below_coverage(self):
        """Test not eligible just below coverage threshold."""
        config = Phase0Config(fast_track_threshold=0.8)

        assert config.is_fast_track_eligible(coverage_ratio=0.799, boundary_count=5) is False

    def test_not_eligible_just_below_boundary_count(self):
        """Test not eligible just below minimum boundary count."""
        config = Phase0Config(min_boundaries_for_fast_track=3)

        assert config.is_fast_track_eligible(coverage_ratio=0.9, boundary_count=2) is False
