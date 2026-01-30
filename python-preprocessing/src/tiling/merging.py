"""
Zone merging strategies for combining tile results.

Task 4.2: Implement Zone Merging Strategy
"""

from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass, field
import numpy as np

from .iou import calculate_iou, polygon_bounding_box, calculate_iou_fast
from .models import TileZoneResult, Zone
from .transforms import tile_to_original, transform_polygon


@dataclass
class MergeCandidate:
    """A pair of zones that are candidates for merging."""
    zone1_idx: int
    zone2_idx: int
    iou: float
    tile1_id: str
    tile2_id: str


@dataclass
class MergedZone:
    """Result of merging one or more zones."""
    id: str
    zone_type: str
    polygon: List[Tuple[int, int]]
    confidence: float
    source_zones: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "zone_type": self.zone_type,
            "polygon": [{"x": x, "y": y} for x, y in self.polygon],
            "confidence": self.confidence,
            "source_zones": self.source_zones,
            "metadata": self.metadata,
        }


def find_merge_candidates(
    tile_results: List[TileZoneResult],
    iou_threshold: float = 0.3,
) -> List[MergeCandidate]:
    """
    Find zone pairs across tiles that should be merged.

    Args:
        tile_results: List of per-tile zone detection results
        iou_threshold: Minimum IoU to consider zones for merging

    Returns:
        List of MergeCandidate objects
    """
    candidates = []

    # Convert all zones to original coordinates
    all_zones = []
    for result in tile_results:
        for zone in result.zones:
            original_polygon = transform_polygon(zone.polygon, result.bounds)
            all_zones.append({
                "zone": zone,
                "tile_id": result.tile_id,
                "original_polygon": original_polygon,
                "bbox": polygon_bounding_box(original_polygon),
            })

    # Compare zones from different tiles
    for i in range(len(all_zones)):
        for j in range(i + 1, len(all_zones)):
            zone_i = all_zones[i]
            zone_j = all_zones[j]

            # Only merge zones from different tiles
            if zone_i["tile_id"] == zone_j["tile_id"]:
                continue

            # Only merge zones of the same type
            if zone_i["zone"].zone_type != zone_j["zone"].zone_type:
                continue

            # Quick bounding box check
            bbox_iou = calculate_iou_fast(zone_i["bbox"], zone_j["bbox"])
            if bbox_iou < iou_threshold * 0.5:  # Looser threshold for bbox
                continue

            # Precise IoU calculation
            iou = calculate_iou(
                zone_i["original_polygon"],
                zone_j["original_polygon"],
            )

            if iou >= iou_threshold:
                candidates.append(MergeCandidate(
                    zone1_idx=i,
                    zone2_idx=j,
                    iou=iou,
                    tile1_id=zone_i["tile_id"],
                    tile2_id=zone_j["tile_id"],
                ))

    return candidates


def merge_polygons(
    polygons: List[List[Tuple[int, int]]],
) -> List[Tuple[int, int]]:
    """
    Merge multiple polygons into a single polygon.

    Uses convex hull for simple merging.

    Args:
        polygons: List of polygon vertex lists

    Returns:
        Merged polygon vertices
    """
    import cv2

    if not polygons:
        return []

    if len(polygons) == 1:
        return polygons[0]

    # Collect all points
    all_points = []
    for poly in polygons:
        all_points.extend(poly)

    if len(all_points) < 3:
        return all_points

    # Compute convex hull
    points_array = np.array(all_points, dtype=np.float32)
    hull = cv2.convexHull(points_array)

    # Convert back to list of tuples
    return [(int(pt[0][0]), int(pt[0][1])) for pt in hull]


def merge_zones(
    tile_results: List[TileZoneResult],
    iou_threshold: float = 0.3,
) -> List[MergedZone]:
    """
    Merge overlapping zones from multiple tiles.

    Args:
        tile_results: List of per-tile zone detection results
        iou_threshold: Minimum IoU to merge zones

    Returns:
        List of merged zones in original image coordinates
    """
    if not tile_results:
        return []

    # Convert all zones to original coordinates
    all_zones = []
    for result in tile_results:
        for zone in result.zones:
            original_polygon = transform_polygon(zone.polygon, result.bounds)
            all_zones.append({
                "zone": zone,
                "tile_id": result.tile_id,
                "original_polygon": original_polygon,
                "merged": False,
            })

    # Find merge candidates
    candidates = find_merge_candidates(tile_results, iou_threshold)

    # Sort by IoU (highest first) for greedy merging
    candidates.sort(key=lambda c: c.iou, reverse=True)

    # Union-Find for grouping zones
    parent = list(range(len(all_zones)))

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # Group zones based on merge candidates
    for candidate in candidates:
        union(candidate.zone1_idx, candidate.zone2_idx)

    # Collect groups
    groups: Dict[int, List[int]] = {}
    for i in range(len(all_zones)):
        root = find(i)
        if root not in groups:
            groups[root] = []
        groups[root].append(i)

    # Create merged zones
    merged_zones = []
    zone_id_counter = 0

    for group_indices in groups.values():
        group_zones = [all_zones[i] for i in group_indices]

        if len(group_zones) == 1:
            # Single zone, no merging needed
            z = group_zones[0]
            merged_zones.append(MergedZone(
                id=f"merged_{zone_id_counter}",
                zone_type=z["zone"].zone_type,
                polygon=z["original_polygon"],
                confidence=z["zone"].confidence,
                source_zones=[f"{z['tile_id']}:{z['zone'].id}"],
                metadata=z["zone"].metadata.copy(),
            ))
        else:
            # Merge multiple zones
            polygons = [z["original_polygon"] for z in group_zones]
            merged_poly = merge_polygons(polygons)

            # Average confidence
            avg_confidence = sum(z["zone"].confidence for z in group_zones) / len(group_zones)

            # Use zone type from first zone (all should be same)
            zone_type = group_zones[0]["zone"].zone_type

            # Collect source zone IDs
            source_ids = [f"{z['tile_id']}:{z['zone'].id}" for z in group_zones]

            merged_zones.append(MergedZone(
                id=f"merged_{zone_id_counter}",
                zone_type=zone_type,
                polygon=merged_poly,
                confidence=avg_confidence,
                source_zones=source_ids,
                metadata={"merged_from_count": len(group_zones)},
            ))

        zone_id_counter += 1

    return merged_zones


def deduplicate_zones(
    zones: List[MergedZone],
    iou_threshold: float = 0.9,
) -> List[MergedZone]:
    """
    Remove duplicate zones with very high overlap.

    Args:
        zones: List of merged zones
        iou_threshold: IoU threshold for considering duplicates

    Returns:
        Deduplicated list of zones
    """
    if len(zones) <= 1:
        return zones

    keep = [True] * len(zones)

    for i in range(len(zones)):
        if not keep[i]:
            continue

        for j in range(i + 1, len(zones)):
            if not keep[j]:
                continue

            # Only deduplicate same type
            if zones[i].zone_type != zones[j].zone_type:
                continue

            iou = calculate_iou(zones[i].polygon, zones[j].polygon)
            if iou >= iou_threshold:
                # Keep the one with higher confidence
                if zones[i].confidence >= zones[j].confidence:
                    keep[j] = False
                else:
                    keep[i] = False
                    break

    return [z for z, k in zip(zones, keep) if k]
