"""Public API endpoints — viral tools (ghost-check, salary-check) + weekly reports.

No authentication required. Rate limited by IP.
"""
import hashlib
import json
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from api.dependencies import get_db

router = APIRouter()

# Simple in-memory rate limit tracker (per IP, resets hourly)
_rate_limit: dict[str, list[float]] = {}
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 3600  # 1 hour


def _check_rate_limit(request: Request):
    """Enforce 10 requests/hour per IP for public endpoints."""
    ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16]
    now = time.time()

    if ip_hash not in _rate_limit:
        _rate_limit[ip_hash] = []

    # Prune old entries
    _rate_limit[ip_hash] = [t for t in _rate_limit[ip_hash] if now - t < RATE_LIMIT_WINDOW]

    if len(_rate_limit[ip_hash]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Free tools are limited to 10 checks per hour. Sign up for unlimited access.",
        )

    _rate_limit[ip_hash].append(now)
    return ip_hash


# --- Request/Response models ---

class GhostCheckRequest(BaseModel):
    url: str

class GhostCheckResponse(BaseModel):
    job_url: str
    company: str | None
    title: str | None
    ghost_score: float
    signals: list
    verdict: str
    confidence: str
    source: str

class SalaryCheckRequest(BaseModel):
    job_title: str
    location: str | None = None
    experience: str = "mid"

class SalaryCheckResponse(BaseModel):
    job_title: str
    location: str | None
    experience: str
    percentiles: dict
    sample_size: int
    top_paying_companies: list
    market_comparison: list
    ai_insight: str | None


# --- Ghost Check ---

@router.post("/ghost-check", response_model=GhostCheckResponse)
def public_ghost_check(
    body: GhostCheckRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
):
    """Check if a job posting is likely a ghost job. Free, no auth required."""
    ip_hash = _check_rate_limit(request)

    # Check cache first (within last 24h)
    cached = db.execute("""
        SELECT * FROM public_ghost_checks
        WHERE job_url = ? AND checked_at >= datetime('now', '-1 day')
        ORDER BY checked_at DESC LIMIT 1
    """, (body.url,)).fetchone()

    if cached:
        cached = dict(cached)
        return GhostCheckResponse(
            job_url=body.url,
            company=cached.get("company"),
            title=cached.get("title"),
            ghost_score=cached.get("ghost_score", 0),
            signals=json.loads(cached["signals"]) if cached.get("signals") else [],
            verdict=cached.get("verdict", "unknown"),
            confidence="cached",
            source="cache",
        )

    from api.services.intelligence.ghost_detector import public_ghost_check as run_ghost_check
    result = run_ghost_check(body.url, db)

    return GhostCheckResponse(
        job_url=result.get("job_url", body.url),
        company=result.get("company"),
        title=result.get("title"),
        ghost_score=result.get("ghost_score", 0),
        signals=result.get("signals", []),
        verdict=result.get("verdict", "unknown"),
        confidence=result.get("confidence", "low"),
        source=result.get("source", "analysis"),
    )


# --- Salary Check ---

@router.post("/salary-check", response_model=SalaryCheckResponse)
def public_salary_check(
    body: SalaryCheckRequest,
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get salary intelligence for a role. Free, no auth required."""
    ip_hash = _check_rate_limit(request)

    # Query jobs for matching roles
    sql = """
        SELECT salary_min, salary_max, company, market_id, location
        FROM jobs
        WHERE (title LIKE ? OR search_category LIKE ?)
        AND salary_min > 0
    """
    args = [f"%{body.job_title}%", f"%{body.job_title}%"]

    if body.location:
        sql += " AND (market_id LIKE ? OR location LIKE ?)"
        args.extend([f"%{body.location}%", f"%{body.location}%"])

    sql += " ORDER BY posted_at DESC LIMIT 500"
    rows = db.execute(sql, args).fetchall()
    salary_rows = [dict(r) for r in rows]

    if not salary_rows:
        return SalaryCheckResponse(
            job_title=body.job_title,
            location=body.location,
            experience=body.experience,
            percentiles={"p25": 0, "p50": 0, "p75": 0, "p90": 0},
            sample_size=0,
            top_paying_companies=[],
            market_comparison=[],
            ai_insight="Not enough data for this role. Try a broader job title.",
        )

    # Compute salary statistics
    midpoints = []
    for r in salary_rows:
        mid = (r["salary_min"] + (r["salary_max"] or r["salary_min"])) / 2
        midpoints.append(mid)

    midpoints.sort()
    n = len(midpoints)

    def percentile(data, p):
        idx = int(len(data) * p / 100)
        return round(data[min(idx, len(data) - 1)])

    percentiles = {
        "p25": percentile(midpoints, 25),
        "p50": percentile(midpoints, 50),
        "p75": percentile(midpoints, 75),
        "p90": percentile(midpoints, 90),
    }

    # Top paying companies
    company_salaries: dict[str, list[float]] = {}
    for r in salary_rows:
        c = r.get("company", "Unknown")
        mid = (r["salary_min"] + (r["salary_max"] or r["salary_min"])) / 2
        company_salaries.setdefault(c, []).append(mid)

    top_companies = sorted(
        [
            {"company": c, "avg_salary": round(sum(s) / len(s)), "sample": len(s)}
            for c, s in company_salaries.items() if len(s) >= 1
        ],
        key=lambda x: x["avg_salary"],
        reverse=True,
    )[:10]

    # Market comparison
    market_data: dict[str, list[float]] = {}
    for r in salary_rows:
        m = r.get("market_id", "unknown")
        mid = (r["salary_min"] + (r["salary_max"] or r["salary_min"])) / 2
        market_data.setdefault(m, []).append(mid)

    market_comparison = sorted(
        [
            {"market": m, "avg_salary": round(sum(s) / len(s)), "sample": len(s)}
            for m, s in market_data.items()
        ],
        key=lambda x: x["avg_salary"],
        reverse=True,
    )

    # AI insight (quick Haiku call)
    ai_insight = _generate_salary_insight(body.job_title, body.location, body.experience, percentiles, n)

    # Cache result
    try:
        db.execute("""
            INSERT INTO public_salary_checks
                (job_title, location, experience_level, market_data, ai_analysis, ip_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            body.job_title, body.location, body.experience,
            json.dumps({"percentiles": percentiles, "sample_size": n}),
            ai_insight, ip_hash,
        ))
        db.commit()
    except Exception:
        pass

    return SalaryCheckResponse(
        job_title=body.job_title,
        location=body.location,
        experience=body.experience,
        percentiles=percentiles,
        sample_size=n,
        top_paying_companies=top_companies,
        market_comparison=market_comparison,
        ai_insight=ai_insight,
    )


def _generate_salary_insight(title: str, location: str | None, experience: str,
                              percentiles: dict, sample_size: int) -> str | None:
    """Quick AI insight on salary data using Haiku."""
    from api.config import get_settings
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": f"""In 2-3 sentences, give salary advice for this role:
Role: {title} | Location: {location or 'Remote/Any'} | Experience: {experience}
Data: P25=${percentiles['p25']:,} P50=${percentiles['p50']:,} P75=${percentiles['p75']:,} P90=${percentiles['p90']:,} (n={sample_size})
Be specific and actionable. Include a target number they should aim for.""",
            }],
        )
        return response.content[0].text.strip()
    except Exception:
        return None


# --- Weekly Reports ---

@router.get("/reports/weekly/latest")
def latest_weekly_report(db: sqlite3.Connection = Depends(get_db)):
    """Get the most recent public weekly report."""
    row = db.execute("""
        SELECT id, title, summary, sections, public_slug, week_start, week_end,
               ai_model, generation_time_ms, created_at
        FROM generated_reports
        WHERE is_public = 1
        ORDER BY created_at DESC LIMIT 1
    """).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No weekly report available yet.")

    report = dict(row)
    report["sections"] = json.loads(report["sections"]) if report.get("sections") else []
    return report


@router.get("/reports/weekly/{slug}")
def get_public_report(slug: str, db: sqlite3.Connection = Depends(get_db)):
    """Get a public report by slug."""
    row = db.execute("""
        SELECT id, title, summary, sections, public_slug, week_start, week_end,
               ai_model, generation_time_ms, created_at
        FROM generated_reports
        WHERE public_slug = ? AND is_public = 1
    """, (slug,)).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    report = dict(row)
    report["sections"] = json.loads(report["sections"]) if report.get("sections") else []
    return report


# --- Radar Preview ---

@router.get("/radar/preview")
def public_radar_preview(db: sqlite3.Connection = Depends(get_db)):
    """Preview of company risk radar. Top 5 companies only (full requires login)."""
    rows = db.execute("""
        SELECT company, layoff_risk_score, ipo_probability, trajectory
        FROM company_intel_cache
        WHERE computed_at >= datetime('now', '-7 days')
        ORDER BY layoff_risk_score DESC
        LIMIT 5
    """).fetchall()

    return {
        "preview": [dict(r) for r in rows],
        "total_tracked": db.execute(
            "SELECT COUNT(DISTINCT company) FROM company_intel_cache"
        ).fetchone()[0],
        "cta": "Sign up to see all companies and get personalized radar alerts.",
    }
