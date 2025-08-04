"""Career roadmap engine — generates personalized skill-building plans with Coursera recommendations."""
import json
import sqlite3

import anthropic

from api.config import get_settings


ROADMAP_SYSTEM_PROMPT = """You are a career strategist and skill development advisor for the tech industry.
You create brutally honest, actionable career roadmaps based on real job market data.

Your roadmaps include:
1. An honest assessment of the person's current position
2. Specific skill gaps identified by comparing their profile to market demand
3. A phased learning plan with Coursera course recommendations
4. Timeline estimates that are realistic (not optimistic)
5. A projected match score improvement

Rules:
- Use ONLY the real market data provided to identify in-demand skills
- Be honest about skill gaps — don't sugarcoat
- Recommend specific, actionable learning resources
- Include both technical and soft skill development
- Give a realistic timeline (not a "you can do it in 2 weeks" fantasy)
- Format as structured JSON for programmatic use"""


def generate_roadmap(
    user_id: int,
    target_role: str,
    user_skills: list[str],
    experience_years: int,
    db: sqlite3.Connection,
) -> dict:
    """Generate a personalized career roadmap with skill gap analysis."""
    settings = get_settings()

    # Gather market data for the target role
    role_demand = db.execute("""
        SELECT search_category, COUNT(*) as demand,
            GROUP_CONCAT(DISTINCT required_skills) as all_skills,
            ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary_min,
            ROUND(AVG(CASE WHEN salary_max > 0 THEN salary_max END), 0) as avg_salary_max
        FROM jobs
        WHERE (search_category LIKE ? OR title LIKE ?)
        AND posted_at >= datetime('now', '-30 days')
        GROUP BY search_category
    """, (f"%{target_role}%", f"%{target_role}%")).fetchall()

    top_skills = db.execute("""
        SELECT required_skills FROM jobs
        WHERE (search_category LIKE ? OR title LIKE ?)
        AND required_skills IS NOT NULL AND required_skills != ''
        AND posted_at >= datetime('now', '-30 days')
        ORDER BY posted_at DESC LIMIT 50
    """, (f"%{target_role}%", f"%{target_role}%")).fetchall()

    # Aggregate skill frequencies
    skill_freq = {}
    for row in top_skills:
        skills_text = dict(row).get("required_skills", "")
        if skills_text:
            for skill in skills_text.split(","):
                s = skill.strip().lower()
                if s:
                    skill_freq[s] = skill_freq.get(s, 0) + 1

    market_data = {
        "role_demand": [dict(r) for r in role_demand],
        "top_skills_frequency": dict(sorted(skill_freq.items(), key=lambda x: x[1], reverse=True)[:20]),
        "user_skills": user_skills,
        "experience_years": experience_years,
        "target_role": target_role,
    }

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        system=ROADMAP_SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"""Create a career roadmap for someone targeting: {target_role}

Their current skills: {json.dumps(user_skills)}
Years of experience: {experience_years}

REAL MARKET DATA:
{json.dumps(market_data, indent=2, default=str)}

Return ONLY valid JSON:
{{
    "current_match_score": 45,
    "projected_match_score": 82,
    "timeline_weeks": 16,
    "honest_assessment": "Your frank 2-3 sentence assessment of their position...",
    "skill_gaps": [
        {{
            "skill": "Kubernetes",
            "priority": "critical",
            "market_demand_pct": 72,
            "current_level": "none",
            "target_level": "intermediate"
        }}
    ],
    "phases": [
        {{
            "phase": 1,
            "title": "Foundation Building",
            "duration_weeks": 4,
            "focus": "Core skill gaps",
            "tasks": [
                {{
                    "task": "Complete Kubernetes basics course",
                    "resource": "Coursera - Introduction to Kubernetes",
                    "hours": 20,
                    "priority": "critical"
                }}
            ],
            "milestone": "Can deploy a basic K8s cluster"
        }}
    ],
    "recommended_roles_progression": [
        "Junior DevOps → DevOps Engineer → Senior DevOps → Platform Engineer"
    ],
    "salary_trajectory": {{
        "current_estimated": 85000,
        "after_roadmap": 120000,
        "target_role_range": [110000, 160000]
    }}
}}""",
        }],
    )

    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]

    try:
        roadmap = json.loads(text)
    except json.JSONDecodeError:
        roadmap = {
            "current_match_score": None,
            "projected_match_score": None,
            "timeline_weeks": None,
            "honest_assessment": text,
            "phases": [],
            "skill_gaps": [],
        }

    # Store in DB
    cursor = db.execute("""
        INSERT INTO roadmaps (user_id, target_role, current_match_score, projected_match_score,
            timeline_weeks, phases, user_skills, job_requirements, honest_assessment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, target_role,
        roadmap.get("current_match_score"),
        roadmap.get("projected_match_score"),
        roadmap.get("timeline_weeks"),
        json.dumps(roadmap.get("phases", [])),
        json.dumps(user_skills),
        json.dumps(market_data.get("top_skills_frequency", {})),
        roadmap.get("honest_assessment", ""),
    ))
    db.commit()

    roadmap["id"] = cursor.lastrowid
    roadmap["target_role"] = target_role
    return roadmap


def get_user_roadmaps(user_id: int, db: sqlite3.Connection) -> list[dict]:
    """Get all roadmaps for a user."""
    rows = db.execute("""
        SELECT * FROM roadmaps WHERE user_id = ? ORDER BY created_at DESC
    """, (user_id,)).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        d["phases"] = json.loads(d["phases"]) if d["phases"] else []
        d["user_skills"] = json.loads(d["user_skills"]) if d["user_skills"] else []
        d["job_requirements"] = json.loads(d["job_requirements"]) if d["job_requirements"] else {}
        results.append(d)
    return results


def get_roadmap(roadmap_id: int, user_id: int, db: sqlite3.Connection) -> dict:
    """Get a specific roadmap."""
    row = db.execute(
        "SELECT * FROM roadmaps WHERE id = ? AND user_id = ?", (roadmap_id, user_id)
    ).fetchone()
    if row is None:
        raise ValueError("Roadmap not found")

    d = dict(row)
    d["phases"] = json.loads(d["phases"]) if d["phases"] else []
    d["user_skills"] = json.loads(d["user_skills"]) if d["user_skills"] else []
    d["job_requirements"] = json.loads(d["job_requirements"]) if d["job_requirements"] else {}
    return d
