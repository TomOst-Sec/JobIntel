"""Career Graph & Interview Oracle endpoints."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.career_graph import (
    predict_trajectory, simulate_future_self, get_career_gaps,
    get_user_trajectories, generate_career_alert,
    get_notifications, mark_notification_read,
)
from api.services.interview_oracle import (
    prepare_for_interview, practice_question, get_prep,
    get_user_preps, submit_interview_report,
    get_company_interview_reports, get_practice_history,
)

router = APIRouter()


# ─── Request Models ─────────────────────────────────

class TrajectoryRequest(BaseModel):
    target_role: str
    target_company_type: str | None = None
    trajectory_type: str = "balanced"  # aggressive, balanced, conservative

class FutureSimRequest(BaseModel):
    years_ahead: int = 5

class GapRequest(BaseModel):
    target_role: str

class InterviewPrepRequest(BaseModel):
    company: str
    role: str
    interview_date: str | None = None
    job_id: str | None = None

class PracticeRequest(BaseModel):
    question: str
    user_answer: str

class InterviewReportRequest(BaseModel):
    company: str
    role: str
    interview_date: str | None = None
    rounds: int | None = None
    difficulty: float | None = None
    got_offer: bool = False
    questions: list[str] = []
    experience_notes: str | None = None
    tips: str | None = None
    is_anonymous: bool = True


# ─── Career Trajectory ──────────────────────────────

@router.post("/trajectory")
def create_trajectory(
    body: TrajectoryRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Predict career trajectory toward a target role."""
    if body.trajectory_type not in ("aggressive", "balanced", "conservative"):
        raise HTTPException(status_code=400, detail="Invalid trajectory type")
    try:
        return predict_trajectory(
            user["id"], body.target_role, body.target_company_type,
            body.trajectory_type, db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trajectories")
def list_trajectories(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all career trajectories."""
    return {"trajectories": get_user_trajectories(user["id"], db)}


@router.post("/future-self")
def future_self(
    body: FutureSimRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Simulate your future self (3 scenarios)."""
    try:
        return simulate_future_self(user["id"], body.years_ahead, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/gaps")
def career_gaps(
    body: GapRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Analyze career gaps for a target role."""
    try:
        return get_career_gaps(user["id"], body.target_role, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Career Alerts ──────────────────────────────────

@router.post("/alerts/generate")
def generate_alerts(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate career alerts based on market changes."""
    return generate_career_alert(user["id"], db)


# ─── Notifications ──────────────────────────────────

@router.get("/notifications")
def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get notifications."""
    return {"notifications": get_notifications(user["id"], unread_only, db, limit)}


@router.put("/notifications/{notification_id}/read")
def read_notification(
    notification_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Mark a notification as read."""
    try:
        return mark_notification_read(notification_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/notifications/read-all")
def read_all_notifications(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Mark all notifications as read."""
    db.execute(
        "UPDATE notification_queue SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
        (user["id"],),
    )
    db.commit()
    return {"marked_read": True}


# ─── Interview Prep ─────────────────────────────────

@router.post("/interview/prep")
def create_prep(
    body: InterviewPrepRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create interview preparation package."""
    try:
        return prepare_for_interview(
            user["id"], body.company, body.role,
            body.interview_date, body.job_id, db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/interview/preps")
def list_preps(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all interview preps."""
    return {"preps": get_user_preps(user["id"], db)}


@router.get("/interview/prep/{prep_id}")
def get_prep_detail(
    prep_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get interview prep with full details."""
    result = get_prep(user["id"], prep_id, db)
    if not result:
        raise HTTPException(status_code=404, detail="Prep not found")
    return result


@router.post("/interview/practice/{prep_id}")
def practice(
    prep_id: int,
    body: PracticeRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Practice an interview question and get AI feedback."""
    try:
        return practice_question(user["id"], prep_id, body.question, body.user_answer, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/interview/practice/{prep_id}/history")
def practice_hist(
    prep_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get practice history for a prep."""
    return {"sessions": get_practice_history(user["id"], prep_id, db)}


# ─── Community Interview Reports ────────────────────

@router.post("/interview/report")
def submit_report(
    body: InterviewReportRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Submit an interview experience report."""
    return submit_interview_report(
        user["id"], body.company, body.role, body.interview_date,
        body.rounds, body.difficulty, body.got_offer,
        body.questions, body.experience_notes, body.tips,
        body.is_anonymous, db,
    )


@router.get("/interview/reports/{company}")
def company_reports(
    company: str,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get community interview reports for a company."""
    return get_company_interview_reports(company, db)
