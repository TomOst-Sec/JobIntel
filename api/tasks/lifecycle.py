"""Background lifecycle maintenance task."""
import logging

from api.db.connection import get_db_connection
from api.services.lifecycle import JobLifecycleManager

logger = logging.getLogger(__name__)


def run_lifecycle_maintenance():
    """Run all lifecycle checks in sequence."""
    logger.info("Starting lifecycle maintenance")
    conn = get_db_connection()

    try:
        mgr = JobLifecycleManager(conn)

        # 1. URL liveness checks
        url_results = mgr.check_url_liveness(batch=100)
        logger.info("URL liveness: %s", url_results)

        # 2. ATS liveness (Greenhouse/Lever)
        ats_results = mgr.check_ats_liveness(batch=100)
        logger.info("ATS liveness: %s", ats_results)

        # 3. Batch staleness scoring
        stale_results = mgr.batch_staleness_scoring(limit=500)
        logger.info("Staleness scoring: %s", stale_results)

        # 4. Repost detection
        repost_results = mgr.detect_reposts()
        logger.info("Repost detection: %s", repost_results)

        # 5. Auto-archive old jobs
        archive_results = mgr.auto_archive(days=90)
        logger.info("Auto-archive: %s", archive_results)

        logger.info("Lifecycle maintenance complete")
    except Exception as e:
        logger.error("Lifecycle maintenance failed: %s", e)
    finally:
        conn.close()
