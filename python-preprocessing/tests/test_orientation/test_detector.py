"""Tests for orientation detector."""

import numpy as np
import cv2
import pytest

from src.orientation.models import Orientation, OrientationResult
from src.orientation.detector import OrientationDetector


class TestOrientationDetectorInit:
    """Tests for OrientationDetector initialization."""

    def test_default_init(self):
        """Test default initialization."""
        detector = OrientationDetector()
        assert detector.use_text_detection is True
        assert detector.use_line_detection is True
        assert detector.use_boundary_analysis is True
        assert detector.min_confidence == 0.6

    def test_custom_init(self):
        """Test custom initialization."""
        detector = OrientationDetector(
            use_text_detection=False,
            use_line_detection=True,
            use_boundary_analysis=False,
            min_confidence=0.8,
        )
        assert detector.use_text_detection is False
        assert detector.use_line_detection is True
        assert detector.use_boundary_analysis is False
        assert detector.min_confidence == 0.8


class TestOrientationDetectorDetect:
    """Tests for detect method."""

    @pytest.fixture
    def grid_image(self):
        """Create image with clear grid pattern (horizontal and vertical lines)."""
        image = np.ones((500, 800, 3), dtype=np.uint8) * 255

        # Draw horizontal lines
        for y in range(50, 450, 50):
            cv2.line(image, (50, y), (750, y), (0, 0, 0), 2)

        # Draw vertical lines
        for x in range(50, 750, 50):
            cv2.line(image, (x, 50), (x, 450), (0, 0, 0), 2)

        return image

    @pytest.fixture
    def vertical_lines_image(self):
        """Create image with only vertical lines."""
        image = np.ones((800, 500, 3), dtype=np.uint8) * 255

        # Draw only vertical lines
        for x in range(50, 450, 50):
            cv2.line(image, (x, 50), (x, 750), (0, 0, 0), 2)

        return image

    @pytest.fixture
    def simple_image(self):
        """Create simple test image."""
        return np.ones((300, 400, 3), dtype=np.uint8) * 200

    def test_detect_returns_result(self, simple_image):
        """Test that detect returns an OrientationResult."""
        detector = OrientationDetector()
        result = detector.detect(simple_image)

        assert isinstance(result, OrientationResult)
        assert result.detected_orientation is not None
        assert 0.0 <= result.confidence <= 1.0

    def test_detect_grid_image(self, grid_image):
        """Test detection on image with clear grid pattern."""
        detector = OrientationDetector(min_confidence=0.3)
        result = detector.detect(grid_image)

        # Grid image should be detected as correct orientation
        assert isinstance(result, OrientationResult)
        # With balanced H/V lines, should likely be NORTH
        assert result.detected_orientation in [Orientation.NORTH, Orientation.EAST]

    def test_detect_landscape_image(self, simple_image):
        """Test detection on landscape image."""
        detector = OrientationDetector()
        result = detector.detect(simple_image)

        # Landscape image should be detected as correct orientation
        assert isinstance(result, OrientationResult)

    def test_detect_portrait_image(self):
        """Test detection on portrait image."""
        # Create tall image (portrait)
        image = np.ones((600, 300, 3), dtype=np.uint8) * 200

        detector = OrientationDetector(min_confidence=0.1)
        result = detector.detect(image)

        # Portrait may suggest rotation needed
        assert isinstance(result, OrientationResult)

    def test_detect_with_disabled_line_detection(self, grid_image):
        """Test detection with line detection disabled."""
        detector = OrientationDetector(use_line_detection=False)
        result = detector.detect(grid_image)

        # Should still return result from other sources
        assert isinstance(result, OrientationResult)

    def test_detect_with_all_disabled(self, simple_image):
        """Test detection with all methods disabled."""
        detector = OrientationDetector(
            use_text_detection=False,
            use_line_detection=False,
            use_boundary_analysis=False,
        )
        result = detector.detect(simple_image)

        # Should fall back to default (NORTH)
        assert isinstance(result, OrientationResult)

    def test_hints_are_collected(self, grid_image):
        """Test that detection collects hints from multiple sources."""
        detector = OrientationDetector(min_confidence=0.1)
        result = detector.detect(grid_image)

        # Should have hints from enabled sources
        assert len(result.hints) >= 1


class TestOrientationDetectorLineDetection:
    """Tests for line-based detection."""

    def test_detect_horizontal_dominant(self):
        """Test detection when horizontal lines dominate."""
        image = np.ones((500, 800, 3), dtype=np.uint8) * 255

        # Draw many horizontal lines
        for y in range(50, 450, 20):
            cv2.line(image, (50, y), (750, y), (0, 0, 0), 2)

        detector = OrientationDetector(use_text_detection=False, use_boundary_analysis=False)
        result = detector.detect(image)

        assert isinstance(result, OrientationResult)

    def test_detect_no_lines(self):
        """Test detection on image with no lines."""
        # Plain gray image
        image = np.ones((500, 800, 3), dtype=np.uint8) * 128

        detector = OrientationDetector(use_text_detection=False, use_boundary_analysis=False)
        result = detector.detect(image)

        # Should still return a result
        assert isinstance(result, OrientationResult)


class TestOrientationDetectorAspectRatio:
    """Tests for aspect ratio based detection."""

    def test_wide_image_landscape(self):
        """Test wide (landscape) image detection."""
        image = np.ones((300, 600, 3), dtype=np.uint8) * 200

        detector = OrientationDetector(
            use_text_detection=False,
            use_line_detection=False,
            use_boundary_analysis=False,
        )
        result = detector.detect(image)

        # Wide image should suggest correct orientation
        assert isinstance(result, OrientationResult)
        # Should have aspect ratio hint
        aspect_hints = [h for h in result.hints if h.source == "aspect_ratio"]
        assert len(aspect_hints) >= 1

    def test_tall_image_portrait(self):
        """Test tall (portrait) image detection."""
        image = np.ones((600, 300, 3), dtype=np.uint8) * 200

        detector = OrientationDetector(
            use_text_detection=False,
            use_line_detection=False,
            use_boundary_analysis=False,
            min_confidence=0.1,
        )
        result = detector.detect(image)

        # Tall image may suggest rotation
        assert isinstance(result, OrientationResult)
        aspect_hints = [h for h in result.hints if h.source == "aspect_ratio"]
        assert len(aspect_hints) >= 1

    def test_square_image_no_hint(self):
        """Test square image gives no aspect ratio hint."""
        image = np.ones((500, 500, 3), dtype=np.uint8) * 200

        detector = OrientationDetector(
            use_text_detection=False,
            use_line_detection=False,
            use_boundary_analysis=False,
        )
        result = detector.detect(image)

        # Square image shouldn't have aspect ratio hint
        aspect_hints = [h for h in result.hints if h.source == "aspect_ratio"]
        assert len(aspect_hints) == 0
