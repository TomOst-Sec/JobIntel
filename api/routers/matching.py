"""Bidirectional Matching API — AI-powered job matching."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.matching_engine import (
    compute_match, get_top_matches, update_match_status, batch_compute_matches,
)

router = APIRouter()


class MatchResponseBody(BaseModel):
    status: str  # interested, applied, rejected


# ─── Matching ──────────────────────────────────────

@router.post("/compute/{job_id}")
def compute_job_match(
    job_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Compute bidirectional match score for a specific job."""
    try:
        return compute_match(user["id"], job_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/batch")
def batch_match(
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Compute matches against recent unmatched jobs."""
    count = batch_compute_matches(user["id"], db, limit)
    return {"matches_computed": count}


@router.get("/top")
def top_matches(
    limit: int = Query(20, ge=1, le=100),
    min_score: float = Query(50, ge=0, le=100),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get top matches for the current user."""
    matches = get_top_matches(user["id"], limit, min_score, db)
    return {"matches": matches, "count": len(matches)}


@router.put("/{job_id}/status")
def update_status(
    job_id: int,
    body: MatchResponseBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update match status (interested, applied, etc.)."""
    try:
        return update_match_status(user["id"], job_id, body.status, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
