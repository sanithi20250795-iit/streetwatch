"""
Community participation: confirming a hazard (or, once resolved, confirming
it was actually fixed) and leaving comments on a report.

Confirmations use the SAME mechanic for both directions — what changes is
just the label shown in the UI, based on the report's current status. One
person can only confirm a given report once (enforced by the unique
constraint below), and confirming again toggles it off.
"""
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field


class ReportConfirmation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="hazardreport.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReportCommentBase(SQLModel):
    comment: str = Field(min_length=1, max_length=500)


class ReportComment(ReportCommentBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="hazardreport.id", index=True)
    user_id: int = Field(foreign_key="user.id")
    commenter_name: str = Field(max_length=100)  # denormalized so we don't join on every read
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReportCommentCreate(ReportCommentBase):
    """Shape of the JSON body clients send when posting a comment."""
    pass