"""Tests for fast-track mode decision logic."""

import pytest
from dataclasses import dataclass
from typing import List, Tuple

from src.adaptive.fast_track import (
    FastTrackReason,
    FastTrackDecision,
    FastTrackEvaluator,
)
from src.adaptive.closed_region import ClosedRegionResult


# Mock classes
@dataclass
class MockBoundary:
    polygon: List[Tuple[int, int]]
    color: str = "orange"


@dataclass
class MockColorBoundaryResult:
    boundaries: List[MockBoundary]
    coverage_ratio: float = 0.3


class TestFastTrackReason:
    """Tests for FastTrackReason enum."""

    def test_eligible_reasons(self):
        """Test eligible reason values."""
        assert FastTrackReason.ELIGIBLE_CLOSED_REGIONS.value.startswith("eligible")
        assert FastTrackReason.ELIGIBLE_HIGH_COVERAGE.value.startswith("eligible")
        assert FastTrackReason.ELIGIBLE_SIMPLE_LAYOUT.value.startswith("eligible")

    def test_ineligible_reasons(self):
        """Test ineligible reason values."""
        assert FastTrackReason.INELIGIBLE_NO_BOUNDARIES.value.startswith("ineligible")
        assert FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS.value.startswith("ineligible")


class TestFastTrackDecision:
    """Tests for FastTrackDecision dataclass."""

    def test_create_decision(self):
        """Test creating a decision."""
        decision = FastTrackDecision(
            eligible=True,
            confidence=0.85,
            reasons=[FastTrackReason.ELIGIBLE_CLOSED_REGIONS],
        )
        assert decision.eligible is True
        assert decision.confidence == 0.85

    def test_decision_to_dict(self):
        """Test serialization."""
        decision = FastTrackDecision(
            eligible=False,
            confidence=0.4,
            reasons=[FastTrackReason.INELIGIBLE_LOW_COVERAGE],
            metrics={"coverage": 0.15},
        )
        d = decision.to_dict()
        assert d["eligible"] is False
        assert d["confidence"] == 0.4
        assert "ineligible_low_coverage" in d["reasons"]


class TestFastTrackEvaluatorInit:
    """Tests for FastTrackEvaluator initialization."""

    def test_default_init(self):
        """Test default initialization."""
        evaluator = FastTrackEvaluator()
        assert evaluator.min_coverage_ratio == 0.3
        assert evaluator.min_closed_ratio == 0.5
        assert evaluator.max_boundary_count == 50

    def test_custom_init(self):
        """Test custom initialization."""
        evaluator = FastTrackEvaluator(
            min_coverage_ratio=0.4,
            min_closed_ratio=0.6,
            max_boundary_count=30,
        )
        assert evaluator.min_coverage_ratio == 0.4


class TestFastTrackEvaluatorEvaluate:
    """Tests for evaluate method."""

    @pytest.fixture
    def evaluator(self):
        return FastTrackEvaluator()

    def test_evaluate_no_phase0(self, evaluator):
        """Test evaluation with no Phase 0 results."""
        decision = evaluator.evaluate(None, None)

        assert decision.eligible is False
        assert FastTrackReason.INELIGIBLE_NO_BOUNDARIES in decision.reasons

    def test_evaluate_empty_boundaries(self, evaluator):
        """Test evaluation with empty boundaries."""
        phase0 = MockColorBoundaryResult(boundaries=[])
        decision = evaluator.evaluate(phase0, None)

        assert decision.eligible is False
        assert FastTrackReason.INELIGIBLE_NO_BOUNDARIES in decision.reasons

    def test_evaluate_no_closed_regions(self, evaluator):
        """Test evaluation with no closed regions."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[(0, 0), (100, 100)])],
            coverage_ratio=0.4,
        )
        closed_result = ClosedRegionResult(
            has_closed_regions=False,
            closed_region_count=0,
            total_boundary_count=1,
            closure_ratio=0.0,
        )

        decision = evaluator.evaluate(phase0, closed_result)

        assert decision.eligible is False
        assert FastTrackReason.INELIGIBLE_NO_CLOSED_REGIONS in decision.reasons

    def test_evaluate_eligible(self, evaluator):
        """Test evaluation when eligible."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])] * 10,
            coverage_ratio=0.5,
        )
        closed_result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=8,
            total_boundary_count=10,
            closure_ratio=0.8,
        )

        decision = evaluator.evaluate(phase0, closed_result)

        assert decision.eligible is True
        assert FastTrackReason.ELIGIBLE_CLOSED_REGIONS in decision.reasons

    def test_evaluate_with_image_dimensions(self, evaluator):
        """Test evaluation with image dimensions."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])] * 5,
            coverage_ratio=0.4,
        )
        closed_result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=4,
            total_boundary_count=5,
            closure_ratio=0.8,
        )

        decision = evaluator.evaluate(
            phase0, closed_result,
            image_dimensions=(3000, 2000),
        )

        assert "image_width" in decision.metrics

    def test_evaluate_large_image_ineligible(self, evaluator):
        """Test that large images are flagged."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])] * 5,
            coverage_ratio=0.4,
        )
        closed_result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=4,
            total_boundary_count=5,
            closure_ratio=0.8,
        )

        decision = evaluator.evaluate(
            phase0, closed_result,
            image_dimensions=(6000, 5000),  # Large image
        )

        assert FastTrackReason.INELIGIBLE_LARGE_IMAGE in decision.reasons


class TestFastTrackEvaluatorQuick:
    """Tests for evaluate_quick method."""

    @pytest.fixture
    def evaluator(self):
        return FastTrackEvaluator()

    def test_quick_no_closed(self, evaluator):
        """Test quick evaluation with no closed regions."""
        decision = evaluator.evaluate_quick(
            closed_region_count=0,
            total_boundaries=10,
            coverage_ratio=0.5,
        )

        assert decision.eligible is False

    def test_quick_eligible(self, evaluator):
        """Test quick evaluation when eligible."""
        decision = evaluator.evaluate_quick(
            closed_region_count=8,
            total_boundaries=10,
            coverage_ratio=0.5,
        )

        assert decision.eligible is True
        assert FastTrackReason.ELIGIBLE_CLOSED_REGIONS in decision.reasons
        assert FastTrackReason.ELIGIBLE_HIGH_COVERAGE in decision.reasons

    def test_quick_low_closure_ratio(self, evaluator):
        """Test quick evaluation with low closure ratio."""
        decision = evaluator.evaluate_quick(
            closed_region_count=2,
            total_boundaries=10,
            coverage_ratio=0.5,
        )

        # Closure ratio is 0.2, below min of 0.5
        assert decision.eligible is False
