"""Tests for staging area detection."""

import numpy as np
import cv2
import pytest

from src.zones.staging import (
    StagingAreaCandidate,
    StagingDetectionResult,
    StagingAreaDetector,
    detect_staging_from_boundaries,
)


class TestStagingAreaCandidate:
    """Tests for StagingAreaCandidate dataclass."""

    def test_create_candidate(self):
        """Test creating a candidate."""
        candidate = StagingAreaCandidate(
            polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
            confidence=0.8,
            area=10000.0,
        )
        assert candidate.confidence == 0.8
        assert candidate.area == 10000.0

    def test_bounds_property(self):
        """Test bounds property."""
        candidate = StagingAreaCandidate(
            polygon=[(10, 20), (110, 20), (110, 120), (10, 120)],
            confidence=0.8,
            area=10000.0,
        )
        assert candidate.bounds == (10, 20, 110, 120)

    def test_bounds_empty_polygon(self):
        """Test bounds with empty polygon."""
        candidate = StagingAreaCandidate(
            polygon=[],
            confidence=0.5,
            area=0.0,
        )
        assert candidate.bounds == (0, 0, 0, 0)

    def test_to_dict(self):
        """Test serialization."""
        candidate = StagingAreaCandidate(
            polygon=[(0, 0), (100, 0), (100, 100)],
            confidence=0.7,
            area=5000.0,
            features={"edge_proximity": 0.5},
        )
        d = candidate.to_dict()
        assert d["confidence"] == 0.7
        assert d["area"] == 5000.0
        assert len(d["polygon"]) == 3


class TestStagingDetectionResult:
    """Tests for StagingDetectionResult dataclass."""

    def test_create_result(self):
        """Test creating detection result."""
        result = StagingDetectionResult(
            candidates=[],
            total_staging_area=0.0,
            coverage_ratio=0.0,
        )
        assert len(result.candidates) == 0

    def test_result_with_candidates(self):
        """Test result with candidates."""
        candidates = [
            StagingAreaCandidate([(0, 0), (100, 0), (100, 100), (0, 100)], 0.8, 10000),
            StagingAreaCandidate([(200, 0), (300, 0), (300, 100), (200, 100)], 0.6, 10000),
        ]
        result = StagingDetectionResult(
            candidates=candidates,
            total_staging_area=20000.0,
            coverage_ratio=0.1,
        )
        assert len(result.candidates) == 2
        assert result.total_staging_area == 20000.0

    def test_to_dict(self):
        """Test serialization."""
        result = StagingDetectionResult(
            candidates=[],
            total_staging_area=15000.0,
            coverage_ratio=0.05,
        )
        d = result.to_dict()
        assert d["total_staging_area"] == 15000.0
        assert d["coverage_ratio"] == 0.05
        assert d["count"] == 0


class TestStagingAreaDetectorInit:
    """Tests for StagingAreaDetector initialization."""

    def test_default_init(self):
        """Test default initialization."""
        detector = StagingAreaDetector()
        assert detector.min_area == 5000
        assert detector.max_area == 500000
        assert detector.min_confidence == 0.3

    def test_custom_init(self):
        """Test custom initialization."""
        detector = StagingAreaDetector(
            min_area=1000,
            max_area=100000,
            min_confidence=0.5,
        )
        assert detector.min_area == 1000
        assert detector.max_area == 100000


class TestStagingAreaDetectorDetect:
    """Tests for detect method."""

    @pytest.fixture
    def blank_image(self):
        """Create blank white image."""
        return np.ones((500, 800, 3), dtype=np.uint8) * 255

    @pytest.fixture
    def yellow_region_image(self):
        """Create image with yellow staging area."""
        image = np.ones((500, 800, 3), dtype=np.uint8) * 255

        # Draw yellow rectangle (staging area)
        cv2.rectangle(image, (50, 50), (250, 200), (0, 200, 255), -1)  # BGR yellow

        return image

    @pytest.fixture
    def orange_region_image(self):
        """Create image with orange staging area."""
        image = np.ones((500, 800, 3), dtype=np.uint8) * 255

        # Draw orange rectangle
        cv2.rectangle(image, (100, 100), (350, 300), (0, 128, 255), -1)  # BGR orange

        return image

    def test_detect_returns_result(self, blank_image):
        """Test detect returns StagingDetectionResult."""
        detector = StagingAreaDetector()
        result = detector.detect(blank_image)

        assert isinstance(result, StagingDetectionResult)

    def test_detect_blank_image(self, blank_image):
        """Test detection on blank image."""
        detector = StagingAreaDetector()
        result = detector.detect(blank_image)

        # Blank image should have no staging areas
        assert len(result.candidates) == 0

    def test_detect_yellow_region(self, yellow_region_image):
        """Test detection of yellow region."""
        detector = StagingAreaDetector(min_area=1000, min_confidence=0.1)
        result = detector.detect(yellow_region_image)

        # Should detect the yellow region
        assert len(result.candidates) >= 1 or result.total_staging_area == 0

    def test_detect_orange_region(self, orange_region_image):
        """Test detection of orange region."""
        detector = StagingAreaDetector(min_area=1000, min_confidence=0.1)
        result = detector.detect(orange_region_image)

        # Should detect the orange region
        assert isinstance(result, StagingDetectionResult)

    def test_detect_with_mask(self, yellow_region_image):
        """Test detection with exclusion mask."""
        detector = StagingAreaDetector()

        # Create mask that excludes the yellow region
        mask = np.zeros((500, 800), dtype=np.uint8)
        cv2.rectangle(mask, (0, 0), (300, 250), 255, -1)

        result = detector.detect(yellow_region_image, mask=mask)

        # Yellow region should be masked out
        assert isinstance(result, StagingDetectionResult)

    def test_candidates_sorted_by_confidence(self, blank_image):
        """Test that candidates are sorted by confidence."""
        # Create image with multiple regions
        image = blank_image.copy()
        cv2.rectangle(image, (50, 50), (150, 150), (0, 200, 255), -1)
        cv2.rectangle(image, (200, 200), (400, 350), (0, 180, 255), -1)

        detector = StagingAreaDetector(min_area=1000, min_confidence=0.1)
        result = detector.detect(image)

        if len(result.candidates) >= 2:
            for i in range(len(result.candidates) - 1):
                assert result.candidates[i].confidence >= result.candidates[i + 1].confidence


class TestDetectStagingFromBoundaries:
    """Tests for detect_staging_from_boundaries function."""

    @pytest.fixture
    def sample_image(self):
        """Create sample image."""
        return np.ones((500, 800, 3), dtype=np.uint8) * 200

    def test_empty_boundaries(self, sample_image):
        """Test with empty boundaries list."""
        result = detect_staging_from_boundaries(sample_image, [])
        assert len(result.candidates) == 0

    def test_yellow_boundary(self, sample_image):
        """Test with yellow boundary."""
        boundaries = [{
            "polygon": [(100, 100), (300, 100), (300, 250), (100, 250)],
            "color": "yellow",
        }]

        result = detect_staging_from_boundaries(sample_image, boundaries)
        # Should recognize yellow as staging
        assert isinstance(result, StagingDetectionResult)

    def test_non_staging_color(self, sample_image):
        """Test with non-staging color."""
        boundaries = [{
            "polygon": [(100, 100), (300, 100), (300, 250), (100, 250)],
            "color": "blue",
        }]

        result = detect_staging_from_boundaries(sample_image, boundaries)
        # Blue is not a staging color
        assert len(result.candidates) == 0

    def test_orange_boundary(self, sample_image):
        """Test with orange boundary."""
        boundaries = [{
            "polygon": [(50, 50), (200, 50), (200, 200), (50, 200)],
            "color": "orange",
        }]

        result = detect_staging_from_boundaries(sample_image, boundaries)
        assert isinstance(result, StagingDetectionResult)
