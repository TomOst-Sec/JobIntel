"""Gamification endpoints: XP, levels, quests, streaks, achievements, leaderboard, rejection reframe."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.gamification import (
    award_xp, update_streak, get_active_quests,
    get_player_profile, get_leaderboard, reframe_rejection,
    XP_EVENTS, LEVELS,
)

router = APIRouter()


# ─── Request Models ─────────────────────────────────

class AwardXpRequest(BaseModel):
    event_type: str
    context: dict | None = None


# ─── Player Profile ─────────────────────────────────

@router.get("/profile")
def my_profile(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get full gamification profile."""
    return get_player_profile(user["id"], db)


# ─── XP ─────────────────────────────────────────────

@router.post("/xp")
def earn_xp(
    body: AwardXpRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Award XP for an event."""
    if body.event_type not in XP_EVENTS:
        raise HTTPException(status_code=400, detail=f"Unknown event type: {body.event_type}")
    return award_xp(user["id"], body.event_type, db, context=body.context)


@router.get("/xp/events")
def list_xp_events():
    """List all XP event types and their values."""
    return {"events": XP_EVENTS}


@router.get("/xp/history")
def xp_history(
    days: int = Query(7, ge=1, le=90),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get XP history for the last N days."""
    rows = db.execute(
        """SELECT event_type, xp_earned, multiplier, context, created_at
           FROM user_xp WHERE user_id = ?
           AND created_at > datetime('now', ? || ' days')
           ORDER BY created_at DESC LIMIT 200""",
        (user["id"], f"-{days}"),
    ).fetchall()
    return {"history": [dict(r) for r in rows]}


# ─── Streaks ────────────────────────────────────────

@router.post("/streak")
def check_in_streak(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update daily streak (call on login or first action of the day)."""
    return update_streak(user["id"], db)


# ─── Quests ─────────────────────────────────────────

@router.get("/quests")
def active_quests(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get active quests with progress."""
    return {"quests": get_active_quests(user["id"], db)}


@router.get("/quests/completed")
def completed_quests(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get completed quests."""
    rows = db.execute(
        """SELECT uq.*, q.title, q.description, q.quest_type, q.xp_reward, q.badge_name, q.badge_icon
           FROM user_quests uq
           JOIN quests q ON uq.quest_id = q.quest_id
           WHERE uq.user_id = ? AND uq.completed_at IS NOT NULL
           ORDER BY uq.completed_at DESC LIMIT 50""",
        (user["id"],),
    ).fetchall()
    return {"quests": [dict(r) for r in rows]}


# ─── Achievements ───────────────────────────────────

@router.get("/achievements")
def my_achievements(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get unlocked achievements/badges."""
    rows = db.execute(
        "SELECT * FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC",
        (user["id"],),
    ).fetchall()
    return {"achievements": [dict(r) for r in rows]}


# ─── Leaderboard ────────────────────────────────────

@router.get("/leaderboard")
def leaderboard(
    limit: int = Query(20, ge=1, le=100),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get XP leaderboard."""
    return {"leaderboard": get_leaderboard(db, limit)}


# ─── Rejection Reframe ──────────────────────────────

@router.post("/reframe/{app_id}")
def reframe(
    app_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """AI-powered rejection reframe for a specific application."""
    try:
        return reframe_rejection(user["id"], app_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Levels Reference ───────────────────────────────

@router.get("/levels")
def list_levels():
    """List all level thresholds."""
    return {
        "levels": [
            {"level": lvl, "xp_required": xp, "title": title}
            for lvl, xp, title in LEVELS
        ]
    }
