"""
AI/analytics endpoints:
  - GET /api/analytics/check-duplicate  -> pre-flight duplicate check the
                                            frontend calls BEFORE submitting
                                            a new report
  - GET /api/analytics/risk-areas       -> predictive "risk hotspot" grid,
                                            optionally filtered by hazard_type

Kept separate from reports.py since these are read-only, analysis-style
endpoints rather than core report CRUD.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from app.database import get_session
from app.models.hazard import HazardType
from app.services import ai_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/check-duplicate")
def check_duplicate(
    hazard_type: HazardType,
    latitude: float,
    longitude: float,
    session: Session = Depends(get_session),
):
    """Call this from the report form BEFORE submitting. If
    `possible_duplicate` is true, show the user the existing report(s) and
    let them confirm one of those instead of filing a new one — this is
    what turns '10 separate pothole reports' into one grouped issue."""
    matches = ai_service.find_possible_duplicates(session, hazard_type, latitude, longitude)
    return {
        "possible_duplicate": len(matches) > 0,
        "matches": [
            {
                "id": m.id,
                "title": m.title,
                "status": m.status,
                "created_at": m.created_at,
            }
            for m in matches
        ],
    }


@router.get("/risk-areas")
def get_risk_areas(
    hazard_type: Optional[HazardType] = Query(
        default=None, description="Restrict to one hazard category, e.g. flooding"
    ),
    lookback_days: int = Query(default=365, ge=1, le=3650),
    session: Session = Depends(get_session),
):
    """Coarse grid of historical report frequency, recency-weighted.
    Feed this to the map as a heatmap/marker layer for 'areas prone to X' —
    the predictive-analytics feature from the brief."""
    return ai_service.compute_area_risk(session, hazard_type=hazard_type, lookback_days=lookback_days)
