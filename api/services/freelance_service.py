"""Freelance Marketplace Service — projects, contracts, milestones, escrow.

Built on the same platform as full-time roles. Same PoW profiles,
same reputation. Flat transparent take rate (5-8%).
"""
import json
import sqlite3
from datetime import datetime


# ═══════════════════════════════════════════════════
# PROJECTS
# ═══════════════════════════════════════════════════

def create_project(
    client_id: int,
    title: str,
    description: str,
    budget_type: str = "fixed",
    budget_min: float | None = None,
    budget_max: float | None = None,
    duration_days: int | None = None,
    required_skills: list[str] | None = None,
    experience_level: str = "mid",
    scope: str = "project",
    conn: sqlite3.Connection = None,
) -> dict:
    """Create a new freelance project."""
    if not title or len(title.strip()) < 5:
        raise ValueError("Project title must be at least 5 characters")
    if not description or len(description.strip()) < 20:
        raise ValueError("Project description must be at least 20 characters")

    cursor = conn.execute("""
        INSERT INTO freelance_projects (
            client_id, title, description, scope, budget_type,
            budget_min, budget_max, duration_days,
            required_skills, experience_level, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    """, (
        client_id, title.strip(), description.strip(), scope, budget_type,
        budget_min, budget_max, duration_days,
        json.dumps(required_skills or []), experience_level,
    ))
    conn.commit()
    return get_project(cursor.lastrowid, conn)


def get_project(project_id: int, conn: sqlite3.Connection) -> dict:
    """Get a project with client info."""
    row = conn.execute("""
        SELECT fp.*, u.full_name as client_name,
               gp.build_score as client_build_score
        FROM freelance_projects fp
        JOIN users u ON fp.client_id = u.id
        LEFT JOIN github_profiles gp ON fp.client_id = gp.user_id
        WHERE fp.id = ?
    """, (project_id,)).fetchone()
    if not row:
        raise ValueError("Project not found")

    result = dict(row)
    if result.get("required_skills"):
        try:
            result["required_skills"] = json.loads(result["required_skills"])
        except (json.JSONDecodeError, TypeError):
            result["required_skills"] = []
    return result


def list_projects(
    status: str = "open",
    skills: list[str] | None = None,
    budget_min: float | None = None,
    experience_level: str | None = None,
    page: int = 1,
    per_page: int = 20,
    conn: sqlite3.Connection = None,
) -> dict:
    """List freelance projects with filters."""
    offset = (page - 1) * per_page
    sql = """
        SELECT fp.*, u.full_name as client_name,
               gp.build_score as client_build_score
        FROM freelance_projects fp
        JOIN users u ON fp.client_id = u.id
        LEFT JOIN github_profiles gp ON fp.client_id = gp.user_id
        WHERE fp.status = ?
    """
    params: list = [status]

    if experience_level:
        sql += " AND fp.experience_level = ?"
        params.append(experience_level)
    if budget_min:
        sql += " AND (fp.budget_max >= ? OR fp.budget_max IS NULL)"
        params.append(budget_min)

    sql += " ORDER BY fp.created_at DESC LIMIT ? OFFSET ?"
    params.extend([per_page, offset])

    rows = conn.execute(sql, params).fetchall()
    projects = []
    for r in rows:
        p = dict(r)
        if p.get("required_skills"):
            try:
                p["required_skills"] = json.loads(p["required_skills"])
            except (json.JSONDecodeError, TypeError):
                p["required_skills"] = []
        projects.append(p)

    total = conn.execute(
        "SELECT COUNT(*) FROM freelance_projects WHERE status = ?", (status,)
    ).fetchone()[0]

    return {"projects": projects, "total": total, "page": page, "per_page": per_page}


# ═══════════════════════════════════════════════════
# APPLICATIONS
# ═══════════════════════════════════════════════════

def apply_to_project(
    project_id: int,
    freelancer_id: int,
    cover_letter: str | None = None,
    proposed_rate: float | None = None,
    proposed_duration_days: int | None = None,
    conn: sqlite3.Connection = None,
) -> dict:
    """Apply to a freelance project."""
    project = conn.execute("SELECT * FROM freelance_projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        raise ValueError("Project not found")
    if project["status"] != "open":
        raise ValueError("Project is no longer accepting applications")
    if project["client_id"] == freelancer_id:
        raise ValueError("Cannot apply to your own project")

    cursor = conn.execute("""
        INSERT INTO freelance_applications (
            project_id, freelancer_id, cover_letter,
            proposed_rate, proposed_duration_days
        ) VALUES (?, ?, ?, ?, ?)
    """, (project_id, freelancer_id, cover_letter, proposed_rate, proposed_duration_days))

    conn.execute(
        "UPDATE freelance_projects SET applicant_count = applicant_count + 1 WHERE id = ?",
        (project_id,),
    )
    conn.commit()
    return {"application_id": cursor.lastrowid, "status": "pending"}


def get_project_applications(
    project_id: int,
    client_id: int,
    conn: sqlite3.Connection,
) -> list[dict]:
    """Get applications for a project (client only)."""
    project = conn.execute("SELECT client_id FROM freelance_projects WHERE id = ?", (project_id,)).fetchone()
    if not project or project["client_id"] != client_id:
        raise PermissionError("Only the project owner can view applications")

    rows = conn.execute("""
        SELECT fa.*, u.full_name as freelancer_name,
               gp.build_score, gp.github_username
        FROM freelance_applications fa
        JOIN users u ON fa.freelancer_id = u.id
        LEFT JOIN github_profiles gp ON fa.freelancer_id = gp.user_id
        WHERE fa.project_id = ?
        ORDER BY fa.match_score DESC, fa.created_at ASC
    """, (project_id,)).fetchall()
    return [dict(r) for r in rows]


# ═══════════════════════════════════════════════════
# CONTRACTS
# ═══════════════════════════════════════════════════

def create_contract(
    project_id: int,
    freelancer_id: int,
    client_id: int,
    rate_type: str,
    rate_amount: float,
    estimated_hours: int | None = None,
    milestones: list[dict] | None = None,
    conn: sqlite3.Connection = None,
) -> dict:
    """Create a freelance contract with optional milestones."""
    cursor = conn.execute("""
        INSERT INTO freelance_contracts (
            project_id, freelancer_id, client_id,
            rate_type, rate_amount, estimated_hours, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'active')
    """, (project_id, freelancer_id, client_id, rate_type, rate_amount, estimated_hours))
    contract_id = cursor.lastrowid

    # Create milestones
    if milestones:
        for i, ms in enumerate(milestones):
            conn.execute("""
                INSERT INTO contract_milestones (
                    contract_id, title, description, amount, due_date, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?)
            """, (
                contract_id, ms["title"], ms.get("description"),
                ms["amount"], ms.get("due_date"), i,
            ))

    # Update project status
    conn.execute(
        "UPDATE freelance_projects SET status = 'in_progress' WHERE id = ?",
        (project_id,),
    )
    # Update application status
    conn.execute("""
        UPDATE freelance_applications SET status = 'accepted'
        WHERE project_id = ? AND freelancer_id = ?
    """, (project_id, freelancer_id))

    conn.commit()
    return get_contract(contract_id, conn)


def get_contract(contract_id: int, conn: sqlite3.Connection) -> dict:
    """Get a contract with milestones."""
    row = conn.execute("""
        SELECT fc.*, fp.title as project_title,
               u1.full_name as freelancer_name, u2.full_name as client_name
        FROM freelance_contracts fc
        JOIN freelance_projects fp ON fc.project_id = fp.id
        JOIN users u1 ON fc.freelancer_id = u1.id
        JOIN users u2 ON fc.client_id = u2.id
        WHERE fc.id = ?
    """, (contract_id,)).fetchone()
    if not row:
        raise ValueError("Contract not found")

    result = dict(row)

    milestones = conn.execute("""
        SELECT * FROM contract_milestones WHERE contract_id = ?
        ORDER BY sort_order
    """, (contract_id,)).fetchall()
    result["milestones"] = [dict(m) for m in milestones]

    return result


def get_user_contracts(
    user_id: int,
    role: str = "any",
    status: str | None = None,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get contracts for a user (as freelancer or client)."""
    sql = """
        SELECT fc.*, fp.title as project_title,
               u1.full_name as freelancer_name, u2.full_name as client_name
        FROM freelance_contracts fc
        JOIN freelance_projects fp ON fc.project_id = fp.id
        JOIN users u1 ON fc.freelancer_id = u1.id
        JOIN users u2 ON fc.client_id = u2.id
        WHERE 1=1
    """
    params: list = []

    if role == "freelancer":
        sql += " AND fc.freelancer_id = ?"
        params.append(user_id)
    elif role == "client":
        sql += " AND fc.client_id = ?"
        params.append(user_id)
    else:
        sql += " AND (fc.freelancer_id = ? OR fc.client_id = ?)"
        params.extend([user_id, user_id])

    if status:
        sql += " AND fc.status = ?"
        params.append(status)

    sql += " ORDER BY fc.created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def update_milestone_status(
    milestone_id: int,
    new_status: str,
    user_id: int,
    conn: sqlite3.Connection,
) -> dict:
    """Update milestone status (submit, approve, dispute)."""
    milestone = conn.execute(
        "SELECT * FROM contract_milestones WHERE id = ?", (milestone_id,)
    ).fetchone()
    if not milestone:
        raise ValueError("Milestone not found")

    contract = conn.execute(
        "SELECT * FROM freelance_contracts WHERE id = ?", (milestone["contract_id"],)
    ).fetchone()
    if not contract:
        raise ValueError("Contract not found")

    # Permission checks
    is_freelancer = contract["freelancer_id"] == user_id
    is_client = contract["client_id"] == user_id
    if not is_freelancer and not is_client:
        raise PermissionError("You are not part of this contract")

    now = datetime.utcnow().isoformat()
    updates = {"status": new_status}

    if new_status == "submitted" and is_freelancer:
        updates["submitted_at"] = now
    elif new_status == "approved" and is_client:
        updates["approved_at"] = now
    elif new_status == "paid" and is_client:
        updates["paid_at"] = now
        conn.execute("""
            UPDATE freelance_contracts
            SET escrow_released = escrow_released + ?
            WHERE id = ?
        """, (milestone["amount"], contract["id"]))

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(
        f"UPDATE contract_milestones SET {set_clause} WHERE id = ?",
        list(updates.values()) + [milestone_id],
    )
    conn.commit()
    return {"milestone_id": milestone_id, **updates}
