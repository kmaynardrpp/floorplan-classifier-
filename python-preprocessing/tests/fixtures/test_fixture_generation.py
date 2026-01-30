"""
Tests for fixture generation.

Task 1.8: Create Sample Test Images
"""

import pytest
import numpy as np

from tests.fixtures.color_boundary_fixtures import (
    create_orange_square,
    create_multi_color,
    create_no_boundaries,
    create_complex_boundaries,
    get_expected_orange_square_area,
    get_expected_multi_color_count,
)


class TestFixtureGeneration:
    """Tests for programmatic fixture generation."""

    def test_orange_square_correct_dimensions(self):
        """Test orange_square has correct dimensions."""
        image = create_orange_square(size=(200, 200))

        assert image.shape == (200, 200, 3)
        assert image.dtype == np.uint8

    def test_orange_square_has_orange_pixels(self):
        """Test orange_square has orange pixels in center."""
        import cv2

        image = create_orange_square(size=(200, 200), square_size=100)

        # Convert center pixel to HSV and check hue
        center_bgr = image[100, 100]
        center_hsv = cv2.cvtColor(
            np.array([[center_bgr]], dtype=np.uint8),
            cv2.COLOR_BGR2HSV
        )[0, 0]

        # Orange hue should be around 10-25
        assert 10 <= center_hsv[0] <= 25, f"Center hue {center_hsv[0]} not orange"

    def test_multi_color_correct_dimensions(self):
        """Test multi_color has correct dimensions."""
        image = create_multi_color(size=(300, 300))

        assert image.shape == (300, 300, 3)

    def test_multi_color_has_three_colors(self):
        """Test multi_color has orange, yellow, and blue regions."""
        import cv2

        image = create_multi_color()

        # Check specific pixel locations
        # Orange at top-left (around 50, 50)
        orange_pixel = image[50, 50]
        orange_hsv = cv2.cvtColor(
            np.array([[orange_pixel]], dtype=np.uint8),
            cv2.COLOR_BGR2HSV
        )[0, 0]
        assert 10 <= orange_hsv[0] <= 25, "Expected orange at top-left"

        # Yellow at top-right (around 50, 240)
        yellow_pixel = image[50, 240]
        yellow_hsv = cv2.cvtColor(
            np.array([[yellow_pixel]], dtype=np.uint8),
            cv2.COLOR_BGR2HSV
        )[0, 0]
        assert 25 <= yellow_hsv[0] <= 35, "Expected yellow at top-right"

        # Blue at bottom-center (around 240, 150)
        blue_pixel = image[240, 150]
        blue_hsv = cv2.cvtColor(
            np.array([[blue_pixel]], dtype=np.uint8),
            cv2.COLOR_BGR2HSV
        )[0, 0]
        assert 100 <= blue_hsv[0] <= 130, "Expected blue at bottom-center"

    def test_no_boundaries_is_grayscale(self):
        """Test no_boundaries is grayscale (no saturation)."""
        import cv2

        image = create_no_boundaries()
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

        # All pixels should have 0 saturation
        assert np.all(hsv[:, :, 1] == 0), "Expected grayscale image (0 saturation)"

    def test_complex_boundaries_has_regions(self):
        """Test complex_boundaries creates non-white regions."""
        image = create_complex_boundaries()

        # Check that not all pixels are white
        white_count = np.sum(np.all(image == 255, axis=2))
        total_pixels = image.shape[0] * image.shape[1]

        # At least 10% should be colored
        assert white_count < total_pixels * 0.9

    def test_expected_area_calculation(self):
        """Test expected area helpers."""
        assert get_expected_orange_square_area() == 10000
        assert get_expected_orange_square_area(square_size=50) == 2500
        assert get_expected_multi_color_count() == 3
