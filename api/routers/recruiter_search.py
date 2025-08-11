"""Recruiter Search API — AI-powered candidate search."""
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user
from api.models.recruiter import (
    SearchRequest,
    SearchResponse,
    RefineRequest,
    ChatMessageResponse,
    SearchListItem,
)
from api.services.recruiter_search import search_candidates, refine_search
from api.services.candidate_seed import seed_candidates

router = APIRouter()


def _require_recruiter(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Recruiter access required")
    return user


@router.post("/search", response_model=SearchResponse)
def create_search(
    body: SearchRequest,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Start a new AI-powered candidate search from a natural language brief."""
    # Auto-seed candidates if table is empty
    count = db.execute("SELECT COUNT(*) FROM candidates").fetchone()[0]
    if count == 0:
        seed_candidates(db)

    result = search_candidates(user["id"], body.brief, db)
    return result


@router.post("/search/{search_id}/refine", response_model=SearchResponse)
def refine(
    search_id: str,
    body: RefineRequest,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Refine an existing search with a follow-up message."""
    # Verify ownership
    row = db.execute(
        "SELECT recruiter_id FROM recruiter_searches WHERE search_id = ?",
        (search_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Search not found")
    if dict(row)["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your search")

    try:
        result = refine_search(search_id, body.message, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.get("/search/{search_id}", response_model=SearchResponse)
def get_search(
    search_id: str,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a search with its results."""
    row = db.execute(
        "SELECT * FROM recruiter_searches WHERE search_id = ? AND recruiter_id = ?",
        (search_id, user["id"]),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Search not found")

    search = dict(row)
    parsed = json.loads(search.get("parsed_brief") or "{}")

    # Load results
    results = db.execute(
        """SELECT rsr.*, c.* FROM recruiter_search_results rsr
           JOIN candidates c ON rsr.candidate_id = c.candidate_id
           WHERE rsr.search_id = ?
           ORDER BY rsr.match_score DESC""",
        (search_id,),
    ).fetchall()

    candidates = []
    for r in results:
        rd = dict(r)
        try:
            skills = json.loads(rd.get("skills") or "[]")
        except (json.JSONDecodeError, TypeError):
            skills = []
        try:
            breakdown = json.loads(rd.get("score_breakdown") or "{}")
        except (json.JSONDecodeError, TypeError):
            breakdown = {}

        candidates.append({
            "candidate": {
                "candidate_id": rd["candidate_id"],
                "full_name": rd["full_name"],
                "headline": rd.get("headline"),
                "skills": skills,
                "experience_years": rd.get("experience_years"),
                "current_company": rd.get("current_company"),
                "current_title": rd.get("current_title"),
                "location": rd.get("location"),
                "country": rd.get("country"),
                "is_remote_ok": bool(rd.get("is_remote_ok", 1)),
                "salary_min": rd.get("salary_min"),
                "salary_max": rd.get("salary_max"),
                "availability": rd.get("availability", "active"),
                "summary": rd.get("summary"),
                "email": rd.get("email"),
            },
            "match_score": rd["match_score"],
            "score_breakdown": breakdown,
            "explanation": rd.get("match_explanation"),
        })

    return {
        "search_id": search_id,
        "candidates": candidates,
        "clarifying_questions": None,
        "parsed_brief": parsed,
    }


@router.get("/searches", response_model=list[SearchListItem])
def list_searches(
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all of the recruiter's searches."""
    rows = db.execute(
        """SELECT search_id, brief, status, created_at, updated_at
           FROM recruiter_searches WHERE recruiter_id = ?
           ORDER BY updated_at DESC""",
        (user["id"],),
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/search/{search_id}/messages", response_model=list[ChatMessageResponse])
def get_messages(
    search_id: str,
    user: dict = Depends(_require_recruiter),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get conversation history for a search."""
    # Verify ownership
    row = db.execute(
        "SELECT recruiter_id FROM recruiter_searches WHERE search_id = ?",
        (search_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Search not found")
    if dict(row)["recruiter_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your search")

    rows = db.execute(
        """SELECT role, content, metadata, created_at
           FROM recruiter_chat_messages WHERE search_id = ?
           ORDER BY created_at""",
        (search_id,),
    ).fetchall()

    messages = []
    for r in rows:
        rd = dict(r)
        try:
            metadata = json.loads(rd.get("metadata") or "null")
        except (json.JSONDecodeError, TypeError):
            metadata = None
        messages.append({
            "role": rd["role"],
            "content": rd["content"],
            "metadata": metadata,
            "created_at": rd.get("created_at"),
        })
    return messages
