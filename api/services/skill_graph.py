"""Skill Graph DAG Service — manages the directed acyclic graph of skills.

Provides:
- Skill taxonomy CRUD
- User skill proficiency tracking (auto + manual)
- Graph traversal (prerequisites, related skills)
- Skill gap analysis against job requirements
"""
import json
import sqlite3


# ═══════════════════════════════════════════════════
# SKILL TAXONOMY
# ═══════════════════════════════════════════════════

def get_all_skills(
    category: str | None = None,
    query: str | None = None,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get the full skill taxonomy, optionally filtered."""
    sql = "SELECT * FROM skill_nodes WHERE 1=1"
    params: list = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    if query:
        sql += " AND (name LIKE ? OR slug LIKE ?)"
        params.extend([f"%{query}%", f"%{query}%"])
    sql += " ORDER BY category, name"
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_skill_by_slug(slug: str, conn: sqlite3.Connection) -> dict | None:
    row = conn.execute("SELECT * FROM skill_nodes WHERE slug = ?", (slug,)).fetchone()
    return dict(row) if row else None


def get_skill_graph(skill_id: int, conn: sqlite3.Connection) -> dict:
    """Get a skill node with its prerequisite and dependent relationships."""
    node = conn.execute("SELECT * FROM skill_nodes WHERE id = ?", (skill_id,)).fetchone()
    if not node:
        raise ValueError(f"Skill {skill_id} not found")

    # Prerequisites (skills this one requires)
    prereqs = conn.execute("""
        SELECT sn.* FROM skill_edges se
        JOIN skill_nodes sn ON se.to_skill_id = sn.id
        WHERE se.from_skill_id = ? AND se.relationship = 'requires'
    """, (skill_id,)).fetchall()

    # Dependents (skills that require this one)
    dependents = conn.execute("""
        SELECT sn.* FROM skill_edges se
        JOIN skill_nodes sn ON se.from_skill_id = sn.id
        WHERE se.to_skill_id = ? AND se.relationship = 'requires'
    """, (skill_id,)).fetchall()

    # Related skills
    related = conn.execute("""
        SELECT sn.* FROM skill_edges se
        JOIN skill_nodes sn ON se.to_skill_id = sn.id
        WHERE se.from_skill_id = ? AND se.relationship = 'related_to'
        UNION
        SELECT sn.* FROM skill_edges se
        JOIN skill_nodes sn ON se.from_skill_id = sn.id
        WHERE se.to_skill_id = ? AND se.relationship = 'related_to'
    """, (skill_id, skill_id)).fetchall()

    return {
        "node": dict(node),
        "prerequisites": [dict(r) for r in prereqs],
        "dependents": [dict(r) for r in dependents],
        "related": [dict(r) for r in related],
    }


# ═══════════════════════════════════════════════════
# USER SKILLS
# ═══════════════════════════════════════════════════

def get_user_skills(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Get all skills for a user with full skill node info."""
    rows = conn.execute("""
        SELECT us.*, sn.name, sn.slug, sn.category, sn.description as skill_description
        FROM user_skills us
        JOIN skill_nodes sn ON us.skill_id = sn.id
        WHERE us.user_id = ?
        ORDER BY us.proficiency_level DESC
    """, (user_id,)).fetchall()
    return [dict(r) for r in rows]


def add_user_skill(
    user_id: int,
    skill_slug: str,
    proficiency_level: float = 0,
    self_reported_level: float | None = None,
    source: str = "manual",
    context: str | None = None,
    conn: sqlite3.Connection = None,
) -> dict:
    """Add or update a skill for a user."""
    skill = conn.execute("SELECT id FROM skill_nodes WHERE slug = ?", (skill_slug,)).fetchone()
    if not skill:
        raise ValueError(f"Unknown skill: {skill_slug}")

    conn.execute("""
        INSERT INTO user_skills (user_id, skill_id, proficiency_level, self_reported_level, source, context)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, skill_id) DO UPDATE SET
            proficiency_level = MAX(user_skills.proficiency_level, excluded.proficiency_level),
            self_reported_level = COALESCE(excluded.self_reported_level, user_skills.self_reported_level),
            source = excluded.source,
            context = COALESCE(excluded.context, user_skills.context),
            evidence_count = user_skills.evidence_count + 1,
            updated_at = datetime('now')
    """, (user_id, skill["id"], proficiency_level, self_reported_level, source, context))
    conn.commit()

    return {"skill": skill_slug, "proficiency": proficiency_level, "added": True}


def update_user_skill_proficiency(
    user_id: int,
    skill_slug: str,
    proficiency_level: float,
    conn: sqlite3.Connection,
) -> dict:
    """Update proficiency level for a user's skill."""
    skill = conn.execute("SELECT id FROM skill_nodes WHERE slug = ?", (skill_slug,)).fetchone()
    if not skill:
        raise ValueError(f"Unknown skill: {skill_slug}")

    conn.execute("""
        UPDATE user_skills SET proficiency_level = ?, updated_at = datetime('now')
        WHERE user_id = ? AND skill_id = ?
    """, (proficiency_level, user_id, skill["id"]))
    conn.commit()
    return {"skill": skill_slug, "proficiency": proficiency_level}


def remove_user_skill(user_id: int, skill_slug: str, conn: sqlite3.Connection) -> dict:
    """Remove a skill from a user's profile."""
    skill = conn.execute("SELECT id FROM skill_nodes WHERE slug = ?", (skill_slug,)).fetchone()
    if not skill:
        raise ValueError(f"Unknown skill: {skill_slug}")
    conn.execute("DELETE FROM user_skills WHERE user_id = ? AND skill_id = ?", (user_id, skill["id"]))
    conn.commit()
    return {"skill": skill_slug, "removed": True}


def sync_skills_from_github(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Sync user skills from their GitHub profile data."""
    gh = conn.execute(
        "SELECT skills_extracted, top_languages FROM github_profiles WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if not gh:
        return []

    added = []
    # Parse skills from GitHub
    skills_raw = gh["skills_extracted"]
    languages_raw = gh["top_languages"]

    skills_list = []
    if skills_raw:
        try:
            skills_list = json.loads(skills_raw) if isinstance(skills_raw, str) else skills_raw
        except (json.JSONDecodeError, TypeError):
            pass

    languages = {}
    if languages_raw:
        try:
            languages = json.loads(languages_raw) if isinstance(languages_raw, str) else languages_raw
        except (json.JSONDecodeError, TypeError):
            pass

    # Map skills to skill_nodes slugs
    for skill_name in skills_list:
        slug = skill_name.lower().replace(" ", "-").replace(".", "-").replace("/", "-")
        node = conn.execute("SELECT id FROM skill_nodes WHERE slug = ? OR name = ?", (slug, skill_name)).fetchone()
        if node:
            result = add_user_skill(
                user_id, slug=slug if conn.execute("SELECT id FROM skill_nodes WHERE slug = ?", (slug,)).fetchone() else skill_name,
                proficiency_level=50,  # Default mid-level from GitHub
                source="github",
                context="oss",
                conn=conn,
            )
            added.append(result)

    # Map top languages to skill_nodes
    total_bytes = sum(languages.values()) if languages else 1
    for lang, bytes_count in (languages or {}).items():
        slug = lang.lower().replace(" ", "-").replace("+", "p").replace("#", "sharp")
        if slug == "c++":
            slug = "cpp"
        if slug == "c#":
            slug = "csharp"
        node = conn.execute("SELECT id FROM skill_nodes WHERE slug = ?", (slug,)).fetchone()
        if node:
            # Proficiency proportional to usage
            pct = (bytes_count / total_bytes) * 100
            proficiency = min(90, max(20, pct * 1.5))
            result = add_user_skill(
                user_id, slug,
                proficiency_level=round(proficiency, 1),
                source="github",
                context="oss",
                conn=conn,
            )
            added.append(result)

    return added


# ═══════════════════════════════════════════════════
# SKILL GAP ANALYSIS
# ═══════════════════════════════════════════════════

def analyze_skill_gaps(
    user_id: int,
    required_skills: list[str],
    conn: sqlite3.Connection,
) -> dict:
    """Analyze gaps between user's skills and job requirements."""
    user_skills = {
        r["slug"]: r["proficiency_level"]
        for r in get_user_skills(user_id, conn)
    }

    matched = []
    gaps = []
    partial = []

    for skill_slug in required_skills:
        if skill_slug in user_skills:
            level = user_skills[skill_slug]
            if level >= 60:
                matched.append({"skill": skill_slug, "proficiency": level})
            else:
                partial.append({"skill": skill_slug, "proficiency": level, "gap": 60 - level})
        else:
            gaps.append({"skill": skill_slug, "proficiency": 0})

    total = len(required_skills)
    match_pct = (len(matched) / total * 100) if total > 0 else 0

    return {
        "match_percentage": round(match_pct, 1),
        "matched_skills": matched,
        "partial_skills": partial,
        "missing_skills": gaps,
        "total_required": total,
    }


def get_user_skill_graph_visual(user_id: int, conn: sqlite3.Connection) -> dict:
    """Build a visual skill graph for the user (nodes + edges for frontend rendering)."""
    user_skills = get_user_skills(user_id, conn)
    if not user_skills:
        return {"nodes": [], "edges": []}

    skill_ids = [s["skill_id"] for s in user_skills]
    if not skill_ids:
        return {"nodes": [], "edges": []}

    placeholders = ",".join("?" * len(skill_ids))

    # Get edges between user's skills
    edges = conn.execute(f"""
        SELECT se.from_skill_id, se.to_skill_id, se.relationship, se.weight
        FROM skill_edges se
        WHERE se.from_skill_id IN ({placeholders})
          AND se.to_skill_id IN ({placeholders})
    """, skill_ids + skill_ids).fetchall()

    nodes = [
        {
            "id": s["skill_id"],
            "name": s["name"],
            "slug": s["slug"],
            "category": s["category"],
            "proficiency": s["proficiency_level"],
            "verified": bool(s.get("verified", 0)),
        }
        for s in user_skills
    ]

    edge_list = [
        {
            "from": e["from_skill_id"],
            "to": e["to_skill_id"],
            "relationship": e["relationship"],
        }
        for e in edges
    ]

    return {"nodes": nodes, "edges": edge_list}
