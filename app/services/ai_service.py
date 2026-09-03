"""
AI/data-science helpers for StreetWatch.

Four features live here, each picked to match what's actually feasible
without a large labeled dataset or GPU training pipeline:

1. Duplicate detection  -> geography + hazard type + recency (no ML at all)
2. Severity estimation   -> keyword scoring on the description, optionally
                             nudged by a crude image heuristic
3. Image classification  -> zero-shot call to a vision-capable Claude model
                             (falls back to "unavailable" if no API key is
                             configured, so the app still works without it)
4. Predictive analytics  -> recency-weighted report frequency per grid cell
                             ("this area has a history of flooding")

None of this pretends to be a trained, evaluated model — for a course
write-up, be upfront that (1) and (4) are frequency/geometry-based data
science, not ML, and (2)/(3) are heuristic and zero-shot respectively
rather than fine-tuned on labeled StreetWatch data.
"""
import base64
import json
import math
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlmodel import Session, select

from app.models.hazard import HazardReport, HazardStatus, HazardType, Severity

# ---------------------------------------------------------------------------
# 1. Duplicate detection
# ---------------------------------------------------------------------------

DUPLICATE_RADIUS_METERS = 50
DUPLICATE_TIME_WINDOW_HOURS = 72


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points, in metres."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def find_possible_duplicates(
    session: Session,
    hazard_type: HazardType,
    latitude: float,
    longitude: float,
    radius_m: float = DUPLICATE_RADIUS_METERS,
    time_window_hours: float = DUPLICATE_TIME_WINDOW_HOURS,
) -> List[HazardReport]:
    """Existing unresolved reports of the same hazard type, within
    `radius_m` metres and reported in the last `time_window_hours` hours.

    Deliberately simple: same type + close together + recent. This catches
    the common "10 people report the same pothole" case without needing
    any text-similarity model."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=time_window_hours)

    candidates = session.exec(
        select(HazardReport)
        .where(HazardReport.hazard_type == hazard_type)
        .where(HazardReport.status.notin_([HazardStatus.resolved, HazardStatus.rejected]))
        .where(HazardReport.created_at >= cutoff)
    ).all()

    return [
        report
        for report in candidates
        if haversine_distance_meters(latitude, longitude, report.latitude, report.longitude) <= radius_m
    ]


# ---------------------------------------------------------------------------
# 2. Severity estimation
# ---------------------------------------------------------------------------

SEVERITY_ORDER = [Severity.low, Severity.medium, Severity.high, Severity.critical]

SEVERITY_KEYWORDS = {
    Severity.critical: [
        "collapsed", "collapse", "exposed wire", "live wire", "explosion",
        "on fire", "fire", "gas leak", "sinkhole", "electrocut",
    ],
    Severity.high: [
        "blocking", "block the road", "deep hole", "large hole", "flooded",
        "flooding", "no power", "power outage", "fallen tree", "accident",
        "injured", "injury", "dangerous",
    ],
    Severity.medium: [
        "pothole", "crack", "leak", "damaged", "broken", "not working", "overflowing",
    ],
    Severity.low: [
        "small", "minor", "cosmetic", "faded", "slightly",
    ],
}


def estimate_severity_from_text(description: str) -> Severity:
    text = description.lower()
    for level in (Severity.critical, Severity.high, Severity.medium, Severity.low):
        if any(kw in text for kw in SEVERITY_KEYWORDS[level]):
            return level
    return Severity.medium


def _bump_severity(level: Severity, steps: int = 1) -> Severity:
    idx = min(SEVERITY_ORDER.index(level) + steps, len(SEVERITY_ORDER) - 1)
    return SEVERITY_ORDER[idx]


def _image_damage_ratio(image_path: str) -> float:
    """Very rough visual heuristic: fraction of the (grayscale, downsized)
    photo that is dark and low-detail — a cheap proxy for 'a big dark hole
    or damaged patch dominates the frame'. This is illustrative, not a
    substitute for a trained segmentation model, so keep it framed that
    way in any write-up."""
    try:
        from PIL import Image
        import numpy as np

        img = Image.open(image_path).convert("L").resize((128, 128))
        arr = np.array(img)
        return float((arr < 60).sum()) / arr.size
    except Exception:
        return 0.0


def estimate_severity(description: str, image_path: Optional[str] = None) -> Severity:
    """Combine text keyword scoring with an optional image nudge."""
    level = estimate_severity_from_text(description)
    if image_path and _image_damage_ratio(image_path) > 0.35:
        level = _bump_severity(level, 1)
    return level


# ---------------------------------------------------------------------------
# 3. Image classification (zero-shot, via a vision-capable Claude model)
# ---------------------------------------------------------------------------

CLASSIFICATION_MODEL = os.environ.get("STREETWATCH_VISION_MODEL", "claude-haiku-4-5-20251001")
HAZARD_LABELS = [t.value for t in HazardType]

try:
    import anthropic

    _client = anthropic.Anthropic() if os.environ.get("ANTHROPIC_API_KEY") else None
except ImportError:
    anthropic = None
    _client = None


def classify_hazard_image(image_path: str) -> Optional[dict]:
    """Ask a vision-capable Claude model to guess the hazard category and
    severity from the photo. Returns None (never raises) if no API key is
    configured or the call/parsing fails — callers should treat this as a
    nice-to-have enrichment, never a hard dependency for report creation.

    Why zero-shot instead of a trained classifier: without a labeled
    StreetWatch photo dataset, fine-tuning a CNN would just be overfitting
    to a handful of examples. A general vision-language model gives a
    reasonable guess out of the box, which is the honest trade-off to
    describe in a project write-up.
    """
    if _client is None:
        return None

    ext = os.path.splitext(image_path)[1].lower().lstrip(".")
    if ext not in {"jpg", "jpeg", "png", "gif", "webp"}:
        return None  # video files etc. aren't classifiable this way
    media_type = f"image/{'jpeg' if ext == 'jpg' else ext}"

    prompt = (
        "You are classifying a photo submitted to a civic hazard-reporting app. "
        f"Pick the single best-fitting category from this exact list: {HAZARD_LABELS}. "
        "Also estimate a severity from this list: [\"low\", \"medium\", \"high\", \"critical\"]. "
        "Respond with ONLY a JSON object and nothing else, in the form: "
        '{"hazard_type": "...", "confidence": 0.0, "severity": "..."}'
    )

    try:
        with open(image_path, "rb") as f:
            image_b64 = base64.standard_b64encode(f.read()).decode("utf-8")

        response = _client.messages.create(
            model=CLASSIFICATION_MODEL,
            max_tokens=200,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        text = response.content[0].text.strip()
        for fence in ("```json", "```"):
            if text.startswith(fence):
                text = text[len(fence):]
            if text.endswith("```"):
                text = text[: -len("```")]
        result = json.loads(text.strip())

        if result.get("hazard_type") not in HAZARD_LABELS:
            return None
        return result
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 4. Predictive analytics — recency-weighted frequency per grid cell
# ---------------------------------------------------------------------------

GRID_SIZE_DEGREES = 0.01  # ~1.1km near the equator; coarse on purpose for a demo


def _grid_cell(lat: float, lon: float) -> tuple:
    return (
        round(lat / GRID_SIZE_DEGREES) * GRID_SIZE_DEGREES,
        round(lon / GRID_SIZE_DEGREES) * GRID_SIZE_DEGREES,
    )


def compute_area_risk(
    session: Session,
    hazard_type: Optional[HazardType] = None,
    lookback_days: int = 365,
) -> List[dict]:
    """Bucket historical reports into coarse grid cells and score each cell
    by recency-weighted report count. Not a trained predictive model — a
    transparent, explainable first pass at "this area has a history of X",
    which is exactly the SDG 11 / Data Science story to tell."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    statement = select(HazardReport).where(HazardReport.created_at >= cutoff)
    if hazard_type:
        statement = statement.where(HazardReport.hazard_type == hazard_type)
    reports = session.exec(statement).all()

    now = datetime.now(timezone.utc)
    scores: dict = defaultdict(float)
    report_ids: dict = defaultdict(list)

    for r in reports:
        cell = _grid_cell(r.latitude, r.longitude)
        age_days = max((now - r.created_at).days, 0)
        recency_weight = max(0.2, 1 - age_days / lookback_days)
        scores[cell] += recency_weight
        report_ids[cell].append(r.id)

    results = []
    for (lat, lon), score in sorted(scores.items(), key=lambda kv: kv[1], reverse=True):
        results.append(
            {
                "latitude": lat,
                "longitude": lon,
                "risk_score": round(score, 2),
                "report_count": len(report_ids[(lat, lon)]),
                "sample_report_ids": report_ids[(lat, lon)][:5],
            }
        )
    return results
