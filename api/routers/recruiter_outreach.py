"""Recruiter Outreach API — message generation and tracking."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db, get_current_user
from api.models.recruiter import (
    OutreachRequest,
    OutreachResponse,
    OutreachStatusUpdate,
    OutreachStats,
)
from api.services.recruiter_outreach import (
    generate_outreach,
    update_outreach_status,
    get_outreach_stats,
)

router = APIRouter()


def _require_recruiter(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required")
    return user


@router.post("/outreach/generate", response_model=OutreachResponse)
def create_outreach(
    body: OutreachRequest,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate a personalized outreach message for a candidate."""
    try:
        result = generate_outreach(
            recruiter_id=user["id"],
            candidate_id=body.candidate_id,
            search_id=body.search_id,
            channel=body.channel,
            tone=body.tone,
            custom_notes=body.custom_notes,
            conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get("/outreach", response_model=list[OutreachResponse])
def list_outreach(
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all outreach messages for the recruiter."""
    rows = db.execute(
        """SELECT outreach_id, candidate_id, subject, body,
                  sequence_number, channel, tone, status, created_at
           FROM recruiter_outreach WHERE recruiter_id = ?
           ORDER BY created_at DESC""",
        (user["id"],),
    ).fetchall()
    return [dict(r) for r in rows]


@router.put("/outreach/{outreach_id}/status", response_model=OutreachResponse)
def change_status(
    outreach_id: str,
    body: OutreachStatusUpdate,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update outreach status (sent, opened, replied)."""
    # Verify ownership
    row = db.execute(
        "SELECT recruiter_id FROM recruiter_outreach WHERE outreach_id = ?",
        (outreach_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Outreach message not found")
    if dict(row)["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your outreach")

    result = update_outreach_status(outreach_id, body.status, db)
    return {
        "outreach_id": result.get("outreach_id", outreach_id),
        "candidate_id": result.get("candidate_id", ""),
        "subject": result.get("subject"),
        "body": result.get("body", ""),
        "sequence_number": result.get("sequence_number", 1),
        "channel": result.get("channel", "email"),
        "tone": result.get("tone", "professional"),
        "status": result.get("status", body.status),
        "created_at": result.get("created_at"),
    }


@router.get("/outreach/stats", response_model=OutreachStats)
def outreach_stats(
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get outreach analytics (response rates, etc.)."""
    return get_outreach_stats(user["id"], db)
