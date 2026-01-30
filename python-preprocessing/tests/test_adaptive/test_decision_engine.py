"""Tests for hybrid processing decision engine."""

import pytest
from dataclasses import dataclass
from typing import List, Tuple

from src.adaptive.decision_engine import (
    ProcessingMode,
    ProcessingDecision,
    DecisionEngine,
)
from src.adaptive.fast_track import FastTrackDecision, FastTrackReason
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


class TestProcessingMode:
    """Tests for ProcessingMode enum."""

    def test_mode_values(self):
        """Test mode enum values."""
        assert ProcessingMode.FAST_TRACK.value == "fast_track"
        assert ProcessingMode.STANDARD.value == "standard"
        assert ProcessingMode.TILED.value == "tiled"
        assert ProcessingMode.HYBRID.value == "hybrid"


class TestProcessingDecision:
    """Tests for ProcessingDecision dataclass."""

    def test_create_decision(self):
        """Test creating a decision."""
        decision = ProcessingDecision(
            mode=ProcessingMode.STANDARD,
            confidence=0.9,
            should_tile=False,
        )
        assert decision.mode == ProcessingMode.STANDARD
        assert decision.should_tile is False

    def test_decision_with_tiling(self):
        """Test decision with tiling."""
        decision = ProcessingDecision(
            mode=ProcessingMode.TILED,
            confidence=0.85,
            should_tile=True,
            tile_count=4,
        )
        assert decision.should_tile is True
        assert decision.tile_count == 4

    def test_decision_to_dict(self):
        """Test serialization."""
        decision = ProcessingDecision(
            mode=ProcessingMode.FAST_TRACK,
            confidence=0.8,
            should_tile=False,
            reasoning=["Good Phase 0 coverage"],
        )
        d = decision.to_dict()
        assert d["mode"] == "fast_track"
        assert d["should_tile"] is False
        assert "Good Phase 0 coverage" in d["reasoning"]


class TestDecisionEngineInit:
    """Tests for DecisionEngine initialization."""

    def test_default_init(self):
        """Test default initialization."""
        engine = DecisionEngine()
        assert engine.dimension_threshold == 4000
        assert engine.tile_size == 2048

    def test_custom_init(self):
        """Test custom initialization."""
        engine = DecisionEngine(
            dimension_threshold=3000,
            tile_size=1024,
        )
        assert engine.dimension_threshold == 3000


class TestDecisionEngineDecide:
    """Tests for decide method."""

    @pytest.fixture
    def engine(self):
        return DecisionEngine()

    def test_decide_small_image_no_phase0(self, engine):
        """Test decision for small image without Phase 0."""
        decision = engine.decide(
            image_dimensions=(2000, 1500),
            phase0_result=None,
        )

        assert decision.mode == ProcessingMode.STANDARD
        assert decision.should_tile is False

    def test_decide_large_image(self, engine):
        """Test decision for large image."""
        decision = engine.decide(
            image_dimensions=(6000, 4000),
        )

        assert decision.should_tile is True
        assert decision.tile_count > 1
        assert decision.mode in [ProcessingMode.TILED, ProcessingMode.HYBRID]

    def test_decide_with_fast_track_eligible(self, engine):
        """Test decision when fast-track is eligible."""
        fast_track = FastTrackDecision(
            eligible=True,
            confidence=0.85,
            reasons=[FastTrackReason.ELIGIBLE_CLOSED_REGIONS],
        )

        decision = engine.decide(
            image_dimensions=(2000, 1500),
            fast_track_decision=fast_track,
        )

        assert decision.mode == ProcessingMode.FAST_TRACK
        assert decision.should_tile is False

    def test_decide_large_image_fast_track_eligible(self, engine):
        """Test decision for large image with fast-track eligible."""
        fast_track = FastTrackDecision(
            eligible=True,
            confidence=0.8,
            reasons=[FastTrackReason.ELIGIBLE_CLOSED_REGIONS],
        )

        decision = engine.decide(
            image_dimensions=(6000, 4000),
            fast_track_decision=fast_track,
        )

        # Large image with good Phase 0 -> Hybrid
        assert decision.mode == ProcessingMode.HYBRID
        assert decision.should_tile is True

    def test_decide_with_closed_region_result(self, engine):
        """Test decision using closed region result."""
        closed_result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=5,
            total_boundary_count=6,
            closure_ratio=0.83,
        )

        decision = engine.decide(
            image_dimensions=(2000, 1500),
            closed_region_result=closed_result,
        )

        # Good closed region result -> Fast track
        assert decision.mode == ProcessingMode.FAST_TRACK

    def test_decide_forced_mode(self, engine):
        """Test forcing a specific mode."""
        decision = engine.decide(
            image_dimensions=(2000, 1500),
            force_mode=ProcessingMode.TILED,
        )

        assert decision.mode == ProcessingMode.TILED
        assert "forced" in decision.reasoning[0].lower()

    def test_decide_includes_metrics(self, engine):
        """Test that decision includes metrics."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[(0, 0), (100, 100)])] * 5,
            coverage_ratio=0.4,
        )

        decision = engine.decide(
            image_dimensions=(3000, 2000),
            phase0_result=phase0,
        )

        assert "image_width" in decision.metrics
        assert "image_height" in decision.metrics
        assert "boundary_count" in decision.metrics


class TestDecisionEngineTileCount:
    """Tests for tile count estimation."""

    @pytest.fixture
    def engine(self):
        return DecisionEngine(tile_size=2048)

    def test_estimate_single_tile(self, engine):
        """Test estimation for single tile."""
        count = engine._estimate_tile_count(1000, 1000)
        assert count == 1

    def test_estimate_2x2_tiles(self, engine):
        """Test estimation for 2x2 grid."""
        count = engine._estimate_tile_count(4000, 4000)
        assert count == 4

    def test_estimate_3x2_tiles(self, engine):
        """Test estimation for non-square grid."""
        count = engine._estimate_tile_count(6000, 4000)
        assert count == 6  # 3 columns x 2 rows


class TestDecisionEngineShouldUseFastTrack:
    """Tests for should_use_fast_track method."""

    @pytest.fixture
    def engine(self):
        return DecisionEngine(
            fast_track_min_coverage=0.3,
            fast_track_min_closed_ratio=0.5,
        )

    def test_should_use_fast_track_true(self, engine):
        """Test when fast-track should be used."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[])] * 5,
            coverage_ratio=0.5,
        )
        closed = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=4,
            total_boundary_count=5,
            closure_ratio=0.8,
        )

        assert engine.should_use_fast_track(phase0, closed) is True

    def test_should_use_fast_track_low_coverage(self, engine):
        """Test when coverage is too low."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[])] * 5,
            coverage_ratio=0.1,  # Too low
        )
        closed = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=4,
            total_boundary_count=5,
            closure_ratio=0.8,
        )

        assert engine.should_use_fast_track(phase0, closed) is False

    def test_should_use_fast_track_no_closed(self, engine):
        """Test when no closed regions."""
        phase0 = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=[])] * 5,
            coverage_ratio=0.5,
        )
        closed = ClosedRegionResult(
            has_closed_regions=False,
            closed_region_count=0,
            total_boundary_count=5,
            closure_ratio=0.0,
        )

        assert engine.should_use_fast_track(phase0, closed) is False
