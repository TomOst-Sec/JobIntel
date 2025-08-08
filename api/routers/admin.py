"""Admin endpoints — scraper status, lifecycle stats, manual triggers."""
import sqlite3
import threading
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db, require_admin
from api.models.admin import ScraperStatus, LifecycleStats, ScraperTriggerResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/scrapers/status", response_model=list[ScraperStatus])
def get_scraper_status(
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Per-scraper health: last run, status, jobs found."""
    rows = db.execute("""
        SELECT scraper_name, is_enabled, interval_hours, schedule_group,
               last_run_at, last_status, last_jobs_found
        FROM scraper_configs
        ORDER BY schedule_group, scraper_name
    """).fetchall()
    return [dict(r) for r in rows]


@router.get("/jobs/lifecycle-stats", response_model=LifecycleStats)
def get_lifecycle_stats(
    user: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """Breakdown of jobs by lifecycle status."""
    rows = db.execute("""
        SELECT COALESCE(status, 'ACTIVE') as status, COUNT(*) as count
        FROM jobs GROUP BY status
    """).fetchall()

    stats = {"active": 0, "stale": 0, "expired": 0, "ghost": 0, "archived": 0, "total": 0}
    for row in rows:
        key = row["status"].lower()
        if key in stats:
            stats[key] = row["count"]
        stats["total"] += row["count"]

    return stats


@router.post("/scrapers/run/{group}", response_model=ScraperTriggerResponse)
def trigger_scraper_group(
    group: str,
    user: dict = Depends(require_admin),
):
    """Manually trigger a scraper group in a background thread."""
    runners = {
        "fast_scrapers": "api.tasks.scrape_jobs:run_fast_scrapers",
        "standard_scrapers": "api.tasks.scrape_jobs:run_standard_scrapers",
        "board_scrapers": "api.tasks.scrape_jobs:run_board_scrapers",
        "ashby_scraper": "api.tasks.scrape_jobs:run_ashby_scraper",
        "hn_scraper": "api.tasks.scrape_jobs:run_hn_scraper",
        "jsearch_daily": "api.tasks.scrape_jobs:run_jsearch",
        "lifecycle_maintenance": "api.tasks.lifecycle:run_lifecycle_maintenance",
    }

    if group not in runners:
        raise HTTPException(status_code=400, detail=f"Unknown group: {group}. Valid: {list(runners.keys())}")

    module_path, func_name = runners[group].split(":")

    def _run():
        import importlib
        mod = importlib.import_module(module_path)
        fn = getattr(mod, func_name)
        try:
            fn()
        except Exception as e:
            logger.error("Manual trigger %s failed: %s", group, e)

    thread = threading.Thread(target=_run, daemon=True, name=f"manual-{group}")
    thread.start()

    return {"message": f"Triggered {group} in background", "group": group}
