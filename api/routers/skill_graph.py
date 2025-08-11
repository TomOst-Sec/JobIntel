"""Skill Graph API — DAG-based skill taxonomy and user skill management."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.skill_graph import (
    get_all_skills, get_skill_graph, get_user_skills,
    add_user_skill, remove_user_skill, update_user_skill_proficiency,
    sync_skills_from_github, analyze_skill_gaps, get_user_skill_graph_visual,
)

router = APIRouter()


class AddSkillBody(BaseModel):
    skill_slug: str
    self_reported_level: float | None = None


class UpdateSkillBody(BaseModel):
    proficiency_level: float


# ─── Skill Taxonomy ──────────────────────────────

@router.get("/taxonomy")
def skill_taxonomy(
    category: str | None = Query(None),
    q: str | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get the full skill taxonomy (or filter by category/search)."""
    return {"skills": get_all_skills(category=category, query=q, conn=db)}


@router.get("/taxonomy/{skill_id}/graph")
def skill_node_graph(
    skill_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a skill node with prerequisites, dependents, and related skills."""
    try:
        return get_skill_graph(skill_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── User Skills ──────────────────────────────────

@router.get("/me")
def my_skills(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get current user's skill graph."""
    return {"skills": get_user_skills(user["id"], db)}


@router.get("/me/visual")
def my_skill_graph_visual(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get visual skill graph data (nodes + edges) for rendering."""
    return get_user_skill_graph_visual(user["id"], db)


@router.post("/me")
def add_skill(
    body: AddSkillBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Add a skill to your profile."""
    try:
        return add_user_skill(
            user["id"], body.skill_slug,
            self_reported_level=body.self_reported_level,
            source="manual",
            conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/me/{skill_slug}")
def update_skill(
    skill_slug: str,
    body: UpdateSkillBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update proficiency level for a skill."""
    try:
        return update_user_skill_proficiency(user["id"], skill_slug, body.proficiency_level, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/me/{skill_slug}")
def delete_skill(
    skill_slug: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Remove a skill from your profile."""
    try:
        return remove_user_skill(user["id"], skill_slug, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/me/sync-github")
def sync_github_skills(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Sync skills from GitHub profile into the skill graph."""
    results = sync_skills_from_github(user["id"], db)
    return {"synced": len(results), "skills": results}


# ─── Skill Gap Analysis ──────────────────────────

@router.post("/gap-analysis")
def skill_gap_analysis(
    required_skills: list[str],
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Analyze skill gaps against a list of required skills."""
    return analyze_skill_gaps(user["id"], required_skills, db)


# ─── Public Skill Data ───────────────────────────

@router.get("/users/{user_id}")
def user_skills(
    user_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a user's public skill graph."""
    return {"skills": get_user_skills(user_id, db)}


@router.get("/users/{user_id}/visual")
def user_skill_graph_visual(
    user_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get visual skill graph data for any user."""
    return get_user_skill_graph_visual(user_id, db)
