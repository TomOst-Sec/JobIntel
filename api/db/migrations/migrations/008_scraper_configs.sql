-- 008: Scraper configuration table for managing scraper state.

CREATE TABLE IF NOT EXISTS scraper_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scraper_name TEXT NOT NULL UNIQUE,
    is_enabled INTEGER DEFAULT 1,
    interval_hours REAL DEFAULT 4,
    schedule_group TEXT DEFAULT 'standard_scrapers',
    last_run_at TEXT,
    last_status TEXT,
    last_jobs_found INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed default scraper configs
INSERT OR IGNORE INTO scraper_configs (scraper_name, interval_hours, schedule_group) VALUES
    ('RemoteOK', 2, 'fast_scrapers'),
    ('Arbeitnow', 4, 'standard_scrapers'),
    ('USAJobs', 4, 'standard_scrapers'),
    ('Reed', 4, 'standard_scrapers'),
    ('Adzuna', 4, 'standard_scrapers'),
    ('TheMuse', 4, 'standard_scrapers'),
    ('Jobicy', 2, 'fast_scrapers'),
    ('Remotive', 2, 'fast_scrapers'),
    ('Greenhouse', 6, 'board_scrapers'),
    ('Lever', 6, 'board_scrapers'),
    ('HNWhoIsHiring', 24, 'hn_scraper'),
    ('JSearch', 24, 'jsearch_daily');
