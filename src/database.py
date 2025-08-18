"""Database layer for JobIntel."""
import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional
from rich.console import Console

from .config import DB_PATH

console = Console()


class JobDatabase:
    """SQLite database for storing and querying job postings."""

    def __init__(self, db_path: str = DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        """Create tables if they don't exist."""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                company TEXT NOT NULL,
                company_logo TEXT,
                location TEXT,
                country TEXT,
                market_id TEXT,
                search_category TEXT,
                description TEXT,
                salary_min REAL,
                salary_max REAL,
                salary_currency TEXT DEFAULT 'USD',
                salary_period TEXT,
                employment_type TEXT,
                is_remote BOOLEAN DEFAULT 0,
                posted_at TEXT,
                apply_link TEXT,
                source TEXT,
                required_skills TEXT,
                experience_required INTEGER,
                scraped_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
            CREATE INDEX IF NOT EXISTS idx_jobs_market ON jobs(market_id);
            CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(search_category);
            CREATE INDEX IF NOT EXISTS idx_jobs_posted ON jobs(posted_at);
            CREATE INDEX IF NOT EXISTS idx_jobs_scraped ON jobs(scraped_at);

            CREATE TABLE IF NOT EXISTS salary_estimates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_title TEXT,
                location TEXT,
                min_salary REAL,
                max_salary REAL,
                median_salary REAL,
                currency TEXT DEFAULT 'USD',
                fetched_at TEXT
            );

            CREATE TABLE IF NOT EXISTS company_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                market_id TEXT,
                total_postings INTEGER,
                postings_this_week INTEGER,
                categories TEXT,
                signal_type TEXT,  -- 'scaling', 'new_entrant', 'mass_hiring'
                signal_strength REAL,
                detected_at TEXT
            );
        """)
        self.conn.commit()

    def upsert_jobs(self, jobs: list[dict]) -> tuple[int, int, int]:
        """Insert or update jobs with fingerprint dedup.

        Returns (inserted, updated, deduped) counts.
        """
        inserted = 0
        updated = 0
        deduped = 0

        for job in jobs:
            try:
                # Check fingerprint dedup: same content from a different source
                fingerprint = job.get("fingerprint")
                if fingerprint:
                    dup = self.conn.execute(
                        "SELECT job_id FROM jobs WHERE fingerprint = ? AND job_id != ?",
                        (fingerprint, job["job_id"]),
                    ).fetchone()
                    if dup:
                        deduped += 1
                        continue

                cursor = self.conn.execute(
                    "SELECT job_id FROM jobs WHERE job_id = ?", (job["job_id"],)
                )
                exists = cursor.fetchone()

                if exists:
                    self.conn.execute("""
                        UPDATE jobs SET
                            title=?, company=?, location=?, salary_min=?, salary_max=?,
                            scraped_at=?, fingerprint=?, last_confirmed_live=datetime('now'),
                            status='ACTIVE',
                            external_applicant_count=COALESCE(?, external_applicant_count)
                        WHERE job_id=?
                    """, (
                        job["title"], job["company"], job["location"],
                        job.get("salary_min"), job.get("salary_max"),
                        job["scraped_at"], fingerprint,
                        job.get("external_applicant_count"), job["job_id"]
                    ))
                    updated += 1
                else:
                    # Ensure lifecycle columns are set for new jobs
                    job.setdefault("status", "ACTIVE")
                    job.setdefault("last_confirmed_live", datetime.utcnow().isoformat())
                    job.setdefault("stale_score", 0)
                    job.setdefault("user_reports", 0)
                    cols = ", ".join(job.keys())
                    placeholders = ", ".join(["?"] * len(job))
                    self.conn.execute(
                        f"INSERT INTO jobs ({cols}) VALUES ({placeholders})",
                        list(job.values())
                    )
                    inserted += 1
            except sqlite3.Error as e:
                console.print(f"[dim red]DB error for {job.get('job_id', '?')}: {e}[/dim red]")

        self.conn.commit()
        console.print(f"[green]💾 Database: {inserted} new, {updated} updated, {deduped} deduped[/green]")
        return inserted, updated, deduped

    def get_scaling_companies(self, market_id: Optional[str] = None, min_postings: int = 5) -> list[dict]:
        """Find companies posting many jobs (scaling signal)."""
        query = """
            SELECT 
                company,
                market_id,
                COUNT(*) as total_postings,
                COUNT(DISTINCT search_category) as unique_categories,
                GROUP_CONCAT(DISTINCT search_category) as categories,
                MIN(posted_at) as earliest_post,
                MAX(posted_at) as latest_post
            FROM jobs
            WHERE posted_at >= datetime('now', '-7 days')
        """
        params = []
        if market_id:
            query += " AND market_id = ?"
            params.append(market_id)

        query += """
            GROUP BY company, market_id
            HAVING COUNT(*) >= ?
            ORDER BY total_postings DESC
        """
        params.append(min_postings)

        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def get_salary_stats(self, market_id: Optional[str] = None) -> list[dict]:
        """Get salary statistics by category and market."""
        query = """
            SELECT 
                search_category,
                market_id,
                COUNT(*) as job_count,
                ROUND(AVG(salary_min), 0) as avg_min_salary,
                ROUND(AVG(salary_max), 0) as avg_max_salary,
                ROUND(AVG((COALESCE(salary_min, 0) + COALESCE(salary_max, 0)) / 2.0), 0) as avg_midpoint,
                MIN(salary_min) as lowest_salary,
                MAX(salary_max) as highest_salary
            FROM jobs
            WHERE salary_min IS NOT NULL AND salary_min > 0
        """
        params = []
        if market_id:
            query += " AND market_id = ?"
            params.append(market_id)

        query += """
            GROUP BY search_category, market_id
            ORDER BY avg_midpoint DESC
        """

        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def get_skill_demand(self, market_id: Optional[str] = None) -> list[dict]:
        """Analyze which skills are most in demand."""
        query = """
            SELECT 
                search_category,
                market_id,
                COUNT(*) as demand_count,
                SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_count,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN salary_min END), 0) as avg_salary
            FROM jobs
            WHERE posted_at >= datetime('now', '-7 days')
        """
        params = []
        if market_id:
            query += " AND market_id = ?"
            params.append(market_id)

        query += """
            GROUP BY search_category, market_id
            ORDER BY demand_count DESC
        """

        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def get_market_overview(self) -> list[dict]:
        """Get high-level stats per market."""
        query = """
            SELECT 
                market_id,
                COUNT(*) as total_jobs,
                COUNT(DISTINCT company) as unique_companies,
                COUNT(DISTINCT search_category) as categories_active,
                SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) as remote_jobs,
                ROUND(100.0 * SUM(CASE WHEN is_remote THEN 1 ELSE 0 END) / COUNT(*), 1) as remote_pct,
                ROUND(AVG(CASE WHEN salary_min > 0 THEN (salary_min + COALESCE(salary_max, salary_min)) / 2.0 END), 0) as avg_salary
            FROM jobs
            GROUP BY market_id
        """
        rows = self.conn.execute(query).fetchall()
        return [dict(r) for r in rows]

    def get_recent_jobs(self, limit: int = 50, market_id: Optional[str] = None) -> list[dict]:
        """Get most recently posted jobs."""
        query = "SELECT * FROM jobs"
        params = []
        if market_id:
            query += " WHERE market_id = ?"
            params.append(market_id)
        query += " ORDER BY posted_at DESC LIMIT ?"
        params.append(limit)

        rows = self.conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]

    def get_stats(self) -> dict:
        """Get overall database stats."""
        stats = {}
        stats["total_jobs"] = self.conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        stats["unique_companies"] = self.conn.execute("SELECT COUNT(DISTINCT company) FROM jobs").fetchone()[0]
        stats["markets"] = self.conn.execute("SELECT COUNT(DISTINCT market_id) FROM jobs").fetchone()[0]
        stats["with_salary"] = self.conn.execute("SELECT COUNT(*) FROM jobs WHERE salary_min > 0").fetchone()[0]
        return stats

    def close(self):
        self.conn.close()
