-- Migration 009: Weekly reports upgrade + public viral tool tables + CV analysis columns

-- Upgrade generated_reports for Claude-powered weekly reports
ALTER TABLE generated_reports ADD COLUMN public_slug TEXT;
ALTER TABLE generated_reports ADD COLUMN title TEXT;
ALTER TABLE generated_reports ADD COLUMN summary TEXT;
ALTER TABLE generated_reports ADD COLUMN sections TEXT;  -- JSON: array of {heading, body, data}
ALTER TABLE generated_reports ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE generated_reports ADD COLUMN week_start TEXT;
ALTER TABLE generated_reports ADD COLUMN week_end TEXT;
ALTER TABLE generated_reports ADD COLUMN ai_model TEXT;
ALTER TABLE generated_reports ADD COLUMN generation_time_ms INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_reports_slug ON generated_reports(public_slug);

-- Public ghost check results cache (for viral tool)
CREATE TABLE IF NOT EXISTS public_ghost_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_url TEXT NOT NULL,
    company TEXT,
    title TEXT,
    ghost_score REAL,
    signals TEXT,  -- JSON
    verdict TEXT,
    checked_at TEXT DEFAULT (datetime('now')),
    ip_hash TEXT
);

-- Public salary checks cache (for viral tool)
CREATE TABLE IF NOT EXISTS public_salary_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_title TEXT NOT NULL,
    location TEXT,
    experience_level TEXT,
    market_data TEXT,  -- JSON
    ai_analysis TEXT,
    checked_at TEXT DEFAULT (datetime('now')),
    ip_hash TEXT
);

-- CV analysis extended columns
ALTER TABLE cv_analyses ADD COLUMN honest_assessment TEXT;
ALTER TABLE cv_analyses ADD COLUMN critical_gaps TEXT;
ALTER TABLE cv_analyses ADD COLUMN action_plan TEXT;
ALTER TABLE cv_analyses ADD COLUMN deal_breakers TEXT;
