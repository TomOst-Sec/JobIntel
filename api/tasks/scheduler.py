"""APScheduler setup for background jobs — grouped scraper schedule."""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start_scheduler():
    """Start the background scheduler with all configured jobs."""
    global _scheduler
    _scheduler = BackgroundScheduler()

    # === Scraper groups ===

    # Fast scrapers: every 2 hours (RemoteOK, Jobicy, Remotive)
    _scheduler.add_job(
        _run_fast_scrapers,
        trigger=IntervalTrigger(hours=2),
        id="fast_scrapers",
        name="Fast API scrapers (2h)",
        replace_existing=True,
    )

    # Standard scrapers: every 4 hours (Arbeitnow, TheMuse, USAJobs, Reed, Adzuna)
    _scheduler.add_job(
        _run_standard_scrapers,
        trigger=IntervalTrigger(hours=4),
        id="standard_scrapers",
        name="Standard API scrapers (4h)",
        replace_existing=True,
    )

    # Board scrapers: every 6 hours (Greenhouse, Lever)
    _scheduler.add_job(
        _run_board_scrapers,
        trigger=IntervalTrigger(hours=6),
        id="board_scrapers",
        name="Board scrapers (6h)",
        replace_existing=True,
    )

    # Ashby ATS: every 6 hours
    _scheduler.add_job(
        _run_ashby_scraper,
        trigger=IntervalTrigger(hours=6),
        id="ashby_scraper",
        name="Ashby ATS scraper (6h)",
        replace_existing=True,
    )

    # HN Who's Hiring: daily at 2am UTC
    _scheduler.add_job(
        _run_hn_scraper,
        trigger=CronTrigger(hour=2, minute=0),
        id="hn_scraper",
        name="HN Who's Hiring (daily)",
        replace_existing=True,
    )

    # JSearch: daily at 6am UTC
    _scheduler.add_job(
        _run_jsearch,
        trigger=CronTrigger(hour=6, minute=0),
        id="jsearch_daily",
        name="JSearch daily scrape",
        replace_existing=True,
    )

    # === Lifecycle & maintenance ===

    # Lifecycle maintenance: every 4 hours (offset 1h from standard scrapers)
    _scheduler.add_job(
        _run_lifecycle_maintenance,
        trigger=IntervalTrigger(hours=4, minutes=0),
        id="lifecycle_maintenance",
        name="Lifecycle maintenance (4h)",
        replace_existing=True,
    )

    # Alert evaluation: every 30 minutes
    _scheduler.add_job(
        _run_alert_evaluation,
        trigger=IntervalTrigger(minutes=30),
        id="alert_evaluation",
        name="Evaluate alerts",
        replace_existing=True,
    )

    # Weekly reports: Monday 7am UTC
    _scheduler.add_job(
        _run_weekly_reports,
        trigger=CronTrigger(day_of_week="mon", hour=7, minute=0),
        id="weekly_reports",
        name="Generate weekly reports",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("Background scheduler started with %d jobs", len(_scheduler.get_jobs()))


def shutdown_scheduler():
    """Shut down the scheduler gracefully."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("Background scheduler shut down")


def get_scheduler() -> BackgroundScheduler | None:
    """Return the scheduler instance (for admin triggering)."""
    return _scheduler


# === Lazy-import wrappers ===

def _run_fast_scrapers():
    from api.tasks.scrape_jobs import run_fast_scrapers
    run_fast_scrapers()


def _run_standard_scrapers():
    from api.tasks.scrape_jobs import run_standard_scrapers
    run_standard_scrapers()


def _run_board_scrapers():
    from api.tasks.scrape_jobs import run_board_scrapers
    run_board_scrapers()


def _run_ashby_scraper():
    from api.tasks.scrape_jobs import run_ashby_scraper
    run_ashby_scraper()


def _run_hn_scraper():
    from api.tasks.scrape_jobs import run_hn_scraper
    run_hn_scraper()


def _run_jsearch():
    from api.tasks.scrape_jobs import run_jsearch
    run_jsearch()


def _run_lifecycle_maintenance():
    from api.tasks.lifecycle import run_lifecycle_maintenance
    run_lifecycle_maintenance()


def _run_alert_evaluation():
    from api.tasks.evaluate_alerts import evaluate_all_alerts
    evaluate_all_alerts()


def _run_weekly_reports():
    from api.tasks.generate_reports import generate_weekly_reports
    generate_weekly_reports()
