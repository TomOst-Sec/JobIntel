"""Roadmap API routes — career roadmap generation and management."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db, get_current_user
from api.models.intelligence import RoadmapRequest, RoadmapResponse
from api.services.intelligence.roadmap_engine import (
    generate_roadmap, get_user_roadmaps, get_roadmap,
)

router = APIRouter()


@router.post("", response_model=RoadmapResponse, status_code=201)
def create_roadmap(
    body: RoadmapRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate a new career roadmap with skill gap analysis."""
    return generate_roadmap(
        user_id=user["id"],
        target_role=body.target_role,
        user_skills=body.user_skills,
        experience_years=body.experience_years,
        db=db,
    )


@router.get("", response_model=list[RoadmapResponse])
def list_roadmaps(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all roadmaps for the current user."""
    return get_user_roadmaps(user["id"], db)


@router.get("/{roadmap_id}", response_model=RoadmapResponse)
def get_roadmap_detail(
    roadmap_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a specific roadmap."""
    try:
        return get_roadmap(roadmap_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
