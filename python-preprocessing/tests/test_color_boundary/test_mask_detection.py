"""
Tests for color mask detection and cleaning.

Task 1.3: Single-Color Mask Detection
Task 1.4: Morphological Mask Cleaning
"""

import pytest
import numpy as np
import cv2

from src.color_boundary.mask_detection import (
    create_color_mask,
    create_red_mask,
    clean_mask,
    detect_and_clean_color,
)
from src.color_boundary.color_config import ColorRange


class TestCreateColorMask:
    """Tests for create_color_mask function (Task 1.3)."""

    def create_solid_color_image(self, color_bgr: tuple, size: tuple = (100, 100)) -> np.ndarray:
        """Helper to create a solid color image."""
        image = np.zeros((size[0], size[1], 3), dtype=np.uint8)
        image[:, :] = color_bgr
        return image

    def test_pure_orange_image_full_mask(self):
        """Test that pure orange image (H=15) results in ~100% mask."""
        # Create orange image (BGR: blue, green, red)
        # Orange in BGR is approximately (0, 128, 255)
        # In HSV, orange is around H=15-20
        orange_bgr = (0, 128, 255)  # Orange in BGR
        image = self.create_solid_color_image(orange_bgr)

        # Orange color range
        orange_range = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )

        mask = create_color_mask(image, orange_range)

        # Mask should be all white (255) for orange image
        assert mask.dtype == np.uint8
        assert mask.shape == (100, 100)

        # Calculate coverage
        coverage = np.count_nonzero(mask) / mask.size
        assert coverage > 0.95, f"Expected >95% coverage, got {coverage*100:.1f}%"

    def test_blue_image_zero_mask_for_orange_range(self):
        """Test that blue image results in 0% mask for orange range."""
        # Pure blue in BGR
        blue_bgr = (255, 0, 0)
        image = self.create_solid_color_image(blue_bgr)

        # Orange color range
        orange_range = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )

        mask = create_color_mask(image, orange_range)

        # Mask should be all black (0)
        coverage = np.count_nonzero(mask) / mask.size
        assert coverage == 0.0, f"Expected 0% coverage, got {coverage*100:.1f}%"

    def test_returns_correct_dtype_and_shape(self):
        """Test mask returns correct dtype (uint8) and shape."""
        image = np.zeros((200, 300, 3), dtype=np.uint8)
        color_range = ColorRange(
            lower=(0, 0, 0),
            upper=(180, 255, 255),
        )

        mask = create_color_mask(image, color_range)

        assert mask.dtype == np.uint8
        assert mask.shape == (200, 300)


class TestRedWrapAround:
    """Tests for red hue wrap-around detection."""

    def create_hsv_color_image(self, h: int, s: int = 255, v: int = 255, size: tuple = (100, 100)) -> np.ndarray:
        """Helper to create image with specific HSV color."""
        hsv_image = np.zeros((size[0], size[1], 3), dtype=np.uint8)
        hsv_image[:, :] = (h, s, v)
        bgr_image = cv2.cvtColor(hsv_image, cv2.COLOR_HSV2BGR)
        return bgr_image

    def test_red_low_hue_detected(self):
        """Test that red at H=5 is detected by red mask."""
        image = self.create_hsv_color_image(h=5)

        mask = create_red_mask(image)

        coverage = np.count_nonzero(mask) / mask.size
        assert coverage > 0.95, f"Expected H=5 to be detected as red, got {coverage*100:.1f}%"

    def test_red_high_hue_detected(self):
        """Test that red at H=175 is detected by red mask."""
        image = self.create_hsv_color_image(h=175)

        mask = create_red_mask(image)

        coverage = np.count_nonzero(mask) / mask.size
        assert coverage > 0.95, f"Expected H=175 to be detected as red, got {coverage*100:.1f}%"

    def test_red_at_boundary_h0_detected(self):
        """Test that red at H=0 (boundary) is detected."""
        image = self.create_hsv_color_image(h=0)

        mask = create_red_mask(image)

        coverage = np.count_nonzero(mask) / mask.size
        assert coverage > 0.95, f"Expected H=0 to be detected as red, got {coverage*100:.1f}%"

    def test_non_red_not_detected(self):
        """Test that green (H=60) is not detected as red."""
        image = self.create_hsv_color_image(h=60)

        mask = create_red_mask(image)

        coverage = np.count_nonzero(mask) / mask.size
        assert coverage < 0.05, f"Expected H=60 (green) to NOT be detected as red, got {coverage*100:.1f}%"


class TestCleanMask:
    """Tests for clean_mask function (Task 1.4)."""

    def test_single_pixel_noise_removed(self):
        """Test that isolated single-pixel noise is removed by open operation."""
        # Create mask with scattered single pixels
        mask = np.zeros((100, 100), dtype=np.uint8)
        # Add single pixel noise
        mask[10, 10] = 255
        mask[50, 50] = 255
        mask[80, 80] = 255

        cleaned = clean_mask(mask, close_iterations=0, open_iterations=1)

        # All isolated pixels should be removed
        assert np.count_nonzero(cleaned) == 0

    def test_small_gaps_closed(self):
        """Test that small gaps in lines are closed by close operation."""
        # Create horizontal line with a small gap
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[50, 10:45] = 255  # Left part of line
        mask[50, 48:90] = 255  # Right part of line (3-pixel gap)

        cleaned = clean_mask(mask, close_iterations=2, open_iterations=0, kernel_size=5)

        # Check if gap is filled (pixels around row 50, col 45-48)
        # The line should now be continuous
        row_sum = np.count_nonzero(cleaned[50, :])
        original_sum = np.count_nonzero(mask[50, :])
        assert row_sum >= original_sum, "Closing should not reduce line length"

    def test_large_solid_region_preserved(self):
        """Test that large solid regions are preserved."""
        # Create a large solid rectangle
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 20:80] = 255

        original_area = np.count_nonzero(mask)

        cleaned = clean_mask(mask, close_iterations=2, open_iterations=1)

        cleaned_area = np.count_nonzero(cleaned)

        # Area should be approximately preserved (within 10%)
        assert abs(cleaned_area - original_area) / original_area < 0.1

    def test_empty_mask_returns_empty(self):
        """Test that empty mask returns empty mask."""
        mask = np.zeros((100, 100), dtype=np.uint8)

        cleaned = clean_mask(mask)

        assert np.count_nonzero(cleaned) == 0

    def test_empty_array_handled(self):
        """Test that zero-size mask doesn't crash."""
        mask = np.array([], dtype=np.uint8)

        cleaned = clean_mask(mask)

        assert cleaned.size == 0


class TestDetectAndClean:
    """Tests for combined detect_and_clean_color function."""

    def test_combines_detection_and_cleaning(self):
        """Test that detect_and_clean_color produces cleaned result."""
        # Create orange rectangle
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        # Orange in BGR
        image[20:80, 20:80] = (0, 128, 255)

        orange_range = ColorRange(
            lower=(10, 100, 100),
            upper=(25, 255, 255),
        )

        mask = detect_and_clean_color(
            image,
            orange_range,
            close_iterations=2,
            open_iterations=1,
        )

        # Should have detected the orange region
        assert np.count_nonzero(mask) > 0
        assert mask.dtype == np.uint8
