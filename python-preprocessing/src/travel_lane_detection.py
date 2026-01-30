"""
Travel Lane Detection Module for Floorplan Preprocessing

Detects travel lanes (main corridors) in warehouse floorplans.
This module is the focused replacement for aisle detection - aisles are now
100% programmatic from TDOA data, while travel lanes use computer vision.

Travel lanes are large, continuous whitespace corridors that:
- Run through the warehouse connecting different areas
- Are typically wider than aisles (40+ pixels)
- Provide the main paths for forklifts/robots between racking sections
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass

from .coverage_input import CoverageBoundary, coverage_to_mask


@dataclass
class TravelLaneSuggestion:
    """
    A detected travel lane (main corridor) in the floorplan.

    Travel lanes are distinguished from aisles:
    - Aisles: Narrow paths within racking areas (from TDOA data, programmatic)
    - Travel Lanes: Wide corridors between zones (from CV detection)
    """
    id: int
    coverage_uid: str  # UID of the coverage boundary this lane was found in (empty if standalone)
    centerline: List[Tuple[int, int]]  # Points defining the lane centerline
    width_profile: List[float]  # Width at each centerline point
    average_width: float
    bounding_box: Tuple[int, int, int, int]  # x, y, width, height
    confidence: float  # 0-1 confidence score
    detection_method: str  # "skeletonization", "sparse_regions", "morphological", etc.
    orientation: str  # "horizontal", "vertical", or "diagonal"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "id": self.id,
            "coverage_uid": self.coverage_uid,
            "centerline": [{"x": int(p[0]), "y": int(p[1])} for p in self.centerline],
            "width_profile": [float(w) for w in self.width_profile],
            "average_width": float(self.average_width),
            "bounding_box": {
                "x": int(self.bounding_box[0]),
                "y": int(self.bounding_box[1]),
                "width": int(self.bounding_box[2]),
                "height": int(self.bounding_box[3]),
            },
            "confidence": float(self.confidence),
            "detection_method": self.detection_method,
            "orientation": self.orientation,
        }


def detect_travel_lanes_standalone(
    image: np.ndarray,
    min_width: int = 40,
    min_length: int = 200,
) -> List[TravelLaneSuggestion]:
    """
    Detect travel lanes anywhere in the image (no coverage constraints).

    This is the standalone mode for when no coverage boundaries are provided.

    Args:
        image: BGR image
        min_width: Minimum width of travel lane (pixels)
        min_length: Minimum length of travel lane (pixels)

    Returns:
        List of TravelLaneSuggestion objects
    """
    lanes = []

    # Method 1: Morphological detection (most reliable)
    morph_lanes = detect_via_morphological(image, min_width, min_length)
    lanes.extend(morph_lanes)

    # Method 2: Sparse region detection
    sparse_lanes = detect_via_sparse_regions(image, min_width, min_length)
    lanes.extend(sparse_lanes)

    # Deduplicate overlapping lanes
    lanes = deduplicate_travel_lanes(lanes, merge_distance=min_width)

    return lanes


def detect_travel_lanes_within_coverage(
    image: np.ndarray,
    coverage_mask: np.ndarray,
    coverage_uid: str = "",
    min_width: int = 40,
    min_length: int = 100,
) -> List[TravelLaneSuggestion]:
    """
    Detect travel lanes constrained to a coverage area.

    Args:
        image: BGR image (full size)
        coverage_mask: Binary mask (255 inside coverage, 0 outside)
        coverage_uid: UID of the coverage boundary
        min_width: Minimum width of travel lane (pixels)
        min_length: Minimum length of travel lane (pixels)

    Returns:
        List of TravelLaneSuggestion objects
    """
    # Mask the image to only analyze within coverage
    if len(image.shape) == 3:
        masked_image = cv2.bitwise_and(image, image, mask=coverage_mask)
    else:
        masked_image = cv2.bitwise_and(image, image, mask=coverage_mask)

    # Detect lanes in the masked area
    lanes = []

    # Method 1: Morphological detection
    morph_lanes = detect_via_morphological(masked_image, min_width, min_length, coverage_mask)
    for lane in morph_lanes:
        lane.coverage_uid = coverage_uid
    lanes.extend(morph_lanes)

    # Method 2: Sparse region detection
    sparse_lanes = detect_via_sparse_regions(masked_image, min_width, min_length, coverage_mask)
    for lane in sparse_lanes:
        lane.coverage_uid = coverage_uid
    lanes.extend(sparse_lanes)

    # Method 3: Skeletonization (good for winding paths)
    skeleton_lanes = detect_via_skeletonization(masked_image, coverage_mask, min_width, min_length)
    for lane in skeleton_lanes:
        lane.coverage_uid = coverage_uid
    lanes.extend(skeleton_lanes)

    # Deduplicate
    lanes = deduplicate_travel_lanes(lanes, merge_distance=min_width // 2)

    return lanes


def detect_via_morphological(
    image: np.ndarray,
    min_width: int = 40,
    min_length: int = 200,
    mask: Optional[np.ndarray] = None,
) -> List[TravelLaneSuggestion]:
    """
    Detect travel lanes using morphological operations.

    This method:
    1. Thresholds to find light areas (whitespace)
    2. Uses morphological closing to connect nearby regions
    3. Finds elongated rectangular contours
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    travel_lanes = []
    lane_id = 0

    # Adaptive thresholding based on image statistics
    # Use Otsu's method to find optimal threshold
    otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh_value = max(180, min(otsu_thresh + 10, 230))
    _, binary = cv2.threshold(gray, thresh_value, 255, cv2.THRESH_BINARY)

    # Apply mask if provided
    if mask is not None:
        binary = cv2.bitwise_and(binary, mask)

    # Morphological closing to connect nearby white regions
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)

    # Morphological opening to remove small noise
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)

    # Find contours
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        x, y, rect_w, rect_h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)

        if area < min_width * min_length:
            continue

        # Determine orientation
        if rect_w > rect_h:
            orientation = "horizontal"
            width = rect_h
            length = rect_w
        else:
            orientation = "vertical"
            width = rect_w
            length = rect_h

        if width < min_width or length < min_length:
            continue

        # Compute average brightness in the region
        region = gray[y:y+rect_h, x:x+rect_w]
        avg_brightness = np.mean(region)

        if avg_brightness < 160:  # Not bright enough
            continue

        # Compute confidence based on brightness and shape
        brightness_score = min(1.0, (avg_brightness - 160) / 80)
        shape_score = min(1.0, length / (width * 3))  # Elongation
        confidence = (brightness_score * 0.6 + shape_score * 0.4)

        lane_id += 1

        # Create centerline
        if orientation == "horizontal":
            center_y = y + rect_h // 2
            centerline = [(x, center_y), (x + rect_w, center_y)]
        else:
            center_x = x + rect_w // 2
            centerline = [(center_x, y), (center_x, y + rect_h)]

        travel_lanes.append(TravelLaneSuggestion(
            id=lane_id,
            coverage_uid="",
            centerline=centerline,
            width_profile=[float(width)] * 2,
            average_width=float(width),
            bounding_box=(x, y, rect_w, rect_h),
            confidence=confidence,
            detection_method="morphological",
            orientation=orientation,
        ))

    return travel_lanes


def detect_via_sparse_regions(
    image: np.ndarray,
    min_width: int = 40,
    min_length: int = 200,
    mask: Optional[np.ndarray] = None,
) -> List[TravelLaneSuggestion]:
    """
    Detect travel lanes by finding sparse (low-density) regions.

    Travel lanes typically have low edge density and high brightness.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    travel_lanes = []
    lane_id = 0

    # Compute edge density map
    edges = cv2.Canny(gray, 50, 150)

    # Apply mask if provided
    if mask is not None:
        edges = cv2.bitwise_and(edges, mask)
        gray = cv2.bitwise_and(gray, mask)

    # Compute local density using a window
    window_size = max(min_width, 30)
    kernel = np.ones((window_size, window_size), np.float32) / (window_size * window_size)
    density_map = cv2.filter2D(edges.astype(np.float32), -1, kernel)

    # Low density = potential travel lane
    density_threshold = 10  # Low edge count per window
    _, low_density = cv2.threshold(density_map, density_threshold, 255, cv2.THRESH_BINARY_INV)
    low_density = low_density.astype(np.uint8)

    # Also require high brightness
    _, bright = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

    # Combine: low density AND high brightness
    combined = cv2.bitwise_and(low_density, bright)

    # Clean up with morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel)
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        x, y, rect_w, rect_h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)

        if area < min_width * min_length:
            continue

        # Check shape constraints
        if rect_w > rect_h:
            if rect_h < min_width or rect_w < min_length:
                continue
            orientation = "horizontal"
            width = rect_h
        else:
            if rect_w < min_width or rect_h < min_length:
                continue
            orientation = "vertical"
            width = rect_w

        # Compute confidence
        region_brightness = np.mean(gray[y:y+rect_h, x:x+rect_w])
        region_density = np.mean(density_map[y:y+rect_h, x:x+rect_w])

        brightness_score = min(1.0, (region_brightness - 160) / 80)
        density_score = max(0, 1.0 - region_density / 30)
        confidence = (brightness_score * 0.5 + density_score * 0.5)

        if confidence < 0.4:
            continue

        lane_id += 1

        # Create centerline
        if orientation == "horizontal":
            center_y = y + rect_h // 2
            centerline = [(x, center_y), (x + rect_w, center_y)]
        else:
            center_x = x + rect_w // 2
            centerline = [(center_x, y), (center_x, y + rect_h)]

        travel_lanes.append(TravelLaneSuggestion(
            id=lane_id,
            coverage_uid="",
            centerline=centerline,
            width_profile=[float(width)] * 2,
            average_width=float(width),
            bounding_box=(x, y, rect_w, rect_h),
            confidence=confidence,
            detection_method="sparse_regions",
            orientation=orientation,
        ))

    return travel_lanes


def detect_via_skeletonization(
    image: np.ndarray,
    mask: np.ndarray,
    min_width: int = 40,
    min_length: int = 100,
) -> List[TravelLaneSuggestion]:
    """
    Detect travel lanes using skeletonization.

    This method is good for detecting winding or irregular paths.
    It extracts the medial axis of whitespace regions.
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    travel_lanes = []
    lane_id = 0

    # Threshold for white regions
    _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

    # Apply mask
    if mask is not None:
        binary = cv2.bitwise_and(binary, mask)

    # Open to remove small connections
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (min_width // 2, min_width // 2))
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # Find connected components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(opened, connectivity=8)

    for i in range(1, num_labels):  # Skip background (0)
        x, y, comp_w, comp_h, area = stats[i]

        if area < min_width * min_length:
            continue

        # Check if elongated enough to be a travel lane
        aspect_ratio = max(comp_w, comp_h) / (min(comp_w, comp_h) + 1)
        if aspect_ratio < 2:  # Not elongated enough
            continue

        # Determine orientation
        if comp_w > comp_h:
            orientation = "horizontal"
            width = comp_h
            length = comp_w
        else:
            orientation = "vertical"
            width = comp_w
            length = comp_h

        if width < min_width or length < min_length:
            continue

        # Create a mask for this component
        comp_mask = (labels == i).astype(np.uint8) * 255

        # Compute skeleton (medial axis)
        skeleton = cv2.ximgproc.thinning(comp_mask) if hasattr(cv2, 'ximgproc') else comp_mask

        # Find skeleton points for centerline
        skeleton_points = np.column_stack(np.where(skeleton > 0))
        if len(skeleton_points) < 2:
            # Fallback: use bounding box center
            if orientation == "horizontal":
                center_y = y + comp_h // 2
                centerline = [(x, center_y), (x + comp_w, center_y)]
            else:
                center_x = x + comp_w // 2
                centerline = [(center_x, y), (center_x, y + comp_h)]
        else:
            # Sort points by primary axis
            if orientation == "horizontal":
                skeleton_points = skeleton_points[skeleton_points[:, 1].argsort()]
                centerline = [(int(p[1]), int(p[0])) for p in skeleton_points[::max(1, len(skeleton_points)//20)]]
            else:
                skeleton_points = skeleton_points[skeleton_points[:, 0].argsort()]
                centerline = [(int(p[1]), int(p[0])) for p in skeleton_points[::max(1, len(skeleton_points)//20)]]

        # Ensure we have at least 2 points
        if len(centerline) < 2:
            if orientation == "horizontal":
                center_y = y + comp_h // 2
                centerline = [(x, center_y), (x + comp_w, center_y)]
            else:
                center_x = x + comp_w // 2
                centerline = [(center_x, y), (center_x, y + comp_h)]

        # Compute width profile using distance transform
        dist_transform = cv2.distanceTransform(comp_mask, cv2.DIST_L2, 5)
        width_profile = []
        for point in centerline:
            px, py = point
            if 0 <= py < h and 0 <= px < w:
                width_profile.append(dist_transform[py, px] * 2)  # Diameter
            else:
                width_profile.append(float(width))

        avg_width = np.mean(width_profile) if width_profile else float(width)

        # Confidence based on elongation and consistency
        consistency = 1.0 - (np.std(width_profile) / (avg_width + 1)) if width_profile else 0.5
        confidence = min(1.0, (aspect_ratio / 5) * 0.5 + consistency * 0.5)

        lane_id += 1

        travel_lanes.append(TravelLaneSuggestion(
            id=lane_id,
            coverage_uid="",
            centerline=centerline,
            width_profile=width_profile if width_profile else [float(width)] * 2,
            average_width=avg_width,
            bounding_box=(x, y, comp_w, comp_h),
            confidence=confidence,
            detection_method="skeletonization",
            orientation=orientation,
        ))

    return travel_lanes


def compute_width_profile(
    image: np.ndarray,
    centerline: List[Tuple[int, int]],
) -> List[float]:
    """
    Compute the width profile along a centerline.

    Uses perpendicular scanlines to measure width at each point.

    Args:
        image: Grayscale or binary image
        centerline: List of (x, y) points

    Returns:
        List of width values at each centerline point
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    width_profile = []

    # Threshold for "inside lane"
    _, binary = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)

    for i, (px, py) in enumerate(centerline):
        if i == 0 or i == len(centerline) - 1:
            # Use adjacent point for direction
            if i == 0 and len(centerline) > 1:
                dx = centerline[1][0] - px
                dy = centerline[1][1] - py
            elif i == len(centerline) - 1 and len(centerline) > 1:
                dx = px - centerline[-2][0]
                dy = py - centerline[-2][1]
            else:
                width_profile.append(0)
                continue
        else:
            # Use central difference
            dx = centerline[i+1][0] - centerline[i-1][0]
            dy = centerline[i+1][1] - centerline[i-1][1]

        # Normalize direction
        length = np.sqrt(dx*dx + dy*dy)
        if length == 0:
            width_profile.append(0)
            continue

        # Perpendicular direction
        perp_x = -dy / length
        perp_y = dx / length

        # Scan perpendicular to find edges
        max_scan = 100
        left_dist = 0
        right_dist = 0

        # Scan left
        for d in range(1, max_scan):
            scan_x = int(px + perp_x * d)
            scan_y = int(py + perp_y * d)
            if 0 <= scan_x < w and 0 <= scan_y < h:
                if binary[scan_y, scan_x] == 0:
                    left_dist = d
                    break
            else:
                left_dist = d
                break

        # Scan right
        for d in range(1, max_scan):
            scan_x = int(px - perp_x * d)
            scan_y = int(py - perp_y * d)
            if 0 <= scan_x < w and 0 <= scan_y < h:
                if binary[scan_y, scan_x] == 0:
                    right_dist = d
                    break
            else:
                right_dist = d
                break

        width_profile.append(float(left_dist + right_dist))

    return width_profile


def deduplicate_travel_lanes(
    lanes: List[TravelLaneSuggestion],
    merge_distance: int = 30,
) -> List[TravelLaneSuggestion]:
    """
    Remove duplicate/overlapping travel lanes, keeping the highest confidence.

    Args:
        lanes: List of detected travel lanes
        merge_distance: Maximum distance between lane centers to consider duplicates

    Returns:
        Deduplicated list of travel lanes
    """
    if len(lanes) <= 1:
        return lanes

    # Sort by confidence (descending) to keep best ones
    sorted_lanes = sorted(lanes, key=lambda l: l.confidence, reverse=True)

    kept_lanes = []

    for lane in sorted_lanes:
        is_duplicate = False
        lane_center = (
            (lane.bounding_box[0] + lane.bounding_box[2] // 2),
            (lane.bounding_box[1] + lane.bounding_box[3] // 2),
        )

        for kept in kept_lanes:
            kept_center = (
                (kept.bounding_box[0] + kept.bounding_box[2] // 2),
                (kept.bounding_box[1] + kept.bounding_box[3] // 2),
            )

            distance = np.sqrt(
                (lane_center[0] - kept_center[0])**2 +
                (lane_center[1] - kept_center[1])**2
            )

            # Check if boxes overlap significantly
            x1 = max(lane.bounding_box[0], kept.bounding_box[0])
            y1 = max(lane.bounding_box[1], kept.bounding_box[1])
            x2 = min(lane.bounding_box[0] + lane.bounding_box[2],
                    kept.bounding_box[0] + kept.bounding_box[2])
            y2 = min(lane.bounding_box[1] + lane.bounding_box[3],
                    kept.bounding_box[1] + kept.bounding_box[3])

            if x2 > x1 and y2 > y1:
                overlap_area = (x2 - x1) * (y2 - y1)
                lane_area = lane.bounding_box[2] * lane.bounding_box[3]
                overlap_ratio = overlap_area / (lane_area + 1)

                if overlap_ratio > 0.5 or distance < merge_distance:
                    is_duplicate = True
                    break

        if not is_duplicate:
            kept_lanes.append(lane)

    # Renumber IDs
    for i, lane in enumerate(kept_lanes, start=1):
        lane.id = i

    return kept_lanes
