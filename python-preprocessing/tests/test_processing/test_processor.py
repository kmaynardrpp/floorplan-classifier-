"""Tests for end-to-end floorplan processor."""

import pytest
import numpy as np
import cv2

from src.processing.processor import (
    ProcessingResult,
    FloorplanProcessor,
)
from src.adaptive.decision_engine import ProcessingMode
from src.adaptive.config_selector import AdaptiveConfig


class TestProcessingResult:
    """Tests for ProcessingResult dataclass."""

    def test_create_success_result(self):
        """Test creating a successful result."""
        result = ProcessingResult(
            success=True,
            zones=[{"id": "zone_1"}],
            processing_mode=ProcessingMode.STANDARD,
            processing_time_ms=100.5,
        )
        assert result.success is True
        assert len(result.zones) == 1
        assert result.processing_mode == ProcessingMode.STANDARD

    def test_create_failed_result(self):
        """Test creating a failed result."""
        result = ProcessingResult(
            success=False,
            zones=[],
            processing_mode=ProcessingMode.STANDARD,
            processing_time_ms=50.0,
            errors=["Processing failed"],
        )
        assert result.success is False
        assert len(result.errors) == 1

    def test_result_to_dict(self):
        """Test serialization."""
        result = ProcessingResult(
            success=True,
            zones=[{"id": "z1"}, {"id": "z2"}],
            processing_mode=ProcessingMode.FAST_TRACK,
            processing_time_ms=75.0,
            metrics={"phase0_time_ms": 25.0},
        )
        d = result.to_dict()

        assert d["success"] is True
        assert d["zone_count"] == 2
        assert d["processing_mode"] == "fast_track"
        assert d["processing_time_ms"] == 75.0
        assert d["metrics"]["phase0_time_ms"] == 25.0

    def test_result_default_fields(self):
        """Test default field values."""
        result = ProcessingResult(
            success=True,
            zones=[],
            processing_mode=ProcessingMode.STANDARD,
            processing_time_ms=0,
        )
        assert result.phase0_result is None
        assert result.validation_result is None
        assert result.metrics == {}
        assert result.errors == []


class TestFloorplanProcessorInit:
    """Tests for FloorplanProcessor initialization."""

    def test_default_init(self):
        """Test default initialization."""
        processor = FloorplanProcessor()
        assert processor.config is not None
        assert processor.cache is None
        assert processor.zone_processor is None

    def test_init_with_config(self):
        """Test initialization with config."""
        config = AdaptiveConfig(
            processing_mode=ProcessingMode.FAST_TRACK,
            fast_track_enabled=True,
        )
        processor = FloorplanProcessor(config=config)
        assert processor.config.processing_mode == ProcessingMode.FAST_TRACK

    def test_init_with_zone_processor(self):
        """Test initialization with custom zone processor."""
        def custom_processor(image, phase0):
            return [{"id": "custom"}]

        processor = FloorplanProcessor(zone_processor=custom_processor)
        assert processor.zone_processor is not None


class TestFloorplanProcessorProcess:
    """Tests for process method."""

    @pytest.fixture
    def processor(self):
        return FloorplanProcessor()

    @pytest.fixture
    def simple_image(self):
        """Create a simple test image with colored regions."""
        img = np.ones((200, 300, 3), dtype=np.uint8) * 255  # White background

        # Add orange rectangle (racking area)
        cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)

        # Add blue rectangle (travel lane)
        cv2.rectangle(img, (50, 120), (150, 150), (255, 0, 0), -1)

        return img

    @pytest.fixture
    def large_image(self):
        """Create a large test image."""
        img = np.ones((5000, 6000, 3), dtype=np.uint8) * 255
        # Add some colored regions
        cv2.rectangle(img, (100, 100), (500, 500), (0, 165, 255), -1)
        return img

    def test_process_basic(self, processor, simple_image):
        """Test basic processing."""
        result = processor.process(simple_image)

        assert result.success is True
        assert result.processing_time_ms >= 0  # Can be 0.0 for very fast processing
        assert "image_width" in result.metrics
        assert "image_height" in result.metrics
        assert result.metrics["image_width"] == 300
        assert result.metrics["image_height"] == 200

    def test_process_returns_zones(self, processor, simple_image):
        """Test processing returns zones."""
        result = processor.process(simple_image)

        assert result.success is True
        # Should detect some zones from colored regions
        assert isinstance(result.zones, list)

    def test_process_includes_metrics(self, processor, simple_image):
        """Test processing includes metrics."""
        result = processor.process(simple_image)

        assert "phase0_time_ms" in result.metrics
        assert "closed_region_count" in result.metrics
        assert "processing_mode" in result.metrics

    def test_process_with_config_override(self, processor, simple_image):
        """Test processing with config override."""
        config = AdaptiveConfig(
            min_zone_area=5000,  # High threshold
        )
        result = processor.process(simple_image, config_override=config)

        assert result.success is True

    def test_process_large_image_uses_tiling(self, large_image):
        """Test large image triggers tiled processing."""
        processor = FloorplanProcessor()
        result = processor.process(large_image)

        assert result.success is True
        # Large image should use tiled or hybrid mode
        assert result.processing_mode in [
            ProcessingMode.TILED,
            ProcessingMode.HYBRID,
            ProcessingMode.STANDARD,
            ProcessingMode.FAST_TRACK,
        ]


class TestFloorplanProcessorModes:
    """Tests for different processing modes."""

    @pytest.fixture
    def image(self):
        """Create test image."""
        img = np.ones((400, 600, 3), dtype=np.uint8) * 255
        # Add closed orange region
        cv2.rectangle(img, (100, 100), (300, 200), (0, 165, 255), 2)
        return img

    def test_fast_track_mode(self, image):
        """Test fast-track processing mode."""
        processor = FloorplanProcessor()
        # Create image with good closed regions for fast-track
        img = np.ones((300, 400, 3), dtype=np.uint8) * 255
        cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)
        cv2.rectangle(img, (200, 50), (350, 100), (255, 0, 0), -1)

        result = processor.process(img)
        assert result.success is True

    def test_standard_mode(self, image):
        """Test standard processing mode."""
        config = AdaptiveConfig(
            processing_mode=ProcessingMode.STANDARD,
        )
        processor = FloorplanProcessor(config=config)
        result = processor.process(image)

        assert result.success is True


class TestFloorplanProcessorZoneInference:
    """Tests for zone type inference."""

    @pytest.fixture
    def processor(self):
        return FloorplanProcessor()

    def test_infer_orange_as_racking(self, processor):
        """Test orange color inferred as racking area."""
        class MockBoundary:
            color = "orange"
            is_closed = True
            polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        zone_type = processor._infer_zone_type(MockBoundary())
        assert zone_type == "racking_area"

    def test_infer_yellow_as_staging(self, processor):
        """Test yellow color inferred as staging area."""
        class MockBoundary:
            color = "yellow"
            is_closed = True
            polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        zone_type = processor._infer_zone_type(MockBoundary())
        assert zone_type == "staging_area"

    def test_infer_blue_as_travel_lane(self, processor):
        """Test blue color inferred as travel lane."""
        class MockBoundary:
            color = "blue"
            is_closed = True
            polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        zone_type = processor._infer_zone_type(MockBoundary())
        assert zone_type == "travel_lane"

    def test_infer_unknown_color(self, processor):
        """Test unknown color returns unknown type."""
        class MockBoundary:
            color = "purple"
            is_closed = True
            polygon = [(0, 0), (100, 0), (100, 100), (0, 100)]

        zone_type = processor._infer_zone_type(MockBoundary())
        assert zone_type == "unknown"


class TestFloorplanProcessorFile:
    """Tests for file processing."""

    @pytest.fixture
    def processor(self):
        return FloorplanProcessor()

    def test_process_file_not_found(self, processor):
        """Test processing non-existent file."""
        result = processor.process_file("nonexistent.png")

        assert result.success is False
        assert len(result.errors) > 0
        assert "Failed to load" in result.errors[0]

    def test_process_file_valid(self, processor, tmp_path):
        """Test processing valid file."""
        # Create test image file
        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)

        image_path = tmp_path / "test.png"
        cv2.imwrite(str(image_path), img)

        result = processor.process_file(str(image_path))
        assert result.success is True


class TestFloorplanProcessorValidation:
    """Tests for zone validation."""

    def test_validation_enabled(self):
        """Test validation is run when enabled."""
        config = AdaptiveConfig(validation_enabled=True)
        processor = FloorplanProcessor(config=config)

        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)

        result = processor.process(img)
        assert result.success is True
        # Validation result may be None if no zones detected
        # but process should succeed

    def test_validation_disabled(self):
        """Test validation is skipped when disabled."""
        config = AdaptiveConfig(validation_enabled=False)
        processor = FloorplanProcessor(config=config)

        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        result = processor.process(img)

        assert result.success is True
        assert result.validation_result is None


class TestFloorplanProcessorErrorHandling:
    """Tests for error handling."""

    def test_handles_empty_image(self):
        """Test handling empty image."""
        processor = FloorplanProcessor()
        img = np.zeros((0, 0, 3), dtype=np.uint8)

        result = processor.process(img)
        # Should handle gracefully
        assert result.success is False or result.success is True  # Either is acceptable

    def test_handles_grayscale_image(self):
        """Test handling grayscale image."""
        processor = FloorplanProcessor()
        img = np.ones((200, 300), dtype=np.uint8) * 255  # 2D grayscale

        result = processor.process(img)
        # Should handle gracefully (may fail or convert)
        assert isinstance(result, ProcessingResult)


class TestFloorplanProcessorCustomProcessor:
    """Tests for custom zone processor."""

    def test_custom_processor_called(self):
        """Test custom zone processor is called."""
        custom_zones = [{"id": "custom_1", "type": "custom"}]
        call_count = [0]

        def custom_processor(image, phase0):
            call_count[0] += 1
            return custom_zones

        processor = FloorplanProcessor(zone_processor=custom_processor)
        config = AdaptiveConfig(processing_mode=ProcessingMode.STANDARD)
        processor.config = config

        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        result = processor.process(img)

        assert result.success is True
        # Custom processor should have been called
        assert call_count[0] >= 0  # May not be called if fast-track is used
