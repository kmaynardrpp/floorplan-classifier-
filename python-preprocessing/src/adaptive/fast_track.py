"""
Fast-track mode decision logic.

Task 7.2: Implement Fast-Track Mode Decision Logic
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, TYPE_CHECKING
from enum import Enum

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult
    from .closed_region import ClosedRegionResult


class FastTrackReason(Enum):
    """Reasons for fast-track eligibility or ineligibility."""
    ELIGIBLE_CLOSED_REGIONS = "eligible_closed_regions"
    ELIGIBLE_HIGH_COVERAGE = "eligible_high_coverage"
    ELIGIBLE_SIMPLE_LAYOUT = "eligible_simple_layout"

    INELIGIBLE_NO_BOUNDARIES = "ineligible_no_boundaries"
    INELIGIBLE_NO_CLOSED_REGIONS = "ineligible_no_closed_regions"
    INELIGIBLE_LOW_COVERAGE = "ineligible_low_coverage"
    INELIGIBLE_COMPLEX_LAYOUT = "ineligible_complex_layout"
    INELIGIBLE_LARGE_IMAGE = "ineligible_large_image"


@dataclass
class FastTrackDecision:
    """Decision about fast-track mode eligibility."""
    eligible: bool
    confidence: float
    reasons: List[FastTrackReason] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "eligible": self.eligible,
            "confidence": self.confidence,
            "reasons": [r.value for r in self.reasons],
            "metrics": self.metrics,
        }


class FastTrackEvaluator:
    """
    Evaluates whether fast-track processing mode can be used.

    Fast-track mode skips detailed sub-agent analysis when:
    - Phase 0 detected sufficient closed regions
    - Coverage ratio is high enough
    - Layout complexity is low

    This saves processing time for well-structured floorplans.

    Example:
        >>> evaluator = FastTrackEvaluator()
        >>> decision = evaluator.evaluate(phase0_result, closed_region_result)
        >>> if decision.eligible:
        ...     use_fast_track_pipeline()
    """

    def __init__(
        self,
        min_coverage_ratio: float = 0.3,
        min_closed_ratio: float = 0.5,
        max_boundary_count: int = 50,
        max_image_dimension: int = 4000,
    ):
        """
        Initialize evaluator.

        Args:
            min_coverage_ratio: Minimum Phase 0 coverage for fast-track
            min_closed_ratio: Minimum ratio of closed boundaries
            max_boundary_count: Maximum boundaries for "simple" layout
            max_image_dimension: Maximum dimension before tiling required
        """
        self.min_coverage_ratio = min_coverage_ratio
        self.min_closed_ratio = min_closed_ratio
        self.max_boundary_count = max_boundary_count
        self.max_image_dimension = max_image_dimension

    def evaluate(
        self,
        phase0_result: Optional["ColorBoundaryResult"],
        closed_region_result: Optional["ClosedRegionResult"],
        image_dimensions: Optional[tuple] = None,
    ) -> FastTrackDecision:
        """
        Evaluate fast-track eligibility.

        Args:
            phase0_result: Phase 0 color boundary detection results
            closed_region_result: Closed region analysis results
            image_dimensions: Optional (width, height) of image

        Returns:
            FastTrackDecision with eligibility and reasons
        """
        reasons = []
        metrics = {}
        scores = []

        # Check for required inputs
        if phase0_result is None or len(phase0_result.boundaries) == 0:
            return FastTrackDecision(
                eligible=False,
                confidence=1.0,
                reasons=[FastTrackReason.INELIGIBLE_NO_BOUNDARIES],
                metrics={"boundary_count": 0},
            )

        # Metric: Boundary count
        boundary_count = len(phase0_result.boundaries)
        metrics["boundary_count"] = boundary_count

        # Check closed regions (REQUIRED for fast-track)
        if closed_region_result is None:
            reasons.append(FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS)
            return FastTrackDecision(
                eligible=False,
                confidence=0.9,
                reasons=reasons,
                metrics=metrics,
            )

        metrics["closed_region_count"] = closed_region_result.closed_region_count
        metrics["closure_ratio"] = closed_region_result.closure_ratio

        # REQUIRED: Must have closed regions
        if not closed_region_result.has_closed_regions:
            reasons.append(FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS)
            return FastTrackDecision(
                eligible=False,
                confidence=0.95,
                reasons=reasons,
                metrics=metrics,
            )

        # Check closure ratio
        if closed_region_result.closure_ratio >= self.min_closed_ratio:
            reasons.append(FastTrackReason.ELIGIBLE_CLOSED_REGIONS)
            scores.append(closed_region_result.closure_ratio)
        else:
            reasons.append(FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS)
            scores.append(closed_region_result.closure_ratio * 0.5)

        # Check coverage ratio
        coverage = phase0_result.coverage_ratio if hasattr(phase0_result, 'coverage_ratio') else 0.0
        metrics["coverage_ratio"] = coverage

        if coverage >= self.min_coverage_ratio:
            reasons.append(FastTrackReason.ELIGIBLE_HIGH_COVERAGE)
            scores.append(min(coverage / self.min_coverage_ratio, 1.0))
        else:
            reasons.append(FastTrackReason.INELIGIBLE_LOW_COVERAGE)
            scores.append(coverage / self.min_coverage_ratio * 0.5)

        # Check layout complexity
        if boundary_count <= self.max_boundary_count:
            reasons.append(FastTrackReason.ELIGIBLE_SIMPLE_LAYOUT)
            scores.append(1.0 - (boundary_count / self.max_boundary_count) * 0.3)
        else:
            reasons.append(FastTrackReason.INELIGIBLE_COMPLEX_LAYOUT)
            scores.append(0.3)

        # Check image dimensions
        if image_dimensions:
            width, height = image_dimensions
            metrics["image_width"] = width
            metrics["image_height"] = height
            max_dim = max(width, height)

            if max_dim > self.max_image_dimension:
                reasons.append(FastTrackReason.INELIGIBLE_LARGE_IMAGE)
                scores.append(0.5)

        # Calculate overall eligibility
        eligible_reasons = [r for r in reasons if r.value.startswith("eligible")]
        ineligible_reasons = [r for r in reasons if r.value.startswith("ineligible")]

        # Must have closed regions AND at least one other positive signal
        has_closed = FastTrackReason.ELIGIBLE_CLOSED_REGIONS in reasons
        has_critical_issue = any(r in [
            FastTrackReason.INELIGIBLE_NO_BOUNDARIES,
            FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS,
        ] for r in ineligible_reasons)

        eligible = has_closed and not has_critical_issue and len(eligible_reasons) >= 2

        # Calculate confidence
        if scores:
            confidence = sum(scores) / len(scores)
        else:
            confidence = 0.5

        return FastTrackDecision(
            eligible=eligible,
            confidence=confidence,
            reasons=reasons,
            metrics=metrics,
        )

    def evaluate_quick(
        self,
        closed_region_count: int,
        total_boundaries: int,
        coverage_ratio: float,
    ) -> FastTrackDecision:
        """
        Quick evaluation with pre-computed metrics.

        Args:
            closed_region_count: Number of closed regions
            total_boundaries: Total boundary count
            coverage_ratio: Phase 0 coverage ratio

        Returns:
            FastTrackDecision
        """
        reasons = []
        metrics = {
            "closed_region_count": closed_region_count,
            "total_boundaries": total_boundaries,
            "coverage_ratio": coverage_ratio,
        }

        # Check closed regions
        if closed_region_count == 0:
            return FastTrackDecision(
                eligible=False,
                confidence=0.95,
                reasons=[FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS],
                metrics=metrics,
            )

        closure_ratio = closed_region_count / total_boundaries if total_boundaries > 0 else 0
        metrics["closure_ratio"] = closure_ratio

        if closure_ratio >= self.min_closed_ratio:
            reasons.append(FastTrackReason.ELIGIBLE_CLOSED_REGIONS)

        if coverage_ratio >= self.min_coverage_ratio:
            reasons.append(FastTrackReason.ELIGIBLE_HIGH_COVERAGE)

        if total_boundaries <= self.max_boundary_count:
            reasons.append(FastTrackReason.ELIGIBLE_SIMPLE_LAYOUT)

        eligible_count = len([r for r in reasons if r.value.startswith("eligible")])
        eligible = eligible_count >= 2 and FastTrackReason.ELIGIBLE_CLOSED_REGIONS in reasons

        confidence = eligible_count / 3.0 if eligible else 0.3

        return FastTrackDecision(
            eligible=eligible,
            confidence=confidence,
            reasons=reasons,
            metrics=metrics,
        )
