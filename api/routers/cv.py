"""CV upload and analysis endpoints."""
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from api.dependencies import get_db, get_current_user
from api.config import get_settings
from api.models.cv import CVUploadResponse, CVAnalysis
from api.services.cv_service import save_upload, analyze_cv

router = APIRouter()


@router.post("/upload", response_model=CVUploadResponse, status_code=201)
async def upload_cv(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Upload a CV (PDF or DOCX)."""
    settings = get_settings()
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    content = await file.read()
    if len(content) > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

    cv = save_upload(user["id"], file.filename, content, db)
    return cv


@router.post("/analyze/{cv_id}", response_model=CVAnalysis)
def run_analysis(
    cv_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Trigger AI analysis on an uploaded CV."""
    try:
        return analyze_cv(cv_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/analysis/{cv_id}", response_model=list[CVAnalysis])
def get_analyses(
    cv_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get all analyses for a CV."""
    rows = db.execute(
        "SELECT * FROM cv_analyses WHERE cv_id = ? AND user_id = ? ORDER BY created_at DESC",
        (cv_id, user["id"]),
    ).fetchall()
    results = []
    for row in rows:
        d = dict(row)
        d["skills_gap"] = json.loads(d["skills_gap"]) if d["skills_gap"] else []
        d["recommended_roles"] = json.loads(d["recommended_roles"]) if d["recommended_roles"] else []
        d["opportunity_map"] = json.loads(d["opportunity_map"]) if d["opportunity_map"] else {}
        results.append(d)
    return results


@router.get("/uploads", response_model=list[CVUploadResponse])
def list_uploads(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all CV uploads for the current user."""
    rows = db.execute(
        "SELECT id, filename, file_size, created_at FROM cv_uploads WHERE user_id = ? ORDER BY created_at DESC",
        (user["id"],),
    ).fetchall()
    return [dict(r) for r in rows]
