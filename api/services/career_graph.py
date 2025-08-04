"""Career Graph Service — trajectory prediction, future self simulator, and alert intelligence.

Provides:
- Career trajectory prediction (aggressive / balanced / conservative paths)
- Future self simulation (3 scenario projections)
- Gap analysis against target roles using market data
- Career alert generation with notification queue integration
- Notification management (read/unread)

Uses migration 013 tables: career_trajectories, cv_dna, jobs, notification_queue.
"""
import json
import sqlite3
from datetime import datetime

from api.services.ai_provider import ai_complete_json


# ===============================================
# TRAJECTORY PREDICTION
# ===============================================

def predict_trajectory(
    user_id: int,
    target_role: str,
    target_company_type: str,
    trajectory_type: str,
    conn: sqlite3.Connection,
) -> dict:
    """Predict a career trajectory from current position toward a target role.

    trajectory_type:
        - "aggressive": fast track, higher risk, steeper growth
        - "balanced": standard progression, moderate risk
        - "conservative": stability-focused, lower risk, steady growth
    """
    # Load user's CV DNA
    cv = _load_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")

    pace_guidance = {
        "aggressive": (
            "Fast-track trajectory. Assume the candidate pursues every growth opportunity, "
            "changes roles every 1-2 years, aggressively upskills, and takes calculated risks. "
            "Higher salary jumps, shorter timelines, but lower probability of success."
        ),
        "balanced": (
            "Standard progression. Assume steady growth, role changes every 2-3 years, "
            "consistent skill building, and moderate risk tolerance. "
            "Realistic salary growth and reasonable probability of success."
        ),
        "conservative": (
            "Stability-focused trajectory. Assume the candidate prefers security, "
            "stays in roles 3-5 years, builds deep expertise before moving, and avoids high-risk jumps. "
            "Slower salary growth but higher probability of success."
        ),
    }

    system_prompt = (
        f"You are a career trajectory analyst. Given this professional's current position, "
        f"predict their career path toward {target_role}.\n\n"
        f"Trajectory pace: {pace_guidance.get(trajectory_type, pace_guidance['balanced'])}\n\n"
        f"Target company type: {target_company_type}\n\n"
        "Return JSON with these exact fields:\n"
        "{\n"
        '    "current_position": {"role": "", "level": "", "skills": [], "years_experience": 0},\n'
        '    "target_position": {"role": "", "company_type": "", "estimated_salary": 0},\n'
        '    "milestones": [\n'
        '        {"year": 2026, "role": "", "skills_to_add": [], "salary_estimate": 0}\n'
        "    ],\n"
        '    "gaps": {\n'
        '        "skills": ["skill gaps"],\n'
        '        "experience": ["experience gaps"],\n'
        '        "education": ["education gaps"]\n'
        "    },\n"
        '    "salary_projection": {\n'
        '        "2026": {"p25": 0, "p50": 0, "p75": 0},\n'
        '        "2027": {"p25": 0, "p50": 0, "p75": 0}\n'
        "    },\n"
        '    "success_probability": 0.65,\n'
        '    "peer_paths_summary": "How similar professionals have progressed..."\n'
        "}\n\n"
        "Be realistic and specific. Base estimates on current market conditions."
    )

    user_prompt = (
        f"Current Headline: {headline}\n"
        f"Skills: {json.dumps(skills)}\n"
        f"Experience: {json.dumps(experience[:5])}\n"
        f"Target Role: {target_role}\n"
        f"Target Company Type: {target_company_type}\n"
        f"Trajectory Type: {trajectory_type}"
    )

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn, prefer_smart=True,
    )

    # Store in career_trajectories table
    conn.execute(
        """INSERT INTO career_trajectories
           (user_id, trajectory_type, current_position, target_position,
            gaps, milestones, salary_projection, success_probability, peer_paths_summary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            trajectory_type,
            json.dumps(result.get("current_position", {})),
            json.dumps(result.get("target_position", {})),
            json.dumps(result.get("gaps", {})),
            json.dumps(result.get("milestones", [])),
            json.dumps(result.get("salary_projection", {})),
            result.get("success_probability", 0),
            json.dumps(result.get("peer_paths_summary", "")),
        ),
    )
    conn.commit()

    trajectory_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return {
        "trajectory_id": trajectory_id,
        "user_id": user_id,
        "trajectory_type": trajectory_type,
        "current_position": result.get("current_position", {}),
        "target_position": result.get("target_position", {}),
        "milestones": result.get("milestones", []),
        "gaps": result.get("gaps", {}),
        "salary_projection": result.get("salary_projection", {}),
        "success_probability": result.get("success_probability", 0),
        "peer_paths_summary": result.get("peer_paths_summary", ""),
    }


# ===============================================
# FUTURE SELF SIMULATOR
# ===============================================

def simulate_future_self(
    user_id: int,
    years_ahead: int,
    conn: sqlite3.Connection,
) -> dict:
    """Simulate 3 future scenarios for the user over a given time horizon.

    Generates:
        - aggressive: maximize growth, frequent role changes
        - balanced: steady progression
        - conservative: stability and depth-focused
    """
    cv = _load_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")

    current_year = datetime.now().year
    target_year = current_year + years_ahead

    system_prompt = (
        "You are a career futurist. Given this professional's current profile, "
        f"simulate three possible career scenarios {years_ahead} years from now ({target_year}).\n\n"
        "Generate exactly 3 scenarios:\n"
        '1. "aggressive" — maximize growth, take risks, switch frequently\n'
        '2. "balanced" — steady progression, moderate risk\n'
        '3. "conservative" — stability-focused, deep expertise\n\n'
        "Return JSON:\n"
        "{\n"
        '    "current_year": ' + str(current_year) + ",\n"
        '    "target_year": ' + str(target_year) + ",\n"
        '    "scenarios": [\n'
        "        {\n"
        '            "type": "aggressive",\n'
        '            "role": "predicted role title",\n'
        '            "company_type": "startup / enterprise / consulting / etc.",\n'
        '            "salary_range": {"min": 0, "max": 0, "currency": "USD"},\n'
        '            "skills_gained": ["skill1", "skill2"],\n'
        '            "career_satisfaction": 0.0,\n'
        '            "key_moves": ["move 1 description", "move 2"],\n'
        '            "risks": ["risk 1", "risk 2"],\n'
        '            "probability": 0.0\n'
        "        }\n"
        "    ]\n"
        "}\n\n"
        "Be specific and realistic. Vary the scenarios meaningfully."
    )

    user_prompt = (
        f"Current Headline: {headline}\n"
        f"Skills: {json.dumps(skills)}\n"
        f"Experience: {json.dumps(experience[:5])}\n"
        f"Years Ahead: {years_ahead}"
    )

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn, prefer_smart=True,
    )

    return {
        "user_id": user_id,
        "current_year": result.get("current_year", current_year),
        "target_year": result.get("target_year", target_year),
        "years_ahead": years_ahead,
        "scenarios": result.get("scenarios", []),
    }


# ===============================================
# GAP ANALYSIS
# ===============================================

def get_career_gaps(
    user_id: int,
    target_role: str,
    conn: sqlite3.Connection,
) -> dict:
    """Analyze gaps between user's current profile and a target role.

    Combines CV DNA with live market data from the jobs table
    to identify specific skill, experience, and education gaps.
    """
    cv = _load_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")

    # Gather market data: most common required_skills for target_role
    market_rows = conn.execute(
        """SELECT required_skills FROM jobs
           WHERE (LOWER(title) LIKE ? OR LOWER(search_category) LIKE ?)
             AND required_skills IS NOT NULL AND required_skills != ''
             AND scraped_at >= datetime('now', '-60 days')
           ORDER BY scraped_at DESC
           LIMIT 50""",
        (f"%{target_role.lower()}%", f"%{target_role.lower()}%"),
    ).fetchall()

    # Aggregate skill frequencies from market data
    skill_freq: dict[str, int] = {}
    for row in market_rows:
        raw = dict(row).get("required_skills", "")
        if raw:
            for sk in raw.split(","):
                s = sk.strip().lower()
                if s:
                    skill_freq[s] = skill_freq.get(s, 0) + 1

    top_market_skills = dict(
        sorted(skill_freq.items(), key=lambda x: x[1], reverse=True)[:20]
    )

    system_prompt = (
        "You are a career gap analyst. Compare this professional's current profile "
        f"against the requirements for the role: {target_role}.\n\n"
        "Use the real market data provided to identify concrete gaps.\n\n"
        "Return JSON:\n"
        "{\n"
        '    "missing_skills": [\n'
        '        {"skill": "", "importance": "critical|important|nice_to_have", '
        '"market_demand_pct": 0}\n'
        "    ],\n"
        '    "experience_gaps": [\n'
        '        {"gap": "description of experience gap", "severity": "high|medium|low"}\n'
        "    ],\n"
        '    "education_gaps": [\n'
        '        {"gap": "description", "severity": "high|medium|low"}\n'
        "    ],\n"
        '    "certifications_recommended": [\n'
        '        {"name": "", "issuer": "", "impact": "high|medium|low", "time_to_complete": ""}\n'
        "    ],\n"
        '    "timeline_to_ready": {\n'
        '        "aggressive": "X months",\n'
        '        "balanced": "X months",\n'
        '        "conservative": "X months"\n'
        "    },\n"
        '    "current_readiness_pct": 0,\n'
        '    "summary": "Brief assessment of overall readiness"\n'
        "}\n\n"
        "Be honest and specific. Base skill importance on actual market frequency data."
    )

    user_prompt = (
        f"Current Headline: {headline}\n"
        f"Current Skills: {json.dumps(skills)}\n"
        f"Experience: {json.dumps(experience[:5])}\n"
        f"Target Role: {target_role}\n"
        f"Market Skill Demand (skill: frequency): {json.dumps(top_market_skills)}\n"
        f"Total job postings analyzed: {len(market_rows)}"
    )

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn, prefer_smart=True,
    )

    return {
        "user_id": user_id,
        "target_role": target_role,
        "missing_skills": result.get("missing_skills", []),
        "experience_gaps": result.get("experience_gaps", []),
        "education_gaps": result.get("education_gaps", []),
        "certifications_recommended": result.get("certifications_recommended", []),
        "timeline_to_ready": result.get("timeline_to_ready", {}),
        "current_readiness_pct": result.get("current_readiness_pct", 0),
        "summary": result.get("summary", ""),
        "market_data_jobs_analyzed": len(market_rows),
        "top_market_skills": top_market_skills,
    }


# ===============================================
# USER TRAJECTORIES (HISTORY)
# ===============================================

def get_user_trajectories(
    user_id: int,
    conn: sqlite3.Connection,
) -> list[dict]:
    """Fetch all stored trajectories for a user, parsing JSON fields."""
    rows = conn.execute(
        """SELECT * FROM career_trajectories
           WHERE user_id = ?
           ORDER BY generated_at DESC""",
        (user_id,),
    ).fetchall()

    results = []
    for row in rows:
        d = dict(row)
        for field in [
            "current_position", "target_position", "gaps",
            "milestones", "salary_projection", "peer_paths_summary",
        ]:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        results.append(d)
    return results


# ===============================================
# CAREER ALERT GENERATION
# ===============================================

def generate_career_alert(
    user_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Analyze user's trajectory against the current market and generate actionable alerts.

    Detects:
        - Skill demand shifts relevant to the user's trajectory
        - Salary window opportunities (market compensation trending up)
        - Role availability spikes (surge in relevant job postings)

    Creates a notification in notification_queue if actionable insights are found.
    """
    cv = _load_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    skills = cv.get("skills_canonical", [])
    headline = cv.get("headline", "")

    # Get user's latest trajectory for context
    latest_trajectory = conn.execute(
        """SELECT * FROM career_trajectories
           WHERE user_id = ?
           ORDER BY generated_at DESC LIMIT 1""",
        (user_id,),
    ).fetchone()

    trajectory_context = ""
    if latest_trajectory:
        t = dict(latest_trajectory)
        target_pos = t.get("target_position", "{}")
        try:
            target_pos = json.loads(target_pos) if isinstance(target_pos, str) else target_pos
        except (json.JSONDecodeError, TypeError):
            target_pos = {}
        trajectory_context = (
            f"Active trajectory type: {t.get('trajectory_type', 'balanced')}\n"
            f"Target position: {json.dumps(target_pos)}\n"
            f"Success probability: {t.get('success_probability', 'unknown')}"
        )

    # Gather market signals: recent job postings relevant to user's skills
    skill_placeholders = ",".join("?" for _ in skills[:10])
    relevant_jobs_count = 0
    salary_data = []

    if skills:
        # Count recent relevant job postings
        for skill in skills[:10]:
            count = conn.execute(
                """SELECT COUNT(*) FROM jobs
                   WHERE LOWER(required_skills) LIKE ?
                     AND scraped_at >= datetime('now', '-14 days')""",
                (f"%{skill.lower()}%",),
            ).fetchone()[0]
            relevant_jobs_count += count

        # Salary trends for user's skills
        salary_rows = conn.execute(
            """SELECT AVG(salary_min) as avg_min, AVG(salary_max) as avg_max
               FROM jobs
               WHERE salary_min > 0
                 AND scraped_at >= datetime('now', '-30 days')
                 AND (""" + " OR ".join(
                    "LOWER(required_skills) LIKE ?" for _ in skills[:5]
                ) + ")",
            tuple(f"%{s.lower()}%" for s in skills[:5]),
        ).fetchone()
        if salary_rows and salary_rows["avg_min"]:
            salary_data = [
                {"avg_min": salary_rows["avg_min"], "avg_max": salary_rows["avg_max"]}
            ]

    # Detect skill demand shifts
    skill_demand = {}
    for skill in skills[:10]:
        recent = conn.execute(
            """SELECT COUNT(*) FROM jobs
               WHERE LOWER(required_skills) LIKE ?
                 AND scraped_at >= datetime('now', '-14 days')""",
            (f"%{skill.lower()}%",),
        ).fetchone()[0]
        prior = conn.execute(
            """SELECT COUNT(*) FROM jobs
               WHERE LOWER(required_skills) LIKE ?
                 AND scraped_at >= datetime('now', '-28 days')
                 AND scraped_at < datetime('now', '-14 days')""",
            (f"%{skill.lower()}%",),
        ).fetchone()[0]
        if prior > 0 or recent > 0:
            skill_demand[skill] = {"recent_14d": recent, "prior_14d": prior}

    system_prompt = (
        "You are a career intelligence alert system. Analyze this professional's profile "
        "and market data to generate actionable career alerts.\n\n"
        "Detect:\n"
        "1. Skill demand shifts — are any of their skills trending up or down?\n"
        "2. Salary window opportunities — is compensation rising for their profile?\n"
        "3. Role availability spikes — sudden increase in relevant job postings?\n\n"
        "Return JSON:\n"
        "{\n"
        '    "alerts": [\n'
        "        {\n"
        '            "type": "skill_demand_shift | salary_window | role_spike | trajectory_update",\n'
        '            "priority": "critical | high | medium | low",\n'
        '            "title": "Short alert title",\n'
        '            "body": "Detailed explanation with specific data points",\n'
        '            "action_label": "What to do next",\n'
        '            "action_url": "/seeker/jobs or /seeker/career-graph"\n'
        "        }\n"
        "    ],\n"
        '    "market_health": "strong | neutral | cooling",\n'
        '    "urgency_score": 0.0,\n'
        '    "summary": "One-line summary of the most important finding"\n'
        "}\n\n"
        "Only include alerts that are genuinely actionable. No fluff."
    )

    user_prompt = (
        f"Professional Headline: {headline}\n"
        f"Skills: {json.dumps(skills)}\n"
        f"Trajectory: {trajectory_context}\n"
        f"Relevant jobs in last 14 days: {relevant_jobs_count}\n"
        f"Salary data: {json.dumps(salary_data)}\n"
        f"Skill demand (recent vs prior 14d): {json.dumps(skill_demand)}"
    )

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn,
    )

    alerts = result.get("alerts", [])

    # Insert actionable alerts into notification_queue
    notifications_created = 0
    for alert in alerts:
        priority = alert.get("priority", "medium")
        if priority in ("critical", "high", "medium"):
            conn.execute(
                """INSERT INTO notification_queue
                   (user_id, notification_type, priority, title, body,
                    action_url, action_label, metadata, channels)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    alert.get("type", "career_alert"),
                    priority,
                    alert.get("title", "Career Alert"),
                    alert.get("body", ""),
                    alert.get("action_url", "/seeker/career-graph"),
                    alert.get("action_label", "View Details"),
                    json.dumps({"source": "career_graph", "urgency": result.get("urgency_score", 0)}),
                    "in_app",
                ),
            )
            notifications_created += 1
    conn.commit()

    return {
        "user_id": user_id,
        "alerts": alerts,
        "market_health": result.get("market_health", "neutral"),
        "urgency_score": result.get("urgency_score", 0),
        "summary": result.get("summary", ""),
        "notifications_created": notifications_created,
    }


# ===============================================
# NOTIFICATION MANAGEMENT
# ===============================================

def get_notifications(
    user_id: int,
    unread_only: bool,
    conn: sqlite3.Connection,
    limit: int = 50,
) -> list[dict]:
    """Query notifications for a user from notification_queue.

    Args:
        user_id: The user to fetch notifications for.
        unread_only: If True, only return notifications where read_at IS NULL.
        conn: Database connection.
        limit: Maximum number of notifications to return.
    """
    query = "SELECT * FROM notification_queue WHERE user_id = ?"
    params: list = [user_id]

    if unread_only:
        query += " AND read_at IS NULL"

    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()

    results = []
    for row in rows:
        d = dict(row)
        if d.get("metadata"):
            try:
                d["metadata"] = json.loads(d["metadata"])
            except (json.JSONDecodeError, TypeError):
                pass
        results.append(d)
    return results


def mark_notification_read(
    notification_id: int,
    user_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Mark a specific notification as read."""
    result = conn.execute(
        """UPDATE notification_queue
           SET read_at = datetime('now')
           WHERE id = ? AND user_id = ?""",
        (notification_id, user_id),
    )
    conn.commit()

    if result.rowcount == 0:
        raise ValueError("Notification not found")

    return {"notification_id": notification_id, "read": True}


# ===============================================
# HELPERS
# ===============================================

def _load_cv_dna(user_id: int, conn: sqlite3.Connection) -> dict | None:
    """Load the current CV DNA for a user, parsing all JSON fields."""
    row = conn.execute(
        "SELECT * FROM cv_dna WHERE user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if not row:
        return None

    d = dict(row)
    for field in [
        "structured_data", "skills_canonical", "skills_depth", "skills_recency",
        "experience_data", "education_data", "projects_data", "certifications_data",
        "enrichment_data", "hidden_strengths", "gap_matrix",
    ]:
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return d
