"""
Adaptive configuration selection.

Task 7.4: Implement Adaptive Configuration Selection
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from enum import Enum

from .decision_engine import ProcessingMode


class ImageComplexity(Enum):
    """Complexity levels for images."""
    SIMPLE = "simple"  # Few zones, clear boundaries
    MODERATE = "moderate"  # Average complexity
    COMPLEX = "complex"  # Many zones, unclear boundaries


@dataclass
class AdaptiveConfig:
    """
    Adaptive configuration for processing pipeline.

    Adjusts processing parameters based on image characteristics.
    """
    # Processing mode
    processing_mode: ProcessingMode = ProcessingMode.STANDARD

    # Tiling settings
    tile_enabled: bool = False
    tile_size: int = 2048
    tile_overlap: int = 256

    # Phase 0 settings
    phase0_enabled: bool = True
    phase0_colors: List[str] = field(default_factory=lambda: ["orange", "yellow", "blue"])

    # Detection settings
    min_zone_area: int = 1000
    simplification_epsilon: float = 0.02
    merge_iou_threshold: float = 0.3

    # Fast-track settings
    fast_track_enabled: bool = False
    fast_track_min_confidence: float = 0.7

    # Quality settings
    max_zones_per_tile: int = 50
    validation_enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "processing_mode": self.processing_mode.value,
            "tile_enabled": self.tile_enabled,
            "tile_size": self.tile_size,
            "tile_overlap": self.tile_overlap,
            "phase0_enabled": self.phase0_enabled,
            "phase0_colors": self.phase0_colors,
            "min_zone_area": self.min_zone_area,
            "simplification_epsilon": self.simplification_epsilon,
            "merge_iou_threshold": self.merge_iou_threshold,
            "fast_track_enabled": self.fast_track_enabled,
            "fast_track_min_confidence": self.fast_track_min_confidence,
            "max_zones_per_tile": self.max_zones_per_tile,
            "validation_enabled": self.validation_enabled,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AdaptiveConfig":
        """Create from dictionary."""
        mode_str = data.get("processing_mode", "standard")
        mode = ProcessingMode(mode_str) if mode_str else ProcessingMode.STANDARD

        return cls(
            processing_mode=mode,
            tile_enabled=data.get("tile_enabled", False),
            tile_size=data.get("tile_size", 2048),
            tile_overlap=data.get("tile_overlap", 256),
            phase0_enabled=data.get("phase0_enabled", True),
            phase0_colors=data.get("phase0_colors", ["orange", "yellow", "blue"]),
            min_zone_area=data.get("min_zone_area", 1000),
            simplification_epsilon=data.get("simplification_epsilon", 0.02),
            merge_iou_threshold=data.get("merge_iou_threshold", 0.3),
            fast_track_enabled=data.get("fast_track_enabled", False),
            fast_track_min_confidence=data.get("fast_track_min_confidence", 0.7),
            max_zones_per_tile=data.get("max_zones_per_tile", 50),
            validation_enabled=data.get("validation_enabled", True),
        )


class ConfigSelector:
    """
    Selects optimal configuration based on image analysis.

    Adapts processing parameters to match:
    - Image size and dimensions
    - Detected complexity
    - Phase 0 quality
    - Available resources

    Example:
        >>> selector = ConfigSelector()
        >>> config = selector.select(
        ...     image_dimensions=(8000, 6000),
        ...     complexity=ImageComplexity.COMPLEX,
        ... )
    """

    # Predefined configurations
    PRESETS = {
        "fast": AdaptiveConfig(
            processing_mode=ProcessingMode.FAST_TRACK,
            tile_enabled=False,
            min_zone_area=2000,
            simplification_epsilon=0.03,
            fast_track_enabled=True,
        ),
        "quality": AdaptiveConfig(
            processing_mode=ProcessingMode.STANDARD,
            tile_enabled=False,
            min_zone_area=500,
            simplification_epsilon=0.01,
            validation_enabled=True,
        ),
        "large_image": AdaptiveConfig(
            processing_mode=ProcessingMode.TILED,
            tile_enabled=True,
            tile_size=2048,
            tile_overlap=256,
            merge_iou_threshold=0.3,
        ),
        "balanced": AdaptiveConfig(
            processing_mode=ProcessingMode.STANDARD,
            tile_enabled=False,
            min_zone_area=1000,
            simplification_epsilon=0.02,
        ),
    }

    def __init__(
        self,
        dimension_threshold: int = 4000,
        default_preset: str = "balanced",
    ):
        """
        Initialize config selector.

        Args:
            dimension_threshold: Max dimension before tiling
            default_preset: Default preset name
        """
        self.dimension_threshold = dimension_threshold
        self.default_preset = default_preset

    def select(
        self,
        image_dimensions: Optional[tuple] = None,
        complexity: Optional[ImageComplexity] = None,
        fast_track_eligible: bool = False,
        boundary_count: int = 0,
        coverage_ratio: float = 0.0,
        preset: Optional[str] = None,
    ) -> AdaptiveConfig:
        """
        Select optimal configuration.

        Args:
            image_dimensions: (width, height) of image
            complexity: Detected image complexity
            fast_track_eligible: Whether fast-track is eligible
            boundary_count: Number of Phase 0 boundaries
            coverage_ratio: Phase 0 coverage ratio
            preset: Optional preset name to use

        Returns:
            AdaptiveConfig with optimal settings
        """
        # Use preset if specified
        if preset and preset in self.PRESETS:
            config = self._copy_config(self.PRESETS[preset])
        else:
            config = self._copy_config(self.PRESETS[self.default_preset])

        # Adapt based on image dimensions
        if image_dimensions:
            width, height = image_dimensions
            max_dim = max(width, height)

            if max_dim > self.dimension_threshold:
                config.tile_enabled = True
                config.processing_mode = ProcessingMode.TILED

                # Adjust tile size for very large images
                if max_dim > 8000:
                    config.tile_size = 2048
                    config.tile_overlap = 512
                elif max_dim > 6000:
                    config.tile_size = 2048
                    config.tile_overlap = 256
                else:
                    config.tile_size = 2048
                    config.tile_overlap = 256

        # Adapt based on complexity
        if complexity:
            if complexity == ImageComplexity.SIMPLE:
                config.min_zone_area = 2000
                config.simplification_epsilon = 0.03
                config.max_zones_per_tile = 30
            elif complexity == ImageComplexity.COMPLEX:
                config.min_zone_area = 500
                config.simplification_epsilon = 0.01
                config.max_zones_per_tile = 100
                config.merge_iou_threshold = 0.2

        # Adapt based on fast-track eligibility
        if fast_track_eligible and not config.tile_enabled:
            config.fast_track_enabled = True
            config.processing_mode = ProcessingMode.FAST_TRACK

        # Adapt based on boundary count
        if boundary_count > 0:
            if boundary_count > 50:
                # Many boundaries - increase complexity handling
                config.merge_iou_threshold = 0.25
                config.max_zones_per_tile = 80
            elif boundary_count < 10:
                # Few boundaries - simple config
                config.min_zone_area = 2000

        # Adapt based on coverage
        if coverage_ratio > 0:
            if coverage_ratio > 0.5:
                # Good coverage - can use fast-track if eligible
                config.fast_track_min_confidence = 0.6
            elif coverage_ratio < 0.2:
                # Poor coverage - need more sensitive detection
                config.min_zone_area = 500

        return config

    def select_for_tile(
        self,
        tile_index: int,
        parent_config: AdaptiveConfig,
        tile_characteristics: Optional[Dict[str, Any]] = None,
    ) -> AdaptiveConfig:
        """
        Select configuration for a specific tile.

        Args:
            tile_index: Index of the tile
            parent_config: Parent image configuration
            tile_characteristics: Optional characteristics of this tile

        Returns:
            AdaptiveConfig for tile processing
        """
        config = self._copy_config(parent_config)

        # Tiles don't need further tiling
        config.tile_enabled = False
        config.processing_mode = ProcessingMode.STANDARD

        # Adjust for tile characteristics
        if tile_characteristics:
            if tile_characteristics.get("edge_tile", False):
                # Edge tiles may have partial zones
                config.min_zone_area = max(500, config.min_zone_area // 2)

            if tile_characteristics.get("high_density", False):
                # High density tiles need finer detection
                config.simplification_epsilon = 0.01

        return config

    def get_preset(self, name: str) -> Optional[AdaptiveConfig]:
        """Get a preset configuration by name."""
        if name in self.PRESETS:
            return self._copy_config(self.PRESETS[name])
        return None

    def list_presets(self) -> List[str]:
        """List available preset names."""
        return list(self.PRESETS.keys())

    def _copy_config(self, config: AdaptiveConfig) -> AdaptiveConfig:
        """Create a copy of a configuration."""
        return AdaptiveConfig(
            processing_mode=config.processing_mode,
            tile_enabled=config.tile_enabled,
            tile_size=config.tile_size,
            tile_overlap=config.tile_overlap,
            phase0_enabled=config.phase0_enabled,
            phase0_colors=config.phase0_colors.copy(),
            min_zone_area=config.min_zone_area,
            simplification_epsilon=config.simplification_epsilon,
            merge_iou_threshold=config.merge_iou_threshold,
            fast_track_enabled=config.fast_track_enabled,
            fast_track_min_confidence=config.fast_track_min_confidence,
            max_zones_per_tile=config.max_zones_per_tile,
            validation_enabled=config.validation_enabled,
        )


def estimate_complexity(
    boundary_count: int,
    coverage_ratio: float,
    closed_ratio: float,
) -> ImageComplexity:
    """
    Estimate image complexity from metrics.

    Args:
        boundary_count: Number of detected boundaries
        coverage_ratio: Phase 0 coverage ratio
        closed_ratio: Ratio of closed boundaries

    Returns:
        Estimated ImageComplexity
    """
    # Simple: few boundaries, high coverage, high closure
    if boundary_count < 15 and coverage_ratio > 0.4 and closed_ratio > 0.7:
        return ImageComplexity.SIMPLE

    # Complex: many boundaries, low coverage, low closure
    if boundary_count > 40 or coverage_ratio < 0.2 or closed_ratio < 0.3:
        return ImageComplexity.COMPLEX

    return ImageComplexity.MODERATE
