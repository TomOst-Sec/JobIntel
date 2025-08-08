"""Personal AI Agent API — 24/7 market monitoring and autonomous job search."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.ai_agent import (
    get_agent_config, update_agent_config, run_agent_scan,
    get_agent_dashboard, respond_to_match, get_market_insights,
)

router = APIRouter()


class AgentConfigUpdate(BaseModel):
    is_active: bool | None = None
    agent_mode: str | None = None
    target_roles: list[str] | None = None
    target_companies: list[str] | None = None
    excluded_companies: list[str] | None = None
    min_salary: int | None = None
    remote_preference: str | None = None
    company_stage_prefs: list[str] | None = None
    culture_values: list[str] | None = None
    alert_frequency: str | None = None
    alert_min_match_score: float | None = None
    email_alerts: bool | None = None
    auto_apply: bool | None = None
    auto_respond: bool | None = None


class MatchResponse(BaseModel):
    response: str  # interested, not_interested, apply, save


# ─── Agent Config ─────────────────────────────────

@router.get("/config")
def agent_config(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get AI agent configuration."""
    return get_agent_config(user["id"], db)


@router.put("/config")
def update_config(
    body: AgentConfigUpdate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update AI agent configuration."""
    return update_agent_config(user["id"], body.model_dump(exclude_none=True), db)


# ─── Agent Actions ────────────────────────────────

@router.post("/scan")
def trigger_scan(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Manually trigger an agent scan cycle."""
    return run_agent_scan(user["id"], db)


@router.get("/dashboard")
def dashboard(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get the AI agent dashboard with matches, stats, and activity."""
    return get_agent_dashboard(user["id"], db)


@router.post("/matches/{match_id}/respond")
def match_respond(
    match_id: int,
    body: MatchResponse,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Respond to a presented match."""
    try:
        return respond_to_match(user["id"], match_id, body.response, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/insights")
def market_insights(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get personalized market insights."""
    return get_market_insights(user["id"], db)
