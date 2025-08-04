"""Claude-powered report generation engine for weekly intelligence reports."""
import json
import sqlite3
import time
import uuid

import anthropic

from api.config import get_settings


REPORT_SYSTEM_PROMPT = """You are JobIntel's Chief Intelligence Analyst writing the weekly market briefing.
You transform raw hiring data into actionable intelligence that drives real decisions.

Rules:
- Every claim MUST cite a specific number from the data
- Call out anomalies — what's weird this week?
- Be opinionated — rank companies, call out BS
- Include a "hot take" that's contrarian but data-backed
- Use concrete numbers, not vague descriptions
- Write for both recruiters (who to pitch) and job seekers (where to apply)"""


def generate_weekly_data(conn: sqlite3.Connection) -> dict:
    """Gather comprehensive data for the weekly report."""
    data = {}

    # Overall stats
    data["total_jobs"] = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    data["new_this_week"] = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE posted_at >= datetime('now', '-7 days')"
    ).fetchone()[0]
    data["new_last_week"] = conn.execute(
        "SELECT COUNT(*) FROM jobs WHERE posted_at >= datetime('now', '-14 days') AND posted_at < datetime('now', '-7 days')"
    ).fetchone()[0]

    # Scaling companies
    scaling = conn.execute("""
        SELECT company, market_id, COUNT(*) as postings,
            COUNT(DISTINCT search_category) as categories
        FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        GROUP BY company, market_id HAVING COUNT(*) >= 3
        ORDER BY postings DESC LIMIT 15
    """).fetchall()
    data["scaling_companies"] = [dict(r) for r in scaling]

    # Companies that stopped hiring (were active, now silent)
    data["gone_silent"] = [dict(r) for r in conn.execute("""
        SELECT company, COUNT(*) as historical
        FROM jobs WHERE company IN (
            SELECT company FROM jobs
            WHERE posted_at >= datetime('now', '-60 days')
            AND posted_at < datetime('now', '-14 days')
            GROUP BY company HAVING COUNT(*) >= 5
        )
        AND company NOT IN (
            SELECT company FROM jobs
            WHERE posted_at >= datetime('now', '-7 days')
        )
        GROUP BY company
        ORDER BY historical DESC LIMIT 10
    """).fetchall()]

    # Salary trends by category
    data["salary_trends"] = [dict(r) for r in conn.execute("""
        SELECT search_category,
            ROUND(AVG(salary_min), 0) as avg_min,
            ROUND(AVG(salary_max), 0) as avg_max,
            COUNT(*) as job_count,
            MAX(salary_max) as highest
        FROM jobs
        WHERE salary_min > 0 AND posted_at >= datetime('now', '-7 days')
        GROUP BY search_category
        ORDER BY job_count DESC LIMIT 15
    """).fetchall()]

    # Ghost job stats
    data["ghost_stats"] = {
        "total_ghosts": conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE ghost_score >= 50"
        ).fetchone()[0],
        "new_ghosts_this_week": conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE ghost_score >= 50 AND posted_at >= datetime('now', '-7 days')"
        ).fetchone()[0],
    }
    data["top_ghost_companies"] = [dict(r) for r in conn.execute("""
        SELECT company, COUNT(*) as ghost_count,
            ROUND(AVG(ghost_score), 1) as avg_score
        FROM jobs WHERE ghost_score >= 50
        GROUP BY company ORDER BY ghost_count DESC LIMIT 5
    """).fetchall()]

    # Layoff risk companies
    data["high_risk_companies"] = [dict(r) for r in conn.execute("""
        SELECT company, layoff_risk_score, trajectory
        FROM company_intel_cache
        WHERE layoff_risk_score > 25 AND computed_at >= datetime('now', '-7 days')
        ORDER BY layoff_risk_score DESC LIMIT 10
    """).fetchall()]

    # IPO candidates
    data["ipo_candidates"] = [dict(r) for r in conn.execute("""
        SELECT company, ipo_probability, trajectory
        FROM company_intel_cache
        WHERE ipo_probability > 0.15 AND computed_at >= datetime('now', '-7 days')
        ORDER BY ipo_probability DESC LIMIT 5
    """).fetchall()]

    # Market comparison
    data["market_comparison"] = [dict(r) for r in conn.execute("""
        SELECT market_id, COUNT(*) as total_jobs,
            COUNT(DISTINCT company) as companies,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN (salary_min + COALESCE(salary_max, salary_min)) / 2.0 END), 0) as avg_salary,
            ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1) as remote_pct,
            SUM(CASE WHEN posted_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as new_this_week
        FROM jobs GROUP BY market_id
        ORDER BY new_this_week DESC
    """).fetchall()]

    # Lifecycle stats
    data["lifecycle"] = {
        "stale_jobs": conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE lifecycle_status = 'stale'"
        ).fetchone()[0],
        "active_jobs": conn.execute(
            "SELECT COUNT(*) FROM jobs WHERE lifecycle_status = 'active' OR lifecycle_status IS NULL"
        ).fetchone()[0],
    }

    # Remote vs onsite trend
    data["remote_trend"] = {
        "this_week_remote_pct": conn.execute("""
            SELECT ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1)
            FROM jobs WHERE posted_at >= datetime('now', '-7 days')
        """).fetchone()[0] or 0,
        "last_week_remote_pct": conn.execute("""
            SELECT ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1)
            FROM jobs WHERE posted_at >= datetime('now', '-14 days') AND posted_at < datetime('now', '-7 days')
        """).fetchone()[0] or 0,
    }

    return data


def generate_report_with_claude(data: dict, report_type: str = "public") -> dict:
    """Generate a weekly report using Claude Sonnet."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return _fallback_report(data)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    start_time = time.time()

    data_json = json.dumps(data, indent=2, default=str)

    user_prompt = f"""DATA THIS WEEK:
{data_json}

Write the weekly JobIntel Intelligence Report with these exact sections:

1. EXECUTIVE SUMMARY (3 bullet points — the biggest moves this week)
2. HIRING VELOCITY (which companies ramped up/down, velocity changes, week-over-week trends)
3. SALARY INTELLIGENCE (notable salary movements, outliers, highest-paying roles)
4. GHOST JOB ALERT (worst offenders, new ghost patterns, what percentage of postings are ghosts)
5. LAYOFF RADAR (companies showing distress signals, department-level risks)
6. IPO WATCH (companies with pre-IPO hiring patterns, timeline estimates)
7. MARKET COMPARISON (market-by-market breakdown: which markets are hot, which are cooling)
8. RECOMMENDED ACTIONS (split into: FOR RECRUITERS: who to pitch / FOR JOB SEEKERS: where to apply now)

After all sections, add a HOT TAKE — one contrarian, data-backed opinion that challenges conventional wisdom.

Return your response as JSON:
{{
    "title": "Weekly Intelligence Report — [date range or theme]",
    "summary": "2-3 sentence executive summary",
    "sections": [
        {{"heading": "Executive Summary", "body": "full markdown content", "highlights": ["highlight1", "highlight2"]}},
        {{"heading": "Hiring Velocity", "body": "...", "highlights": [...]}},
        ...
    ],
    "hot_take": "Your contrarian, data-backed take"
}}

Return ONLY valid JSON."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            system=REPORT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        if text.endswith("```"):
            text = text[:-3].strip()

        report = json.loads(text)
    except (json.JSONDecodeError, Exception):
        report = _fallback_report(data)

    generation_time_ms = int((time.time() - start_time) * 1000)
    report["generation_time_ms"] = generation_time_ms
    report["ai_model"] = "claude-sonnet-4-20250514"

    return report


def store_report(
    conn: sqlite3.Connection,
    report: dict,
    user_id: int | None = None,
    is_public: bool = False,
) -> int:
    """Store a generated report in the database."""
    public_slug = None
    if is_public:
        from datetime import datetime, timedelta
        now = datetime.now()
        week_num = now.isocalendar()[1]
        public_slug = f"{now.year}-w{week_num:02d}"

    # Calculate week boundaries
    from datetime import datetime, timedelta
    now = datetime.now()
    week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
    week_end = now.strftime("%Y-%m-%d")

    cursor = conn.execute("""
        INSERT INTO generated_reports
            (user_id, report_type, content, public_slug, title, summary, sections,
             is_public, week_start, week_end, ai_model, generation_time_ms)
        VALUES (?, 'weekly', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        json.dumps(report, default=str),
        public_slug,
        report.get("title", "Weekly Intelligence Report"),
        report.get("summary", ""),
        json.dumps(report.get("sections", []), default=str),
        1 if is_public else 0,
        week_start,
        week_end,
        report.get("ai_model", ""),
        report.get("generation_time_ms", 0),
    ))
    conn.commit()
    return cursor.lastrowid


def _fallback_report(data: dict) -> dict:
    """Generate a basic report without AI when API key is missing."""
    return {
        "title": "Weekly JobIntel Report",
        "summary": f"{data.get('new_this_week', 0)} new jobs tracked this week across {len(data.get('market_comparison', []))} markets.",
        "sections": [
            {
                "heading": "Executive Summary",
                "body": f"This week we tracked {data.get('new_this_week', 0)} new job postings (vs {data.get('new_last_week', 0)} last week). "
                        f"Total database: {data.get('total_jobs', 0)} jobs.",
                "highlights": [
                    f"{data.get('new_this_week', 0)} new jobs this week",
                    f"{len(data.get('scaling_companies', []))} companies scaling",
                ],
            },
        ],
        "hot_take": "No AI analysis available — configure ANTHROPIC_API_KEY for full reports.",
    }
