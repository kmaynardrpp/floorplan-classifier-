"""
Region Segmentation Module for Floorplan Preprocessing

Segments the floorplan into candidate regions:
- Dense areas (racking/storage)
- Sparse/open areas (aisles, travel lanes)
- Special areas (docking, offices)
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum


class RegionType(str, Enum):
    DENSE = "dense"  # Racking/storage areas with parallel lines
    SPARSE = "sparse"  # Open areas, travel lanes
    MIXED = "mixed"  # Transition areas
    UNKNOWN = "unknown"


@dataclass
class Region:
    """Represents a segmented region"""
    id: int
    bounding_box: Tuple[int, int, int, int]  # x, y, width, height
    contour: np.ndarray
    area: int
    density_score: float  # 0-1, higher = more dense (likely racking)
    region_type: RegionType
    centroid: Tuple[int, int]


@dataclass
class SegmentationResult:
    """Results from region segmentation"""
    regions: List[Region]
    density_map: np.ndarray  # Grayscale density visualization
    labeled_mask: np.ndarray  # Each region labeled with unique ID


def compute_local_density(
    image: np.ndarray,
    window_size: int = 50,
) -> np.ndarray:
    """
    Compute local pixel density using a sliding window.
    Dense areas (racking) have more dark pixels (lines).

    Args:
        image: Grayscale image
        window_size: Size of the analysis window

    Returns:
        Density map (0-255, higher = more dense)
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Threshold to get binary image (dark lines become white)
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

    # Use box filter to compute local density
    kernel = np.ones((window_size, window_size), np.float32) / (window_size * window_size)
    density = cv2.filter2D(binary.astype(np.float32), -1, kernel)

    # Normalize to 0-255
    density = cv2.normalize(density, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    return density


def compute_line_density(
    image: np.ndarray,
    window_size: int = 100,
) -> np.ndarray:
    """
    Compute density of parallel lines (indicative of racking areas).

    Args:
        image: Grayscale or BGR image
        window_size: Size of analysis window

    Returns:
        Line density map
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Apply Sobel to detect vertical lines (common in racking)
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_x = np.abs(sobel_x)

    # Apply Sobel to detect horizontal lines
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    sobel_y = np.abs(sobel_y)

    # Combine (take max of vertical and horizontal)
    combined = np.maximum(sobel_x, sobel_y)

    # Smooth with box filter
    kernel = np.ones((window_size, window_size), np.float32) / (window_size * window_size)
    density = cv2.filter2D(combined, -1, kernel)

    # Normalize
    density = cv2.normalize(density, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    return density


def segment_by_density(
    density_map: np.ndarray,
    high_threshold: int = 80,  # Lowered - racking areas are medium-gray
    low_threshold: int = 40,   # Lowered - travel lanes are darker
    min_region_area: int = 5000,
) -> Tuple[np.ndarray, List[Tuple[np.ndarray, RegionType]]]:
    """
    Segment image into regions based on density map.

    Args:
        density_map: Grayscale density map
        high_threshold: Threshold for dense regions
        low_threshold: Threshold for sparse regions
        min_region_area: Minimum area to keep a region

    Returns:
        (labeled_mask, list of (contour, region_type) tuples)
    """
    # Create masks for different density levels
    dense_mask = (density_map >= high_threshold).astype(np.uint8) * 255
    sparse_mask = (density_map <= low_threshold).astype(np.uint8) * 255

    # Clean up masks
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    dense_mask = cv2.morphologyEx(dense_mask, cv2.MORPH_CLOSE, kernel)
    dense_mask = cv2.morphologyEx(dense_mask, cv2.MORPH_OPEN, kernel)
    sparse_mask = cv2.morphologyEx(sparse_mask, cv2.MORPH_CLOSE, kernel)
    sparse_mask = cv2.morphologyEx(sparse_mask, cv2.MORPH_OPEN, kernel)

    # Find contours for each type
    regions = []

    dense_contours, _ = cv2.findContours(dense_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in dense_contours:
        if cv2.contourArea(contour) >= min_region_area:
            regions.append((contour, RegionType.DENSE))

    sparse_contours, _ = cv2.findContours(sparse_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in sparse_contours:
        if cv2.contourArea(contour) >= min_region_area:
            regions.append((contour, RegionType.SPARSE))

    # Create labeled mask
    labeled = np.zeros(density_map.shape, dtype=np.int32)
    for i, (contour, _) in enumerate(regions, start=1):
        cv2.drawContours(labeled, [contour], -1, i, -1)

    return labeled, regions


def detect_racking_orientation(
    image: np.ndarray,
    region_mask: np.ndarray,
) -> Optional[str]:
    """
    Detect whether racking lines are primarily horizontal or vertical
    within a given region.

    Args:
        image: Grayscale image
        region_mask: Binary mask of the region to analyze

    Returns:
        "horizontal", "vertical", or None if unclear
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Mask the region
    masked = cv2.bitwise_and(gray, gray, mask=region_mask)

    # Detect edges
    edges = cv2.Canny(masked, 50, 150)

    # Detect lines
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 50, minLineLength=30, maxLineGap=10)

    if lines is None or len(lines) < 5:
        return None

    # Count horizontal vs vertical lines
    horizontal = 0
    vertical = 0

    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(abs(y2 - y1), abs(x2 - x1)))

        if angle < 30:  # Near horizontal
            horizontal += 1
        elif angle > 60:  # Near vertical
            vertical += 1

    if horizontal > vertical * 1.5:
        return "horizontal"
    elif vertical > horizontal * 1.5:
        return "vertical"
    return None


def process_segmentation(
    image: np.ndarray,
    density_window: int = 50,
    min_region_area: int = 5000,
) -> SegmentationResult:
    """
    Main segmentation pipeline.

    Args:
        image: BGR image
        density_window: Window size for density computation
        min_region_area: Minimum region area to keep

    Returns:
        SegmentationResult with regions and masks
    """
    # Compute density maps
    pixel_density = compute_local_density(image, density_window)
    line_density = compute_line_density(image, density_window)

    # Combine density maps (weighted average)
    combined_density = cv2.addWeighted(pixel_density, 0.5, line_density, 0.5, 0)

    # Segment by density
    labeled_mask, region_data = segment_by_density(
        combined_density,
        min_region_area=min_region_area,
    )

    # Create Region objects
    regions = []
    for i, (contour, region_type) in enumerate(region_data):
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)

        # Compute centroid
        M = cv2.moments(contour)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
        else:
            cx, cy = x + w // 2, y + h // 2

        # Compute average density score for this region
        mask = np.zeros(combined_density.shape, dtype=np.uint8)
        cv2.drawContours(mask, [contour], -1, 255, -1)
        mean_density = cv2.mean(combined_density, mask=mask)[0] / 255.0

        regions.append(Region(
            id=i + 1,
            bounding_box=(x, y, w, h),
            contour=contour,
            area=area,
            density_score=mean_density,
            region_type=region_type,
            centroid=(cx, cy),
        ))

    return SegmentationResult(
        regions=regions,
        density_map=combined_density,
        labeled_mask=labeled_mask,
    )


def segmentation_result_to_dict(result: SegmentationResult) -> Dict[str, Any]:
    """Convert SegmentationResult to JSON-serializable dict"""
    return {
        "regions": [
            {
                "id": int(region.id),
                "bounding_box": {
                    "x": int(region.bounding_box[0]),
                    "y": int(region.bounding_box[1]),
                    "width": int(region.bounding_box[2]),
                    "height": int(region.bounding_box[3]),
                },
                "vertices": [
                    {"x": int(pt[0][0]), "y": int(pt[0][1])}
                    for pt in region.contour
                ],
                "area": int(region.area),
                "density_score": round(float(region.density_score), 3),
                "region_type": region.region_type.value,
                "centroid": {"x": int(region.centroid[0]), "y": int(region.centroid[1])},
            }
            for region in result.regions
        ],
        "stats": {
            "total_regions": len(result.regions),
            "dense_regions": len([r for r in result.regions if r.region_type == RegionType.DENSE]),
            "sparse_regions": len([r for r in result.regions if r.region_type == RegionType.SPARSE]),
            "total_dense_area": int(sum(r.area for r in result.regions if r.region_type == RegionType.DENSE)),
            "total_sparse_area": int(sum(r.area for r in result.regions if r.region_type == RegionType.SPARSE)),
        }
    }
