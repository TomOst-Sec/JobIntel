"""Company endpoints."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user, get_optional_user
from api.models.companies import CompanyIntel, CompanyTimeline
from api.models.jobs import JobResponse

router = APIRouter()


@router.get("/{name}", response_model=CompanyIntel)
def get_company(
    name: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Deep dive on a specific company (auth required)."""
    row = db.execute("""
        SELECT
            company,
            COUNT(*) as total_jobs,
            GROUP_CONCAT(DISTINCT market_id) as markets,
            GROUP_CONCAT(DISTINCT search_category) as categories,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary_min,
            ROUND(AVG(CASE WHEN salary_max > 0 THEN salary_max END), 0) as avg_salary_max,
            ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1) as remote_pct,
            MIN(posted_at) as earliest_post,
            MAX(posted_at) as latest_post
        FROM jobs
        WHERE company LIKE ?
        GROUP BY company
    """, (f"%{name}%",)).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")

    data = dict(row)
    data["markets"] = data["markets"].split(",") if data["markets"] else []
    data["categories"] = data["categories"].split(",") if data["categories"] else []
    return data


@router.get("/{name}/jobs", response_model=list[JobResponse])
def get_company_jobs(
    name: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: Optional[dict] = Depends(get_optional_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List jobs for a specific company."""
    offset = (page - 1) * per_page
    rows = db.execute(
        "SELECT * FROM jobs WHERE company LIKE ? ORDER BY posted_at DESC LIMIT ? OFFSET ?",
        (f"%{name}%", per_page, offset),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/{name}/timeline", response_model=list[CompanyTimeline])
def get_company_timeline(
    name: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Hiring timeline for a company (daily posting counts)."""
    rows = db.execute("""
        SELECT date(posted_at) as date, COUNT(*) as postings
        FROM jobs
        WHERE company LIKE ?
        GROUP BY date(posted_at)
        ORDER BY date DESC
        LIMIT 90
    """, (f"%{name}%",)).fetchall()
    return [dict(r) for r in rows]
