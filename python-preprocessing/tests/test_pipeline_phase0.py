"""
Tests for Phase 0 integration in the preprocessing pipeline.

Task 2.5: Integrate Phase 0 into Pipeline Start
Task 2.6: Implement Fast-Track Pipeline Branch
Task 2.7: Update Gemini Hints with Color Boundaries
"""

import pytest
import numpy as np
import cv2

from src.pipeline import (
    PreprocessingConfig,
    PreprocessingResult,
    preprocess_floorplan,
    result_to_json,
)
from src.config.phase0_config import Phase0Config
from tests.fixtures.color_boundary_fixtures import (
    create_orange_square,
    create_multi_color,
    create_no_boundaries,
)


def create_high_coverage_image() -> np.ndarray:
    """Create an image with high color boundary coverage (>80%)."""
    # Create a 300x300 white image
    image = np.ones((300, 300, 3), dtype=np.uint8) * 255

    # Fill most of the image with colored regions
    # Orange region (top half)
    orange_hsv = np.zeros((140, 290, 3), dtype=np.uint8)
    orange_hsv[:, :] = (15, 255, 255)  # Orange
    orange_bgr = cv2.cvtColor(orange_hsv, cv2.COLOR_HSV2BGR)
    image[5:145, 5:295] = orange_bgr

    # Yellow region (bottom-left)
    yellow_hsv = np.zeros((140, 140, 3), dtype=np.uint8)
    yellow_hsv[:, :] = (30, 255, 255)  # Yellow
    yellow_bgr = cv2.cvtColor(yellow_hsv, cv2.COLOR_HSV2BGR)
    image[155:295, 5:145] = yellow_bgr

    # Blue region (bottom-right)
    blue_hsv = np.zeros((140, 140, 3), dtype=np.uint8)
    blue_hsv[:, :] = (110, 255, 255)  # Blue
    blue_bgr = cv2.cvtColor(blue_hsv, cv2.COLOR_HSV2BGR)
    image[155:295, 155:295] = blue_bgr

    return image


class TestPipelinePhase0Integration:
    """Tests for Phase 0 integration into the pipeline."""

    def test_pipeline_detects_orange_boundaries(self):
        """Test that pipeline with Phase 0 enabled detects orange boundaries."""
        image = create_orange_square()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        assert result.phase0_result is not None
        assert len(result.phase0_result.boundaries) > 0
        assert any(b.color == "orange" for b in result.phase0_result.boundaries)

    def test_pipeline_with_phase0_disabled_skips_detection(self):
        """Test that pipeline with Phase 0 disabled skips color detection."""
        image = create_orange_square()
        config = PreprocessingConfig(phase0_config=Phase0Config.disabled())

        result = preprocess_floorplan(image, config)

        assert result.phase0_result is None
        assert result.fast_track is False

    def test_pipeline_no_boundaries_runs_full_pipeline(self):
        """Test that image with no colored boundaries runs full pipeline."""
        image = create_no_boundaries()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        assert result.fast_track is False
        # Should have run full pipeline
        assert result.edge_data is not None or result.edge_data == {}

    def test_pipeline_result_includes_phase0(self):
        """Test that PreprocessingResult includes Phase 0 data."""
        image = create_multi_color()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        assert hasattr(result, "phase0_result")
        assert hasattr(result, "fast_track")


class TestPipelineFastTrack:
    """Tests for fast-track pipeline branch."""

    def test_high_coverage_triggers_fast_track(self):
        """Test that high coverage image triggers fast-track mode."""
        image = create_high_coverage_image()
        config = PreprocessingConfig(
            phase0_config=Phase0Config(
                fast_track_threshold=0.7,  # Lower threshold for test
                min_boundaries_for_fast_track=3,
            )
        )

        result = preprocess_floorplan(image, config)

        assert result.fast_track is True

    def test_fast_track_skips_edge_detection(self):
        """Test that fast-track mode skips edge detection stages."""
        image = create_high_coverage_image()
        config = PreprocessingConfig(
            phase0_config=Phase0Config(
                fast_track_threshold=0.7,
                min_boundaries_for_fast_track=3,
            )
        )

        result = preprocess_floorplan(image, config)

        if result.fast_track:
            # Edge data should be empty when fast-tracking
            assert result.edge_data == {}
            assert result.segmentation_data == {}
            assert result.line_data == {}

    def test_low_coverage_runs_full_pipeline(self):
        """Test that low coverage image runs full pipeline."""
        image = create_orange_square(size=(500, 500), square_size=50)  # Small square
        config = PreprocessingConfig(
            phase0_config=Phase0Config(
                fast_track_threshold=0.8,
                min_boundaries_for_fast_track=3,
            )
        )

        result = preprocess_floorplan(image, config)

        # Should not fast-track due to low coverage
        assert result.fast_track is False

    def test_fast_track_result_has_correct_structure(self):
        """Test that fast-track result has expected structure."""
        image = create_high_coverage_image()
        config = PreprocessingConfig(
            phase0_config=Phase0Config(
                fast_track_threshold=0.7,
                min_boundaries_for_fast_track=3,
            )
        )

        result = preprocess_floorplan(image, config)

        if result.fast_track:
            # Should still have gemini_hints
            assert "fast_track" in result.gemini_hints
            assert result.gemini_hints["fast_track"] is True
            assert "detected_colored_boundaries" in result.gemini_hints


class TestGeminiHintsColorBoundaries:
    """Tests for color boundaries in Gemini hints."""

    def test_hints_include_color_boundaries_when_present(self):
        """Test that hints include color boundaries when detected."""
        image = create_orange_square()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        if not result.fast_track and result.phase0_result:
            if len(result.phase0_result.boundaries) > 0:
                assert "detected_colored_boundaries" in result.gemini_hints

    def test_hints_structure_matches_spec(self):
        """Test that hints structure matches expected schema."""
        image = create_multi_color()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        hints = result.gemini_hints

        # Check for required fields
        assert "image_dimensions" in hints or "detected_colored_boundaries" in hints

        # If boundaries present, check structure
        if "detected_colored_boundaries" in hints:
            for boundary in hints["detected_colored_boundaries"]:
                assert "polygon" in boundary
                assert "color" in boundary
                assert "area" in boundary
                assert "confidence" in boundary

    def test_empty_color_result_no_boundaries_section(self):
        """Test that empty color result produces no boundaries section."""
        image = create_no_boundaries()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)

        # When no boundaries detected, the section may be absent or empty
        if "detected_colored_boundaries" in result.gemini_hints:
            assert len(result.gemini_hints["detected_colored_boundaries"]) == 0


class TestResultToJsonWithPhase0:
    """Tests for JSON serialization with Phase 0 data."""

    def test_json_includes_fast_track_flag(self):
        """Test that JSON output includes fast_track flag."""
        image = create_orange_square()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)
        json_output = result_to_json(result)

        assert "fast_track" in json_output
        assert isinstance(json_output["fast_track"], bool)

    def test_json_includes_phase0_data(self):
        """Test that JSON output includes Phase 0 data when present."""
        image = create_orange_square()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)
        json_output = result_to_json(result)

        if result.phase0_result:
            assert "phase0" in json_output

    def test_json_serializable(self):
        """Test that result can be fully serialized to JSON."""
        import json

        image = create_multi_color()
        config = PreprocessingConfig()

        result = preprocess_floorplan(image, config)
        json_output = result_to_json(result)

        # Should not raise exception
        json_str = json.dumps(json_output)
        assert len(json_str) > 0
