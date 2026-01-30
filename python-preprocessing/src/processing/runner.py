"""
Pipeline runner with CLI interface.

Task 8.3: Create Pipeline Runner for Batch Processing
"""

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed

from .processor import FloorplanProcessor, ProcessingResult
from .cache import ResultCache
from ..adaptive.config_selector import AdaptiveConfig

logger = logging.getLogger(__name__)


@dataclass
class PipelineConfig:
    """
    Configuration for pipeline execution.

    Attributes:
        input_paths: List of input image paths or directories
        output_dir: Output directory for results
        cache_dir: Cache directory
        recursive: Search directories recursively
        parallel_workers: Number of parallel workers
        use_cache: Enable result caching
        preset: Processing preset name
        config_overrides: Config parameter overrides
        output_format: Output format (json, csv)
        verbose: Enable verbose output
    """
    input_paths: List[str] = field(default_factory=list)
    output_dir: Optional[str] = None
    cache_dir: Optional[str] = None
    recursive: bool = False
    parallel_workers: int = 1
    use_cache: bool = True
    preset: str = "balanced"
    config_overrides: Dict[str, Any] = field(default_factory=dict)
    output_format: str = "json"
    verbose: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "input_paths": self.input_paths,
            "output_dir": self.output_dir,
            "cache_dir": self.cache_dir,
            "recursive": self.recursive,
            "parallel_workers": self.parallel_workers,
            "use_cache": self.use_cache,
            "preset": self.preset,
            "config_overrides": self.config_overrides,
            "output_format": self.output_format,
            "verbose": self.verbose,
        }


@dataclass
class BatchResult:
    """Result of batch processing."""
    total_files: int
    successful: int
    failed: int
    total_time_ms: float
    results: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "total_files": self.total_files,
            "successful": self.successful,
            "failed": self.failed,
            "total_time_ms": self.total_time_ms,
            "success_rate": self.successful / self.total_files if self.total_files > 0 else 0,
            "results": self.results,
            "errors": self.errors,
        }


class PipelineRunner:
    """
    Runner for executing the floorplan processing pipeline.

    Supports:
    - Single file processing
    - Batch processing
    - Parallel execution
    - Progress callbacks
    - Result aggregation

    Example:
        >>> runner = PipelineRunner()
        >>> result = runner.run_batch(["image1.png", "image2.png"])
        >>> print(f"Processed {result.successful}/{result.total_files}")
    """

    SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif"}

    def __init__(
        self,
        config: Optional[PipelineConfig] = None,
        processor: Optional[FloorplanProcessor] = None,
        progress_callback: Optional[Callable[[int, int, str], None]] = None,
    ):
        """
        Initialize runner.

        Args:
            config: Pipeline configuration
            processor: Optional pre-configured processor
            progress_callback: Callback for progress updates (current, total, filename)
        """
        self.config = config or PipelineConfig()
        self.processor = processor
        self.progress_callback = progress_callback

        # Initialize cache if enabled
        self._cache = None
        if self.config.use_cache and self.config.cache_dir:
            self._cache = ResultCache(
                cache_dir=self.config.cache_dir,
                persist=True,
            )

    def run_single(
        self,
        image_path: str,
        config_override: Optional[AdaptiveConfig] = None,
    ) -> ProcessingResult:
        """
        Process a single image.

        Args:
            image_path: Path to image file
            config_override: Optional config override

        Returns:
            ProcessingResult
        """
        if self.processor is None:
            self.processor = self._create_processor()

        return self.processor.process_file(
            image_path,
            use_cache=self.config.use_cache,
        )

    def run_batch(
        self,
        paths: Optional[List[str]] = None,
    ) -> BatchResult:
        """
        Process multiple images.

        Args:
            paths: List of paths (uses config.input_paths if not provided)

        Returns:
            BatchResult with aggregated results
        """
        start_time = time.time()

        # Get file list
        paths = paths or self.config.input_paths
        files = self._collect_files(paths)

        if not files:
            return BatchResult(
                total_files=0,
                successful=0,
                failed=0,
                total_time_ms=0,
            )

        # Process files
        results = []
        errors = []

        if self.config.parallel_workers > 1:
            results, errors = self._process_parallel(files)
        else:
            results, errors = self._process_sequential(files)

        total_time = (time.time() - start_time) * 1000

        return BatchResult(
            total_files=len(files),
            successful=len(results),
            failed=len(errors),
            total_time_ms=total_time,
            results=results,
            errors=errors,
        )

    def _create_processor(self) -> FloorplanProcessor:
        """Create a configured processor."""
        # Get base config from preset
        from ..adaptive.config_selector import ConfigSelector
        selector = ConfigSelector()
        config = selector.get_preset(self.config.preset)

        if config is None:
            config = AdaptiveConfig()

        # Apply overrides
        for key, value in self.config.config_overrides.items():
            if hasattr(config, key):
                setattr(config, key, value)

        return FloorplanProcessor(
            config=config,
            cache=self._cache,
        )

    def _collect_files(self, paths: List[str]) -> List[str]:
        """Collect all image files from paths."""
        files = []

        for path in paths:
            p = Path(path)

            if p.is_file():
                if p.suffix.lower() in self.SUPPORTED_EXTENSIONS:
                    files.append(str(p))
            elif p.is_dir():
                if self.config.recursive:
                    pattern = "**/*"
                else:
                    pattern = "*"

                for ext in self.SUPPORTED_EXTENSIONS:
                    files.extend(str(f) for f in p.glob(pattern + ext))

        return sorted(set(files))

    def _process_sequential(
        self,
        files: List[str],
    ) -> tuple:
        """Process files sequentially."""
        results = []
        errors = []

        if self.processor is None:
            self.processor = self._create_processor()

        for i, filepath in enumerate(files):
            if self.progress_callback:
                self.progress_callback(i + 1, len(files), filepath)

            try:
                result = self.processor.process_file(
                    filepath,
                    use_cache=self.config.use_cache,
                )

                if result.success:
                    results.append({
                        "file": filepath,
                        "result": result.to_dict(),
                    })
                else:
                    errors.append({
                        "file": filepath,
                        "errors": result.errors,
                    })

            except Exception as e:
                logger.error(f"Error processing {filepath}: {e}")
                errors.append({
                    "file": filepath,
                    "errors": [str(e)],
                })

        return results, errors

    def _process_parallel(
        self,
        files: List[str],
    ) -> tuple:
        """Process files in parallel."""
        results = []
        errors = []
        completed = 0

        with ThreadPoolExecutor(max_workers=self.config.parallel_workers) as executor:
            # Submit all jobs
            futures = {}
            for filepath in files:
                processor = self._create_processor()
                future = executor.submit(
                    processor.process_file,
                    filepath,
                    self.config.use_cache,
                )
                futures[future] = filepath

            # Collect results
            for future in as_completed(futures):
                filepath = futures[future]
                completed += 1

                if self.progress_callback:
                    self.progress_callback(completed, len(files), filepath)

                try:
                    result = future.result()

                    if result.success:
                        results.append({
                            "file": filepath,
                            "result": result.to_dict(),
                        })
                    else:
                        errors.append({
                            "file": filepath,
                            "errors": result.errors,
                        })

                except Exception as e:
                    logger.error(f"Error processing {filepath}: {e}")
                    errors.append({
                        "file": filepath,
                        "errors": [str(e)],
                    })

        return results, errors

    def save_results(
        self,
        batch_result: BatchResult,
        output_path: Optional[str] = None,
    ) -> str:
        """
        Save batch results to file.

        Args:
            batch_result: Results to save
            output_path: Output file path (uses config if not provided)

        Returns:
            Path to saved file
        """
        if output_path is None:
            output_dir = self.config.output_dir or "."
            timestamp = int(time.time())
            output_path = f"{output_dir}/results_{timestamp}.{self.config.output_format}"

        # Ensure output directory exists
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        if self.config.output_format == "json":
            with open(output_path, "w") as f:
                json.dump(batch_result.to_dict(), f, indent=2)
        elif self.config.output_format == "csv":
            self._save_csv(batch_result, output_path)

        return output_path

    def _save_csv(self, batch_result: BatchResult, output_path: str) -> None:
        """Save results as CSV."""
        import csv

        with open(output_path, "w", newline="") as f:
            writer = csv.writer(f)

            # Header
            writer.writerow([
                "file",
                "success",
                "zone_count",
                "processing_mode",
                "processing_time_ms",
            ])

            # Results
            for item in batch_result.results:
                result = item["result"]
                writer.writerow([
                    item["file"],
                    True,
                    result.get("zone_count", 0),
                    result.get("processing_mode", ""),
                    result.get("processing_time_ms", 0),
                ])

            # Errors
            for item in batch_result.errors:
                writer.writerow([
                    item["file"],
                    False,
                    0,
                    "",
                    0,
                ])


def create_argument_parser() -> argparse.ArgumentParser:
    """Create CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Floorplan Zone Detection Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s image.png                    Process single image
  %(prog)s images/                      Process all images in directory
  %(prog)s -r images/                   Process recursively
  %(prog)s -w 4 images/                 Process with 4 workers
  %(prog)s --preset fast images/        Use fast preset
  %(prog)s -o results/ images/          Save results to directory
        """,
    )

    parser.add_argument(
        "inputs",
        nargs="+",
        help="Input image files or directories",
    )

    parser.add_argument(
        "-o", "--output",
        help="Output directory for results",
    )

    parser.add_argument(
        "-c", "--cache",
        help="Cache directory",
    )

    parser.add_argument(
        "-r", "--recursive",
        action="store_true",
        help="Search directories recursively",
    )

    parser.add_argument(
        "-w", "--workers",
        type=int,
        default=1,
        help="Number of parallel workers (default: 1)",
    )

    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable result caching",
    )

    parser.add_argument(
        "--preset",
        choices=["fast", "balanced", "quality", "large_image"],
        default="balanced",
        help="Processing preset (default: balanced)",
    )

    parser.add_argument(
        "-f", "--format",
        choices=["json", "csv"],
        default="json",
        help="Output format (default: json)",
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output",
    )

    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 1.0.0",
    )

    return parser


def main(args: Optional[List[str]] = None) -> int:
    """
    Main CLI entry point.

    Args:
        args: Command line arguments (uses sys.argv if not provided)

    Returns:
        Exit code (0 for success)
    """
    parser = create_argument_parser()
    parsed = parser.parse_args(args)

    # Configure logging
    log_level = logging.DEBUG if parsed.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
    )

    # Create config
    config = PipelineConfig(
        input_paths=parsed.inputs,
        output_dir=parsed.output,
        cache_dir=parsed.cache,
        recursive=parsed.recursive,
        parallel_workers=parsed.workers,
        use_cache=not parsed.no_cache,
        preset=parsed.preset,
        output_format=parsed.format,
        verbose=parsed.verbose,
    )

    # Progress callback
    def progress(current: int, total: int, filename: str):
        print(f"[{current}/{total}] Processing: {filename}")

    # Run pipeline
    runner = PipelineRunner(
        config=config,
        progress_callback=progress if parsed.verbose else None,
    )

    print(f"Processing {len(parsed.inputs)} input(s)...")
    result = runner.run_batch()

    # Print summary
    print(f"\nResults:")
    print(f"  Total: {result.total_files}")
    print(f"  Successful: {result.successful}")
    print(f"  Failed: {result.failed}")
    print(f"  Time: {result.total_time_ms:.1f}ms")

    # Save results
    if config.output_dir:
        output_path = runner.save_results(result)
        print(f"\nResults saved to: {output_path}")

    return 0 if result.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
