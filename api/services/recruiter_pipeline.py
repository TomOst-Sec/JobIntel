"""Pipeline management service + AI daily briefing.

Manages the recruiter's candidate pipeline (Kanban stages)
and generates daily briefings using Claude Haiku.
"""
import json
import sqlite3
import uuid
from datetime import datetime

import anthropic

from api.config import get_settings


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _load_candidate(candidate_id: str, conn: sqlite3.Connection) -> dict:
    """Load candidate and format for response."""
    row = conn.execute(
        "SELECT * FROM candidates WHERE candidate_id = ?",
        (candidate_id,),
    ).fetchone()
    if not row:
        raise ValueError("Candidate not found")
    c = dict(row)
    try:
        skills = json.loads(c.get("skills") or "[]")
    except (json.JSONDecodeError, TypeError):
        skills = []
    return {
        "candidate_id": c["candidate_id"],
        "full_name": c["full_name"],
        "headline": c.get("headline"),
        "skills": skills,
        "experience_years": c.get("experience_years"),
        "current_company": c.get("current_company"),
        "current_title": c.get("current_title"),
        "location": c.get("location"),
        "country": c.get("country"),
        "is_remote_ok": bool(c.get("is_remote_ok", 1)),
        "salary_min": c.get("salary_min"),
        "salary_max": c.get("salary_max"),
        "availability": c.get("availability", "active"),
        "summary": c.get("summary"),
        "email": c.get("email"),
    }


def add_to_pipeline(
    recruiter_id: int,
    candidate_id: str,
    search_id: str | None,
    job_title: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Add a candidate to the recruiter's pipeline."""
    candidate = _load_candidate(candidate_id, conn)
    pipeline_id = str(uuid.uuid4())

    conn.execute(
        """INSERT INTO recruiter_pipeline
           (pipeline_id, recruiter_id, candidate_id, search_id, job_title, stage)
           VALUES (?, ?, ?, ?, ?, 'sourced')""",
        (pipeline_id, recruiter_id, candidate_id, search_id, job_title),
    )
    conn.commit()

    return {
        "pipeline_id": pipeline_id,
        "candidate": candidate,
        "stage": "sourced",
        "notes": None,
        "rating": None,
        "search_id": search_id,
        "job_title": job_title,
        "updated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
    }


def update_pipeline(
    pipeline_id: str,
    recruiter_id: int,
    stage: str | None,
    notes: str | None,
    rating: int | None,
    conn: sqlite3.Connection,
) -> dict:
    """Update a pipeline entry (stage, notes, rating)."""
    row = conn.execute(
        "SELECT * FROM recruiter_pipeline WHERE pipeline_id = ? AND recruiter_id = ?",
        (pipeline_id, recruiter_id),
    ).fetchone()
    if not row:
        raise ValueError("Pipeline entry not found")

    updates = []
    params: list = []
    if stage is not None:
        updates.append("stage = ?")
        params.append(stage)
    if notes is not None:
        updates.append("notes = ?")
        params.append(notes)
    if rating is not None:
        updates.append("rating = ?")
        params.append(rating)

    if updates:
        updates.append("updated_at = datetime('now')")
        set_clause = ", ".join(updates)
        params.extend([pipeline_id, recruiter_id])
        conn.execute(
            f"UPDATE recruiter_pipeline SET {set_clause} WHERE pipeline_id = ? AND recruiter_id = ?",
            params,
        )
        conn.commit()

    updated = conn.execute(
        "SELECT * FROM recruiter_pipeline WHERE pipeline_id = ?",
        (pipeline_id,),
    ).fetchone()
    p = dict(updated)
    candidate = _load_candidate(p["candidate_id"], conn)

    return {
        "pipeline_id": p["pipeline_id"],
        "candidate": candidate,
        "stage": p["stage"],
        "notes": p.get("notes"),
        "rating": p.get("rating"),
        "search_id": p.get("search_id"),
        "job_title": p.get("job_title"),
        "updated_at": p.get("updated_at"),
        "created_at": p.get("created_at"),
    }


def get_pipeline(
    recruiter_id: int,
    stage_filter: str | None,
    conn: sqlite3.Connection,
) -> list[dict]:
    """Get pipeline entries, optionally filtered by stage."""
    if stage_filter:
        rows = conn.execute(
            """SELECT * FROM recruiter_pipeline
               WHERE recruiter_id = ? AND stage = ?
               ORDER BY updated_at DESC""",
            (recruiter_id, stage_filter),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT * FROM recruiter_pipeline
               WHERE recruiter_id = ?
               ORDER BY updated_at DESC""",
            (recruiter_id,),
        ).fetchall()

    results = []
    for row in rows:
        p = dict(row)
        try:
            candidate = _load_candidate(p["candidate_id"], conn)
        except ValueError:
            continue
        results.append({
            "pipeline_id": p["pipeline_id"],
            "candidate": candidate,
            "stage": p["stage"],
            "notes": p.get("notes"),
            "rating": p.get("rating"),
            "search_id": p.get("search_id"),
            "job_title": p.get("job_title"),
            "updated_at": p.get("updated_at"),
            "created_at": p.get("created_at"),
        })
    return results


def get_pipeline_stats(recruiter_id: int, conn: sqlite3.Connection) -> dict:
    """Get pipeline counts per stage."""
    rows = conn.execute(
        """SELECT stage, COUNT(*) as cnt FROM recruiter_pipeline
           WHERE recruiter_id = ? GROUP BY stage""",
        (recruiter_id,),
    ).fetchall()

    stats = {
        "sourced": 0, "contacted": 0, "responded": 0,
        "interview": 0, "offer": 0, "hired": 0,
        "rejected": 0, "withdrawn": 0, "total": 0,
    }
    total = 0
    for row in rows:
        r = dict(row)
        stats[r["stage"]] = r["cnt"]
        total += r["cnt"]
    stats["total"] = total
    return stats


def remove_from_pipeline(
    pipeline_id: str,
    recruiter_id: int,
    conn: sqlite3.Connection,
) -> None:
    """Remove a candidate from the pipeline."""
    row = conn.execute(
        "SELECT id FROM recruiter_pipeline WHERE pipeline_id = ? AND recruiter_id = ?",
        (pipeline_id, recruiter_id),
    ).fetchone()
    if not row:
        raise ValueError("Pipeline entry not found")

    conn.execute(
        "DELETE FROM recruiter_pipeline WHERE pipeline_id = ? AND recruiter_id = ?",
        (pipeline_id, recruiter_id),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# AI Daily Briefing
# ---------------------------------------------------------------------------

BRIEFING_PROMPT = """You are an AI recruiting assistant generating a daily briefing.

PIPELINE: {pipeline_summary}
RECENT ACTIVITY: {recent_activity}

Generate a briefing with these sections:
1. PIPELINE HEALTH: Status of active candidates, bottlenecks
2. ACTION ITEMS: Candidates needing follow-up, stale pipeline entries
3. RECOMMENDATIONS: Next best actions

Be concise and actionable. Use specific numbers.
Return valid JSON:
{{
    "sections": [
        {{"title": "Pipeline Health", "content": "..."}},
        {{"title": "Action Items", "content": "..."}},
        {{"title": "Recommendations", "content": "..."}}
    ],
    "action_items": ["item1", "item2", "item3"]
}}"""


def generate_daily_briefing(
    recruiter_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Generate or retrieve cached daily briefing."""
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Check cache
    cached = conn.execute(
        "SELECT content FROM recruiter_briefings WHERE recruiter_id = ? AND briefing_date = ?",
        (recruiter_id, today),
    ).fetchone()
    if cached:
        data = json.loads(cached["content"])
        stats = get_pipeline_stats(recruiter_id, conn)
        return {
            "date": today,
            "sections": data.get("sections", []),
            "pipeline_summary": stats,
            "action_items": data.get("action_items", []),
        }

    # Generate new briefing
    stats = get_pipeline_stats(recruiter_id, conn)

    # Recent activity: pipeline changes in last 7 days
    recent = conn.execute(
        """SELECT stage, COUNT(*) as cnt FROM recruiter_pipeline
           WHERE recruiter_id = ? AND updated_at >= datetime('now', '-7 days')
           GROUP BY stage""",
        (recruiter_id,),
    ).fetchall()
    recent_activity = json.dumps([dict(r) for r in recent]) if recent else "No recent activity"

    # Outreach stats
    outreach_sent = conn.execute(
        """SELECT COUNT(*) FROM recruiter_outreach
           WHERE recruiter_id = ? AND sent_at IS NOT NULL
           AND sent_at >= datetime('now', '-7 days')""",
        (recruiter_id,),
    ).fetchone()[0]

    pipeline_summary = json.dumps(stats)

    prompt = BRIEFING_PROMPT.format(
        pipeline_summary=pipeline_summary,
        recent_activity=f"{recent_activity}. Outreach sent this week: {outreach_sent}",
    )

    # Fallback to template if no API key is configured
    settings = get_settings()
    if not settings.anthropic_api_key:
        active_stages = ["sourced", "contacted", "responded", "interview", "offer"]
        active_count = sum(stats.get(s, 0) for s in active_stages)
        stale_note = (
            f"{recent_activity}" if recent_activity != "No recent activity"
            else "No pipeline movement in the last 7 days — consider following up with candidates."
        )
        data = {
            "sections": [
                {
                    "title": "Pipeline Health",
                    "content": (
                        f"You have {stats['total']} candidates in your pipeline "
                        f"({active_count} active). "
                        f"Breakdown: {stats.get('sourced', 0)} sourced, "
                        f"{stats.get('contacted', 0)} contacted, "
                        f"{stats.get('responded', 0)} responded, "
                        f"{stats.get('interview', 0)} in interview, "
                        f"{stats.get('offer', 0)} at offer stage."
                    ),
                },
                {
                    "title": "Action Items",
                    "content": (
                        f"Outreach sent this week: {outreach_sent}. {stale_note} "
                        f"Review candidates in the 'sourced' stage and move them forward."
                    ),
                },
                {
                    "title": "Recommendations",
                    "content": (
                        "Follow up with contacted candidates who have not responded. "
                        "Consider expanding your sourcing criteria if your pipeline is thin."
                    ),
                },
            ],
            "action_items": [
                f"Follow up with {stats.get('contacted', 0)} contacted candidates",
                "Review and advance sourced candidates",
                "Send outreach to new prospects",
            ],
        }
        conn.execute(
            """INSERT OR REPLACE INTO recruiter_briefings (recruiter_id, briefing_date, content)
               VALUES (?, ?, ?)""",
            (recruiter_id, today, json.dumps(data)),
        )
        conn.commit()
        return {
            "date": today,
            "sections": data["sections"],
            "pipeline_summary": stats,
            "action_items": data["action_items"],
        }

    try:
        client = _get_client()
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)
    except Exception:
        data = {
            "sections": [
                {"title": "Pipeline Health", "content": f"You have {stats['total']} candidates in your pipeline."},
                {"title": "Action Items", "content": "Review your pipeline and follow up with candidates."},
                {"title": "Recommendations", "content": "Start new searches to fill your pipeline."},
            ],
            "action_items": ["Review pipeline", "Follow up with stale candidates", "Start new search"],
        }

    # Cache the briefing
    conn.execute(
        """INSERT OR REPLACE INTO recruiter_briefings (recruiter_id, briefing_date, content)
           VALUES (?, ?, ?)""",
        (recruiter_id, today, json.dumps(data)),
    )
    conn.commit()

    return {
        "date": today,
        "sections": data.get("sections", []),
        "pipeline_summary": stats,
        "action_items": data.get("action_items", []),
    }
