"""
Adaptive Processing Module (IMP-05)

Handles adaptive decision logic for processing mode selection,
fast-track detection, and hybrid processing strategies.
"""

from .closed_region import ClosedRegionDetector, ClosedRegionResult
from .fast_track import FastTrackDecision, FastTrackEvaluator
from .decision_engine import ProcessingMode, ProcessingDecision, DecisionEngine
from .config_selector import AdaptiveConfig, ConfigSelector

__all__ = [
    "ClosedRegionDetector",
    "ClosedRegionResult",
    "FastTrackDecision",
    "FastTrackEvaluator",
    "ProcessingMode",
    "ProcessingDecision",
    "DecisionEngine",
    "AdaptiveConfig",
    "ConfigSelector",
]
