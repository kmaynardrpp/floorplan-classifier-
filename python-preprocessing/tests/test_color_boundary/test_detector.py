"""
Tests for ColorBoundaryDetector class.

Task 1.7: Implement ColorBoundaryDetector Class
"""

import pytest
import numpy as np
import cv2

from src.color_boundary.detector import ColorBoundaryDetector
from src.color_boundary.color_config import ColorRange, ColorRangeConfig


class TestColorBoundaryDetector:
    """Tests for ColorBoundaryDetector class."""

    def create_hsv_color_image(
        self,
        h: int,
        s: int = 255,
        v: int = 255,
        size: tuple = (100, 100),
    ) -> np.ndarray:
        """Helper to create image with specific HSV color."""
        hsv_image = np.zeros((size[0], size[1], 3), dtype=np.uint8)
        hsv_image[:, :] = (h, s, v)
        bgr_image = cv2.cvtColor(hsv_image, cv2.COLOR_HSV2BGR)
        return bgr_image

    def create_image_with_colored_region(
        self,
        h: int,
        region: tuple,  # (y1, y2, x1, x2)
        size: tuple = (200, 200),
    ) -> np.ndarray:
        """Helper to create image with a colored rectangle on white background."""
        # Start with white image
        image = np.ones((size[0], size[1], 3), dtype=np.uint8) * 255

        # Create colored region in HSV
        y1, y2, x1, x2 = region
        hsv_patch = np.zeros((y2 - y1, x2 - x1, 3), dtype=np.uint8)
        hsv_patch[:, :] = (h, 255, 255)
        bgr_patch = cv2.cvtColor(hsv_patch, cv2.COLOR_HSV2BGR)

        image[y1:y2, x1:x2] = bgr_patch
        return image

    def test_detect_orange_boundaries(self):
        """Test detecting orange boundaries in test image."""
        # Create image with orange region (H=15)
        image = self.create_image_with_colored_region(
            h=15,  # Orange
            region=(50, 150, 50, 150),
            size=(200, 200),
        )

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        # Should find the orange region
        assert len(result.boundaries) >= 1

        # Check that orange is detected
        colors = [b.color for b in result.boundaries]
        assert "orange" in colors

    def test_detect_multiple_colors(self):
        """Test detecting orange and blue boundaries returns both."""
        # Create image with orange and blue regions
        image = np.ones((200, 200, 3), dtype=np.uint8) * 255

        # Add orange region (H=15)
        orange_hsv = np.zeros((50, 50, 3), dtype=np.uint8)
        orange_hsv[:, :] = (15, 255, 255)
        image[25:75, 25:75] = cv2.cvtColor(orange_hsv, cv2.COLOR_HSV2BGR)

        # Add blue region (H=110)
        blue_hsv = np.zeros((50, 50, 3), dtype=np.uint8)
        blue_hsv[:, :] = (110, 255, 255)
        image[125:175, 125:175] = cv2.cvtColor(blue_hsv, cv2.COLOR_HSV2BGR)

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        # Should find both colors
        colors = set(b.color for b in result.boundaries)
        assert "orange" in colors
        assert "blue" in colors

    def test_no_colored_boundaries_returns_empty(self):
        """Test that grayscale image returns empty result with coverage=0."""
        # Create grayscale image
        gray = np.ones((100, 100), dtype=np.uint8) * 128
        image = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        assert len(result.boundaries) == 0
        assert result.coverage_ratio == 0.0

    def test_coverage_ratio_calculated(self):
        """Test that coverage ratio is calculated correctly."""
        # Create image where orange covers ~25% (50x50 in 100x100)
        image = self.create_image_with_colored_region(
            h=15,  # Orange
            region=(25, 75, 25, 75),  # 50x50 region
            size=(100, 100),
        )

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        # Coverage should be approximately 25%
        assert 0.20 < result.coverage_ratio < 0.35

    def test_result_has_correct_structure(self):
        """Test that result has expected attributes."""
        image = self.create_image_with_colored_region(
            h=15,
            region=(20, 80, 20, 80),
            size=(100, 100),
        )

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        # Check result structure
        assert hasattr(result, "boundaries")
        assert hasattr(result, "combined_mask")
        assert hasattr(result, "coverage_ratio")
        assert hasattr(result, "image_shape")

        assert result.image_shape == (100, 100)
        assert result.combined_mask.shape == (100, 100)

    def test_boundary_has_correct_fields(self):
        """Test that detected boundaries have all required fields."""
        image = self.create_image_with_colored_region(
            h=15,
            region=(20, 80, 20, 80),
            size=(100, 100),
        )

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        assert len(result.boundaries) >= 1
        boundary = result.boundaries[0]

        # Check boundary fields
        assert hasattr(boundary, "contour")
        assert hasattr(boundary, "color")
        assert hasattr(boundary, "area")
        assert hasattr(boundary, "polygon")
        assert hasattr(boundary, "confidence")

        assert boundary.confidence == 0.95
        assert boundary.color == "orange"
        assert len(boundary.polygon) >= 3  # At least a triangle

    def test_detect_single_color_orange(self):
        """Test detect_single_color for orange only."""
        image = self.create_image_with_colored_region(
            h=15,
            region=(20, 80, 20, 80),
            size=(100, 100),
        )

        detector = ColorBoundaryDetector(min_contour_area=100)
        boundaries = detector.detect_single_color(image, "orange")

        assert len(boundaries) >= 1
        assert all(b.color == "orange" for b in boundaries)

    def test_detect_single_color_unknown_raises(self):
        """Test that unknown color raises ValueError."""
        image = np.zeros((100, 100, 3), dtype=np.uint8)

        detector = ColorBoundaryDetector()

        with pytest.raises(ValueError, match="Unknown color"):
            detector.detect_single_color(image, "purple")

    def test_custom_config(self):
        """Test detector with custom configuration."""
        custom_range = ColorRange(
            lower=(40, 100, 100),  # Green range
            upper=(80, 255, 255),
        )

        config = ColorRangeConfig()
        config.add_range("green", custom_range)

        # Create green image
        image = self.create_image_with_colored_region(
            h=60,  # Green
            region=(20, 80, 20, 80),
            size=(100, 100),
        )

        detector = ColorBoundaryDetector(config=config, min_contour_area=100)
        result = detector.detect(image)

        colors = [b.color for b in result.boundaries]
        assert "green" in colors


class TestColorBoundaryDetectorRedWrapAround:
    """Tests for red hue wrap-around handling."""

    def create_red_image(self, h: int, size: tuple = (100, 100)) -> np.ndarray:
        """Create image with red color at specific hue."""
        hsv = np.zeros((size[0], size[1], 3), dtype=np.uint8)
        hsv[:, :] = (h, 255, 255)
        return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    def test_detects_red_at_h5(self):
        """Test detection of red at H=5 (low end)."""
        image = self.create_red_image(h=5)

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        colors = [b.color for b in result.boundaries]
        assert "red" in colors

    def test_detects_red_at_h175(self):
        """Test detection of red at H=175 (high end)."""
        image = self.create_red_image(h=175)

        detector = ColorBoundaryDetector(min_contour_area=100)
        result = detector.detect(image)

        colors = [b.color for b in result.boundaries]
        assert "red" in colors

    def test_detect_single_color_red(self):
        """Test detect_single_color for red."""
        image = self.create_red_image(h=5)

        detector = ColorBoundaryDetector(min_contour_area=100)
        boundaries = detector.detect_single_color(image, "red")

        assert len(boundaries) >= 1
        assert all(b.color == "red" for b in boundaries)
