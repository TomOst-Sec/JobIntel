-- 017: Identity Engine — GitHub code analysis and Build Score.
CREATE TABLE IF NOT EXISTS github_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    github_username TEXT NOT NULL,
    github_id TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    public_repos INTEGER DEFAULT 0,
    followers INTEGER DEFAULT 0,
    following INTEGER DEFAULT 0,
    total_stars INTEGER DEFAULT 0,
    total_commits_last_year INTEGER DEFAULT 0,
    top_languages TEXT,
    repos_data TEXT,
    contribution_graph TEXT,
    skills_extracted TEXT,
    build_score REAL,
    build_score_breakdown TEXT,
    profile_url TEXT,
    last_synced_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_github_profiles_user ON github_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_github_profiles_username ON github_profiles(github_username);
