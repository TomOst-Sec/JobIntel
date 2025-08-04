"""Interview Oracle — interview preparation, question prediction, practice mode, community reports.

AI-powered interview prep engine that:
- Generates comprehensive prep packages (question banks, prep plans, behavioral stories)
- Provides practice mode with real-time AI feedback and scoring
- Aggregates community interview reports for company-level intelligence
- Maps CV experience to behavioral STAR stories
"""
import json
import sqlite3
from datetime import datetime, timedelta

from api.services.ai_provider import ai_complete_json, ai_complete


# ===================================================
# INTERVIEW PREPARATION
# ===================================================

def prepare_for_interview(
    user_id: int,
    company: str,
    role: str,
    interview_date: str | None,
    job_id: str | None,
    conn: sqlite3.Connection,
) -> dict:
    """Generate a comprehensive interview prep package using AI + CV DNA + community reports.

    Produces: interview profile, predicted question bank, day-by-day prep plan,
    behavioral STAR stories mapped from CV, and system design focus areas.
    """
    # --- Load user's CV DNA ---
    cv_row = conn.execute(
        "SELECT * FROM cv_dna WHERE user_id = ? AND is_current = 1 ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()

    cv_context = ""
    if cv_row:
        cv = dict(cv_row)
        skills = cv.get("skills_canonical") or "[]"
        experience = cv.get("experience_data") or "[]"
        education = cv.get("education_data") or "[]"
        projects = cv.get("projects_data") or "[]"
        cv_context = f"""
CANDIDATE CV DATA:
Skills: {skills}
Experience: {experience}
Education: {education}
Projects: {projects}
Summary: {cv.get('summary', 'N/A')}
"""

    # --- Load community interview reports for this company ---
    reports_rows = conn.execute(
        """SELECT role, rounds, difficulty, got_offer, questions, experience_notes, tips, interview_date
           FROM community_interview_reports
           WHERE LOWER(company) = LOWER(?)
           ORDER BY created_at DESC LIMIT 20""",
        (company,),
    ).fetchall()

    community_context = ""
    if reports_rows:
        reports_list = []
        for r in reports_rows:
            rd = dict(r)
            rd["questions"] = json.loads(rd["questions"]) if rd.get("questions") else []
            reports_list.append(rd)
        community_context = f"""
COMMUNITY INTERVIEW REPORTS ({len(reports_list)} reports for {company}):
{json.dumps(reports_list, indent=2, default=str)}
"""

    # --- Calculate days until interview ---
    days_until = None
    if interview_date:
        try:
            interview_dt = datetime.strptime(interview_date, "%Y-%m-%d")
            days_until = max(1, (interview_dt - datetime.utcnow()).days)
        except ValueError:
            days_until = 7  # default fallback

    days_context = f"\nDays until interview: {days_until}" if days_until else "\nNo interview date set — create a general 7-day prep plan."

    # --- AI generation ---
    system_prompt = """You are an interview preparation expert with deep knowledge of hiring practices at top companies. Create a complete interview prep package.

Return valid JSON with this exact structure:
{
    "interview_profile": {
        "rounds_expected": 3,
        "difficulty_1_10": 7,
        "interview_style": "structured behavioral + technical",
        "common_format": "phone screen -> technical -> onsite (3 rounds)"
    },
    "question_bank": [
        {
            "question": "Tell me about a time you led a project under tight deadlines",
            "category": "behavioral",
            "difficulty": "medium",
            "tips": "Use STAR format. Focus on measurable outcomes and leadership actions."
        }
    ],
    "prep_plan": [
        {
            "day": 1,
            "focus": "Company Research & Culture",
            "tasks": ["Research company mission and values", "Review recent news and press releases", "Study the job description in detail"]
        }
    ],
    "behavioral_stories": [
        {
            "question_theme": "Leadership under pressure",
            "story_from_cv": "Led migration of payment system at Company X serving 2M users",
            "star_format": {
                "situation": "Legacy payment system was causing 3% transaction failures",
                "task": "Lead migration to new payment provider within Q4 deadline",
                "action": "Designed phased rollout plan, coordinated 5-person team, set up feature flags",
                "result": "Reduced failures to 0.1%, saved $2M annually, completed 2 weeks early"
            }
        }
    ],
    "system_design_focus": ["Distributed caching strategies", "Database sharding", "API rate limiting"]
}

Guidelines:
- Generate 15-25 questions across categories: behavioral, technical, system_design, culture
- Tailor questions to the specific company and role
- Create a day-by-day prep plan based on available days
- Map behavioral stories directly from the candidate's CV experience using STAR format
- Include system_design_focus only for technical roles (empty array for non-technical)
- If community reports exist, weight questions toward patterns seen in real interviews
- Difficulty should reflect the company's actual interview difficulty"""

    user_prompt = f"""Create an interview prep package for:
Company: {company}
Role: {role}
{days_context}
{cv_context}
{community_context}"""

    prep_data = ai_complete_json(
        system_prompt, user_prompt, user_id=user_id, conn=conn, prefer_smart=True
    )

    # --- Store in database ---
    cursor = conn.execute(
        """INSERT INTO interview_prep
           (user_id, job_id, company, role, interview_date,
            interview_profile, question_bank, prep_plan,
            behavioral_stories, system_design_focus)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            job_id,
            company,
            role,
            interview_date,
            json.dumps(prep_data.get("interview_profile", {})),
            json.dumps(prep_data.get("question_bank", [])),
            json.dumps(prep_data.get("prep_plan", [])),
            json.dumps(prep_data.get("behavioral_stories", [])),
            json.dumps(prep_data.get("system_design_focus", [])),
        ),
    )
    conn.commit()

    prep_id = cursor.lastrowid

    return {
        "prep_id": prep_id,
        "company": company,
        "role": role,
        "interview_date": interview_date,
        "days_until_interview": days_until,
        "interview_profile": prep_data.get("interview_profile", {}),
        "question_bank": prep_data.get("question_bank", []),
        "prep_plan": prep_data.get("prep_plan", []),
        "behavioral_stories": prep_data.get("behavioral_stories", []),
        "system_design_focus": prep_data.get("system_design_focus", []),
        "community_reports_used": len(reports_rows),
    }


# ===================================================
# PRACTICE MODE
# ===================================================

def practice_question(
    user_id: int,
    prep_id: int,
    question: str,
    user_answer: str,
    conn: sqlite3.Connection,
) -> dict:
    """Evaluate a practice interview answer with AI scoring and detailed feedback.

    Returns scores across multiple dimensions, strengths, improvements,
    a model answer, and an overall hiring verdict.
    """
    # --- Load prep context ---
    prep_row = conn.execute(
        "SELECT * FROM interview_prep WHERE id = ? AND user_id = ?",
        (prep_id, user_id),
    ).fetchone()
    if not prep_row:
        raise ValueError("Interview prep not found")

    prep = dict(prep_row)
    company = prep["company"]
    role = prep["role"]

    # Build context from prep data
    interview_profile = json.loads(prep["interview_profile"]) if prep.get("interview_profile") else {}

    system_prompt = """You are a senior interviewer at a top company. Evaluate this interview answer with rigorous, constructive feedback.

Return valid JSON with this exact structure:
{
    "scores": {
        "relevance": 7,
        "depth": 6,
        "communication": 8,
        "star_format": 5
    },
    "overall_score": 65,
    "strengths": [
        "Clear articulation of the problem",
        "Good use of specific metrics"
    ],
    "improvements": [
        "Needs stronger emphasis on personal contribution vs team effort",
        "Missing quantifiable results in the outcome"
    ],
    "model_answer": "Here is how a strong candidate would answer this question...",
    "verdict": "on_fence"
}

Scoring guide:
- relevance (1-10): How well does the answer address the actual question asked?
- depth (1-10): Does the answer show deep understanding and specific examples?
- communication (1-10): Is the answer clear, concise, and well-structured?
- star_format (1-10): Does it follow Situation-Task-Action-Result format? (for behavioral)
- overall_score (0-100): Holistic assessment of interview performance
- verdict: "would_advance" (75+), "on_fence" (50-74), "would_not_advance" (<50)

Be specific in feedback — reference exact parts of their answer.
The model_answer should be a complete, polished example answer to the same question."""

    user_prompt = f"""INTERVIEW CONTEXT:
Company: {company}
Role: {role}
Interview Style: {interview_profile.get('interview_style', 'standard')}
Difficulty: {interview_profile.get('difficulty_1_10', 'unknown')}/10

QUESTION:
{question}

CANDIDATE'S ANSWER:
{user_answer}

Evaluate this answer thoroughly."""

    feedback = ai_complete_json(
        system_prompt, user_prompt, user_id=user_id, conn=conn, prefer_smart=True
    )

    overall_score = feedback.get("overall_score", 0)
    verdict = feedback.get("verdict", "on_fence")

    # --- Store practice session ---
    conn.execute(
        """INSERT INTO interview_practice
           (prep_id, user_id, question, user_answer, feedback, overall_score, verdict)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            prep_id,
            user_id,
            question,
            user_answer,
            json.dumps(feedback),
            overall_score,
            verdict,
        ),
    )

    # --- Update practice_sessions count ---
    conn.execute(
        """UPDATE interview_prep
           SET practice_sessions = practice_sessions + 1,
               updated_at = datetime('now')
           WHERE id = ?""",
        (prep_id,),
    )
    conn.commit()

    return {
        "prep_id": prep_id,
        "question": question,
        "scores": feedback.get("scores", {}),
        "overall_score": overall_score,
        "strengths": feedback.get("strengths", []),
        "improvements": feedback.get("improvements", []),
        "model_answer": feedback.get("model_answer", ""),
        "verdict": verdict,
    }


# ===================================================
# PREP RETRIEVAL
# ===================================================

def get_prep(user_id: int, prep_id: int, conn: sqlite3.Connection) -> dict:
    """Fetch a full interview prep package with parsed JSON fields and practice stats."""
    row = conn.execute(
        "SELECT * FROM interview_prep WHERE id = ? AND user_id = ?",
        (prep_id, user_id),
    ).fetchone()
    if not row:
        raise ValueError("Interview prep not found")

    data = dict(row)

    # Parse JSON fields
    json_fields = [
        "interview_profile", "question_bank", "prep_plan",
        "behavioral_stories", "system_design_focus",
    ]
    for field in json_fields:
        if data.get(field):
            try:
                data[field] = json.loads(data[field])
            except (json.JSONDecodeError, TypeError):
                data[field] = None

    # Get practice history count and average score
    practice_stats = conn.execute(
        """SELECT COUNT(*) as total_sessions,
                  ROUND(AVG(overall_score), 1) as avg_score
           FROM interview_practice
           WHERE prep_id = ? AND user_id = ?""",
        (prep_id, user_id),
    ).fetchone()

    if practice_stats:
        ps = dict(practice_stats)
        data["practice_total"] = ps["total_sessions"]
        data["practice_avg_score"] = ps["avg_score"]
    else:
        data["practice_total"] = 0
        data["practice_avg_score"] = None

    return data


def get_user_preps(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Fetch all interview preps for a user (basic info only)."""
    rows = conn.execute(
        """SELECT id, company, role, interview_date, practice_sessions, created_at, updated_at
           FROM interview_prep
           WHERE user_id = ?
           ORDER BY created_at DESC""",
        (user_id,),
    ).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        # Calculate days until interview
        if d.get("interview_date"):
            try:
                interview_dt = datetime.strptime(d["interview_date"], "%Y-%m-%d")
                d["days_until"] = max(0, (interview_dt - datetime.utcnow()).days)
            except ValueError:
                d["days_until"] = None
        else:
            d["days_until"] = None
        results.append(d)

    return results


# ===================================================
# COMMUNITY INTERVIEW REPORTS
# ===================================================

def submit_interview_report(
    user_id: int,
    company: str,
    role: str,
    interview_date: str | None,
    rounds: int | None,
    difficulty: float | None,
    got_offer: bool | None,
    questions: list[str] | None,
    experience_notes: str | None,
    tips: str | None,
    is_anonymous: bool,
    conn: sqlite3.Connection,
) -> dict:
    """Submit a community interview report and earn XP."""
    cursor = conn.execute(
        """INSERT INTO community_interview_reports
           (user_id, company, role, interview_date, rounds, difficulty,
            got_offer, questions, experience_notes, tips, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id if not is_anonymous else None,
            company,
            role,
            interview_date,
            rounds,
            difficulty,
            1 if got_offer else 0 if got_offer is not None else None,
            json.dumps(questions) if questions else None,
            experience_notes,
            tips,
            1 if is_anonymous else 0,
        ),
    )
    conn.commit()

    report_id = cursor.lastrowid

    # Award XP for contributing to the community
    from api.services.gamification import award_xp
    xp_result = award_xp(
        user_id, "interview_report_submitted", conn,
        context={"report_id": report_id, "company": company, "role": role},
    )

    return {
        "report_id": report_id,
        "company": company,
        "role": role,
        "interview_date": interview_date,
        "rounds": rounds,
        "difficulty": difficulty,
        "got_offer": got_offer,
        "is_anonymous": is_anonymous,
        "xp_earned": xp_result.get("xp_earned", 0),
    }


def get_company_interview_reports(company: str, conn: sqlite3.Connection) -> dict:
    """Get aggregated interview intelligence for a company from community reports."""
    rows = conn.execute(
        """SELECT * FROM community_interview_reports
           WHERE LOWER(company) = LOWER(?)
           ORDER BY created_at DESC""",
        (company,),
    ).fetchall()

    if not rows:
        return {
            "company": company,
            "total_reports": 0,
            "avg_difficulty": None,
            "offer_rate": None,
            "common_questions": [],
            "reports": [],
        }

    reports = []
    all_questions = []
    difficulties = []
    offers = 0
    offer_known = 0

    for r in rows:
        d = dict(r)

        # Parse questions JSON
        if d.get("questions"):
            try:
                qs = json.loads(d["questions"])
                all_questions.extend(qs)
            except (json.JSONDecodeError, TypeError):
                pass

        if d.get("difficulty") is not None:
            difficulties.append(d["difficulty"])

        if d.get("got_offer") is not None:
            offer_known += 1
            if d["got_offer"]:
                offers += 1

        # Redact user_id for anonymous reports
        if d.get("is_anonymous"):
            d.pop("user_id", None)

        reports.append({
            "id": d["id"],
            "role": d.get("role"),
            "interview_date": d.get("interview_date"),
            "rounds": d.get("rounds"),
            "difficulty": d.get("difficulty"),
            "got_offer": bool(d["got_offer"]) if d.get("got_offer") is not None else None,
            "experience_notes": d.get("experience_notes"),
            "tips": d.get("tips"),
            "questions": json.loads(d["questions"]) if d.get("questions") else [],
            "created_at": d.get("created_at"),
        })

    # Aggregate common questions by frequency
    question_freq = {}
    for q in all_questions:
        normalized = q.strip().lower()
        question_freq[normalized] = question_freq.get(normalized, 0) + 1

    common_questions = sorted(
        [{"question": q, "times_reported": c} for q, c in question_freq.items()],
        key=lambda x: x["times_reported"],
        reverse=True,
    )[:20]

    avg_difficulty = round(sum(difficulties) / len(difficulties), 1) if difficulties else None
    offer_rate = round(offers / offer_known * 100, 1) if offer_known > 0 else None

    return {
        "company": company,
        "total_reports": len(rows),
        "avg_difficulty": avg_difficulty,
        "offer_rate": offer_rate,
        "common_questions": common_questions,
        "reports": reports,
    }


# ===================================================
# PRACTICE HISTORY
# ===================================================

def get_practice_history(
    user_id: int, prep_id: int, conn: sqlite3.Connection
) -> list[dict]:
    """Get all practice sessions for a prep with parsed feedback and scores."""
    rows = conn.execute(
        """SELECT * FROM interview_practice
           WHERE prep_id = ? AND user_id = ?
           ORDER BY created_at DESC""",
        (prep_id, user_id),
    ).fetchall()

    results = []
    for r in rows:
        d = dict(r)

        # Parse feedback JSON
        if d.get("feedback"):
            try:
                feedback = json.loads(d["feedback"])
                d["scores"] = feedback.get("scores", {})
                d["strengths"] = feedback.get("strengths", [])
                d["improvements"] = feedback.get("improvements", [])
                d["model_answer"] = feedback.get("model_answer", "")
            except (json.JSONDecodeError, TypeError):
                d["scores"] = {}
                d["strengths"] = []
                d["improvements"] = []
                d["model_answer"] = ""
        else:
            d["scores"] = {}
            d["strengths"] = []
            d["improvements"] = []
            d["model_answer"] = ""

        # Remove raw feedback JSON from response (already parsed above)
        d.pop("feedback", None)

        results.append(d)

    return results
