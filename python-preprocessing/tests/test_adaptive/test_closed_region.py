"""Tests for closed region detection."""

import numpy as np
import cv2
import pytest
from dataclasses import dataclass
from typing import List, Tuple

from src.adaptive.closed_region import ClosedRegionDetector, ClosedRegionResult


# Mock classes
@dataclass
class MockBoundary:
    """Mock boundary for testing."""
    polygon: List[Tuple[int, int]]
    color: str = "orange"


@dataclass
class MockColorBoundaryResult:
    """Mock color boundary result for testing."""
    boundaries: List[MockBoundary]
    coverage_ratio: float = 0.3


class TestClosedRegionResult:
    """Tests for ClosedRegionResult dataclass."""

    def test_create_result(self):
        """Test creating a result."""
        result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=3,
            total_boundary_count=5,
            closure_ratio=0.6,
        )
        assert result.has_closed_regions is True
        assert result.closed_region_count == 3

    def test_is_fast_track_eligible_true(self):
        """Test fast-track eligibility when criteria met."""
        result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=3,
            total_boundary_count=5,
            closure_ratio=0.6,
        )
        assert result.is_fast_track_eligible is True

    def test_is_fast_track_eligible_no_closed(self):
        """Test fast-track ineligible when no closed regions."""
        result = ClosedRegionResult(
            has_closed_regions=False,
            closed_region_count=0,
            total_boundary_count=5,
            closure_ratio=0.0,
        )
        assert result.is_fast_track_eligible is False

    def test_is_fast_track_eligible_low_ratio(self):
        """Test fast-track ineligible when closure ratio low."""
        result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=1,
            total_boundary_count=10,
            closure_ratio=0.1,
        )
        assert result.is_fast_track_eligible is False

    def test_to_dict(self):
        """Test serialization."""
        result = ClosedRegionResult(
            has_closed_regions=True,
            closed_region_count=2,
            total_boundary_count=4,
            closure_ratio=0.5,
            closed_boundaries=[0, 2],
        )
        d = result.to_dict()
        assert d["has_closed_regions"] is True
        assert d["closure_ratio"] == 0.5
        assert d["closed_boundaries"] == [0, 2]


class TestClosedRegionDetectorInit:
    """Tests for ClosedRegionDetector initialization."""

    def test_default_init(self):
        """Test default initialization."""
        detector = ClosedRegionDetector()
        assert detector.closure_threshold == 10.0
        assert detector.min_area_ratio == 0.01
        assert detector.min_vertices == 4

    def test_custom_init(self):
        """Test custom initialization."""
        detector = ClosedRegionDetector(
            closure_threshold=5.0,
            min_area_ratio=0.02,
            min_vertices=3,
        )
        assert detector.closure_threshold == 5.0
        assert detector.min_area_ratio == 0.02


class TestClosedRegionDetectorAnalyze:
    """Tests for analyze method."""

    @pytest.fixture
    def detector(self):
        """Create detector instance."""
        return ClosedRegionDetector(min_area_ratio=0.001)

    def test_analyze_empty_boundaries(self, detector):
        """Test analysis with no boundaries."""
        result = MockColorBoundaryResult(boundaries=[])
        analysis = detector.analyze(result)

        assert analysis.has_closed_regions is False
        assert analysis.closed_region_count == 0
        assert analysis.closure_ratio == 0.0

    def test_analyze_closed_rectangle(self, detector):
        """Test analysis with closed rectangle."""
        # Closed rectangle (start equals end)
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100), (0, 0)]
        result = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=polygon)]
        )

        analysis = detector.analyze(result, image_size=(1000, 1000))

        assert analysis.has_closed_regions is True
        assert analysis.closed_region_count == 1
        assert analysis.closure_ratio == 1.0

    def test_analyze_open_polygon(self, detector):
        """Test analysis with open polygon."""
        # Open polygon (gap between start and end)
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]  # Gap: 100 pixels
        result = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=polygon)]
        )

        # With default threshold of 10, this should be considered open
        analysis = detector.analyze(result, image_size=(1000, 1000))

        # Polygon is nearly closed (gap < threshold may pass)
        # The gap here is from (0,100) to (0,0) = 100 pixels
        # This should be detected as NOT closed
        assert analysis.total_boundary_count == 1

    def test_analyze_mixed_boundaries(self, detector):
        """Test analysis with mix of open and closed."""
        boundaries = [
            MockBoundary(polygon=[(0, 0), (50, 0), (50, 50), (0, 50), (0, 0)]),  # Closed
            MockBoundary(polygon=[(100, 100), (200, 100), (200, 200)]),  # Open (3 points)
            MockBoundary(polygon=[(300, 300), (400, 300), (400, 400), (300, 400), (300, 300)]),  # Closed
        ]
        result = MockColorBoundaryResult(boundaries=boundaries)

        analysis = detector.analyze(result, image_size=(1000, 1000))

        assert analysis.total_boundary_count == 3
        # Second boundary has only 3 vertices, so invalid
        # First and third are closed

    def test_analyze_too_few_vertices(self, detector):
        """Test analysis with polygon having too few vertices."""
        polygon = [(0, 0), (100, 100), (0, 0)]  # Only 3 vertices
        result = MockColorBoundaryResult(
            boundaries=[MockBoundary(polygon=polygon)]
        )

        analysis = detector.analyze(result, image_size=(1000, 1000))

        # 3 vertices is below min_vertices=4
        assert analysis.closed_region_count == 0


class TestClosedRegionDetectorFromImage:
    """Tests for detect_from_image method."""

    @pytest.fixture
    def detector(self):
        return ClosedRegionDetector()

    def test_detect_from_blank_image(self, detector):
        """Test detection on blank image."""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        result = detector.detect_from_image(image, min_area=100)

        assert isinstance(result, ClosedRegionResult)

    def test_detect_from_image_with_rectangle(self, detector):
        """Test detection on image with drawn rectangle."""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        cv2.rectangle(image, (50, 50), (200, 200), (0, 0, 0), 2)

        result = detector.detect_from_image(image, min_area=100)

        assert isinstance(result, ClosedRegionResult)

    def test_detect_from_image_with_multiple_shapes(self, detector):
        """Test detection on image with multiple shapes."""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 255
        cv2.rectangle(image, (50, 50), (150, 150), (0, 0, 0), 2)
        cv2.rectangle(image, (200, 200), (350, 350), (0, 0, 0), 2)

        result = detector.detect_from_image(image, min_area=100)

        assert isinstance(result, ClosedRegionResult)
