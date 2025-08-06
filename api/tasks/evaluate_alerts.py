"""Background task to evaluate alert conditions."""
import json
import logging

from api.db.connection import get_db_connection

logger = logging.getLogger(__name__)


def evaluate_all_alerts():
    """Check all active alerts and create triggers for matches."""
    conn = get_db_connection()
    try:
        alerts = conn.execute(
            "SELECT * FROM alerts WHERE is_active = 1"
        ).fetchall()

        triggered = 0
        for alert in alerts:
            alert_dict = dict(alert)
            conditions = json.loads(alert_dict["conditions"])

            try:
                matches = _evaluate_alert(conn, alert_dict["alert_type"], conditions)
                if matches:
                    # Check if we already triggered recently (avoid duplicates)
                    recent = conn.execute("""
                        SELECT id FROM alert_triggers
                        WHERE alert_id = ? AND created_at >= datetime('now', '-30 minutes')
                    """, (alert_dict["id"],)).fetchone()

                    if recent is None:
                        conn.execute(
                            "INSERT INTO alert_triggers (alert_id, payload) VALUES (?, ?)",
                            (alert_dict["id"], json.dumps(matches)),
                        )
                        triggered += 1
            except Exception as e:
                logger.error(f"Alert {alert_dict['id']} evaluation failed: {e}")

        conn.commit()
        if triggered:
            logger.info(f"Alert evaluation: {triggered} new triggers from {len(alerts)} active alerts")
    finally:
        conn.close()


def _evaluate_alert(conn, alert_type: str, conditions: dict) -> list[dict] | None:
    """Evaluate a single alert's conditions against current data."""
    if alert_type == "company_scaling":
        company = conditions.get("company", "")
        min_postings = conditions.get("min_postings", 3)
        timeframe = conditions.get("timeframe_days", 7)
        rows = conn.execute("""
            SELECT company, COUNT(*) as count
            FROM jobs
            WHERE company LIKE ? AND posted_at >= datetime('now', ? || ' days')
            GROUP BY company HAVING COUNT(*) >= ?
        """, (f"%{company}%", f"-{timeframe}", min_postings)).fetchall()
        if rows:
            return [dict(r) for r in rows]

    elif alert_type == "new_role":
        role = conditions.get("role", "")
        market_id = conditions.get("market_id")
        sql = "SELECT * FROM jobs WHERE title LIKE ? AND posted_at >= datetime('now', '-30 minutes')"
        params = [f"%{role}%"]
        if market_id:
            sql += " AND market_id = ?"
            params.append(market_id)
        rows = conn.execute(sql, params).fetchall()
        if rows:
            return [{"job_id": dict(r)["job_id"], "title": dict(r)["title"], "company": dict(r)["company"]} for r in rows]

    elif alert_type == "salary_change":
        role = conditions.get("role", "")
        threshold = conditions.get("threshold_pct", 10)
        # Compare recent salaries to historical average
        rows = conn.execute("""
            SELECT search_category,
                AVG(CASE WHEN posted_at >= datetime('now', '-7 days') THEN salary_min END) as recent_avg,
                AVG(salary_min) as overall_avg
            FROM jobs
            WHERE search_category LIKE ? AND salary_min > 0
            GROUP BY search_category
        """, (f"%{role}%",)).fetchall()
        changes = []
        for r in rows:
            rd = dict(r)
            if rd["recent_avg"] and rd["overall_avg"] and rd["overall_avg"] > 0:
                pct_change = ((rd["recent_avg"] - rd["overall_avg"]) / rd["overall_avg"]) * 100
                if abs(pct_change) >= threshold:
                    changes.append({**rd, "pct_change": round(pct_change, 1)})
        if changes:
            return changes

    elif alert_type == "skill_trending":
        skill = conditions.get("skill", "")
        rows = conn.execute("""
            SELECT search_category, COUNT(*) as recent_count
            FROM jobs
            WHERE (title LIKE ? OR required_skills LIKE ?)
              AND posted_at >= datetime('now', '-7 days')
            GROUP BY search_category
            ORDER BY recent_count DESC
        """, (f"%{skill}%", f"%{skill}%")).fetchall()
        if rows:
            return [dict(r) for r in rows]

    elif alert_type == "custom":
        # Custom SQL-based alert
        query = conditions.get("query", "")
        market_id = conditions.get("market_id")
        sql = "SELECT COUNT(*) as count FROM jobs WHERE (title LIKE ? OR description LIKE ?) AND posted_at >= datetime('now', '-30 minutes')"
        params = [f"%{query}%", f"%{query}%"]
        if market_id:
            sql += " AND market_id = ?"
            params.append(market_id)
        row = conn.execute(sql, params).fetchone()
        if row and dict(row)["count"] > 0:
            return [dict(row)]

    return None
