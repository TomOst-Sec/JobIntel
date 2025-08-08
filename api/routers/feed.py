"""Activity feed endpoints — public feed and personal feed."""
import json
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user, get_optional_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FeedEvent(BaseModel):
    id: int
    event_type: str
    company: str | None = None
    title: str
    body: str | None = None
    data: dict | list | None = None
    is_public: bool = True
    created_at: str | None = None


class PersonalFeedItem(BaseModel):
    id: int
    source: str
    title: str
    body: str | None = None
    data: dict | list | None = None
    created_at: str | None = None


# ---------------------------------------------------------------------------
# GET / — Public activity feed (paginated)
# ---------------------------------------------------------------------------

@router.get("", response_model=list[FeedEvent])
def get_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return the public activity feed, newest first."""
    conditions = ["is_public = 1"]
    params: list = []

    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)

    where = " WHERE " + " AND ".join(conditions)
    offset = (page - 1) * per_page

    sql = f"SELECT * FROM activity_feed{where} ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])

    rows = db.execute(sql, params).fetchall()
    results = []
    for r in rows:
        item = dict(r)
        # Parse JSON data field if present
        if item.get("data"):
            try:
                item["data"] = json.loads(item["data"])
            except (json.JSONDecodeError, TypeError):
                pass
        item["is_public"] = bool(item.get("is_public", 1))
        results.append(item)

    return results


# ---------------------------------------------------------------------------
# GET /personal — Personal feed for logged-in user
# ---------------------------------------------------------------------------

@router.get("/personal", response_model=list[PersonalFeedItem])
def get_personal_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return a personalised feed for the authenticated user.

    Combines:
    - Alert triggers (unread first)
    - Recent application status changes
    - Saved job updates (ghost score changes, company intel)
    """
    offset = (page - 1) * per_page
    items: list[dict] = []

    # 1. Alert triggers for the user
    alert_rows = db.execute(
        """
        SELECT at.id, at.payload, at.created_at, a.alert_type
        FROM alert_triggers at
        JOIN alerts a ON at.alert_id = a.id
        WHERE a.user_id = ?
        ORDER BY at.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], per_page, offset),
    ).fetchall()

    for r in alert_rows:
        row = dict(r)
        payload = {}
        if row.get("payload"):
            try:
                payload = json.loads(row["payload"])
            except (json.JSONDecodeError, TypeError):
                pass
        items.append({
            "id": row["id"],
            "source": "alert",
            "title": f"Alert: {row.get('alert_type', 'update')}",
            "body": payload.get("message") or payload.get("summary"),
            "data": payload,
            "created_at": row["created_at"],
        })

    # 2. Recent application activity for the user
    app_rows = db.execute(
        """
        SELECT id, job_title, company, status, updated_at
        FROM job_applications
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], per_page, offset),
    ).fetchall()

    for r in app_rows:
        row = dict(r)
        items.append({
            "id": row["id"],
            "source": "application",
            "title": f"{row['job_title']} at {row['company']}",
            "body": f"Status: {row['status']}",
            "data": {"status": row["status"], "company": row["company"]},
            "created_at": row["updated_at"],
        })

    # Sort combined feed by created_at descending, take a page-sized slice
    items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    items = items[:per_page]

    return items
