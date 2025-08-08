"""Admin scraper control — run-all, stats, recent runs."""
import sqlite3
import threading
import logging

from fastapi import APIRouter, Depends

from api.dependencies import get_db, require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

SCRAPER_GROUPS = [
    ("fast_scrapers", "api.tasks.scrape_jobs:run_fast_scrapers"),
    ("standard_scrapers", "api.tasks.scrape_jobs:run_standard_scrapers"),
    ("board_scrapers", "api.tasks.scrape_jobs:run_board_scrapers"),
    ("ashby_scraper", "api.tasks.scrape_jobs:run_ashby_scraper"),
    ("hn_scraper", "api.tasks.scrape_jobs:run_hn_scraper"),
    ("jsearch_daily", "api.tasks.scrape_jobs:run_jsearch"),
]


def _run_in_thread(module_path: str, func_name: str, group: str):
    import importlib
    mod = importlib.import_module(module_path)
    fn = getattr(mod, func_name)
    try:
        fn()
    except Exception as e:
        logger.error("Manual trigger %s failed: %s", group, e)


@router.post("/scrapers/run-all")
def run_all_scrapers(user: dict = Depends(require_admin)):
    """Trigger all scraper groups in background threads."""
    for group, path in SCRAPER_GROUPS:
        module_path, func_name = path.split(":")
        thread = threading.Thread(
            target=_run_in_thread,
            args=(module_path, func_name, group),
            daemon=True,
            name=f"manual-{group}",
        )
        thread.start()
    return {"message": f"Triggered {len(SCRAPER_GROUPS)} scraper groups", "groups": [g for g, _ in SCRAPER_GROUPS]}


@router.get("/scrapers/status")
def get_recent_runs(
    limit: int = 50,
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Return recent scraper_runs with counts, status, errors."""
    rows = db.execute("""
        SELECT id, source, status, jobs_found, jobs_inserted, jobs_updated,
               error_message, finished_at
        FROM scraper_runs
        ORDER BY finished_at DESC
        LIMIT ?
    """, (limit,)).fetchall()
    return [dict(r) for r in rows]


@router.get("/scrapers/stats")
def get_scraper_stats(
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Aggregate stats: total jobs, by source, by category, recent additions."""
    total = db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]

    by_source = db.execute("""
        SELECT source, COUNT(*) as count
        FROM jobs GROUP BY source ORDER BY count DESC
    """).fetchall()

    by_category = db.execute("""
        SELECT search_category, COUNT(*) as count
        FROM jobs GROUP BY search_category ORDER BY count DESC
    """).fetchall()

    last_24h = db.execute("""
        SELECT COUNT(*) FROM jobs
        WHERE scraped_at >= datetime('now', '-1 day')
    """).fetchone()[0]

    last_7d = db.execute("""
        SELECT COUNT(*) FROM jobs
        WHERE scraped_at >= datetime('now', '-7 days')
    """).fetchone()[0]

    last_30d = db.execute("""
        SELECT COUNT(*) FROM jobs
        WHERE scraped_at >= datetime('now', '-30 days')
    """).fetchone()[0]

    return {
        "total_jobs": total,
        "by_source": [dict(r) for r in by_source],
        "by_category": [dict(r) for r in by_category],
        "added_last_24h": last_24h,
        "added_last_7d": last_7d,
        "added_last_30d": last_30d,
    }
