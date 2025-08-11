"""Market Signals API routes — real-time hiring intelligence and competitive map."""
import sqlite3

from fastapi import APIRouter, Depends, Query

from api.dependencies import get_db, get_current_user
from api.services.market_signals_engine import (
    generate_market_snapshot,
    get_company_signals,
    get_role_signals,
    detect_company_velocity_signals,
    detect_salary_signals,
    detect_ghost_epidemic_signals,
    detect_skill_demand_shifts,
    detect_layoff_precursors,
)
from api.services.competitive_map import (
    build_competitive_landscape,
    get_cached_landscape,
    get_company_competitors,
)

router = APIRouter()


# --- Market Signals ---

@router.get("/signals/snapshot")
def market_snapshot(
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate full market intelligence snapshot."""
    return generate_market_snapshot(db)


@router.get("/signals/company/{company}")
def company_signals(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all market signals for a specific company."""
    signals = get_company_signals(company, db)
    return {"company": company, "signal_count": len(signals), "signals": signals}


@router.get("/signals/role/{role}")
def role_signals(
    role: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get salary and demand signals for a specific role."""
    signals = get_role_signals(role, db)
    return {"role": role, "signal_count": len(signals), "signals": signals}


@router.get("/signals/velocity")
def velocity_signals(
    lookback_days: int = Query(default=90, ge=14, le=365),
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect hiring velocity changes (surges and freezes)."""
    signals = detect_company_velocity_signals(db, lookback_days=lookback_days)
    surges = [s for s in signals if s["signal_type"] == "hiring_surge"]
    freezes = [s for s in signals if s["signal_type"] == "hiring_freeze"]
    return {"surges": surges, "freezes": freezes, "total": len(signals)}


@router.get("/signals/salary-trends")
def salary_trends(
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect salary spikes and compression."""
    signals = detect_salary_signals(db)
    rising = [s for s in signals if s["signal_type"] == "salary_spike"]
    falling = [s for s in signals if s["signal_type"] == "salary_compression"]
    return {"rising": rising, "falling": falling, "total": len(signals)}


@router.get("/signals/skills")
def skill_shifts(
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect emerging and declining skill demand."""
    signals = detect_skill_demand_shifts(db)
    rising = [s for s in signals if s.get("metadata", {}).get("trend") == "rising"]
    declining = [s for s in signals if s.get("metadata", {}).get("trend") == "declining"]
    return {"rising_skills": rising, "declining_skills": declining, "total": len(signals)}


@router.get("/signals/ghost-epidemics")
def ghost_epidemics(
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect companies with abnormally high ghost job rates."""
    signals = detect_ghost_epidemic_signals(db)
    return {"companies_flagged": len(signals), "signals": signals}


@router.get("/signals/layoff-precursors")
def layoff_precursors(
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect pre-layoff hiring patterns."""
    signals = detect_layoff_precursors(db)
    return {"companies_flagged": len(signals), "signals": signals}


# --- Competitive Hiring Map ---

@router.get("/competitive/landscape")
def competitive_landscape(
    role: str = Query(..., description="Role to analyze"),
    location: str | None = Query(default=None),
    seniority: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Build competitive hiring landscape for a role/location."""
    # Check cache first
    cached = get_cached_landscape(role, location, db)
    if cached:
        return cached
    return build_competitive_landscape(role, location, seniority, db)


@router.get("/competitive/company/{company}")
def company_competitors(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Find companies competing for the same talent."""
    competitors = get_company_competitors(company, db)
    return {
        "company": company,
        "competitor_count": len(competitors),
        "competitors": competitors,
    }
