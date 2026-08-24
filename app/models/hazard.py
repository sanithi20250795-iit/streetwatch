"""
The HazardReport model.

This is a SQLModel class, which means it is BOTH:
  1. A SQLAlchemy table definition (so it maps directly to the database), and
  2. A Pydantic model (so FastAPI can validate incoming request bodies with it)

That dual purpose is exactly why SQLModel is convenient for a small project
like this — you don't write your DB schema and your API schema twice.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field

class HazardType(str, Enum):
    broken_streetlight = "broken_streetlight"
    damaged_road = "damaged_road"
    flooding = "flooding"
    pothole = "pothole"
    broken_traffic_signal = "broken_traffic_signal"
    illegal_dumping = "illegal_dumping"
    water_leakage = "water_leakage"
    unsafe_infrastructure = "unsafe_infrastructure"
    fallen_tree = "fallen_tree"
    electrical_hazard = "electrical_hazard"
    other = "other"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class HazardStatus(str, Enum):
    reported = "reported"
    in_progress = "in_progress"
    resolved = "resolved"


class HazardReportBase(SQLModel):
    hazard_type: HazardType
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=5, max_length=500)
    location_address: Optional[str] = Field(default=None, max_length=255)
    latitude: float
    longitude: float
    severity: Severity = Field(default=Severity.medium)
    occurred_at: Optional[datetime] = Field(default=None)
    contact_info: Optional[str] = Field(default=None, max_length=150)
    reporter_name: Optional[str] = Field(default=None, max_length=100)


class HazardReport(HazardReportBase, table=True):
    """The actual DB table. Extra fields beyond what a client submits."""
    id: Optional[int] = Field(default=None, primary_key=True)
    status: HazardStatus = Field(default=HazardStatus.reported)
    media_url: Optional[str] = Field(default=None)  # path to uploaded photo/video
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HazardReportStatusUpdate(SQLModel):
    """Shape of the JSON body clients send when updating status."""
    status: HazardStatus
