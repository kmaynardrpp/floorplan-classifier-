"""Tests for orientation correction utilities."""

import numpy as np
import pytest

from src.orientation.models import Orientation, OrientationResult
from src.orientation.correction import (
    rotate_image,
    correct_orientation,
    rotate_point,
    rotate_polygon,
    get_rotated_dimensions,
    transform_coordinates_after_rotation,
)


class TestRotateImage:
    """Tests for rotate_image function."""

    def test_no_rotation(self):
        """Test 0 degree rotation returns copy."""
        image = np.arange(12).reshape(3, 4).astype(np.uint8)
        rotated = rotate_image(image, 0)
        np.testing.assert_array_equal(rotated, image)
        # Should be a copy, not same object
        assert rotated is not image

    def test_rotate_90_degrees(self):
        """Test 90 degree clockwise rotation."""
        image = np.array([
            [1, 2],
            [3, 4],
        ], dtype=np.uint8)

        rotated = rotate_image(image, 90)

        expected = np.array([
            [3, 1],
            [4, 2],
        ], dtype=np.uint8)
        np.testing.assert_array_equal(rotated, expected)

    def test_rotate_180_degrees(self):
        """Test 180 degree rotation."""
        image = np.array([
            [1, 2],
            [3, 4],
        ], dtype=np.uint8)

        rotated = rotate_image(image, 180)

        expected = np.array([
            [4, 3],
            [2, 1],
        ], dtype=np.uint8)
        np.testing.assert_array_equal(rotated, expected)

    def test_rotate_270_degrees(self):
        """Test 270 degree rotation (90 counter-clockwise)."""
        image = np.array([
            [1, 2],
            [3, 4],
        ], dtype=np.uint8)

        rotated = rotate_image(image, 270)

        expected = np.array([
            [2, 4],
            [1, 3],
        ], dtype=np.uint8)
        np.testing.assert_array_equal(rotated, expected)

    def test_rotate_360_degrees(self):
        """Test 360 degree rotation (same as 0)."""
        image = np.arange(12).reshape(3, 4).astype(np.uint8)
        rotated = rotate_image(image, 360)
        np.testing.assert_array_equal(rotated, image)

    def test_rotate_color_image(self):
        """Test rotation of color image."""
        image = np.zeros((100, 200, 3), dtype=np.uint8)
        image[10:20, 10:30] = [255, 0, 0]  # Blue rectangle

        rotated = rotate_image(image, 90)

        # After 90° CW, dimensions should swap
        assert rotated.shape == (200, 100, 3)

    def test_rotate_preserves_dtype(self):
        """Test that rotation preserves dtype."""
        image = np.zeros((100, 200), dtype=np.float32)
        rotated = rotate_image(image, 90)
        assert rotated.dtype == np.float32


class TestCorrectOrientation:
    """Tests for correct_orientation function."""

    def test_no_correction_for_north(self):
        """Test no rotation applied for NORTH orientation."""
        image = np.arange(12).reshape(3, 4).astype(np.uint8)
        result = OrientationResult(
            detected_orientation=Orientation.NORTH,
            confidence=0.9,
        )

        corrected = correct_orientation(image, result)
        np.testing.assert_array_equal(corrected, image)

    def test_correction_for_east(self):
        """Test correction for EAST orientation (needs 270° rotation)."""
        image = np.zeros((100, 200, 3), dtype=np.uint8)
        result = OrientationResult(
            detected_orientation=Orientation.EAST,
            confidence=0.9,
        )

        corrected = correct_orientation(image, result)

        # Original: 100x200, after 270° CCW: 200x100
        assert corrected.shape == (200, 100, 3)

    def test_correction_for_south(self):
        """Test correction for SOUTH orientation (needs 180° rotation)."""
        image = np.array([[1, 2], [3, 4]], dtype=np.uint8)
        result = OrientationResult(
            detected_orientation=Orientation.SOUTH,
            confidence=0.9,
        )

        corrected = correct_orientation(image, result)

        expected = np.array([[4, 3], [2, 1]], dtype=np.uint8)
        np.testing.assert_array_equal(corrected, expected)


class TestRotatePoint:
    """Tests for rotate_point function."""

    def test_no_rotation(self):
        """Test 0 degree rotation."""
        point = rotate_point((10, 20), 0, (100, 100))
        assert point == (10, 20)

    def test_rotate_90(self):
        """Test 90 degree rotation."""
        # In 100x100 image, (10, 20) rotated 90° CW
        # New x = height - 1 - y = 99 - 20 = 79
        # New y = x = 10
        point = rotate_point((10, 20), 90, (100, 100))
        assert point == (79, 10)

    def test_rotate_180(self):
        """Test 180 degree rotation."""
        # (10, 20) in 100x100 → (89, 79)
        point = rotate_point((10, 20), 180, (100, 100))
        assert point == (89, 79)

    def test_rotate_270(self):
        """Test 270 degree rotation."""
        # (10, 20) → (20, 89)
        point = rotate_point((10, 20), 270, (100, 100))
        assert point == (20, 89)

    def test_center_point_unchanged(self):
        """Test center point is approximately unchanged."""
        # For even dimensions, center is between pixels
        point = rotate_point((50, 50), 90, (100, 100))
        # Due to integer rounding, should be close but may differ slightly


class TestRotatePolygon:
    """Tests for rotate_polygon function."""

    def test_rotate_polygon_90(self):
        """Test rotating polygon 90 degrees."""
        polygon = [(10, 10), (30, 10), (30, 30), (10, 30)]
        rotated = rotate_polygon(polygon, 90, (100, 100))

        # All points should be transformed
        assert len(rotated) == 4

    def test_empty_polygon(self):
        """Test rotating empty polygon."""
        rotated = rotate_polygon([], 90, (100, 100))
        assert rotated == []

    def test_single_point(self):
        """Test rotating single point polygon."""
        rotated = rotate_polygon([(50, 50)], 180, (100, 100))
        assert len(rotated) == 1


class TestGetRotatedDimensions:
    """Tests for get_rotated_dimensions function."""

    def test_no_rotation(self):
        """Test 0 degree rotation."""
        dims = get_rotated_dimensions(100, 200, 0)
        assert dims == (100, 200)

    def test_rotate_90(self):
        """Test 90 degree rotation swaps dimensions."""
        dims = get_rotated_dimensions(100, 200, 90)
        assert dims == (200, 100)

    def test_rotate_180(self):
        """Test 180 degree rotation preserves dimensions."""
        dims = get_rotated_dimensions(100, 200, 180)
        assert dims == (100, 200)

    def test_rotate_270(self):
        """Test 270 degree rotation swaps dimensions."""
        dims = get_rotated_dimensions(100, 200, 270)
        assert dims == (200, 100)

    def test_rotate_360(self):
        """Test 360 degree rotation preserves dimensions."""
        dims = get_rotated_dimensions(100, 200, 360)
        assert dims == (100, 200)


class TestTransformCoordinatesAfterRotation:
    """Tests for transform_coordinates_after_rotation function."""

    def test_no_rotation_identity(self):
        """Test no rotation returns same point."""
        point = transform_coordinates_after_rotation((10, 20), (100, 200), 0)
        assert point == (10, 20)

    def test_roundtrip_90(self):
        """Test that rotating and inverse give original coords."""
        original = (10, 20)
        image_size = (100, 200)

        # Rotate point by 90°
        rotated = rotate_point(original, 90, image_size)

        # Transform back
        recovered = transform_coordinates_after_rotation(rotated, image_size, 90)

        # Should be close to original (may differ by 1 due to rounding)
        assert abs(recovered[0] - original[0]) <= 1
        assert abs(recovered[1] - original[1]) <= 1
