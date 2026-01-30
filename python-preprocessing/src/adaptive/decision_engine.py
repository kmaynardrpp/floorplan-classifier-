"""
Hybrid processing decision engine.

Task 7.3: Create Hybrid Processing Decision Engine
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, TYPE_CHECKING
from enum import Enum
import logging

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult
    from .closed_region import ClosedRegionResult
    from .fast_track import FastTrackDecision

logger = logging.getLogger(__name__)


class ProcessingMode(Enum):
    """Available processing modes."""
    FAST_TRACK = "fast_track"  # Use Phase 0 results directly
    STANDARD = "standard"  # Full analysis without tiling
    TILED = "tiled"  # Split into tiles for large images
    HYBRID = "hybrid"  # Combination based on regions


@dataclass
class ProcessingDecision:
    """Decision about which processing mode to use."""
    mode: ProcessingMode
    confidence: float
    should_tile: bool
    tile_count: int = 1
    reasoning: List[str] = field(default_factory=list)
    fast_track_decision: Optional["FastTrackDecision"] = None
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "mode": self.mode.value,
            "confidence": self.confidence,
            "should_tile": self.should_tile,
            "tile_count": self.tile_count,
            "reasoning": self.reasoning,
            "fast_track_eligible": (
                self.fast_track_decision.eligible
                if self.fast_track_decision else False
            ),
            "metrics": self.metrics,
        }


class DecisionEngine:
    """
    Decides the optimal processing mode based on image and Phase 0 analysis.

    The engine considers:
    - Image dimensions (for tiling decision)
    - Phase 0 boundary quality (for fast-track eligibility)
    - Closed region analysis (required for fast-track)
    - Layout complexity

    Processing modes:
    - FAST_TRACK: Skip detailed analysis, use Phase 0 directly
    - STANDARD: Full analysis pipeline
    - TILED: Split large images into tiles
    - HYBRID: Mix of modes for different regions

    Example:
        >>> engine = DecisionEngine()
        >>> decision = engine.decide(image, phase0_result)
        >>> if decision.mode == ProcessingMode.FAST_TRACK:
        ...     return phase0_to_zones(phase0_result)
    """

    def __init__(
        self,
        dimension_threshold: int = 4000,
        tile_size: int = 2048,
        fast_track_min_coverage: float = 0.3,
        fast_track_min_closed_ratio: float = 0.5,
    ):
        """
        Initialize decision engine.

        Args:
            dimension_threshold: Max dimension before tiling
            tile_size: Target tile size
            fast_track_min_coverage: Min coverage for fast-track
            fast_track_min_closed_ratio: Min closed ratio for fast-track
        """
        self.dimension_threshold = dimension_threshold
        self.tile_size = tile_size
        self.fast_track_min_coverage = fast_track_min_coverage
        self.fast_track_min_closed_ratio = fast_track_min_closed_ratio

    def decide(
        self,
        image_dimensions: tuple,
        phase0_result: Optional["ColorBoundaryResult"] = None,
        closed_region_result: Optional["ClosedRegionResult"] = None,
        fast_track_decision: Optional["FastTrackDecision"] = None,
        force_mode: Optional[ProcessingMode] = None,
    ) -> ProcessingDecision:
        """
        Decide optimal processing mode.

        Args:
            image_dimensions: (width, height) of image
            phase0_result: Phase 0 boundary detection results
            closed_region_result: Closed region analysis
            fast_track_decision: Pre-computed fast-track decision
            force_mode: Force a specific mode (overrides auto-detection)

        Returns:
            ProcessingDecision with recommended mode
        """
        width, height = image_dimensions
        reasoning = []
        metrics = {
            "image_width": width,
            "image_height": height,
        }

        # Handle forced mode
        if force_mode is not None:
            reasoning.append(f"Mode forced to {force_mode.value}")
            should_tile = force_mode == ProcessingMode.TILED
            return ProcessingDecision(
                mode=force_mode,
                confidence=1.0,
                should_tile=should_tile,
                tile_count=self._estimate_tile_count(width, height) if should_tile else 1,
                reasoning=reasoning,
                metrics=metrics,
            )

        # Check if tiling is needed
        max_dim = max(width, height)
        needs_tiling = max_dim > self.dimension_threshold

        if needs_tiling:
            tile_count = self._estimate_tile_count(width, height)
            metrics["estimated_tile_count"] = tile_count
            reasoning.append(
                f"Image dimension {max_dim}px exceeds threshold {self.dimension_threshold}px"
            )

        # Check fast-track eligibility
        fast_track_eligible = False

        if fast_track_decision is not None:
            fast_track_eligible = fast_track_decision.eligible
            metrics["fast_track_confidence"] = fast_track_decision.confidence

            if fast_track_eligible:
                reasoning.append("Fast-track eligible: " + ", ".join(
                    r.value for r in fast_track_decision.reasons
                    if r.value.startswith("eligible")
                ))
            else:
                reasoning.append("Fast-track ineligible: " + ", ".join(
                    r.value for r in fast_track_decision.reasons
                    if r.value.startswith("ineligible")
                ))

        elif closed_region_result is not None:
            # Evaluate fast-track from closed region result
            fast_track_eligible = closed_region_result.is_fast_track_eligible
            metrics["closure_ratio"] = closed_region_result.closure_ratio

            if fast_track_eligible:
                reasoning.append(
                    f"Fast-track eligible: {closed_region_result.closed_region_count} "
                    f"closed regions ({closed_region_result.closure_ratio:.1%} closure ratio)"
                )

        # Add Phase 0 metrics
        if phase0_result is not None:
            boundary_count = len(phase0_result.boundaries)
            metrics["boundary_count"] = boundary_count

            if hasattr(phase0_result, 'coverage_ratio'):
                metrics["coverage_ratio"] = phase0_result.coverage_ratio

        # Decision logic
        if needs_tiling:
            if fast_track_eligible:
                # Large image but good Phase 0 - use hybrid
                mode = ProcessingMode.HYBRID
                reasoning.append(
                    "Using hybrid mode: tiling with fast-track where possible"
                )
                confidence = 0.8
            else:
                # Large image, need full tiled processing
                mode = ProcessingMode.TILED
                reasoning.append("Using tiled processing for large image")
                confidence = 0.9
        else:
            if fast_track_eligible:
                # Small image with good Phase 0 - fast track
                mode = ProcessingMode.FAST_TRACK
                reasoning.append("Using fast-track: good Phase 0 coverage")
                confidence = fast_track_decision.confidence if fast_track_decision else 0.85
            else:
                # Small image, need standard processing
                mode = ProcessingMode.STANDARD
                reasoning.append("Using standard processing")
                confidence = 0.9

        logger.info(f"Decision: {mode.value} (confidence: {confidence:.2f})")
        for reason in reasoning:
            logger.debug(f"  - {reason}")

        return ProcessingDecision(
            mode=mode,
            confidence=confidence,
            should_tile=needs_tiling,
            tile_count=self._estimate_tile_count(width, height) if needs_tiling else 1,
            reasoning=reasoning,
            fast_track_decision=fast_track_decision,
            metrics=metrics,
        )

    def _estimate_tile_count(self, width: int, height: int) -> int:
        """Estimate number of tiles needed."""
        if width <= self.tile_size and height <= self.tile_size:
            return 1

        # Calculate grid size
        cols = (width + self.tile_size - 1) // self.tile_size
        rows = (height + self.tile_size - 1) // self.tile_size

        return cols * rows

    def should_use_fast_track(
        self,
        phase0_result: "ColorBoundaryResult",
        closed_region_result: "ClosedRegionResult",
    ) -> bool:
        """
        Quick check for fast-track eligibility.

        Args:
            phase0_result: Phase 0 results
            closed_region_result: Closed region analysis

        Returns:
            True if fast-track should be used
        """
        # Must have closed regions
        if not closed_region_result.is_fast_track_eligible:
            return False

        # Check coverage
        if hasattr(phase0_result, 'coverage_ratio'):
            if phase0_result.coverage_ratio < self.fast_track_min_coverage:
                return False

        # Check closure ratio
        if closed_region_result.closure_ratio < self.fast_track_min_closed_ratio:
            return False

        return True
