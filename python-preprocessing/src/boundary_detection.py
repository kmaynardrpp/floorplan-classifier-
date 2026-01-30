"""
Floorplan Boundary Detection Module

Detects the actual floorplan content area, excluding white margins/borders.
This helps prevent false positive detection of aisles in margin areas.
"""

import cv2
import numpy as np
from typing import Tuple, Optional
from dataclasses import dataclass


@dataclass
class ContentBoundary:
    """Represents the detected floorplan content boundary"""
    x: int
    y: int
    width: int
    height: int
    confidence: float  # How confident we are this is the correct boundary

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "confidence": round(self.confidence, 3)
        }

    def as_tuple(self) -> Tuple[int, int, int, int]:
        return (self.x, self.y, self.width, self.height)


def detect_floorplan_boundary(
    image: np.ndarray,
    margin: int = 5,
    min_content_ratio: float = 0.1
) -> ContentBoundary:
    """
    Detect the actual floorplan content area, excluding white margins.

    Uses multiple strategies:
    1. Otsu thresholding to separate content from background
    2. Contour analysis to find the largest content region
    3. Edge detection as a fallback

    Args:
        image: BGR or grayscale image
        margin: Extra margin to add around detected boundary (pixels)
        min_content_ratio: Minimum ratio of image that should be content

    Returns:
        ContentBoundary with the detected content area
    """
    h, w = image.shape[:2]

    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Strategy 1: Use Otsu thresholding to find content vs background
    boundary = _detect_via_otsu(gray, margin)

    # Validate the result
    if boundary is not None:
        content_ratio = (boundary.width * boundary.height) / (w * h)
        if content_ratio >= min_content_ratio:
            return boundary

    # Strategy 2: Use edge detection as fallback
    boundary = _detect_via_edges(gray, margin)

    if boundary is not None:
        content_ratio = (boundary.width * boundary.height) / (w * h)
        if content_ratio >= min_content_ratio:
            return boundary

    # Strategy 3: Use variance-based detection
    boundary = _detect_via_variance(gray, margin)

    if boundary is not None:
        return boundary

    # Fallback: return full image with low confidence
    return ContentBoundary(
        x=0,
        y=0,
        width=w,
        height=h,
        confidence=0.3
    )


def _detect_via_otsu(gray: np.ndarray, margin: int) -> Optional[ContentBoundary]:
    """
    Detect content boundary using Otsu thresholding.

    This works well when the floorplan has dark content on a light background.
    """
    h, w = gray.shape

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Otsu's thresholding - inverted so content is white
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    # Morphological operations to connect nearby content
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    # Fill small holes
    kernel_small = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_small)

    # Find contours
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Find the largest contour by area
    largest = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest)

    # Check if the contour is large enough to be the floorplan
    min_area = (w * h) * 0.05  # At least 5% of image
    if area < min_area:
        return None

    # Get bounding rectangle
    x, y, bw, bh = cv2.boundingRect(largest)

    # Add margin (clamped to image bounds)
    x = max(0, x - margin)
    y = max(0, y - margin)
    bw = min(w - x, bw + 2 * margin)
    bh = min(h - y, bh + 2 * margin)

    # Calculate confidence based on how much of the image is content
    fill_ratio = area / (bw * bh)
    confidence = min(0.9, 0.5 + fill_ratio * 0.4)

    return ContentBoundary(x=x, y=y, width=bw, height=bh, confidence=confidence)


def _detect_via_edges(gray: np.ndarray, margin: int) -> Optional[ContentBoundary]:
    """
    Detect content boundary using edge detection.

    This works well for line-heavy floorplans.
    """
    h, w = gray.shape

    # Canny edge detection
    edges = cv2.Canny(gray, 30, 100)

    # Dilate edges to connect nearby ones
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
    dilated = cv2.dilate(edges, kernel, iterations=3)

    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Find contour with largest bounding box area
    best_contour = None
    best_area = 0

    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        area = bw * bh
        if area > best_area:
            best_area = area
            best_contour = contour

    if best_contour is None:
        return None

    x, y, bw, bh = cv2.boundingRect(best_contour)

    # Check minimum size
    min_area = (w * h) * 0.1
    if best_area < min_area:
        return None

    # Add margin
    x = max(0, x - margin)
    y = max(0, y - margin)
    bw = min(w - x, bw + 2 * margin)
    bh = min(h - y, bh + 2 * margin)

    return ContentBoundary(x=x, y=y, width=bw, height=bh, confidence=0.7)


def _detect_via_variance(gray: np.ndarray, margin: int) -> Optional[ContentBoundary]:
    """
    Detect content boundary using local variance.

    Content areas have higher variance than uniform margins.
    """
    h, w = gray.shape

    # Calculate local variance using a sliding window
    window_size = 50

    # Calculate mean of squared values and square of mean
    gray_float = gray.astype(np.float32)
    mean = cv2.blur(gray_float, (window_size, window_size))
    sqr_mean = cv2.blur(gray_float ** 2, (window_size, window_size))
    variance = sqr_mean - mean ** 2

    # Threshold variance to find content regions
    var_threshold = np.percentile(variance, 50)  # Use median as threshold
    _, var_binary = cv2.threshold(variance, var_threshold, 255, cv2.THRESH_BINARY)
    var_binary = var_binary.astype(np.uint8)

    # Find bounding box of high-variance region
    coords = cv2.findNonZero(var_binary)

    if coords is None or len(coords) < 100:
        return None

    x, y, bw, bh = cv2.boundingRect(coords)

    # Add margin
    x = max(0, x - margin)
    y = max(0, y - margin)
    bw = min(w - x, bw + 2 * margin)
    bh = min(h - y, bh + 2 * margin)

    return ContentBoundary(x=x, y=y, width=bw, height=bh, confidence=0.6)


def crop_to_boundary(image: np.ndarray, boundary: ContentBoundary) -> np.ndarray:
    """
    Crop an image to the specified content boundary.

    Args:
        image: The image to crop
        boundary: The boundary to crop to

    Returns:
        Cropped image
    """
    return image[
        boundary.y:boundary.y + boundary.height,
        boundary.x:boundary.x + boundary.width
    ].copy()


def transform_coordinates_to_full_image(
    coords: list,
    boundary: ContentBoundary
) -> list:
    """
    Transform coordinates from cropped image space to full image space.

    Args:
        coords: List of coordinate dicts with 'x' and 'y' keys
        boundary: The boundary used for cropping

    Returns:
        Transformed coordinates in full image space
    """
    return [
        {"x": c["x"] + boundary.x, "y": c["y"] + boundary.y}
        for c in coords
    ]


def transform_bounding_box_to_full_image(
    bbox: dict,
    boundary: ContentBoundary
) -> dict:
    """
    Transform a bounding box from cropped image space to full image space.

    Args:
        bbox: Dict with 'x', 'y', 'width', 'height' keys
        boundary: The boundary used for cropping

    Returns:
        Transformed bounding box in full image space
    """
    return {
        "x": bbox["x"] + boundary.x,
        "y": bbox["y"] + boundary.y,
        "width": bbox["width"],
        "height": bbox["height"]
    }
