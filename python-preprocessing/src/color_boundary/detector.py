"""
Main ColorBoundaryDetector class that orchestrates the full detection pipeline.

Task 1.7: Implement ColorBoundaryDetector Class
"""

import cv2
import numpy as np
from typing import List, Optional, Dict

from .models import ColorBoundaryResult, DetectedBoundary
from .color_config import ColorRange, ColorRangeConfig, DEFAULT_COLOR_RANGES
from .mask_detection import create_color_mask, create_red_mask, clean_mask
from .contour_extraction import extract_contours, contour_to_polygon
from .metrics import calculate_coverage_from_mask


class ColorBoundaryDetector:
    """
    Detects pre-drawn zone boundaries based on color signatures.

    This is the main Phase 0 detector that identifies colored lines
    (orange, yellow, red, blue) that define zone boundaries in floorplans.

    Example:
        >>> detector = ColorBoundaryDetector()
        >>> result = detector.detect(image)
        >>> print(f"Found {len(result.boundaries)} boundaries")
        >>> print(f"Coverage: {result.coverage_ratio * 100:.1f}%")
    """

    def __init__(
        self,
        config: Optional[ColorRangeConfig] = None,
        min_contour_area: Optional[int] = None,
        epsilon_factor: float = 0.02,
        close_iterations: int = 2,
        open_iterations: int = 1,
        kernel_size: int = 3,
    ):
        """
        Initialize the color boundary detector.

        Args:
            config: Color range configuration. If None, uses defaults.
            min_contour_area: Override minimum contour area from config.
            epsilon_factor: Polygon simplification factor (0.01-0.05).
            close_iterations: Morphological closing iterations.
            open_iterations: Morphological opening iterations.
            kernel_size: Morphology kernel size.
        """
        self.config = config or ColorRangeConfig.default()

        # Override min_contour_area if provided
        if min_contour_area is not None:
            self.min_contour_area = min_contour_area
        else:
            self.min_contour_area = self.config.min_contour_area

        self.epsilon_factor = epsilon_factor
        self.close_iterations = close_iterations
        self.open_iterations = open_iterations
        self.kernel_size = kernel_size

    def detect(self, image: np.ndarray) -> ColorBoundaryResult:
        """
        Detect color boundaries in an image.

        Iterates through configured color ranges, detects matching pixels,
        extracts contours, and simplifies to polygons.

        Args:
            image: BGR image (from cv2.imread)

        Returns:
            ColorBoundaryResult with all detected boundaries
        """
        height, width = image.shape[:2]
        all_boundaries: List[DetectedBoundary] = []
        combined_mask = np.zeros((height, width), dtype=np.uint8)

        # Process each configured color
        for color_name, color_range in self.config.color_ranges.items():
            # Skip red_low and red_high - handle them specially
            if color_name in ("red_low", "red_high"):
                continue

            boundaries = self._detect_color(image, color_name, color_range)
            all_boundaries.extend(boundaries)

            # Update combined mask
            mask = create_color_mask(image, color_range)
            mask = clean_mask(
                mask,
                self.close_iterations,
                self.open_iterations,
                self.kernel_size,
            )
            combined_mask = cv2.bitwise_or(combined_mask, mask)

        # Handle red specially (wrap-around)
        if "red_low" in self.config.color_ranges or "red_high" in self.config.color_ranges:
            red_boundaries, red_mask = self._detect_red(image)
            all_boundaries.extend(red_boundaries)
            combined_mask = cv2.bitwise_or(combined_mask, red_mask)

        # Calculate coverage from combined mask
        coverage = calculate_coverage_from_mask(combined_mask)

        return ColorBoundaryResult(
            boundaries=all_boundaries,
            combined_mask=combined_mask,
            coverage_ratio=coverage,
            image_shape=(height, width),
        )

    def _detect_color(
        self,
        image: np.ndarray,
        color_name: str,
        color_range: ColorRange,
    ) -> List[DetectedBoundary]:
        """
        Detect boundaries of a single color.

        Args:
            image: BGR image
            color_name: Name for the color (e.g., "orange")
            color_range: HSV range for the color

        Returns:
            List of DetectedBoundary objects
        """
        # Create and clean mask
        mask = create_color_mask(image, color_range)
        mask = clean_mask(
            mask,
            self.close_iterations,
            self.open_iterations,
            self.kernel_size,
        )

        # Extract contours
        contours = extract_contours(mask, self.min_contour_area)

        # Convert to DetectedBoundary objects
        boundaries = []
        for contour in contours:
            polygon = contour_to_polygon(contour, self.epsilon_factor)
            area = cv2.contourArea(contour)

            boundaries.append(DetectedBoundary(
                contour=contour,
                color=color_name,
                area=int(area),
                polygon=polygon,
                confidence=0.95,  # High confidence for color detection
            ))

        return boundaries

    def _detect_red(
        self,
        image: np.ndarray,
    ) -> tuple[List[DetectedBoundary], np.ndarray]:
        """
        Detect red boundaries, handling hue wrap-around.

        Args:
            image: BGR image

        Returns:
            Tuple of (boundaries list, combined red mask)
        """
        red_low = self.config.color_ranges.get("red_low")
        red_high = self.config.color_ranges.get("red_high")

        # Create combined red mask
        mask = create_red_mask(image, red_low, red_high)
        mask = clean_mask(
            mask,
            self.close_iterations,
            self.open_iterations,
            self.kernel_size,
        )

        # Extract contours
        contours = extract_contours(mask, self.min_contour_area)

        # Convert to DetectedBoundary objects
        boundaries = []
        for contour in contours:
            polygon = contour_to_polygon(contour, self.epsilon_factor)
            area = cv2.contourArea(contour)

            boundaries.append(DetectedBoundary(
                contour=contour,
                color="red",
                area=int(area),
                polygon=polygon,
                confidence=0.95,
            ))

        return boundaries, mask

    def detect_single_color(
        self,
        image: np.ndarray,
        color_name: str,
    ) -> List[DetectedBoundary]:
        """
        Detect boundaries of only a specific color.

        Useful when you know which color to look for.

        Args:
            image: BGR image
            color_name: Color to detect (must be in config)

        Returns:
            List of boundaries for that color only

        Raises:
            ValueError: If color_name not in configuration
        """
        if color_name == "red":
            boundaries, _ = self._detect_red(image)
            return boundaries

        color_range = self.config.get_range(color_name)
        if color_range is None:
            raise ValueError(f"Unknown color: {color_name}. Available: {list(self.config.color_ranges.keys())}")

        return self._detect_color(image, color_name, color_range)
