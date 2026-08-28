"""
Logs every status transition a report goes through, with a timestamp.

This is what powers the "track your report" timeline — without a separate
history table we'd only ever know the CURRENT status, not when each stage
was reached. One row is written here every time a report is created
(status=reported) or its status changes.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field

from app.models.hazard import HazardStatus


class StatusHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="hazardreport.id", index=True)
    status: HazardStatus
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))