"""Bidirectional Matching Engine — AI-powered match scoring.

Rates the JOB for the CANDIDATE, not just the candidate for the job.
Produces explainable match scores with detailed breakdowns.
"""
import json
import sqlite3
from datetime import datetime

from api.services.skill_graph import get_user_skills, analyze_skill_gaps
from api.services.ai_provider import ai_complete_json


def compute_match(
    user_id: int,
    job_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Compute bidirectional match score for a user-job pair."""
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise ValueError("User not found")

    job = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not job:
        raise ValueError("Job not found")

    # Get user profile data
    profile = conn.execute(
        "SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)
    ).fetchone()

    github = conn.execute(
        "SELECT build_score, skills_extracted, top_languages FROM github_profiles WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    agent_config = conn.execute(
        "SELECT * FROM ai_agent_config WHERE user_id = ?", (user_id,)
    ).fetchone()

    # ── Candidate Score for Job ──
    technical_fit = _compute_technical_fit(user_id, job, conn)
    culture_fit = _compute_culture_fit(profile, agent_config, job, conn)
    comp_alignment = _compute_comp_alignment(user_id, job, agent_config, conn)
    growth_fit = _compute_growth_fit(profile, github, job)
    candidate_overall = round(
        technical_fit * 0.35 + culture_fit * 0.20 + comp_alignment * 0.25 + growth_fit * 0.20, 1
    )

    # ── Job Score for Candidate ──
    company_health = _compute_company_health(job, conn)
    team_quality = _compute_team_quality(job, conn)
    role_clarity = _compute_role_clarity(job)
    interview_quality = _compute_interview_quality(job, conn)
    job_overall = round(
        company_health * 0.25 + team_quality * 0.30 + role_clarity * 0.25 + interview_quality * 0.20, 1
    )

    # Combined confidence
    match_confidence = round((candidate_overall + job_overall) / 2, 1)

    # Generate explanation
    explanation = _generate_explanation(
        job, technical_fit, culture_fit, comp_alignment, growth_fit,
        company_health, team_quality, role_clarity, interview_quality,
    )

    # Upsert match record
    conn.execute("""
        INSERT INTO job_matches (
            user_id, job_id, technical_fit, culture_fit, comp_alignment, growth_fit,
            candidate_overall, company_health, team_quality, role_clarity, interview_quality,
            job_overall, match_confidence, match_explanation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, job_id) DO UPDATE SET
            technical_fit=excluded.technical_fit, culture_fit=excluded.culture_fit,
            comp_alignment=excluded.comp_alignment, growth_fit=excluded.growth_fit,
            candidate_overall=excluded.candidate_overall,
            company_health=excluded.company_health, team_quality=excluded.team_quality,
            role_clarity=excluded.role_clarity, interview_quality=excluded.interview_quality,
            job_overall=excluded.job_overall, match_confidence=excluded.match_confidence,
            match_explanation=excluded.match_explanation, updated_at=datetime('now')
    """, (
        user_id, job_id, technical_fit, culture_fit, comp_alignment, growth_fit,
        candidate_overall, company_health, team_quality, role_clarity, interview_quality,
        job_overall, match_confidence, explanation,
    ))
    conn.commit()

    return {
        "user_id": user_id,
        "job_id": job_id,
        "candidate_score": {
            "technical_fit": technical_fit,
            "culture_fit": culture_fit,
            "comp_alignment": comp_alignment,
            "growth_fit": growth_fit,
            "overall": candidate_overall,
        },
        "job_score": {
            "company_health": company_health,
            "team_quality": team_quality,
            "role_clarity": role_clarity,
            "interview_quality": interview_quality,
            "overall": job_overall,
        },
        "match_confidence": match_confidence,
        "explanation": explanation,
    }


def get_top_matches(
    user_id: int,
    limit: int = 20,
    min_score: float = 50,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get top matches for a user, sorted by confidence."""
    rows = conn.execute("""
        SELECT jm.*, j.title, j.company, j.location, j.salary_min, j.salary_max,
               j.job_type, j.posted_at
        FROM job_matches jm
        JOIN jobs j ON jm.job_id = j.id
        WHERE jm.user_id = ? AND jm.match_confidence >= ?
        ORDER BY jm.match_confidence DESC
        LIMIT ?
    """, (user_id, min_score, limit)).fetchall()
    return [dict(r) for r in rows]


def update_match_status(
    user_id: int,
    job_id: int,
    status: str,
    conn: sqlite3.Connection,
) -> dict:
    """Update the status of a match (interested, applied, etc.)."""
    valid_statuses = {"discovered", "presented", "interested", "applied", "interviewing", "offered", "hired", "rejected"}
    if status not in valid_statuses:
        raise ValueError(f"Invalid status: {status}")

    conn.execute("""
        UPDATE job_matches SET status = ?, updated_at = datetime('now')
        WHERE user_id = ? AND job_id = ?
    """, (status, user_id, job_id))
    conn.commit()
    return {"user_id": user_id, "job_id": job_id, "status": status}


def batch_compute_matches(user_id: int, conn: sqlite3.Connection, limit: int = 50) -> int:
    """Compute matches for a user against recent jobs. Returns count of new matches."""
    # Get jobs not yet matched
    jobs = conn.execute("""
        SELECT j.id FROM jobs j
        LEFT JOIN job_matches jm ON j.id = jm.job_id AND jm.user_id = ?
        WHERE jm.id IS NULL
        ORDER BY j.posted_at DESC
        LIMIT ?
    """, (user_id, limit)).fetchall()

    count = 0
    for job_row in jobs:
        try:
            compute_match(user_id, job_row["id"], conn)
            count += 1
        except Exception:
            continue
    return count


# ═══════════════════════════════════════════════════
# SCORING HELPERS
# ═══════════════════════════════════════════════════

def _compute_technical_fit(user_id: int, job: dict, conn: sqlite3.Connection) -> float:
    """Score technical fit based on skill graph overlap."""
    user_skills = get_user_skills(user_id, conn)
    if not user_skills:
        return 30.0  # Default low score if no skills data

    user_skill_names = {s["name"].lower() for s in user_skills}
    user_skill_slugs = {s["slug"] for s in user_skills}

    # Extract required skills from job title + description
    job_text = f"{job.get('title', '')} {job.get('description', '')}".lower()

    # Simple keyword matching (enhanced by AI in production)
    matched = 0
    total_checked = 0
    for skill in user_skills[:15]:  # Top 15 skills
        name_lower = skill["name"].lower()
        if name_lower in job_text:
            matched += 1
            total_checked += 1
        else:
            total_checked += 1

    if total_checked == 0:
        return 40.0

    return round(min(95, 30 + (matched / max(total_checked, 1)) * 65), 1)


def _compute_culture_fit(profile: dict | None, agent_config: dict | None, job: dict, conn: sqlite3.Connection) -> float:
    """Estimate culture fit from preferences and review data."""
    score = 60.0  # Base neutral score

    # Check company reviews
    company_name = job.get("company", "")
    if company_name:
        review_stats = conn.execute("""
            SELECT AVG(work_life_balance) as wlb, AVG(engineering_culture) as eng
            FROM company_reviews
            WHERE company_name = ? AND status = 'active'
        """, (company_name,)).fetchone()
        if review_stats and review_stats["wlb"]:
            score = round((review_stats["wlb"] + review_stats["eng"]) / 2 * 20, 1)

    # Adjust for remote preference
    if agent_config:
        remote_pref = agent_config.get("remote_preference", "any") if isinstance(agent_config, dict) else "any"
        job_type = job.get("job_type", "").lower()
        if remote_pref == "remote_only" and "remote" in job_type:
            score = min(95, score + 10)
        elif remote_pref == "remote_only" and "remote" not in job_type:
            score = max(10, score - 20)

    return round(min(95, max(10, score)), 1)


def _compute_comp_alignment(user_id: int, job: dict, agent_config: dict | None, conn: sqlite3.Connection) -> float:
    """Score compensation alignment."""
    job_min = job.get("salary_min") or 0
    job_max = job.get("salary_max") or 0

    if not job_min and not job_max:
        return 50.0  # Unknown salary = neutral

    target_min = None
    if agent_config:
        target_min = agent_config.get("min_salary") if isinstance(agent_config, dict) else None

    if not target_min:
        return 65.0  # No preference set = slightly positive

    job_mid = (job_min + job_max) / 2 if job_max else job_min
    if job_mid >= target_min * 1.1:
        return 95.0
    elif job_mid >= target_min:
        return 85.0
    elif job_mid >= target_min * 0.9:
        return 65.0
    elif job_mid >= target_min * 0.8:
        return 40.0
    else:
        return 20.0


def _compute_growth_fit(profile: dict | None, github: dict | None, job: dict) -> float:
    """Score growth potential based on role level vs. current trajectory."""
    score = 60.0

    if github:
        build_score = github.get("build_score") if isinstance(github, dict) else None
        if build_score and build_score > 70:
            score += 10  # Strong builder = good growth potential

    title = (job.get("title") or "").lower()
    if any(w in title for w in ["senior", "staff", "lead", "principal", "director"]):
        score += 5  # Senior roles = growth opportunity

    return round(min(95, max(20, score)), 1)


def _compute_company_health(job: dict, conn: sqlite3.Connection) -> float:
    """Score company health from funding, reviews, activity."""
    score = 60.0
    company_name = job.get("company", "")

    # Check review sentiment
    if company_name:
        stats = conn.execute("""
            SELECT AVG(overall_rating) as avg_rating, COUNT(*) as cnt
            FROM company_reviews
            WHERE company_name = ? AND status = 'active'
        """, (company_name,)).fetchone()
        if stats and stats["avg_rating"]:
            score = round(stats["avg_rating"] * 20, 1)

    return round(min(95, max(20, score)), 1)


def _compute_team_quality(job: dict, conn: sqlite3.Connection) -> float:
    """Score team quality from Build Scores of employees."""
    company_name = job.get("company", "")
    if not company_name:
        return 60.0

    # Check if any users work at this company (via reviews)
    team_scores = conn.execute("""
        SELECT gp.build_score
        FROM company_reviews cr
        JOIN github_profiles gp ON cr.author_id = gp.user_id
        WHERE cr.company_name = ? AND cr.is_current_employee = 1
          AND gp.build_score IS NOT NULL
    """, (company_name,)).fetchall()

    if not team_scores:
        return 60.0

    avg_score = sum(r["build_score"] for r in team_scores) / len(team_scores)
    return round(min(95, max(20, avg_score)), 1)


def _compute_role_clarity(job: dict) -> float:
    """Score how well-defined the job listing is."""
    score = 40.0
    desc = job.get("description") or ""

    if len(desc) > 200:
        score += 15
    if len(desc) > 500:
        score += 10

    if job.get("salary_min") or job.get("salary_max"):
        score += 15  # Salary transparency

    title = job.get("title") or ""
    if len(title) > 5:
        score += 5

    if job.get("job_type"):
        score += 5

    return round(min(95, score), 1)


def _compute_interview_quality(job: dict, conn: sqlite3.Connection) -> float:
    """Score interview quality from review data."""
    company_name = job.get("company", "")
    if not company_name:
        return 60.0

    stats = conn.execute("""
        SELECT AVG(interview_quality) as avg
        FROM company_reviews
        WHERE company_name = ? AND status = 'active' AND interview_quality IS NOT NULL
    """, (company_name,)).fetchone()

    if stats and stats["avg"]:
        return round(stats["avg"] * 20, 1)
    return 60.0


def _generate_explanation(
    job: dict,
    tech: float, culture: float, comp: float, growth: float,
    health: float, team: float, clarity: float, interview: float,
) -> str:
    """Generate human-readable match explanation."""
    parts = []
    title = job.get("title", "this role")
    company = job.get("company", "this company")

    if tech >= 80:
        parts.append(f"Strong technical alignment with {title}")
    elif tech >= 60:
        parts.append(f"Good technical fit for {title}")
    else:
        parts.append(f"Some skill gaps for {title} — growth opportunity")

    if comp >= 80:
        parts.append("Compensation exceeds your target range")
    elif comp >= 60:
        parts.append("Compensation aligns with your expectations")
    elif comp < 40:
        parts.append("Compensation may be below your target")

    if health >= 75:
        parts.append(f"{company} shows strong company health signals")
    if team >= 75:
        parts.append("High-quality engineering team based on Build Scores")
    if clarity >= 75:
        parts.append("Well-defined role with clear expectations")

    return ". ".join(parts) + "." if parts else f"Match computed for {title} at {company}."
