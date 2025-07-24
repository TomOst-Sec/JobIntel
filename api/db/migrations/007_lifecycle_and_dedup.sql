-- 007: Job lifecycle management and deduplication support.

-- Add fingerprint for dedup
ALTER TABLE jobs ADD COLUMN fingerprint TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);

-- Add lifecycle status
ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- Add lifecycle tracking columns
ALTER TABLE jobs ADD COLUMN last_confirmed_live TEXT;
ALTER TABLE jobs ADD COLUMN stale_score REAL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN user_reports INTEGER DEFAULT 0;

-- Audit table for lifecycle transitions
CREATE TABLE IF NOT EXISTS job_lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    reason TEXT,
    metadata TEXT,  -- JSON
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_job ON job_lifecycle_events(job_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_created ON job_lifecycle_events(created_at);

-- Tracked ATS boards for Greenhouse/Lever dynamic discovery
CREATE TABLE IF NOT EXISTS tracked_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    platform TEXT NOT NULL,  -- 'greenhouse' or 'lever'
    board_slug TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_scraped_at TEXT,
    jobs_found INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(platform, board_slug)
);
CREATE INDEX IF NOT EXISTS idx_tracked_boards_platform ON tracked_boards(platform, is_active);
