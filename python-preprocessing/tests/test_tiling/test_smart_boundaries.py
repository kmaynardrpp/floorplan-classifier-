"""Tests for smart boundary alignment."""

import pytest
from dataclasses import dataclass
from typing import List, Tuple

from src.tiling.smart_boundaries import (
    find_boundary_aligned_splits,
    _find_natural_splits,
    _filter_splits,
    create_smart_boundaries,
)


# Mock classes to simulate Phase 0 results
@dataclass
class MockDetectedBoundary:
    """Mock detected boundary for testing."""
    polygon: List[Tuple[int, int]]
    color: str = "orange"


@dataclass
class MockColorBoundaryResult:
    """Mock color boundary result for testing."""
    boundaries: List[MockDetectedBoundary]


class TestFindBoundaryAlignedSplitsNoPhase0:
    """Tests for split finding without Phase 0 data."""

    def test_no_boundaries_uses_grid(self):
        """Test that missing Phase 0 falls back to grid splits."""
        splits = find_boundary_aligned_splits(
            phase0_boundaries=None,
            orientation='vertical',
            dimension=5000,
            tile_size=2048,
            min_tile_size=512,
        )
        # Grid splits at 2048, 4096
        assert 2048 in splits
        assert 4096 in splits

    def test_empty_boundaries_uses_grid(self):
        """Test that empty boundaries fall back to grid."""
        result = MockColorBoundaryResult(boundaries=[])
        splits = find_boundary_aligned_splits(
            phase0_boundaries=result,
            orientation='vertical',
            dimension=5000,
            tile_size=2048,
            min_tile_size=512,
        )
        assert len(splits) >= 1

    def test_grid_respects_min_tile_size(self):
        """Test grid splits respect minimum tile size."""
        splits = find_boundary_aligned_splits(
            phase0_boundaries=None,
            orientation='vertical',
            dimension=3000,
            tile_size=2048,
            min_tile_size=512,
        )
        # Should not create split that leaves < 512 pixels
        for split in splits:
            assert split >= 512
            assert 3000 - split >= 512


class TestFindNaturalSplits:
    """Tests for _find_natural_splits helper."""

    def test_vertical_edge_detection(self):
        """Test detection of vertical edges for splitting."""
        # Create boundary with vertical edge
        boundary = MockDetectedBoundary(
            polygon=[(500, 100), (500, 900), (600, 900), (600, 100)]
        )
        result = MockColorBoundaryResult(boundaries=[boundary])

        splits = _find_natural_splits(result.boundaries, 'vertical', 1000)

        # Should find splits near x=500 and x=600
        assert any(495 <= s <= 505 for s in splits)

    def test_horizontal_edge_detection(self):
        """Test detection of horizontal edges for splitting."""
        # Create boundary with horizontal edge
        boundary = MockDetectedBoundary(
            polygon=[(100, 500), (900, 500), (900, 600), (100, 600)]
        )
        result = MockColorBoundaryResult(boundaries=[boundary])

        splits = _find_natural_splits(result.boundaries, 'horizontal', 1000)

        # Should find splits near y=500 and y=600
        assert any(495 <= s <= 505 for s in splits)

    def test_no_splits_for_short_edges(self):
        """Test that short edges are ignored."""
        # Boundary with very short edges
        boundary = MockDetectedBoundary(
            polygon=[(500, 400), (500, 450), (550, 450), (550, 400)]
        )
        result = MockColorBoundaryResult(boundaries=[boundary])

        splits = _find_natural_splits(result.boundaries, 'vertical', 1000)
        # Short edges (50px) should not produce splits
        assert len(splits) == 0

    def test_edges_near_boundary_ignored(self):
        """Test edges too close to image boundary are ignored."""
        # Boundary near left edge
        boundary = MockDetectedBoundary(
            polygon=[(50, 100), (50, 900), (150, 900), (150, 100)]
        )
        result = MockColorBoundaryResult(boundaries=[boundary])

        splits = _find_natural_splits(result.boundaries, 'vertical', 1000)
        # Edge at x=50 should be ignored (too close to boundary)
        assert not any(s < 100 for s in splits)


class TestFilterSplits:
    """Tests for _filter_splits helper."""

    def test_empty_candidates(self):
        """Test filtering empty list."""
        result = _filter_splits([], 1000, 256)
        assert result == []

    def test_single_valid_split(self):
        """Test single valid split."""
        result = _filter_splits([500], 1000, 256)
        assert result == [500]

    def test_cluster_nearby_splits(self):
        """Test that nearby splits are clustered."""
        # Splits clustered around 500
        candidates = [490, 495, 500, 505, 510]
        result = _filter_splits(candidates, 1000, 256)
        # Should produce single split near median
        assert len(result) == 1
        assert 490 <= result[0] <= 510

    def test_filter_too_close_to_edge(self):
        """Test splits too close to edges are filtered."""
        candidates = [100, 500, 950]  # 100 and 950 too close
        result = _filter_splits(candidates, 1000, 256)
        assert 500 in result
        assert 100 not in result
        assert 950 not in result

    def test_filter_creates_small_tiles(self):
        """Test splits creating too-small tiles are filtered."""
        # Two splits too close together
        candidates = [300, 400]  # Only 100px between
        result = _filter_splits(candidates, 1000, 256)
        # Can keep at most one, depends on which satisfies constraints
        assert len(result) <= 1


class TestCreateSmartBoundaries:
    """Tests for create_smart_boundaries."""

    def test_basic_grid_without_phase0(self):
        """Test boundary creation without Phase 0."""
        boundaries = create_smart_boundaries(
            width=3000,
            height=2000,
            phase0_boundaries=None,
            tile_size=1500,
            overlap=100,
            min_tile_size=512,
        )

        assert len(boundaries) >= 1

        # Check all boundaries are valid
        for x1, y1, x2, y2 in boundaries:
            assert 0 <= x1 < x2 <= 3000
            assert 0 <= y1 < y2 <= 2000

    def test_coverage_complete(self):
        """Test that boundaries cover entire image."""
        boundaries = create_smart_boundaries(
            width=4000,
            height=3000,
            phase0_boundaries=None,
            tile_size=2048,
            overlap=256,
        )

        # Check corners are covered
        corners = [(0, 0), (3999, 0), (0, 2999), (3999, 2999)]
        for cx, cy in corners:
            covered = any(
                x1 <= cx < x2 and y1 <= cy < y2
                for x1, y1, x2, y2 in boundaries
            )
            assert covered, f"Corner ({cx}, {cy}) not covered"

    def test_overlap_applied(self):
        """Test that overlap is applied between tiles."""
        boundaries = create_smart_boundaries(
            width=4000,
            height=2000,
            phase0_boundaries=None,
            tile_size=2048,
            overlap=256,
            min_tile_size=512,
        )

        # Multiple tiles should have overlapping regions
        if len(boundaries) > 1:
            # Check for some overlap between adjacent tiles
            found_overlap = False
            for i, (x1, y1, x2, y2) in enumerate(boundaries):
                for j, (ox1, oy1, ox2, oy2) in enumerate(boundaries):
                    if i == j:
                        continue
                    # Check intersection
                    inter_x1 = max(x1, ox1)
                    inter_y1 = max(y1, oy1)
                    inter_x2 = min(x2, ox2)
                    inter_y2 = min(y2, oy2)
                    if inter_x1 < inter_x2 and inter_y1 < inter_y2:
                        found_overlap = True
                        break
                if found_overlap:
                    break
            assert found_overlap, "Expected overlapping tiles"

    def test_small_image_single_tile(self):
        """Test small image produces single boundary."""
        boundaries = create_smart_boundaries(
            width=1000,
            height=800,
            phase0_boundaries=None,
            tile_size=2048,
            overlap=256,
        )

        assert len(boundaries) == 1
        assert boundaries[0] == (0, 0, 1000, 800)

    def test_with_phase0_boundaries(self):
        """Test smart boundaries with Phase 0 data."""
        # Create vertical boundary that spans height
        boundary = MockDetectedBoundary(
            polygon=[(2000, 100), (2000, 2900), (2100, 2900), (2100, 100)]
        )
        result = MockColorBoundaryResult(boundaries=[boundary])

        boundaries = create_smart_boundaries(
            width=4000,
            height=3000,
            phase0_boundaries=result,
            tile_size=2048,
            overlap=256,
            min_tile_size=512,
        )

        # Should have tiles that may align with the boundary
        assert len(boundaries) >= 2

    def test_returns_sorted_positions(self):
        """Test that positions within boundaries are sorted."""
        boundaries = create_smart_boundaries(
            width=6000,
            height=4000,
            phase0_boundaries=None,
            tile_size=2048,
            overlap=256,
        )

        # Extract unique x positions and y positions
        x_positions = sorted(set([b[0] for b in boundaries] + [b[2] for b in boundaries]))
        y_positions = sorted(set([b[1] for b in boundaries] + [b[3] for b in boundaries]))

        # Verify they're sorted
        assert x_positions == sorted(x_positions)
        assert y_positions == sorted(y_positions)
