"""
Routes for hazard reports.

Three endpoints, matching the three "meaningful interactions" the project
brief asks for:
  - POST   /api/reports         -> create a report (the main form submission)
  - GET    /api/reports         -> list all reports (feeds the map)
  - PATCH  /api/reports/{id}    -> update a report's status (second interaction)

AI hooks (new): after an optional photo is saved, we call the image
classifier and the severity estimator and store their output on the
report as ai_hazard_type / ai_confidence / ai_suggested_severity. Both
calls are wrapped so a failure (or no API key configured) never blocks
report creation — they're enrichment, not a dependency.
"""
import os
import shutil
import uuid
from app.models.status_history import StatusHistory
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models.feedback import ReportFeedback, ReportFeedbackCreate
from app.models.hazard import (
    HazardReport,
    HazardReportEdit,
    HazardReportStatusUpdate,
    HazardStatus,
    HazardType,
    Severity,
)
from app.models.user import User
from app.services import ai_service

router = APIRouter(prefix="/api/reports", tags=["reports"])


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
    saved_filepath = None
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
        saved_filepath = filepath

    # --- AI enrichment (never raises — see ai_service docstrings) ---
    ai_hazard_type = None
    ai_confidence = None
    if saved_filepath is not None:
        classification = ai_service.classify_hazard_image(saved_filepath)
        if classification:
            ai_hazard_type = classification.get("hazard_type")
            ai_confidence = classification.get("confidence")

    ai_suggested_severity = ai_service.estimate_severity(description, saved_filepath).value

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
        reporter_id=current_user.id,
        reporter_name=current_user.name,
        media_url=media_url,
        ai_hazard_type=ai_hazard_type,
        ai_confidence=ai_confidence,
        ai_suggested_severity=ai_suggested_severity,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
        # Log the first stage of the lifecycle so the track-by-ID page has a
    # starting point even before any status change happens.
    session.add(StatusHistory(report_id=report.id, status=HazardStatus.reported, changed_at=report.created_at))
    session.commit()
    # committing above expires `report`'s attributes (SQLAlchemy's default
    # expire_on_commit) — refresh it again so the response actually has data.
    session.refresh(report)
    return report


@router.get("", response_model=List[HazardReport])
def list_reports(
    status: Optional[HazardStatus] = Query(default=None, description="Filter by status"),
    hazard_type: Optional[HazardType] = Query(default=None, description="Filter by hazard category"),
    severity: Optional[Severity] = Query(default=None, description="Filter by severity"),
    date_from: Optional[date] = Query(default=None, description="Only reports created on/after this date"),
    date_to: Optional[date] = Query(default=None, description="Only reports created on/before this date"),
    location: Optional[str] = Query(default=None, description="Case-insensitive search within the location/address text"),
    unresolved: bool = Query(default=False, description="Only reports not yet resolved (excludes rejected too)"),
    limit: Optional[int] = Query(default=None, description="Max number of reports to return"),
    session: Session = Depends(get_session),
):
    """List all reports, with optional filters and a limit. Powers the map
    view (with all filters) and, with a small limit, the homepage's
    'Recent reports' section."""
    statement = select(HazardReport)
    if status:
        statement = statement.where(HazardReport.status == status)
    if hazard_type:
        statement = statement.where(HazardReport.hazard_type == hazard_type)
    if severity:
        statement = statement.where(HazardReport.severity == severity)
    if date_from:
        statement = statement.where(HazardReport.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        statement = statement.where(HazardReport.created_at <= datetime.combine(date_to, datetime.max.time()))
    if location:
        statement = statement.where(HazardReport.location_address.ilike(f"%{location}%"))
    statement = statement.order_by(HazardReport.created_at.desc())
    if limit:
        statement = statement.limit(limit)
    if unresolved:
        statement = statement.where(HazardReport.status.notin_([HazardStatus.resolved, HazardStatus.rejected]))

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
        "verified": sum(1 for r in reports if r.status == "verified"),
    }

@router.get("/mine", response_model=List[HazardReport])
def list_my_reports(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """The logged-in user's own reports, for the 'My Reports' dashboard.

    IMPORTANT: like '/stats', this must be declared BEFORE '/{report_id}' —
    otherwise FastAPI tries to parse 'mine' as the int report_id and fails.
    """
    statement = (
        select(HazardReport)
        .where(HazardReport.reporter_id == current_user.id)
        .order_by(HazardReport.created_at.desc())
    )
    return session.exec(statement).all()


@router.get("/{report_id}", response_model=HazardReport)
def get_report(report_id: int, session: Session = Depends(get_session)):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

@router.get("/{report_id}/history", response_model=List[StatusHistory])
def get_report_history(report_id: int, session: Session = Depends(get_session)):
    """The dated timeline for the track-by-ID page. Public — no login
    required, since anyone with a Report ID should be able to check on it."""
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    statement = (
        select(StatusHistory)
        .where(StatusHistory.report_id == report_id)
        .order_by(StatusHistory.changed_at)
    )
    return session.exec(statement).all()


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
        # Log this transition so it shows up on the track-by-ID timeline.
    session.add(StatusHistory(report_id=report.id, status=update.status))
    report.updated_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    session.refresh(report)
    return report

@router.put("/{report_id}/edit", response_model=HazardReport)
def edit_report(
    report_id: int,
    edit: HazardReportEdit,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Let the report's owner correct details — only while it's still in
    the 'reported' stage."""
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own reports")
    if report.status != HazardStatus.reported:
        raise HTTPException(status_code=400, detail="This report can no longer be edited — it's already been verified")

    update_data = edit.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(report, field, value)
    report.updated_at = datetime.now(timezone.utc)

    session.add(report)
    session.commit()
    session.refresh(report)
    return report


@router.post("/{report_id}/feedback", response_model=ReportFeedback, status_code=201)
def submit_feedback(
    report_id: int,
    feedback_in: ReportFeedbackCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Let the report's owner rate how the resolution went — only once,
    and only after the report is actually resolved."""
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.reporter_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only leave feedback on your own reports")
    if report.status != HazardStatus.resolved:
        raise HTTPException(status_code=400, detail="Feedback can only be left once a report is resolved")

    existing = session.exec(
        select(ReportFeedback).where(ReportFeedback.report_id == report_id)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Feedback has already been submitted for this report")

    feedback = ReportFeedback(
        report_id=report_id,
        user_id=current_user.id,
        rating=feedback_in.rating,
        comment=feedback_in.comment,
    )
    session.add(feedback)
    session.commit()
    session.refresh(feedback)
    return feedback


@router.get("/{report_id}/feedback", response_model=Optional[ReportFeedback])
def get_feedback(report_id: int, session: Session = Depends(get_session)):
    """Public — shown once feedback exists."""
    return session.exec(
        select(ReportFeedback).where(ReportFeedback.report_id == report_id)
    ).first()

@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: int, session: Session = Depends(get_session)):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    session.delete(report)
    session.commit()
