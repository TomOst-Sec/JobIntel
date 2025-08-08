"""Freelance Marketplace API — projects, applications, contracts, milestones."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.freelance_service import (
    create_project, get_project, list_projects,
    apply_to_project, get_project_applications,
    create_contract, get_contract, get_user_contracts,
    update_milestone_status,
)

router = APIRouter()


class CreateProjectBody(BaseModel):
    title: str
    description: str
    budget_type: str = "fixed"
    budget_min: float | None = None
    budget_max: float | None = None
    duration_days: int | None = None
    required_skills: list[str] | None = None
    experience_level: str = "mid"
    scope: str = "project"


class ApplyBody(BaseModel):
    cover_letter: str | None = None
    proposed_rate: float | None = None
    proposed_duration_days: int | None = None


class CreateContractBody(BaseModel):
    project_id: int
    freelancer_id: int
    rate_type: str = "fixed"
    rate_amount: float
    estimated_hours: int | None = None
    milestones: list[dict] | None = None


class MilestoneStatusBody(BaseModel):
    status: str  # submitted, approved, paid, disputed


# ─── Projects ─────────────────────────────────────

@router.post("/projects", status_code=201)
def new_project(
    body: CreateProjectBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a new freelance project."""
    try:
        return create_project(client_id=user["id"], conn=db, **body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects")
def browse_projects(
    status: str = Query("open"),
    experience_level: str | None = Query(None),
    budget_min: float | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: sqlite3.Connection = Depends(get_db),
):
    """Browse freelance projects."""
    return list_projects(status, budget_min=budget_min, experience_level=experience_level, page=page, per_page=per_page, conn=db)


@router.get("/projects/{project_id}")
def view_project(
    project_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a specific project."""
    try:
        return get_project(project_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Applications ─────────────────────────────────

@router.post("/projects/{project_id}/apply", status_code=201)
def apply(
    project_id: int,
    body: ApplyBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Apply to a freelance project."""
    try:
        return apply_to_project(
            project_id, user["id"],
            cover_letter=body.cover_letter,
            proposed_rate=body.proposed_rate,
            proposed_duration_days=body.proposed_duration_days,
            conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/applications")
def view_applications(
    project_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """View applications for a project (client only)."""
    try:
        return {"applications": get_project_applications(project_id, user["id"], db)}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ─── Contracts ────────────────────────────────────

@router.post("/contracts", status_code=201)
def new_contract(
    body: CreateContractBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a freelance contract (client initiates)."""
    try:
        return create_contract(
            body.project_id, body.freelancer_id, user["id"],
            body.rate_type, body.rate_amount, body.estimated_hours,
            body.milestones, db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/contracts")
def my_contracts(
    role: str = Query("any", regex="^(any|freelancer|client)$"),
    status: str | None = Query(None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get your contracts (as freelancer or client)."""
    return {"contracts": get_user_contracts(user["id"], role, status, db)}


@router.get("/contracts/{contract_id}")
def view_contract(
    contract_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """View a specific contract."""
    try:
        contract = get_contract(contract_id, db)
        if contract["freelancer_id"] != user["id"] and contract["client_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your contract")
        return contract
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Milestones ───────────────────────────────────

@router.put("/milestones/{milestone_id}/status")
def update_milestone(
    milestone_id: int,
    body: MilestoneStatusBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update milestone status (submit, approve, pay, dispute)."""
    try:
        return update_milestone_status(milestone_id, body.status, user["id"], db)
    except (ValueError, PermissionError) as e:
        status_code = 403 if isinstance(e, PermissionError) else 400
        raise HTTPException(status_code=status_code, detail=str(e))
