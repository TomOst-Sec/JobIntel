"""Report service wrapping existing ReportGenerator."""
import json
import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))


def generate_report(user_id: int, market_id: str | None, db: sqlite3.Connection) -> dict:
    """Generate a report using the existing analyzer and store it."""
    from src.database import JobDatabase
    from src.analyzer import JobAnalyzer

    job_db = JobDatabase()
    analyzer = JobAnalyzer(job_db)

    intel = analyzer.generate_market_intelligence(market_id=market_id)

    cursor = db.execute(
        "INSERT INTO generated_reports (user_id, report_type, market_id, content) VALUES (?, 'on_demand', ?, ?)",
        (user_id, market_id, json.dumps(intel, default=str)),
    )
    db.commit()
    job_db.close()

    return {
        "id": cursor.lastrowid,
        "report_type": "on_demand",
        "market_id": market_id,
        "content": intel,
        "created_at": db.execute(
            "SELECT created_at FROM generated_reports WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()[0],
    }


def get_user_reports(user_id: int, db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        "SELECT id, report_type, market_id, created_at, emailed_at FROM generated_reports WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_report(report_id: int, user_id: int, db: sqlite3.Connection) -> dict:
    row = db.execute(
        "SELECT * FROM generated_reports WHERE id = ? AND user_id = ?",
        (report_id, user_id),
    ).fetchone()
    if row is None:
        raise ValueError("Report not found")

    d = dict(row)
    try:
        d["content"] = json.loads(d["content"])
    except (json.JSONDecodeError, TypeError):
        pass
    return d
