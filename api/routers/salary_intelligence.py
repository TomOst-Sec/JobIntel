"""Salary Intelligence API routes — salary reality, H1B data, market benchmarks."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.services.salary_reality_engine import (
    compute_salary_reality,
    get_company_salary_reality,
    get_role_salary_benchmarks,
)

router = APIRouter()


@router.get("/salary/reality/{job_id}")
def salary_reality_for_job(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get salary reality analysis for a specific job."""
    job_row = db.execute(
        "SELECT job_id, company, title, location FROM jobs WHERE job_id = ?",
        (job_id,),
    ).fetchone()
    if not job_row:
        raise HTTPException(status_code=404, detail="Job not found")

    j = dict(job_row)
    result = compute_salary_reality(
        j["job_id"], j["company"], j["title"], j.get("location"), db
    )
    return result


@router.get("/salary/company/{company}")
def salary_by_company(
    company: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all salary reality data for a company."""
    results = get_company_salary_reality(company, db)
    return {"company": company, "count": len(results), "data": results}


@router.get("/salary/benchmarks")
def salary_benchmarks(
    role: str = Query(..., description="Job title to benchmark"),
    location: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get salary benchmarks for a role across all companies."""
    return get_role_salary_benchmarks(role, location, db)


@router.get("/salary/h1b")
def h1b_data(
    company: str | None = Query(default=None),
    title: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: sqlite3.Connection = Depends(get_db),
):
    """Query H1B salary data."""
    conditions = ["case_status = 'Certified'"]
    params: list = []

    if company:
        conditions.append("company_name_normalized LIKE ?")
        params.append(f"%{company.lower()}%")
    if title:
        conditions.append("job_title_normalized LIKE ?")
        params.append(f"%{title.lower()}%")

    where = " AND ".join(conditions)
    rows = db.execute(
        f"""SELECT company_name, job_title, wage_annual, wage_level,
                   worksite_city, worksite_state, year
            FROM h1b_salary_data
            WHERE {where}
            ORDER BY year DESC, wage_annual DESC
            LIMIT ?""",
        [*params, limit],
    ).fetchall()

    return {
        "count": len(rows),
        "data": [dict(r) for r in rows],
    }


@router.get("/salary/transparency")
def salary_transparency(
    min_jobs: int = Query(default=5, ge=2),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get salary transparency grades for companies."""
    rows = db.execute(
        """SELECT company, transparency_grade, COUNT(*) as roles_analyzed,
                  AVG(posted_min) as avg_posted_min, AVG(posted_max) as avg_posted_max,
                  AVG(h1b_actual_avg) as avg_h1b, AVG(market_p50) as avg_market_p50
           FROM salary_reality
           WHERE transparency_grade IS NOT NULL
           GROUP BY LOWER(company)
           HAVING roles_analyzed >= ?
           ORDER BY transparency_grade, roles_analyzed DESC""",
        (min_jobs,),
    ).fetchall()

    return {
        "count": len(rows),
        "companies": [dict(r) for r in rows],
    }
