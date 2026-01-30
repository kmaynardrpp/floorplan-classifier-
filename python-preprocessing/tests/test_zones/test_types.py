"""Tests for zone types."""

import pytest

from src.zones.types import (
    ZoneType,
    ZoneProperties,
    ZONE_PROPERTIES,
    is_travelable,
    is_storage,
    is_operational,
)


class TestZoneType:
    """Tests for ZoneType enum."""

    def test_zone_type_values(self):
        """Test zone types have correct string values."""
        assert ZoneType.TRAVEL_LANE.value == "travel_lane"
        assert ZoneType.RACKING.value == "racking"
        assert ZoneType.STAGING_AREA.value == "staging_area"

    def test_from_string_exact_match(self):
        """Test from_string with exact match."""
        assert ZoneType.from_string("travel_lane") == ZoneType.TRAVEL_LANE
        assert ZoneType.from_string("racking") == ZoneType.RACKING

    def test_from_string_with_dashes(self):
        """Test from_string with dashes instead of underscores."""
        assert ZoneType.from_string("travel-lane") == ZoneType.TRAVEL_LANE
        assert ZoneType.from_string("staging-area") == ZoneType.STAGING_AREA

    def test_from_string_case_insensitive(self):
        """Test from_string is case insensitive."""
        assert ZoneType.from_string("TRAVEL_LANE") == ZoneType.TRAVEL_LANE
        assert ZoneType.from_string("Racking") == ZoneType.RACKING

    def test_from_string_unknown(self):
        """Test from_string returns UNKNOWN for invalid values."""
        assert ZoneType.from_string("invalid") == ZoneType.UNKNOWN
        assert ZoneType.from_string("") == ZoneType.UNKNOWN

    def test_all_zone_types_have_properties(self):
        """Test all zone types have defined properties."""
        for zone_type in ZoneType:
            assert zone_type in ZONE_PROPERTIES


class TestZoneProperties:
    """Tests for ZoneProperties dataclass."""

    def test_create_properties(self):
        """Test creating zone properties."""
        props = ZoneProperties(
            travelable=True,
            storage=False,
            operational=True,
            typical_min_area=1000,
            typical_max_area=100000,
        )
        assert props.travelable is True
        assert props.storage is False
        assert props.operational is True

    def test_default_values(self):
        """Test default values."""
        props = ZoneProperties(
            travelable=True,
            storage=False,
            operational=False,
        )
        assert props.typical_min_area == 1000
        assert props.typical_max_area == 1000000
        assert props.expected_shapes == ("rectangle",)


class TestZonePropertiesLookup:
    """Tests for ZONE_PROPERTIES dictionary."""

    def test_travel_lane_is_travelable(self):
        """Test travel lane properties."""
        props = ZONE_PROPERTIES[ZoneType.TRAVEL_LANE]
        assert props.travelable is True
        assert props.storage is False

    def test_racking_is_storage(self):
        """Test racking properties."""
        props = ZONE_PROPERTIES[ZoneType.RACKING]
        assert props.travelable is False
        assert props.storage is True

    def test_staging_is_operational(self):
        """Test staging area properties."""
        props = ZONE_PROPERTIES[ZoneType.STAGING_AREA]
        assert props.operational is True

    def test_obstacle_not_travelable(self):
        """Test obstacle properties."""
        props = ZONE_PROPERTIES[ZoneType.OBSTACLE]
        assert props.travelable is False
        assert props.storage is False


class TestHelperFunctions:
    """Tests for helper functions."""

    def test_is_travelable(self):
        """Test is_travelable function."""
        assert is_travelable(ZoneType.TRAVEL_LANE) is True
        assert is_travelable(ZoneType.AISLE_PATH) is True
        assert is_travelable(ZoneType.RACKING) is False
        assert is_travelable(ZoneType.OBSTACLE) is False

    def test_is_storage(self):
        """Test is_storage function."""
        assert is_storage(ZoneType.RACKING) is True
        assert is_storage(ZoneType.BULK_STORAGE) is True
        assert is_storage(ZoneType.TRAVEL_LANE) is False
        assert is_storage(ZoneType.ADMINISTRATIVE) is False

    def test_is_operational(self):
        """Test is_operational function."""
        assert is_operational(ZoneType.STAGING_AREA) is True
        assert is_operational(ZoneType.RECEIVING) is True
        assert is_operational(ZoneType.SHIPPING) is True
        assert is_operational(ZoneType.RACKING) is False
