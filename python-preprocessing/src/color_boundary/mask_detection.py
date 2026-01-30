"""
Color mask detection and cleaning operations.

Task 1.3: Implement Single-Color Mask Detection
Task 1.4: Implement Morphological Mask Cleaning
"""

import cv2
import numpy as np
from typing import Tuple, Optional

from .color_config import ColorRange


def create_color_mask(
    image: np.ndarray,
    color_range: ColorRange,
) -> np.ndarray:
    """
    Create a binary mask for pixels within a specified HSV color range.

    Args:
        image: BGR image (from cv2.imread)
        color_range: HSV color range to detect

    Returns:
        Binary mask (uint8) where detected pixels are 255, others are 0

    Example:
        >>> mask = create_color_mask(image, ColorRange((10, 100, 100), (25, 255, 255)))
    """
    # Convert BGR to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Get numpy arrays for cv2.inRange
    lower, upper = color_range.to_numpy()

    # Create mask
    mask = cv2.inRange(hsv, lower, upper)

    return mask


def create_red_mask(
    image: np.ndarray,
    red_low_range: Optional[ColorRange] = None,
    red_high_range: Optional[ColorRange] = None,
) -> np.ndarray:
    """
    Create a mask for red colors, handling the hue wrap-around at 0/180.

    Red colors span both ends of the hue spectrum in HSV:
    - Low red: 0-10 (wraps from 180)
    - High red: 160-180 (approaching wrap)

    Args:
        image: BGR image
        red_low_range: Range for low red hues (default: 0-10)
        red_high_range: Range for high red hues (default: 160-180)

    Returns:
        Combined binary mask for red colors
    """
    from .color_config import DEFAULT_COLOR_RANGES

    # Use defaults if not provided
    if red_low_range is None:
        red_low_range = DEFAULT_COLOR_RANGES.get("red_low")
    if red_high_range is None:
        red_high_range = DEFAULT_COLOR_RANGES.get("red_high")

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Create masks for both red ranges
    masks = []

    if red_low_range is not None:
        lower, upper = red_low_range.to_numpy()
        masks.append(cv2.inRange(hsv, lower, upper))

    if red_high_range is not None:
        lower, upper = red_high_range.to_numpy()
        masks.append(cv2.inRange(hsv, lower, upper))

    # Combine masks
    if len(masks) == 0:
        return np.zeros(image.shape[:2], dtype=np.uint8)
    elif len(masks) == 1:
        return masks[0]
    else:
        return cv2.bitwise_or(masks[0], masks[1])


def clean_mask(
    mask: np.ndarray,
    close_iterations: int = 2,
    open_iterations: int = 1,
    kernel_size: int = 3,
) -> np.ndarray:
    """
    Clean up a binary mask using morphological operations.

    Operations applied in order:
    1. MORPH_CLOSE: Fill small gaps in boundary lines
    2. MORPH_OPEN: Remove isolated noise pixels

    Args:
        mask: Binary mask (uint8)
        close_iterations: Number of closing iterations (fills gaps)
        open_iterations: Number of opening iterations (removes noise)
        kernel_size: Size of the structuring element (kernel_size x kernel_size)

    Returns:
        Cleaned binary mask

    Example:
        >>> cleaned = clean_mask(mask, close_iterations=2, open_iterations=1)
    """
    # Handle empty mask
    if mask.size == 0:
        return mask

    # Handle all-zero mask
    if np.count_nonzero(mask) == 0:
        return mask.copy()

    # Create structuring element
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (kernel_size, kernel_size)
    )

    result = mask.copy()

    # Apply closing (dilate then erode) - fills small gaps
    if close_iterations > 0:
        result = cv2.morphologyEx(
            result,
            cv2.MORPH_CLOSE,
            kernel,
            iterations=close_iterations
        )

    # Apply opening (erode then dilate) - removes small noise
    if open_iterations > 0:
        result = cv2.morphologyEx(
            result,
            cv2.MORPH_OPEN,
            kernel,
            iterations=open_iterations
        )

    return result


def detect_and_clean_color(
    image: np.ndarray,
    color_range: ColorRange,
    close_iterations: int = 2,
    open_iterations: int = 1,
    kernel_size: int = 3,
) -> np.ndarray:
    """
    Detect color and clean the resulting mask in one step.

    Convenience function that combines create_color_mask and clean_mask.

    Args:
        image: BGR image
        color_range: HSV color range to detect
        close_iterations: Morphological closing iterations
        open_iterations: Morphological opening iterations
        kernel_size: Structuring element size

    Returns:
        Cleaned binary mask
    """
    mask = create_color_mask(image, color_range)
    return clean_mask(mask, close_iterations, open_iterations, kernel_size)
