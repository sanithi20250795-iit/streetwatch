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
    verified = "verified"
    in_progress = "in_progress"
    resolved = "resolved"
    rejected = "rejected"


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
    reporter_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    status: HazardStatus = Field(default=HazardStatus.reported)
    media_url: Optional[str] = Field(default=None)  # path to uploaded photo/video
    assigned_department: Optional[str] = Field(default=None, max_length=100)
    admin_notes: Optional[str] = Field(default=None, max_length=1000)
    resolution_media_url: Optional[str] = Field(default=None)  # photo/video proof of fix
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # --- AI-feature fields (all optional/nullable — never block report
    # creation if the AI call fails or isn't configured) ---
    ai_hazard_type: Optional[str] = Field(default=None)       # zero-shot classifier's guess
    ai_confidence: Optional[float] = Field(default=None)      # classifier's confidence, 0.0-1.0
    ai_suggested_severity: Optional[str] = Field(default=None)  # text/image heuristic's suggestion


class HazardReportStatusUpdate(SQLModel):
    """Shape of the JSON body clients send when updating status."""
    status: HazardStatus

class HazardReportEdit(SQLModel):
    """Fields the report's owner can change, before it's been verified.
    Everything optional — the client only sends what changed."""
    hazard_type: Optional[HazardType] = None
    title: Optional[str] = Field(default=None, min_length=3, max_length=120)
    description: Optional[str] = Field(default=None, min_length=5, max_length=500)
    location_address: Optional[str] = Field(default=None, max_length=255)
    severity: Optional[Severity] = None
    occurred_at: Optional[datetime] = None
    contact_info: Optional[str] = Field(default=None, max_length=150)
