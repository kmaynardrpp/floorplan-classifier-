"""
Image rotation correction utilities.

Task 5.3: Implement Rotation Correction for Tiles
"""

from typing import Tuple, List, Optional
import numpy as np
import cv2

from .models import Orientation, OrientationResult


def rotate_image(
    image: np.ndarray,
    degrees: int,
    expand: bool = True,
) -> np.ndarray:
    """
    Rotate image by specified degrees.

    Args:
        image: Input image (BGR or grayscale)
        degrees: Rotation angle (0, 90, 180, 270)
        expand: Whether to expand canvas to fit rotated image

    Returns:
        Rotated image

    Example:
        >>> rotated = rotate_image(image, 90)
    """
    if degrees == 0:
        return image.copy()

    # Normalize to 0-360
    degrees = degrees % 360

    height, width = image.shape[:2]

    # Use optimized rotation for 90-degree increments
    if degrees == 90:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    elif degrees == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    elif degrees == 270:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    else:
        # General rotation
        center = (width // 2, height // 2)
        rotation_matrix = cv2.getRotationMatrix2D(center, -degrees, 1.0)

        if expand:
            # Calculate new dimensions
            cos = abs(rotation_matrix[0, 0])
            sin = abs(rotation_matrix[0, 1])
            new_width = int(height * sin + width * cos)
            new_height = int(height * cos + width * sin)

            # Adjust rotation matrix for translation
            rotation_matrix[0, 2] += (new_width - width) / 2
            rotation_matrix[1, 2] += (new_height - height) / 2

            return cv2.warpAffine(image, rotation_matrix, (new_width, new_height))
        else:
            return cv2.warpAffine(image, rotation_matrix, (width, height))


def correct_orientation(
    image: np.ndarray,
    result: OrientationResult,
) -> np.ndarray:
    """
    Apply orientation correction to image.

    Args:
        image: Input image
        result: Orientation detection result

    Returns:
        Corrected image (rotated to NORTH orientation)
    """
    if not result.needs_correction:
        return image.copy()

    return rotate_image(image, result.correction_degrees)


def rotate_point(
    point: Tuple[int, int],
    degrees: int,
    image_size: Tuple[int, int],
) -> Tuple[int, int]:
    """
    Rotate a point by specified degrees around image center.

    Args:
        point: (x, y) coordinate
        degrees: Rotation angle (0, 90, 180, 270)
        image_size: (width, height) of image

    Returns:
        Rotated (x, y) coordinate
    """
    x, y = point
    width, height = image_size
    degrees = degrees % 360

    if degrees == 0:
        return (x, y)
    elif degrees == 90:
        return (height - 1 - y, x)
    elif degrees == 180:
        return (width - 1 - x, height - 1 - y)
    elif degrees == 270:
        return (y, width - 1 - x)
    else:
        # General rotation
        cx, cy = width / 2, height / 2
        radians = np.deg2rad(-degrees)
        cos_a = np.cos(radians)
        sin_a = np.sin(radians)

        nx = cos_a * (x - cx) - sin_a * (y - cy) + cx
        ny = sin_a * (x - cx) + cos_a * (y - cy) + cy

        return (int(round(nx)), int(round(ny)))


def rotate_polygon(
    polygon: List[Tuple[int, int]],
    degrees: int,
    image_size: Tuple[int, int],
) -> List[Tuple[int, int]]:
    """
    Rotate polygon vertices by specified degrees.

    Args:
        polygon: List of (x, y) vertices
        degrees: Rotation angle
        image_size: (width, height) of image

    Returns:
        Rotated polygon vertices
    """
    return [rotate_point(pt, degrees, image_size) for pt in polygon]


def get_rotated_dimensions(
    width: int,
    height: int,
    degrees: int,
) -> Tuple[int, int]:
    """
    Calculate new dimensions after rotation.

    Args:
        width: Original width
        height: Original height
        degrees: Rotation angle (0, 90, 180, 270)

    Returns:
        (new_width, new_height)
    """
    degrees = degrees % 360

    if degrees == 0 or degrees == 180:
        return (width, height)
    elif degrees == 90 or degrees == 270:
        return (height, width)
    else:
        # General rotation
        radians = np.deg2rad(abs(degrees))
        cos_a = abs(np.cos(radians))
        sin_a = abs(np.sin(radians))
        new_width = int(height * sin_a + width * cos_a)
        new_height = int(height * cos_a + width * sin_a)
        return (new_width, new_height)


def transform_coordinates_after_rotation(
    point: Tuple[int, int],
    original_size: Tuple[int, int],
    degrees: int,
) -> Tuple[int, int]:
    """
    Transform coordinates from rotated image back to original image space.

    Args:
        point: (x, y) in rotated image coordinates
        original_size: (width, height) of original image
        degrees: Rotation that was applied

    Returns:
        (x, y) in original image coordinates
    """
    # Inverse rotation
    inverse_degrees = (360 - degrees) % 360
    rotated_size = get_rotated_dimensions(original_size[0], original_size[1], degrees)
    return rotate_point(point, inverse_degrees, rotated_size)
