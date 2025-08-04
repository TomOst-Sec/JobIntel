"""Alert management service."""
import json
import sqlite3


def _parse_alert_row(row) -> dict:
    d = dict(row)
    d["conditions"] = json.loads(d["conditions"]) if d["conditions"] else {}
    return d


def create_alert(user_id: int, alert_type: str, conditions: dict, delivery: str, db: sqlite3.Connection) -> dict:
    cursor = db.execute(
        "INSERT INTO alerts (user_id, alert_type, conditions, delivery) VALUES (?, ?, ?, ?)",
        (user_id, alert_type, json.dumps(conditions), delivery),
    )
    db.commit()
    return _parse_alert_row(db.execute("SELECT * FROM alerts WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_alert(alert_id: int, user_id: int, updates: dict, db: sqlite3.Connection) -> dict:
    alert = db.execute(
        "SELECT * FROM alerts WHERE id = ? AND user_id = ?", (alert_id, user_id)
    ).fetchone()
    if alert is None:
        raise ValueError("Alert not found")

    sets = []
    params = []
    if "conditions" in updates and updates["conditions"] is not None:
        sets.append("conditions = ?")
        params.append(json.dumps(updates["conditions"]))
    if "delivery" in updates and updates["delivery"] is not None:
        sets.append("delivery = ?")
        params.append(updates["delivery"])
    if "is_active" in updates and updates["is_active"] is not None:
        sets.append("is_active = ?")
        params.append(1 if updates["is_active"] else 0)

    if sets:
        sets.append("updated_at = datetime('now')")
        params.extend([alert_id, user_id])
        db.execute(
            f"UPDATE alerts SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            params,
        )
        db.commit()

    return _parse_alert_row(db.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone())


def delete_alert(alert_id: int, user_id: int, db: sqlite3.Connection):
    result = db.execute(
        "DELETE FROM alerts WHERE id = ? AND user_id = ?", (alert_id, user_id)
    )
    db.commit()
    if result.rowcount == 0:
        raise ValueError("Alert not found")


def get_user_alerts(user_id: int, db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["conditions"] = json.loads(d["conditions"]) if d["conditions"] else {}
        results.append(d)
    return results


def get_triggers(user_id: int, unread_only: bool, db: sqlite3.Connection) -> list[dict]:
    sql = """
        SELECT at.* FROM alert_triggers at
        JOIN alerts a ON at.alert_id = a.id
        WHERE a.user_id = ?
    """
    params = [user_id]
    if unread_only:
        sql += " AND at.is_read = 0"
    sql += " ORDER BY at.created_at DESC LIMIT 100"

    rows = db.execute(sql, params).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["payload"] = json.loads(d["payload"]) if d["payload"] else {}
        results.append(d)
    return results


def mark_trigger_read(trigger_id: int, user_id: int, db: sqlite3.Connection):
    db.execute("""
        UPDATE alert_triggers SET is_read = 1
        WHERE id = ? AND alert_id IN (SELECT id FROM alerts WHERE user_id = ?)
    """, (trigger_id, user_id))
    db.commit()
