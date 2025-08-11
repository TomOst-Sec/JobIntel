"""Startup Hub API — profiles, co-founder matching, equity calculator."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.startup_hub import (
    create_startup, get_startup, get_startup_by_slug, list_startups,
    update_startup, find_cofounder_matches, calculate_equity,
)

router = APIRouter()


class CreateStartupBody(BaseModel):
    name: str
    tagline: str | None = None
    description: str | None = None
    stage: str = "pre_seed"
    industry: str | None = None
    location: str | None = None
    remote_friendly: bool = True
    website_url: str | None = None
    looking_for_cofounder: bool = False
    cofounder_skills_needed: list[str] | None = None


class UpdateStartupBody(BaseModel):
    tagline: str | None = None
    description: str | None = None
    stage: str | None = None
    industry: str | None = None
    location: str | None = None
    remote_friendly: bool | None = None
    website_url: str | None = None
    looking_for_cofounder: bool | None = None
    cofounder_skills_needed: list[str] | None = None
    open_roles: list[dict] | None = None
    funding_total: float | None = None
    last_round_amount: float | None = None
    revenue_range: str | None = None
    total_shares: int | None = None
    option_pool_pct: float | None = None
    last_valuation: float | None = None


class EquityCalcBody(BaseModel):
    total_shares: int = 10_000_000
    option_pool_pct: float = 15.0
    last_valuation: float | None = None
    founders: list[dict] | None = None
    exit_scenarios: list[float] | None = None


# ─── Startup CRUD ─────────────────────────────────

@router.post("", status_code=201)
def new_startup(
    body: CreateStartupBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a new startup profile."""
    try:
        return create_startup(user_id=user["id"], conn=db, **body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def browse_startups(
    stage: str | None = Query(None),
    industry: str | None = Query(None),
    cofounder: bool | None = Query(None, alias="looking_for_cofounder"),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: sqlite3.Connection = Depends(get_db),
):
    """Browse startup profiles."""
    return list_startups(stage, industry, cofounder, q, page, per_page, db)


@router.get("/{startup_id}")
def view_startup(
    startup_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a startup profile."""
    try:
        return get_startup(startup_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/slug/{slug}")
def view_startup_by_slug(
    slug: str,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a startup by slug."""
    try:
        return get_startup_by_slug(slug, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{startup_id}")
def edit_startup(
    startup_id: int,
    body: UpdateStartupBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update a startup profile (founder only)."""
    try:
        return update_startup(startup_id, user["id"], body.model_dump(exclude_none=True), db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ─── Co-Founder Matching ─────────────────────────

@router.get("/{startup_id}/cofounder-matches")
def cofounder_matches(
    startup_id: int,
    limit: int = Query(20, ge=1, le=50),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Find potential co-founders based on complementary skills."""
    return {"matches": find_cofounder_matches(startup_id, db, limit)}


# ─── Equity Calculator ───────────────────────────

@router.post("/equity-calculator")
def equity_calc(body: EquityCalcBody):
    """Calculate equity breakdown and exit scenario outcomes."""
    return calculate_equity(
        total_shares=body.total_shares,
        option_pool_pct=body.option_pool_pct,
        last_valuation=body.last_valuation,
        founders=body.founders,
        exit_scenarios=body.exit_scenarios,
    )
