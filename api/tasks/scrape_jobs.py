"""Background scraping tasks wrapping existing scrapers."""
import logging
import sys
import os

# Ensure project root is on path so we can import src
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from api.db.connection import get_db_connection

logger = logging.getLogger(__name__)


def _log_scraper_run(conn, source: str, status: str, found: int = 0, inserted: int = 0, updated: int = 0, error: str = None):
    """Record a scraper run in the tracking table and update scraper_configs."""
    try:
        conn.execute("""
            INSERT INTO scraper_runs (source, status, jobs_found, jobs_inserted, jobs_updated, error_message, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """, (source, status, found, inserted, updated, error))
        conn.execute("""
            UPDATE scraper_configs
            SET last_run_at = datetime('now'), last_status = ?, last_jobs_found = ?, updated_at = datetime('now')
            WHERE scraper_name = ?
        """, (status, found, source))
        conn.commit()
    except Exception:
        pass  # Don't fail the scraper over tracking


def _run_scraper_list(scraper_pairs: list[tuple], group_name: str):
    """Generic runner for a list of (name, scraper_instance) pairs."""
    from src.database import JobDatabase

    logger.info("Starting %s run", group_name)
    db = JobDatabase()
    conn = get_db_connection()

    for name, scraper in scraper_pairs:
        try:
            jobs = scraper.collect_all()
            if jobs:
                inserted, updated, deduped = db.upsert_jobs(jobs)
                _log_scraper_run(conn, name, "success", len(jobs), inserted, updated)
                logger.info("%s: %d found, %d new, %d updated, %d deduped", name, len(jobs), inserted, updated, deduped)
            else:
                _log_scraper_run(conn, name, "success", 0, 0, 0)
        except Exception as e:
            _log_scraper_run(conn, name, "failed", error=str(e))
            logger.error("%s scraper failed: %s", name, e)

    conn.close()
    db.close()


def run_free_scrapers():
    """Run original free scrapers (backwards-compatible entry point)."""
    from src.free_scraper import RemoteOKScraper, ArbeitnowScraper, USAJobsScraper

    _run_scraper_list([
        ("RemoteOK", RemoteOKScraper()),
        ("Arbeitnow", ArbeitnowScraper()),
        ("USAJobs", USAJobsScraper()),
    ], "free_scrapers")


def run_fast_scrapers():
    """Run fast-cycle scrapers: RemoteOK, Jobicy, Remotive."""
    from src.free_scraper import RemoteOKScraper
    from src.scrapers.simple_api_scrapers import JobicyScraper, RemotiveScraper

    _run_scraper_list([
        ("RemoteOK", RemoteOKScraper()),
        ("Jobicy", JobicyScraper()),
        ("Remotive", RemotiveScraper()),
    ], "fast_scrapers")


def run_standard_scrapers():
    """Run standard-cycle scrapers: Arbeitnow, TheMuse, USAJobs, Reed, Adzuna."""
    from src.free_scraper import ArbeitnowScraper, USAJobsScraper, ReedScraper, AdzunaScraper
    from src.scrapers.simple_api_scrapers import TheMuseScraper
    from api.config import get_settings

    settings = get_settings()

    _run_scraper_list([
        ("Arbeitnow", ArbeitnowScraper()),
        ("TheMuse", TheMuseScraper(api_key=settings.themuse_api_key)),
        ("USAJobs", USAJobsScraper(
            api_key=settings.usajobs_api_key,
            email=settings.usajobs_email,
        )),
        ("Reed", ReedScraper(api_key=settings.reed_api_key)),
        ("Adzuna", AdzunaScraper(app_id=settings.adzuna_app_id, app_key=settings.adzuna_app_key)),
    ], "standard_scrapers")


def run_board_scrapers():
    """Run board scrapers: Greenhouse, Lever."""
    from src.scrapers.board_scrapers import GreenhouseScraper, LeverScraper

    _run_scraper_list([
        ("Greenhouse", GreenhouseScraper()),
        ("Lever", LeverScraper()),
    ], "board_scrapers")


def run_ashby_scraper():
    """Run Ashby ATS scraper."""
    from src.scrapers.ashby_scraper import AshbyScraper

    _run_scraper_list([
        ("Ashby", AshbyScraper()),
    ], "ashby_scraper")


def run_hn_scraper():
    """Run HN Who's Hiring scraper."""
    from src.scrapers.board_scrapers import HNWhoIsHiringScraper

    _run_scraper_list([
        ("HNWhoIsHiring", HNWhoIsHiringScraper()),
    ], "hn_scraper")


def run_jsearch():
    """Run the JSearch API scraper."""
    from src.scraper import JobScraper
    from src.database import JobDatabase

    logger.info("Starting JSearch scrape")
    conn = get_db_connection()

    try:
        scraper = JobScraper()
        db = JobDatabase()
        all_jobs = scraper.collect_all(date_posted="today")
        if all_jobs:
            inserted, updated, deduped = db.upsert_jobs(all_jobs)
            _log_scraper_run(conn, "JSearch", "success", len(all_jobs), inserted, updated)
            logger.info("JSearch: %d found, %d new, %d updated, %d deduped", len(all_jobs), inserted, updated, deduped)
        else:
            _log_scraper_run(conn, "JSearch", "success", 0, 0, 0)
        db.close()
    except Exception as e:
        _log_scraper_run(conn, "JSearch", "failed", error=str(e))
        logger.error("JSearch scraper failed: %s", e)
    finally:
        conn.close()
