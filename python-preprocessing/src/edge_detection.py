"""
Edge Detection Module for Floorplan Preprocessing

Detects orange/brown boundary lines that outline travel lanes and zone boundaries.
These lines are the key visual markers in warehouse floorplans.
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict, Any
from dataclasses import dataclass


@dataclass
class BoundaryLine:
    """Represents a detected boundary line segment"""
    start: Tuple[int, int]
    end: Tuple[int, int]
    angle: float  # degrees
    length: float


@dataclass
class EdgeDetectionResult:
    """Results from edge detection"""
    boundary_mask: np.ndarray  # Binary mask of detected boundaries
    boundary_lines: List[BoundaryLine]  # Individual line segments
    contours: List[np.ndarray]  # Polygon contours


def detect_orange_boundaries(
    image: np.ndarray,
    hue_range: Tuple[int, int] = (5, 25),  # Orange/brown hue range
    sat_min: int = 50,
    val_min: int = 50,
) -> np.ndarray:
    """
    Detect orange/brown boundary lines using HSV color filtering.

    Args:
        image: BGR image
        hue_range: (min_hue, max_hue) for orange detection (0-180 scale)
        sat_min: Minimum saturation
        val_min: Minimum value/brightness

    Returns:
        Binary mask where orange pixels are white (255)
    """
    # Convert to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Create mask for orange/brown colors
    lower_orange = np.array([hue_range[0], sat_min, val_min])
    upper_orange = np.array([hue_range[1], 255, 255])
    mask = cv2.inRange(hsv, lower_orange, upper_orange)

    # Also detect slightly redder oranges (wrapping around hue=0)
    lower_red_orange = np.array([0, sat_min, val_min])
    upper_red_orange = np.array([5, 255, 255])
    mask_red = cv2.inRange(hsv, lower_red_orange, upper_red_orange)

    # Combine masks
    combined_mask = cv2.bitwise_or(mask, mask_red)

    # Clean up with morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
    combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)

    return combined_mask


def detect_edges_canny(
    image: np.ndarray,
    low_threshold: int = 50,
    high_threshold: int = 150,
) -> np.ndarray:
    """
    Apply Canny edge detection to find all edges.

    Args:
        image: Grayscale or BGR image
        low_threshold: Lower threshold for hysteresis
        high_threshold: Upper threshold for hysteresis

    Returns:
        Binary edge mask
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection
    edges = cv2.Canny(blurred, low_threshold, high_threshold)

    return edges


def detect_lines_hough(
    edge_mask: np.ndarray,
    rho: float = 1,
    theta: float = np.pi / 180,
    threshold: int = 100,
    min_line_length: int = 50,
    max_line_gap: int = 10,
) -> List[BoundaryLine]:
    """
    Detect line segments using probabilistic Hough transform.

    Args:
        edge_mask: Binary edge image
        rho: Distance resolution in pixels
        theta: Angle resolution in radians
        threshold: Minimum votes for line detection
        min_line_length: Minimum length of line segment
        max_line_gap: Maximum gap between points on same line

    Returns:
        List of detected BoundaryLine objects
    """
    lines = cv2.HoughLinesP(
        edge_mask,
        rho=rho,
        theta=theta,
        threshold=threshold,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        return []

    boundary_lines = []
    for line in lines:
        x1, y1, x2, y2 = line[0]

        # Calculate angle (0 = horizontal, 90 = vertical)
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # Normalize to 0-180 range
        if angle < 0:
            angle += 180

        length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

        boundary_lines.append(BoundaryLine(
            start=(x1, y1),
            end=(x2, y2),
            angle=angle,
            length=length,
        ))

    return boundary_lines


def find_boundary_contours(
    boundary_mask: np.ndarray,
    min_area: int = 1000,
    epsilon_factor: float = 0.02,
) -> List[np.ndarray]:
    """
    Find contours (polygons) from the boundary mask.

    Args:
        boundary_mask: Binary mask of boundaries
        min_area: Minimum contour area to keep
        epsilon_factor: Approximation factor (smaller = more vertices)

    Returns:
        List of polygon contours (each is Nx1x2 array)
    """
    # Dilate to connect nearby boundary pixels
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated = cv2.dilate(boundary_mask, kernel, iterations=2)

    # Find contours
    contours, _ = cv2.findContours(
        dilated,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    # Filter and simplify contours
    filtered_contours = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        # Approximate polygon to reduce vertices while keeping shape
        epsilon = epsilon_factor * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        filtered_contours.append(approx)

    return filtered_contours


def process_edges(
    image: np.ndarray,
    use_color_detection: bool = True,
    use_canny: bool = True,
) -> EdgeDetectionResult:
    """
    Main edge detection pipeline.

    Args:
        image: BGR image
        use_color_detection: Whether to detect orange boundaries
        use_canny: Whether to use Canny edge detection

    Returns:
        EdgeDetectionResult with mask, lines, and contours
    """
    masks = []

    if use_color_detection:
        orange_mask = detect_orange_boundaries(image)
        masks.append(orange_mask)

    if use_canny:
        canny_edges = detect_edges_canny(image)
        # Combine with orange mask if available
        if use_color_detection:
            # Use Canny edges only where they're near orange areas
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
            orange_dilated = cv2.dilate(masks[0], kernel, iterations=1)
            canny_near_orange = cv2.bitwise_and(canny_edges, orange_dilated)
            masks.append(canny_near_orange)
        else:
            masks.append(canny_edges)

    # Combine all masks
    if len(masks) > 1:
        combined_mask = masks[0]
        for mask in masks[1:]:
            combined_mask = cv2.bitwise_or(combined_mask, mask)
    else:
        combined_mask = masks[0] if masks else np.zeros(image.shape[:2], dtype=np.uint8)

    # Detect lines
    lines = detect_lines_hough(combined_mask)

    # Find contours
    contours = find_boundary_contours(combined_mask)

    return EdgeDetectionResult(
        boundary_mask=combined_mask,
        boundary_lines=lines,
        contours=contours,
    )


def edge_result_to_dict(result: EdgeDetectionResult) -> Dict[str, Any]:
    """Convert EdgeDetectionResult to JSON-serializable dict"""
    return {
        "boundary_lines": [
            {
                "start": {"x": line.start[0], "y": line.start[1]},
                "end": {"x": line.end[0], "y": line.end[1]},
                "angle": round(line.angle, 2),
                "length": round(line.length, 2),
            }
            for line in result.boundary_lines
        ],
        "contours": [
            {
                "vertices": [
                    {"x": int(pt[0][0]), "y": int(pt[0][1])}
                    for pt in contour
                ],
                "area": int(cv2.contourArea(contour)),
                "perimeter": round(cv2.arcLength(contour, True), 2),
            }
            for contour in result.contours
        ],
        "stats": {
            "total_lines": len(result.boundary_lines),
            "total_contours": len(result.contours),
            "horizontal_lines": len([l for l in result.boundary_lines if abs(l.angle - 90) > 45]),
            "vertical_lines": len([l for l in result.boundary_lines if abs(l.angle - 90) <= 45]),
        }
    }
