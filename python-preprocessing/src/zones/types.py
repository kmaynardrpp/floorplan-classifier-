"""
Zone type definitions and properties.

Task 6.1: Define Additional Zone Types
"""

from enum import Enum
from dataclasses import dataclass
from typing import Dict, Any, Optional, List, Tuple


class ZoneType(Enum):
    """
    Comprehensive zone types for warehouse/floorplan analysis.

    Categories:
    - TRAVEL: Zones where movement is expected
    - STORAGE: Zones for storing goods
    - OPERATIONS: Zones for specific operations
    - INFRASTRUCTURE: Building infrastructure
    """
    # Travel zones
    TRAVEL_LANE = "travel_lane"  # Main corridors
    AISLE_PATH = "aisle_path"  # Paths between racking
    CROSS_AISLE = "cross_aisle"  # Intersections/cross paths

    # Storage zones
    RACKING_AREA = "racking_area"  # Container for racking
    RACKING = "racking"  # Actual racking units
    BULK_STORAGE = "bulk_storage"  # Floor-level bulk storage
    PALLET_POSITION = "pallet_position"  # Individual pallet spots

    # Operations zones
    STAGING_AREA = "staging_area"  # Temporary staging/sorting
    RECEIVING = "receiving"  # Incoming goods area
    SHIPPING = "shipping"  # Outgoing goods area
    DOCKING_AREA = "docking_area"  # Loading docks
    CONVEYOR_AREA = "conveyor_area"  # Conveyor systems
    PICKING_STATION = "picking_station"  # Order picking

    # Infrastructure
    PARKING_LOT = "parking_lot"  # Vehicle/equipment parking
    CHARGING_STATION = "charging_station"  # Equipment charging
    ADMINISTRATIVE = "administrative"  # Office areas
    RESTROOM = "restroom"  # Facilities
    MECHANICAL = "mechanical"  # HVAC, electrical
    STORAGE_FLOOR = "storage_floor"  # General storage

    # Special
    OBSTACLE = "obstacle"  # Fixed obstacles (columns, etc.)
    RESTRICTED = "restricted"  # Restricted access areas
    UNKNOWN = "unknown"  # Unclassified

    @classmethod
    def from_string(cls, value: str) -> "ZoneType":
        """Get ZoneType from string value."""
        value = value.lower().replace("-", "_").replace(" ", "_")
        for zone_type in cls:
            if zone_type.value == value:
                return zone_type
        return cls.UNKNOWN


@dataclass
class ZoneProperties:
    """
    Properties associated with a zone type.

    Attributes:
        travelable: Whether robots/vehicles can traverse
        storage: Whether the zone is used for storage
        operational: Whether active operations occur
        typical_min_area: Minimum typical area in sq pixels
        typical_max_area: Maximum typical area in sq pixels
        expected_shapes: Common shapes (rectangle, irregular, etc.)
        common_colors: Common boundary colors in floorplans
    """
    travelable: bool
    storage: bool
    operational: bool
    typical_min_area: int = 1000
    typical_max_area: int = 1000000
    expected_shapes: Tuple[str, ...] = ("rectangle",)
    common_colors: Tuple[str, ...] = ()
    description: str = ""


# Zone property definitions
ZONE_PROPERTIES: Dict[ZoneType, ZoneProperties] = {
    # Travel zones - travelable
    ZoneType.TRAVEL_LANE: ZoneProperties(
        travelable=True,
        storage=False,
        operational=False,
        typical_min_area=5000,
        typical_max_area=500000,
        expected_shapes=("rectangle", "corridor"),
        common_colors=("blue", "green"),
        description="Main corridors for vehicle/foot traffic",
    ),
    ZoneType.AISLE_PATH: ZoneProperties(
        travelable=True,
        storage=False,
        operational=False,
        typical_min_area=2000,
        typical_max_area=100000,
        expected_shapes=("rectangle", "narrow"),
        common_colors=("blue", "green"),
        description="Paths between racking rows",
    ),
    ZoneType.CROSS_AISLE: ZoneProperties(
        travelable=True,
        storage=False,
        operational=False,
        typical_min_area=1000,
        typical_max_area=50000,
        expected_shapes=("rectangle", "square"),
        common_colors=("blue",),
        description="Intersection/cross paths",
    ),

    # Storage zones - not travelable
    ZoneType.RACKING_AREA: ZoneProperties(
        travelable=False,
        storage=True,
        operational=False,
        typical_min_area=10000,
        typical_max_area=1000000,
        expected_shapes=("rectangle",),
        common_colors=("orange", "yellow"),
        description="Container zone for racking + aisles",
    ),
    ZoneType.RACKING: ZoneProperties(
        travelable=False,
        storage=True,
        operational=False,
        typical_min_area=2000,
        typical_max_area=200000,
        expected_shapes=("rectangle",),
        common_colors=("orange", "red"),
        description="Physical shelving/racking units",
    ),
    ZoneType.BULK_STORAGE: ZoneProperties(
        travelable=False,
        storage=True,
        operational=False,
        typical_min_area=5000,
        typical_max_area=500000,
        expected_shapes=("rectangle", "irregular"),
        common_colors=("yellow",),
        description="Floor-level bulk storage areas",
    ),
    ZoneType.PALLET_POSITION: ZoneProperties(
        travelable=False,
        storage=True,
        operational=False,
        typical_min_area=500,
        typical_max_area=5000,
        expected_shapes=("rectangle", "square"),
        common_colors=(),
        description="Individual pallet storage spots",
    ),

    # Operations zones
    ZoneType.STAGING_AREA: ZoneProperties(
        travelable=True,  # Partially travelable
        storage=False,
        operational=True,
        typical_min_area=5000,
        typical_max_area=200000,
        expected_shapes=("rectangle", "irregular"),
        common_colors=("yellow", "orange"),
        description="Temporary staging/sorting areas",
    ),
    ZoneType.RECEIVING: ZoneProperties(
        travelable=True,
        storage=False,
        operational=True,
        typical_min_area=10000,
        typical_max_area=500000,
        expected_shapes=("rectangle",),
        common_colors=("green",),
        description="Incoming goods receiving area",
    ),
    ZoneType.SHIPPING: ZoneProperties(
        travelable=True,
        storage=False,
        operational=True,
        typical_min_area=10000,
        typical_max_area=500000,
        expected_shapes=("rectangle",),
        common_colors=("blue",),
        description="Outgoing goods shipping area",
    ),
    ZoneType.DOCKING_AREA: ZoneProperties(
        travelable=True,
        storage=False,
        operational=True,
        typical_min_area=5000,
        typical_max_area=100000,
        expected_shapes=("rectangle",),
        common_colors=("gray",),
        description="Loading dock areas",
    ),
    ZoneType.CONVEYOR_AREA: ZoneProperties(
        travelable=False,
        storage=False,
        operational=True,
        typical_min_area=2000,
        typical_max_area=200000,
        expected_shapes=("narrow", "corridor"),
        common_colors=("purple",),
        description="Conveyor system zones",
    ),
    ZoneType.PICKING_STATION: ZoneProperties(
        travelable=True,
        storage=False,
        operational=True,
        typical_min_area=2000,
        typical_max_area=50000,
        expected_shapes=("rectangle", "square"),
        common_colors=(),
        description="Order picking work stations",
    ),

    # Infrastructure
    ZoneType.PARKING_LOT: ZoneProperties(
        travelable=True,
        storage=False,
        operational=False,
        typical_min_area=5000,
        typical_max_area=500000,
        expected_shapes=("rectangle",),
        common_colors=("gray",),
        description="Vehicle/equipment parking areas",
    ),
    ZoneType.CHARGING_STATION: ZoneProperties(
        travelable=True,
        storage=False,
        operational=True,
        typical_min_area=1000,
        typical_max_area=20000,
        expected_shapes=("rectangle", "square"),
        common_colors=(),
        description="Equipment charging areas",
    ),
    ZoneType.ADMINISTRATIVE: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=5000,
        typical_max_area=200000,
        expected_shapes=("rectangle",),
        common_colors=(),
        description="Office/administrative areas",
    ),
    ZoneType.RESTROOM: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=1000,
        typical_max_area=20000,
        expected_shapes=("rectangle",),
        common_colors=(),
        description="Restroom facilities",
    ),
    ZoneType.MECHANICAL: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=1000,
        typical_max_area=50000,
        expected_shapes=("rectangle",),
        common_colors=(),
        description="Mechanical/electrical rooms",
    ),
    ZoneType.STORAGE_FLOOR: ZoneProperties(
        travelable=False,
        storage=True,
        operational=False,
        typical_min_area=5000,
        typical_max_area=1000000,
        expected_shapes=("rectangle", "irregular"),
        common_colors=(),
        description="General floor storage",
    ),

    # Special
    ZoneType.OBSTACLE: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=100,
        typical_max_area=10000,
        expected_shapes=("square", "circle", "irregular"),
        common_colors=("black", "red"),
        description="Fixed obstacles (columns, pillars)",
    ),
    ZoneType.RESTRICTED: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=1000,
        typical_max_area=100000,
        expected_shapes=("rectangle", "irregular"),
        common_colors=("red",),
        description="Restricted access areas",
    ),
    ZoneType.UNKNOWN: ZoneProperties(
        travelable=False,
        storage=False,
        operational=False,
        typical_min_area=0,
        typical_max_area=10000000,
        expected_shapes=("any",),
        common_colors=(),
        description="Unclassified zone",
    ),
}


def is_travelable(zone_type: ZoneType) -> bool:
    """Check if a zone type is travelable."""
    return ZONE_PROPERTIES.get(zone_type, ZONE_PROPERTIES[ZoneType.UNKNOWN]).travelable


def is_storage(zone_type: ZoneType) -> bool:
    """Check if a zone type is for storage."""
    return ZONE_PROPERTIES.get(zone_type, ZONE_PROPERTIES[ZoneType.UNKNOWN]).storage


def is_operational(zone_type: ZoneType) -> bool:
    """Check if a zone type is operational."""
    return ZONE_PROPERTIES.get(zone_type, ZONE_PROPERTIES[ZoneType.UNKNOWN]).operational
