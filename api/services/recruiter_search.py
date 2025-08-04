"""Recruiter AI Search Engine — parse briefs, score candidates, explain matches.

Uses the existing 3-phase pipeline pattern from chat_service.py:
  Phase 1: Parse brief (Claude Haiku) → structured requirements
  Phase 2: Score candidates (SQL + Python) → ranked matches
  Phase 3: Generate explanations (Claude Sonnet) → human-readable match reasons
"""
import json
import math
import sqlite3
import uuid
from datetime import datetime

import anthropic

from api.config import get_settings

# ---------------------------------------------------------------------------
# Phase 1 — Parse the recruiter's natural-language brief
# ---------------------------------------------------------------------------

PARSE_BRIEF_PROMPT = """You are a recruiting AI. Parse this hiring brief into structured requirements.
Return ONLY valid JSON with no markdown fences:
{
    "role_title": "string",
    "must_have_skills": ["string"],
    "nice_to_have_skills": ["string"],
    "min_experience": 0,
    "max_experience": null,
    "location_preference": null,
    "remote_ok": true,
    "salary_budget_min": null,
    "salary_budget_max": null,
    "seniority": "junior|mid|senior|lead|director|vp",
    "industry_preference": null,
    "clarifying_questions": []
}

If the brief is too vague to extract meaningful requirements, populate clarifying_questions with 2-3 questions to ask.

HIRING BRIEF:
"""


def _get_client() -> anthropic.Anthropic:
    settings = get_settings()
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _parse_brief_fallback(brief: str) -> dict:
    """Keyword-based brief parsing when no AI API key is configured."""
    import re
    brief_lower = brief.lower()

    # Extract skills from common keywords
    common_skills = [
        "python", "java", "javascript", "typescript", "react", "node", "angular",
        "vue", "go", "rust", "c++", "c#", "ruby", "php", "swift", "kotlin",
        "sql", "postgresql", "mongodb", "redis", "docker", "kubernetes", "aws",
        "gcp", "azure", "terraform", "graphql", "rest", "api", "machine learning",
        "ai", "data science", "devops", "ci/cd", "agile", "scrum",
    ]
    found_skills = [s for s in common_skills if s in brief_lower]

    # Extract experience
    exp_match = re.search(r"(\d+)\+?\s*(?:years?|yrs?)", brief_lower)
    min_exp = int(exp_match.group(1)) if exp_match else 0

    # Extract seniority
    seniority = "mid"
    for level in ["vp", "director", "lead", "senior", "junior", "intern"]:
        if level in brief_lower:
            seniority = level
            break

    # Extract location
    location = None
    for loc in ["remote", "nyc", "new york", "san francisco", "london", "berlin",
                "germany", "uk", "us", "usa", "europe", "asia"]:
        if loc in brief_lower:
            location = loc.title()
            break

    remote_ok = "remote" in brief_lower

    return {
        "role_title": brief[:80],
        "must_have_skills": found_skills[:5],
        "nice_to_have_skills": found_skills[5:],
        "min_experience": min_exp,
        "max_experience": min_exp + 5 if min_exp else None,
        "location_preference": location,
        "remote_ok": remote_ok,
        "salary_budget_min": None,
        "salary_budget_max": None,
        "seniority": seniority,
        "industry_preference": None,
        "clarifying_questions": [],
    }


def parse_brief(brief: str) -> dict:
    """Phase 1: Use Claude Haiku to parse a natural-language hiring brief."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return _parse_brief_fallback(brief)

    client = _get_client()
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        messages=[{"role": "user", "content": PARSE_BRIEF_PROMPT + brief}],
    )
    text = response.content[0].text.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return _parse_brief_fallback(brief)


# ---------------------------------------------------------------------------
# Phase 2 — Score candidates against parsed requirements
# ---------------------------------------------------------------------------

def _jaccard_skill_score(
    candidate_skills: list[str],
    must_have: list[str],
    nice_to_have: list[str],
) -> float:
    """Weighted skill overlap: must_have weighted 2x."""
    if not must_have and not nice_to_have:
        return 50.0  # No skill requirements — neutral score

    c_set = {s.lower().strip() for s in candidate_skills}
    must_set = {s.lower().strip() for s in must_have}
    nice_set = {s.lower().strip() for s in nice_to_have}

    must_match = len(c_set & must_set)
    nice_match = len(c_set & nice_set)

    total_weight = len(must_set) * 2 + len(nice_set)
    if total_weight == 0:
        return 50.0

    matched_weight = must_match * 2 + nice_match
    return min(100.0, (matched_weight / total_weight) * 100)


def _experience_score(years: int | None, min_exp: int, max_exp: int | None) -> float:
    """Gaussian decay from ideal experience range."""
    if years is None:
        return 40.0
    ideal_center = (min_exp + (max_exp or min_exp + 5)) / 2
    distance = abs(years - ideal_center)
    if distance <= 2:
        return 100.0
    elif distance <= 5:
        return 80.0 - (distance - 2) * 10
    elif distance <= 10:
        return 50.0 - (distance - 5) * 8
    return 10.0


def _availability_score(availability: str) -> float:
    return {"active": 100.0, "passive": 60.0, "not_looking": 10.0}.get(availability, 40.0)


def _compensation_score(
    c_min: float | None,
    c_max: float | None,
    budget_min: float | None,
    budget_max: float | None,
) -> float:
    """Score overlap between candidate salary expectations and budget."""
    if not c_min and not c_max:
        return 50.0  # No salary info — neutral
    if not budget_min and not budget_max:
        return 50.0  # No budget — neutral

    c_lo = c_min or 0
    c_hi = c_max or c_lo * 1.3
    b_lo = budget_min or 0
    b_hi = budget_max or b_lo * 1.3

    overlap_lo = max(c_lo, b_lo)
    overlap_hi = min(c_hi, b_hi)

    if overlap_lo <= overlap_hi:
        # Full or partial overlap
        overlap_range = overlap_hi - overlap_lo
        candidate_range = max(c_hi - c_lo, 1)
        return min(100.0, 50.0 + (overlap_range / candidate_range) * 50)

    # No overlap — how far apart?
    gap = overlap_lo - overlap_hi
    total = max(c_hi - c_lo, b_hi - b_lo, 1)
    return max(20.0, 50.0 - (gap / total) * 50)


def _location_score(
    c_location: str | None,
    c_country: str | None,
    c_remote_ok: bool,
    pref_location: str | None,
    pref_remote_ok: bool,
) -> float:
    if not pref_location:
        return 70.0  # No preference

    c_loc = (c_location or "").lower()
    pref_loc = pref_location.lower()

    if pref_loc in c_loc or c_loc in pref_loc:
        return 100.0
    if c_country and c_country.lower() in pref_loc:
        return 70.0
    if pref_remote_ok and c_remote_ok:
        return 80.0
    return 30.0


def _quality_score(
    experience_years: int | None,
    summary: str | None,
    email: str | None,
    skills_count: int,
) -> float:
    score = 0.0
    if experience_years and experience_years > 3:
        score += 20
    if summary:
        score += 20
    if email:
        score += 20
    if skills_count > 5:
        score += 20
    # Known company bonus omitted (would need company list)
    score += 20  # Base quality
    return min(100.0, score)


def score_candidates(
    parsed_brief: dict,
    conn: sqlite3.Connection,
    limit: int = 20,
) -> list[dict]:
    """Phase 2: Score all candidates against the parsed brief using SQL + Python."""
    must_have = parsed_brief.get("must_have_skills", [])
    nice_to_have = parsed_brief.get("nice_to_have_skills", [])
    min_exp = parsed_brief.get("min_experience", 0) or 0
    max_exp = parsed_brief.get("max_experience")
    location_pref = parsed_brief.get("location_preference")
    remote_ok = parsed_brief.get("remote_ok", True)
    budget_min = parsed_brief.get("salary_budget_min")
    budget_max = parsed_brief.get("salary_budget_max")

    # Build SQL query with skill-based filtering
    conditions = []
    params: list = []
    all_skills = must_have + nice_to_have

    if all_skills:
        skill_clauses = []
        for skill in all_skills[:10]:  # Cap at 10 to avoid huge query
            skill_clauses.append("skills LIKE ?")
            params.append(f"%{skill}%")
        conditions.append(f"({' OR '.join(skill_clauses)})")

    where = ""
    if conditions:
        where = " WHERE " + " AND ".join(conditions)

    sql = f"SELECT * FROM candidates{where} LIMIT 500"
    rows = conn.execute(sql, params).fetchall()

    if not rows:
        # Fallback: get any candidates if skill filter too restrictive
        rows = conn.execute("SELECT * FROM candidates LIMIT 200").fetchall()

    scored = []
    for row in rows:
        c = dict(row)
        try:
            c_skills = json.loads(c.get("skills") or "[]")
        except (json.JSONDecodeError, TypeError):
            c_skills = []

        skills_sc = _jaccard_skill_score(c_skills, must_have, nice_to_have)
        exp_sc = _experience_score(c.get("experience_years"), min_exp, max_exp)
        avail_sc = _availability_score(c.get("availability", "passive"))
        comp_sc = _compensation_score(
            c.get("salary_min"), c.get("salary_max"), budget_min, budget_max
        )
        loc_sc = _location_score(
            c.get("location"), c.get("country"),
            bool(c.get("is_remote_ok")),
            location_pref, remote_ok,
        )
        qual_sc = _quality_score(
            c.get("experience_years"), c.get("summary"),
            c.get("email"), len(c_skills),
        )

        total = (
            skills_sc * 0.30
            + exp_sc * 0.20
            + avail_sc * 0.20
            + comp_sc * 0.15
            + loc_sc * 0.10
            + qual_sc * 0.05
        )

        scored.append({
            "candidate": c,
            "candidate_skills": c_skills,
            "match_score": round(total, 1),
            "score_breakdown": {
                "skills": round(skills_sc, 1),
                "experience": round(exp_sc, 1),
                "availability": round(avail_sc, 1),
                "compensation": round(comp_sc, 1),
                "location": round(loc_sc, 1),
                "quality": round(qual_sc, 1),
            },
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return scored[:limit]


# ---------------------------------------------------------------------------
# Phase 3 — Generate match explanations with Claude Sonnet
# ---------------------------------------------------------------------------

EXPLAIN_PROMPT = """Given this hiring brief: {brief}
And this candidate: {candidate_profile}
Match score: {score} (breakdown: {breakdown})

Write a 2-3 sentence explanation of why this candidate is a good or poor match.
Highlight the strongest match dimension and the biggest gap.
Be specific — reference actual skills, companies, and numbers.
Return ONLY the explanation text, no JSON."""


def explain_matches(
    candidates: list[dict],
    parsed_brief: dict,
    max_explain: int = 10,
) -> list[str]:
    """Phase 3: Generate AI explanations for top matches."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        # Template-based fallback
        explanations = []
        for match in candidates[:max_explain]:
            c = match["candidate"]
            bd = match["score_breakdown"]
            top_dim = max(bd, key=bd.get) if bd else "overall"
            explanations.append(
                f"{c.get('full_name', 'Candidate')} scores {match['match_score']}% overall. "
                f"Strongest dimension: {top_dim} ({bd.get(top_dim, 0)}%). "
                f"{c.get('experience_years', '?')} years experience at {c.get('current_company', 'their company')}."
            )
        return explanations

    client = _get_client()
    explanations = []
    brief_summary = json.dumps(parsed_brief, default=str)

    for match in candidates[:max_explain]:
        c = match["candidate"]
        profile = (
            f"{c.get('full_name', 'Unknown')} — {c.get('headline', '')}\n"
            f"Skills: {c.get('skills', '[]')}\n"
            f"Experience: {c.get('experience_years', '?')} years\n"
            f"Company: {c.get('current_company', '?')}, Title: {c.get('current_title', '?')}\n"
            f"Location: {c.get('location', '?')}, Remote OK: {c.get('is_remote_ok', True)}\n"
            f"Salary range: {c.get('salary_min', '?')} - {c.get('salary_max', '?')}\n"
            f"Availability: {c.get('availability', '?')}"
        )

        prompt = EXPLAIN_PROMPT.format(
            brief=brief_summary,
            candidate_profile=profile,
            score=match["match_score"],
            breakdown=json.dumps(match["score_breakdown"]),
        )

        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}],
            )
            explanations.append(response.content[0].text.strip())
        except Exception:
            explanations.append(
                f"Strong match at {match['match_score']}%. "
                f"Top dimension: skills ({match['score_breakdown'].get('skills', 0)}%)."
            )

    return explanations


# ---------------------------------------------------------------------------
# Main search entry points
# ---------------------------------------------------------------------------

def _candidate_to_response(c: dict, skills: list[str] | None = None) -> dict:
    """Convert a raw DB row to a CandidateResponse-compatible dict."""
    if skills is None:
        try:
            skills = json.loads(c.get("skills") or "[]")
        except (json.JSONDecodeError, TypeError):
            skills = []
    return {
        "candidate_id": c["candidate_id"],
        "full_name": c["full_name"],
        "headline": c.get("headline"),
        "skills": skills,
        "experience_years": c.get("experience_years"),
        "current_company": c.get("current_company"),
        "current_title": c.get("current_title"),
        "location": c.get("location"),
        "country": c.get("country"),
        "is_remote_ok": bool(c.get("is_remote_ok", 1)),
        "salary_min": c.get("salary_min"),
        "salary_max": c.get("salary_max"),
        "availability": c.get("availability", "active"),
        "summary": c.get("summary"),
        "email": c.get("email"),
    }


def search_candidates(
    recruiter_id: int,
    brief: str,
    conn: sqlite3.Connection,
) -> dict:
    """Full search pipeline: parse → score → explain → persist."""
    search_id = str(uuid.uuid4())

    # Phase 1: Parse brief
    parsed = parse_brief(brief)

    # Store the search
    conn.execute(
        """INSERT INTO recruiter_searches
           (search_id, recruiter_id, brief, parsed_brief, status)
           VALUES (?, ?, ?, ?, 'active')""",
        (search_id, recruiter_id, brief, json.dumps(parsed)),
    )
    conn.commit()

    # Store user message in chat
    conn.execute(
        """INSERT INTO recruiter_chat_messages (search_id, role, content)
           VALUES (?, 'user', ?)""",
        (search_id, brief),
    )
    conn.commit()

    # Check if brief is too vague
    clarifying = parsed.get("clarifying_questions", [])
    must_have = parsed.get("must_have_skills", [])
    if clarifying and not must_have and not parsed.get("role_title"):
        # Too vague — return questions
        assistant_msg = "I need a bit more detail. " + " ".join(clarifying)
        conn.execute(
            """INSERT INTO recruiter_chat_messages (search_id, role, content)
               VALUES (?, 'assistant', ?)""",
            (search_id, assistant_msg),
        )
        conn.commit()
        return {
            "search_id": search_id,
            "candidates": [],
            "clarifying_questions": clarifying,
            "parsed_brief": parsed,
        }

    # Phase 2: Score candidates
    scored = score_candidates(parsed, conn)

    # Phase 3: Explain top matches
    explanations = explain_matches(scored, parsed)

    # Build results
    candidate_matches = []
    for i, match in enumerate(scored):
        explanation = explanations[i] if i < len(explanations) else None
        c = match["candidate"]
        c_skills = match.get("candidate_skills")

        # Persist result
        conn.execute(
            """INSERT INTO recruiter_search_results
               (search_id, candidate_id, match_score, score_breakdown, match_explanation, status)
               VALUES (?, ?, ?, ?, ?, 'new')""",
            (
                search_id,
                c["candidate_id"],
                match["match_score"],
                json.dumps(match["score_breakdown"]),
                explanation,
            ),
        )

        candidate_matches.append({
            "candidate": _candidate_to_response(c, c_skills),
            "match_score": match["match_score"],
            "score_breakdown": match["score_breakdown"],
            "explanation": explanation,
        })

    conn.commit()

    # Store assistant summary in chat
    summary = f"Found {len(candidate_matches)} candidates matching your brief."
    if candidate_matches:
        top = candidate_matches[0]
        summary += (
            f" Top match: {top['candidate']['full_name']} "
            f"({top['match_score']}% match)."
        )
    conn.execute(
        """INSERT INTO recruiter_chat_messages
           (search_id, role, content, metadata)
           VALUES (?, 'assistant', ?, ?)""",
        (search_id, summary, json.dumps({"candidates_shown": len(candidate_matches)})),
    )
    conn.commit()

    return {
        "search_id": search_id,
        "candidates": candidate_matches,
        "clarifying_questions": clarifying if clarifying else None,
        "parsed_brief": parsed,
    }


def refine_search(
    search_id: str,
    message: str,
    conn: sqlite3.Connection,
) -> dict:
    """Refine an existing search with a follow-up message."""
    # Load existing search
    row = conn.execute(
        "SELECT * FROM recruiter_searches WHERE search_id = ?",
        (search_id,),
    ).fetchone()
    if not row:
        raise ValueError("Search not found")

    search = dict(row)
    old_parsed = json.loads(search.get("parsed_brief") or "{}")

    # Store the refinement message
    conn.execute(
        """INSERT INTO recruiter_chat_messages (search_id, role, content)
           VALUES (?, 'user', ?)""",
        (search_id, message),
    )
    conn.commit()

    # Re-parse with context
    client = _get_client()
    refine_prompt = (
        f"Original hiring brief: {search['brief']}\n"
        f"Current parsed requirements: {json.dumps(old_parsed)}\n"
        f"Recruiter refinement: {message}\n\n"
        f"Update the parsed requirements based on the refinement. "
        f"Return ONLY valid JSON with the same schema as before."
    )
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        messages=[{"role": "user", "content": PARSE_BRIEF_PROMPT + refine_prompt}],
    )
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        new_parsed = json.loads(text)
    except json.JSONDecodeError:
        new_parsed = old_parsed

    # Update stored search
    conn.execute(
        """UPDATE recruiter_searches SET parsed_brief = ?, updated_at = datetime('now')
           WHERE search_id = ?""",
        (json.dumps(new_parsed), search_id),
    )
    conn.commit()

    # Re-score
    scored = score_candidates(new_parsed, conn)
    explanations = explain_matches(scored, new_parsed)

    # Clear old results for this search
    conn.execute(
        "DELETE FROM recruiter_search_results WHERE search_id = ?",
        (search_id,),
    )

    candidate_matches = []
    for i, match in enumerate(scored):
        explanation = explanations[i] if i < len(explanations) else None
        c = match["candidate"]
        c_skills = match.get("candidate_skills")

        conn.execute(
            """INSERT INTO recruiter_search_results
               (search_id, candidate_id, match_score, score_breakdown, match_explanation, status)
               VALUES (?, ?, ?, ?, ?, 'new')""",
            (
                search_id,
                c["candidate_id"],
                match["match_score"],
                json.dumps(match["score_breakdown"]),
                explanation,
            ),
        )

        candidate_matches.append({
            "candidate": _candidate_to_response(c, c_skills),
            "match_score": match["match_score"],
            "score_breakdown": match["score_breakdown"],
            "explanation": explanation,
        })

    conn.commit()

    summary = f"Refined search: {len(candidate_matches)} candidates found."
    conn.execute(
        """INSERT INTO recruiter_chat_messages
           (search_id, role, content, metadata)
           VALUES (?, 'assistant', ?, ?)""",
        (search_id, summary, json.dumps({"candidates_shown": len(candidate_matches)})),
    )
    conn.commit()

    return {
        "search_id": search_id,
        "candidates": candidate_matches,
        "clarifying_questions": None,
        "parsed_brief": new_parsed,
    }
