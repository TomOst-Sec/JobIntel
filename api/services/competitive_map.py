"""Competitive Hiring Intelligence Map — who competes for the same talent.

Answers the question: 'Who is competing with me for this hire?'
Cross-company role matching, salary positioning, hiring urgency,
talent scarcity scoring, and market-clearing salary estimation.
"""
import json
import sqlite3
from datetime import datetime


def build_competitive_landscape(
    role: str,
    location: str | None,
    seniority: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Build the competitive hiring landscape for a role/location.

    Returns structured data for the competitive_landscape table.
    """
    role_lower = role.lower().strip()
    role_key = role_lower.replace(" ", "_")
    location_key = (location or "global").lower().strip().replace(" ", "_")

    # Find competing postings
    conditions = ["LOWER(title) LIKE ?"]
    params: list = [f"%{role_lower}%"]

    if location:
        conditions.append("LOWER(location) LIKE ?")
        params.append(f"%{location.lower()}%")

    if seniority:
        conditions.append("LOWER(title) LIKE ?")
        params.append(f"%{seniority.lower()}%")

    where = " AND ".join(conditions)
    postings = conn.execute(
        f"""SELECT job_id, company, title, location, salary_min, salary_max,
                   ghost_score, posted_at, scraped_at
            FROM jobs
            WHERE {where}
              AND scraped_at >= datetime('now', '-60 days')
            ORDER BY scraped_at DESC""",
        params,
    ).fetchall()

    if not postings:
        return {
            "role_key": role_key,
            "location_key": location_key,
            "seniority": seniority,
            "total_competing_companies": 0,
            "total_competing_postings": 0,
            "talent_scarcity_score": None,
            "companies_data": [],
        }

    # Group by company
    company_data: dict[str, dict] = {}
    for row in postings:
        p = dict(row)
        comp = p["company"] or "Unknown"
        comp_key = comp.lower()
        if comp_key not in company_data:
            company_data[comp_key] = {
                "company": comp,
                "postings": [],
                "salaries": [],
                "ghost_scores": [],
            }
        company_data[comp_key]["postings"].append(p)
        if p["salary_min"] and p["salary_min"] > 0:
            mid = (p["salary_min"] + (p["salary_max"] or p["salary_min"])) / 2
            company_data[comp_key]["salaries"].append(mid)
        if p["ghost_score"] is not None:
            company_data[comp_key]["ghost_scores"].append(p["ghost_score"])

    # Compute per-company metrics
    all_salaries = []
    companies_analysis = []
    for comp_key, data in company_data.items():
        avg_salary = None
        if data["salaries"]:
            avg_salary = round(sum(data["salaries"]) / len(data["salaries"]))
            all_salaries.extend(data["salaries"])

        avg_ghost = None
        ghost_rate = 0
        if data["ghost_scores"]:
            avg_ghost = round(sum(data["ghost_scores"]) / len(data["ghost_scores"]))
            ghost_rate = sum(1 for g in data["ghost_scores"] if g >= 50) / len(data["ghost_scores"])

        # Hiring urgency based on posting velocity and recency
        posting_count = len(data["postings"])
        most_recent = data["postings"][0]["scraped_at"] if data["postings"] else None
        urgency = _compute_urgency(posting_count, most_recent)

        companies_analysis.append({
            "company": data["company"],
            "posting_count": posting_count,
            "avg_salary": avg_salary,
            "salary_position": _salary_position(avg_salary, all_salaries) if avg_salary else None,
            "ghost_rate": round(ghost_rate, 2),
            "avg_ghost_score": avg_ghost,
            "urgency": urgency,
        })

    # Sort by posting count (most active competitors first)
    companies_analysis.sort(key=lambda c: c["posting_count"], reverse=True)

    # Talent scarcity score (0-100)
    scarcity = _compute_scarcity(len(postings), len(company_data), all_salaries)

    # Market-clearing salary
    market_salary_min = None
    market_salary_max = None
    if all_salaries:
        sorted_sal = sorted(all_salaries)
        n = len(sorted_sal)
        market_salary_min = round(sorted_sal[int(n * 0.25)]) if n > 1 else round(sorted_sal[0])
        market_salary_max = round(sorted_sal[min(int(n * 0.75), n - 1)])

    result = {
        "role_key": role_key,
        "location_key": location_key,
        "seniority": seniority,
        "snapshot_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "total_competing_companies": len(company_data),
        "total_competing_postings": len(postings),
        "talent_scarcity_score": scarcity,
        "market_clearing_salary_min": market_salary_min,
        "market_clearing_salary_max": market_salary_max,
        "companies_data": companies_analysis[:20],
    }

    # Cache in competitive_landscape table
    conn.execute(
        """INSERT INTO competitive_landscape
           (role_key, location_key, seniority, snapshot_date,
            total_competing_companies, total_competing_postings,
            talent_scarcity_score, market_clearing_salary_min, market_clearing_salary_max,
            companies_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            result["role_key"], result["location_key"], seniority,
            result["snapshot_date"],
            result["total_competing_companies"],
            result["total_competing_postings"],
            result["talent_scarcity_score"],
            result["market_clearing_salary_min"],
            result["market_clearing_salary_max"],
            json.dumps(result["companies_data"]),
        ),
    )
    conn.commit()

    return result


def get_cached_landscape(
    role: str, location: str | None, conn: sqlite3.Connection
) -> dict | None:
    """Get cached competitive landscape if fresh (< 24 hours)."""
    role_key = role.lower().strip().replace(" ", "_")
    location_key = (location or "global").lower().strip().replace(" ", "_")

    row = conn.execute(
        """SELECT * FROM competitive_landscape
           WHERE role_key = ? AND location_key = ?
             AND created_at >= datetime('now', '-1 day')
           ORDER BY created_at DESC LIMIT 1""",
        (role_key, location_key),
    ).fetchone()

    if not row:
        return None

    r = dict(row)
    r["companies_data"] = json.loads(r["companies_data"]) if r["companies_data"] else []
    return r


def get_company_competitors(
    company: str, conn: sqlite3.Connection
) -> list[dict]:
    """Find companies competing for the same talent as given company.

    Looks at overlapping roles being hired for.
    """
    company_lower = company.lower().strip()

    # Get roles this company is hiring for
    roles = conn.execute(
        """SELECT DISTINCT LOWER(title) as title_norm, title
           FROM jobs
           WHERE LOWER(company) LIKE ?
             AND scraped_at >= datetime('now', '-60 days')
           LIMIT 20""",
        (f"%{company_lower}%",),
    ).fetchall()

    if not roles:
        return []

    competitor_overlap: dict[str, dict] = {}
    for role_row in roles:
        title_norm = role_row["title_norm"]
        # Find other companies hiring for similar roles
        others = conn.execute(
            """SELECT company, COUNT(*) as cnt
               FROM jobs
               WHERE LOWER(title) LIKE ?
                 AND LOWER(company) NOT LIKE ?
                 AND scraped_at >= datetime('now', '-60 days')
               GROUP BY LOWER(company)
               HAVING cnt >= 1
               ORDER BY cnt DESC
               LIMIT 10""",
            (f"%{title_norm}%", f"%{company_lower}%"),
        ).fetchall()

        for other in others:
            ck = other["company"].lower()
            if ck not in competitor_overlap:
                competitor_overlap[ck] = {
                    "company": other["company"],
                    "overlapping_roles": [],
                    "total_overlap": 0,
                }
            competitor_overlap[ck]["overlapping_roles"].append(role_row["title"])
            competitor_overlap[ck]["total_overlap"] += other["cnt"]

    # Sort by overlap
    competitors = sorted(
        competitor_overlap.values(),
        key=lambda c: c["total_overlap"],
        reverse=True,
    )

    return competitors[:15]


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _compute_urgency(posting_count: int, most_recent: str | None) -> str:
    """Determine hiring urgency for a company/role."""
    if not most_recent:
        return "unknown"
    try:
        recent_dt = datetime.fromisoformat(most_recent)
        days_ago = (datetime.utcnow() - recent_dt).days
    except (ValueError, TypeError):
        return "unknown"

    if posting_count >= 3 and days_ago <= 7:
        return "critical"
    elif posting_count >= 2 and days_ago <= 14:
        return "high"
    elif days_ago <= 30:
        return "moderate"
    return "low"


def _salary_position(salary: float, all_salaries: list[float]) -> str:
    """Determine salary position relative to market."""
    if not all_salaries or not salary:
        return "unknown"
    sorted_sal = sorted(all_salaries)
    n = len(sorted_sal)
    rank = sum(1 for s in sorted_sal if s <= salary) / n
    if rank >= 0.75:
        return "above_market"
    elif rank >= 0.4:
        return "at_market"
    return "below_market"


def _compute_scarcity(
    total_postings: int,
    unique_companies: int,
    salaries: list[float],
) -> float:
    """Compute talent scarcity score (0-100).

    Higher score = harder to hire.
    """
    score = 0.0

    # More companies competing = more scarce
    if unique_companies >= 20:
        score += 30
    elif unique_companies >= 10:
        score += 20
    elif unique_companies >= 5:
        score += 10

    # More postings = more demand
    if total_postings >= 50:
        score += 25
    elif total_postings >= 20:
        score += 15
    elif total_postings >= 10:
        score += 8

    # High salaries indicate scarcity
    if salaries:
        median_sal = sorted(salaries)[len(salaries) // 2]
        if median_sal >= 200000:
            score += 25
        elif median_sal >= 150000:
            score += 15
        elif median_sal >= 100000:
            score += 8

    # Ratio of companies to postings
    if unique_companies > 0:
        ratio = total_postings / unique_companies
        if ratio >= 3:
            score += 20  # Companies posting multiple roles = desperate
        elif ratio >= 2:
            score += 10

    return min(100, score)
