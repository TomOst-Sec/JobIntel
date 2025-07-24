-- ═══════════════════════════════════════════════════════════════
-- Migration 013: SKYNET Platform — OAuth, AI Providers, CV DNA,
-- Gamification, Autopilot, Career Graph, Interview Oracle
-- ═══════════════════════════════════════════════════════════════

-- ─── OAuth & Social Login ────────────────────────────────────

-- Allow password_hash to be NULL for OAuth-only users
-- (SQLite doesn't support ALTER COLUMN, so we handle in app logic)

CREATE TABLE IF NOT EXISTS user_oauth_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,               -- google, github, phone
    provider_user_id TEXT NOT NULL,       -- OAuth sub/id or phone number
    provider_email TEXT,
    provider_name TEXT,
    provider_avatar_url TEXT,
    access_token_encrypted TEXT,          -- encrypted OAuth access token
    refresh_token_encrypted TEXT,
    token_expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_user ON user_oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_provider ON user_oauth_accounts(provider, provider_user_id);

-- Email verification
CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    code TEXT NOT NULL,                   -- 6-digit code
    verified_at TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verifications(user_id);

-- Phone verification (OTP)
CREATE TABLE IF NOT EXISTS phone_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,                   -- 6-digit OTP
    user_id INTEGER,                      -- NULL if not yet linked to user
    verified_at TEXT,
    expires_at TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_phone_verify ON phone_verifications(phone_number);

-- ─── User AI Provider Connections ────────────────────────────

CREATE TABLE IF NOT EXISTS user_ai_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,               -- openrouter, anthropic, openai, google
    api_key_encrypted TEXT NOT NULL,      -- encrypted API key
    model_preference TEXT,                -- preferred model for this provider
    is_active INTEGER DEFAULT 1,
    usage_tokens_total INTEGER DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_user ON user_ai_providers(user_id);

-- ─── CV Intelligence ─────────────────────────────────────────

-- CV DNA: the master truth document
CREATE TABLE IF NOT EXISTS cv_dna (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    version INTEGER DEFAULT 1,
    raw_text TEXT,
    structured_data TEXT,                 -- JSON: full parsed CV structure
    enrichment_data TEXT,                 -- JSON: market enrichment for each section
    skills_canonical TEXT,                -- JSON array: normalized skills
    skills_depth TEXT,                    -- JSON: {skill: depth_score}
    skills_recency TEXT,                  -- JSON: {skill: last_used_year}
    experience_data TEXT,                 -- JSON array: structured experience entries
    education_data TEXT,                  -- JSON array: education entries
    projects_data TEXT,                   -- JSON array: projects
    certifications_data TEXT,             -- JSON array: certifications
    market_position_score REAL,           -- 0-100 overall market score
    hidden_strengths TEXT,                -- JSON array: undersold strengths
    gap_matrix TEXT,                      -- JSON: gaps for target roles
    headline TEXT,
    summary TEXT,
    file_path TEXT,                       -- path to original file
    file_type TEXT,                       -- pdf, docx, txt, linkedin_pdf
    is_current INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cv_dna_user ON cv_dna(user_id, is_current);

-- Tailored CV versions (one per job application)
CREATE TABLE IF NOT EXISTS cv_tailored (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cv_dna_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    job_id TEXT,                           -- target job
    tailoring_level TEXT DEFAULT 'standard', -- quick, standard, full, max
    content_data TEXT NOT NULL,            -- JSON: full tailored CV content
    headline_tailored TEXT,
    summary_tailored TEXT,
    skills_reordered TEXT,                -- JSON array
    experience_reordered TEXT,            -- JSON array
    changes_made TEXT,                    -- JSON array: what changed
    keywords_added TEXT,                  -- JSON array: ATS keywords injected
    match_score_before REAL,
    match_score_after REAL,
    ats_score REAL,
    generation_time_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cv_dna_id) REFERENCES cv_dna(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_cv_tailored_user ON cv_tailored(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_tailored_job ON cv_tailored(job_id);

-- Cover letters
CREATE TABLE IF NOT EXISTS cover_letters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    job_id TEXT,
    cv_tailored_id INTEGER,
    content TEXT NOT NULL,
    tone TEXT DEFAULT 'professional',     -- professional, casual, technical, startup
    personalization_hooks TEXT,           -- JSON array: what was personalized
    word_count INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id),
    FOREIGN KEY (cv_tailored_id) REFERENCES cv_tailored(id)
);
CREATE INDEX IF NOT EXISTS idx_cover_letter_user ON cover_letters(user_id);

-- ─── Application Tracker ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS application_tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    job_id TEXT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'applied' CHECK(status IN (
        'queued', 'applied', 'viewed', 'phone_screen', 'technical',
        'onsite', 'final_round', 'offer', 'accepted', 'rejected',
        'withdrawn', 'ghosted'
    )),
    applied_via TEXT,                     -- autopilot, manual, greenhouse_api, playwright, email
    cv_tailored_id INTEGER,
    cover_letter_id INTEGER,
    match_score REAL,
    ghost_score REAL,
    salary_min REAL,
    salary_max REAL,
    notes TEXT,
    rejection_reason TEXT,               -- AI-classified reason
    rejection_insight TEXT,              -- AI-generated insight
    response_at TEXT,
    interview_date TEXT,
    offer_amount REAL,
    applied_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id),
    FOREIGN KEY (cv_tailored_id) REFERENCES cv_tailored(id),
    FOREIGN KEY (cover_letter_id) REFERENCES cover_letters(id)
);
CREATE INDEX IF NOT EXISTS idx_app_tracker_user ON application_tracker(user_id, status);
CREATE INDEX IF NOT EXISTS idx_app_tracker_job ON application_tracker(job_id);

-- ─── Autopilot ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS autopilot_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    is_enabled INTEGER DEFAULT 0,
    mode TEXT DEFAULT 'pre_approve',      -- full_auto, pre_approve, materials_only
    target_roles TEXT,                    -- JSON array
    target_seniority TEXT,               -- JSON array
    target_locations TEXT,               -- JSON array
    salary_floor REAL,
    exclude_companies TEXT,              -- JSON array
    exclude_industries TEXT,             -- JSON array
    require_salary_disclosed INTEGER DEFAULT 0,
    max_ghost_score REAL DEFAULT 0.4,
    max_layoff_risk REAL DEFAULT 0.7,
    require_visa_sponsorship INTEGER DEFAULT 0,
    min_match_score REAL DEFAULT 0.7,
    max_applications_per_day INTEGER DEFAULT 10,
    max_per_company INTEGER DEFAULT 1,
    cooldown_same_company_days INTEGER DEFAULT 90,
    run_time TEXT DEFAULT '02:00',       -- local time
    timezone TEXT DEFAULT 'UTC',
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS autopilot_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    run_date TEXT NOT NULL,
    jobs_found INTEGER DEFAULT 0,
    jobs_qualified INTEGER DEFAULT 0,
    applications_submitted INTEGER DEFAULT 0,
    applications_failed INTEGER DEFAULT 0,
    jobs_skipped_data TEXT,              -- JSON: [{job_id, reason}]
    briefing_sent INTEGER DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_autopilot_runs_user ON autopilot_runs(user_id, run_date);

-- ─── Gamification ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_xp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,            -- from XP_EVENT_TABLE
    xp_earned INTEGER NOT NULL,
    multiplier REAL DEFAULT 1.0,
    context TEXT,                        -- JSON: event context
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_xp ON user_xp(user_id, created_at);

CREATE TABLE IF NOT EXISTS user_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    total_xp INTEGER DEFAULT 0,
    current_level INTEGER DEFAULT 1,
    level_title TEXT DEFAULT 'Applicant',
    streak_days INTEGER DEFAULT 0,
    streak_best INTEGER DEFAULT 0,
    streak_shields INTEGER DEFAULT 0,
    last_active_date TEXT,
    momentum_score REAL DEFAULT 0,
    applications_total INTEGER DEFAULT 0,
    responses_total INTEGER DEFAULT 0,
    offers_total INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quest_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    quest_type TEXT NOT NULL,             -- daily, weekly, achievement, legendary
    xp_reward INTEGER NOT NULL,
    requirements TEXT NOT NULL,           -- JSON: {metric: target_value}
    badge_name TEXT,
    badge_icon TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quest_id TEXT NOT NULL,
    progress REAL DEFAULT 0,
    target REAL NOT NULL,
    completed_at TEXT,
    period_start TEXT,                    -- for daily/weekly quests
    period_end TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_id) REFERENCES quests(quest_id)
);
CREATE INDEX IF NOT EXISTS idx_user_quests ON user_quests(user_id, quest_id);

CREATE TABLE IF NOT EXISTS user_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id TEXT NOT NULL,
    badge_name TEXT,
    badge_icon TEXT,
    xp_earned INTEGER,
    unlocked_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON user_achievements(user_id);

-- ─── Career Graph ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS career_trajectories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    trajectory_type TEXT DEFAULT 'balanced', -- aggressive, balanced, conservative
    current_position TEXT,               -- JSON: current role/skills summary
    target_position TEXT,                -- JSON: target role/salary/company
    gaps TEXT,                           -- JSON array: skill/experience gaps
    milestones TEXT,                     -- JSON array: steps on the path
    salary_projection TEXT,              -- JSON: {year: {p25, p50, p75}}
    success_probability REAL,
    peer_paths_summary TEXT,             -- JSON: how similar people progressed
    generated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_career_traj_user ON career_trajectories(user_id);

-- ─── Interview Oracle ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interview_prep (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    job_id TEXT,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    interview_date TEXT,
    interview_profile TEXT,              -- JSON: rounds, difficulty, patterns
    question_bank TEXT,                  -- JSON array: predicted questions
    prep_plan Text,                      -- JSON: day-by-day plan
    behavioral_stories Text,             -- JSON: mapped stories from CV
    system_design_focus TEXT,            -- JSON: topics to prepare
    practice_sessions INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_interview_prep_user ON interview_prep(user_id);

CREATE TABLE IF NOT EXISTS interview_practice (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prep_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    feedback TEXT,                        -- JSON: scores and specific feedback
    overall_score REAL,
    verdict TEXT,                         -- would_advance, on_fence, would_not_advance
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (prep_id) REFERENCES interview_prep(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── Community Interview Reports ─────────────────────────────

CREATE TABLE IF NOT EXISTS community_interview_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    interview_date TEXT,
    rounds INTEGER,
    difficulty REAL,                      -- 1-10
    got_offer INTEGER,                   -- 0/1
    questions TEXT,                       -- JSON array of questions asked
    experience_notes TEXT,
    tips TEXT,
    is_anonymous INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_interview_reports_company ON community_interview_reports(LOWER(company));

-- ─── Notification Queue ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    notification_type TEXT NOT NULL,      -- skynet_opportunity, timing_window, salary_intelligence, etc.
    priority TEXT DEFAULT 'medium',       -- critical, high, medium, low
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_url TEXT,
    action_label TEXT,
    metadata TEXT,                        -- JSON: extra context
    channels TEXT DEFAULT 'in_app',       -- in_app, push, email (comma-separated)
    read_at TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_queue(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notification_queue(priority, created_at);

-- ─── Seed Quest Data ─────────────────────────────────────────

INSERT OR IGNORE INTO quests (quest_id, title, description, quest_type, xp_reward, requirements, badge_name, badge_icon) VALUES
-- Daily quests
('daily_apply_1', 'Apply to 1 job today', 'Keep the momentum. One application a day keeps unemployment away.', 'daily', 300, '{"applications_today": 1}', NULL, NULL),
('daily_ai_search', 'Run an AI search', 'Use AI to find your perfect match.', 'daily', 100, '{"ai_searches_today": 1}', NULL, NULL),
('daily_intelligence', 'Read 3 company pages', 'Know where you are applying before you apply.', 'daily', 150, '{"company_pages_viewed": 3}', NULL, NULL),
('daily_ghost_check', 'Run a ghost check', 'Protect yourself from fake postings.', 'daily', 75, '{"ghost_checks_today": 1}', NULL, NULL),
-- Weekly quests
('weekly_5_apps', 'Submit 5 applications this week', 'Consistency beats intensity.', 'weekly', 1000, '{"applications_this_week": 5}', NULL, NULL),
('weekly_no_ghosts', 'Ghost-free week', 'Only apply to jobs with ghost score under 30%.', 'weekly', 500, '{"max_ghost_score_applied": 0.3}', NULL, NULL),
('weekly_tailor_all', 'Tailor CV for every application', 'Every job gets a custom CV.', 'weekly', 750, '{"tailoring_rate": 1.0}', NULL, NULL),
-- Achievement quests
('first_response', 'First recruiter response', 'Get your first recruiter response.', 'achievement', 2000, '{"responses": 1}', 'First Contact', '🎯'),
('ghost_buster', 'Ghost Buster', 'Avoid 10 ghost jobs.', 'achievement', 1500, '{"ghosts_avoided": 10}', 'Ghost Buster', '👻'),
('salary_negotiator', 'Negotiate salary up', 'Use the negotiation coach successfully.', 'achievement', 5000, '{"salary_negotiated": 1}', 'Negotiator', '💰'),
('century_club', '100 applications', 'Submit 100 total applications.', 'achievement', 10000, '{"total_applications": 100}', 'Century Club', '💯'),
('hired', 'Got hired!', 'Get hired through JobIntel.', 'legendary', 50000, '{"hired": 1}', 'SUCCESS STORY', '🏆');
