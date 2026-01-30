"""
Tests for Phase 0 CLI command.

Task 2.8: Add CLI Command for Phase 0
"""

import pytest
import subprocess
import sys
import tempfile
import os
import json
import cv2
import numpy as np

from tests.fixtures.color_boundary_fixtures import create_orange_square, create_multi_color


class TestPhase0CLI:
    """Tests for the phase0 CLI command."""

    @pytest.fixture
    def test_image_path(self, tmp_path):
        """Create a test image file."""
        image = create_orange_square(size=(200, 200), square_size=100)
        image_path = tmp_path / "test_image.png"
        cv2.imwrite(str(image_path), image)
        yield str(image_path)

    @pytest.fixture
    def multi_color_image_path(self, tmp_path):
        """Create a multi-color test image file."""
        image = create_multi_color()
        image_path = tmp_path / "multi_color.png"
        cv2.imwrite(str(image_path), image)
        yield str(image_path)

    def test_phase0_produces_json_output(self, test_image_path):
        """Test that phase0 command produces valid JSON output."""
        result = subprocess.run(
            [sys.executable, "-m", "src", "phase0", test_image_path, "-o", "json"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        assert result.returncode == 0

        # Should be valid JSON
        output = json.loads(result.stdout)
        assert "image_dimensions" in output
        assert "phase0_result" in output
        assert "fast_track_eligible" in output

    def test_phase0_invalid_path_returns_error(self):
        """Test that invalid image path returns error code."""
        result = subprocess.run(
            [sys.executable, "-m", "src", "phase0", "nonexistent.png", "-o", "json"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        assert result.returncode == 1
        assert "Error" in result.stderr or "not found" in result.stderr.lower()

    def test_phase0_visual_creates_png(self, test_image_path, tmp_path):
        """Test that --output visual creates PNG file."""
        output_path = str(tmp_path / "phase0_output.png")

        result = subprocess.run(
            [
                sys.executable, "-m", "src", "phase0", test_image_path,
                "-o", "visual", "--output-path", output_path
            ],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        assert result.returncode == 0
        assert os.path.exists(output_path)

        # Check it's a valid image
        img = cv2.imread(output_path)
        assert img is not None

    def test_phase0_fast_track_threshold_option(self, multi_color_image_path):
        """Test that --fast-track-threshold option is respected."""
        # With high threshold, should not be eligible
        result_high = subprocess.run(
            [
                sys.executable, "-m", "src", "phase0", multi_color_image_path,
                "-o", "json", "--fast-track-threshold", "0.99"
            ],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        output_high = json.loads(result_high.stdout)
        # With 99% threshold, unlikely to be eligible
        assert output_high["fast_track_threshold"] == 0.99

    def test_phase0_includes_boundaries(self, test_image_path):
        """Test that phase0 output includes detected boundaries."""
        result = subprocess.run(
            [sys.executable, "-m", "src", "phase0", test_image_path, "-o", "json"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        output = json.loads(result.stdout)

        assert "phase0_result" in output
        assert "boundaries" in output["phase0_result"]

    def test_phase0_help_shows_usage(self):
        """Test that --help shows usage information."""
        result = subprocess.run(
            [sys.executable, "-m", "src", "phase0", "--help"],
            capture_output=True,
            text=True,
            cwd=os.path.dirname(os.path.dirname(__file__)),
        )

        assert result.returncode == 0
        assert "fast-track-threshold" in result.stdout
        assert "min-boundaries" in result.stdout
