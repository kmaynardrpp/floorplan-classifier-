"""
HSV Color Range Configuration for boundary detection.

Task 1.2: Implement HSV Color Range Configuration
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Tuple
import numpy as np


@dataclass
class ColorRange:
    """
    Defines HSV color range bounds for detection.

    HSV ranges for OpenCV:
    - Hue: 0-180 (not 0-360)
    - Saturation: 0-255
    - Value: 0-255
    """
    lower: Tuple[int, int, int]  # (H, S, V) lower bound
    upper: Tuple[int, int, int]  # (H, S, V) upper bound

    def __post_init__(self):
        """Validate HSV ranges."""
        self._validate()

    def _validate(self):
        """Validate that HSV values are within valid ranges."""
        # Validate lower bounds
        if not (0 <= self.lower[0] <= 180):
            raise ValueError(f"Lower hue must be 0-180, got {self.lower[0]}")
        if not (0 <= self.lower[1] <= 255):
            raise ValueError(f"Lower saturation must be 0-255, got {self.lower[1]}")
        if not (0 <= self.lower[2] <= 255):
            raise ValueError(f"Lower value must be 0-255, got {self.lower[2]}")

        # Validate upper bounds
        if not (0 <= self.upper[0] <= 180):
            raise ValueError(f"Upper hue must be 0-180, got {self.upper[0]}")
        if not (0 <= self.upper[1] <= 255):
            raise ValueError(f"Upper saturation must be 0-255, got {self.upper[1]}")
        if not (0 <= self.upper[2] <= 255):
            raise ValueError(f"Upper value must be 0-255, got {self.upper[2]}")

    def to_numpy(self) -> Tuple[np.ndarray, np.ndarray]:
        """Convert to numpy arrays for cv2.inRange."""
        return (
            np.array(self.lower, dtype=np.uint8),
            np.array(self.upper, dtype=np.uint8),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "lower": {"h": self.lower[0], "s": self.lower[1], "v": self.lower[2]},
            "upper": {"h": self.upper[0], "s": self.upper[1], "v": self.upper[2]},
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ColorRange":
        """Create from dictionary."""
        lower = (data["lower"]["h"], data["lower"]["s"], data["lower"]["v"])
        upper = (data["upper"]["h"], data["upper"]["s"], data["upper"]["v"])
        return cls(lower=lower, upper=upper)


# Default color ranges matching the spec (IMP-01)
DEFAULT_COLOR_RANGES: Dict[str, ColorRange] = {
    "orange": ColorRange(
        lower=(10, 100, 100),
        upper=(25, 255, 255),
    ),
    "yellow": ColorRange(
        lower=(25, 100, 100),
        upper=(35, 255, 255),
    ),
    "red_low": ColorRange(
        lower=(0, 100, 100),
        upper=(10, 255, 255),
    ),
    "red_high": ColorRange(
        lower=(160, 100, 100),
        upper=(180, 255, 255),
    ),
    "blue": ColorRange(
        lower=(100, 100, 100),
        upper=(130, 255, 255),
    ),
}


@dataclass
class ColorRangeConfig:
    """
    Configuration for color boundary detection.

    Allows customization of color ranges and detection parameters.
    """
    color_ranges: Dict[str, ColorRange] = field(default_factory=lambda: DEFAULT_COLOR_RANGES.copy())
    min_contour_area: int = 1000  # Minimum area in pixels to keep

    def __post_init__(self):
        """Validate configuration."""
        if self.min_contour_area < 0:
            raise ValueError(f"min_contour_area must be >= 0, got {self.min_contour_area}")

    def get_range(self, color_name: str) -> Optional[ColorRange]:
        """Get color range by name."""
        return self.color_ranges.get(color_name)

    def add_range(self, name: str, color_range: ColorRange):
        """Add a new color range."""
        self.color_ranges[name] = color_range

    def remove_range(self, name: str):
        """Remove a color range by name."""
        if name in self.color_ranges:
            del self.color_ranges[name]

    def get_red_ranges(self) -> Tuple[Optional[ColorRange], Optional[ColorRange]]:
        """
        Get the red color ranges (handles hue wrap-around).

        Red wraps around the hue circle at 0/180, so we need two ranges.
        """
        return (
            self.color_ranges.get("red_low"),
            self.color_ranges.get("red_high"),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "color_ranges": {
                name: cr.to_dict() for name, cr in self.color_ranges.items()
            },
            "min_contour_area": self.min_contour_area,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ColorRangeConfig":
        """Create from dictionary (e.g., from YAML config)."""
        color_ranges = {}
        for name, range_data in data.get("color_ranges", {}).items():
            color_ranges[name] = ColorRange.from_dict(range_data)

        return cls(
            color_ranges=color_ranges if color_ranges else DEFAULT_COLOR_RANGES.copy(),
            min_contour_area=data.get("min_contour_area", 1000),
        )

    @classmethod
    def from_yaml(cls, yaml_path: str) -> "ColorRangeConfig":
        """Load configuration from YAML file."""
        import yaml

        with open(yaml_path, "r") as f:
            data = yaml.safe_load(f)

        return cls.from_dict(data.get("phase0_color_detection", data))

    @classmethod
    def default(cls) -> "ColorRangeConfig":
        """Create default configuration."""
        return cls(
            color_ranges=DEFAULT_COLOR_RANGES.copy(),
            min_contour_area=1000,
        )
