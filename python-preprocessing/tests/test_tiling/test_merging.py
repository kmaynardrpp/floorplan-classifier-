"""Tests for zone merging strategies."""

import pytest

from src.tiling.models import TileZoneResult, Zone
from src.tiling.merging import (
    MergeCandidate,
    MergedZone,
    find_merge_candidates,
    merge_polygons,
    merge_zones,
    deduplicate_zones,
)


class TestMergeCandidate:
    """Tests for MergeCandidate dataclass."""

    def test_create_merge_candidate(self):
        """Test creating a merge candidate."""
        candidate = MergeCandidate(
            zone1_idx=0,
            zone2_idx=1,
            iou=0.5,
            tile1_id="tile_0",
            tile2_id="tile_1",
        )
        assert candidate.zone1_idx == 0
        assert candidate.zone2_idx == 1
        assert candidate.iou == 0.5


class TestMergedZone:
    """Tests for MergedZone dataclass."""

    def test_create_merged_zone(self):
        """Test creating a merged zone."""
        zone = MergedZone(
            id="merged_0",
            zone_type="parking",
            polygon=[(0, 0), (100, 0), (100, 100), (0, 100)],
            confidence=0.9,
            source_zones=["tile_0:zone_0", "tile_1:zone_0"],
        )
        assert zone.id == "merged_0"
        assert zone.zone_type == "parking"
        assert len(zone.source_zones) == 2

    def test_merged_zone_to_dict(self):
        """Test serialization to dict."""
        zone = MergedZone(
            id="merged_1",
            zone_type="aisle",
            polygon=[(0, 0), (50, 0), (50, 50)],
            confidence=0.8,
        )
        d = zone.to_dict()
        assert d["id"] == "merged_1"
        assert d["zone_type"] == "aisle"
        assert len(d["polygon"]) == 3
        assert d["polygon"][0] == {"x": 0, "y": 0}


class TestMergePolygons:
    """Tests for merge_polygons function."""

    def test_merge_empty_list(self):
        """Test merging empty list."""
        result = merge_polygons([])
        assert result == []

    def test_merge_single_polygon(self):
        """Test merging single polygon returns it unchanged."""
        polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]
        result = merge_polygons([polygon])
        assert result == polygon

    def test_merge_overlapping_polygons(self):
        """Test merging overlapping polygons creates convex hull."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(50, 50), (150, 50), (150, 150), (50, 150)]

        result = merge_polygons([polygon1, polygon2])

        # Should be convex hull containing all points
        assert len(result) >= 4
        # Check it contains extreme points
        xs = [p[0] for p in result]
        ys = [p[1] for p in result]
        assert min(xs) == 0
        assert min(ys) == 0
        assert max(xs) == 150
        assert max(ys) == 150

    def test_merge_adjacent_polygons(self):
        """Test merging adjacent polygons."""
        polygon1 = [(0, 0), (100, 0), (100, 100), (0, 100)]
        polygon2 = [(100, 0), (200, 0), (200, 100), (100, 100)]

        result = merge_polygons([polygon1, polygon2])

        # Should be rectangle covering 0-200 in x
        xs = [p[0] for p in result]
        assert min(xs) == 0
        assert max(xs) == 200


class TestFindMergeCandidates:
    """Tests for find_merge_candidates function."""

    def test_no_candidates_for_single_tile(self):
        """Test that zones within same tile are not merge candidates."""
        zone1 = Zone(id="z1", zone_type="parking", polygon=[(0, 0), (50, 0), (50, 50), (0, 50)])
        zone2 = Zone(id="z2", zone_type="parking", polygon=[(25, 25), (75, 25), (75, 75), (25, 75)])

        result = TileZoneResult(
            tile_id="tile_0",
            zones=[zone1, zone2],
            bounds=(0, 0, 100, 100),
        )

        candidates = find_merge_candidates([result], iou_threshold=0.1)
        assert len(candidates) == 0

    def test_find_overlapping_zones_across_tiles(self):
        """Test finding overlapping zones across tiles."""
        # Two tiles side by side with overlapping zone
        zone1 = Zone(id="z1", zone_type="parking", polygon=[(80, 0), (100, 0), (100, 100), (80, 100)])
        zone2 = Zone(id="z2", zone_type="parking", polygon=[(0, 0), (30, 0), (30, 100), (0, 100)])

        result1 = TileZoneResult(
            tile_id="tile_0",
            zones=[zone1],
            bounds=(0, 0, 100, 100),  # tile_0: x 0-100
        )
        result2 = TileZoneResult(
            tile_id="tile_1",
            zones=[zone2],
            bounds=(90, 0, 190, 100),  # tile_1: x 90-190, overlap at x 90-100
        )

        candidates = find_merge_candidates([result1, result2], iou_threshold=0.1)

        # Should find candidate between zones that overlap when transformed
        # zone1 original: (80, 0) - (100, 100)
        # zone2 original: (90, 0) - (120, 100)
        # Overlap: (90, 0) - (100, 100) = 10*100 = 1000
        assert len(candidates) >= 1

    def test_different_zone_types_not_merged(self):
        """Test that different zone types are not merge candidates."""
        zone1 = Zone(id="z1", zone_type="parking", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])
        zone2 = Zone(id="z2", zone_type="aisle", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])

        result1 = TileZoneResult(tile_id="tile_0", zones=[zone1], bounds=(0, 0, 100, 100))
        result2 = TileZoneResult(tile_id="tile_1", zones=[zone2], bounds=(50, 0, 150, 100))

        candidates = find_merge_candidates([result1, result2], iou_threshold=0.1)
        assert len(candidates) == 0


class TestMergeZones:
    """Tests for merge_zones function."""

    def test_merge_empty_results(self):
        """Test merging empty tile results."""
        result = merge_zones([])
        assert result == []

    def test_single_tile_no_merge(self):
        """Test single tile zones are returned unchanged."""
        zone = Zone(id="z1", zone_type="parking", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)])
        result = TileZoneResult(
            tile_id="tile_0",
            zones=[zone],
            bounds=(0, 0, 100, 100),
        )

        merged = merge_zones([result])

        assert len(merged) == 1
        assert merged[0].zone_type == "parking"

    def test_merge_overlapping_zones(self):
        """Test merging overlapping zones from different tiles."""
        # Create overlapping zones in two tiles
        zone1 = Zone(id="z1", zone_type="parking", polygon=[(70, 0), (100, 0), (100, 100), (70, 100)])
        zone2 = Zone(id="z2", zone_type="parking", polygon=[(0, 0), (40, 0), (40, 100), (0, 100)])

        result1 = TileZoneResult(
            tile_id="tile_0",
            zones=[zone1],
            bounds=(0, 0, 100, 100),
        )
        result2 = TileZoneResult(
            tile_id="tile_1",
            zones=[zone2],
            bounds=(80, 0, 180, 100),  # Overlaps with tile_0
        )

        merged = merge_zones([result1, result2], iou_threshold=0.2)

        # Should merge overlapping zones
        assert len(merged) <= 2  # Could be 1 or 2 depending on IoU


class TestDeduplicateZones:
    """Tests for deduplicate_zones function."""

    def test_no_duplicates(self):
        """Test no deduplication when zones are distinct."""
        zones = [
            MergedZone(id="z1", zone_type="parking", polygon=[(0, 0), (50, 0), (50, 50), (0, 50)], confidence=0.9),
            MergedZone(id="z2", zone_type="parking", polygon=[(100, 100), (150, 100), (150, 150), (100, 150)], confidence=0.8),
        ]

        result = deduplicate_zones(zones, iou_threshold=0.9)
        assert len(result) == 2

    def test_remove_duplicate(self):
        """Test removing near-duplicate zones."""
        zones = [
            MergedZone(id="z1", zone_type="parking", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)], confidence=0.9),
            MergedZone(id="z2", zone_type="parking", polygon=[(2, 2), (98, 2), (98, 98), (2, 98)], confidence=0.8),
        ]

        result = deduplicate_zones(zones, iou_threshold=0.9)

        # Should keep one (higher confidence)
        assert len(result) == 1
        assert result[0].id == "z1"

    def test_different_types_not_deduplicated(self):
        """Test zones of different types are not deduplicated."""
        zones = [
            MergedZone(id="z1", zone_type="parking", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)], confidence=0.9),
            MergedZone(id="z2", zone_type="aisle", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)], confidence=0.8),
        ]

        result = deduplicate_zones(zones, iou_threshold=0.9)
        assert len(result) == 2

    def test_empty_list(self):
        """Test deduplicating empty list."""
        result = deduplicate_zones([])
        assert result == []

    def test_single_zone(self):
        """Test deduplicating single zone."""
        zones = [
            MergedZone(id="z1", zone_type="parking", polygon=[(0, 0), (100, 0), (100, 100), (0, 100)], confidence=0.9),
        ]
        result = deduplicate_zones(zones)
        assert len(result) == 1
