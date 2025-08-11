"""Recruiter Pipeline API — Kanban pipeline management + daily briefing."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.models.recruiter import (
    PipelineCreateRequest,
    PipelineEntry,
    PipelineUpdate,
    PipelineStats,
    BriefingResponse,
)
from api.services.recruiter_pipeline import (
    add_to_pipeline,
    update_pipeline,
    get_pipeline,
    get_pipeline_stats,
    remove_from_pipeline,
    generate_daily_briefing,
)

router = APIRouter()


def _require_recruiter(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required")
    return user


@router.post("/pipeline", response_model=PipelineEntry, status_code=201)
def create_pipeline_entry(
    body: PipelineCreateRequest,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Add a candidate to the pipeline."""
    try:
        result = add_to_pipeline(
            recruiter_id=user["id"],
            candidate_id=body.candidate_id,
            search_id=body.search_id,
            job_title=body.job_title,
            conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/pipeline", response_model=list[PipelineEntry])
def list_pipeline(
    stage: str | None = Query(None, description="Filter by stage"),
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get pipeline entries, optionally filtered by stage."""
    return get_pipeline(user["id"], stage, db)


@router.get("/pipeline/stats", response_model=PipelineStats)
def pipeline_stats(
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get pipeline counts per stage."""
    return get_pipeline_stats(user["id"], db)


@router.put("/pipeline/{pipeline_id}", response_model=PipelineEntry)
def update_pipeline_entry(
    pipeline_id: str,
    body: PipelineUpdate,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update a pipeline entry (stage, notes, rating)."""
    try:
        result = update_pipeline(
            pipeline_id=pipeline_id,
            recruiter_id=user["id"],
            stage=body.stage,
            notes=body.notes,
            rating=body.rating,
            conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.delete("/pipeline/{pipeline_id}", status_code=204)
def delete_pipeline_entry(
    pipeline_id: str,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Remove a candidate from the pipeline."""
    try:
        remove_from_pipeline(pipeline_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/briefing", response_model=BriefingResponse)
def daily_briefing(
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get or generate the recruiter's daily briefing."""
    return generate_daily_briefing(user["id"], db)
