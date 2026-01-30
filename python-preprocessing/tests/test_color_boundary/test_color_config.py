"""
Tests for color range configuration.

Task 1.2: Implement HSV Color Range Configuration
"""

import pytest
import tempfile
import os

from src.color_boundary.color_config import (
    ColorRange,
    ColorRangeConfig,
    DEFAULT_COLOR_RANGES,
)


class TestColorRange:
    """Tests for ColorRange dataclass."""

    def test_create_valid_color_range(self):
        """Test creating a valid color range."""
        cr = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )
        assert cr.lower == (10, 100, 100)
        assert cr.upper == (25, 255, 255)

    def test_invalid_hue_over_180_raises_error(self):
        """Test that hue > 180 raises ValueError."""
        with pytest.raises(ValueError, match="hue must be 0-180"):
            ColorRange(
                lower=(200, 100, 100),  # Invalid: hue > 180
                upper=(220, 255, 255),
            )

    def test_invalid_saturation_over_255_raises_error(self):
        """Test that saturation > 255 raises ValueError."""
        with pytest.raises(ValueError, match="saturation must be 0-255"):
            ColorRange(
                lower=(10, 300, 100),  # Invalid: saturation > 255
                upper=(25, 255, 255),
            )

    def test_invalid_value_over_255_raises_error(self):
        """Test that value > 255 raises ValueError."""
        with pytest.raises(ValueError, match="value must be 0-255"):
            ColorRange(
                lower=(10, 100, 100),
                upper=(25, 255, 300),  # Invalid: value > 255
            )

    def test_invalid_negative_value_raises_error(self):
        """Test that negative values raise ValueError."""
        with pytest.raises(ValueError):
            ColorRange(
                lower=(-10, 100, 100),  # Invalid: negative hue
                upper=(25, 255, 255),
            )

    def test_to_numpy_returns_correct_arrays(self):
        """Test conversion to numpy arrays."""
        cr = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )
        lower, upper = cr.to_numpy()

        assert lower.dtype.name == "uint8"
        assert upper.dtype.name == "uint8"
        assert list(lower) == [10, 100, 100]
        assert list(upper) == [25, 255, 255]

    def test_to_dict_and_from_dict_roundtrip(self):
        """Test serialization roundtrip."""
        original = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )

        data = original.to_dict()
        restored = ColorRange.from_dict(data)

        assert restored.lower == original.lower
        assert restored.upper == original.upper


class TestDefaultColorRanges:
    """Tests for default color range presets."""

    def test_default_ranges_include_orange(self):
        """Test that default ranges include orange."""
        assert "orange" in DEFAULT_COLOR_RANGES
        orange = DEFAULT_COLOR_RANGES["orange"]
        # Orange hue is around 10-25
        assert orange.lower[0] >= 5
        assert orange.upper[0] <= 30

    def test_default_ranges_include_yellow(self):
        """Test that default ranges include yellow."""
        assert "yellow" in DEFAULT_COLOR_RANGES
        yellow = DEFAULT_COLOR_RANGES["yellow"]
        # Yellow hue is around 25-35
        assert yellow.lower[0] >= 20
        assert yellow.upper[0] <= 45

    def test_default_ranges_include_red_low_and_high(self):
        """Test that default ranges include both red ranges for wrap-around."""
        assert "red_low" in DEFAULT_COLOR_RANGES
        assert "red_high" in DEFAULT_COLOR_RANGES

        red_low = DEFAULT_COLOR_RANGES["red_low"]
        red_high = DEFAULT_COLOR_RANGES["red_high"]

        # Red wraps around: 0-10 and 160-180
        assert red_low.upper[0] <= 15
        assert red_high.lower[0] >= 155

    def test_default_ranges_include_blue(self):
        """Test that default ranges include blue."""
        assert "blue" in DEFAULT_COLOR_RANGES
        blue = DEFAULT_COLOR_RANGES["blue"]
        # Blue hue is around 100-130
        assert blue.lower[0] >= 90
        assert blue.upper[0] <= 140

    def test_all_default_ranges_are_valid(self):
        """Test that all default ranges have valid HSV values."""
        for name, cr in DEFAULT_COLOR_RANGES.items():
            # If we got here without exception, the range is valid
            assert cr.lower[0] <= 180
            assert cr.upper[0] <= 180
            assert cr.lower[1] <= 255
            assert cr.upper[1] <= 255


class TestColorRangeConfig:
    """Tests for ColorRangeConfig class."""

    def test_default_config_has_expected_values(self):
        """Test that default config matches spec."""
        config = ColorRangeConfig.default()

        assert "orange" in config.color_ranges
        assert "yellow" in config.color_ranges
        assert "red_low" in config.color_ranges
        assert "red_high" in config.color_ranges
        assert "blue" in config.color_ranges
        assert config.min_contour_area == 1000

    def test_get_range_returns_correct_range(self):
        """Test getting a specific color range."""
        config = ColorRangeConfig.default()

        orange = config.get_range("orange")
        assert orange is not None
        assert orange.lower[0] == 10

        nonexistent = config.get_range("purple")
        assert nonexistent is None

    def test_add_range_creates_new_range(self):
        """Test adding a custom color range."""
        config = ColorRangeConfig.default()

        green_range = ColorRange(
            lower=(35, 100, 100),
            upper=(85, 255, 255),
        )
        config.add_range("green", green_range)

        assert "green" in config.color_ranges
        assert config.get_range("green") == green_range

    def test_remove_range_removes_range(self):
        """Test removing a color range."""
        config = ColorRangeConfig.default()

        assert "orange" in config.color_ranges
        config.remove_range("orange")
        assert "orange" not in config.color_ranges

    def test_get_red_ranges_returns_both(self):
        """Test getting both red ranges for wrap-around handling."""
        config = ColorRangeConfig.default()

        red_low, red_high = config.get_red_ranges()

        assert red_low is not None
        assert red_high is not None
        assert red_low.upper[0] <= 15
        assert red_high.lower[0] >= 155

    def test_to_dict_and_from_dict_roundtrip(self):
        """Test configuration serialization roundtrip."""
        original = ColorRangeConfig.default()
        original.min_contour_area = 2000

        data = original.to_dict()
        restored = ColorRangeConfig.from_dict(data)

        assert restored.min_contour_area == 2000
        assert len(restored.color_ranges) == len(original.color_ranges)
        assert "orange" in restored.color_ranges

    def test_from_yaml_loads_config(self):
        """Test loading configuration from YAML file."""
        yaml_content = """
phase0_color_detection:
  color_ranges:
    custom_orange:
      lower:
        h: 10
        s: 100
        v: 100
      upper:
        h: 20
        s: 255
        v: 255
  min_contour_area: 500
"""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            f.write(yaml_content)
            yaml_path = f.name

        try:
            config = ColorRangeConfig.from_yaml(yaml_path)

            assert "custom_orange" in config.color_ranges
            assert config.min_contour_area == 500
            assert config.color_ranges["custom_orange"].lower == (10, 100, 100)
        finally:
            os.unlink(yaml_path)

    def test_invalid_min_contour_area_raises_error(self):
        """Test that negative min_contour_area raises error."""
        with pytest.raises(ValueError, match="min_contour_area must be >= 0"):
            ColorRangeConfig(min_contour_area=-100)
