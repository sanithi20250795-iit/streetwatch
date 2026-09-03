"""
Routes for community participation on a report:

  - POST   /api/reports/{id}/confirm       -> toggle confirming this report
  - GET    /api/reports/{id}/confirmations -> count + whether the current viewer already confirmed
  - GET    /api/reports/{id}/comments      -> list comments (public)
  - POST   /api/reports/{id}/comments      -> add a comment (requires login)

Confirmation doubles as both "I can confirm this hazard is still there"
(while unresolved) and "I can confirm this was actually fixed" (once
resolved) — the frontend just changes the label based on report.status.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth import get_current_user, get_current_user_optional
from app.database import get_session
from app.models.community import (
    ReportComment,
    ReportCommentCreate,
    ReportConfirmation,
)
from app.models.hazard import HazardReport
from app.models.user import User

router = APIRouter(prefix="/api/reports", tags=["community"])


def _reliability_from_count(count: int) -> dict:
    """Turn a confirmation count into a simple, explainable reliability
    label. Deliberately NOT a model or a weighted formula — just bucketed
    thresholds, so it's easy to justify in a write-up: more independent
    citizens confirming a hazard is still there makes it more likely to be
    real and current, nothing fancier than that."""
    if count == 0:
        return {"reliability_label": "Unverified", "reliability_score": 0}
    if count <= 2:
        return {"reliability_label": "Some confirmation", "reliability_score": 40}
    if count <= 5:
        return {"reliability_label": "Well confirmed", "reliability_score": 70}
    return {"reliability_label": "Highly reliable", "reliability_score": 100}


@router.post("/{report_id}/confirm")
def toggle_confirmation(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    existing = session.exec(
        select(ReportConfirmation).where(
            ReportConfirmation.report_id == report_id,
            ReportConfirmation.user_id == current_user.id,
        )
    ).first()

    if existing:
        session.delete(existing)
        session.commit()
        confirmed = False
    else:
        session.add(ReportConfirmation(report_id=report_id, user_id=current_user.id))
        session.commit()
        confirmed = True

    count = session.exec(
        select(ReportConfirmation).where(ReportConfirmation.report_id == report_id)
    ).all()
    return {"confirmed": confirmed, "count": len(count), **_reliability_from_count(len(count))}


@router.get("/{report_id}/confirmations")
def get_confirmations(
    report_id: int,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Public — anyone can see the count. Only tells you whether YOU
    already confirmed if you're logged in."""
    confirmations = session.exec(
        select(ReportConfirmation).where(ReportConfirmation.report_id == report_id)
    ).all()

    user_confirmed = False
    if current_user:
        user_confirmed = any(c.user_id == current_user.id for c in confirmations)

    return {
        "count": len(confirmations),
        "user_confirmed": user_confirmed,
        **_reliability_from_count(len(confirmations)),
    }


@router.get("/{report_id}/comments", response_model=List[ReportComment])
def list_comments(report_id: int, session: Session = Depends(get_session)):
    """Public — no login required to read."""
    statement = (
        select(ReportComment)
        .where(ReportComment.report_id == report_id)
        .order_by(ReportComment.created_at)
    )
    return session.exec(statement).all()


@router.post("/{report_id}/comments", response_model=ReportComment, status_code=201)
def add_comment(
    report_id: int,
    comment_in: ReportCommentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    report = session.get(HazardReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    comment = ReportComment(
        report_id=report_id,
        user_id=current_user.id,
        commenter_name=current_user.name,
        comment=comment_in.comment,
    )
    session.add(comment)
    session.commit()
    session.refresh(comment)
    return comment