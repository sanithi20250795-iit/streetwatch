"""
Routes for hazard reports.

Three endpoints, matching the three "meaningful interactions" the project
brief asks for:
  - POST   /api/reports         -> create a report (the main form submission)
  - GET    /api/reports         -> list all reports (feeds the map)
  - PATCH  /api/reports/{id}    -> update a report's status (second interaction)
"""
import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models.hazard import (
    HazardReport,
    HazardReportStatusUpdate,
    HazardStatus,
    HazardType,
    Severity,
)
from app.models.user import User

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Uploaded photos/videos are saved inside frontend/static/uploads, which
# main.py already mounts at /static — so a saved file is reachable at
# /static/uploads/<filename> with no extra mounting needed.
UPLOAD_DIR = "frontend/static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm"}
MAX_MEDIA_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("", response_model=HazardReport, status_code=201)
async def create_report(
    hazard_type: HazardType = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    location_address: Optional[str] = Form(None),
    severity: Severity = Form(Severity.medium),
    occurred_at: Optional[datetime] = Form(None),
    contact_info: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new hazard report. Requires login. Uses multipart/form-data
    (not JSON) because it accepts an optional photo/video file alongside
    the text fields."""

    media_url = None
    if photo is not None and photo.filename:
        ext = os.path.splitext(photo.filename)[1].lower()
        if ext not in ALLOWED_MEDIA_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

        contents = await photo.read()
        if len(contents) > MAX_MEDIA_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 15MB)")

        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(contents)
        media_url = f"/static/uploads/{filename}"

    report = HazardReport(
        hazard_type=hazard_type,
        title=title,
        description=description,
        latitude=latitude,
        longitude=longitude,
        location_address=location_address,
        severity=severity,
        occurred_at=occurred_at,
        contact_info=contact_info,
        reporter_name=current_user.name,
        media_url=media_url,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return report


@router.get("", response_model=List[HazardReport])
def list_reports(
    status: Optional[HazardStatus] = Query(default=None, description="Filter by status"),
    limit: Optional[int] = Query(default=None, description="Max number of reports to return"),
    session: Session = Depends(get_session),
):
    """List all reports, optionally filtered by status and capped with a
    limit. Powers the map view and, with a small limit, the homepage's
    'Recent reports' section."""
    statement = select(HazardReport)
    if status:
        statement = statement.where(HazardReport.status == status)
    statement = statement.order_by(HazardReport.created_at.desc())
    if limit:
        statement = statement.limit(limit)
    return session.exec(statement).all()


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)):
    """Aggregate counts for the homepage stats bar and category grid.

    IMPORTANT: this route must be declared BEFORE '/{report_id}' below —
    FastAPI matches routes in order, and '/stats' would otherwise be
    swallowed by '/{report_id}' (which would then fail trying to parse
    "stats" as an int).
    """
    reports = session.exec(select(HazardReport)).all()

    by_type: dict[str, int] = {}
    for r in reports:
        by_type[r.hazard_type] = by_type.get(r.hazard_type, 0) + 1

    return {
        "total": len(reports),
        "reported": sum(1 for r in reports if r.status == "reported"),
        "in_progress": sum(1 for r in reports if r.status == "in_progress"),
        "resolved": sum(1 for r in reports if r.status == "resolved"),
        "by_type": by_type,
    }


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
