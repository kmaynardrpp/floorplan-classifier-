"""
Line Detection Module for Floorplan Preprocessing

Detects parallel lines that indicate racking rows and their orientations.
Also identifies gaps between line clusters (aisles).
"""

import cv2
import numpy as np
from typing import List, Tuple, Dict, Any, Optional
from dataclasses import dataclass
from collections import defaultdict
import math

# Type alias for use in function annotations
Dict = dict  # Ensure Dict works with subscript


@dataclass
class LineSegment:
    """A detected line segment"""
    start: Tuple[int, int]
    end: Tuple[int, int]
    angle: float  # 0-180 degrees
    length: float
    midpoint: Tuple[int, int]


@dataclass
class LineCluster:
    """A group of parallel lines (likely a racking section)"""
    id: int
    lines: List[LineSegment]
    dominant_angle: float  # Average angle of lines
    orientation: str  # "horizontal" or "vertical"
    bounding_box: Tuple[int, int, int, int]  # x, y, w, h
    average_spacing: float  # Average distance between lines
    line_count: int


@dataclass
class AisleCandidate:
    """A detected aisle (gap between line clusters)"""
    id: int
    centerline: List[Tuple[int, int]]  # Points defining the aisle centerline
    width: float  # Estimated aisle width
    orientation: str  # "horizontal" or "vertical"
    bounding_box: Tuple[int, int, int, int]
    adjacent_clusters: List[int]  # IDs of adjacent line clusters
    confidence: float = 0.5  # Confidence score 0-1
    detection_method: str = "unknown"  # How this aisle was detected
    line_density_left: float = 0.0  # Line density on left/top side
    line_density_right: float = 0.0  # Line density on right/bottom side
    two_sided_validated: bool = False  # Whether both sides have dark content


def validate_aisle_two_sided(
    gray: np.ndarray,
    aisle_x_start: int,
    aisle_x_end: int,
    y_start: int,
    y_end: int,
    orientation: str = "vertical",
    dark_threshold: int = 140,
    min_dark_ratio: float = 0.25,
    scan_width: int = 25
) -> Tuple[bool, float, float]:
    """
    Validate that an aisle has dark content (racking) on both sides.

    A true aisle should have racking (dark lines) on both sides:
    - Vertical aisles: dark on LEFT and RIGHT
    - Horizontal aisles: dark on TOP and BOTTOM

    Args:
        gray: Grayscale image
        aisle_x_start: Left/top edge of aisle
        aisle_x_end: Right/bottom edge of aisle
        y_start: Top/left extent of aisle
        y_end: Bottom/right extent of aisle
        orientation: "vertical" or "horizontal"
        dark_threshold: Pixels below this are considered "dark"
        min_dark_ratio: Minimum ratio of dark pixels needed on each side
        scan_width: How far to look on each side (pixels)

    Returns:
        (is_valid, left_darkness, right_darkness)
    """
    h, w = gray.shape

    if orientation == "vertical":
        # Check LEFT side
        left_start = max(0, aisle_x_start - scan_width)
        left_region = gray[y_start:y_end, left_start:aisle_x_start]

        # Check RIGHT side
        right_end = min(w, aisle_x_end + scan_width)
        right_region = gray[y_start:y_end, aisle_x_end:right_end]
    else:
        # For horizontal aisles, x/y are swapped
        # aisle_x_start/end are actually y coordinates
        # y_start/end are actually x coordinates
        top_start = max(0, aisle_x_start - scan_width)
        left_region = gray[top_start:aisle_x_start, y_start:y_end]

        bottom_end = min(h, aisle_x_end + scan_width)
        right_region = gray[aisle_x_end:bottom_end, y_start:y_end]

    # Calculate darkness ratios
    if left_region.size > 0:
        left_dark_pixels = np.sum(left_region < dark_threshold)
        left_darkness = left_dark_pixels / left_region.size
    else:
        left_darkness = 0.0

    if right_region.size > 0:
        right_dark_pixels = np.sum(right_region < dark_threshold)
        right_darkness = right_dark_pixels / right_region.size
    else:
        right_darkness = 0.0

    # Both sides must have sufficient dark content
    is_valid = left_darkness >= min_dark_ratio and right_darkness >= min_dark_ratio

    return (is_valid, left_darkness, right_darkness)


@dataclass
class LineDetectionResult:
    """Results from line detection"""
    all_lines: List[LineSegment]
    line_clusters: List[LineCluster]
    aisle_candidates: List[AisleCandidate]
    orientation_map: np.ndarray  # Visualization of line orientations


def detect_lines(
    image: np.ndarray,
    min_line_length: int = 30,
    max_line_gap: int = 10,
    threshold: int = 50,
) -> List[LineSegment]:
    """
    Detect all line segments in the image.

    Args:
        image: BGR or grayscale image
        min_line_length: Minimum line length to detect
        max_line_gap: Maximum gap to bridge
        threshold: Hough accumulator threshold

    Returns:
        List of LineSegment objects
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    # Edge detection
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)

    # Probabilistic Hough Line Transform
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=threshold,
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        return []

    segments = []
    for line in lines:
        x1, y1, x2, y2 = line[0]

        # Calculate angle (0 = horizontal, 90 = vertical)
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1))
        # Normalize to 0-180
        if angle < 0:
            angle += 180

        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        midpoint = ((x1 + x2) // 2, (y1 + y2) // 2)

        segments.append(LineSegment(
            start=(x1, y1),
            end=(x2, y2),
            angle=angle,
            length=length,
            midpoint=midpoint,
        ))

    return segments


def cluster_parallel_lines(
    lines: List[LineSegment],
    angle_tolerance: float = 10.0,
    distance_threshold: float = 100.0,
) -> List[LineCluster]:
    """
    Group lines into clusters based on angle similarity and proximity.

    Args:
        lines: List of detected lines
        angle_tolerance: Max angle difference for same cluster (degrees)
        distance_threshold: Max distance between lines in same cluster

    Returns:
        List of LineCluster objects
    """
    if not lines:
        return []

    # First, group by angle (horizontal vs vertical vs diagonal)
    horizontal_lines = []  # angle close to 0 or 180
    vertical_lines = []    # angle close to 90
    diagonal_lines = []    # other angles

    for line in lines:
        # Normalize angle to 0-90 range for comparison
        norm_angle = line.angle if line.angle <= 90 else 180 - line.angle

        if norm_angle < 20:
            horizontal_lines.append(line)
        elif norm_angle > 70:
            vertical_lines.append(line)
        else:
            diagonal_lines.append(line)

    clusters = []
    cluster_id = 0

    # Process horizontal lines
    if horizontal_lines:
        h_clusters = _cluster_by_position(horizontal_lines, "horizontal", distance_threshold)
        for c in h_clusters:
            cluster_id += 1
            clusters.append(_create_cluster(cluster_id, c, "horizontal"))

    # Process vertical lines
    if vertical_lines:
        v_clusters = _cluster_by_position(vertical_lines, "vertical", distance_threshold)
        for c in v_clusters:
            cluster_id += 1
            clusters.append(_create_cluster(cluster_id, c, "vertical"))

    return clusters


def _cluster_by_position(
    lines: List[LineSegment],
    orientation: str,
    distance_threshold: float,
) -> List[List[LineSegment]]:
    """
    Cluster lines by their position (for grouping parallel lines).

    For horizontal lines, cluster by Y position.
    For vertical lines, cluster by X position.
    """
    if not lines:
        return []

    # Sort by position
    if orientation == "horizontal":
        sorted_lines = sorted(lines, key=lambda l: l.midpoint[1])
        get_pos = lambda l: l.midpoint[1]
    else:
        sorted_lines = sorted(lines, key=lambda l: l.midpoint[0])
        get_pos = lambda l: l.midpoint[0]

    clusters = []
    current_cluster = [sorted_lines[0]]

    for line in sorted_lines[1:]:
        # Check if this line is close to the current cluster
        cluster_pos = np.mean([get_pos(l) for l in current_cluster])
        line_pos = get_pos(line)

        if abs(line_pos - cluster_pos) < distance_threshold:
            current_cluster.append(line)
        else:
            if len(current_cluster) >= 3:  # Minimum lines for a valid cluster
                clusters.append(current_cluster)
            current_cluster = [line]

    # Don't forget the last cluster
    if len(current_cluster) >= 3:
        clusters.append(current_cluster)

    return clusters


def _create_cluster(
    cluster_id: int,
    lines: List[LineSegment],
    orientation: str,
) -> LineCluster:
    """Create a LineCluster from a list of lines."""
    # Calculate bounding box
    all_x = []
    all_y = []
    for line in lines:
        all_x.extend([line.start[0], line.end[0]])
        all_y.extend([line.start[1], line.end[1]])

    x_min, x_max = min(all_x), max(all_x)
    y_min, y_max = min(all_y), max(all_y)

    # Calculate average angle
    avg_angle = np.mean([line.angle for line in lines])

    # Calculate average spacing
    if orientation == "horizontal":
        positions = sorted([line.midpoint[1] for line in lines])
    else:
        positions = sorted([line.midpoint[0] for line in lines])

    if len(positions) > 1:
        spacings = [positions[i+1] - positions[i] for i in range(len(positions) - 1)]
        avg_spacing = np.mean(spacings)
    else:
        avg_spacing = 0

    return LineCluster(
        id=cluster_id,
        lines=lines,
        dominant_angle=avg_angle,
        orientation=orientation,
        bounding_box=(x_min, y_min, x_max - x_min, y_max - y_min),
        average_spacing=avg_spacing,
        line_count=len(lines),
    )


def detect_aisles_from_whitespace(
    image: np.ndarray,
    min_aisle_width: int = 15,
    max_aisle_width: int = 150,
    min_aisle_length: int = 200,
) -> List[AisleCandidate]:
    """
    Detect aisles by finding white/light corridors in the image.
    This works better for internal aisles within racking areas.

    Args:
        image: BGR image
        min_aisle_width: Minimum aisle width in pixels
        max_aisle_width: Maximum aisle width in pixels
        min_aisle_length: Minimum aisle length to consider

    Returns:
        List of AisleCandidate objects
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    aisles = []
    aisle_id = 0

    # Use adaptive thresholding - Otsu's method finds optimal threshold
    # This handles varying brightness across the image much better than fixed 220
    otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Use a threshold slightly below Otsu to catch more light areas
    # Otsu typically finds the midpoint, but aisles are lighter than average
    adaptive_thresh = max(180, min(otsu_thresh + 20, 230))
    _, binary = cv2.threshold(gray, adaptive_thresh, 255, cv2.THRESH_BINARY)

    # Find horizontal aisles by analyzing horizontal projection
    # Sum pixels in each row - high values indicate horizontal white corridors
    h_projection = np.sum(binary, axis=1) / 255

    # Find continuous regions of high whiteness (horizontal aisles)
    in_aisle = False
    aisle_start = 0
    threshold = w * 0.3  # At least 30% of row should be white

    for y in range(h):
        if h_projection[y] > threshold:
            if not in_aisle:
                in_aisle = True
                aisle_start = y
        else:
            if in_aisle:
                in_aisle = False
                aisle_width = y - aisle_start
                if min_aisle_width <= aisle_width <= max_aisle_width:
                    # Find the actual extent of this aisle
                    row_slice = binary[aisle_start:y, :]
                    col_sums = np.sum(row_slice, axis=0) / 255

                    # Find leftmost and rightmost white regions
                    white_cols = np.where(col_sums > (y - aisle_start) * 0.3)[0]
                    if len(white_cols) > min_aisle_length:
                        x_start = white_cols[0]
                        x_end = white_cols[-1]
                        aisle_length = x_end - x_start

                        if aisle_length >= min_aisle_length:
                            aisle_id += 1
                            centerline_y = (aisle_start + y) // 2
                            aisles.append(AisleCandidate(
                                id=aisle_id,
                                centerline=[(int(x_start), centerline_y), (int(x_end), centerline_y)],
                                width=float(aisle_width),
                                orientation="horizontal",
                                bounding_box=(int(x_start), aisle_start, int(x_end - x_start), aisle_width),
                                adjacent_clusters=[],
                            ))

    # Find vertical aisles by analyzing vertical projection
    v_projection = np.sum(binary, axis=0) / 255
    threshold = h * 0.3

    in_aisle = False
    for x in range(w):
        if v_projection[x] > threshold:
            if not in_aisle:
                in_aisle = True
                aisle_start = x
        else:
            if in_aisle:
                in_aisle = False
                aisle_width = x - aisle_start
                if min_aisle_width <= aisle_width <= max_aisle_width:
                    # Find the actual extent of this aisle
                    col_slice = binary[:, aisle_start:x]
                    row_sums = np.sum(col_slice, axis=1) / 255

                    # Find topmost and bottommost white regions
                    white_rows = np.where(row_sums > (x - aisle_start) * 0.3)[0]
                    if len(white_rows) > min_aisle_length:
                        y_start = white_rows[0]
                        y_end = white_rows[-1]
                        aisle_length = y_end - y_start

                        if aisle_length >= min_aisle_length:
                            aisle_id += 1
                            centerline_x = (aisle_start + x) // 2
                            aisles.append(AisleCandidate(
                                id=aisle_id,
                                centerline=[(centerline_x, int(y_start)), (centerline_x, int(y_end))],
                                width=float(aisle_width),
                                orientation="vertical",
                                bounding_box=(aisle_start, int(y_start), aisle_width, int(y_end - y_start)),
                                adjacent_clusters=[],
                            ))

    return aisles


def detect_aisles_from_brightness_profile(
    image: np.ndarray,
    min_aisle_width: int = 8,
    max_aisle_width: int = 80,
    min_racking_band_height: int = 100,
) -> List[AisleCandidate]:
    """
    Detect aisles using 1D brightness profiling with precise peak finding.

    This method:
    1. Computes column-wise mean brightness across racking bands
    2. Uses Gaussian smoothing to reduce noise
    3. Finds local maxima (bright = aisle centers) and local minima (dark = racking)
    4. Validates that each brightness peak has dark regions on both sides

    This gives PIXEL-ACCURATE aisle positions by directly analyzing the brightness
    profile rather than bucketing/averaging which introduces offset errors.

    KEY: Aisles are corridors (typically 8-80px), not single-pixel bright lines.

    Args:
        image: BGR image
        min_aisle_width: Minimum aisle width in pixels (default 8 - narrow aisles are common)
        max_aisle_width: Maximum aisle width in pixels
        min_racking_band_height: Minimum height of racking region to analyze

    Returns:
        List of AisleCandidate objects with precise positions
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    aisles = []
    aisle_id = 0

    # Step 1: Find racking bands (regions with high brightness variance)
    row_std = np.std(gray, axis=1)
    racking_threshold = 15  # Lower threshold to catch more bands (was 20)

    in_racking = False
    racking_bands = []
    start = 0

    for y in range(h):
        if row_std[y] > racking_threshold and not in_racking:
            in_racking = True
            start = y
        elif row_std[y] <= racking_threshold and in_racking:
            in_racking = False
            if y - start >= min_racking_band_height:
                racking_bands.append((start, y))

    if in_racking and h - start >= min_racking_band_height:
        racking_bands.append((start, h))

    # Fallback: If no racking bands found via row variance, check for vertical aisle patterns
    # Dense racking areas may have uniform row variance but high column variance (alternating dark/light)
    if len(racking_bands) == 0 and h >= min_racking_band_height:
        # Check if there's a strong vertical pattern (high column variance = aisles)
        col_variance = np.var(gray, axis=0)
        mean_col_variance = np.mean(col_variance)
        # If column variance is high, analyze the full image as one band
        if mean_col_variance > 200:  # Threshold for detecting vertical patterns
            racking_bands = [(0, h)]

    # Step 2: For each racking band, compute column brightness profile
    for band_start, band_end in racking_bands:
        # Extract band region
        band = gray[band_start:band_end, :]
        band_height = band_end - band_start

        # Compute mean brightness per column (1D profile)
        col_brightness = np.mean(band, axis=0)

        # Apply moderate Gaussian smoothing to reduce noise while preserving narrow aisles
        # sigma=3 smooths over ~9 pixel window - enough to remove noise but keep narrow aisles
        from scipy.ndimage import gaussian_filter1d
        smoothed = gaussian_filter1d(col_brightness, sigma=3)

        # Find local maxima (brightness peaks = aisle centers)
        from scipy.signal import find_peaks

        # Calculate adaptive prominence based on signal range
        # This helps detect aisles in both high-contrast and low-contrast regions
        signal_range = np.max(smoothed) - np.min(smoothed)
        # Use 8% of range as prominence, with floor of 8 and cap of 20
        adaptive_prominence = max(8, min(20, signal_range * 0.08))

        # Find peaks with adaptive prominence to catch aisles in varying contrast regions
        peaks, peak_props = find_peaks(
            smoothed,
            distance=min_aisle_width,  # Minimum distance between peaks
            prominence=adaptive_prominence,  # Adaptive prominence based on signal range
            width=(min_aisle_width // 2, max_aisle_width),  # Width constraints
        )

        # Adaptive valley prominence - slightly lower than peak prominence
        valley_prominence = max(6, adaptive_prominence * 0.7)

        # Also find valleys (dark = racking) to validate peaks
        valleys, _ = find_peaks(
            -smoothed,  # Invert to find minima
            distance=6,  # Valleys can be closer for narrow aisles
            prominence=valley_prominence,  # Adaptive threshold for valleys
        )

        # Step 3: Validate each peak as a true aisle
        for peak_idx, peak_x in enumerate(peaks):
            # Get peak width from scipy's analysis
            peak_width = peak_props['widths'][peak_idx] if 'widths' in peak_props else 20
            peak_prominence = peak_props['prominences'][peak_idx]

            # Find the closest valleys on left and right
            left_valleys = valleys[valleys < peak_x]
            right_valleys = valleys[valleys > peak_x]

            if len(left_valleys) == 0 or len(right_valleys) == 0:
                # Need valleys on both sides for a valid aisle
                continue

            left_valley = left_valleys[-1]  # Closest valley on left
            right_valley = right_valleys[0]  # Closest valley on right

            # Aisle width is distance between the flanking valleys
            detected_width = right_valley - left_valley

            # STRICT width check - aisles must be WIDE corridors
            if detected_width < min_aisle_width:
                continue
            if detected_width > max_aisle_width:
                continue

            # Validate: check that valleys are actually dark
            left_brightness = smoothed[left_valley]
            right_brightness = smoothed[right_valley]
            center_brightness = smoothed[peak_x]

            # Center should be brighter than edges
            # Use adaptive contrast threshold based on signal range (12% of range, min 10)
            min_contrast = max(10, signal_range * 0.12)
            brightness_contrast = center_brightness - (left_brightness + right_brightness) / 2
            if brightness_contrast < min_contrast:
                continue

            # Additional validation: the actual raw brightness should also show contrast
            # Check raw (unsmoothed) profile in the detected region
            raw_center = np.mean(col_brightness[max(0, peak_x-3):min(w, peak_x+3)])
            raw_left = np.mean(col_brightness[max(0, left_valley-3):left_valley+3]) if left_valley > 3 else col_brightness[left_valley]
            raw_right = np.mean(col_brightness[max(0, right_valley-3):min(w, right_valley+3)]) if right_valley < w-3 else col_brightness[right_valley]
            raw_contrast = raw_center - (raw_left + raw_right) / 2

            # Adaptive raw contrast threshold (8% of range, min 8)
            min_raw_contrast = max(8, signal_range * 0.08)
            if raw_contrast < min_raw_contrast:
                continue

            # Confidence based on prominence and contrast
            confidence = min(1.0, (peak_prominence / 60) * 0.4 + (brightness_contrast / 80) * 0.4 + (detected_width / 50) * 0.2)
            confidence = max(0.5, confidence)

            aisle_id += 1

            # Use the exact peak position as the aisle center (no bucketing!)
            center_x = int(peak_x)
            aisle_start = int(left_valley)
            aisle_end = int(right_valley)

            aisles.append(AisleCandidate(
                id=aisle_id,
                centerline=[(center_x, band_start), (center_x, band_end)],
                width=float(detected_width),
                orientation="vertical",
                bounding_box=(aisle_start, band_start, detected_width, band_height),
                adjacent_clusters=[],
                confidence=confidence,
                detection_method="brightness_profile",
                line_density_left=1.0 - (left_brightness / 255),
                line_density_right=1.0 - (right_brightness / 255),
            ))

    # Step 4: Detect horizontal aisles using the same method on columns
    col_std = np.std(gray, axis=0)
    racking_threshold_h = 20

    in_racking = False
    racking_bands_h = []
    start = 0

    for x in range(w):
        if col_std[x] > racking_threshold_h and not in_racking:
            in_racking = True
            start = x
        elif col_std[x] <= racking_threshold_h and in_racking:
            in_racking = False
            if x - start >= min_racking_band_height:
                racking_bands_h.append((start, x))

    if in_racking and w - start >= min_racking_band_height:
        racking_bands_h.append((start, w))

    for band_start, band_end in racking_bands_h:
        band = gray[:, band_start:band_end]
        band_width = band_end - band_start

        row_brightness = np.mean(band, axis=1)

        from scipy.ndimage import gaussian_filter1d
        # Use same stronger smoothing as vertical detection
        smoothed = gaussian_filter1d(row_brightness, sigma=5)

        from scipy.signal import find_peaks
        # Same stricter parameters as vertical
        peaks, peak_props = find_peaks(
            smoothed,
            distance=min_aisle_width,
            prominence=30,  # Higher prominence
            width=(min_aisle_width // 2, max_aisle_width),
        )

        valleys, _ = find_peaks(-smoothed, distance=15, prominence=15)

        for peak_idx, peak_y in enumerate(peaks):
            peak_prominence = peak_props['prominences'][peak_idx]

            top_valleys = valleys[valleys < peak_y]
            bottom_valleys = valleys[valleys > peak_y]

            if len(top_valleys) == 0 or len(bottom_valleys) == 0:
                continue

            top_valley = top_valleys[-1]
            bottom_valley = bottom_valleys[0]

            detected_height = bottom_valley - top_valley

            # Strict width check
            if detected_height < min_aisle_width or detected_height > max_aisle_width:
                continue

            top_brightness = smoothed[top_valley]
            bottom_brightness = smoothed[bottom_valley]
            center_brightness = smoothed[peak_y]

            # Higher contrast requirement
            brightness_contrast = center_brightness - (top_brightness + bottom_brightness) / 2
            if brightness_contrast < 30:
                continue

            # Raw validation
            raw_center = np.mean(row_brightness[max(0, peak_y-5):min(h, peak_y+5)])
            raw_top = np.mean(row_brightness[max(0, top_valley-5):top_valley+5]) if top_valley > 5 else row_brightness[top_valley]
            raw_bottom = np.mean(row_brightness[max(0, bottom_valley-5):min(h, bottom_valley+5)]) if bottom_valley < h-5 else row_brightness[bottom_valley]
            raw_contrast = raw_center - (raw_top + raw_bottom) / 2

            if raw_contrast < 20:
                continue

            confidence = min(1.0, (peak_prominence / 60) * 0.4 + (brightness_contrast / 80) * 0.4 + (detected_height / 50) * 0.2)
            confidence = max(0.5, confidence)

            aisle_id += 1
            center_y = int(peak_y)
            aisle_top = int(top_valley)
            aisle_bottom = int(bottom_valley)

            aisles.append(AisleCandidate(
                id=aisle_id,
                centerline=[(band_start, center_y), (band_end, center_y)],
                width=float(detected_height),
                orientation="horizontal",
                bounding_box=(band_start, aisle_top, band_width, detected_height),
                adjacent_clusters=[],
                confidence=confidence,
                detection_method="brightness_profile",
                line_density_left=1.0 - (top_brightness / 255),
                line_density_right=1.0 - (bottom_brightness / 255),
            ))

    return aisles


def detect_aisles_from_gradient_edges(
    image: np.ndarray,
    min_aisle_width: int = 8,
    max_aisle_width: int = 80,
    min_aisle_length: int = 100,
) -> List[AisleCandidate]:
    """
    Detect aisles by finding pairs of opposing gradient edges.

    Aisles have characteristic gradient pattern:
    - DARK -> LIGHT transition on one side
    - LIGHT -> DARK transition on the other side

    This method finds these edge pairs and uses their exact positions
    for pixel-accurate aisle boundaries.

    Args:
        image: BGR image
        min_aisle_width: Minimum aisle width in pixels
        max_aisle_width: Maximum aisle width in pixels
        min_aisle_length: Minimum length to be considered an aisle

    Returns:
        List of AisleCandidate objects
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    aisles = []
    aisle_id = 0

    # Compute horizontal gradient (for vertical edges -> vertical aisles)
    # Positive = dark-to-light (left edge of aisle)
    # Negative = light-to-dark (right edge of aisle)
    sobel_x = cv2.Sobel(gray.astype(float), cv2.CV_64F, 1, 0, ksize=3)

    # For vertical aisles: analyze row-by-row
    # Find where gradient transitions happen

    # Compute row-wise gradient magnitude
    row_gradient = np.sum(np.abs(sobel_x), axis=0)  # Sum along columns

    # Find regions with high variance (racking areas)
    row_std = np.std(gray, axis=1)
    in_racking = row_std > 15  # Lower threshold (was 20)
    racking_rows = np.where(in_racking)[0]

    # Find continuous racking bands
    racking_bands = []
    if len(racking_rows) >= min_aisle_length:
        start_idx = 0
        for i in range(1, len(racking_rows)):
            if racking_rows[i] - racking_rows[i-1] > 20:  # Gap in racking
                if i - start_idx >= 50:
                    racking_bands.append((racking_rows[start_idx], racking_rows[i-1]))
                start_idx = i
        if len(racking_rows) - start_idx >= 50:
            racking_bands.append((racking_rows[start_idx], racking_rows[-1]))

    # Fallback: If no racking bands found, check for vertical aisle patterns
    if len(racking_bands) == 0 and h >= min_aisle_length:
        col_variance = np.var(gray, axis=0)
        mean_col_variance = np.mean(col_variance)
        if mean_col_variance > 200:
            racking_bands = [(0, h)]

    if len(racking_bands) == 0:
        return aisles

    for band_start, band_end in racking_bands:
        # Compute gradient profile within this band
        band_gradient = sobel_x[band_start:band_end, :]

        # Average gradient across rows
        avg_gradient = np.mean(band_gradient, axis=0)

        # Smooth to reduce noise
        from scipy.ndimage import gaussian_filter1d
        smoothed_grad = gaussian_filter1d(avg_gradient, sigma=3)

        # Find positive peaks (left edges: dark -> light)
        from scipy.signal import find_peaks
        left_edges, left_props = find_peaks(smoothed_grad, distance=min_aisle_width, prominence=5)

        # Find negative peaks (right edges: light -> dark)
        right_edges, right_props = find_peaks(-smoothed_grad, distance=min_aisle_width, prominence=5)

        # Match left edges with right edges to form aisles
        for left_x in left_edges:
            # Find the closest right edge that's within valid aisle width
            valid_right = right_edges[(right_edges > left_x) &
                                       (right_edges - left_x >= min_aisle_width) &
                                       (right_edges - left_x <= max_aisle_width)]

            if len(valid_right) == 0:
                continue

            right_x = valid_right[0]  # Take the closest valid right edge
            aisle_width = right_x - left_x

            # Validate: check brightness in the center
            center_x = (left_x + right_x) // 2
            left_brightness = np.mean(gray[band_start:band_end, max(0, left_x-10):left_x])
            center_brightness = np.mean(gray[band_start:band_end, left_x:right_x])
            right_brightness = np.mean(gray[band_start:band_end, right_x:min(w, right_x+10)])

            # Center should be brighter than edges
            if center_brightness < left_brightness + 15 or center_brightness < right_brightness + 15:
                continue

            # Confidence based on gradient strength and brightness contrast
            left_strength = smoothed_grad[left_x] if left_x < len(smoothed_grad) else 0
            right_strength = -smoothed_grad[right_x] if right_x < len(smoothed_grad) else 0
            avg_strength = (left_strength + right_strength) / 2
            brightness_diff = center_brightness - (left_brightness + right_brightness) / 2

            confidence = min(1.0, (avg_strength / 30) * 0.4 + (brightness_diff / 50) * 0.6)
            confidence = max(0.5, confidence)

            aisle_id += 1
            aisles.append(AisleCandidate(
                id=aisle_id,
                centerline=[(center_x, band_start), (center_x, band_end)],
                width=float(aisle_width),
                orientation="vertical",
                bounding_box=(int(left_x), band_start, int(aisle_width), band_end - band_start),
                adjacent_clusters=[],
                confidence=confidence,
                detection_method="gradient_edges",
                line_density_left=1.0 - (left_brightness / 255),
                line_density_right=1.0 - (right_brightness / 255),
            ))

    # Similar process for horizontal aisles using vertical gradient
    sobel_y = cv2.Sobel(gray.astype(float), cv2.CV_64F, 0, 1, ksize=3)

    col_std = np.std(gray, axis=0)
    in_racking_h = col_std > 20
    racking_cols = np.where(in_racking_h)[0]

    if len(racking_cols) < min_aisle_length:
        return aisles

    racking_bands_h = []
    start_idx = 0
    for i in range(1, len(racking_cols)):
        if racking_cols[i] - racking_cols[i-1] > 20:
            if i - start_idx >= 50:
                racking_bands_h.append((racking_cols[start_idx], racking_cols[i-1]))
            start_idx = i
    if len(racking_cols) - start_idx >= 50:
        racking_bands_h.append((racking_cols[start_idx], racking_cols[-1]))

    for band_start, band_end in racking_bands_h:
        band_gradient = sobel_y[:, band_start:band_end]
        avg_gradient = np.mean(band_gradient, axis=1)

        from scipy.ndimage import gaussian_filter1d
        smoothed_grad = gaussian_filter1d(avg_gradient, sigma=3)

        from scipy.signal import find_peaks
        top_edges, _ = find_peaks(smoothed_grad, distance=min_aisle_width, prominence=5)
        bottom_edges, _ = find_peaks(-smoothed_grad, distance=min_aisle_width, prominence=5)

        for top_y in top_edges:
            valid_bottom = bottom_edges[(bottom_edges > top_y) &
                                         (bottom_edges - top_y >= min_aisle_width) &
                                         (bottom_edges - top_y <= max_aisle_width)]

            if len(valid_bottom) == 0:
                continue

            bottom_y = valid_bottom[0]
            aisle_height = bottom_y - top_y

            center_y = (top_y + bottom_y) // 2
            top_brightness = np.mean(gray[max(0, top_y-10):top_y, band_start:band_end])
            center_brightness = np.mean(gray[top_y:bottom_y, band_start:band_end])
            bottom_brightness = np.mean(gray[bottom_y:min(h, bottom_y+10), band_start:band_end])

            if center_brightness < top_brightness + 15 or center_brightness < bottom_brightness + 15:
                continue

            top_strength = smoothed_grad[top_y] if top_y < len(smoothed_grad) else 0
            bottom_strength = -smoothed_grad[bottom_y] if bottom_y < len(smoothed_grad) else 0
            avg_strength = (top_strength + bottom_strength) / 2
            brightness_diff = center_brightness - (top_brightness + bottom_brightness) / 2

            confidence = min(1.0, (avg_strength / 30) * 0.4 + (brightness_diff / 50) * 0.6)
            confidence = max(0.5, confidence)

            aisle_id += 1
            aisles.append(AisleCandidate(
                id=aisle_id,
                centerline=[(band_start, center_y), (band_end, center_y)],
                width=float(aisle_height),
                orientation="horizontal",
                bounding_box=(band_start, int(top_y), band_end - band_start, int(aisle_height)),
                adjacent_clusters=[],
                confidence=confidence,
                detection_method="gradient_edges",
                line_density_left=1.0 - (top_brightness / 255),
                line_density_right=1.0 - (bottom_brightness / 255),
            ))

    return aisles


def detect_aisles_from_brightness_pattern(
    image: np.ndarray,
    min_aisle_width: int = 10,
    max_aisle_width: int = 80,
    dark_thresh: int = 150,
    light_thresh: int = 230,
    min_consistency: int = 5,
    num_samples: int = 15,
) -> List[AisleCandidate]:
    """
    DEPRECATED: Legacy detection using bucket-averaging.
    Use detect_aisles_from_brightness_profile() for better accuracy.

    Kept for backward compatibility but now redirects to the new method.
    """
    # Use the new, more accurate method
    return detect_aisles_from_brightness_profile(
        image,
        min_aisle_width=min_aisle_width,
        max_aisle_width=max_aisle_width,
        min_racking_band_height=100,
    )


def detect_aisles_from_line_pairs(
    image: np.ndarray,
    min_aisle_width: int = 8,
    max_aisle_width: int = 120,
    min_aisle_length: int = 100,
    scan_window: int = 40,
) -> List[AisleCandidate]:
    """
    Detect aisles by finding whitespace corridors bounded by black lines on both sides.

    This is the key insight: Aisles are whitespace corridors where:
    - VERTICAL AISLES: black lines (racking) on LEFT and RIGHT sides
    - HORIZONTAL AISLES: black lines (racking) on TOP and BOTTOM sides

    Uses edge detection to find line structures rather than absolute brightness,
    which works better for images with varying backgrounds.

    Args:
        image: BGR image
        min_aisle_width: Minimum aisle width in pixels
        max_aisle_width: Maximum aisle width in pixels
        min_aisle_length: Minimum aisle length to consider valid
        scan_window: Size of window to detect dark lines on sides

    Returns:
        List of AisleCandidate objects with high confidence
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    aisles = []
    aisle_id = 0

    # Use Canny edge detection to find line structures (black lines = racking)
    edges = cv2.Canny(gray, 30, 100)

    # Use Sobel to detect vertical edges (for vertical racking lines)
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_x = np.abs(sobel_x)
    sobel_x = (sobel_x / sobel_x.max() * 255).astype(np.uint8) if sobel_x.max() > 0 else sobel_x.astype(np.uint8)

    # Use Sobel to detect horizontal edges (for horizontal racking lines)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    sobel_y = np.abs(sobel_y)
    sobel_y = (sobel_y / sobel_y.max() * 255).astype(np.uint8) if sobel_y.max() > 0 else sobel_y.astype(np.uint8)

    # Threshold edges to get binary maps
    edge_threshold = 30
    _, vertical_edges = cv2.threshold(sobel_x, edge_threshold, 255, cv2.THRESH_BINARY)
    _, horizontal_edges = cv2.threshold(sobel_y, edge_threshold, 255, cv2.THRESH_BINARY)

    # Use adaptive thresholding based on image statistics for "light" areas
    mean_gray = np.mean(gray)
    # If image is mostly light (like floorplans), use relative comparison
    # A column is "light" if it has significantly fewer edges than average
    col_edge_density = np.sum(vertical_edges, axis=0) / h
    row_edge_density = np.sum(horizontal_edges, axis=1) / w
    mean_col_edge = np.mean(col_edge_density)
    mean_row_edge = np.mean(row_edge_density)

    # =====================================
    # DETECT VERTICAL AISLES (using edge-based detection)
    # Pattern: high-edge column | low-edge column | high-edge column
    # Low-edge columns = aisles (whitespace), High-edge columns = racking (lines)
    # =====================================
    vertical_aisles = []

    # A column is a potential aisle if it has LOW vertical edge density
    # (i.e., fewer vertical lines = whitespace corridor)
    # And adjacent columns have HIGH vertical edge density (racking lines)

    # Use thresholds based on edge density distribution
    # Aisles = columns with LOW edge density (whitespace)
    # Racking = columns with HIGH edge density (many lines)
    median_col_edge = np.median(col_edge_density)
    mean_col_edge = np.mean(col_edge_density)

    # Low threshold: below median to catch clear whitespace corridors
    low_edge_threshold = max(8, min(median_col_edge * 0.7, 15))

    # High threshold: significantly above median to identify racking lines
    high_edge_threshold = max(25, mean_col_edge * 0.8)

    in_low_region = False
    low_start = 0

    for x in range(w):
        is_low_edge = col_edge_density[x] < low_edge_threshold

        if is_low_edge and not in_low_region:
            in_low_region = True
            low_start = x
        elif not is_low_edge and in_low_region:
            in_low_region = False
            low_end = x
            region_width = low_end - low_start

            if min_aisle_width <= region_width <= max_aisle_width:
                # Check for high-edge (racking lines) on LEFT side
                left_check_start = max(0, low_start - scan_window)
                left_check_end = low_start
                left_edge_density = np.mean(col_edge_density[left_check_start:left_check_end]) if left_check_start < left_check_end else 0

                # Check for high-edge (racking lines) on RIGHT side
                right_check_start = low_end
                right_check_end = min(w, low_end + scan_window)
                right_edge_density = np.mean(col_edge_density[right_check_start:right_check_end]) if right_check_start < right_check_end else 0

                # Both sides should have significant edge content (racking lines)
                has_left_lines = left_edge_density > high_edge_threshold
                has_right_lines = right_edge_density > high_edge_threshold

                if has_left_lines and has_right_lines:
                    # Find the vertical extent of this aisle by looking at where edges exist
                    col_slice = vertical_edges[:, low_start:low_end]
                    row_edge_in_aisle = np.sum(col_slice, axis=1) / (region_width + 1)

                    # Find continuous low-edge regions (the actual aisle path)
                    low_edge_rows = np.where(row_edge_in_aisle < low_edge_threshold)[0]
                    if len(low_edge_rows) > min_aisle_length:
                        y_start = int(low_edge_rows[0])
                        y_end = int(low_edge_rows[-1])
                        aisle_length = y_end - y_start

                        if aisle_length >= min_aisle_length:
                            aisle_id += 1
                            centerline_x = (low_start + low_end) // 2

                            # Confidence based on edge density contrast
                            avg_side_edge = (left_edge_density + right_edge_density) / 2
                            center_edge = np.mean(col_edge_density[low_start:low_end])
                            edge_contrast = (avg_side_edge - center_edge) / (avg_side_edge + 1)
                            confidence = min(1.0, max(0.5, edge_contrast + 0.3))

                            vertical_aisles.append(AisleCandidate(
                                id=aisle_id,
                                centerline=[(centerline_x, y_start), (centerline_x, y_end)],
                                width=float(region_width),
                                orientation="vertical",
                                bounding_box=(low_start, y_start, region_width, aisle_length),
                                adjacent_clusters=[],
                                confidence=confidence,
                                detection_method="line_pair",
                                line_density_left=float(left_edge_density / 255),
                                line_density_right=float(right_edge_density / 255),
                            ))

    # =====================================
    # DETECT HORIZONTAL AISLES (using edge-based detection)
    # Pattern: high-edge row / low-edge row / high-edge row
    # =====================================
    horizontal_aisles = []

    # Use threshold based on median for horizontal edges
    median_row_edge = np.median(row_edge_density)
    low_row_threshold = max(5, median_row_edge * 0.3)
    high_row_threshold = max(20, median_row_edge * 0.8)

    in_low_region = False
    low_start = 0

    for y in range(h):
        is_low_edge = row_edge_density[y] < low_row_threshold

        if is_low_edge and not in_low_region:
            in_low_region = True
            low_start = y
        elif not is_low_edge and in_low_region:
            in_low_region = False
            low_end = y
            region_height = low_end - low_start

            if min_aisle_width <= region_height <= max_aisle_width:
                # Check for high-edge (racking lines) ABOVE
                top_check_start = max(0, low_start - scan_window)
                top_check_end = low_start
                top_edge_density = np.mean(row_edge_density[top_check_start:top_check_end]) if top_check_start < top_check_end else 0

                # Check for high-edge (racking lines) BELOW
                bottom_check_start = low_end
                bottom_check_end = min(h, low_end + scan_window)
                bottom_edge_density = np.mean(row_edge_density[bottom_check_start:bottom_check_end]) if bottom_check_start < bottom_check_end else 0

                # Both sides should have significant edge content (racking lines)
                has_top_lines = top_edge_density > high_row_threshold
                has_bottom_lines = bottom_edge_density > high_row_threshold

                if has_top_lines and has_bottom_lines:
                    # Find the horizontal extent of this aisle by looking at edges
                    row_slice = horizontal_edges[low_start:low_end, :]
                    col_edge_in_aisle = np.sum(row_slice, axis=0) / (region_height + 1)

                    # Find continuous low-edge regions (the actual aisle path)
                    low_edge_cols = np.where(col_edge_in_aisle < low_row_threshold)[0]
                    if len(low_edge_cols) > min_aisle_length:
                        x_start = int(low_edge_cols[0])
                        x_end = int(low_edge_cols[-1])
                        aisle_length = x_end - x_start

                        if aisle_length >= min_aisle_length:
                            aisle_id += 1
                            centerline_y = (low_start + low_end) // 2

                            # Confidence based on edge density contrast
                            avg_side_edge = (top_edge_density + bottom_edge_density) / 2
                            center_edge = np.mean(row_edge_density[low_start:low_end])
                            edge_contrast = (avg_side_edge - center_edge) / (avg_side_edge + 1)
                            confidence = min(1.0, max(0.5, edge_contrast + 0.3))

                            horizontal_aisles.append(AisleCandidate(
                                id=aisle_id,
                                centerline=[(x_start, centerline_y), (x_end, centerline_y)],
                                width=float(region_height),
                                orientation="horizontal",
                                bounding_box=(x_start, low_start, aisle_length, region_height),
                                adjacent_clusters=[],
                                confidence=confidence,
                                detection_method="line_pair",
                                line_density_left=float(top_edge_density / 255),
                                line_density_right=float(bottom_edge_density / 255),
                            ))

    aisles = vertical_aisles + horizontal_aisles
    return aisles


def deduplicate_aisles(
    aisles: List[AisleCandidate],
    merge_distance: int = 30,
) -> List[AisleCandidate]:
    """
    Merge nearby aisles with similar positions into single aisles.

    For vertical aisles: merge if X centers are within merge_distance
    For horizontal aisles: merge if Y centers are within merge_distance

    Args:
        aisles: List of detected aisles (may contain duplicates)
        merge_distance: Maximum distance between aisle centers to merge

    Returns:
        Deduplicated list of aisles
    """
    if not aisles:
        return []

    # Separate by orientation
    vertical = [a for a in aisles if a.orientation == "vertical"]
    horizontal = [a for a in aisles if a.orientation == "horizontal"]

    def get_center(aisle: AisleCandidate) -> float:
        """Get the primary center coordinate for merging."""
        if aisle.orientation == "vertical":
            # For vertical aisles, X is the primary coordinate
            return (aisle.bounding_box[0] + aisle.bounding_box[0] + aisle.bounding_box[2]) / 2
        else:
            # For horizontal aisles, Y is the primary coordinate
            return (aisle.bounding_box[1] + aisle.bounding_box[1] + aisle.bounding_box[3]) / 2

    def merge_group(group: List[AisleCandidate]) -> AisleCandidate:
        """Merge a group of similar aisles into one."""
        if len(group) == 1:
            return group[0]

        # Use the highest confidence aisle as the base
        best = max(group, key=lambda a: a.confidence)

        # Compute merged bounding box (union of all)
        x_min = min(a.bounding_box[0] for a in group)
        y_min = min(a.bounding_box[1] for a in group)
        x_max = max(a.bounding_box[0] + a.bounding_box[2] for a in group)
        y_max = max(a.bounding_box[1] + a.bounding_box[3] for a in group)

        # Average width
        avg_width = np.mean([a.width for a in group])

        # Average confidence (weighted toward better ones)
        avg_confidence = np.mean([a.confidence for a in group])
        avg_confidence = max(avg_confidence, best.confidence)

        # Average line densities
        avg_density_left = np.mean([a.line_density_left for a in group])
        avg_density_right = np.mean([a.line_density_right for a in group])

        # Create merged centerline
        if best.orientation == "vertical":
            center_x = (x_min + x_max) // 2
            centerline = [(center_x, y_min), (center_x, y_max)]
            width = x_max - x_min
            bbox = (x_min, y_min, width, y_max - y_min)
        else:
            center_y = (y_min + y_max) // 2
            centerline = [(x_min, center_y), (x_max, center_y)]
            height = y_max - y_min
            bbox = (x_min, y_min, x_max - x_min, height)

        return AisleCandidate(
            id=best.id,
            centerline=centerline,
            width=float(avg_width),
            orientation=best.orientation,
            bounding_box=bbox,
            adjacent_clusters=best.adjacent_clusters,
            confidence=avg_confidence,
            detection_method=best.detection_method,
            line_density_left=avg_density_left,
            line_density_right=avg_density_right,
        )

    def cluster_aisles(aisle_list: List[AisleCandidate]) -> List[AisleCandidate]:
        """Cluster aisles by center position and merge each cluster."""
        if not aisle_list:
            return []

        # Sort by center position
        sorted_aisles = sorted(aisle_list, key=get_center)

        # Cluster nearby aisles
        clusters = []
        current_cluster = [sorted_aisles[0]]

        for i in range(1, len(sorted_aisles)):
            aisle = sorted_aisles[i]
            prev_center = get_center(current_cluster[-1])
            curr_center = get_center(aisle)

            if curr_center - prev_center <= merge_distance:
                # Close enough, add to current cluster
                current_cluster.append(aisle)
            else:
                # Too far, start new cluster
                clusters.append(current_cluster)
                current_cluster = [aisle]

        # Don't forget the last cluster
        clusters.append(current_cluster)

        # Merge each cluster
        return [merge_group(c) for c in clusters]

    # Deduplicate each orientation separately
    deduped_vertical = cluster_aisles(vertical)
    deduped_horizontal = cluster_aisles(horizontal)

    # Combine and renumber
    result = []
    for i, aisle in enumerate(deduped_vertical + deduped_horizontal, start=1):
        aisle.id = i
        result.append(aisle)

    return result


def detect_travel_lanes_morphological(
    image: np.ndarray,
    min_width: int = 40,
    min_length: int = 200,
    whiteness_threshold: int = 200,
) -> List[AisleCandidate]:
    """
    Detect travel lanes using morphological operations.

    Travel lanes are large, continuous whitespace corridors that run through
    the warehouse. This method uses:
    1. Thresholding to find light areas
    2. Morphological closing to connect nearby white regions
    3. Contour analysis to find elongated rectangular regions

    Args:
        image: BGR image
        min_width: Minimum width of travel lane
        min_length: Minimum length of travel lane
        whiteness_threshold: Brightness threshold for "white" pixels

    Returns:
        List of AisleCandidate objects representing travel lanes
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()

    h, w = gray.shape
    travel_lanes = []
    aisle_id = 0

    # Use adaptive thresholding to find light areas
    # Otsu's method adapts to image brightness
    otsu_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thresh_value = max(whiteness_threshold, otsu_thresh)
    _, binary = cv2.threshold(gray, thresh_value, 255, cv2.THRESH_BINARY)

    # Morphological closing to connect nearby white regions
    # This helps bridge small gaps in travel lanes
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)

    # Morphological opening to remove small noise
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (10, 10))
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)

    # Find contours of white regions
    contours, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for contour in contours:
        # Get bounding rectangle
        x, y, rect_w, rect_h = cv2.boundingRect(contour)

        # Filter by size - travel lanes should be substantial
        area = cv2.contourArea(contour)
        if area < min_width * min_length:
            continue

        # Determine orientation based on aspect ratio
        if rect_w > rect_h:
            # Horizontal lane
            if rect_h >= min_width and rect_w >= min_length:
                aisle_id += 1
                center_y = y + rect_h // 2

                # Check that this region is actually bright (not just bounded)
                region = gray[y:y+rect_h, x:x+rect_w]
                avg_brightness = np.mean(region)
                if avg_brightness < 180:  # Skip if not bright enough
                    continue

                confidence = min(1.0, (avg_brightness - 180) / 75 + 0.4)

                travel_lanes.append(AisleCandidate(
                    id=aisle_id,
                    centerline=[(x, center_y), (x + rect_w, center_y)],
                    width=float(rect_h),
                    orientation="horizontal",
                    bounding_box=(x, y, rect_w, rect_h),
                    adjacent_clusters=[],
                    confidence=confidence,
                    detection_method="travel_lane_morph",
                ))
        else:
            # Vertical lane
            if rect_w >= min_width and rect_h >= min_length:
                aisle_id += 1
                center_x = x + rect_w // 2

                # Check brightness
                region = gray[y:y+rect_h, x:x+rect_w]
                avg_brightness = np.mean(region)
                if avg_brightness < 180:
                    continue

                confidence = min(1.0, (avg_brightness - 180) / 75 + 0.4)

                travel_lanes.append(AisleCandidate(
                    id=aisle_id,
                    centerline=[(center_x, y), (center_x, y + rect_h)],
                    width=float(rect_w),
                    orientation="vertical",
                    bounding_box=(x, y, rect_w, rect_h),
                    adjacent_clusters=[],
                    confidence=confidence,
                    detection_method="travel_lane_morph",
                ))

    return travel_lanes


def detect_aisles(
    image: np.ndarray,
    line_clusters: List[LineCluster],
    min_aisle_width: int = 20,
    max_aisle_width: int = 200,
) -> List[AisleCandidate]:
    """
    Detect aisles using multiple methods:
    1. Gaps between line clusters
    2. White space analysis for internal aisles

    Args:
        image: Original image (for dimensions)
        line_clusters: Detected line clusters
        min_aisle_width: Minimum width to consider as aisle
        max_aisle_width: Maximum width to consider as aisle

    Returns:
        List of AisleCandidate objects (deduplicated)
    """
    h, w = image.shape[:2]
    aisles = []
    aisle_id = 0

    # Method 1: Gaps between line clusters
    h_clusters = [c for c in line_clusters if c.orientation == "horizontal"]
    v_clusters = [c for c in line_clusters if c.orientation == "vertical"]

    # Find horizontal aisles (gaps between vertically-stacked horizontal line clusters)
    if len(h_clusters) >= 2:
        h_sorted = sorted(h_clusters, key=lambda c: c.bounding_box[1])
        for i in range(len(h_sorted) - 1):
            c1, c2 = h_sorted[i], h_sorted[i + 1]

            # Gap between clusters
            gap_start = c1.bounding_box[1] + c1.bounding_box[3]
            gap_end = c2.bounding_box[1]
            gap_width = gap_end - gap_start

            if min_aisle_width <= gap_width <= max_aisle_width:
                aisle_id += 1
                centerline_y = (gap_start + gap_end) // 2

                # Aisle spans the full width where both clusters exist
                x_start = max(c1.bounding_box[0], c2.bounding_box[0])
                x_end = min(
                    c1.bounding_box[0] + c1.bounding_box[2],
                    c2.bounding_box[0] + c2.bounding_box[2]
                )

                aisles.append(AisleCandidate(
                    id=aisle_id,
                    centerline=[(x_start, centerline_y), (x_end, centerline_y)],
                    width=gap_width,
                    orientation="horizontal",
                    bounding_box=(x_start, gap_start, x_end - x_start, gap_width),
                    adjacent_clusters=[c1.id, c2.id],
                ))

    # Find vertical aisles (gaps between horizontally-adjacent vertical line clusters)
    if len(v_clusters) >= 2:
        v_sorted = sorted(v_clusters, key=lambda c: c.bounding_box[0])
        for i in range(len(v_sorted) - 1):
            c1, c2 = v_sorted[i], v_sorted[i + 1]

            # Gap between clusters
            gap_start = c1.bounding_box[0] + c1.bounding_box[2]
            gap_end = c2.bounding_box[0]
            gap_width = gap_end - gap_start

            if min_aisle_width <= gap_width <= max_aisle_width:
                aisle_id += 1
                centerline_x = (gap_start + gap_end) // 2

                # Aisle spans the full height where both clusters exist
                y_start = max(c1.bounding_box[1], c2.bounding_box[1])
                y_end = min(
                    c1.bounding_box[1] + c1.bounding_box[3],
                    c2.bounding_box[1] + c2.bounding_box[3]
                )

                aisles.append(AisleCandidate(
                    id=aisle_id,
                    centerline=[(centerline_x, y_start), (centerline_x, y_end)],
                    width=gap_width,
                    orientation="vertical",
                    bounding_box=(gap_start, y_start, gap_width, y_end - y_start),
                    adjacent_clusters=[c1.id, c2.id],
                ))

    # Method 2: NEW - Brightness profile with precise peak finding (PRIMARY METHOD)
    # Uses 1D column brightness analysis with scipy peak detection
    # This gives PIXEL-ACCURATE positions (no bucket rounding)
    # KEY: min_aisle_width=8 to catch narrow aisles in dense racking
    profile_aisles = detect_aisles_from_brightness_profile(
        image,
        min_aisle_width=8,  # Narrow aisles are common in dense racking
        max_aisle_width=80,
        min_racking_band_height=80,
    )

    # Add profile-detected aisles (highest accuracy)
    for p_aisle in profile_aisles:
        aisle_id += 1
        aisles.append(AisleCandidate(
            id=aisle_id,
            centerline=p_aisle.centerline,
            width=p_aisle.width,
            orientation=p_aisle.orientation,
            bounding_box=p_aisle.bounding_box,
            adjacent_clusters=[],
            confidence=p_aisle.confidence,
            detection_method="brightness_profile",
            line_density_left=p_aisle.line_density_left,
            line_density_right=p_aisle.line_density_right,
        ))

    # Method 3: NEW - Gradient edge detection (SECONDARY METHOD)
    # Finds opposing gradient pairs (dark->light and light->dark transitions)
    # Provides additional validation and catches aisles missed by brightness
    gradient_aisles = detect_aisles_from_gradient_edges(
        image,
        min_aisle_width=8,  # Match brightness profile constraint
        max_aisle_width=80,
        min_aisle_length=80,
    )

    # Add gradient-detected aisles
    for g_aisle in gradient_aisles:
        aisle_id += 1
        aisles.append(AisleCandidate(
            id=aisle_id,
            centerline=g_aisle.centerline,
            width=g_aisle.width,
            orientation=g_aisle.orientation,
            bounding_box=g_aisle.bounding_box,
            adjacent_clusters=[],
            confidence=g_aisle.confidence,
            detection_method="gradient_edges",
            line_density_left=g_aisle.line_density_left,
            line_density_right=g_aisle.line_density_right,
        ))

    # Method 4: Line-pair detection (edge-density based)
    # Focus on corridors bounded by dark lines on both sides
    line_pair_aisles = detect_aisles_from_line_pairs(
        image,
        min_aisle_width=8,  # Match other methods
        max_aisle_width=80,
        min_aisle_length=100,
        scan_window=30,
    )

    # Add line-pair aisles with renumbered IDs
    for lp_aisle in line_pair_aisles:
        aisle_id += 1
        aisles.append(AisleCandidate(
            id=aisle_id,
            centerline=lp_aisle.centerline,
            width=lp_aisle.width,
            orientation=lp_aisle.orientation,
            bounding_box=lp_aisle.bounding_box,
            adjacent_clusters=[],
            confidence=lp_aisle.confidence,
            detection_method="line_pair",
            line_density_left=lp_aisle.line_density_left,
            line_density_right=lp_aisle.line_density_right,
        ))

    # Method 4: White space analysis for TRAVEL LANES (wider corridors)
    # Travel lanes are typically 50-300px wide, much wider than racking aisles
    whitespace_aisles = detect_aisles_from_whitespace(
        image,
        min_aisle_width=50,   # Travel lanes are wider
        max_aisle_width=300,  # Can be quite wide
        min_aisle_length=300, # Should be substantial length
    )

    # Add whitespace aisles with travel_lane detection method
    for ws_aisle in whitespace_aisles:
        aisle_id += 1
        aisles.append(AisleCandidate(
            id=aisle_id,
            centerline=ws_aisle.centerline,
            width=ws_aisle.width,
            orientation=ws_aisle.orientation,
            bounding_box=ws_aisle.bounding_box,
            adjacent_clusters=[],
            confidence=0.5,
            detection_method="travel_lane",
        ))

    # Method 5: Morphological travel lane detection
    # Uses dilation/erosion to find large connected whitespace regions
    travel_lanes = detect_travel_lanes_morphological(image)
    for tl in travel_lanes:
        aisle_id += 1
        aisles.append(AisleCandidate(
            id=aisle_id,
            centerline=tl.centerline,
            width=tl.width,
            orientation=tl.orientation,
            bounding_box=tl.bounding_box,
            adjacent_clusters=[],
            confidence=tl.confidence,
            detection_method="travel_lane_morph",
        ))

    # Apply two-sided validation to all aisles
    # This filters out false positives that don't have dark content on both sides
    if len(image.shape) == 3:
        gray_for_validation = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray_for_validation = image

    validated_aisles = []
    for aisle in aisles:
        bb = aisle.bounding_box
        if aisle.orientation == "vertical":
            is_valid, left_d, right_d = validate_aisle_two_sided(
                gray_for_validation,
                bb[0], bb[0] + bb[2],  # x_start, x_end
                bb[1], bb[1] + bb[3],  # y_start, y_end
                "vertical"
            )
        else:
            is_valid, left_d, right_d = validate_aisle_two_sided(
                gray_for_validation,
                bb[1], bb[1] + bb[3],  # y_start, y_end (swapped for horizontal)
                bb[0], bb[0] + bb[2],  # x_start, x_end
                "horizontal"
            )

        # Update aisle with validation info
        aisle.two_sided_validated = is_valid
        aisle.line_density_left = max(aisle.line_density_left, left_d)
        aisle.line_density_right = max(aisle.line_density_right, right_d)

        # Boost confidence for validated aisles, reduce for non-validated
        if is_valid:
            aisle.confidence = min(1.0, aisle.confidence + 0.1)
            validated_aisles.append(aisle)
        else:
            # Still include but with reduced confidence if method was high-quality
            if aisle.detection_method in ["brightness_pattern", "line_pair"]:
                aisle.confidence = max(0.3, aisle.confidence - 0.2)
                validated_aisles.append(aisle)
            # Filter out travel_lane_morph and whitespace aisles that fail validation
            # (they're more prone to false positives)

    # Deduplicate aisles - merge those with similar center positions
    # TUNED: Reduced merge distance from 20px to 15px for more distinct aisles
    deduped_aisles = deduplicate_aisles(validated_aisles, merge_distance=15)

    return deduped_aisles


def create_orientation_map(
    image_shape: Tuple[int, int],
    line_clusters: List[LineCluster],
) -> np.ndarray:
    """
    Create a visualization of line orientations.

    Args:
        image_shape: (height, width)
        line_clusters: Detected clusters

    Returns:
        Color image with clusters visualized by orientation
    """
    h, w = image_shape
    vis = np.zeros((h, w, 3), dtype=np.uint8)

    for cluster in line_clusters:
        # Color by orientation
        if cluster.orientation == "horizontal":
            color = (0, 255, 0)  # Green for horizontal
        else:
            color = (255, 0, 0)  # Blue for vertical

        # Draw bounding box
        x, y, cw, ch = cluster.bounding_box
        cv2.rectangle(vis, (x, y), (x + cw, y + ch), color, 2)

        # Draw lines
        for line in cluster.lines:
            cv2.line(vis, line.start, line.end, color, 1)

    return vis


def process_lines(
    image: np.ndarray,
    min_line_length: int = 30,
    distance_threshold: float = 100.0,
) -> LineDetectionResult:
    """
    Main line detection pipeline.

    Args:
        image: BGR image
        min_line_length: Minimum line length to detect
        distance_threshold: Distance for clustering

    Returns:
        LineDetectionResult
    """
    # Detect all lines
    lines = detect_lines(image, min_line_length=min_line_length)

    # Cluster parallel lines
    clusters = cluster_parallel_lines(lines, distance_threshold=distance_threshold)

    # Detect aisles
    aisles = detect_aisles(image, clusters)

    # Create visualization
    orientation_map = create_orientation_map(image.shape[:2], clusters)

    return LineDetectionResult(
        all_lines=lines,
        line_clusters=clusters,
        aisle_candidates=aisles,
        orientation_map=orientation_map,
    )


def line_result_to_dict(result: LineDetectionResult) -> Dict[str, Any]:
    """Convert LineDetectionResult to JSON-serializable dict"""
    return {
        "line_clusters": [
            {
                "id": int(cluster.id),
                "orientation": cluster.orientation,
                "dominant_angle": round(float(cluster.dominant_angle), 2),
                "bounding_box": {
                    "x": int(cluster.bounding_box[0]),
                    "y": int(cluster.bounding_box[1]),
                    "width": int(cluster.bounding_box[2]),
                    "height": int(cluster.bounding_box[3]),
                },
                "line_count": int(cluster.line_count),
                "average_spacing": round(float(cluster.average_spacing), 2),
            }
            for cluster in result.line_clusters
        ],
        "aisle_candidates": [
            {
                "id": int(aisle.id),
                "orientation": aisle.orientation,
                "width": round(float(aisle.width), 2),
                "centerline": [{"x": int(p[0]), "y": int(p[1])} for p in aisle.centerline],
                "bounding_box": {
                    "x": int(aisle.bounding_box[0]),
                    "y": int(aisle.bounding_box[1]),
                    "width": int(aisle.bounding_box[2]),
                    "height": int(aisle.bounding_box[3]),
                },
                "adjacent_cluster_ids": [int(c) for c in aisle.adjacent_clusters],
                "confidence": round(float(aisle.confidence), 3),
                "detection_method": aisle.detection_method,
                "two_sided_validated": aisle.two_sided_validated,
                "line_density": {
                    "left_or_top": round(float(aisle.line_density_left), 3),
                    "right_or_bottom": round(float(aisle.line_density_right), 3),
                },
            }
            for aisle in result.aisle_candidates
        ],
        "stats": {
            "total_lines": len(result.all_lines),
            "total_clusters": len(result.line_clusters),
            "horizontal_clusters": len([c for c in result.line_clusters if c.orientation == "horizontal"]),
            "vertical_clusters": len([c for c in result.line_clusters if c.orientation == "vertical"]),
            "total_aisles": len(result.aisle_candidates),
            "high_confidence_aisles": len([a for a in result.aisle_candidates if a.confidence >= 0.6]),
            "two_sided_validated_aisles": len([a for a in result.aisle_candidates if a.two_sided_validated]),
            "brightness_profile_aisles": len([a for a in result.aisle_candidates if a.detection_method == "brightness_profile"]),
            "gradient_edges_aisles": len([a for a in result.aisle_candidates if a.detection_method == "gradient_edges"]),
            "line_pair_aisles": len([a for a in result.aisle_candidates if a.detection_method == "line_pair"]),
        }
    }
