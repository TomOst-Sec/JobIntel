"""User profile management service."""
import json
import sqlite3


def get_profile(user_id: int, conn: sqlite3.Connection) -> dict | None:
    """Get a user's full profile."""
    row = conn.execute(
        """SELECT up.*, u.full_name, u.email, u.role, u.created_at as member_since
           FROM user_profiles up
           JOIN users u ON u.id = up.user_id
           WHERE up.user_id = ?""",
        (user_id,),
    ).fetchone()

    if not row:
        return None

    profile = dict(row)
    for field in ("skills", "experience", "education", "media_urls"):
        if profile.get(field):
            try:
                profile[field] = json.loads(profile[field])
            except (json.JSONDecodeError, TypeError):
                profile[field] = []
    return profile


def get_or_create_profile(user_id: int, conn: sqlite3.Connection) -> dict:
    """Get a user's profile, creating a default one if it doesn't exist."""
    profile = get_profile(user_id, conn)
    if profile:
        return profile

    # Auto-populate from cv_dna if available
    skills = []
    headline = ""
    cv_row = conn.execute(
        "SELECT structured_data, headline FROM cv_dna WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if cv_row:
        if cv_row["headline"]:
            headline = cv_row["headline"]
        if cv_row["structured_data"]:
            try:
                cv_data = json.loads(cv_row["structured_data"])
                skills = cv_data.get("skills", [])[:20]
                if not headline:
                    headline = cv_data.get("headline", "")
            except (json.JSONDecodeError, TypeError):
                pass

    user = conn.execute("SELECT full_name FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        raise ValueError("User not found")

    conn.execute(
        """INSERT INTO user_profiles (user_id, headline, skills)
           VALUES (?, ?, ?)""",
        (user_id, headline, json.dumps(skills)),
    )
    conn.commit()

    return get_profile(user_id, conn)


def update_profile(user_id: int, data: dict, conn: sqlite3.Connection) -> dict:
    """Update a user's profile fields."""
    # Ensure profile exists
    get_or_create_profile(user_id, conn)

    allowed_fields = {
        "headline", "bio", "avatar_url", "skills", "experience",
        "education", "location", "website", "github_url", "linkedin_url",
        "is_public", "open_to_messages",
    }

    updates = []
    params = []
    for key, value in data.items():
        if key not in allowed_fields:
            continue
        if key in ("skills", "experience", "education"):
            value = json.dumps(value) if isinstance(value, (list, dict)) else value
        updates.append(f"{key} = ?")
        params.append(value)

    if not updates:
        return get_profile(user_id, conn)

    updates.append("updated_at = datetime('now')")
    params.append(user_id)

    conn.execute(
        f"UPDATE user_profiles SET {', '.join(updates)} WHERE user_id = ?",
        params,
    )
    conn.commit()
    return get_profile(user_id, conn)


def search_profiles(
    query: str | None = None,
    skills: list[str] | None = None,
    role: str | None = None,
    limit: int = 20,
    offset: int = 0,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Search public profiles by name, headline, or skills."""
    conditions = ["up.is_public = 1"]
    params: list = []

    if query:
        conditions.append(
            "(u.full_name LIKE ? OR up.headline LIKE ? OR up.bio LIKE ?)"
        )
        q = f"%{query}%"
        params.extend([q, q, q])

    if skills:
        for skill in skills[:5]:
            conditions.append("up.skills LIKE ?")
            params.append(f"%{skill}%")

    if role:
        conditions.append("u.role = ?")
        params.append(role)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    rows = conn.execute(
        f"""SELECT up.user_id, u.full_name, u.role, up.headline, up.avatar_url,
                   up.skills, up.location, up.is_public
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
            WHERE {where}
            ORDER BY up.updated_at DESC
            LIMIT ? OFFSET ?""",
        params,
    ).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        if d.get("skills"):
            try:
                d["skills"] = json.loads(d["skills"])
            except (json.JSONDecodeError, TypeError):
                d["skills"] = []
        results.append(d)

    return results
