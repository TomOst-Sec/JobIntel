"""CV Intelligence endpoints: parsing, enrichment, tailoring, cover letters, matching, applications."""
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.cv_intelligence import (
    parse_cv, get_cv_dna, enrich_cv, tailor_cv, get_tailored_cv,
    get_user_tailored_cvs, generate_cover_letter, get_user_cover_letters,
    score_job_match, track_application, update_application_status,
    get_applications, get_application_stats,
)

router = APIRouter()


# ─── Request Models ─────────────────────────────────

class TailorRequest(BaseModel):
    job_id: str
    tailoring_level: str = "standard"  # quick, standard, full, max

class CoverLetterRequest(BaseModel):
    job_id: str
    tone: str = "professional"  # professional, casual, technical, startup
    tailored_id: int | None = None

class TrackApplicationRequest(BaseModel):
    job_id: str | None = None
    company: str
    title: str
    location: str | None = None
    applied_via: str = "manual"
    cv_tailored_id: int | None = None
    cover_letter_id: int | None = None
    match_score: float | None = None
    ghost_score: float | None = None

class UpdateStatusRequest(BaseModel):
    status: str
    notes: str | None = None


# ─── CV Upload & Parse ──────────────────────────────

@router.post("/upload")
async def upload_cv(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Upload and parse a CV file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Determine file type
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "txt"
    if ext not in ("pdf", "docx", "txt", "doc"):
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    content = await file.read()

    # For MVP: extract text (in production, use proper PDF/DOCX parsers)
    try:
        raw_text = content.decode("utf-8", errors="ignore")
    except Exception:
        raw_text = str(content[:10000])

    # Save file
    import os
    from api.config import get_settings
    settings = get_settings()
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_path = os.path.join(settings.upload_dir, f"{user['id']}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)

    result = parse_cv(user["id"], raw_text, file_path, ext, db)
    return result


@router.post("/parse-text")
def parse_cv_text(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
    text: str = Form(...),
):
    """Parse CV from pasted text."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    return parse_cv(user["id"], text, None, "txt", db)


# ─── CV DNA ─────────────────────────────────────────

@router.get("/dna")
def get_my_cv_dna(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get current user's CV DNA."""
    cv = get_cv_dna(user["id"], db)
    if not cv:
        raise HTTPException(status_code=404, detail="No CV found. Upload a CV first.")
    return cv


@router.post("/enrich")
def enrich_my_cv(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Enrich CV with market intelligence."""
    try:
        return enrich_cv(user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── CV Tailoring ───────────────────────────────────

@router.post("/tailor")
def tailor_my_cv(
    body: TailorRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Tailor CV for a specific job (8-layer engine)."""
    if body.tailoring_level not in ("quick", "standard", "full", "max"):
        raise HTTPException(status_code=400, detail="Invalid tailoring level")
    try:
        return tailor_cv(user["id"], body.job_id, body.tailoring_level, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tailored")
def list_tailored_cvs(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all tailored CV versions."""
    return {"tailored_cvs": get_user_tailored_cvs(user["id"], db)}


@router.get("/tailored/{tailored_id}")
def get_tailored(
    tailored_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a specific tailored CV version."""
    cv = get_tailored_cv(tailored_id, user["id"], db)
    if not cv:
        raise HTTPException(status_code=404, detail="Tailored CV not found")
    return cv


# ─── Cover Letters ──────────────────────────────────

@router.post("/cover-letter")
def create_cover_letter(
    body: CoverLetterRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate a personalized cover letter."""
    try:
        return generate_cover_letter(
            user["id"], body.job_id, body.tone, db, body.tailored_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/cover-letters")
def list_cover_letters(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all cover letters."""
    return {"cover_letters": get_user_cover_letters(user["id"], db)}


# ─── Job Match Scoring ──────────────────────────────

@router.get("/match/{job_id}")
def get_match_score(
    job_id: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Score how well your CV matches a specific job."""
    try:
        return score_job_match(user["id"], job_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Application Tracker ────────────────────────────

@router.post("/applications")
def create_application(
    body: TrackApplicationRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Track a new job application."""
    return track_application(
        user["id"], body.job_id, body.company, body.title,
        body.location, body.applied_via, body.cv_tailored_id,
        body.cover_letter_id, body.match_score, body.ghost_score, db,
    )


@router.put("/applications/{app_id}")
def update_application(
    app_id: int,
    body: UpdateStatusRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Update application status."""
    try:
        return update_application_status(app_id, user["id"], body.status, body.notes, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/applications")
def list_applications(
    status: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List applications with optional status filter."""
    return {"applications": get_applications(user["id"], status, db)}


@router.get("/applications/stats")
def application_stats(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get application statistics."""
    return get_application_stats(user["id"], db)
