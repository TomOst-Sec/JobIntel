-- Ghost job scoring
ALTER TABLE jobs ADD COLUMN ghost_score REAL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN ghost_signals TEXT;  -- JSON array of detected signals
ALTER TABLE jobs ADD COLUMN repost_count INTEGER DEFAULT 1;

-- Market signals log
CREATE TABLE IF NOT EXISTS market_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_type TEXT NOT NULL,  -- 'layoff_risk', 'ipo_signal', 'scaling', 'ghost_jobs', 'salary_spike'
    company TEXT,
    severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT,
    data_points TEXT,  -- JSON
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_public BOOLEAN DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_market_signals_type ON market_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_market_signals_company ON market_signals(company);
CREATE INDEX IF NOT EXISTS idx_market_signals_detected ON market_signals(detected_at);

-- Roadmaps
CREATE TABLE IF NOT EXISTS roadmaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_role TEXT NOT NULL,
    current_match_score REAL,
    projected_match_score REAL,
    timeline_weeks INTEGER,
    phases TEXT NOT NULL,  -- JSON: full roadmap structure
    user_skills TEXT,  -- JSON: skills provided
    job_requirements TEXT,  -- JSON: parsed requirements
    honest_assessment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_roadmaps_user ON roadmaps(user_id);

-- Search query log
CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    query TEXT NOT NULL,
    mode TEXT DEFAULT 'seeker',
    results_count INTEGER,
    response_time_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Company intelligence cache
CREATE TABLE IF NOT EXISTS company_intel_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    intel_data TEXT NOT NULL,  -- JSON: full intelligence report
    layoff_risk_score REAL DEFAULT 0,
    ipo_probability REAL DEFAULT 0,
    trajectory TEXT DEFAULT 'stable',  -- scaling/stable/contracting
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_intel_name ON company_intel_cache(company);

-- Negotiation sessions
CREATE TABLE IF NOT EXISTS negotiation_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    job_context TEXT,  -- JSON: job data for context
    messages TEXT NOT NULL DEFAULT '[]',  -- JSON array of message exchanges
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_negotiation_user ON negotiation_sessions(user_id);
