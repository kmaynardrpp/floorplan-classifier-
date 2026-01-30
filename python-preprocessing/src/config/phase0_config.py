"""
Phase 0 Configuration for color boundary detection and fast-track mode.

Task 2.1: Define Fast-Track Threshold Configuration
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class MorphologySettings:
    """Settings for morphological operations on masks."""
    kernel_size: int = 3
    close_iterations: int = 2
    open_iterations: int = 1

    def __post_init__(self):
        """Validate morphology settings."""
        if self.kernel_size < 1:
            raise ValueError(f"kernel_size must be >= 1, got {self.kernel_size}")
        if self.close_iterations < 0:
            raise ValueError(f"close_iterations must be >= 0, got {self.close_iterations}")
        if self.open_iterations < 0:
            raise ValueError(f"open_iterations must be >= 0, got {self.open_iterations}")

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "kernel_size": self.kernel_size,
            "close_iterations": self.close_iterations,
            "open_iterations": self.open_iterations,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MorphologySettings":
        """Create from dictionary."""
        return cls(
            kernel_size=data.get("kernel_size", 3),
            close_iterations=data.get("close_iterations", 2),
            open_iterations=data.get("open_iterations", 1),
        )


@dataclass
class Phase0Config:
    """
    Configuration for Phase 0 color boundary detection.

    Attributes:
        enabled: Whether Phase 0 is enabled
        fast_track_threshold: Coverage ratio to skip Phase 1 (0.0-1.0)
        min_boundaries_for_fast_track: Minimum number of detected boundaries to fast-track
        require_closed_regions: Whether boundaries must form closed regions for fast-track
        color_ranges: Override default color ranges (optional)
        morphology_settings: Settings for mask morphological operations
        min_contour_area: Minimum contour area in pixels to keep
    """
    enabled: bool = True
    fast_track_threshold: float = 0.8
    min_boundaries_for_fast_track: int = 3
    require_closed_regions: bool = True
    color_ranges: Optional[Dict[str, Any]] = None
    morphology_settings: MorphologySettings = field(default_factory=MorphologySettings)
    min_contour_area: int = 1000

    def __post_init__(self):
        """Validate configuration values."""
        self._validate()

    def _validate(self):
        """Validate all configuration values."""
        # Validate fast_track_threshold
        if not (0.0 <= self.fast_track_threshold <= 1.0):
            raise ValueError(
                f"fast_track_threshold must be between 0.0 and 1.0, got {self.fast_track_threshold}"
            )

        # Validate min_boundaries_for_fast_track
        if self.min_boundaries_for_fast_track < 1:
            raise ValueError(
                f"min_boundaries_for_fast_track must be >= 1, got {self.min_boundaries_for_fast_track}"
            )

        # Validate min_contour_area
        if self.min_contour_area < 0:
            raise ValueError(
                f"min_contour_area must be >= 0, got {self.min_contour_area}"
            )

        # Convert morphology_settings from dict if needed
        if isinstance(self.morphology_settings, dict):
            object.__setattr__(
                self,
                "morphology_settings",
                MorphologySettings.from_dict(self.morphology_settings),
            )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        result = {
            "enabled": self.enabled,
            "fast_track_threshold": self.fast_track_threshold,
            "min_boundaries_for_fast_track": self.min_boundaries_for_fast_track,
            "require_closed_regions": self.require_closed_regions,
            "min_contour_area": self.min_contour_area,
            "morphology_settings": self.morphology_settings.to_dict(),
        }
        if self.color_ranges is not None:
            result["color_ranges"] = self.color_ranges
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Phase0Config":
        """Create from dictionary (e.g., from YAML config)."""
        morph_data = data.get("morphology_settings", {})
        morph_settings = MorphologySettings.from_dict(morph_data) if morph_data else MorphologySettings()

        return cls(
            enabled=data.get("enabled", True),
            fast_track_threshold=data.get("fast_track_threshold", 0.8),
            min_boundaries_for_fast_track=data.get("min_boundaries_for_fast_track", 3),
            require_closed_regions=data.get("require_closed_regions", True),
            color_ranges=data.get("color_ranges"),
            morphology_settings=morph_settings,
            min_contour_area=data.get("min_contour_area", 1000),
        )

    @classmethod
    def from_yaml(cls, yaml_path: str) -> "Phase0Config":
        """Load configuration from YAML file."""
        import yaml

        with open(yaml_path, "r") as f:
            data = yaml.safe_load(f)

        return cls.from_dict(data.get("phase0", data))

    @classmethod
    def default(cls) -> "Phase0Config":
        """Create default configuration."""
        return cls()

    @classmethod
    def disabled(cls) -> "Phase0Config":
        """Create disabled configuration (for testing/bypass)."""
        return cls(enabled=False)

    def is_fast_track_eligible(self, coverage_ratio: float, boundary_count: int) -> bool:
        """
        Check basic eligibility for fast-track mode.

        Note: This only checks coverage and count thresholds.
        Use should_fast_track() from fast_track.py for full validation
        including closed region checks.

        Args:
            coverage_ratio: Ratio of image covered by boundaries (0.0-1.0)
            boundary_count: Number of detected boundaries

        Returns:
            True if basic thresholds are met
        """
        if not self.enabled:
            return False
        if coverage_ratio < self.fast_track_threshold:
            return False
        if boundary_count < self.min_boundaries_for_fast_track:
            return False
        return True
