"""Jobs endpoints wrapping existing database.py methods."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Query

from api.dependencies import get_db, get_current_user, get_optional_user
from api.models.jobs import (
    JobResponse, PaginatedJobsResponse, MarketOverview, SalaryStat,
    SkillDemand, ScalingCompany, StatsResponse,
)

router = APIRouter()


@router.get("", response_model=PaginatedJobsResponse)
def list_jobs(
    market_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    is_remote: Optional[bool] = Query(None),
    min_salary: Optional[float] = Query(None),
    query: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="Filter by lifecycle status (default: ACTIVE only)"),
    freshness: Optional[str] = Query(None, description="Filter by freshness: today, 3days, week"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    user: Optional[dict] = Depends(get_optional_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Search and filter jobs with pagination. Returns {items, total, page, per_page, pages}."""
    conditions = []
    params = []

    # Default to ACTIVE-only unless explicitly requested
    if status:
        conditions.append("COALESCE(j.status, 'ACTIVE') = ?")
        params.append(status.upper())
    else:
        conditions.append("COALESCE(j.status, 'ACTIVE') = 'ACTIVE'")

    if market_id:
        conditions.append("j.market_id = ?")
        params.append(market_id)
    if category:
        conditions.append("j.search_category LIKE ?")
        params.append(f"%{category}%")
    if company:
        conditions.append("j.company LIKE ?")
        params.append(f"%{company}%")
    if is_remote is not None:
        conditions.append("j.is_remote = ?")
        params.append(1 if is_remote else 0)
    if min_salary is not None:
        conditions.append("j.salary_min >= ?")
        params.append(min_salary)
    if query:
        conditions.append(
            "(j.title LIKE ? COLLATE NOCASE OR j.company LIKE ? COLLATE NOCASE OR j.description LIKE ? COLLATE NOCASE)"
        )
        params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])

    # Freshness filter
    if freshness:
        freshness_map = {"today": "-1 day", "3days": "-3 days", "week": "-7 days"}
        interval = freshness_map.get(freshness)
        if interval:
            conditions.append("j.posted_at >= datetime('now', ?)")
            params.append(interval)

    where = " WHERE " + " AND ".join(conditions) if conditions else ""

    # Count total matching results
    try:
        count_sql = f"SELECT COUNT(*) FROM jobs j{where}"
        total = db.execute(count_sql, params).fetchone()[0]
    except Exception:
        total = 0

    # Fetch paginated results with applicant counts
    offset = (page - 1) * per_page
    fetch_params = params + [per_page, offset]

    try:
        sql = f"""
            SELECT j.*, COALESCE(app_counts.cnt, 0) AS internal_applicant_count
            FROM jobs j
            LEFT JOIN (
                SELECT job_id, COUNT(*) AS cnt
                FROM job_applications
                GROUP BY job_id
            ) app_counts ON app_counts.job_id = j.job_id
            {where}
            ORDER BY j.posted_at DESC
            LIMIT ? OFFSET ?
        """
        rows = db.execute(sql, fetch_params).fetchall()
        items = [dict(r) for r in rows]
    except Exception:
        items = []

    pages = max(1, (total + per_page - 1) // per_page)

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }


@router.post("/{job_id}/report")
def report_job(
    job_id: str,
    reason: Optional[str] = Query("expired", description="Reason: expired, ghost, broken"),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """User reports a job as expired/ghost/broken."""
    row = db.execute("SELECT job_id, user_reports FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Job not found")

    current_reports = (row["user_reports"] or 0) + 1
    db.execute(
        "UPDATE jobs SET user_reports = ? WHERE job_id = ?",
        (current_reports, job_id),
    )
    db.commit()
    return {"job_id": job_id, "user_reports": current_reports, "reason": reason}


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    """Overall database stats (public)."""
    return {
        "total_jobs": db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "unique_companies": db.execute("SELECT COUNT(DISTINCT company) FROM jobs").fetchone()[0],
        "markets": db.execute("SELECT COUNT(DISTINCT market_id) FROM jobs").fetchone()[0],
        "with_salary": db.execute("SELECT COUNT(*) FROM jobs WHERE salary_min > 0").fetchone()[0],
    }


@router.get("/markets", response_model=list[MarketOverview])
def get_markets(db: sqlite3.Connection = Depends(get_db)):
    """Market overview (public)."""
    rows = db.execute("""
        SELECT
            market_id,
            COUNT(*) as total_jobs,
            COUNT(DISTINCT company) as unique_companies,
            COUNT(DISTINCT search_category) as categories_active,
            SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_jobs,
            ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1) as remote_pct,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN (salary_min + COALESCE(salary_max, salary_min)) / 2.0 END), 0) as avg_salary
        FROM jobs
        GROUP BY market_id
    """).fetchall()
    return [dict(r) for r in rows]


@router.get("/salary-stats", response_model=list[SalaryStat])
def get_salary_stats(
    market_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Salary statistics by category and market (auth required)."""
    sql = """
        SELECT
            search_category, market_id,
            COUNT(*) as job_count,
            ROUND(AVG(salary_min), 0) as avg_min_salary,
            ROUND(AVG(salary_max), 0) as avg_max_salary,
            ROUND(AVG((COALESCE(salary_min, 0) + COALESCE(salary_max, 0)) / 2.0), 0) as avg_midpoint,
            MIN(salary_min) as lowest_salary,
            MAX(salary_max) as highest_salary
        FROM jobs
        WHERE salary_min IS NOT NULL AND salary_min > 0
    """
    params = []
    if market_id:
        sql += " AND market_id = ?"
        params.append(market_id)
    sql += " GROUP BY search_category, market_id ORDER BY avg_midpoint DESC"

    rows = db.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/skill-demand", response_model=list[SkillDemand])
def get_skill_demand(
    market_id: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Skill demand analysis (auth required)."""
    sql = """
        SELECT
            search_category, market_id,
            COUNT(*) as demand_count,
            SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_count,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary
        FROM jobs
        WHERE posted_at >= datetime('now', '-7 days')
    """
    params = []
    if market_id:
        sql += " AND market_id = ?"
        params.append(market_id)
    sql += " GROUP BY search_category, market_id ORDER BY demand_count DESC"

    rows = db.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/scaling-companies", response_model=list[ScalingCompany])
def get_scaling_companies(
    market_id: Optional[str] = Query(None),
    min_postings: int = Query(5, ge=1),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Companies posting many jobs — scaling signal (auth required)."""
    sql = """
        SELECT
            company, market_id,
            COUNT(*) as total_postings,
            COUNT(DISTINCT search_category) as unique_categories,
            GROUP_CONCAT(DISTINCT search_category) as categories,
            MIN(posted_at) as earliest_post,
            MAX(posted_at) as latest_post
        FROM jobs
        WHERE posted_at >= datetime('now', '-7 days')
    """
    params = []
    if market_id:
        sql += " AND market_id = ?"
        params.append(market_id)
    sql += " GROUP BY company, market_id HAVING COUNT(*) >= ? ORDER BY total_postings DESC"
    params.append(min_postings)

    rows = db.execute(sql, params).fetchall()
    return [dict(r) for r in rows]
