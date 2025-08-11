"""Negotiation coach API routes."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db, get_current_user
from api.models.intelligence import (
    NegotiationStartRequest, NegotiationMessageRequest,
    NegotiationSessionResponse, NegotiationListItem,
)
from api.services.intelligence.negotiation_coach import (
    start_negotiation_session, continue_negotiation,
    get_negotiation_sessions, get_session_detail,
)

router = APIRouter()


@router.post("", response_model=NegotiationSessionResponse, status_code=201)
def start_session(
    body: NegotiationStartRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Start a new negotiation coaching session."""
    result = start_negotiation_session(
        user_id=user["id"],
        job_title=body.job_title,
        company=body.company,
        offered_salary=body.offered_salary,
        offered_equity=body.offered_equity,
        location=body.location,
        db=db,
    )
    return result


@router.post("/{session_id}/message", response_model=NegotiationSessionResponse)
def send_message(
    session_id: int,
    body: NegotiationMessageRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Continue a negotiation coaching conversation."""
    try:
        return continue_negotiation(session_id, user["id"], body.message, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("", response_model=list[NegotiationListItem])
def list_sessions(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all negotiation sessions."""
    return get_negotiation_sessions(user["id"], db)


@router.get("/{session_id}")
def get_session(
    session_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get full session detail with all messages."""
    try:
        return get_session_detail(session_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
