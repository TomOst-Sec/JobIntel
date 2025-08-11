"""Intelligence feature API routes — ghost jobs, radar, company intel, market signals."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.models.intelligence import (
    GhostAnalysisResponse, GhostStatsResponse,
    LayoffRiskResponse, IpoSignalResponse,
    MarketSignalResponse, CompanyIntelReport,
)
from api.services.intelligence.ghost_detector import (
    analyze_ghost_job, batch_analyze_ghosts, get_ghost_stats,
)
from api.services.intelligence.layoff_radar import analyze_layoff_risk, scan_layoff_risks
from api.services.intelligence.ipo_radar import detect_ipo_signals, scan_ipo_candidates
from api.services.intelligence.company_intel import generate_company_report, get_market_signals

router = APIRouter()


# --- Ghost Jobs ---

@router.get("/ghost/stats", response_model=GhostStatsResponse)
def ghost_stats(db: sqlite3.Connection = Depends(get_db)):
    """Get aggregate ghost job statistics."""
    return get_ghost_stats(db)


@router.get("/ghost/{job_id}", response_model=GhostAnalysisResponse)
def ghost_analyze(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Analyze a specific job for ghost signals."""
    try:
        return analyze_ghost_job(job_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/ghost/scan")
def ghost_scan(
    limit: int = Query(default=50, le=200),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Batch-scan recent jobs for ghost signals."""
    results = batch_analyze_ghosts(db, limit=limit)
    return {
        "scanned": len(results),
        "likely_ghost": sum(1 for r in results if r["verdict"] == "likely_ghost"),
        "suspicious": sum(1 for r in results if r["verdict"] == "suspicious"),
        "results": results[:20],
    }


# --- Layoff Radar ---

@router.get("/radar/layoff/{company}", response_model=LayoffRiskResponse)
def layoff_risk(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Analyze layoff risk for a specific company."""
    return analyze_layoff_risk(company, db)


@router.get("/radar/layoff")
def layoff_scan(
    min_postings: int = Query(default=5, ge=2),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Scan all companies for layoff risk signals."""
    results = scan_layoff_risks(db, min_postings=min_postings)
    return {"companies_scanned": len(results), "results": results}


# --- IPO Radar ---

@router.get("/radar/ipo/{company}", response_model=IpoSignalResponse)
def ipo_signals(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Detect pre-IPO hiring signals for a specific company."""
    return detect_ipo_signals(company, db)


@router.get("/radar/ipo")
def ipo_scan(
    min_postings: int = Query(default=10, ge=3),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Scan active companies for IPO signals."""
    results = scan_ipo_candidates(db, min_postings=min_postings)
    return {"companies_scanned": len(results), "results": results}


# --- Market Signals ---

@router.get("/signals", response_model=list[MarketSignalResponse])
def market_signals(
    signal_type: str | None = Query(default=None),
    company: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get market signals — layoff risks, IPO signals, salary spikes, ghost jobs."""
    return get_market_signals(db, signal_type=signal_type, company=company, limit=limit)


# --- Company Deep Intel ---

@router.get("/company/{company}", response_model=CompanyIntelReport)
def company_intel(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate a deep company intelligence report."""
    return generate_company_report(company, db)
