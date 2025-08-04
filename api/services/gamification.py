"""Gamification Engine — XP, levels, quests, streaks, achievements, rejection reframe.

Career XP system with 40+ event types, 12 quest types (daily/weekly/achievement/legendary),
streak mechanics with shields, rejection reframe engine, and leaderboards.
"""
import json
import sqlite3
from datetime import datetime, timedelta

from api.services.ai_provider import ai_complete_json


# ═══════════════════════════════════════════════════
# XP EVENT TABLE
# ═══════════════════════════════════════════════════

XP_EVENTS = {
    # Applications
    "application_submitted": 300,
    "application_tailored": 400,
    "application_autopilot": 250,
    "application_quick_apply": 100,
    # Responses
    "recruiter_viewed": 200,
    "phone_screen_scheduled": 500,
    "technical_interview": 750,
    "onsite_interview": 1000,
    "final_round": 1200,
    "offer_received": 3000,
    "offer_accepted": 5000,
    "offer_negotiated_up": 2000,
    # CV
    "cv_uploaded": 500,
    "cv_parsed": 200,
    "cv_enriched": 300,
    "cv_tailored": 250,
    "cover_letter_generated": 200,
    # Intelligence
    "ghost_check_run": 75,
    "ghost_avoided": 150,
    "salary_check_run": 100,
    "company_researched": 100,
    "market_signal_viewed": 50,
    "competitive_map_viewed": 100,
    # AI
    "ai_chat_query": 50,
    "ai_search_run": 100,
    "morning_briefing_read": 150,
    # Community
    "interview_report_submitted": 500,
    "profile_completed": 300,
    "referral_sent": 200,
    "referral_converted": 1000,
    # Engagement
    "daily_login": 50,
    "streak_day_3": 200,
    "streak_day_7": 500,
    "streak_day_14": 1000,
    "streak_day_30": 2500,
    "streak_day_100": 10000,
    # Rejection reframe
    "rejection_reframed": 100,
    "rejection_lesson_applied": 300,
    # Misc
    "settings_configured": 100,
    "autopilot_enabled": 500,
    "provider_connected": 300,
}

# ═══════════════════════════════════════════════════
# LEVEL THRESHOLDS
# ═══════════════════════════════════════════════════

LEVELS = [
    (1, 0, "Applicant"),
    (2, 500, "Active Seeker"),
    (3, 1500, "Career Explorer"),
    (4, 3500, "Job Hunter"),
    (5, 7000, "Market Analyst"),
    (6, 12000, "Intelligence Agent"),
    (7, 20000, "Career Strategist"),
    (8, 32000, "Interview Ace"),
    (9, 50000, "Offer Magnet"),
    (10, 75000, "Career Commander"),
    (11, 110000, "Hiring Hacker"),
    (12, 160000, "Job Market Legend"),
    (13, 230000, "SKYNET Operator"),
    (14, 320000, "Career Grandmaster"),
    (15, 500000, "JobIntel Elite"),
]


def _level_for_xp(total_xp: int) -> tuple[int, str]:
    """Determine level and title from total XP."""
    level, title = 1, "Applicant"
    for lvl, threshold, name in LEVELS:
        if total_xp >= threshold:
            level, title = lvl, name
        else:
            break
    return level, title


def _next_level_xp(current_level: int) -> int:
    """XP needed for next level."""
    for lvl, threshold, _ in LEVELS:
        if lvl == current_level + 1:
            return threshold
    return LEVELS[-1][1]  # max


# ═══════════════════════════════════════════════════
# XP AWARD
# ═══════════════════════════════════════════════════

def award_xp(
    user_id: int,
    event_type: str,
    conn: sqlite3.Connection,
    context: dict | None = None,
    multiplier: float = 1.0,
) -> dict:
    """Award XP for an event. Returns XP earned, level info, and any unlocked achievements."""
    base_xp = XP_EVENTS.get(event_type, 50)

    # Check streak multiplier
    level_row = conn.execute(
        "SELECT * FROM user_levels WHERE user_id = ?", (user_id,)
    ).fetchone()

    if not level_row:
        conn.execute("INSERT OR IGNORE INTO user_levels (user_id) VALUES (?)", (user_id,))
        conn.commit()
        level_row = conn.execute("SELECT * FROM user_levels WHERE user_id = ?", (user_id,)).fetchone()

    level_data = dict(level_row)
    streak = level_data.get("streak_days", 0)

    # Streak multiplier: +10% per 7-day streak, max 2x
    streak_mult = min(2.0, 1.0 + (streak // 7) * 0.1)
    total_mult = multiplier * streak_mult
    xp_earned = int(base_xp * total_mult)

    # Record XP event
    conn.execute(
        "INSERT INTO user_xp (user_id, event_type, xp_earned, multiplier, context) VALUES (?, ?, ?, ?, ?)",
        (user_id, event_type, xp_earned, total_mult, json.dumps(context) if context else None),
    )

    # Update totals
    new_total = level_data["total_xp"] + xp_earned
    new_level, new_title = _level_for_xp(new_total)
    leveled_up = new_level > level_data["current_level"]

    # Update application/response/offer counters
    app_total = level_data.get("applications_total", 0)
    resp_total = level_data.get("responses_total", 0)
    offers_total = level_data.get("offers_total", 0)

    if event_type == "application_submitted":
        app_total += 1
    elif event_type in ("phone_screen_scheduled", "technical_interview", "onsite_interview"):
        resp_total += 1
    elif event_type == "offer_received":
        offers_total += 1

    conn.execute(
        """UPDATE user_levels SET
           total_xp = ?, current_level = ?, level_title = ?,
           applications_total = ?, responses_total = ?, offers_total = ?,
           updated_at = datetime('now')
           WHERE user_id = ?""",
        (new_total, new_level, new_title, app_total, resp_total, offers_total, user_id),
    )
    conn.commit()

    # Check quest progress
    _update_quest_progress(user_id, event_type, conn)

    result = {
        "xp_earned": xp_earned,
        "total_xp": new_total,
        "level": new_level,
        "level_title": new_title,
        "leveled_up": leveled_up,
        "streak_multiplier": streak_mult,
        "next_level_xp": _next_level_xp(new_level),
    }

    if leveled_up:
        result["level_up_message"] = f"Level up! You're now a {new_title} (Level {new_level})"

    return result


# ═══════════════════════════════════════════════════
# STREAK MANAGEMENT
# ═══════════════════════════════════════════════════

def update_streak(user_id: int, conn: sqlite3.Connection) -> dict:
    """Update daily streak. Call on each meaningful action."""
    row = conn.execute("SELECT * FROM user_levels WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        conn.execute("INSERT OR IGNORE INTO user_levels (user_id) VALUES (?)", (user_id,))
        conn.commit()
        row = conn.execute("SELECT * FROM user_levels WHERE user_id = ?", (user_id,)).fetchone()

    data = dict(row)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    last_active = data.get("last_active_date", "")

    if last_active == today:
        return {
            "streak_days": data["streak_days"],
            "streak_best": data["streak_best"],
            "streak_shields": data["streak_shields"],
        }

    yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    streak = data["streak_days"]
    shields = data.get("streak_shields", 0)

    if last_active == yesterday:
        streak += 1
    elif last_active and last_active < yesterday:
        # Missed a day — use shield if available
        if shields > 0:
            shields -= 1
            streak += 1  # Keep streak alive
        else:
            streak = 1  # Reset

    best = max(data.get("streak_best", 0), streak)

    # Award streak milestone XP
    streak_xp = 0
    if streak == 3:
        streak_xp = XP_EVENTS["streak_day_3"]
    elif streak == 7:
        streak_xp = XP_EVENTS["streak_day_7"]
    elif streak == 14:
        streak_xp = XP_EVENTS["streak_day_14"]
    elif streak == 30:
        streak_xp = XP_EVENTS["streak_day_30"]
    elif streak == 100:
        streak_xp = XP_EVENTS["streak_day_100"]

    if streak_xp:
        conn.execute(
            "INSERT INTO user_xp (user_id, event_type, xp_earned, context) VALUES (?, ?, ?, ?)",
            (user_id, f"streak_day_{streak}", streak_xp, json.dumps({"streak": streak})),
        )

    # Award shield at streak milestones
    new_shields = shields
    if streak in (7, 30, 100):
        new_shields += 1

    new_xp = data["total_xp"] + streak_xp
    new_level, new_title = _level_for_xp(new_xp)

    # Momentum score: weighted combination of streak, recent activity, response rate
    momentum = min(100, streak * 3 + data.get("applications_total", 0) * 0.5)

    conn.execute(
        """UPDATE user_levels SET
           streak_days = ?, streak_best = ?, streak_shields = ?,
           last_active_date = ?, momentum_score = ?,
           total_xp = ?, current_level = ?, level_title = ?,
           updated_at = datetime('now')
           WHERE user_id = ?""",
        (streak, best, new_shields, today, momentum, new_xp, new_level, new_title, user_id),
    )
    conn.commit()

    return {
        "streak_days": streak,
        "streak_best": best,
        "streak_shields": new_shields,
        "streak_xp_earned": streak_xp,
        "momentum_score": momentum,
    }


# ═══════════════════════════════════════════════════
# QUESTS
# ═══════════════════════════════════════════════════

def get_active_quests(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Get user's active quests with progress."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    week_start = (datetime.utcnow() - timedelta(days=datetime.utcnow().weekday())).strftime("%Y-%m-%d")

    # Ensure user has daily/weekly quests assigned
    _assign_periodic_quests(user_id, today, week_start, conn)

    rows = conn.execute(
        """SELECT uq.*, q.title, q.description, q.quest_type, q.xp_reward, q.badge_name, q.badge_icon
           FROM user_quests uq
           JOIN quests q ON uq.quest_id = q.quest_id
           WHERE uq.user_id = ? AND uq.completed_at IS NULL
           ORDER BY q.quest_type, q.xp_reward DESC""",
        (user_id,),
    ).fetchall()

    return [
        {
            **dict(r),
            "progress_pct": min(100, round((r["progress"] / max(r["target"], 1)) * 100, 1)),
        }
        for r in rows
    ]


def _assign_periodic_quests(user_id: int, today: str, week_start: str, conn: sqlite3.Connection):
    """Ensure user has daily and weekly quests for current period."""
    # Daily quests
    existing_daily = conn.execute(
        "SELECT quest_id FROM user_quests WHERE user_id = ? AND period_start = ? AND quest_id LIKE 'daily_%'",
        (user_id, today),
    ).fetchall()
    existing_ids = {r["quest_id"] for r in existing_daily}

    dailies = conn.execute("SELECT * FROM quests WHERE quest_type = 'daily' AND is_active = 1").fetchall()
    for q in dailies:
        if q["quest_id"] not in existing_ids:
            reqs = json.loads(q["requirements"])
            target = list(reqs.values())[0] if reqs else 1
            conn.execute(
                "INSERT INTO user_quests (user_id, quest_id, target, period_start, period_end) VALUES (?, ?, ?, ?, ?)",
                (user_id, q["quest_id"], target, today, today),
            )

    # Weekly quests
    existing_weekly = conn.execute(
        "SELECT quest_id FROM user_quests WHERE user_id = ? AND period_start = ? AND quest_id LIKE 'weekly_%'",
        (user_id, week_start),
    ).fetchall()
    existing_weekly_ids = {r["quest_id"] for r in existing_weekly}

    weeklies = conn.execute("SELECT * FROM quests WHERE quest_type = 'weekly' AND is_active = 1").fetchall()
    week_end = (datetime.utcnow() + timedelta(days=6 - datetime.utcnow().weekday())).strftime("%Y-%m-%d")
    for q in weeklies:
        if q["quest_id"] not in existing_weekly_ids:
            reqs = json.loads(q["requirements"])
            target = list(reqs.values())[0] if reqs else 1
            conn.execute(
                "INSERT INTO user_quests (user_id, quest_id, target, period_start, period_end) VALUES (?, ?, ?, ?, ?)",
                (user_id, q["quest_id"], target, week_start, week_end),
            )

    # Achievement quests (one-time, assign if not exists)
    existing_achievements = conn.execute(
        "SELECT quest_id FROM user_quests WHERE user_id = ? AND quest_id IN (SELECT quest_id FROM quests WHERE quest_type IN ('achievement', 'legendary'))",
        (user_id,),
    ).fetchall()
    existing_ach_ids = {r["quest_id"] for r in existing_achievements}

    achievements = conn.execute("SELECT * FROM quests WHERE quest_type IN ('achievement', 'legendary') AND is_active = 1").fetchall()
    for q in achievements:
        if q["quest_id"] not in existing_ach_ids:
            reqs = json.loads(q["requirements"])
            target = list(reqs.values())[0] if reqs else 1
            conn.execute(
                "INSERT INTO user_quests (user_id, quest_id, target) VALUES (?, ?, ?)",
                (user_id, q["quest_id"], target),
            )

    conn.commit()


def _update_quest_progress(user_id: int, event_type: str, conn: sqlite3.Connection):
    """Update quest progress based on an XP event."""
    event_to_quest_metric = {
        "application_submitted": ["applications_today", "applications_this_week", "total_applications"],
        "application_tailored": ["tailoring_rate"],
        "ai_search_run": ["ai_searches_today"],
        "company_researched": ["company_pages_viewed"],
        "ghost_check_run": ["ghost_checks_today"],
        "ghost_avoided": ["ghosts_avoided"],
        "phone_screen_scheduled": ["responses"],
        "offer_received": ["salary_negotiated"],
        "offer_accepted": ["hired"],
    }

    metrics = event_to_quest_metric.get(event_type, [])
    if not metrics:
        return

    # Get active user quests
    quests = conn.execute(
        """SELECT uq.id, uq.quest_id, uq.progress, uq.target, q.requirements, q.xp_reward, q.badge_name, q.badge_icon
           FROM user_quests uq
           JOIN quests q ON uq.quest_id = q.quest_id
           WHERE uq.user_id = ? AND uq.completed_at IS NULL""",
        (user_id,),
    ).fetchall()

    for q in quests:
        reqs = json.loads(q["requirements"])
        for metric in metrics:
            if metric in reqs:
                new_progress = q["progress"] + 1
                if new_progress >= q["target"]:
                    # Quest completed!
                    conn.execute(
                        "UPDATE user_quests SET progress = ?, completed_at = datetime('now') WHERE id = ?",
                        (new_progress, q["id"]),
                    )
                    # Award quest XP
                    conn.execute(
                        "INSERT INTO user_xp (user_id, event_type, xp_earned, context) VALUES (?, ?, ?, ?)",
                        (user_id, f"quest_completed_{q['quest_id']}", q["xp_reward"],
                         json.dumps({"quest_id": q["quest_id"]})),
                    )
                    # Award achievement badge if applicable
                    if q["badge_name"]:
                        conn.execute(
                            "INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, badge_name, badge_icon, xp_earned) VALUES (?, ?, ?, ?, ?)",
                            (user_id, q["quest_id"], q["badge_name"], q["badge_icon"], q["xp_reward"]),
                        )
                    # Update total XP
                    conn.execute(
                        "UPDATE user_levels SET total_xp = total_xp + ? WHERE user_id = ?",
                        (q["xp_reward"], user_id),
                    )
                else:
                    conn.execute(
                        "UPDATE user_quests SET progress = ? WHERE id = ?",
                        (new_progress, q["id"]),
                    )
                break

    conn.commit()


# ═══════════════════════════════════════════════════
# PLAYER PROFILE
# ═══════════════════════════════════════════════════

def get_player_profile(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get full gamification profile for a user."""
    level_row = conn.execute("SELECT * FROM user_levels WHERE user_id = ?", (user_id,)).fetchone()
    if not level_row:
        conn.execute("INSERT OR IGNORE INTO user_levels (user_id) VALUES (?)", (user_id,))
        conn.commit()
        level_row = conn.execute("SELECT * FROM user_levels WHERE user_id = ?", (user_id,)).fetchone()

    data = dict(level_row)
    current_level = data["current_level"]
    total_xp = data["total_xp"]
    next_xp = _next_level_xp(current_level)

    # Current level threshold
    current_threshold = 0
    for lvl, threshold, _ in LEVELS:
        if lvl == current_level:
            current_threshold = threshold
            break

    progress_in_level = total_xp - current_threshold
    xp_for_next = next_xp - current_threshold

    # Recent XP history (last 7 days)
    xp_history = conn.execute(
        """SELECT DATE(created_at) as date, SUM(xp_earned) as xp
           FROM user_xp WHERE user_id = ?
           AND created_at > datetime('now', '-7 days')
           GROUP BY DATE(created_at) ORDER BY date""",
        (user_id,),
    ).fetchall()

    # Achievements
    achievements = conn.execute(
        "SELECT * FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at DESC",
        (user_id,),
    ).fetchall()

    # Active quests
    active_quests = get_active_quests(user_id, conn)

    return {
        "user_id": user_id,
        "level": current_level,
        "level_title": data["level_title"],
        "total_xp": total_xp,
        "progress_in_level": progress_in_level,
        "xp_for_next_level": xp_for_next,
        "progress_pct": round(progress_in_level / max(xp_for_next, 1) * 100, 1),
        "streak_days": data["streak_days"],
        "streak_best": data["streak_best"],
        "streak_shields": data.get("streak_shields", 0),
        "momentum_score": data.get("momentum_score", 0),
        "applications_total": data.get("applications_total", 0),
        "responses_total": data.get("responses_total", 0),
        "offers_total": data.get("offers_total", 0),
        "xp_history": [dict(r) for r in xp_history],
        "achievements": [dict(a) for a in achievements],
        "active_quests": active_quests,
    }


# ═══════════════════════════════════════════════════
# LEADERBOARD
# ═══════════════════════════════════════════════════

def get_leaderboard(conn: sqlite3.Connection, limit: int = 20) -> list[dict]:
    """Get XP leaderboard."""
    rows = conn.execute(
        """SELECT ul.user_id, ul.total_xp, ul.current_level, ul.level_title,
                  ul.streak_days, ul.applications_total, ul.offers_total,
                  u.full_name, u.email
           FROM user_levels ul
           JOIN users u ON ul.user_id = u.id
           WHERE u.is_active = 1
           ORDER BY ul.total_xp DESC LIMIT ?""",
        (limit,),
    ).fetchall()

    return [
        {
            "rank": i + 1,
            "user_id": r["user_id"],
            "display_name": r["full_name"] or r["email"].split("@")[0],
            "total_xp": r["total_xp"],
            "level": r["current_level"],
            "level_title": r["level_title"],
            "streak_days": r["streak_days"],
            "applications": r["applications_total"],
            "offers": r["offers_total"],
        }
        for i, r in enumerate(rows)
    ]


# ═══════════════════════════════════════════════════
# REJECTION REFRAME ENGINE
# ═══════════════════════════════════════════════════

def reframe_rejection(
    user_id: int,
    app_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """AI-powered rejection reframe — turns a rejection into actionable learning."""
    app = conn.execute(
        "SELECT * FROM application_tracker WHERE id = ? AND user_id = ?",
        (app_id, user_id),
    ).fetchone()
    if not app:
        raise ValueError("Application not found")
    app = dict(app)

    system_prompt = """You are an empathetic career coach who turns rejections into growth.

Analyze this rejection and provide:
1. REFRAME: A positive reinterpretation (NOT toxic positivity — real, constructive)
2. LESSON: What can be learned from this specific rejection
3. ACTION: One concrete step to improve for next time
4. STATS: Normalize with data ("The average software engineer applies to X jobs before landing...")
5. SILVER_LINING: What doors this might open (better company fit, skill development, etc.)

Return JSON:
{
    "reframe": "constructive reinterpretation",
    "lesson": "specific lesson learned",
    "action": "concrete next step",
    "stats_context": "normalizing statistic",
    "silver_lining": "unexpected positive angle",
    "encouragement": "brief, genuine encouragement (1 sentence)"
}

Be specific to their situation. Never minimize their feelings."""

    user_prompt = f"""REJECTED APPLICATION:
Company: {app.get('company', 'Unknown')}
Role: {app.get('title', 'Unknown')}
Match Score: {app.get('match_score', 'N/A')}
Stage Reached: {app.get('status', 'rejected')}
Notes: {app.get('notes', 'None')}
"""

    result = ai_complete_json(system_prompt, user_prompt, user_id=user_id, conn=conn)

    # Update application with rejection insight
    conn.execute(
        "UPDATE application_tracker SET rejection_insight = ? WHERE id = ?",
        (json.dumps(result), app_id),
    )
    conn.commit()

    # Award XP for processing the rejection
    award_xp(user_id, "rejection_reframed", conn, context={"app_id": app_id})

    return {
        "application_id": app_id,
        "company": app.get("company", ""),
        "title": app.get("title", ""),
        **result,
    }
