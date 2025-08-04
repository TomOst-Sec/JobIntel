"""Startup Hub Service — startup profiles, co-founder matching, equity calculator.

The YC wedge: auto-built startup profiles, AI co-founder matching,
transparent equity breakdowns, startup-mode talent pools.
"""
import json
import math
import sqlite3
from datetime import datetime


# ═══════════════════════════════════════════════════
# STARTUP PROFILES
# ═══════════════════════════════════════════════════

def create_startup(
    user_id: int,
    name: str,
    tagline: str | None = None,
    description: str | None = None,
    stage: str = "pre_seed",
    industry: str | None = None,
    location: str | None = None,
    remote_friendly: bool = True,
    website_url: str | None = None,
    looking_for_cofounder: bool = False,
    cofounder_skills_needed: list[str] | None = None,
    conn: sqlite3.Connection = None,
) -> dict:
    """Create a new startup profile."""
    if not name or len(name.strip()) < 2:
        raise ValueError("Startup name is required")

    slug = name.lower().strip().replace(" ", "-").replace(".", "")
    # Ensure unique slug
    existing = conn.execute("SELECT id FROM startup_profiles WHERE slug = ?", (slug,)).fetchone()
    if existing:
        slug = f"{slug}-{int(datetime.utcnow().timestamp()) % 10000}"

    cursor = conn.execute("""
        INSERT INTO startup_profiles (
            user_id, name, slug, tagline, description, stage,
            industry, location, remote_friendly, website_url,
            looking_for_cofounder, cofounder_skills_needed,
            team_members
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, name.strip(), slug, tagline, description, stage,
        industry, location, int(remote_friendly), website_url,
        int(looking_for_cofounder),
        json.dumps(cofounder_skills_needed or []),
        json.dumps([{"user_id": user_id, "role": "Founder", "equity_pct": 100}]),
    ))
    conn.commit()
    return get_startup(cursor.lastrowid, conn)


def get_startup(startup_id: int, conn: sqlite3.Connection) -> dict:
    """Get a startup profile with team info."""
    row = conn.execute("""
        SELECT sp.*, u.full_name as founder_name, gp.build_score as founder_build_score
        FROM startup_profiles sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN github_profiles gp ON sp.user_id = gp.user_id
        WHERE sp.id = ?
    """, (startup_id,)).fetchone()
    if not row:
        raise ValueError("Startup not found")

    result = dict(row)
    for field in ("team_members", "open_roles", "investors", "cofounder_skills_needed"):
        if result.get(field):
            try:
                result[field] = json.loads(result[field])
            except (json.JSONDecodeError, TypeError):
                result[field] = []
    return result


def get_startup_by_slug(slug: str, conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT id FROM startup_profiles WHERE slug = ?", (slug,)).fetchone()
    if not row:
        raise ValueError("Startup not found")
    return get_startup(row["id"], conn)


def list_startups(
    stage: str | None = None,
    industry: str | None = None,
    looking_for_cofounder: bool | None = None,
    query: str | None = None,
    page: int = 1,
    per_page: int = 20,
    conn: sqlite3.Connection = None,
) -> dict:
    """List startup profiles with filters."""
    offset = (page - 1) * per_page
    sql = """
        SELECT sp.*, u.full_name as founder_name, gp.build_score as founder_build_score
        FROM startup_profiles sp
        JOIN users u ON sp.user_id = u.id
        LEFT JOIN github_profiles gp ON sp.user_id = gp.user_id
        WHERE sp.status = 'active'
    """
    params: list = []

    if stage:
        sql += " AND sp.stage = ?"
        params.append(stage)
    if industry:
        sql += " AND sp.industry = ?"
        params.append(industry)
    if looking_for_cofounder is not None:
        sql += " AND sp.looking_for_cofounder = ?"
        params.append(int(looking_for_cofounder))
    if query:
        sql += " AND (sp.name LIKE ? OR sp.tagline LIKE ? OR sp.description LIKE ?)"
        params.extend([f"%{query}%"] * 3)

    sql += " ORDER BY sp.featured DESC, sp.created_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])

    rows = conn.execute(sql, params).fetchall()
    startups = []
    for r in rows:
        s = dict(r)
        for field in ("team_members", "open_roles", "investors", "cofounder_skills_needed"):
            if s.get(field):
                try:
                    s[field] = json.loads(s[field])
                except (json.JSONDecodeError, TypeError):
                    s[field] = []
        startups.append(s)

    return {"startups": startups, "page": page, "per_page": per_page}


def update_startup(
    startup_id: int,
    user_id: int,
    updates: dict,
    conn: sqlite3.Connection,
) -> dict:
    """Update a startup profile (owner only)."""
    startup = conn.execute(
        "SELECT user_id FROM startup_profiles WHERE id = ?", (startup_id,)
    ).fetchone()
    if not startup or startup["user_id"] != user_id:
        raise PermissionError("Only the founder can edit this startup")

    allowed_fields = {
        "tagline", "description", "stage", "industry", "location",
        "remote_friendly", "website_url", "looking_for_cofounder",
        "cofounder_skills_needed", "open_roles", "team_members",
        "funding_total", "last_round_amount", "last_round_date",
        "revenue_range", "user_count_range", "growth_rate_pct",
        "total_shares", "option_pool_pct", "last_valuation", "logo_url",
    }

    filtered = {}
    for k, v in updates.items():
        if k in allowed_fields:
            if isinstance(v, (list, dict)):
                filtered[k] = json.dumps(v)
            elif isinstance(v, bool):
                filtered[k] = int(v)
            else:
                filtered[k] = v

    if not filtered:
        return get_startup(startup_id, conn)

    filtered["updated_at"] = datetime.utcnow().isoformat()
    set_clause = ", ".join(f"{k} = ?" for k in filtered)
    conn.execute(
        f"UPDATE startup_profiles SET {set_clause} WHERE id = ?",
        list(filtered.values()) + [startup_id],
    )
    conn.commit()
    return get_startup(startup_id, conn)


# ═══════════════════════════════════════════════════
# CO-FOUNDER MATCHING
# ═══════════════════════════════════════════════════

def find_cofounder_matches(
    startup_id: int,
    conn: sqlite3.Connection,
    limit: int = 20,
) -> list[dict]:
    """Find potential co-founders based on complementary skill graphs."""
    startup = get_startup(startup_id, conn)
    needed_skills = startup.get("cofounder_skills_needed", [])
    if not needed_skills:
        return []

    # Find users with matching skills who are open to co-founding
    # Simple approach: match against user_skills table
    placeholders = ",".join("?" * len(needed_skills))
    candidates = conn.execute(f"""
        SELECT DISTINCT us.user_id, u.full_name,
               gp.build_score, gp.github_username,
               COUNT(DISTINCT us.skill_id) as matched_skills,
               AVG(us.proficiency_level) as avg_proficiency
        FROM user_skills us
        JOIN skill_nodes sn ON us.skill_id = sn.id
        JOIN users u ON us.user_id = u.id
        LEFT JOIN github_profiles gp ON us.user_id = gp.user_id
        WHERE sn.slug IN ({placeholders})
          AND us.user_id != ?
          AND us.proficiency_level >= 40
        GROUP BY us.user_id
        ORDER BY matched_skills DESC, avg_proficiency DESC
        LIMIT ?
    """, needed_skills + [startup["user_id"], limit]).fetchall()

    results = []
    for c in candidates:
        skill_complement = round(
            (c["matched_skills"] / max(len(needed_skills), 1)) * 100, 1
        )
        build_score = c["build_score"] or 0
        match_score = round(skill_complement * 0.6 + min(build_score, 100) * 0.4, 1)

        results.append({
            "user_id": c["user_id"],
            "full_name": c["full_name"],
            "build_score": build_score,
            "github_username": c["github_username"],
            "matched_skills": c["matched_skills"],
            "skill_complement_score": skill_complement,
            "match_score": match_score,
        })

    return results


# ═══════════════════════════════════════════════════
# EQUITY CALCULATOR
# ═══════════════════════════════════════════════════

def calculate_equity(
    total_shares: int = 10_000_000,
    option_pool_pct: float = 15.0,
    last_valuation: float | None = None,
    founders: list[dict] | None = None,
    exit_scenarios: list[float] | None = None,
) -> dict:
    """Calculate equity breakdown and potential outcomes.

    founders: [{"name": "Alice", "equity_pct": 60}, {"name": "Bob", "equity_pct": 25}]
    exit_scenarios: [10_000_000, 50_000_000, 100_000_000, 1_000_000_000]
    """
    if not founders:
        founders = [{"name": "Founder 1", "equity_pct": 100}]
    if not exit_scenarios:
        exit_scenarios = [10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000]

    option_pool_shares = int(total_shares * option_pool_pct / 100)
    available_shares = total_shares - option_pool_shares
    price_per_share = last_valuation / total_shares if last_valuation else None

    breakdown = []
    for f in founders:
        pct = f["equity_pct"]
        shares = int(available_shares * pct / 100)
        row = {
            "name": f["name"],
            "equity_pct": pct,
            "shares": shares,
            "current_value": round(shares * price_per_share, 2) if price_per_share else None,
        }
        # Exit scenario outcomes
        row["exit_outcomes"] = {}
        for exit_val in exit_scenarios:
            exit_pps = exit_val / total_shares
            row["exit_outcomes"][f"${exit_val:,.0f}"] = round(shares * exit_pps, 2)
        breakdown.append(row)

    return {
        "total_shares": total_shares,
        "option_pool_pct": option_pool_pct,
        "option_pool_shares": option_pool_shares,
        "last_valuation": last_valuation,
        "price_per_share": round(price_per_share, 4) if price_per_share else None,
        "founders": breakdown,
        "exit_scenarios": exit_scenarios,
    }
