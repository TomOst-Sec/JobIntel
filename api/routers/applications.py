"""Application tracker endpoints — save, track, and manage job applications."""
import json
import sqlite3
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ApplicationCreate(BaseModel):
    job_id: str | None = None
    external_url: str | None = None
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    notes: str | None = None
    status: str = "saved"


class ApplicationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    external_url: str | None = None


class NoteAdd(BaseModel):
    note: str


class ApplicationResponse(BaseModel):
    id: int
    user_id: int
    job_id: str | None = None
    external_url: str | None = None
    job_title: str
    company: str
    location: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    status: str
    ghost_score: float | None = None
    company_trajectory: str | None = None
    notes: str | None = None
    applied_at: str | None = None
    updated_at: str | None = None
    created_at: str | None = None


class ApplicationStats(BaseModel):
    total: int
    by_status: dict[str, int]


# ---------------------------------------------------------------------------
# POST / — Create application (save a job to tracker)
# ---------------------------------------------------------------------------

@router.post("", response_model=ApplicationResponse, status_code=201)
def create_application(
    body: ApplicationCreate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Save a job to the application tracker.

    If ``job_id`` is provided the job details are looked up from the jobs
    table automatically (title, company, location, salary, ghost_score, etc.).
    Fields supplied in the request body override the looked-up values.
    """
    job_title = body.job_title
    company = body.company
    location = body.location
    salary_min = body.salary_min
    salary_max = body.salary_max
    ghost_score = None
    company_trajectory = None
    external_url = body.external_url

    # If a job_id is provided, pull details from the jobs table
    if body.job_id:
        row = db.execute(
            "SELECT * FROM jobs WHERE job_id = ?", (body.job_id,)
        ).fetchone()
        if row:
            job = dict(row)
            job_title = job_title or job.get("title")
            company = company or job.get("company")
            location = location or job.get("location")
            salary_min = salary_min if salary_min is not None else job.get("salary_min")
            salary_max = salary_max if salary_max is not None else job.get("salary_max")
            external_url = external_url or job.get("apply_link")
            ghost_score = job.get("stale_score")

            # Try to fetch company trajectory from intel cache
            intel = db.execute(
                "SELECT trajectory FROM company_intel_cache WHERE company = ? ORDER BY computed_at DESC LIMIT 1",
                (job.get("company"),),
            ).fetchone()
            if intel:
                company_trajectory = intel["trajectory"]

    # Validate required fields
    if not job_title or not company:
        raise HTTPException(
            status_code=422,
            detail="job_title and company are required (either directly or via job_id lookup).",
        )

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    applied_at = now if body.status == "applied" else None

    cur = db.execute(
        """
        INSERT INTO job_applications
            (user_id, job_id, external_url, job_title, company, location,
             salary_min, salary_max, status, ghost_score, company_trajectory,
             notes, applied_at, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user["id"], body.job_id, external_url, job_title, company, location,
            salary_min, salary_max, body.status, ghost_score, company_trajectory,
            body.notes, applied_at, now, now,
        ),
    )
    db.commit()
    app_id = cur.lastrowid

    row = db.execute("SELECT * FROM job_applications WHERE id = ?", (app_id,)).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# GET / — List user's applications (optional status filter)
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ApplicationResponse])
def list_applications(
    status: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return the authenticated user's tracked applications."""
    conditions = ["user_id = ?"]
    params: list = [user["id"]]

    if status:
        conditions.append("status = ?")
        params.append(status)

    where = " WHERE " + " AND ".join(conditions)
    offset = (page - 1) * per_page

    sql = f"SELECT * FROM job_applications{where} ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])

    rows = db.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# GET /stats — Application stats (count by status)
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=ApplicationStats)
def get_application_stats(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return application counts grouped by status for the current user."""
    rows = db.execute(
        "SELECT status, COUNT(*) as cnt FROM job_applications WHERE user_id = ? GROUP BY status",
        (user["id"],),
    ).fetchall()

    by_status = {r["status"]: r["cnt"] for r in rows}
    total = sum(by_status.values())
    return {"total": total, "by_status": by_status}


# ---------------------------------------------------------------------------
# PUT /{app_id} — Update application (status, notes, etc.)
# ---------------------------------------------------------------------------

@router.put("/{app_id}", response_model=ApplicationResponse)
def update_application(
    app_id: int,
    body: ApplicationUpdate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update an existing tracked application."""
    row = db.execute(
        "SELECT * FROM job_applications WHERE id = ? AND user_id = ?",
        (app_id, user["id"]),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")

    existing = dict(row)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return existing

    # If transitioning to 'applied', record the timestamp
    if updates.get("status") == "applied" and existing.get("applied_at") is None:
        updates["applied_at"] = now

    updates["updated_at"] = now

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values())
    values.extend([app_id, user["id"]])

    db.execute(
        f"UPDATE job_applications SET {set_clause} WHERE id = ? AND user_id = ?",
        values,
    )
    db.commit()

    row = db.execute("SELECT * FROM job_applications WHERE id = ?", (app_id,)).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# DELETE /{app_id} — Remove application
# ---------------------------------------------------------------------------

@router.delete("/{app_id}", status_code=204)
def delete_application(
    app_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Delete a tracked application."""
    row = db.execute(
        "SELECT id FROM job_applications WHERE id = ? AND user_id = ?",
        (app_id, user["id"]),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")

    db.execute("DELETE FROM job_applications WHERE id = ? AND user_id = ?", (app_id, user["id"]))
    db.commit()


# ---------------------------------------------------------------------------
# POST /{app_id}/note — Append a note to the application
# ---------------------------------------------------------------------------

@router.post("/{app_id}/note", response_model=ApplicationResponse)
def add_note(
    app_id: int,
    body: NoteAdd,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Append a timestamped note to the application's notes field."""
    row = db.execute(
        "SELECT * FROM job_applications WHERE id = ? AND user_id = ?",
        (app_id, user["id"]),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")

    existing_notes = row["notes"] or ""
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    separator = "\n---\n" if existing_notes else ""
    updated_notes = f"{existing_notes}{separator}[{now}] {body.note}"

    db.execute(
        "UPDATE job_applications SET notes = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        (updated_notes, now, app_id, user["id"]),
    )
    db.commit()

    row = db.execute("SELECT * FROM job_applications WHERE id = ?", (app_id,)).fetchone()
    return dict(row)
