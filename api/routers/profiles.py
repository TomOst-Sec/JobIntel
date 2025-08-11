"""User profile endpoints."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user, get_optional_user
from api.services.profile_service import (
    get_or_create_profile, update_profile, search_profiles, get_profile,
)
from api.services.github_service import (
    sync_github_profile, get_github_profile, get_build_score,
)

router = APIRouter()


class ProfileUpdate(BaseModel):
    headline: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    skills: list[str] | None = None
    experience: list[dict] | None = None
    education: list[dict] | None = None
    location: str | None = None
    website: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None
    is_public: bool | None = None
    open_to_messages: bool | None = None


# ─── My Profile ─────────────────────────────────────

@router.get("/me")
def my_profile(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get the current user's profile."""
    return get_or_create_profile(user["id"], db)


@router.put("/me")
def update_my_profile(
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update the current user's profile."""
    data = body.model_dump(exclude_none=True)
    return update_profile(user["id"], data, db)


# ─── Public Profiles ────────────────────────────────

@router.get("/search")
def browse_profiles(
    q: Optional[str] = Query(None, description="Search query"),
    skills: Optional[str] = Query(None, description="Comma-separated skills"),
    role: Optional[str] = Query(None, description="Filter by role"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: sqlite3.Connection = Depends(get_db),
):
    """Search/browse public user profiles."""
    skill_list = [s.strip() for s in skills.split(",")] if skills else None
    offset = (page - 1) * per_page
    results = search_profiles(
        query=q, skills=skill_list, role=role,
        limit=per_page, offset=offset, conn=db,
    )
    return {"profiles": results, "page": page, "per_page": per_page}


@router.get("/{user_id}")
def view_profile(
    user_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """View a user's public profile."""
    profile = get_profile(user_id, db)
    if not profile:
        # Try creating a default profile
        try:
            profile = get_or_create_profile(user_id, db)
        except ValueError:
            raise HTTPException(status_code=404, detail="User not found")

    if not profile.get("is_public", True):
        raise HTTPException(status_code=403, detail="This profile is private")

    return profile


# ─── GitHub Identity Engine ───────────────────────

@router.post("/github/sync")
def github_sync(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Sync GitHub data and compute Build Score. Requires linked GitHub account."""
    try:
        result = sync_github_profile(user["id"], db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"GitHub API error: {str(e)}")


@router.get("/github")
def my_github_profile(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get current user's GitHub profile and Build Score."""
    profile = get_github_profile(user["id"], db)
    if not profile:
        raise HTTPException(status_code=404, detail="No GitHub profile synced yet. POST /profiles/github/sync first.")
    return profile


@router.get("/{user_id}/build-score")
def public_build_score(
    user_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get Build Score for any user (public)."""
    score = get_build_score(user_id, db)
    if not score:
        raise HTTPException(status_code=404, detail="No Build Score available for this user")
    return score
