-- Recruiter AI Command Center — 7 new tables
-- Synthetic candidate profiles (bootstrapped from job data)
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    headline TEXT,
    summary TEXT,
    skills TEXT,           -- JSON array: ["Python", "React", ...]
    experience_years INTEGER,
    current_company TEXT,
    current_title TEXT,
    location TEXT,
    country TEXT,
    is_remote_ok INTEGER DEFAULT 1,
    salary_min REAL,
    salary_max REAL,
    availability TEXT DEFAULT 'active',  -- active, passive, not_looking
    source TEXT DEFAULT 'synthetic',
    profile_data TEXT,     -- JSON: full structured profile
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_candidates_skills ON candidates(skills);
CREATE INDEX IF NOT EXISTS idx_candidates_location ON candidates(location);

-- Recruiter search sessions (like chat but for candidate search)
CREATE TABLE IF NOT EXISTS recruiter_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id TEXT UNIQUE NOT NULL,
    recruiter_id INTEGER NOT NULL,
    brief TEXT NOT NULL,           -- Original natural language query
    parsed_brief TEXT,             -- JSON: AI-extracted requirements
    status TEXT DEFAULT 'active',  -- active, closed
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recruiter_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_rsearch_recruiter ON recruiter_searches(recruiter_id);

-- Search results with match scores
CREATE TABLE IF NOT EXISTS recruiter_search_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    match_score REAL NOT NULL,
    score_breakdown TEXT,    -- JSON: {skills: 85, experience: 70, ...}
    match_explanation TEXT,  -- AI-generated explanation
    status TEXT DEFAULT 'new',  -- new, shortlisted, rejected, contacted
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (search_id) REFERENCES recruiter_searches(search_id),
    FOREIGN KEY (candidate_id) REFERENCES candidates(candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_rsresults_search ON recruiter_search_results(search_id);

-- Outreach messages (3-message sequence limit per candidate)
CREATE TABLE IF NOT EXISTS recruiter_outreach (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    outreach_id TEXT UNIQUE NOT NULL,
    recruiter_id INTEGER NOT NULL,
    candidate_id TEXT NOT NULL,
    search_id TEXT,
    sequence_number INTEGER DEFAULT 1,  -- 1, 2, or 3
    channel TEXT DEFAULT 'email',       -- email, linkedin, inmail
    subject TEXT,
    body TEXT NOT NULL,
    tone TEXT DEFAULT 'professional',   -- professional, casual, technical
    status TEXT DEFAULT 'draft',        -- draft, sent, opened, replied
    sent_at TEXT,
    opened_at TEXT,
    replied_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recruiter_id) REFERENCES users(id),
    FOREIGN KEY (candidate_id) REFERENCES candidates(candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_outreach_recruiter ON recruiter_outreach(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_outreach_candidate ON recruiter_outreach(candidate_id);

-- Recruiter pipeline (Kanban stages)
CREATE TABLE IF NOT EXISTS recruiter_pipeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipeline_id TEXT UNIQUE NOT NULL,
    recruiter_id INTEGER NOT NULL,
    candidate_id TEXT NOT NULL,
    search_id TEXT,
    job_title TEXT,
    stage TEXT DEFAULT 'sourced' CHECK(stage IN ('sourced','contacted','responded','interview','offer','hired','rejected','withdrawn')),
    notes TEXT,
    rating INTEGER,         -- 1-5 star rating
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recruiter_id) REFERENCES users(id),
    FOREIGN KEY (candidate_id) REFERENCES candidates(candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_recruiter ON recruiter_pipeline(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stage ON recruiter_pipeline(recruiter_id, stage);

-- Recruiter chat messages (search conversation history)
CREATE TABLE IF NOT EXISTS recruiter_chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_id TEXT NOT NULL,
    role TEXT NOT NULL,      -- user, assistant
    content TEXT NOT NULL,
    metadata TEXT,           -- JSON: {candidates_shown: 10, ...}
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (search_id) REFERENCES recruiter_searches(search_id)
);
CREATE INDEX IF NOT EXISTS idx_rchat_search ON recruiter_chat_messages(search_id);

-- Recruiter daily briefing cache
CREATE TABLE IF NOT EXISTS recruiter_briefings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruiter_id INTEGER NOT NULL,
    briefing_date TEXT NOT NULL,
    content TEXT NOT NULL,   -- JSON: structured briefing sections
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (recruiter_id) REFERENCES users(id),
    UNIQUE(recruiter_id, briefing_date)
);
