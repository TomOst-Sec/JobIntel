"""Autopilot endpoints: settings, run, briefing, history, approvals."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.autopilot import (
    get_autopilot_settings, update_autopilot_settings,
    run_autopilot, generate_morning_briefing,
    get_autopilot_history, approve_queued_applications,
)

router = APIRouter()


# ─── Request Models ─────────────────────────────────

class AutopilotSettingsUpdate(BaseModel):
    is_enabled: bool | None = None
    mode: str | None = None
    target_roles: list[str] | None = None
    target_seniority: list[str] | None = None
    target_locations: list[str] | None = None
    salary_floor: float | None = None
    exclude_companies: list[str] | None = None
    exclude_industries: list[str] | None = None
    require_salary_disclosed: bool | None = None
    max_ghost_score: float | None = None
    max_layoff_risk: float | None = None
    require_visa_sponsorship: bool | None = None
    min_match_score: float | None = None
    max_applications_per_day: int | None = None
    max_per_company: int | None = None
    cooldown_same_company_days: int | None = None
    run_time: str | None = None
    timezone: str | None = None


class ApproveRequest(BaseModel):
    application_ids: list[int]


# ─── Settings ───────────────────────────────────────

@router.get("/settings")
def get_settings(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get autopilot settings."""
    return get_autopilot_settings(user["id"], db)


@router.put("/settings")
def update_settings(
    body: AutopilotSettingsUpdate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update autopilot settings."""
    # Only send non-None fields
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No settings to update")
    try:
        return update_autopilot_settings(user["id"], updates, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Run ────────────────────────────────────────────

@router.post("/run")
def trigger_run(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Manually trigger an autopilot run."""
    try:
        return run_autopilot(user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Briefing ──────────────────────────────────────

@router.get("/briefing")
def morning_briefing(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get AI-generated morning briefing."""
    return generate_morning_briefing(user["id"], db)


# ─── History ────────────────────────────────────────

@router.get("/history")
def run_history(
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get autopilot run history."""
    return {"runs": get_autopilot_history(user["id"], db, limit)}


# ─── Queue Approvals ───────────────────────────────

@router.post("/approve")
def approve_applications(
    body: ApproveRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Approve queued applications from pre-approve mode."""
    if not body.application_ids:
        raise HTTPException(status_code=400, detail="No application IDs provided")
    return approve_queued_applications(user["id"], body.application_ids, db)


@router.get("/queued")
def get_queued(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get queued applications awaiting approval."""
    rows = db.execute(
        """SELECT at.*, j.company as job_company, j.title as job_title
           FROM application_tracker at
           LEFT JOIN jobs j ON at.job_id = j.job_id
           WHERE at.user_id = ? AND at.status = 'queued'
           ORDER BY at.applied_at DESC""",
        (user["id"],),
    ).fetchall()
    return {"queued": [dict(r) for r in rows]}
