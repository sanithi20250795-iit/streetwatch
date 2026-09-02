"""
Routes for the authority/admin dashboard. Every route here requires
get_current_admin — a regular citizen account gets a 403, not just a
hidden UI element, so this is enforced server-side, not just by hiding
the "Admin" nav link.

  - GET   /api/admin/reports          -> all reports, with admin-only filter presets
  - PATCH /api/admin/reports/{id}     -> verify/reject/change status/severity,
                                          assign a department, add notes,
                                          upload resolution evidence
  - GET   /api/admin/analytics        -> aggregate stats for the Analytics tab
  - GET   /api/admin/users            -> list registered users
  - PATCH /api/admin/users/{id}       -> activate/deactivate an account
"""
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlmodel import Session, select

from app.auth import get_current_admin
from app.database import get_session
from app.models.hazard import HazardReport, HazardStatus, HazardType, Severity
from app.models.status_history import StatusHistory
from app.models.user import AdminUserUpdate, User, UserRead

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Reuses the same upload directory as citizen report photos — main.py's
# /static mount already covers this, so no extra mounting needed here.
UPLOAD_DIR = "frontend/static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov", ".webm"}
MAX_MEDIA_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB


@router.get("/reports", response_model=List[HazardReport])
def admin_list_reports(
    status: Optional[HazardStatus] = Query(default=None),
    hazard_type: Optional[HazardType] = Query(default=None),
    severity: Optional[Severity] = Query(default=None),
    unresolved: Optional[bool] = Query(default=None, description="Only reports not yet resolved or rejected"),
    high_priority: Optional[bool] = Query(default=None, description="Only high/critical severity"),
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """Powers the 'All / New / High-priority / Unresolved / Resolved'
    preset views on the admin dashboard."""
    statement = select(HazardReport)
    if status:
        statement = statement.where(HazardReport.status == status)
    if hazard_type:
        statement = statement.where(HazardReport.hazard_type == hazard_type)
    if severity:
        statement = statement.where(HazardReport.severity == severity)
    if unresolved:
        statement = statement.where(
            HazardReport.status.not_in([HazardStatus.resolved, HazardStatus.rejected])
        )
    if high_priority:
        statement = statement.where(HazardReport.severity.in_([Severity.high, Severity.critical]))
    statement = statement.order_by(HazardReport.created_at.desc())
    return session.exec(statement).all()


@router.patch("/reports/{report_id}", response_model=HazardReport)
async def admin_update_report(
    report_id: int,
    status: Optional[HazardStatus] = Form(None),
    severity: Optional[Severity] = Form(None),
    assigned_department: Optional[str] = Form(None),
    admin_notes: Optional[str] = Form(None),
    resolution_photo: Optional[UploadFile] = File(None),
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """The authority's main tool: verify/reject (via status), reprioritize,
    assign to a department, leave internal notes, and attach proof of
    resolution — all in one call. Every field is optional; send only what
    you're changing."""
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if resolution_photo is not None and resolution_photo.filename:
        ext = os.path.splitext(resolution_photo.filename)[1].lower()
        if ext not in ALLOWED_MEDIA_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        contents = await resolution_photo.read()
        if len(contents) > MAX_MEDIA_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 15MB)")
        filename = f"{uuid.uuid4().hex}{ext}"
        with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
            f.write(contents)
        report.resolution_media_url = f"/static/uploads/{filename}"

    status_changed = status is not None and status != report.status
    if status is not None:
        report.status = status
    if severity is not None:
        report.severity = severity
    if assigned_department is not None:
        report.assigned_department = assigned_department
    if admin_notes is not None:
        report.admin_notes = admin_notes

    report.updated_at = datetime.now(timezone.utc)
    session.add(report)

    if status_changed:
        session.add(StatusHistory(report_id=report.id, status=status))

    session.commit()
    session.refresh(report)
    return report


@router.get("/analytics")
def get_analytics(
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """Aggregate stats for the admin Analytics tab: volume trends, hazard
    mix, problem areas, resolution speed, and department performance."""
    reports = session.exec(select(HazardReport)).all()
    history = session.exec(select(StatusHistory)).all()

    total = len(reports)
    resolved_count = sum(1 for r in reports if r.status == HazardStatus.resolved)
    unresolved_count = sum(
        1 for r in reports if r.status not in (HazardStatus.resolved, HazardStatus.rejected)
    )

    per_month: dict[str, int] = {}
    for r in reports:
        key = r.created_at.strftime("%Y-%m")
        per_month[key] = per_month.get(key, 0) + 1
    reports_per_month = [{"month": k, "count": v} for k, v in sorted(per_month.items())]

    by_type: dict[str, int] = {}
    for r in reports:
        by_type[r.hazard_type] = by_type.get(r.hazard_type, 0) + 1
    most_common_hazard = max(by_type, key=by_type.get) if by_type else None

    by_severity: dict[str, int] = {}
    for r in reports:
        by_severity[r.severity] = by_severity.get(r.severity, 0) + 1

    by_area: dict[str, int] = {}
    for r in reports:
        if r.location_address:
            by_area[r.location_address] = by_area.get(r.location_address, 0) + 1
    top_areas = [
        {"area": area, "count": count}
        for area, count in sorted(by_area.items(), key=lambda kv: kv[1], reverse=True)[:5]
    ]

    history_by_report: dict[int, dict[str, datetime]] = {}
    for h in history:
        history_by_report.setdefault(h.report_id, {})
        if h.status not in history_by_report[h.report_id]:
            history_by_report[h.report_id][h.status] = h.changed_at

    resolution_hours = []
    for report_id, stages in history_by_report.items():
        if "reported" in stages and "resolved" in stages:
            delta = stages["resolved"] - stages["reported"]
            resolution_hours.append(delta.total_seconds() / 3600)
    avg_resolution_hours = round(sum(resolution_hours) / len(resolution_hours), 1) if resolution_hours else None

    dept_reports: dict[str, list] = {}
    for r in reports:
        if r.assigned_department:
            dept_reports.setdefault(r.assigned_department, []).append(r)

    department_performance = []
    for dept, dept_rs in dept_reports.items():
        dept_resolved = [r for r in dept_rs if r.status == HazardStatus.resolved]
        dept_hours = []
        for r in dept_resolved:
            stages = history_by_report.get(r.id, {})
            if "reported" in stages and "resolved" in stages:
                dept_hours.append((stages["resolved"] - stages["reported"]).total_seconds() / 3600)
        department_performance.append({
            "department": dept,
            "total_assigned": len(dept_rs),
            "resolved": len(dept_resolved),
            "avg_resolution_hours": round(sum(dept_hours) / len(dept_hours), 1) if dept_hours else None,
        })

    return {
        "total": total,
        "resolved_count": resolved_count,
        "unresolved_count": unresolved_count,
        "reports_per_month": reports_per_month,
        "most_common_hazard": most_common_hazard,
        "by_type": by_type,
        "by_severity": by_severity,
        "top_areas": top_areas,
        "avg_resolution_hours": avg_resolution_hours,
        "department_performance": department_performance,
    }


@router.get("/users", response_model=List[UserRead])
def admin_list_users(
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    statement = select(User).order_by(User.created_at.desc())
    return session.exec(statement).all()


@router.patch("/users/{user_id}", response_model=UserRead)
def admin_update_user(
    user_id: int,
    update: AdminUserUpdate,
    session: Session = Depends(get_session),
    current_admin: User = Depends(get_current_admin),
):
    """Activate or deactivate an account. A deactivated user is logged out
    everywhere immediately — get_current_user re-checks is_active on every
    request, not just at login."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_admin.id and not update.is_active:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account")

    user.is_active = update.is_active
    session.add(user)
    session.commit()
    session.refresh(user)
    return user