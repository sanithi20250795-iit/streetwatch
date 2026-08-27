"""
Feedback the report's owner leaves once it's marked resolved — e.g. "was
it actually fixed?" A closes-the-loop feature: only the person who filed
the report can leave feedback, and only after resolution.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


class ReportFeedbackBase(SQLModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


class ReportFeedback(ReportFeedbackBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="hazardreport.id", unique=True, index=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReportFeedbackCreate(ReportFeedbackBase):
    """Shape of the JSON body clients send when submitting feedback."""
    pass