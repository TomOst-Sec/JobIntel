"""Autopilot Service — autonomous application agent, settings, nightly runs, morning briefings.

Modes:
- full_auto: tailors CV, generates cover letter, tracks application as 'applied'
- pre_approve: tailors CV, tracks as 'queued' for user review
- materials_only: tailors CV only, no tracking

Uses autopilot_settings for user preferences, autopilot_runs for run logs,
application_tracker for applied/queued jobs, and jobs as the source of listings.
"""
import json
import sqlite3
from datetime import datetime, timedelta

from api.services.ai_provider import ai_complete_json
from api.services.cv_intelligence import (
    score_job_match,
    tailor_cv,
    generate_cover_letter,
    track_application,
)
from api.services.gamification import award_xp, update_streak


# ═══════════════════════════════════════════════════
# DEFAULT SETTINGS
# ═══════════════════════════════════════════════════

_DEFAULT_SETTINGS = {
    "is_enabled": 0,
    "mode": "pre_approve",
    "target_roles": [],
    "target_seniority": [],
    "target_locations": [],
    "salary_floor": None,
    "exclude_companies": [],
    "exclude_industries": [],
    "require_salary_disclosed": 0,
    "max_ghost_score": 0.4,
    "max_layoff_risk": 0.7,
    "require_visa_sponsorship": 0,
    "min_match_score": 0.7,
    "max_applications_per_day": 10,
    "max_per_company": 1,
    "cooldown_same_company_days": 90,
    "run_time": "02:00",
    "timezone": "UTC",
}

# Fields that are stored as JSON arrays in SQLite
_JSON_FIELDS = {
    "target_roles",
    "target_seniority",
    "target_locations",
    "exclude_companies",
    "exclude_industries",
}

# Fields allowed to be updated by the user
_UPDATABLE_FIELDS = {
    "is_enabled",
    "mode",
    "target_roles",
    "target_seniority",
    "target_locations",
    "salary_floor",
    "exclude_companies",
    "exclude_industries",
    "require_salary_disclosed",
    "max_ghost_score",
    "max_layoff_risk",
    "require_visa_sponsorship",
    "min_match_score",
    "max_applications_per_day",
    "max_per_company",
    "cooldown_same_company_days",
    "run_time",
    "timezone",
}


# ═══════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════

def _row_to_settings(row: dict) -> dict:
    """Convert a raw DB row into a clean settings dict, deserializing JSON fields."""
    settings = dict(row)
    for field in _JSON_FIELDS:
        raw = settings.get(field)
        if raw and isinstance(raw, str):
            try:
                settings[field] = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                settings[field] = []
        elif raw is None:
            settings[field] = []
    return settings


# ═══════════════════════════════════════════════════
# 1. GET AUTOPILOT SETTINGS
# ═══════════════════════════════════════════════════

def get_autopilot_settings(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get or create default autopilot settings for a user.

    If no settings row exists yet, inserts one with sensible defaults and returns it.
    """
    row = conn.execute(
        "SELECT * FROM autopilot_settings WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    if row:
        return _row_to_settings(dict(row))

    # Create default settings
    conn.execute(
        """INSERT INTO autopilot_settings
           (user_id, is_enabled, mode, target_roles, target_seniority,
            target_locations, salary_floor, exclude_companies, exclude_industries,
            require_salary_disclosed, max_ghost_score, max_layoff_risk,
            require_visa_sponsorship, min_match_score, max_applications_per_day,
            max_per_company, cooldown_same_company_days, run_time, timezone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            _DEFAULT_SETTINGS["is_enabled"],
            _DEFAULT_SETTINGS["mode"],
            json.dumps(_DEFAULT_SETTINGS["target_roles"]),
            json.dumps(_DEFAULT_SETTINGS["target_seniority"]),
            json.dumps(_DEFAULT_SETTINGS["target_locations"]),
            _DEFAULT_SETTINGS["salary_floor"],
            json.dumps(_DEFAULT_SETTINGS["exclude_companies"]),
            json.dumps(_DEFAULT_SETTINGS["exclude_industries"]),
            _DEFAULT_SETTINGS["require_salary_disclosed"],
            _DEFAULT_SETTINGS["max_ghost_score"],
            _DEFAULT_SETTINGS["max_layoff_risk"],
            _DEFAULT_SETTINGS["require_visa_sponsorship"],
            _DEFAULT_SETTINGS["min_match_score"],
            _DEFAULT_SETTINGS["max_applications_per_day"],
            _DEFAULT_SETTINGS["max_per_company"],
            _DEFAULT_SETTINGS["cooldown_same_company_days"],
            _DEFAULT_SETTINGS["run_time"],
            _DEFAULT_SETTINGS["timezone"],
        ),
    )
    conn.commit()

    row = conn.execute(
        "SELECT * FROM autopilot_settings WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return _row_to_settings(dict(row))


# ═══════════════════════════════════════════════════
# 2. UPDATE AUTOPILOT SETTINGS
# ═══════════════════════════════════════════════════

def update_autopilot_settings(
    user_id: int,
    settings_dict: dict,
    conn: sqlite3.Connection,
) -> dict:
    """Update autopilot settings for a user. Only valid fields are accepted.

    JSON-array fields (target_roles, etc.) are serialized before storing.
    Returns the full updated settings dict.
    """
    # Ensure settings row exists
    get_autopilot_settings(user_id, conn)

    # Validate mode if provided
    if "mode" in settings_dict:
        valid_modes = ("full_auto", "pre_approve", "materials_only")
        if settings_dict["mode"] not in valid_modes:
            raise ValueError(
                f"Invalid mode: {settings_dict['mode']}. Must be one of {valid_modes}"
            )

    # Build update clause
    updates = []
    params = []
    for key, value in settings_dict.items():
        if key not in _UPDATABLE_FIELDS:
            continue
        if key in _JSON_FIELDS:
            if not isinstance(value, list):
                raise ValueError(f"Field '{key}' must be a list")
            updates.append(f"{key} = ?")
            params.append(json.dumps(value))
        else:
            updates.append(f"{key} = ?")
            params.append(value)

    if not updates:
        return get_autopilot_settings(user_id, conn)

    updates.append("updated_at = datetime('now')")
    params.append(user_id)

    conn.execute(
        f"UPDATE autopilot_settings SET {', '.join(updates)} WHERE user_id = ?",
        params,
    )
    conn.commit()

    return get_autopilot_settings(user_id, conn)


# ═══════════════════════════════════════════════════
# 3. RUN AUTOPILOT
# ═══════════════════════════════════════════════════

def run_autopilot(user_id: int, conn: sqlite3.Connection) -> dict:
    """Execute a nightly autopilot run.

    Steps:
    1. Load settings, check if enabled
    2. Query jobs matching target_roles / target_locations / salary_floor
    3. Filter by ghost score, layoff risk, salary disclosure
    4. Score each job with score_job_match, filter by min_match_score
    5. Respect max_applications_per_day and max_per_company limits
    6. Check cooldown_same_company_days
    7. For each qualified job, act based on mode (full_auto / pre_approve / materials_only)
    8. Log run to autopilot_runs
    9. Award XP
    10. Return summary
    """
    started_at = datetime.utcnow().isoformat()
    settings = get_autopilot_settings(user_id, conn)

    if not settings.get("is_enabled"):
        return {
            "status": "disabled",
            "message": "Autopilot is not enabled. Enable it in settings.",
            "jobs_found": 0,
            "jobs_qualified": 0,
            "applications_submitted": 0,
        }

    mode = settings.get("mode", "pre_approve")
    target_roles = settings.get("target_roles", [])
    target_locations = settings.get("target_locations", [])
    salary_floor = settings.get("salary_floor")
    exclude_companies = [c.lower() for c in settings.get("exclude_companies", [])]
    exclude_industries = [i.lower() for i in settings.get("exclude_industries", [])]
    require_salary_disclosed = settings.get("require_salary_disclosed", 0)
    max_ghost_score = settings.get("max_ghost_score", 0.4)
    max_layoff_risk = settings.get("max_layoff_risk", 0.7)
    min_match_score = settings.get("min_match_score", 0.7)
    max_applications_per_day = settings.get("max_applications_per_day", 10)
    max_per_company = settings.get("max_per_company", 1)
    cooldown_days = settings.get("cooldown_same_company_days", 90)

    # ── Step 1: Build candidate job query ────────────────────
    where_clauses = []
    query_params = []

    # Match target roles with LIKE
    if target_roles:
        role_likes = []
        for role in target_roles:
            role_likes.append("j.title LIKE ?")
            query_params.append(f"%{role}%")
        where_clauses.append(f"({' OR '.join(role_likes)})")

    # Match target locations with LIKE
    if target_locations:
        loc_likes = []
        for loc in target_locations:
            loc_likes.append("j.location LIKE ?")
            query_params.append(f"%{loc}%")
        where_clauses.append(f"({' OR '.join(loc_likes)})")

    # Salary floor
    if salary_floor is not None:
        where_clauses.append("(j.salary_max >= ? OR j.salary_max IS NULL)")
        query_params.append(salary_floor)

    where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

    candidate_jobs = conn.execute(
        f"""SELECT j.job_id, j.title, j.company, j.location,
                   j.salary_min, j.salary_max, j.ghost_score,
                   j.description, j.required_skills
            FROM jobs j
            WHERE {where_sql}
              AND j.status = 'ACTIVE'
            ORDER BY j.scraped_at DESC
            LIMIT 500""",
        query_params,
    ).fetchall()

    jobs_found = len(candidate_jobs)
    skipped = []
    qualified_jobs = []

    # ── Step 2: Filter candidates ────────────────────────────
    for row in candidate_jobs:
        job = dict(row)
        job_id = job["job_id"]
        company = job.get("company", "")
        company_lower = company.lower()

        # Exclude companies
        if company_lower in exclude_companies:
            skipped.append({"job_id": job_id, "reason": "excluded_company"})
            continue

        # Ghost score filter (ghost_score in jobs table is 0-100, setting is 0-1)
        ghost = job.get("ghost_score")
        if ghost is not None:
            ghost_normalized = ghost / 100.0 if ghost > 1 else ghost
            if ghost_normalized > max_ghost_score:
                skipped.append({"job_id": job_id, "reason": "ghost_score_too_high"})
                continue

        # Layoff risk filter (from enriched_jobs)
        enriched = conn.execute(
            "SELECT layoff_risk_score FROM enriched_jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if enriched and enriched["layoff_risk_score"] is not None:
            if enriched["layoff_risk_score"] > max_layoff_risk:
                skipped.append({"job_id": job_id, "reason": "layoff_risk_too_high"})
                continue

        # Exclude industries (from enriched_jobs)
        if exclude_industries and enriched:
            industry = conn.execute(
                "SELECT company_industry FROM enriched_jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            if industry and industry["company_industry"]:
                if industry["company_industry"].lower() in exclude_industries:
                    skipped.append({"job_id": job_id, "reason": "excluded_industry"})
                    continue

        # Require salary disclosed
        if require_salary_disclosed:
            if job.get("salary_min") is None and job.get("salary_max") is None:
                skipped.append({"job_id": job_id, "reason": "salary_not_disclosed"})
                continue

        # Already applied / queued check
        existing = conn.execute(
            "SELECT id FROM application_tracker WHERE user_id = ? AND job_id = ?",
            (user_id, job_id),
        ).fetchone()
        if existing:
            skipped.append({"job_id": job_id, "reason": "already_applied"})
            continue

        # Score match
        try:
            match_result = score_job_match(user_id, job_id, conn)
            overall_score = match_result.get("overall_score", 0)
        except (ValueError, Exception):
            skipped.append({"job_id": job_id, "reason": "scoring_error"})
            continue

        # Normalize score: overall_score is 0-100, min_match_score is 0-1
        if overall_score / 100.0 < min_match_score:
            skipped.append({"job_id": job_id, "reason": "match_score_below_threshold"})
            continue

        qualified_jobs.append({
            **job,
            "match_score": overall_score,
            "match_details": match_result,
        })

    # ── Step 3: Enforce rate limits ──────────────────────────
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Count applications already submitted today
    today_count_row = conn.execute(
        """SELECT COUNT(*) as cnt FROM application_tracker
           WHERE user_id = ? AND DATE(applied_at) = ?""",
        (user_id, today),
    ).fetchone()
    already_today = today_count_row["cnt"] if today_count_row else 0
    remaining_today = max(0, max_applications_per_day - already_today)

    # Track per-company counts for this run
    company_counts: dict[str, int] = {}

    # Cooldown: get companies applied to within cooldown window
    cooldown_cutoff = (datetime.utcnow() - timedelta(days=cooldown_days)).isoformat()
    recent_companies_rows = conn.execute(
        """SELECT LOWER(company) as company FROM application_tracker
           WHERE user_id = ? AND applied_at >= ?""",
        (user_id, cooldown_cutoff),
    ).fetchall()
    cooldown_companies = {r["company"] for r in recent_companies_rows}

    # Also count existing per-company applications for today
    today_company_rows = conn.execute(
        """SELECT LOWER(company) as company, COUNT(*) as cnt
           FROM application_tracker
           WHERE user_id = ? AND DATE(applied_at) = ?
           GROUP BY LOWER(company)""",
        (user_id, today),
    ).fetchall()
    for r in today_company_rows:
        company_counts[r["company"]] = r["cnt"]

    # ── Step 4: Process qualified jobs ───────────────────────
    submitted = 0
    failed = 0
    processed = []

    for job in qualified_jobs:
        if submitted >= remaining_today:
            break

        job_id = job["job_id"]
        company = job.get("company", "")
        company_lower = company.lower()
        title = job.get("title", "")
        location = job.get("location", "")
        match_score = job.get("match_score", 0)
        ghost = job.get("ghost_score")

        # Cooldown check
        if company_lower in cooldown_companies:
            skipped.append({"job_id": job_id, "reason": "company_cooldown"})
            continue

        # Per-company limit
        current_company_count = company_counts.get(company_lower, 0)
        if current_company_count >= max_per_company:
            skipped.append({"job_id": job_id, "reason": "max_per_company_reached"})
            continue

        try:
            if mode == "full_auto":
                # Tailor CV
                tailored = tailor_cv(user_id, job_id, "standard", conn)
                tailored_id = tailored.get("tailored_id")

                # Generate cover letter
                cover = generate_cover_letter(user_id, job_id, "professional", conn, tailored_id=tailored_id)
                cover_letter_id = cover.get("cover_letter_id")

                # Track application as 'applied'
                app_result = track_application(
                    user_id=user_id,
                    job_id=job_id,
                    company=company,
                    title=title,
                    location=location,
                    applied_via="autopilot",
                    cv_tailored_id=tailored_id,
                    cover_letter_id=cover_letter_id,
                    match_score=match_score,
                    ghost_score=ghost,
                    conn=conn,
                )

                # Award XP
                award_xp(user_id, "application_autopilot", conn, context={
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                })

                submitted += 1
                company_counts[company_lower] = current_company_count + 1
                processed.append({
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                    "action": "applied",
                    "match_score": match_score,
                    "application_id": app_result.get("application_id"),
                })

            elif mode == "pre_approve":
                # Tailor CV
                tailored = tailor_cv(user_id, job_id, "standard", conn)
                tailored_id = tailored.get("tailored_id")

                # Track as 'queued' — insert directly since track_application hardcodes 'applied'
                conn.execute(
                    """INSERT INTO application_tracker
                       (user_id, job_id, company, title, location, status, applied_via,
                        cv_tailored_id, match_score, ghost_score)
                       VALUES (?, ?, ?, ?, ?, 'queued', 'autopilot', ?, ?, ?)""",
                    (user_id, job_id, company, title, location,
                     tailored_id, match_score, ghost),
                )
                conn.commit()
                app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

                # Award XP (lesser amount for queued)
                award_xp(user_id, "application_autopilot", conn, context={
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                    "status": "queued",
                })

                submitted += 1
                company_counts[company_lower] = current_company_count + 1
                processed.append({
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                    "action": "queued",
                    "match_score": match_score,
                    "application_id": app_id,
                })

            elif mode == "materials_only":
                # Just tailor the CV, no tracking
                tailored = tailor_cv(user_id, job_id, "standard", conn)

                # Award XP for tailoring
                award_xp(user_id, "cv_tailored", conn, context={
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                })

                submitted += 1
                processed.append({
                    "job_id": job_id,
                    "company": company,
                    "title": title,
                    "action": "materials_prepared",
                    "match_score": match_score,
                    "tailored_id": tailored.get("tailored_id"),
                })

        except Exception:
            failed += 1
            skipped.append({"job_id": job_id, "reason": "processing_error"})
            continue

    # ── Step 5: Log the run ──────────────────────────────────
    completed_at = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO autopilot_runs
           (user_id, run_date, jobs_found, jobs_qualified, applications_submitted,
            applications_failed, jobs_skipped_data, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            today,
            jobs_found,
            len(qualified_jobs),
            submitted,
            failed,
            json.dumps(skipped),
            started_at,
            completed_at,
        ),
    )
    conn.commit()

    # Update streak for the day
    update_streak(user_id, conn)

    return {
        "status": "completed",
        "mode": mode,
        "run_date": today,
        "jobs_found": jobs_found,
        "jobs_qualified": len(qualified_jobs),
        "applications_submitted": submitted,
        "applications_failed": failed,
        "jobs_skipped": len(skipped),
        "processed": processed,
        "started_at": started_at,
        "completed_at": completed_at,
    }


# ═══════════════════════════════════════════════════
# 4. MORNING BRIEFING
# ═══════════════════════════════════════════════════

def generate_morning_briefing(user_id: int, conn: sqlite3.Connection) -> dict:
    """Generate an AI-powered morning briefing.

    Gathers:
    - Last autopilot run stats
    - Active applications by status
    - New matching jobs since last run
    - Streak / gamification info

    Returns a structured briefing with sections:
    highlights, action_items, new_opportunities, streak_status, motivation.
    """
    # ── Gather data ──────────────────────────────────────────

    # Last run
    last_run_row = conn.execute(
        """SELECT * FROM autopilot_runs
           WHERE user_id = ?
           ORDER BY run_date DESC LIMIT 1""",
        (user_id,),
    ).fetchone()
    last_run = dict(last_run_row) if last_run_row else None

    # Active applications by status
    status_rows = conn.execute(
        """SELECT status, COUNT(*) as count
           FROM application_tracker
           WHERE user_id = ? AND status NOT IN ('rejected', 'withdrawn', 'ghosted', 'accepted')
           GROUP BY status""",
        (user_id,),
    ).fetchall()
    active_apps = {r["status"]: r["count"] for r in status_rows}
    total_active = sum(active_apps.values())

    # Recent responses (last 7 days)
    week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
    responses = conn.execute(
        """SELECT company, title, status, updated_at
           FROM application_tracker
           WHERE user_id = ? AND updated_at >= ? AND status IN ('viewed', 'phone_screen', 'technical', 'onsite', 'offer')
           ORDER BY updated_at DESC LIMIT 10""",
        (user_id, week_ago),
    ).fetchall()
    recent_responses = [dict(r) for r in responses]

    # New jobs matching settings (posted in last 24 hours)
    settings = get_autopilot_settings(user_id, conn)
    target_roles = settings.get("target_roles", [])
    new_jobs = []
    if target_roles:
        role_likes = []
        role_params = []
        for role in target_roles:
            role_likes.append("title LIKE ?")
            role_params.append(f"%{role}%")

        yesterday = (datetime.utcnow() - timedelta(days=1)).isoformat()
        role_params.append(yesterday)
        new_job_rows = conn.execute(
            f"""SELECT job_id, title, company, location, salary_min, salary_max
                FROM jobs
                WHERE ({' OR '.join(role_likes)})
                  AND status = 'ACTIVE'
                  AND scraped_at >= ?
                ORDER BY scraped_at DESC LIMIT 20""",
            role_params,
        ).fetchall()
        new_jobs = [dict(r) for r in new_job_rows]

    # Streak info
    level_row = conn.execute(
        "SELECT * FROM user_levels WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    streak_info = {}
    if level_row:
        level_data = dict(level_row)
        streak_info = {
            "streak_days": level_data.get("streak_days", 0),
            "streak_best": level_data.get("streak_best", 0),
            "level": level_data.get("current_level", 1),
            "level_title": level_data.get("level_title", "Applicant"),
            "total_xp": level_data.get("total_xp", 0),
            "momentum_score": level_data.get("momentum_score", 0),
        }

    # Total stats
    total_stats = conn.execute(
        """SELECT
               COUNT(*) as total_apps,
               SUM(CASE WHEN status = 'offer' THEN 1 ELSE 0 END) as offers,
               SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejections
           FROM application_tracker WHERE user_id = ?""",
        (user_id,),
    ).fetchone()
    total_apps = total_stats["total_apps"] if total_stats else 0
    total_offers = total_stats["offers"] if total_stats else 0
    total_rejections = total_stats["rejections"] if total_stats else 0

    # ── Generate briefing with AI ────────────────────────────

    system_prompt = """You are JobIntel's morning briefing AI. Generate a concise, energizing morning briefing for a job seeker.

Return JSON with these exact sections:
{
    "highlights": ["key highlight 1", "key highlight 2", "key highlight 3"],
    "action_items": ["specific action 1", "specific action 2"],
    "new_opportunities": ["opportunity summary 1", "opportunity summary 2"],
    "streak_status": "one sentence about their streak and momentum",
    "motivation": "one sentence of genuine, specific encouragement — not generic platitudes"
}

Rules:
- Be specific to their actual data — never make up numbers
- If there are responses or interviews, celebrate them
- If there are new matching jobs, highlight the best ones
- If the streak is strong, acknowledge it
- Action items should be concrete and achievable today
- Keep it brief — this is a glanceable morning update
"""

    user_prompt = f"""JOB SEEKER DATA:

Last Autopilot Run: {json.dumps(last_run) if last_run else 'No runs yet'}

Active Applications: {json.dumps(active_apps)} (Total active: {total_active})

Recent Responses (last 7 days): {json.dumps(recent_responses)}

New Matching Jobs (last 24h): {len(new_jobs)} found
Top matches: {json.dumps(new_jobs[:5]) if new_jobs else 'None'}

Streak & Level: {json.dumps(streak_info)}

Overall Stats: {total_apps} total applications, {total_offers} offers, {total_rejections} rejections
"""

    try:
        briefing = ai_complete_json(system_prompt, user_prompt, user_id=user_id, conn=conn)
    except Exception:
        # Fallback if AI fails
        briefing = {
            "highlights": [
                f"You have {total_active} active applications",
                f"{len(new_jobs)} new matching jobs found" if new_jobs else "Check back later for new jobs",
            ],
            "action_items": ["Review your active applications", "Check new job matches"],
            "new_opportunities": [f"{j['title']} at {j['company']}" for j in new_jobs[:3]],
            "streak_status": f"Streak: {streak_info.get('streak_days', 0)} days",
            "motivation": "Keep going — consistency is what separates successful job seekers.",
        }

    # Award XP for reading the briefing
    award_xp(user_id, "morning_briefing_read", conn)

    return {
        "user_id": user_id,
        "generated_at": datetime.utcnow().isoformat(),
        "briefing": briefing,
        "data": {
            "last_run": last_run,
            "active_applications": active_apps,
            "total_active": total_active,
            "recent_responses": recent_responses,
            "new_matching_jobs": len(new_jobs),
            "new_jobs_sample": new_jobs[:5],
            "streak": streak_info,
            "total_applications": total_apps,
            "total_offers": total_offers,
        },
    }


# ═══════════════════════════════════════════════════
# 5. AUTOPILOT HISTORY
# ═══════════════════════════════════════════════════

def get_autopilot_history(
    user_id: int,
    conn: sqlite3.Connection,
    limit: int = 30,
) -> list[dict]:
    """Get autopilot run history for a user.

    Returns the most recent runs with deserialized skip data.
    """
    rows = conn.execute(
        """SELECT * FROM autopilot_runs
           WHERE user_id = ?
           ORDER BY run_date DESC
           LIMIT ?""",
        (user_id, limit),
    ).fetchall()

    results = []
    for row in rows:
        d = dict(row)
        # Deserialize JSON fields
        if d.get("jobs_skipped_data"):
            try:
                d["jobs_skipped_data"] = json.loads(d["jobs_skipped_data"])
            except (json.JSONDecodeError, TypeError):
                d["jobs_skipped_data"] = []
        else:
            d["jobs_skipped_data"] = []
        results.append(d)

    return results


# ═══════════════════════════════════════════════════
# 6. APPROVE QUEUED APPLICATIONS
# ═══════════════════════════════════════════════════

def approve_queued_applications(
    user_id: int,
    app_ids: list[int],
    conn: sqlite3.Connection,
) -> dict:
    """Approve pre-approved (queued) applications.

    Changes status from 'queued' to 'applied' for the given application IDs.
    Only applications belonging to the user and currently in 'queued' status are updated.
    """
    approved = []
    not_found = []
    already_processed = []

    for app_id in app_ids:
        row = conn.execute(
            "SELECT * FROM application_tracker WHERE id = ? AND user_id = ?",
            (app_id, user_id),
        ).fetchone()

        if not row:
            not_found.append(app_id)
            continue

        app = dict(row)
        if app["status"] != "queued":
            already_processed.append(app_id)
            continue

        # Update to 'applied'
        conn.execute(
            """UPDATE application_tracker
               SET status = 'applied', updated_at = datetime('now')
               WHERE id = ? AND user_id = ?""",
            (app_id, user_id),
        )

        # Generate cover letter if not yet created
        job_id = app.get("job_id")
        tailored_id = app.get("cv_tailored_id")
        if job_id and not app.get("cover_letter_id"):
            try:
                cover = generate_cover_letter(
                    user_id, job_id, "professional", conn, tailored_id=tailored_id,
                )
                conn.execute(
                    "UPDATE application_tracker SET cover_letter_id = ? WHERE id = ?",
                    (cover.get("cover_letter_id"), app_id),
                )
            except Exception:
                pass  # Cover letter is optional; don't block approval

        # Award XP for the approval
        award_xp(user_id, "application_submitted", conn, context={
            "job_id": job_id,
            "company": app.get("company", ""),
            "title": app.get("title", ""),
            "approved_from_queue": True,
        })

        approved.append(app_id)

    conn.commit()

    return {
        "approved": approved,
        "approved_count": len(approved),
        "not_found": not_found,
        "already_processed": already_processed,
    }
