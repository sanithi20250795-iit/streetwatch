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
    pothole = "pothole"
    broken_streetlight = "broken_streetlight"
    flooding = "flooding"
    damaged_sidewalk = "damaged_sidewalk"
    fallen_tree = "fallen_tree"
    other = "other"


class HazardStatus(str, Enum):
    reported = "reported"
    in_progress = "in_progress"
    resolved = "resolved"


class HazardReportBase(SQLModel):
    hazard_type: HazardType
    description: str = Field(min_length=5, max_length=500)
    latitude: float
    longitude: float
    reporter_name: Optional[str] = Field(default=None, max_length=100)


class HazardReport(HazardReportBase, table=True):
    """The actual DB table. Extra fields beyond what a client submits."""
    id: Optional[int] = Field(default=None, primary_key=True)
    status: HazardStatus = Field(default=HazardStatus.reported)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HazardReportCreate(HazardReportBase):
    """Shape of the JSON body clients send when creating a report."""
    pass


class HazardReportStatusUpdate(SQLModel):
    """Shape of the JSON body clients send when updating status."""
    status: HazardStatus
