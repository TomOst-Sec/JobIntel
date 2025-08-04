"""Job lifecycle management — staleness scoring, liveness checks, archival."""
import logging
import sqlite3
import json
import requests
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


class JobLifecycleManager:
    """Manages job freshness: URL liveness, staleness scoring, status transitions."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.conn.row_factory = sqlite3.Row
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    # ------------------------------------------------------------------
    # URL liveness
    # ------------------------------------------------------------------

    def check_url_liveness(self, batch: int = 100) -> dict:
        """HEAD-request apply_link URLs for ACTIVE jobs.

        404/410 → EXPIRED, 200 → update last_confirmed_live.
        """
        rows = self.conn.execute("""
            SELECT job_id, apply_link FROM jobs
            WHERE status = 'ACTIVE' AND apply_link IS NOT NULL AND apply_link != ''
            ORDER BY last_confirmed_live ASC NULLS FIRST
            LIMIT ?
        """, (batch,)).fetchall()

        results = {"checked": 0, "live": 0, "expired": 0, "errors": 0}

        def _check(job_id: str, url: str):
            try:
                resp = self.session.head(url, timeout=10, allow_redirects=True)
                return job_id, resp.status_code
            except Exception:
                return job_id, -1

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_check, dict(r)["job_id"], dict(r)["apply_link"]): r for r in rows}
            for future in as_completed(futures):
                job_id, status_code = future.result()
                results["checked"] += 1
                if status_code in (404, 410, 403):
                    self._transition(job_id, "EXPIRED", f"URL returned {status_code}")
                    results["expired"] += 1
                elif 200 <= status_code < 400:
                    self.conn.execute(
                        "UPDATE jobs SET last_confirmed_live = datetime('now') WHERE job_id = ?",
                        (job_id,),
                    )
                    results["live"] += 1
                else:
                    results["errors"] += 1

        self.conn.commit()
        logger.info("URL liveness: %s", results)
        return results

    # ------------------------------------------------------------------
    # ATS liveness (Greenhouse/Lever)
    # ------------------------------------------------------------------

    def check_ats_liveness(self, batch: int = 100) -> dict:
        """For gh_/lev_ jobs, verify they still exist on the ATS API."""
        results = {"checked": 0, "expired": 0}

        # Greenhouse jobs
        gh_rows = self.conn.execute("""
            SELECT job_id FROM jobs
            WHERE status = 'ACTIVE' AND job_id LIKE 'gh_%'
            ORDER BY last_confirmed_live ASC NULLS FIRST
            LIMIT ?
        """, (batch,)).fetchall()

        for row in gh_rows:
            job_id = row["job_id"]
            gh_id = job_id[3:]  # strip 'gh_'
            try:
                resp = self.session.get(
                    f"https://boards-api.greenhouse.io/v1/boards/any/jobs/{gh_id}",
                    timeout=10,
                )
                results["checked"] += 1
                if resp.status_code == 404:
                    self._transition(job_id, "EXPIRED", "Removed from Greenhouse ATS")
                    results["expired"] += 1
                elif resp.status_code == 200:
                    self.conn.execute(
                        "UPDATE jobs SET last_confirmed_live = datetime('now') WHERE job_id = ?",
                        (job_id,),
                    )
            except Exception:
                pass

        self.conn.commit()
        logger.info("ATS liveness: %s", results)
        return results

    # ------------------------------------------------------------------
    # Staleness scoring
    # ------------------------------------------------------------------

    def compute_staleness(self, job_id: str) -> float:
        """Compute a staleness score 0-100 for a single job."""
        row = self.conn.execute("""
            SELECT last_confirmed_live, user_reports, repost_count, company
            FROM jobs WHERE job_id = ?
        """, (job_id,)).fetchone()

        if not row:
            return 0

        row = dict(row)
        score = 0.0

        # Days since last confirmed live
        last_live = row.get("last_confirmed_live")
        if last_live:
            try:
                last_dt = datetime.fromisoformat(last_live)
                days = (datetime.utcnow() - last_dt).days
            except (ValueError, TypeError):
                days = 60
        else:
            days = 60

        if days <= 7:
            score += 0
        elif days <= 14:
            score += 10
        elif days <= 30:
            score += 30
        elif days <= 60:
            score += 60
        else:
            score += 85

        # Repost detection (oldest version penalty)
        repost_count = row.get("repost_count") or 0
        if repost_count > 0:
            score += 40

        # User reports
        reports = row.get("user_reports") or 0
        score += min(reports * 15, 45)

        # Company contracting signal
        company = row.get("company", "")
        if company:
            trajectory = self.conn.execute(
                "SELECT trajectory FROM company_intel_cache WHERE company = ?",
                (company,),
            ).fetchone()
            if trajectory and trajectory["trajectory"] == "contracting":
                score += 10

        return min(score, 100)

    def batch_staleness_scoring(self, limit: int = 500) -> dict:
        """Score all ACTIVE jobs; >70 → STALE, >90 → EXPIRED."""
        rows = self.conn.execute("""
            SELECT job_id FROM jobs WHERE status = 'ACTIVE'
            ORDER BY stale_score DESC, last_confirmed_live ASC NULLS FIRST
            LIMIT ?
        """, (limit,)).fetchall()

        results = {"scored": 0, "stale": 0, "expired": 0}

        for row in rows:
            job_id = row["job_id"]
            score = self.compute_staleness(job_id)
            self.conn.execute(
                "UPDATE jobs SET stale_score = ? WHERE job_id = ?",
                (score, job_id),
            )
            results["scored"] += 1

            if score > 90:
                self._transition(job_id, "EXPIRED", f"Staleness score {score:.0f}")
                results["expired"] += 1
            elif score > 70:
                self._transition(job_id, "STALE", f"Staleness score {score:.0f}")
                results["stale"] += 1

        self.conn.commit()
        logger.info("Staleness scoring: %s", results)
        return results

    # ------------------------------------------------------------------
    # Repost detection
    # ------------------------------------------------------------------

    def detect_reposts(self) -> dict:
        """GROUP BY company+title, mark older duplicates EXPIRED."""
        rows = self.conn.execute("""
            SELECT company, title, GROUP_CONCAT(job_id) as job_ids, COUNT(*) as cnt
            FROM jobs
            WHERE status = 'ACTIVE'
            GROUP BY LOWER(company), LOWER(title)
            HAVING cnt > 1
        """).fetchall()

        results = {"groups": 0, "expired": 0}

        for row in rows:
            results["groups"] += 1
            job_ids = row["job_ids"].split(",")
            # Keep the latest, expire older duplicates
            jobs_with_dates = []
            for jid in job_ids:
                r = self.conn.execute(
                    "SELECT job_id, posted_at FROM jobs WHERE job_id = ?", (jid,)
                ).fetchone()
                if r:
                    jobs_with_dates.append(dict(r))
            if len(jobs_with_dates) < 2:
                continue
            jobs_with_dates.sort(key=lambda x: x.get("posted_at") or "", reverse=True)
            for old in jobs_with_dates[1:]:
                self._transition(old["job_id"], "EXPIRED", "Repost detected — older duplicate")
                results["expired"] += 1

        self.conn.commit()
        logger.info("Repost detection: %s", results)
        return results

    # ------------------------------------------------------------------
    # Auto-archive
    # ------------------------------------------------------------------

    def auto_archive(self, days: int = 90) -> dict:
        """Archive jobs with no confirmation in N days."""
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        rows = self.conn.execute("""
            SELECT job_id FROM jobs
            WHERE status IN ('ACTIVE', 'STALE')
              AND (last_confirmed_live IS NULL OR last_confirmed_live < ?)
        """, (cutoff,)).fetchall()

        results = {"archived": 0}
        for row in rows:
            self._transition(row["job_id"], "ARCHIVED", f"No confirmation in {days} days")
            results["archived"] += 1

        self.conn.commit()
        logger.info("Auto-archive: %s", results)
        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _transition(self, job_id: str, new_status: str, reason: str, metadata: dict | None = None):
        """Transition a job to a new status with audit logging."""
        old = self.conn.execute(
            "SELECT status FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()
        old_status = old["status"] if old else None

        if old_status == new_status:
            return

        self.conn.execute(
            "UPDATE jobs SET status = ? WHERE job_id = ?",
            (new_status, job_id),
        )
        self.conn.execute("""
            INSERT INTO job_lifecycle_events (job_id, old_status, new_status, reason, metadata)
            VALUES (?, ?, ?, ?, ?)
        """, (job_id, old_status, new_status, reason, json.dumps(metadata) if metadata else None))

    def get_lifecycle_stats(self) -> dict:
        """Return count of jobs by status."""
        rows = self.conn.execute("""
            SELECT COALESCE(status, 'ACTIVE') as status, COUNT(*) as count
            FROM jobs GROUP BY status
        """).fetchall()
        return {row["status"]: row["count"] for row in rows}
