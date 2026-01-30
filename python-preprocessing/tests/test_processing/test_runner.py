"""Tests for pipeline runner."""

import pytest
import numpy as np
import cv2
import json
from pathlib import Path

from src.processing.runner import (
    PipelineConfig,
    BatchResult,
    PipelineRunner,
    create_argument_parser,
    main,
)


class TestPipelineConfig:
    """Tests for PipelineConfig dataclass."""

    def test_default_config(self):
        """Test default configuration."""
        config = PipelineConfig()
        assert config.input_paths == []
        assert config.output_dir is None
        assert config.parallel_workers == 1
        assert config.use_cache is True
        assert config.preset == "balanced"

    def test_custom_config(self):
        """Test custom configuration."""
        config = PipelineConfig(
            input_paths=["image1.png", "image2.png"],
            output_dir="./output",
            parallel_workers=4,
            preset="fast",
        )
        assert len(config.input_paths) == 2
        assert config.parallel_workers == 4

    def test_config_to_dict(self):
        """Test serialization."""
        config = PipelineConfig(
            input_paths=["test.png"],
            recursive=True,
            verbose=True,
        )
        d = config.to_dict()

        assert d["input_paths"] == ["test.png"]
        assert d["recursive"] is True
        assert d["verbose"] is True


class TestBatchResult:
    """Tests for BatchResult dataclass."""

    def test_create_result(self):
        """Test creating batch result."""
        result = BatchResult(
            total_files=10,
            successful=8,
            failed=2,
            total_time_ms=5000.0,
        )
        assert result.total_files == 10
        assert result.successful == 8
        assert result.failed == 2

    def test_result_to_dict(self):
        """Test serialization."""
        result = BatchResult(
            total_files=10,
            successful=8,
            failed=2,
            total_time_ms=5000.0,
            results=[{"file": "test.png"}],
        )
        d = result.to_dict()

        assert d["total_files"] == 10
        assert d["success_rate"] == 0.8
        assert len(d["results"]) == 1

    def test_result_zero_files(self):
        """Test result with zero files."""
        result = BatchResult(
            total_files=0,
            successful=0,
            failed=0,
            total_time_ms=0,
        )
        d = result.to_dict()
        assert d["success_rate"] == 0


class TestPipelineRunnerInit:
    """Tests for PipelineRunner initialization."""

    def test_default_init(self):
        """Test default initialization."""
        runner = PipelineRunner()
        assert runner.config is not None
        assert runner.processor is None

    def test_init_with_config(self):
        """Test initialization with config."""
        config = PipelineConfig(parallel_workers=4)
        runner = PipelineRunner(config=config)
        assert runner.config.parallel_workers == 4

    def test_init_with_progress_callback(self):
        """Test initialization with progress callback."""
        def callback(current, total, filename):
            pass

        runner = PipelineRunner(progress_callback=callback)
        assert runner.progress_callback is not None


class TestPipelineRunnerCollectFiles:
    """Tests for file collection."""

    @pytest.fixture
    def runner(self):
        return PipelineRunner()

    def test_collect_single_file(self, runner, tmp_path):
        """Test collecting single file."""
        image_path = tmp_path / "test.png"
        image_path.touch()

        files = runner._collect_files([str(image_path)])
        assert len(files) == 1
        assert str(image_path) in files[0]

    def test_collect_directory(self, runner, tmp_path):
        """Test collecting from directory."""
        (tmp_path / "image1.png").touch()
        (tmp_path / "image2.jpg").touch()
        (tmp_path / "not_image.txt").touch()

        files = runner._collect_files([str(tmp_path)])
        assert len(files) == 2

    def test_collect_recursive(self, tmp_path):
        """Test recursive collection."""
        config = PipelineConfig(recursive=True)
        runner = PipelineRunner(config=config)

        subdir = tmp_path / "subdir"
        subdir.mkdir()
        (tmp_path / "image1.png").touch()
        (subdir / "image2.png").touch()

        files = runner._collect_files([str(tmp_path)])
        assert len(files) == 2

    def test_collect_non_recursive(self, tmp_path):
        """Test non-recursive collection."""
        config = PipelineConfig(recursive=False)
        runner = PipelineRunner(config=config)

        subdir = tmp_path / "subdir"
        subdir.mkdir()
        (tmp_path / "image1.png").touch()
        (subdir / "image2.png").touch()

        files = runner._collect_files([str(tmp_path)])
        assert len(files) == 1

    def test_collect_supported_extensions(self, runner, tmp_path):
        """Test only supported extensions collected."""
        (tmp_path / "image.png").touch()
        (tmp_path / "image.jpg").touch()
        (tmp_path / "image.jpeg").touch()
        (tmp_path / "image.bmp").touch()
        (tmp_path / "image.tiff").touch()
        (tmp_path / "document.pdf").touch()
        (tmp_path / "data.json").touch()

        files = runner._collect_files([str(tmp_path)])
        assert len(files) == 5


class TestPipelineRunnerSingle:
    """Tests for single file processing."""

    @pytest.fixture
    def runner(self):
        return PipelineRunner()

    def test_run_single_valid(self, runner, tmp_path):
        """Test processing single valid file."""
        # Create test image
        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)

        image_path = tmp_path / "test.png"
        cv2.imwrite(str(image_path), img)

        result = runner.run_single(str(image_path))
        assert result.success is True

    def test_run_single_invalid(self, runner):
        """Test processing invalid file."""
        result = runner.run_single("nonexistent.png")
        assert result.success is False


class TestPipelineRunnerBatch:
    """Tests for batch processing."""

    @pytest.fixture
    def test_images(self, tmp_path):
        """Create test image files."""
        paths = []
        for i in range(3):
            img = np.ones((200, 300, 3), dtype=np.uint8) * 255
            cv2.rectangle(img, (50, 50), (150, 100), (0, 165, 255), -1)

            image_path = tmp_path / f"test_{i}.png"
            cv2.imwrite(str(image_path), img)
            paths.append(str(image_path))

        return paths

    def test_run_batch_sequential(self, test_images):
        """Test sequential batch processing."""
        config = PipelineConfig(parallel_workers=1)
        runner = PipelineRunner(config=config)

        result = runner.run_batch(test_images)

        assert result.total_files == 3
        assert result.successful == 3
        assert result.failed == 0

    def test_run_batch_parallel(self, test_images):
        """Test parallel batch processing."""
        config = PipelineConfig(parallel_workers=2)
        runner = PipelineRunner(config=config)

        result = runner.run_batch(test_images)

        assert result.total_files == 3
        assert result.successful == 3

    def test_run_batch_empty(self):
        """Test batch with no files."""
        runner = PipelineRunner()
        result = runner.run_batch([])

        assert result.total_files == 0
        assert result.successful == 0
        assert result.failed == 0

    def test_run_batch_with_errors(self, test_images, tmp_path):
        """Test batch with some invalid files."""
        runner = PipelineRunner()

        # Create a corrupted image file (not valid image data)
        bad_image = tmp_path / "bad_image.png"
        bad_image.write_text("not an image")

        paths = test_images + [str(bad_image)]

        result = runner.run_batch(paths)

        assert result.total_files == 4
        assert result.successful == 3
        assert result.failed == 1

    def test_run_batch_progress_callback(self, test_images):
        """Test progress callback is called."""
        progress_calls = []

        def callback(current, total, filename):
            progress_calls.append((current, total, filename))

        runner = PipelineRunner(progress_callback=callback)
        runner.run_batch(test_images)

        assert len(progress_calls) == 3
        assert progress_calls[-1][0] == 3  # Last call has current=3


class TestPipelineRunnerSaveResults:
    """Tests for saving results."""

    def test_save_json(self, tmp_path):
        """Test saving results as JSON."""
        config = PipelineConfig(output_format="json")
        runner = PipelineRunner(config=config)

        result = BatchResult(
            total_files=2,
            successful=2,
            failed=0,
            total_time_ms=1000,
            results=[{"file": "test.png", "result": {}}],
        )

        output_path = tmp_path / "results.json"
        saved_path = runner.save_results(result, str(output_path))

        assert Path(saved_path).exists()
        with open(saved_path) as f:
            data = json.load(f)
        assert data["total_files"] == 2

    def test_save_csv(self, tmp_path):
        """Test saving results as CSV."""
        config = PipelineConfig(output_format="csv")
        runner = PipelineRunner(config=config)

        result = BatchResult(
            total_files=2,
            successful=1,
            failed=1,
            total_time_ms=1000,
            results=[{
                "file": "test.png",
                "result": {
                    "zone_count": 5,
                    "processing_mode": "standard",
                    "processing_time_ms": 500,
                },
            }],
            errors=[{"file": "bad.png", "errors": ["Failed"]}],
        )

        output_path = tmp_path / "results.csv"
        saved_path = runner.save_results(result, str(output_path))

        assert Path(saved_path).exists()
        with open(saved_path) as f:
            lines = f.readlines()
        assert len(lines) == 3  # Header + 2 rows

    def test_save_creates_directory(self, tmp_path):
        """Test save creates output directory."""
        runner = PipelineRunner()

        result = BatchResult(
            total_files=1,
            successful=1,
            failed=0,
            total_time_ms=100,
        )

        output_dir = tmp_path / "subdir" / "results"
        output_path = output_dir / "results.json"
        runner.save_results(result, str(output_path))

        assert output_dir.exists()


class TestArgumentParser:
    """Tests for CLI argument parser."""

    def test_parser_creation(self):
        """Test parser is created."""
        parser = create_argument_parser()
        assert parser is not None

    def test_parser_inputs_required(self):
        """Test inputs are required."""
        parser = create_argument_parser()
        with pytest.raises(SystemExit):
            parser.parse_args([])

    def test_parser_single_input(self):
        """Test parsing single input."""
        parser = create_argument_parser()
        args = parser.parse_args(["image.png"])
        assert args.inputs == ["image.png"]

    def test_parser_multiple_inputs(self):
        """Test parsing multiple inputs."""
        parser = create_argument_parser()
        args = parser.parse_args(["image1.png", "image2.png"])
        assert len(args.inputs) == 2

    def test_parser_output_option(self):
        """Test output option."""
        parser = create_argument_parser()
        args = parser.parse_args(["-o", "results/", "image.png"])
        assert args.output == "results/"

    def test_parser_recursive_option(self):
        """Test recursive option."""
        parser = create_argument_parser()
        args = parser.parse_args(["-r", "images/"])
        assert args.recursive is True

    def test_parser_workers_option(self):
        """Test workers option."""
        parser = create_argument_parser()
        args = parser.parse_args(["-w", "4", "image.png"])
        assert args.workers == 4

    def test_parser_preset_option(self):
        """Test preset option."""
        parser = create_argument_parser()
        args = parser.parse_args(["--preset", "fast", "image.png"])
        assert args.preset == "fast"

    def test_parser_format_option(self):
        """Test format option."""
        parser = create_argument_parser()
        args = parser.parse_args(["-f", "csv", "image.png"])
        assert args.format == "csv"

    def test_parser_no_cache_option(self):
        """Test no-cache option."""
        parser = create_argument_parser()
        args = parser.parse_args(["--no-cache", "image.png"])
        assert args.no_cache is True

    def test_parser_verbose_option(self):
        """Test verbose option."""
        parser = create_argument_parser()
        args = parser.parse_args(["-v", "image.png"])
        assert args.verbose is True


class TestMainFunction:
    """Tests for main CLI function."""

    def test_main_with_valid_file(self, tmp_path):
        """Test main with valid file."""
        # Create test image
        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        image_path = tmp_path / "test.png"
        cv2.imwrite(str(image_path), img)

        exit_code = main([str(image_path)])
        assert exit_code == 0

    def test_main_with_output(self, tmp_path):
        """Test main with output directory."""
        # Create test image
        img = np.ones((200, 300, 3), dtype=np.uint8) * 255
        image_path = tmp_path / "test.png"
        cv2.imwrite(str(image_path), img)

        output_dir = tmp_path / "output"
        exit_code = main(["-o", str(output_dir), str(image_path)])

        assert exit_code == 0
        assert output_dir.exists()
        assert len(list(output_dir.glob("*.json"))) == 1

    def test_main_with_invalid_file(self, tmp_path):
        """Test main with invalid file."""
        exit_code = main([str(tmp_path / "nonexistent.png")])
        # Returns 0 for empty file list or 1 for failures
        assert exit_code in [0, 1]
