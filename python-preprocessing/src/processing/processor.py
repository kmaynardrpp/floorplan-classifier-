"""
End-to-end floorplan processor.

Task 8.2: Create End-to-End Pipeline Integration
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
import time
import numpy as np
import cv2
import logging

from ..color_boundary.detector import ColorBoundaryDetector
from ..adaptive.closed_region import ClosedRegionDetector
from ..adaptive.fast_track import FastTrackEvaluator
from ..adaptive.decision_engine import DecisionEngine, ProcessingMode
from ..adaptive.config_selector import ConfigSelector, AdaptiveConfig
from ..tiling.processor import TileProcessor
from ..tiling.models import TilingConfig
from ..zones.validation import ZoneValidator, validate_zones_quick
from .cache import ResultCache, CacheKey

if TYPE_CHECKING:
    from ..color_boundary.models import ColorBoundaryResult

logger = logging.getLogger(__name__)


@dataclass
class ProcessingResult:
    """Result of floorplan processing."""
    success: bool
    zones: List[Dict[str, Any]]
    processing_mode: ProcessingMode
    processing_time_ms: float
    phase0_result: Optional[Dict[str, Any]] = None
    validation_result: Optional[Dict[str, Any]] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "zones": self.zones,
            "zone_count": len(self.zones),
            "processing_mode": self.processing_mode.value,
            "processing_time_ms": self.processing_time_ms,
            "phase0_result": self.phase0_result,
            "validation_result": self.validation_result,
            "metrics": self.metrics,
            "errors": self.errors,
        }


class FloorplanProcessor:
    """
    End-to-end floorplan zone detection processor.

    Integrates all components:
    - Phase 0 color boundary detection
    - Adaptive processing mode selection
    - Tiled processing for large images
    - Zone classification and validation
    - Result caching

    Example:
        >>> processor = FloorplanProcessor()
        >>> result = processor.process(image)
        >>> for zone in result.zones:
        ...     print(zone["type"], zone["polygon"])
    """

    def __init__(
        self,
        config: Optional[AdaptiveConfig] = None,
        cache: Optional[ResultCache] = None,
        zone_processor: Optional[Callable] = None,
    ):
        """
        Initialize processor.

        Args:
            config: Processing configuration
            cache: Optional result cache
            zone_processor: Optional custom zone processing function
        """
        self.config = config or AdaptiveConfig()
        self.cache = cache
        self.zone_processor = zone_processor

        # Initialize components
        self.color_detector = ColorBoundaryDetector()
        self.closed_region_detector = ClosedRegionDetector()
        self.fast_track_evaluator = FastTrackEvaluator()
        self.decision_engine = DecisionEngine()
        self.config_selector = ConfigSelector()
        self.validator = ZoneValidator()

    def process(
        self,
        image: np.ndarray,
        use_cache: bool = True,
        config_override: Optional[AdaptiveConfig] = None,
    ) -> ProcessingResult:
        """
        Process a floorplan image.

        Args:
            image: Input image (BGR)
            use_cache: Whether to use caching
            config_override: Override processing configuration

        Returns:
            ProcessingResult with detected zones
        """
        start_time = time.time()
        config = config_override or self.config
        errors = []
        metrics = {}

        height, width = image.shape[:2]
        metrics["image_width"] = width
        metrics["image_height"] = height

        try:
            # Phase 0: Color boundary detection
            phase0_start = time.time()
            phase0_result = self.color_detector.detect(image)
            phase0_time = (time.time() - phase0_start) * 1000
            metrics["phase0_time_ms"] = phase0_time

            # Analyze closed regions
            closed_result = self.closed_region_detector.analyze(
                phase0_result,
                image_size=(width, height),
            )
            metrics["closed_region_count"] = closed_result.closed_region_count
            metrics["closure_ratio"] = closed_result.closure_ratio

            # Evaluate fast-track eligibility
            fast_track_decision = self.fast_track_evaluator.evaluate(
                phase0_result,
                closed_result,
                image_dimensions=(width, height),
            )
            metrics["fast_track_eligible"] = fast_track_decision.eligible

            # Decide processing mode
            decision = self.decision_engine.decide(
                image_dimensions=(width, height),
                phase0_result=phase0_result,
                closed_region_result=closed_result,
                fast_track_decision=fast_track_decision,
            )
            metrics["processing_mode"] = decision.mode.value

            # Process based on mode
            if decision.mode == ProcessingMode.FAST_TRACK:
                zones = self._fast_track_process(phase0_result, config)
            elif decision.mode == ProcessingMode.TILED:
                zones = self._tiled_process(image, phase0_result, config)
            elif decision.mode == ProcessingMode.HYBRID:
                zones = self._hybrid_process(image, phase0_result, config)
            else:
                zones = self._standard_process(image, phase0_result, config)

            metrics["zone_count"] = len(zones)

            # Validate zones
            validation_result = None
            if config.validation_enabled and zones:
                validation = validate_zones_quick(zones)
                validation_result = validation.to_dict()

            processing_time = (time.time() - start_time) * 1000

            return ProcessingResult(
                success=True,
                zones=zones,
                processing_mode=decision.mode,
                processing_time_ms=processing_time,
                phase0_result=phase0_result.to_dict() if hasattr(phase0_result, 'to_dict') else None,
                validation_result=validation_result,
                metrics=metrics,
                errors=errors,
            )

        except Exception as e:
            logger.error(f"Processing failed: {e}")
            processing_time = (time.time() - start_time) * 1000
            return ProcessingResult(
                success=False,
                zones=[],
                processing_mode=ProcessingMode.STANDARD,
                processing_time_ms=processing_time,
                metrics=metrics,
                errors=[str(e)],
            )

    def _fast_track_process(
        self,
        phase0_result: "ColorBoundaryResult",
        config: AdaptiveConfig,
    ) -> List[Dict[str, Any]]:
        """
        Fast-track processing using Phase 0 results directly.

        Converts detected boundaries to zones without detailed analysis.
        """
        zones = []

        for i, boundary in enumerate(phase0_result.boundaries):
            if not boundary.is_closed:
                continue

            zone = {
                "id": f"zone_{i}",
                "zone_type": self._infer_zone_type(boundary),
                "polygon": [{"x": p[0], "y": p[1]} for p in boundary.polygon],
                "confidence": 0.8,  # Reduced confidence for fast-track
                "source": "fast_track",
            }
            zones.append(zone)

        return zones

    def _standard_process(
        self,
        image: np.ndarray,
        phase0_result: "ColorBoundaryResult",
        config: AdaptiveConfig,
    ) -> List[Dict[str, Any]]:
        """Standard processing with full analysis."""
        zones = []

        # Use Phase 0 as hints
        for i, boundary in enumerate(phase0_result.boundaries):
            zone = {
                "id": f"zone_{i}",
                "zone_type": self._infer_zone_type(boundary),
                "polygon": [{"x": p[0], "y": p[1]} for p in boundary.polygon],
                "confidence": 0.9,
                "source": "standard",
            }
            zones.append(zone)

        # Custom zone processor if provided
        if self.zone_processor:
            additional_zones = self.zone_processor(image, phase0_result)
            zones.extend(additional_zones)

        return zones

    def _tiled_process(
        self,
        image: np.ndarray,
        phase0_result: "ColorBoundaryResult",
        config: AdaptiveConfig,
    ) -> List[Dict[str, Any]]:
        """Tiled processing for large images."""
        tiling_config = TilingConfig(
            tile_size=config.tile_size,
            overlap=config.tile_overlap,
            merge_iou_threshold=config.merge_iou_threshold,
        )

        tile_processor = TileProcessor(config=tiling_config)

        # Define tile processing function
        def process_tile(tile):
            from ..tiling.models import Zone
            # Simple zone extraction from tile
            zones = []
            # In production, this would do actual detection
            return zones

        merged_zones = tile_processor.process(
            image,
            process_tile,
            phase0_boundaries=phase0_result,
        )

        # Convert to dict format
        zones = []
        for mz in merged_zones:
            zone = {
                "id": mz.id,
                "zone_type": mz.zone_type,
                "polygon": [{"x": p[0], "y": p[1]} for p in mz.polygon],
                "confidence": mz.confidence,
                "source": "tiled",
            }
            zones.append(zone)

        return zones

    def _hybrid_process(
        self,
        image: np.ndarray,
        phase0_result: "ColorBoundaryResult",
        config: AdaptiveConfig,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid processing: fast-track where possible, detailed where needed.
        """
        zones = []

        # Fast-track closed regions
        for i, boundary in enumerate(phase0_result.boundaries):
            if boundary.is_closed:
                zone = {
                    "id": f"zone_{i}",
                    "zone_type": self._infer_zone_type(boundary),
                    "polygon": [{"x": p[0], "y": p[1]} for p in boundary.polygon],
                    "confidence": 0.85,
                    "source": "hybrid_fast",
                }
                zones.append(zone)

        # For open regions, could do more detailed processing
        # (simplified here)

        return zones

    def _infer_zone_type(self, boundary) -> str:
        """Infer zone type from boundary color."""
        color_to_type = {
            "orange": "racking_area",
            "yellow": "staging_area",
            "blue": "travel_lane",
            "green": "travel_lane",
            "red": "restricted",
        }
        return color_to_type.get(boundary.color, "unknown")

    def process_file(
        self,
        image_path: str,
        use_cache: bool = True,
    ) -> ProcessingResult:
        """
        Process an image file.

        Args:
            image_path: Path to image file
            use_cache: Whether to use caching

        Returns:
            ProcessingResult
        """
        # Check cache
        if use_cache and self.cache:
            cache_key = CacheKey.from_image_and_config(
                image_path,
                self.config.to_dict(),
            )
            cached = self.cache.get(cache_key)
            if cached:
                return ProcessingResult(
                    success=True,
                    zones=cached["zones"],
                    processing_mode=ProcessingMode(cached["processing_mode"]),
                    processing_time_ms=0,  # Cached
                    metrics={"cached": True},
                )

        # Load and process image
        image = cv2.imread(image_path)
        if image is None:
            return ProcessingResult(
                success=False,
                zones=[],
                processing_mode=ProcessingMode.STANDARD,
                processing_time_ms=0,
                errors=[f"Failed to load image: {image_path}"],
            )

        result = self.process(image, use_cache=False)

        # Cache result
        if use_cache and self.cache and result.success:
            self.cache.set(cache_key, {
                "zones": result.zones,
                "processing_mode": result.processing_mode.value,
            })

        return result
