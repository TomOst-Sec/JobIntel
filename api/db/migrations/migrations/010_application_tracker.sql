-- Application tracker for job seekers
CREATE TABLE IF NOT EXISTS job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    job_id TEXT,
    external_url TEXT,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    salary_min REAL,
    salary_max REAL,
    status TEXT DEFAULT 'saved' CHECK(status IN ('saved','applied','phone_screen','interview','offer','rejected','withdrawn','accepted')),
    ghost_score REAL,
    company_trajectory TEXT,
    notes TEXT,
    applied_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_applications_user ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON job_applications(user_id, status);

-- Activity feed events
CREATE TABLE IF NOT EXISTS activity_feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    company TEXT,
    title TEXT NOT NULL,
    body TEXT,
    data TEXT,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created ON activity_feed(created_at DESC);
