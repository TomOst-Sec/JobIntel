"""Salary Reality Engine — exposes what companies actually pay vs what they advertise.

Combines H1B LCA data, market benchmarks, community reports, and job posting
analysis to compute the gap between advertised and actual compensation.
"""
import json
import sqlite3
from datetime import datetime

import anthropic

from api.config import get_settings


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def compute_salary_reality(
    job_id: str | None,
    company: str,
    title: str,
    location: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Compute the full salary reality analysis for a role.

    Returns dict matching salary_reality table schema.
    """
    company_lower = company.lower().strip()
    title_lower = title.lower().strip()

    # Posted salary from job posting
    posted_min = None
    posted_max = None
    if job_id:
        job_row = conn.execute(
            "SELECT salary_min, salary_max FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if job_row:
            posted_min = job_row["salary_min"]
            posted_max = job_row["salary_max"]

    # H1B actual data
    h1b_row = conn.execute(
        """SELECT AVG(wage_annual) as avg_wage, COUNT(*) as cnt,
                  MIN(wage_annual) as min_wage, MAX(wage_annual) as max_wage
           FROM h1b_salary_data
           WHERE company_name_normalized LIKE ?
             AND job_title_normalized LIKE ?
             AND case_status = 'Certified'""",
        (f"%{company_lower[:20]}%", f"%{title_lower[:30]}%"),
    ).fetchone()
    h1b_avg = None
    h1b_sample = 0
    if h1b_row and h1b_row["cnt"] > 0:
        h1b_avg = round(h1b_row["avg_wage"])
        h1b_sample = h1b_row["cnt"]

    # Market percentiles from our job database
    # Find similar roles (same category or similar title)
    market_rows = conn.execute(
        """SELECT salary_min, salary_max FROM jobs
           WHERE salary_min > 0
             AND (LOWER(title) LIKE ? OR LOWER(title) LIKE ?)
           ORDER BY salary_min""",
        (f"%{title_lower.split()[0] if title_lower else ''}%",
         f"%{title_lower.split()[-1] if title_lower else ''}%"),
    ).fetchall()

    market_p25 = None
    market_p50 = None
    market_p75 = None
    market_p90 = None

    if market_rows:
        salaries = sorted([
            (dict(r)["salary_min"] + (dict(r)["salary_max"] or dict(r)["salary_min"])) / 2
            for r in market_rows
        ])
        n = len(salaries)
        if n > 0:
            market_p25 = round(salaries[int(n * 0.25)])
            market_p50 = round(salaries[int(n * 0.50)])
            market_p75 = round(salaries[int(n * 0.75)])
            market_p90 = round(salaries[min(int(n * 0.90), n - 1)])

    # Community reported (from public salary checks)
    community_row = conn.execute(
        """SELECT market_data FROM public_salary_checks
           WHERE LOWER(job_title) LIKE ?
           ORDER BY checked_at DESC LIMIT 1""",
        (f"%{title_lower[:20]}%",),
    ).fetchone()
    community_avg = None
    if community_row and community_row["market_data"]:
        try:
            mdata = json.loads(community_row["market_data"])
            if isinstance(mdata, dict):
                community_avg = mdata.get("avg_midpoint")
        except (json.JSONDecodeError, TypeError):
            pass

    # Gap analysis
    gap_analysis = _compute_gap_analysis(
        posted_min, posted_max, h1b_avg, market_p50, community_avg
    )

    # Negotiation leverage
    leverage = _compute_leverage(posted_min, posted_max, h1b_avg, market_p50)

    # Transparency grade
    grade = _compute_transparency_grade(posted_min, posted_max, h1b_avg, market_p50)

    result = {
        "job_id": job_id,
        "company": company,
        "title": title,
        "location": location,
        "posted_min": posted_min,
        "posted_max": posted_max,
        "h1b_actual_avg": h1b_avg,
        "h1b_sample_size": h1b_sample,
        "market_p25": market_p25,
        "market_p50": market_p50,
        "market_p75": market_p75,
        "market_p90": market_p90,
        "community_reported_avg": community_avg,
        "gap_analysis": gap_analysis,
        "negotiation_leverage": leverage,
        "transparency_grade": grade,
    }

    # Cache the result
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        """INSERT OR REPLACE INTO salary_reality
           (job_id, company, title, location, posted_min, posted_max,
            h1b_actual_avg, h1b_sample_size, market_p25, market_p50, market_p75, market_p90,
            community_reported_avg, gap_analysis, negotiation_leverage, transparency_grade,
            computed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            job_id, company, title, location, posted_min, posted_max,
            h1b_avg, h1b_sample, market_p25, market_p50, market_p75, market_p90,
            community_avg, gap_analysis, leverage, grade, now,
        ),
    )
    conn.commit()

    return result


def _compute_gap_analysis(
    posted_min: float | None,
    posted_max: float | None,
    h1b_avg: float | None,
    market_p50: float | None,
    community_avg: float | None,
) -> str:
    """Generate human-readable gap analysis."""
    parts = []

    if posted_min and h1b_avg:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        gap_pct = ((h1b_avg - posted_mid) / posted_mid) * 100
        if gap_pct > 10:
            parts.append(
                f"H1B data shows this company pays {gap_pct:.0f}% more than advertised "
                f"(avg ${h1b_avg:,.0f} vs posted ${posted_mid:,.0f}). "
                f"Negotiate toward ${h1b_avg:,.0f}."
            )
        elif gap_pct < -10:
            parts.append(
                f"Interestingly, H1B data shows lower actual pay (${h1b_avg:,.0f}) "
                f"than posted range — the advertised range may include variable comp."
            )
        else:
            parts.append(
                f"H1B data aligns with posted range (${h1b_avg:,.0f} vs ${posted_mid:,.0f}). "
                f"This company appears transparent on compensation."
            )

    if posted_min and market_p50:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        market_gap = ((posted_mid - market_p50) / market_p50) * 100
        if market_gap > 15:
            parts.append(f"This offer is {market_gap:.0f}% above market median — strong comp.")
        elif market_gap < -15:
            parts.append(f"This offer is {abs(market_gap):.0f}% below market median — room to negotiate.")
        else:
            parts.append("Compensation is in line with market rates.")

    if not posted_min:
        parts.append("No salary disclosed.")
        if market_p50:
            parts.append(f"Market data suggests this role pays around ${market_p50:,.0f} at the median.")
        if h1b_avg:
            parts.append(f"H1B filings show this company pays ~${h1b_avg:,.0f} for similar titles.")

    return " ".join(parts) if parts else "Insufficient data for gap analysis."


def _compute_leverage(
    posted_min: float | None,
    posted_max: float | None,
    h1b_avg: float | None,
    market_p50: float | None,
) -> str:
    """Determine negotiation leverage: STRONG, MODERATE, WEAK, UNKNOWN."""
    if not posted_min and not h1b_avg and not market_p50:
        return "UNKNOWN"

    if posted_min and h1b_avg:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        if h1b_avg > posted_mid * 1.1:
            return "STRONG"
        elif h1b_avg > posted_mid * 1.0:
            return "MODERATE"

    if posted_min and market_p50:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        if market_p50 > posted_mid * 1.1:
            return "STRONG"
        elif market_p50 > posted_mid * 0.95:
            return "MODERATE"
        return "WEAK"

    return "MODERATE"


def _compute_transparency_grade(
    posted_min: float | None,
    posted_max: float | None,
    h1b_avg: float | None,
    market_p50: float | None,
) -> str:
    """Grade company salary transparency: A through F."""
    score = 0

    # Posted a range at all?
    if posted_min and posted_max:
        score += 40
        # Narrow range (< 30% spread)?
        if posted_max > 0:
            spread = (posted_max - posted_min) / posted_max
            if spread < 0.2:
                score += 20  # Very tight range — transparent
            elif spread < 0.3:
                score += 10
    elif posted_min:
        score += 20  # Only minimum posted

    # H1B data alignment?
    if posted_min and h1b_avg:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        gap = abs(h1b_avg - posted_mid) / max(posted_mid, 1)
        if gap < 0.1:
            score += 30  # Great alignment
        elif gap < 0.2:
            score += 15
        # Bigger gap = less transparent

    # Market alignment
    if posted_min and market_p50:
        posted_mid = (posted_min + (posted_max or posted_min)) / 2
        if abs(posted_mid - market_p50) / max(market_p50, 1) < 0.15:
            score += 10

    if score >= 80:
        return "A"
    elif score >= 60:
        return "B"
    elif score >= 40:
        return "C"
    elif score >= 20:
        return "D"
    return "F"


def get_company_salary_reality(company: str, conn: sqlite3.Connection) -> list[dict]:
    """Get all salary reality data for a company."""
    rows = conn.execute(
        """SELECT * FROM salary_reality
           WHERE LOWER(company) LIKE ?
           ORDER BY computed_at DESC LIMIT 50""",
        (f"%{company.lower()}%",),
    ).fetchall()
    return [dict(r) for r in rows]


def get_role_salary_benchmarks(
    role: str,
    location: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Get salary benchmarks for a role across all companies."""
    conditions = ["salary_min > 0", "LOWER(title) LIKE ?"]
    params: list = [f"%{role.lower()}%"]

    if location:
        conditions.append("LOWER(location) LIKE ?")
        params.append(f"%{location.lower()}%")

    where = " AND ".join(conditions)
    rows = conn.execute(
        f"""SELECT salary_min, salary_max, company, title, location
            FROM jobs WHERE {where}
            ORDER BY salary_min""",
        params,
    ).fetchall()

    if not rows:
        return {"role": role, "location": location, "data_points": 0, "percentiles": {}}

    salaries = sorted([
        (dict(r)["salary_min"] + (dict(r)["salary_max"] or dict(r)["salary_min"])) / 2
        for r in rows
    ])
    n = len(salaries)

    # Top companies by salary
    company_salaries: dict[str, list] = {}
    for r in rows:
        rd = dict(r)
        comp = rd["company"]
        mid = (rd["salary_min"] + (rd["salary_max"] or rd["salary_min"])) / 2
        company_salaries.setdefault(comp, []).append(mid)

    top_companies = sorted(
        [
            {"company": c, "avg_salary": round(sum(sals) / len(sals)), "sample_size": len(sals)}
            for c, sals in company_salaries.items()
        ],
        key=lambda x: x["avg_salary"],
        reverse=True,
    )[:10]

    return {
        "role": role,
        "location": location,
        "data_points": n,
        "percentiles": {
            "p10": round(salaries[int(n * 0.10)]) if n > 1 else None,
            "p25": round(salaries[int(n * 0.25)]) if n > 1 else None,
            "p50": round(salaries[int(n * 0.50)]) if n > 0 else None,
            "p75": round(salaries[int(n * 0.75)]) if n > 1 else None,
            "p90": round(salaries[min(int(n * 0.90), n - 1)]) if n > 1 else None,
        },
        "avg_salary": round(sum(salaries) / n) if n > 0 else None,
        "top_companies": top_companies,
    }
