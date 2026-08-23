"""
Routes for hazard reports.

Three endpoints, matching the three "meaningful interactions" the project
brief asks for:
  - POST   /api/reports         -> create a report (the main form submission)
  - GET    /api/reports         -> list all reports (feeds the map)
  - PATCH  /api/reports/{id}    -> update a report's status (second interaction)
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models.hazard import (
    HazardReport,
    HazardReportCreate,
    HazardReportStatusUpdate,
    HazardStatus,
)
from app.models.user import User

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=HazardReport, status_code=201)
def create_report(
    report_in: HazardReportCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new hazard report. Requires login — this is the
    form-submission interaction, and the reporter's name is taken from
    their account rather than trusted from the client."""
    report = HazardReport.model_validate(report_in)
    report.reporter_name = current_user.name
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


@router.get("", response_model=List[HazardReport])
def list_reports(
    status: Optional[HazardStatus] = Query(default=None, description="Filter by status"),
    session: Session = Depends(get_session),
):
    """List all reports, optionally filtered by status. Powers the map view."""
    statement = select(HazardReport)
    if status:
        statement = statement.where(HazardReport.status == status)
    statement = statement.order_by(HazardReport.created_at.desc())
    return session.exec(statement).all()


@router.get("/{report_id}", response_model=HazardReport)
def get_report(report_id: int, session: Session = Depends(get_session)):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


@router.patch("/{report_id}", response_model=HazardReport)
def update_report_status(
    report_id: int,
    update: HazardReportStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a report's status. Requires login. This is the second
    meaningful interaction."""
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = update.status
    report.updated_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: int, session: Session = Depends(get_session)):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    session.delete(report)
    session.commit()
