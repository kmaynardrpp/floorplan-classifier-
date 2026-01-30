"""
Programmatic test image generation for color boundary tests.

Task 1.8: Create Sample Test Images
"""

import numpy as np
import cv2
from typing import Tuple


def create_orange_square(size: Tuple[int, int] = (200, 200), square_size: int = 100) -> np.ndarray:
    """
    Create white background with orange square (known area).

    Args:
        size: Image dimensions (height, width)
        square_size: Size of the orange square

    Returns:
        BGR image with orange square in center
    """
    image = np.ones((size[0], size[1], 3), dtype=np.uint8) * 255  # White background

    # Calculate centered position
    y_start = (size[0] - square_size) // 2
    x_start = (size[1] - square_size) // 2

    # Create orange region in HSV
    hsv_patch = np.zeros((square_size, square_size, 3), dtype=np.uint8)
    hsv_patch[:, :] = (15, 255, 255)  # Orange: H=15
    bgr_patch = cv2.cvtColor(hsv_patch, cv2.COLOR_HSV2BGR)

    image[y_start:y_start + square_size, x_start:x_start + square_size] = bgr_patch

    return image


def create_multi_color(size: Tuple[int, int] = (300, 300)) -> np.ndarray:
    """
    Create image with orange, yellow, and blue shapes.

    Returns:
        BGR image with three colored regions
    """
    image = np.ones((size[0], size[1], 3), dtype=np.uint8) * 255

    # Orange rectangle (top-left)
    orange_hsv = np.zeros((80, 80, 3), dtype=np.uint8)
    orange_hsv[:, :] = (15, 255, 255)
    image[20:100, 20:100] = cv2.cvtColor(orange_hsv, cv2.COLOR_HSV2BGR)

    # Yellow rectangle (top-right)
    yellow_hsv = np.zeros((80, 80, 3), dtype=np.uint8)
    yellow_hsv[:, :] = (30, 255, 255)
    image[20:100, 200:280] = cv2.cvtColor(yellow_hsv, cv2.COLOR_HSV2BGR)

    # Blue rectangle (bottom-center)
    blue_hsv = np.zeros((80, 80, 3), dtype=np.uint8)
    blue_hsv[:, :] = (110, 255, 255)
    image[200:280, 110:190] = cv2.cvtColor(blue_hsv, cv2.COLOR_HSV2BGR)

    return image


def create_no_boundaries(size: Tuple[int, int] = (200, 200)) -> np.ndarray:
    """
    Create grayscale image with no colored boundaries.

    Returns:
        BGR image that is pure grayscale
    """
    gray = np.ones((size[0], size[1]), dtype=np.uint8) * 180
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def create_complex_boundaries(size: Tuple[int, int] = (300, 300)) -> np.ndarray:
    """
    Create image with overlapping/adjacent colored regions.

    Returns:
        BGR image with complex boundary patterns
    """
    image = np.ones((size[0], size[1], 3), dtype=np.uint8) * 255

    # Two adjacent orange rectangles (should merge in detection)
    orange_hsv = np.zeros((60, 60, 3), dtype=np.uint8)
    orange_hsv[:, :] = (15, 255, 255)
    orange_bgr = cv2.cvtColor(orange_hsv, cv2.COLOR_HSV2BGR)

    image[50:110, 50:110] = orange_bgr
    image[50:110, 108:168] = orange_bgr  # Adjacent (2px gap)

    # L-shaped yellow region
    yellow_hsv = np.zeros((1, 1, 3), dtype=np.uint8)
    yellow_hsv[:, :] = (30, 255, 255)
    yellow_bgr = cv2.cvtColor(yellow_hsv, cv2.COLOR_HSV2BGR)[0, 0]

    image[180:250, 50:80] = yellow_bgr  # Vertical part
    image[220:250, 50:120] = yellow_bgr  # Horizontal part

    return image


def get_expected_orange_square_area(size: Tuple[int, int] = (200, 200), square_size: int = 100) -> int:
    """Get the expected area of the orange square in pixels."""
    return square_size * square_size


def get_expected_multi_color_count() -> int:
    """Get the expected number of distinct colored regions."""
    return 3  # orange, yellow, blue
