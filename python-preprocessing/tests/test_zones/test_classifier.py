"""Tests for zone classifier."""

import numpy as np
import pytest

from src.zones.types import ZoneType
from src.zones.classifier import ZoneClassifier, ClassificationResult


class TestClassificationResult:
    """Tests for ClassificationResult dataclass."""

    def test_create_result(self):
        """Test creating classification result."""
        result = ClassificationResult(
            zone_type=ZoneType.RACKING,
            confidence=0.85,
        )
        assert result.zone_type == ZoneType.RACKING
        assert result.confidence == 0.85

    def test_result_with_alternatives(self):
        """Test result with alternative types."""
        result = ClassificationResult(
            zone_type=ZoneType.RACKING,
            confidence=0.7,
            alternative_types=[
                (ZoneType.BULK_STORAGE, 0.2),
                (ZoneType.STAGING_AREA, 0.1),
            ],
        )
        assert len(result.alternative_types) == 2

    def test_result_to_dict(self):
        """Test serialization to dict."""
        result = ClassificationResult(
            zone_type=ZoneType.TRAVEL_LANE,
            confidence=0.9,
            features={"area": 5000},
        )
        d = result.to_dict()
        assert d["zone_type"] == "travel_lane"
        assert d["confidence"] == 0.9
        assert d["features"]["area"] == 5000


class TestZoneClassifierInit:
    """Tests for ZoneClassifier initialization."""

    def test_default_init(self):
        """Test default initialization."""
        classifier = ZoneClassifier()
        assert classifier.min_confidence == 0.3
        assert classifier.use_color is True
        assert classifier.use_geometry is True

    def test_custom_init(self):
        """Test custom initialization."""
        classifier = ZoneClassifier(
            min_confidence=0.5,
            use_color=False,
            use_geometry=True,
        )
        assert classifier.min_confidence == 0.5
        assert classifier.use_color is False


class TestZoneClassifierClassify:
    """Tests for classify method."""

    @pytest.fixture
    def classifier(self):
        """Create classifier instance."""
        return ZoneClassifier(min_confidence=0.1)

    @pytest.fixture
    def rectangle_polygon(self):
        """Create rectangle polygon."""
        return [(0, 0), (200, 0), (200, 100), (0, 100)]

    @pytest.fixture
    def narrow_polygon(self):
        """Create narrow corridor polygon."""
        return [(0, 0), (500, 0), (500, 50), (0, 50)]

    @pytest.fixture
    def square_polygon(self):
        """Create square polygon."""
        return [(0, 0), (100, 0), (100, 100), (0, 100)]

    def test_classify_returns_result(self, classifier, rectangle_polygon):
        """Test classify returns ClassificationResult."""
        result = classifier.classify(None, rectangle_polygon)
        assert isinstance(result, ClassificationResult)
        assert result.zone_type is not None
        assert 0.0 <= result.confidence <= 1.0

    def test_classify_narrow_shape(self, classifier, narrow_polygon):
        """Test classification of narrow shape."""
        result = classifier.classify(None, narrow_polygon)

        # Narrow shapes should suggest travel lanes or aisles
        assert result.zone_type in [
            ZoneType.TRAVEL_LANE,
            ZoneType.AISLE_PATH,
            ZoneType.CONVEYOR_AREA,
            ZoneType.UNKNOWN,
        ] or len(result.alternative_types) > 0

    def test_classify_with_image(self, classifier, rectangle_polygon):
        """Test classification with image region."""
        # Create orange image region (suggests racking)
        image = np.zeros((100, 200, 3), dtype=np.uint8)
        image[:, :] = [0, 128, 255]  # BGR orange

        result = classifier.classify(image, rectangle_polygon)
        assert isinstance(result, ClassificationResult)

    def test_classify_with_context(self, classifier, rectangle_polygon):
        """Test classification with context."""
        context = {
            "near_edge": True,
            "adjacent_to_racking": False,
        }
        result = classifier.classify(None, rectangle_polygon, context=context)
        assert isinstance(result, ClassificationResult)

    def test_classify_empty_polygon(self, classifier):
        """Test classification with empty polygon."""
        result = classifier.classify(None, [])
        # Should handle gracefully
        assert isinstance(result, ClassificationResult)

    def test_classify_single_point(self, classifier):
        """Test classification with single point."""
        result = classifier.classify(None, [(50, 50)])
        assert isinstance(result, ClassificationResult)


class TestZoneClassifierFeatureExtraction:
    """Tests for feature extraction methods."""

    @pytest.fixture
    def classifier(self):
        return ZoneClassifier()

    def test_geometry_features_rectangle(self, classifier):
        """Test geometry feature extraction for rectangle."""
        polygon = [(0, 0), (200, 0), (200, 100), (0, 100)]
        features = classifier._extract_geometry_features(polygon)

        assert features["valid"] is True
        assert features["area"] > 0
        # OpenCV boundingRect may return +1 due to inclusive bounds
        assert 199 <= features["width"] <= 201
        assert 99 <= features["height"] <= 101
        assert 1.9 <= features["aspect_ratio"] <= 2.1
        assert features["rectangularity"] > 0.9

    def test_geometry_features_triangle(self, classifier):
        """Test geometry feature extraction for triangle."""
        polygon = [(0, 0), (100, 0), (50, 100)]
        features = classifier._extract_geometry_features(polygon)

        assert features["valid"] is True
        assert features["n_vertices"] == 3
        assert features["compactness"] > 0  # Triangles have some compactness

    def test_color_features_orange(self, classifier):
        """Test color feature extraction for orange region."""
        # Orange in BGR
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        image[:, :] = [0, 128, 255]  # BGR: Blue=0, Green=128, Red=255

        features = classifier._extract_color_features(image)

        assert features["color_valid"] is True
        assert features["dominant_color"] in ["orange", "yellow", "red"]

    def test_color_features_blue(self, classifier):
        """Test color feature extraction for blue region."""
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        # Use a more cyan-leaning blue that clearly maps to "blue" bucket
        image[:, :] = [200, 100, 0]  # BGR: B=200, G=100, R=0

        features = classifier._extract_color_features(image)

        assert features["color_valid"] is True
        # Blue/cyan range in our 12-bucket system
        assert features["dominant_color"] in ["blue", "cyan", "purple"]

    def test_color_features_empty_image(self, classifier):
        """Test color feature extraction with empty image."""
        image = np.zeros((0, 0, 3), dtype=np.uint8)
        features = classifier._extract_color_features(image)

        assert features.get("color_valid", False) is False
