-- CV upload and analysis tables
CREATE TABLE IF NOT EXISTS cv_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    parsed_text TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cv_uploads_user ON cv_uploads(user_id);

CREATE TABLE IF NOT EXISTS cv_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cv_id INTEGER NOT NULL REFERENCES cv_uploads(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_position_score INTEGER CHECK (market_position_score BETWEEN 0 AND 100),
    skills_gap TEXT,       -- JSON array of missing skills
    salary_estimate_min REAL,
    salary_estimate_max REAL,
    recommended_roles TEXT, -- JSON array
    opportunity_map TEXT,   -- JSON object
    ai_narrative TEXT,      -- Full text analysis from Claude
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cv_analyses_user ON cv_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_analyses_cv ON cv_analyses(cv_id);
