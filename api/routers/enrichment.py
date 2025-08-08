"""Enrichment Pipeline API routes — 47-field intelligence enrichment for jobs."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user, require_admin
from api.services.enrichment_pipeline import (
    run_enrichment, batch_enrich, enqueue_job, compute_priority,
)
from api.services.ghost_truth_engine import (
    classify_ghost_type, batch_classify_ghosts, get_ghost_type_stats,
)

router = APIRouter()


# --- Single Job Enrichment ---

@router.post("/enrich/{job_id}")
def enrich_job(
    job_id: str,
    skip_ai: bool = Query(default=False, description="Skip Claude AI stage for speed"),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Enrich a single job through the full pipeline."""
    try:
        result = run_enrichment(job_id, db, skip_ai=skip_ai)
        return {"status": "completed", "job_id": job_id, "enrichment": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enrichment failed: {e}")


@router.get("/enriched/{job_id}")
def get_enriched_job(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get enriched data for a job."""
    row = db.execute(
        "SELECT * FROM enriched_jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Enriched data not found")
    return dict(row)


# --- Batch Enrichment ---

@router.post("/enrich/batch")
def batch_enrich_jobs(
    limit: int = Query(default=50, le=200),
    skip_ai: bool = Query(default=True),
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Batch-enrich jobs that haven't been enriched yet."""
    result = batch_enrich(db, limit=limit, skip_ai=skip_ai)
    return result


# --- Queue Management ---

@router.post("/enrich/queue/{job_id}")
def queue_job(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Add a job to the enrichment queue."""
    enqueue_job(job_id, db)
    return {"status": "queued", "job_id": job_id}


@router.get("/enrich/queue/stats")
def queue_stats(
    db: sqlite3.Connection = Depends(get_db),
):
    """Get enrichment queue statistics."""
    pending = db.execute(
        "SELECT COUNT(*) FROM enrichment_queue WHERE status = 'pending'"
    ).fetchone()[0]
    processing = db.execute(
        "SELECT COUNT(*) FROM enrichment_queue WHERE status = 'processing'"
    ).fetchone()[0]
    completed = db.execute(
        "SELECT COUNT(*) FROM enrichment_queue WHERE status = 'completed'"
    ).fetchone()[0]
    failed = db.execute(
        "SELECT COUNT(*) FROM enrichment_queue WHERE status = 'failed'"
    ).fetchone()[0]

    total_enriched = db.execute(
        "SELECT COUNT(*) FROM enriched_jobs WHERE enrichment_status = 'completed'"
    ).fetchone()[0]
    total_jobs = db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]

    return {
        "queue": {
            "pending": pending,
            "processing": processing,
            "completed": completed,
            "failed": failed,
        },
        "enrichment_coverage": {
            "enriched": total_enriched,
            "total_jobs": total_jobs,
            "coverage_pct": round(total_enriched / max(total_jobs, 1) * 100, 1),
        },
    }


# --- Ghost Truth Engine ---

@router.get("/ghost-truth/{job_id}")
def ghost_truth_classify(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Classify a job into one of 6 ghost types with evidence."""
    try:
        result = classify_ghost_type(job_id, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/ghost-truth/batch")
def ghost_truth_batch(
    limit: int = Query(default=100, le=500),
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Batch-classify ghost types for unclassified jobs."""
    result = batch_classify_ghosts(db, limit=limit)
    return result


@router.get("/ghost-truth/stats")
def ghost_truth_stats(
    db: sqlite3.Connection = Depends(get_db),
):
    """Get aggregate ghost type statistics."""
    return get_ghost_type_stats(db)
