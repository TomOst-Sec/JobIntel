"""Company Reviews API — verified, attributed-but-protected reviews."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user, get_optional_user
from api.services.company_reviews import (
    create_review, get_review, get_company_reviews,
    add_employer_response, vote_review, get_review_summary_for_company,
)

router = APIRouter()


class CreateReviewBody(BaseModel):
    company_name: str
    title: str
    pros: str | None = None
    cons: str | None = None
    advice_to_management: str | None = None
    employment_role: str | None = None
    employment_start: str | None = None
    employment_end: str | None = None
    is_current_employee: bool = False
    engineering_culture: float | None = None
    management_quality: float | None = None
    compensation_fairness: float | None = None
    work_life_balance: float | None = None
    growth_trajectory: float | None = None
    interview_quality: float | None = None


class EmployerResponseBody(BaseModel):
    response_text: str


class VoteBody(BaseModel):
    vote_type: str = "helpful"  # helpful | unhelpful


# ─── Reviews ──────────────────────────────────────

@router.post("", status_code=201)
def new_review(
    body: CreateReviewBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a new company review."""
    try:
        return create_review(
            author_id=user["id"],
            conn=db,
            **body.model_dump(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{review_id}")
def view_review(
    review_id: int,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a single review."""
    try:
        return get_review(review_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/company/{company_name}")
def company_reviews(
    company_name: str,
    sort_by: str = Query("recent", regex="^(recent|highest|lowest|helpful)$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all reviews for a company with aggregated stats."""
    return get_company_reviews(company_name, sort_by, page, per_page, db)


@router.get("/company/{company_name}/summary")
def company_review_summary(
    company_name: str,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get aggregated review summary for a company (public, anonymous)."""
    return get_review_summary_for_company(company_name, db)


# ─── Employer Response ────────────────────────────

@router.post("/{review_id}/respond")
def employer_respond(
    review_id: int,
    body: EmployerResponseBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Add employer response to a review. Employers can respond but NOT remove."""
    return add_employer_response(review_id, body.response_text, db)


# ─── Votes ────────────────────────────────────────

@router.post("/{review_id}/vote")
def vote_on_review(
    review_id: int,
    body: VoteBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Vote a review as helpful or unhelpful."""
    if body.vote_type not in ("helpful", "unhelpful"):
        raise HTTPException(status_code=400, detail="vote_type must be 'helpful' or 'unhelpful'")
    return vote_review(review_id, user["id"], body.vote_type, db)
