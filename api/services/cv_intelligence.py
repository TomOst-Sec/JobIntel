"""CV Intelligence Core — parsing, enrichment, tailoring, cover letters, match scoring.

Implements the CVDNAObject model:
- Parse uploaded CV (PDF/DOCX/TXT) into structured data
- Enrich with market intelligence
- 8-layer per-application tailoring engine
- Cover letter generation
- ATS match scoring
"""
import json
import re
import sqlite3
import uuid
from datetime import datetime

from api.services.ai_provider import ai_complete, ai_complete_json


# ═══════════════════════════════════════════════════
# CV PARSING
# ═══════════════════════════════════════════════════

def parse_cv(
    user_id: int,
    raw_text: str,
    file_path: str | None,
    file_type: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Parse raw CV text into structured CVDNAObject using AI."""

    system_prompt = """You are an expert CV parser. Extract ALL information from this CV into a structured JSON format.

Return JSON with these exact fields:
{
    "contact": {"name": "", "email": "", "phone": "", "location": "", "linkedin": "", "github": "", "portfolio": ""},
    "headline": "one-line professional headline",
    "summary": "2-3 sentence professional summary",
    "skills": ["skill1", "skill2", ...],
    "skills_depth": {"skill_name": 1-5},
    "experience": [
        {
            "company": "", "title": "", "location": "",
            "start_date": "YYYY-MM", "end_date": "YYYY-MM or present",
            "duration_months": 12,
            "highlights": ["bullet1", "bullet2"],
            "skills_used": ["skill1", "skill2"]
        }
    ],
    "education": [
        {"institution": "", "degree": "", "field": "", "graduation_year": 2020, "gpa": null}
    ],
    "projects": [
        {"name": "", "description": "", "technologies": ["tech1"], "url": ""}
    ],
    "certifications": [
        {"name": "", "issuer": "", "year": 2023}
    ],
    "languages": [{"language": "", "proficiency": "native|fluent|intermediate|basic"}],
    "total_experience_years": 5
}

Be thorough — extract every detail. If something is unclear, make your best inference.
Normalize skill names (e.g., "JS" → "JavaScript", "k8s" → "Kubernetes").
"""

    structured = ai_complete_json(system_prompt, raw_text, user_id=user_id, conn=conn)

    # Compute skills lists
    skills = structured.get("skills", [])
    skills_depth = structured.get("skills_depth", {})
    experience = structured.get("experience", [])

    # Compute skills recency from experience
    skills_recency = {}
    for exp in experience:
        end = exp.get("end_date", "present")
        year = datetime.now().year if end == "present" else int(end.split("-")[0]) if "-" in str(end) else datetime.now().year
        for sk in exp.get("skills_used", []):
            skills_recency[sk] = max(skills_recency.get(sk, 0), year)

    # Calculate total experience
    total_years = structured.get("total_experience_years", 0)
    if not total_years and experience:
        total_months = sum(e.get("duration_months", 12) for e in experience)
        total_years = round(total_months / 12, 1)

    # Store as CV DNA
    # Mark any previous version as not current
    conn.execute(
        "UPDATE cv_dna SET is_current = 0 WHERE user_id = ?",
        (user_id,),
    )

    conn.execute(
        """INSERT INTO cv_dna
           (user_id, raw_text, structured_data, skills_canonical, skills_depth,
            skills_recency, experience_data, education_data, projects_data,
            certifications_data, headline, summary, file_path, file_type, is_current)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)""",
        (
            user_id,
            raw_text,
            json.dumps(structured),
            json.dumps(skills),
            json.dumps(skills_depth),
            json.dumps(skills_recency),
            json.dumps(experience),
            json.dumps(structured.get("education", [])),
            json.dumps(structured.get("projects", [])),
            json.dumps(structured.get("certifications", [])),
            structured.get("headline", ""),
            structured.get("summary", ""),
            file_path,
            file_type,
        ),
    )
    conn.commit()

    cv_dna_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return {
        "cv_dna_id": cv_dna_id,
        "user_id": user_id,
        "headline": structured.get("headline", ""),
        "summary": structured.get("summary", ""),
        "skills": skills,
        "total_experience_years": total_years,
        "experience_count": len(experience),
        "education_count": len(structured.get("education", [])),
        "projects_count": len(structured.get("projects", [])),
        "certifications_count": len(structured.get("certifications", [])),
    }


def get_cv_dna(user_id: int, conn: sqlite3.Connection) -> dict | None:
    """Get user's current CV DNA."""
    row = conn.execute(
        "SELECT * FROM cv_dna WHERE user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    # Parse JSON fields
    for field in ["structured_data", "skills_canonical", "skills_depth", "skills_recency",
                  "experience_data", "education_data", "projects_data", "certifications_data",
                  "enrichment_data", "hidden_strengths", "gap_matrix"]:
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


# ═══════════════════════════════════════════════════
# CV ENRICHMENT
# ═══════════════════════════════════════════════════

def enrich_cv(user_id: int, conn: sqlite3.Connection) -> dict:
    """Enrich CV DNA with market intelligence."""
    cv = get_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")

    system_prompt = """You are a career intelligence analyst. Analyze this CV and provide market enrichment.

Return JSON:
{
    "market_position_score": 0-100,
    "hidden_strengths": ["strength1 — why it's undersold", "strength2 — why"],
    "gap_matrix": {
        "target_role_1": {"missing_skills": ["skill"], "severity": "low|medium|high"},
        "target_role_2": {"missing_skills": ["skill"], "severity": "low|medium|high"}
    },
    "salary_estimate": {"p25": 80000, "p50": 100000, "p75": 125000, "currency": "USD"},
    "market_demand": "high|medium|low",
    "differentiators": ["what makes this candidate unique"],
    "improvement_priorities": [
        {"action": "what to do", "impact": "high|medium|low", "effort": "high|medium|low"}
    ]
}

Consider current market trends, skill demand, and competition for similar profiles.
"""

    user_prompt = f"""CV Headline: {headline}
Skills: {json.dumps(skills)}
Experience: {json.dumps(experience[:5])}  # Top 5 roles
"""

    enrichment = ai_complete_json(system_prompt, user_prompt, user_id=user_id, conn=conn)

    # Update CV DNA with enrichment
    conn.execute(
        """UPDATE cv_dna SET
           enrichment_data = ?,
           market_position_score = ?,
           hidden_strengths = ?,
           gap_matrix = ?,
           updated_at = datetime('now')
           WHERE user_id = ? AND is_current = 1""",
        (
            json.dumps(enrichment),
            enrichment.get("market_position_score", 0),
            json.dumps(enrichment.get("hidden_strengths", [])),
            json.dumps(enrichment.get("gap_matrix", {})),
            user_id,
        ),
    )
    conn.commit()

    return {
        "user_id": user_id,
        "market_position_score": enrichment.get("market_position_score", 0),
        "hidden_strengths": enrichment.get("hidden_strengths", []),
        "salary_estimate": enrichment.get("salary_estimate", {}),
        "market_demand": enrichment.get("market_demand", "medium"),
        "differentiators": enrichment.get("differentiators", []),
        "improvement_priorities": enrichment.get("improvement_priorities", []),
        "gap_matrix": enrichment.get("gap_matrix", {}),
    }


# ═══════════════════════════════════════════════════
# 8-LAYER TAILORING ENGINE
# ═══════════════════════════════════════════════════

def tailor_cv(
    user_id: int,
    job_id: str,
    tailoring_level: str,
    conn: sqlite3.Connection,
) -> dict:
    """8-layer CV tailoring engine for a specific job.

    Layers:
    1. Keyword injection (ATS optimization)
    2. Skill reordering (match priority)
    3. Experience reordering (relevant first)
    4. Bullet rewriting (quantify + align)
    5. Summary rewrite (role-specific)
    6. Headline optimization
    7. Gap mitigation (address missing skills)
    8. Tone alignment (startup vs enterprise)
    """
    import time
    start = time.time()

    cv = get_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    # Get job data
    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        raise ValueError(f"Job {job_id} not found")
    job = dict(job)

    cv_dna_id = cv["id"]
    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")
    summary = cv.get("summary", "")

    job_title = job.get("title", "")
    job_company = job.get("company", "")
    job_description = job.get("description", "")[:3000]
    required_skills_raw = job.get("required_skills", "")
    required_skills = [s.strip() for s in required_skills_raw.split(",") if s.strip()] if required_skills_raw else []

    # Determine tailoring depth
    depth_map = {"quick": 3, "standard": 5, "full": 7, "max": 8}
    layers_to_apply = depth_map.get(tailoring_level, 5)

    system_prompt = f"""You are an expert CV tailoring engine. Apply up to {layers_to_apply} optimization layers to this CV for the target job.

LAYERS TO APPLY:
1. KEYWORD INJECTION: Add ATS keywords from job description naturally into CV
2. SKILL REORDERING: Put most relevant skills first, highlight matches
3. EXPERIENCE REORDERING: Lead with most relevant roles
4. BULLET REWRITING: Quantify achievements, align language with job description
5. SUMMARY REWRITE: Craft role-specific professional summary
6. HEADLINE OPTIMIZATION: Write a headline targeting this specific role
7. GAP MITIGATION: Frame missing skills as transferable/in-progress
8. TONE ALIGNMENT: Match company culture (startup casual vs enterprise formal)

Return JSON:
{{
    "headline_tailored": "optimized headline",
    "summary_tailored": "tailored 2-3 sentence summary",
    "skills_reordered": ["skill1", "skill2", ...],
    "experience_reordered": [
        {{
            "company": "", "title": "", "start_date": "", "end_date": "",
            "highlights": ["quantified, aligned bullet1", "bullet2"],
            "skills_used": ["skill1"]
        }}
    ],
    "keywords_added": ["keyword1", "keyword2"],
    "changes_made": ["description of change 1", "description of change 2"],
    "ats_score": 0-100,
    "match_score": 0-100,
    "tone": "startup|corporate|technical|formal"
}}
"""

    user_prompt = f"""TARGET JOB:
Title: {job_title}
Company: {job_company}
Required Skills: {', '.join(required_skills)}
Description: {job_description[:2000]}

CURRENT CV:
Headline: {headline}
Summary: {summary}
Skills: {json.dumps(skills)}
Experience: {json.dumps(experience[:5])}
"""

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn, prefer_smart=tailoring_level in ("full", "max"),
    )

    gen_time = int((time.time() - start) * 1000)

    # Compute before/after match scores
    match_before = _compute_match_score(skills, required_skills)
    match_after = result.get("match_score", match_before + 15)

    # Store tailored version
    conn.execute(
        """INSERT INTO cv_tailored
           (cv_dna_id, user_id, job_id, tailoring_level, content_data,
            headline_tailored, summary_tailored, skills_reordered,
            experience_reordered, changes_made, keywords_added,
            match_score_before, match_score_after, ats_score, generation_time_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            cv_dna_id, user_id, job_id, tailoring_level,
            json.dumps(result),
            result.get("headline_tailored", ""),
            result.get("summary_tailored", ""),
            json.dumps(result.get("skills_reordered", [])),
            json.dumps(result.get("experience_reordered", [])),
            json.dumps(result.get("changes_made", [])),
            json.dumps(result.get("keywords_added", [])),
            match_before, match_after,
            result.get("ats_score", 0),
            gen_time,
        ),
    )
    conn.commit()

    tailored_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return {
        "tailored_id": tailored_id,
        "job_id": job_id,
        "job_title": job_title,
        "company": job_company,
        "tailoring_level": tailoring_level,
        "headline_tailored": result.get("headline_tailored", ""),
        "summary_tailored": result.get("summary_tailored", ""),
        "skills_reordered": result.get("skills_reordered", []),
        "keywords_added": result.get("keywords_added", []),
        "changes_made": result.get("changes_made", []),
        "match_score_before": match_before,
        "match_score_after": match_after,
        "ats_score": result.get("ats_score", 0),
        "generation_time_ms": gen_time,
    }


def get_tailored_cv(tailored_id: int, user_id: int, conn: sqlite3.Connection) -> dict | None:
    """Get a specific tailored CV version."""
    row = conn.execute(
        "SELECT * FROM cv_tailored WHERE id = ? AND user_id = ?",
        (tailored_id, user_id),
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    for field in ["content_data", "skills_reordered", "experience_reordered", "changes_made", "keywords_added"]:
        if d.get(field):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def get_user_tailored_cvs(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Get all tailored CV versions for a user."""
    rows = conn.execute(
        """SELECT ct.id, ct.job_id, ct.tailoring_level, ct.headline_tailored,
                  ct.match_score_before, ct.match_score_after, ct.ats_score,
                  ct.generation_time_ms, ct.created_at,
                  j.title as job_title, j.company as job_company
           FROM cv_tailored ct
           LEFT JOIN jobs j ON ct.job_id = j.job_id
           WHERE ct.user_id = ?
           ORDER BY ct.created_at DESC LIMIT 50""",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════
# COVER LETTER GENERATION
# ═══════════════════════════════════════════════════

def generate_cover_letter(
    user_id: int,
    job_id: str,
    tone: str,
    conn: sqlite3.Connection,
    tailored_id: int | None = None,
) -> dict:
    """Generate a personalized cover letter for a specific job."""
    cv = get_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        raise ValueError(f"Job {job_id} not found")
    job = dict(job)

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    headline = cv.get("headline", "")

    tone_guidance = {
        "professional": "Formal, polished, corporate tone. Use industry terminology.",
        "casual": "Conversational, authentic tone. Show personality while remaining professional.",
        "technical": "Technical deep-dive tone. Lead with engineering achievements and technical impact.",
        "startup": "Energetic, mission-driven tone. Show passion for building and innovation.",
    }

    system_prompt = f"""You are an expert cover letter writer. Write a compelling, personalized cover letter.

TONE: {tone_guidance.get(tone, tone_guidance['professional'])}

RULES:
- NEVER start with "I am writing to express my interest in..."
- Open with a hook: a specific achievement, insight, or connection to the company
- Show you understand the company's challenges and how you solve them
- Reference 2-3 specific experiences that map to the role
- Include at least 1 quantified achievement
- Close with enthusiasm and a clear CTA
- Keep it to 250-350 words
- Make it feel human — not templated

Return JSON:
{{
    "content": "the full cover letter text",
    "personalization_hooks": ["what was personalized and why"],
    "word_count": 300
}}
"""

    user_prompt = f"""CANDIDATE:
Headline: {headline}
Key Skills: {', '.join(skills[:10])}
Recent Experience: {json.dumps(experience[:3])}

TARGET JOB:
Title: {job.get('title', '')}
Company: {job.get('company', '')}
Location: {job.get('location', '')}
Description: {job.get('description', '')[:2000]}
"""

    result = ai_complete_json(
        system_prompt, user_prompt,
        user_id=user_id, conn=conn, prefer_smart=True,
    )

    content = result.get("content", "")
    word_count = len(content.split())

    # Store cover letter
    conn.execute(
        """INSERT INTO cover_letters
           (user_id, job_id, cv_tailored_id, content, tone, personalization_hooks, word_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id, job_id, tailored_id, content, tone,
            json.dumps(result.get("personalization_hooks", [])),
            word_count,
        ),
    )
    conn.commit()

    cover_letter_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return {
        "cover_letter_id": cover_letter_id,
        "job_id": job_id,
        "job_title": job.get("title", ""),
        "company": job.get("company", ""),
        "content": content,
        "tone": tone,
        "personalization_hooks": result.get("personalization_hooks", []),
        "word_count": word_count,
    }


def get_user_cover_letters(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Get all cover letters for a user."""
    rows = conn.execute(
        """SELECT cl.*, j.title as job_title, j.company as job_company
           FROM cover_letters cl
           LEFT JOIN jobs j ON cl.job_id = j.job_id
           WHERE cl.user_id = ?
           ORDER BY cl.created_at DESC LIMIT 50""",
        (user_id,),
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("personalization_hooks"):
            try:
                d["personalization_hooks"] = json.loads(d["personalization_hooks"])
            except (json.JSONDecodeError, TypeError):
                pass
        results.append(d)
    return results


# ═══════════════════════════════════════════════════
# MATCH SCORING
# ═══════════════════════════════════════════════════

def score_job_match(user_id: int, job_id: str, conn: sqlite3.Connection) -> dict:
    """Score how well a user's CV matches a specific job."""
    cv = get_cv_dna(user_id, conn)
    if not cv:
        raise ValueError("No CV found. Upload a CV first.")

    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        raise ValueError(f"Job {job_id} not found")
    job = dict(job)

    skills = cv.get("skills_canonical", [])
    experience = cv.get("experience_data", [])
    required_skills_raw = job.get("required_skills", "")
    required_skills = [s.strip() for s in required_skills_raw.split(",") if s.strip()] if required_skills_raw else []

    # Compute individual scores
    skill_score = _compute_match_score(skills, required_skills)

    # Experience match
    total_years = len(experience) * 2  # rough estimate
    exp_match = min(100, total_years * 10)

    # Location match
    cv_location = ""
    if experience:
        cv_location = experience[0].get("location", "")
    job_location = job.get("location", "")
    location_score = 80 if "remote" in job_location.lower() else (100 if cv_location.lower() in job_location.lower() else 50)

    overall = round(skill_score * 0.45 + exp_match * 0.30 + location_score * 0.25)

    return {
        "job_id": job_id,
        "job_title": job.get("title", ""),
        "company": job.get("company", ""),
        "overall_score": overall,
        "skill_match": round(skill_score),
        "experience_match": round(exp_match),
        "location_match": round(location_score),
        "matched_skills": [s for s in skills if s.lower() in [r.lower() for r in required_skills]],
        "missing_skills": [s for s in required_skills if s.lower() not in [sk.lower() for sk in skills]],
        "recommendation": "strong_match" if overall >= 75 else "good_match" if overall >= 55 else "stretch" if overall >= 35 else "mismatch",
    }


def _compute_match_score(cv_skills: list, job_skills: list) -> float:
    """Compute Jaccard-like skill match score."""
    if not job_skills:
        return 50.0
    cv_lower = {s.lower() for s in cv_skills}
    job_lower = {s.lower() for s in job_skills}
    intersection = cv_lower & job_lower
    if not job_lower:
        return 50.0
    return min(100, (len(intersection) / len(job_lower)) * 100)


# ═══════════════════════════════════════════════════
# APPLICATION TRACKER
# ═══════════════════════════════════════════════════

def track_application(
    user_id: int,
    job_id: str | None,
    company: str,
    title: str,
    location: str | None,
    applied_via: str,
    cv_tailored_id: int | None,
    cover_letter_id: int | None,
    match_score: float | None,
    ghost_score: float | None,
    conn: sqlite3.Connection,
) -> dict:
    """Track a new job application."""
    # Get salary info from job if available
    salary_min = salary_max = None
    if job_id:
        job = conn.execute("SELECT salary_min, salary_max FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if job:
            salary_min = job["salary_min"]
            salary_max = job["salary_max"]

    conn.execute(
        """INSERT INTO application_tracker
           (user_id, job_id, company, title, location, status, applied_via,
            cv_tailored_id, cover_letter_id, match_score, ghost_score,
            salary_min, salary_max)
           VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, job_id, company, title, location, applied_via,
         cv_tailored_id, cover_letter_id, match_score, ghost_score,
         salary_min, salary_max),
    )
    conn.commit()
    app_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    return {
        "application_id": app_id,
        "job_id": job_id,
        "company": company,
        "title": title,
        "status": "applied",
        "applied_via": applied_via,
        "match_score": match_score,
    }


def update_application_status(
    app_id: int,
    user_id: int,
    status: str,
    notes: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Update application status with optional notes."""
    valid_statuses = [
        "queued", "applied", "viewed", "phone_screen", "technical",
        "onsite", "final_round", "offer", "accepted", "rejected",
        "withdrawn", "ghosted",
    ]
    if status not in valid_statuses:
        raise ValueError(f"Invalid status: {status}")

    updates = ["status = ?", "updated_at = datetime('now')"]
    params = [status]

    if notes:
        updates.append("notes = ?")
        params.append(notes)

    if status == "rejected":
        updates.append("response_at = datetime('now')")
    elif status == "offer":
        updates.append("response_at = datetime('now')")

    params.extend([app_id, user_id])

    conn.execute(
        f"UPDATE application_tracker SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
        params,
    )
    conn.commit()

    row = conn.execute("SELECT * FROM application_tracker WHERE id = ?", (app_id,)).fetchone()
    return dict(row) if row else {"application_id": app_id, "status": status}


def get_applications(
    user_id: int,
    status_filter: str | None,
    conn: sqlite3.Connection,
) -> list[dict]:
    """Get user's applications with optional status filter."""
    query = "SELECT * FROM application_tracker WHERE user_id = ?"
    params: list = [user_id]

    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)

    query += " ORDER BY applied_at DESC LIMIT 100"
    rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def get_application_stats(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get application statistics."""
    rows = conn.execute(
        "SELECT status, COUNT(*) as count FROM application_tracker WHERE user_id = ? GROUP BY status",
        (user_id,),
    ).fetchall()

    stats = {r["status"]: r["count"] for r in rows}
    total = sum(stats.values())
    responses = sum(stats.get(s, 0) for s in ["phone_screen", "technical", "onsite", "final_round", "offer", "accepted"])
    rejections = stats.get("rejected", 0)

    return {
        "total_applications": total,
        "status_breakdown": stats,
        "response_rate": round(responses / max(total, 1) * 100, 1),
        "rejection_rate": round(rejections / max(total, 1) * 100, 1),
        "active_applications": sum(stats.get(s, 0) for s in ["applied", "viewed", "phone_screen", "technical", "onsite", "final_round"]),
        "offers": stats.get("offer", 0),
        "accepted": stats.get("accepted", 0),
    }
