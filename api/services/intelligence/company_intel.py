"""Deep company intelligence reports — hiring patterns, salary intel, growth trajectory."""
import json
import sqlite3

import anthropic

from api.config import get_settings


def generate_company_report(company: str, db: sqlite3.Connection) -> dict:
    """Generate a comprehensive company intelligence report."""
    settings = get_settings()

    # Gather all company data
    jobs = db.execute("""
        SELECT title, search_category, market_id, salary_min, salary_max,
            is_remote, posted_at, source, required_skills
        FROM jobs WHERE company LIKE ?
        ORDER BY posted_at DESC
    """, (f"%{company}%",)).fetchall()
    jobs_list = [dict(r) for r in jobs]

    if not jobs_list:
        return {"company": company, "error": "No data found for this company"}

    # Aggregate stats
    total_postings = len(jobs_list)
    markets = list(set(j["market_id"] for j in jobs_list if j["market_id"]))
    categories = list(set(j["search_category"] for j in jobs_list if j["search_category"]))

    salary_jobs = [j for j in jobs_list if j.get("salary_min") and j["salary_min"] > 0]
    avg_salary_min = round(sum(j["salary_min"] for j in salary_jobs) / len(salary_jobs)) if salary_jobs else None
    avg_salary_max = round(sum(j["salary_max"] for j in salary_jobs if j.get("salary_max")) / len([j for j in salary_jobs if j.get("salary_max")])) if [j for j in salary_jobs if j.get("salary_max")] else None

    remote_pct = round(100 * sum(1 for j in jobs_list if j.get("is_remote")) / total_postings, 1) if total_postings else 0

    # Weekly hiring trend
    weekly_trend = db.execute("""
        SELECT strftime('%Y-W%W', posted_at) as week, COUNT(*) as postings
        FROM jobs WHERE company LIKE ?
        AND posted_at >= datetime('now', '-90 days')
        GROUP BY week ORDER BY week
    """, (f"%{company}%",)).fetchall()

    # Skill frequency
    skill_freq = {}
    for j in jobs_list:
        skills = j.get("required_skills", "") or ""
        for s in skills.split(","):
            s = s.strip().lower()
            if s:
                skill_freq[s] = skill_freq.get(s, 0) + 1
    top_skills = dict(sorted(skill_freq.items(), key=lambda x: x[1], reverse=True)[:15])

    # Department breakdown
    dept_breakdown = {}
    for j in jobs_list:
        cat = j.get("search_category", "other")
        dept_breakdown[cat] = dept_breakdown.get(cat, 0) + 1

    # Ghost job data
    ghost_data = db.execute("""
        SELECT COUNT(*) as total,
            SUM(CASE WHEN ghost_score >= 50 THEN 1 ELSE 0 END) as ghosts,
            ROUND(AVG(ghost_score), 1) as avg_ghost_score
        FROM jobs WHERE company LIKE ? AND ghost_score > 0
    """, (f"%{company}%",)).fetchone()

    # Existing intel cache
    cached = db.execute(
        "SELECT layoff_risk_score, ipo_probability FROM company_intel_cache WHERE company = ?",
        (company,),
    ).fetchone()

    report_data = {
        "company": company,
        "total_postings": total_postings,
        "markets": markets,
        "categories": categories,
        "salary_intel": {
            "avg_min": avg_salary_min,
            "avg_max": avg_salary_max,
            "sample_size": len(salary_jobs),
        },
        "remote_percentage": remote_pct,
        "weekly_trend": [dict(r) for r in weekly_trend],
        "top_skills": top_skills,
        "department_breakdown": dept_breakdown,
        "ghost_analysis": dict(ghost_data) if ghost_data else {},
        "risk_scores": {
            "layoff_risk": dict(cached)["layoff_risk_score"] if cached else None,
            "ipo_probability": dict(cached)["ipo_probability"] if cached else None,
        },
    }

    # AI narrative
    ai_narrative = _generate_ai_narrative(company, report_data)
    report_data["ai_narrative"] = ai_narrative

    # Determine trajectory
    weekly_data = [dict(r) for r in weekly_trend]
    if len(weekly_data) >= 4:
        first_half = sum(w["postings"] for w in weekly_data[:len(weekly_data)//2])
        second_half = sum(w["postings"] for w in weekly_data[len(weekly_data)//2:])
        if second_half > first_half * 1.3:
            trajectory = "scaling"
        elif second_half < first_half * 0.7:
            trajectory = "contracting"
        else:
            trajectory = "stable"
    else:
        trajectory = "insufficient_data"
    report_data["trajectory"] = trajectory

    # Cache the full report
    db.execute("""
        INSERT OR REPLACE INTO company_intel_cache
            (company, intel_data, trajectory, computed_at)
        VALUES (?, ?, ?, datetime('now'))
    """, (company, json.dumps(report_data, default=str), trajectory))
    db.commit()

    return report_data


def get_market_signals(
    db: sqlite3.Connection,
    signal_type: str | None = None,
    company: str | None = None,
    limit: int = 50,
) -> list[dict]:
    """Query market signals log."""
    sql = "SELECT * FROM market_signals WHERE 1=1"
    params: list = []

    if signal_type:
        sql += " AND signal_type = ?"
        params.append(signal_type)
    if company:
        sql += " AND company LIKE ?"
        params.append(f"%{company}%")

    sql += " ORDER BY detected_at DESC LIMIT ?"
    params.append(limit)

    rows = db.execute(sql, params).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["data_points"] = json.loads(d["data_points"]) if d["data_points"] else {}
        results.append(d)
    return results


def _generate_ai_narrative(company: str, data: dict) -> str:
    """Generate an AI narrative for the company intelligence report."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return ""

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            messages=[{
                "role": "user",
                "content": f"""Write a concise intelligence briefing for {company} based on this hiring data.

Key data:
- Total postings: {data['total_postings']}
- Markets: {data['markets']}
- Departments: {json.dumps(data['department_breakdown'])}
- Weekly trend: {json.dumps(data['weekly_trend'])}
- Salary range: ${data['salary_intel']['avg_min'] or 'N/A'} - ${data['salary_intel']['avg_max'] or 'N/A'}
- Remote: {data['remote_percentage']}%
- Top skills: {json.dumps(data['top_skills'])}
- Ghost job indicators: {json.dumps(data['ghost_analysis'])}

Write 3-4 paragraphs covering:
1. Overall hiring health and trajectory
2. Key departments and growth areas
3. Salary competitiveness and red flags
4. Actionable insights for candidates/recruiters""",
            }],
        )
        return response.content[0].text.strip()
    except Exception:
        return ""
