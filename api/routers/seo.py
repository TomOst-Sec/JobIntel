"""SEO API routes — programmatic pages, structured data, sitemap."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query

from api.dependencies import get_db, get_current_user, require_admin
from api.services.seo_service import (
    generate_job_structured_data,
    generate_seo_page,
    batch_generate_seo_pages,
    get_seo_page,
    get_seo_stats,
    generate_sitemap_data,
)
from api.services.translation_service import (
    translate_job,
    batch_translate,
    get_translation_stats,
    detect_language,
)

router = APIRouter()


# --- SEO Pages ---

@router.get("/seo/page/{slug:path}")
def seo_page(
    slug: str,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a programmatic SEO page by slug."""
    page = get_seo_page(slug, db)
    if not page:
        raise HTTPException(status_code=404, detail="SEO page not found")
    return page


@router.post("/seo/generate")
def generate_page(
    page_type: str = Query(..., description="job_role_location or salary_role_location"),
    role: str | None = Query(default=None),
    location: str | None = Query(default=None),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Generate or refresh a programmatic SEO page."""
    return generate_seo_page(page_type, role, location, db)


@router.post("/seo/batch-generate")
def batch_generate(
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Batch-generate SEO pages for popular role/location combinations."""
    return batch_generate_seo_pages(db)


@router.get("/seo/stats")
def seo_stats(
    db: sqlite3.Connection = Depends(get_db),
):
    """Get SEO page generation statistics."""
    return get_seo_stats(db)


@router.get("/seo/sitemap")
def sitemap(
    db: sqlite3.Connection = Depends(get_db),
):
    """Get sitemap data for all generated SEO pages."""
    return generate_sitemap_data(db)


# --- Structured Data ---

@router.get("/seo/structured-data/{job_id}")
def job_structured_data(
    job_id: str,
    db: sqlite3.Connection = Depends(get_db),
):
    """Get Google Jobs JSON-LD structured data for a job."""
    row = db.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return generate_job_structured_data(dict(row))


# --- Translation ---

@router.post("/translate/{job_id}")
def translate_single(
    job_id: str,
    use_ai: bool = Query(default=True),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Translate a non-English job posting to English."""
    row = db.execute(
        "SELECT job_id, title, description, required_skills FROM jobs WHERE job_id = ?",
        (job_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    j = dict(row)
    skills = [s.strip() for s in (j.get("required_skills") or "").split(",") if s.strip()]
    result = translate_job(
        j["job_id"], j["title"], j.get("description", ""),
        None, skills, None, db, use_ai=use_ai,
    )
    return result


@router.post("/translate/batch")
def translate_batch(
    limit: int = Query(default=50, le=200),
    use_ai: bool = Query(default=True),
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Batch-translate untranslated non-English jobs."""
    return batch_translate(db, limit=limit, use_ai=use_ai)


@router.get("/translate/detect-language")
def detect_lang(
    text: str = Query(..., description="Text to detect language for"),
):
    """Detect the language of a text snippet."""
    lang = detect_language(text)
    return {"text_preview": text[:100], "detected_language": lang}


@router.get("/translate/stats")
def translation_stats(
    db: sqlite3.Connection = Depends(get_db),
):
    """Get translation statistics."""
    return get_translation_stats(db)
