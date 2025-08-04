"""Personal AI Agent Service — 24/7 market monitoring and autonomous job search.

Every user gets a personal AI agent that:
- Monitors the market for opportunities matching their profile
- Alerts on high-confidence matches
- Suggests skill development based on market trends
- Prepares for interviews with company-specific insights
- Manages freelance pipeline alongside full-time search
"""
import json
import sqlite3
from datetime import datetime, timedelta

from api.services.matching_engine import compute_match, batch_compute_matches
from api.services.ai_provider import ai_complete_json


# ═══════════════════════════════════════════════════
# AGENT CONFIG
# ═══════════════════════════════════════════════════

def get_agent_config(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get or create AI agent configuration for a user."""
    row = conn.execute("SELECT * FROM ai_agent_config WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        result = dict(row)
        for field in ("target_roles", "target_companies", "excluded_companies",
                       "company_stage_prefs", "culture_values"):
            if result.get(field):
                try:
                    result[field] = json.loads(result[field])
                except (json.JSONDecodeError, TypeError):
                    result[field] = []
        return result

    # Create default config
    conn.execute("""
        INSERT INTO ai_agent_config (user_id, is_active, agent_mode)
        VALUES (?, 1, 'monitor')
    """, (user_id,))
    conn.commit()
    return get_agent_config(user_id, conn)


def update_agent_config(user_id: int, updates: dict, conn: sqlite3.Connection) -> dict:
    """Update AI agent configuration."""
    allowed_fields = {
        "is_active", "agent_mode", "target_roles", "target_companies",
        "excluded_companies", "min_salary", "max_commute_minutes",
        "remote_preference", "company_stage_prefs", "culture_values",
        "alert_frequency", "alert_min_match_score", "email_alerts",
        "push_alerts", "auto_apply", "auto_respond", "auto_negotiate",
    }

    filtered = {}
    for k, v in updates.items():
        if k in allowed_fields:
            if isinstance(v, (list, dict)):
                filtered[k] = json.dumps(v)
            elif isinstance(v, bool):
                filtered[k] = int(v)
            else:
                filtered[k] = v

    if not filtered:
        return get_agent_config(user_id, conn)

    # Ensure config exists
    get_agent_config(user_id, conn)

    filtered["updated_at"] = datetime.utcnow().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in filtered)
    conn.execute(
        f"UPDATE ai_agent_config SET {set_clause} WHERE user_id = ?",
        list(filtered.values()) + [user_id],
    )
    conn.commit()
    return get_agent_config(user_id, conn)


# ═══════════════════════════════════════════════════
# AGENT ACTIONS
# ═══════════════════════════════════════════════════

def run_agent_scan(user_id: int, conn: sqlite3.Connection) -> dict:
    """Run a single scan cycle for a user's AI agent."""
    config = get_agent_config(user_id, conn)
    if not config.get("is_active"):
        return {"scanned": False, "reason": "Agent is paused"}

    # Compute matches against recent jobs
    new_matches = batch_compute_matches(user_id, conn, limit=30)

    # Find matches above alert threshold
    min_score = config.get("alert_min_match_score", 70)
    top_matches = conn.execute("""
        SELECT jm.*, j.title, j.company, j.location
        FROM job_matches jm
        JOIN jobs j ON jm.job_id = j.id
        WHERE jm.user_id = ? AND jm.match_confidence >= ?
          AND jm.status = 'discovered'
        ORDER BY jm.match_confidence DESC
        LIMIT 10
    """, (user_id, min_score)).fetchall()

    # Mark as presented
    for match in top_matches:
        conn.execute("""
            UPDATE job_matches SET status = 'presented', presented_at = datetime('now')
            WHERE id = ?
        """, (match["id"],))

    # Log the scan
    _log_action(user_id, "scan", {
        "new_matches": new_matches,
        "presented": len(top_matches),
        "min_score": min_score,
    }, conn)

    # Update stats
    conn.execute("""
        UPDATE ai_agent_config
        SET total_matches_found = total_matches_found + ?,
            last_scan_at = datetime('now')
        WHERE user_id = ?
    """, (new_matches, user_id))
    conn.commit()

    return {
        "scanned": True,
        "new_matches_computed": new_matches,
        "matches_presented": len(top_matches),
        "top_matches": [dict(m) for m in top_matches],
    }


def get_agent_dashboard(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get the AI agent dashboard data for a user."""
    config = get_agent_config(user_id, conn)

    # Recent matches
    recent_matches = conn.execute("""
        SELECT jm.*, j.title, j.company, j.location, j.salary_min, j.salary_max
        FROM job_matches jm
        JOIN jobs j ON jm.job_id = j.id
        WHERE jm.user_id = ?
        ORDER BY jm.match_confidence DESC
        LIMIT 20
    """, (user_id,)).fetchall()

    # Match stats
    stats = conn.execute("""
        SELECT
            COUNT(*) as total_matches,
            COUNT(CASE WHEN status = 'presented' THEN 1 END) as presented,
            COUNT(CASE WHEN status = 'interested' THEN 1 END) as interested,
            COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied,
            ROUND(AVG(match_confidence), 1) as avg_confidence,
            MAX(match_confidence) as best_match
        FROM job_matches WHERE user_id = ?
    """, (user_id,)).fetchone()

    # Recent activity log
    activity = conn.execute("""
        SELECT * FROM ai_agent_log
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 20
    """, (user_id,)).fetchall()
    activity_list = []
    for a in activity:
        item = dict(a)
        if item.get("details"):
            try:
                item["details"] = json.loads(item["details"])
            except (json.JSONDecodeError, TypeError):
                pass
        activity_list.append(item)

    return {
        "config": config,
        "stats": dict(stats) if stats else {},
        "recent_matches": [dict(m) for m in recent_matches],
        "activity": activity_list,
    }


def respond_to_match(
    user_id: int,
    match_id: int,
    response: str,
    conn: sqlite3.Connection,
) -> dict:
    """User responds to a presented match."""
    match = conn.execute(
        "SELECT * FROM job_matches WHERE id = ? AND user_id = ?",
        (match_id, user_id),
    ).fetchone()
    if not match:
        raise ValueError("Match not found")

    status_map = {
        "interested": "interested",
        "not_interested": "rejected",
        "apply": "applied",
        "save": "interested",
    }
    new_status = status_map.get(response, "discovered")

    conn.execute("""
        UPDATE job_matches SET status = ?, user_response = ?, responded_at = datetime('now')
        WHERE id = ?
    """, (new_status, response, match_id))

    _log_action(user_id, "match_response", {
        "match_id": match_id,
        "job_id": match["job_id"],
        "response": response,
    }, conn)

    conn.commit()
    return {"match_id": match_id, "status": new_status, "response": response}


def get_market_insights(user_id: int, conn: sqlite3.Connection) -> dict:
    """Generate market insights based on user's profile and match data."""
    config = get_agent_config(user_id, conn)
    target_roles = config.get("target_roles", [])
    if isinstance(target_roles, str):
        try:
            target_roles = json.loads(target_roles)
        except (json.JSONDecodeError, TypeError):
            target_roles = []

    # Salary trends for target roles
    salary_data = conn.execute("""
        SELECT j.title, AVG(j.salary_min) as avg_min, AVG(j.salary_max) as avg_max,
               COUNT(*) as job_count
        FROM jobs j
        WHERE j.salary_min > 0
        GROUP BY j.title
        ORDER BY job_count DESC
        LIMIT 20
    """).fetchall()

    # Skills in demand
    skills_demand = conn.execute("""
        SELECT sn.name, sn.slug, COUNT(DISTINCT us.user_id) as user_count
        FROM user_skills us
        JOIN skill_nodes sn ON us.skill_id = sn.id
        GROUP BY sn.id
        ORDER BY user_count DESC
        LIMIT 15
    """, ()).fetchall()

    return {
        "salary_trends": [dict(s) for s in salary_data],
        "skills_in_demand": [dict(s) for s in skills_demand],
        "target_roles": target_roles,
    }


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _log_action(
    user_id: int,
    action_type: str,
    details: dict,
    conn: sqlite3.Connection,
    job_id: int | None = None,
    match_id: int | None = None,
):
    """Log an agent action."""
    conn.execute("""
        INSERT INTO ai_agent_log (user_id, action_type, details, job_id, match_id)
        VALUES (?, ?, ?, ?, ?)
    """, (user_id, action_type, json.dumps(details), job_id, match_id))
