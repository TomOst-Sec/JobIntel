-- ═══════════════════════════════════════════════════════════════
-- Migration 012: Intelligence Layer — Enrichment Pipeline,
-- Ghost Truth Engine, Salary Reality, Market Signals, SEO
-- ═══════════════════════════════════════════════════════════════

-- Enriched job intelligence fields (47-field enrichment)
CREATE TABLE IF NOT EXISTS enriched_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT UNIQUE NOT NULL,

    -- CATEGORY A: Job Classification (8 fields)
    tech_domain TEXT,              -- ai_ml, backend, frontend, fullstack, mobile, devops_platform, etc.
    seniority_universal TEXT,      -- entry, junior, mid, senior, staff, principal, distinguished, fellow, management_*
    employment_type_normalized TEXT, -- full_time, contract, part_time, internship
    work_arrangement TEXT,         -- fully_remote_anywhere, hybrid_3_days, onsite_required, etc.
    team_function TEXT,            -- platform_infra, product_engineering, data_science, security, research, etc.
    company_industry TEXT,         -- fintech, healthtech, ai_saas, enterprise_software, etc.
    has_equity INTEGER,            -- 0/1/NULL
    equity_type TEXT,              -- rsu, options, phantom, profit_sharing
    hiring_urgency TEXT,           -- immediate, standard, slow_burn, pipeline

    -- CATEGORY B: Skill Intelligence (6 fields)
    skills_canonical TEXT,         -- JSON array: normalized skill names
    skills_technical TEXT,         -- JSON array: languages, frameworks, tools
    skills_methodologies TEXT,     -- JSON array: agile, tdd, ci/cd
    skills_domain TEXT,            -- JSON array: ML, fintech, healthcare
    skills_hard_required TEXT,     -- JSON array: must-have skills
    skills_preferred TEXT,         -- JSON array: nice-to-have skills
    skill_demand_score REAL,       -- 0-100: how in-demand is this skill combo
    skill_rarity_score REAL,       -- 0-100: how rare is this combo

    -- CATEGORY C: Salary Intelligence (7 fields)
    salary_vs_market_p50 REAL,     -- 1.0 = at median, 1.2 = 20% above
    salary_percentile INTEGER,     -- 0-100 percentile rank
    salary_estimated_min REAL,     -- our estimate when not disclosed
    salary_estimated_max REAL,
    salary_estimation_confidence REAL, -- 0-1
    h1b_avg_wage REAL,             -- what H1B filings show for this company+title
    h1b_sample_size INTEGER,

    -- CATEGORY D: Ghost Intelligence (enhanced — 6 fields)
    ghost_type TEXT,               -- PASSIVE, INSURANCE, PIPELINE, NARRATIVE, COMPETITIVE, EVERGREEN
    ghost_type_confidence REAL,    -- 0-1
    ghost_classification_evidence TEXT, -- JSON: detailed evidence for type
    ghost_candidate_advice TEXT,   -- actionable advice for candidates

    -- CATEGORY E: Company Intelligence (8 fields)
    company_tier TEXT,             -- FAANG_PLUS, TOP_100, UNICORN, SERIES_D_PLUS, etc.
    company_trajectory TEXT,       -- hypergrowth, scaling, stable, contracting, restructuring
    company_hiring_velocity REAL,  -- ratio vs 90-day baseline
    company_glassdoor_rating REAL,
    company_glassdoor_trend TEXT,  -- improving, declining, stable
    layoff_risk_score REAL,        -- 0-1
    ipo_probability REAL,          -- 0-1
    company_ghost_rate REAL,       -- % of company's postings that are ghosts

    -- CATEGORY F: Candidate Matching (6 fields)
    typical_candidate_background TEXT,
    typical_years_experience TEXT,  -- "3-5", "5-8", "8-12", "12+"
    interview_difficulty REAL,     -- 0-1
    interview_rounds_typical INTEGER,
    application_response_rate REAL, -- 0-1
    ideal_cover_letter_focus TEXT,

    -- CATEGORY G: Contextual Intelligence (6 fields)
    ai_intelligence_note TEXT,     -- 1-2 sentence non-obvious insight
    jd_red_flags TEXT,             -- JSON array of red flag strings
    jd_green_flags TEXT,           -- JSON array of green flag strings
    visa_requirements_detected TEXT,
    culture_signals TEXT,          -- JSON array
    posting_urgency_analysis TEXT,

    -- Metadata
    enrichment_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    enrichment_priority INTEGER DEFAULT 100,
    enriched_at TEXT,
    enrichment_version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_enriched_job_id ON enriched_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_enriched_status ON enriched_jobs(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_enriched_domain ON enriched_jobs(tech_domain);
CREATE INDEX IF NOT EXISTS idx_enriched_seniority ON enriched_jobs(seniority_universal);

-- Enrichment processing queue
CREATE TABLE IF NOT EXISTS enrichment_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    stage TEXT NOT NULL,            -- classify, company_match, ghost_score, salary, skills, ai_enrich, index, alerts
    priority INTEGER DEFAULT 100,
    status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_eq_status ON enrichment_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_eq_job ON enrichment_queue(job_id);

-- H1B salary data (public DOL data)
CREATE TABLE IF NOT EXISTS h1b_salary_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    company_name_normalized TEXT,  -- lowercase, trimmed
    job_title TEXT NOT NULL,
    job_title_normalized TEXT,
    wage_level TEXT,               -- Level I-IV
    prevailing_wage REAL,
    wage_rate REAL,
    wage_unit TEXT,                -- Year, Hour, Week, Month
    wage_annual REAL,              -- normalized to annual
    worksite_city TEXT,
    worksite_state TEXT,
    case_status TEXT,              -- Certified, Denied, Withdrawn
    filing_date TEXT,
    decision_date TEXT,
    visa_class TEXT,               -- H-1B, H-1B1, E-3
    year INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_h1b_company ON h1b_salary_data(company_name_normalized);
CREATE INDEX IF NOT EXISTS idx_h1b_title ON h1b_salary_data(job_title_normalized);
CREATE INDEX IF NOT EXISTS idx_h1b_year ON h1b_salary_data(year);

-- Global scraper source registry
CREATE TABLE IF NOT EXISTS global_scraper_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_key TEXT UNIQUE NOT NULL,    -- e.g., "naukri_india", "djinni_ua"
    display_name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_url TEXT,
    has_api INTEGER DEFAULT 0,
    country_codes TEXT,                 -- JSON array: ["IN"], ["UA", "PL"]
    language TEXT DEFAULT 'en',
    requires_translation INTEGER DEFAULT 0,
    scraping_method TEXT DEFAULT 'api', -- api, playwright, rss, feed
    priority TEXT DEFAULT 'MEDIUM',     -- CRITICAL, HIGH, MEDIUM, LOW
    specialty TEXT,                     -- e.g., "india_entry_level", "ml_ai_research"
    volume_estimate TEXT,               -- e.g., "100,000+ tech jobs"
    update_interval_minutes INTEGER DEFAULT 60,
    is_enabled INTEGER DEFAULT 0,
    last_scraped_at TEXT,
    last_jobs_found INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Translation cache for non-English jobs
CREATE TABLE IF NOT EXISTS translation_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    source_language TEXT NOT NULL,      -- ISO 639-1: he, hi, uk, pl, de, fr, etc.
    translated_title TEXT,
    translated_description TEXT,
    translated_requirements TEXT,
    translated_skills TEXT,             -- JSON array
    translation_method TEXT DEFAULT 'claude', -- claude, google, manual
    translation_quality REAL,          -- 0-1 confidence
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_translation_job ON translation_cache(job_id);

-- SEO programmatic page cache
CREATE TABLE IF NOT EXISTS seo_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_type TEXT NOT NULL,            -- job_role_location, salary_role_location, company
    slug TEXT UNIQUE NOT NULL,          -- e.g., "senior-react-developer/san-francisco"
    role_slug TEXT,
    location_slug TEXT,
    title TEXT NOT NULL,
    meta_description TEXT,
    content_json TEXT,                  -- JSON: structured page data
    job_count INTEGER DEFAULT 0,
    avg_salary_min REAL,
    avg_salary_max REAL,
    last_generated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seo_slug ON seo_pages(slug);
CREATE INDEX IF NOT EXISTS idx_seo_type ON seo_pages(page_type);

-- Salary reality comparisons (computed per job)
CREATE TABLE IF NOT EXISTS salary_reality (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT,
    posted_min REAL,
    posted_max REAL,
    h1b_actual_avg REAL,
    h1b_sample_size INTEGER,
    market_p25 REAL,
    market_p50 REAL,
    market_p75 REAL,
    market_p90 REAL,
    community_reported_avg REAL,
    gap_analysis TEXT,                  -- AI-generated explanation
    negotiation_leverage TEXT,          -- STRONG, MODERATE, WEAK, UNKNOWN
    transparency_grade TEXT,            -- A, B, C, D, F
    computed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES jobs(job_id)
);
CREATE INDEX IF NOT EXISTS idx_salary_reality_company ON salary_reality(company);
CREATE INDEX IF NOT EXISTS idx_salary_reality_job ON salary_reality(job_id);

-- Competitive hiring landscape snapshots
CREATE TABLE IF NOT EXISTS competitive_landscape (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_key TEXT NOT NULL,             -- normalized role, e.g., "senior_ml_engineer"
    location_key TEXT,                  -- normalized location
    seniority TEXT,
    snapshot_date TEXT NOT NULL,
    total_competing_companies INTEGER,
    total_competing_postings INTEGER,
    talent_scarcity_score REAL,         -- 0-100
    market_clearing_salary_min REAL,
    market_clearing_salary_max REAL,
    companies_data TEXT,                -- JSON: [{company, salary_position, urgency, ghost_rate}]
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_competitive_role ON competitive_landscape(role_key, location_key);

-- Seed global scraper sources
INSERT OR IGNORE INTO global_scraper_sources (source_key, display_name, url, api_url, has_api, country_codes, language, requires_translation, scraping_method, priority, specialty, volume_estimate, update_interval_minutes) VALUES
-- Israel
('alljobs_israel', 'AllJobs Israel', 'https://www.alljobs.co.il', NULL, 0, '["IL"]', 'he', 1, 'playwright', 'CRITICAL', 'israel_tech', '5,000-15,000 tech jobs', 60),
('drushim_israel', 'Drushim Israel', 'https://www.drushim.co.il', NULL, 0, '["IL"]', 'he', 1, 'playwright', 'HIGH', 'israel_tech', '3,000-8,000 tech jobs', 120),
-- India
('naukri_india', 'Naukri India', 'https://www.naukri.com', 'https://www.naukri.com/jobapi/v3/search', 1, '["IN"]', 'en', 0, 'api', 'CRITICAL', 'india_tech', '100,000+ tech jobs', 60),
('foundit_india', 'Foundit India', 'https://www.foundit.in', NULL, 0, '["IN"]', 'en', 0, 'playwright', 'HIGH', 'india_tech', '30,000+ tech jobs', 120),
('internshala', 'Internshala', 'https://internshala.com', NULL, 0, '["IN"]', 'en', 0, 'playwright', 'MEDIUM', 'india_entry_level', '10,000+ tech jobs', 240),
-- Ukraine / Eastern Europe
('djinni_ua', 'Djinni Ukraine', 'https://djinni.co/jobs/', NULL, 0, '["UA"]', 'en', 0, 'playwright', 'CRITICAL', 'ukraine_remote_tech', '10,000+ tech jobs', 45),
('nofluffjobs_poland', 'NoFluffJobs Poland', 'https://nofluffjobs.com', 'https://nofluffjobs.com/api/search/posting', 1, '["PL"]', 'en', 0, 'api', 'CRITICAL', 'poland_tech', '15,000+ tech jobs', 45),
('justjoinit_poland', 'Just Join IT', 'https://justjoin.it', 'https://justjoin.it/api/offers', 1, '["PL"]', 'en', 0, 'api', 'HIGH', 'poland_tech', '8,000+ tech jobs', 60),
-- LATAM
('getonboard_latam', 'GetOnBoard LATAM', 'https://www.getonbrd.com', 'https://www.getonbrd.com/api/v0/jobs', 1, '["CL","CO","AR","MX","PE","UY"]', 'es', 1, 'api', 'CRITICAL', 'latam_tech', '5,000+ tech jobs', 60),
('gupy_brazil', 'Gupy Brazil', 'https://portal.gupy.io', 'https://portal.api.gupy.io/api/v1/jobs', 1, '["BR"]', 'pt', 1, 'api', 'CRITICAL', 'brazil_tech', '30,000+ tech jobs', 60),
-- Southeast Asia
('techinasia_jobs', 'Tech in Asia Jobs', 'https://www.techinasia.com/jobs', NULL, 0, '["SG","MY","ID","TH","VN","PH"]', 'en', 0, 'playwright', 'CRITICAL', 'sea_startup_tech', '8,000+ tech jobs', 60),
('jobsdb_apac', 'JobsDB APAC', 'https://th.jobsdb.com', NULL, 0, '["TH","HK","ID","MY","SG"]', 'en', 0, 'playwright', 'HIGH', 'sea_tech', '15,000+ tech jobs', 120),
-- Middle East
('bayt_com', 'Bayt.com', 'https://www.bayt.com', NULL, 0, '["AE","SA","KW","QA","BH","OM","EG","LB","JO"]', 'en', 0, 'playwright', 'HIGH', 'gcc_tech', '50,000+ tech jobs', 120),
-- Europe
('welcometothejungle', 'Welcome to the Jungle', 'https://www.welcometothejungle.com', 'https://api.welcometothejungle.com/api/v1/jobs', 1, '["FR","DE","ES","IT","NL","BE","PT","UK"]', 'en', 0, 'api', 'CRITICAL', 'eu_startup_tech', '20,000+ tech jobs', 60),
('stepstone_europe', 'StepStone Europe', 'https://www.stepstone.de', NULL, 0, '["DE","AT","BE","NL"]', 'de', 1, 'playwright', 'HIGH', 'dach_tech', '25,000+ tech jobs', 120),
-- Africa
('jobberman_africa', 'Jobberman Africa', 'https://www.jobberman.com', NULL, 0, '["NG","GH"]', 'en', 0, 'playwright', 'MEDIUM', 'africa_tech', '3,000+ tech jobs', 240),
-- Niche / Specialty
('aijobs_net', 'AI Jobs', 'https://aijobs.net', 'https://aijobs.net/feed', 0, '["GLOBAL"]', 'en', 0, 'rss', 'HIGH', 'ai_ml_research', '2,000+ AI jobs', 60),
('web3_career', 'Web3 Career', 'https://web3.career', 'https://web3.career/api', 1, '["GLOBAL"]', 'en', 0, 'api', 'MEDIUM', 'web3_blockchain', '3,000+ web3 jobs', 120),
('gamedevjobs', 'GameDev Jobs', 'https://www.gamedevjobs.io', NULL, 0, '["GLOBAL"]', 'en', 0, 'playwright', 'MEDIUM', 'game_development', '1,500+ game dev jobs', 240),
('devrelcareers', 'DevRel Careers', 'https://devrelcareers.com/jobs', NULL, 0, '["GLOBAL"]', 'en', 0, 'playwright', 'MEDIUM', 'developer_advocacy', '500+ devrel jobs', 240);
