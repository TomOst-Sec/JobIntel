-- 018: NEXUS Platform — Full component tables for the god-platform.
-- Skill Graph DAG, Company Reviews, Freelance Marketplace, Startup Hub,
-- AI Agent Config, Enhanced Posts, Bidirectional Matching.

-- ═══════════════════════════════════════════════════════════
-- COMPONENT 1: IDENTITY ENGINE — Skill Graph DAG
-- ═══════════════════════════════════════════════════════════

-- Skill taxonomy: the canonical set of skills with hierarchy
CREATE TABLE IF NOT EXISTS skill_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'general',  -- language, framework, tool, concept, domain
    parent_id INTEGER REFERENCES skill_nodes(id),
    description TEXT,
    icon_url TEXT,
    is_verified INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_nodes_slug ON skill_nodes(slug);
CREATE INDEX IF NOT EXISTS idx_skill_nodes_category ON skill_nodes(category);
CREATE INDEX IF NOT EXISTS idx_skill_nodes_parent ON skill_nodes(parent_id);

-- Skill relationships: directed edges (e.g., "React" requires "JavaScript")
CREATE TABLE IF NOT EXISTS skill_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_skill_id INTEGER NOT NULL REFERENCES skill_nodes(id),
    to_skill_id INTEGER NOT NULL REFERENCES skill_nodes(id),
    relationship TEXT NOT NULL DEFAULT 'requires',  -- requires, related_to, part_of, alternative_to
    weight REAL DEFAULT 1.0,
    UNIQUE(from_skill_id, to_skill_id, relationship)
);
CREATE INDEX IF NOT EXISTS idx_skill_edges_from ON skill_edges(from_skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_edges_to ON skill_edges(to_skill_id);

-- User skill proficiency: auto-assessed + self-reported + verified
CREATE TABLE IF NOT EXISTS user_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    skill_id INTEGER NOT NULL REFERENCES skill_nodes(id),
    proficiency_level REAL DEFAULT 0,         -- 0-100, AI-computed from code analysis
    self_reported_level REAL,                 -- 0-100, user's own assessment (optional)
    verified INTEGER DEFAULT 0,               -- 1 = confirmed by code analysis or peer
    source TEXT DEFAULT 'manual',             -- manual, github, kaggle, stackoverflow, contract
    last_used_at TEXT,                        -- when they last used this skill in a project
    context TEXT,                             -- 'personal', 'production', 'oss', 'enterprise'
    evidence_count INTEGER DEFAULT 0,         -- how many repos/projects demonstrate this
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_proficiency ON user_skills(proficiency_level DESC);

-- Credential verification records
CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    credential_type TEXT NOT NULL,            -- employment, education, certification, income
    issuer TEXT NOT NULL,                     -- company name, university, cert provider
    title TEXT NOT NULL,                      -- job title, degree, cert name
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    verification_method TEXT,                 -- domain_email, api, blockchain, manual
    verification_status TEXT DEFAULT 'pending', -- pending, verified, rejected, expired
    verified_at TEXT,
    metadata TEXT,                            -- JSON: extra fields (cert ID, transcript link, etc.)
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_credentials_user ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);

-- ═══════════════════════════════════════════════════════════
-- COMPONENT 2: SIGNAL LAYER — Company Reviews + Enhanced Posts
-- ═══════════════════════════════════════════════════════════

-- Company reviews: attributed-but-protected
CREATE TABLE IF NOT EXISTS company_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id),
    employment_verified INTEGER DEFAULT 0,    -- confirmed via email/payroll
    employment_role TEXT,                     -- their role at the company
    employment_start TEXT,
    employment_end TEXT,
    is_current_employee INTEGER DEFAULT 0,

    -- Review dimensions (1-5 stars each)
    engineering_culture REAL,
    management_quality REAL,
    compensation_fairness REAL,
    work_life_balance REAL,
    growth_trajectory REAL,
    interview_quality REAL,

    overall_rating REAL,                     -- computed average
    title TEXT NOT NULL,
    pros TEXT,
    cons TEXT,
    advice_to_management TEXT,

    -- Protection & moderation
    is_flagged INTEGER DEFAULT 0,
    flag_reason TEXT,
    employer_response TEXT,
    employer_response_at TEXT,
    ai_sentiment_score REAL,                 -- AI analysis of review quality
    ai_manipulation_score REAL DEFAULT 0,    -- review-bombing detection

    status TEXT DEFAULT 'active',            -- active, hidden, under_review
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_company_reviews_company ON company_reviews(company_name);
CREATE INDEX IF NOT EXISTS idx_company_reviews_author ON company_reviews(author_id);
CREATE INDEX IF NOT EXISTS idx_company_reviews_rating ON company_reviews(overall_rating DESC);

-- Review helpfulness votes
CREATE TABLE IF NOT EXISTS review_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES company_reviews(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    vote_type TEXT NOT NULL DEFAULT 'helpful', -- helpful, unhelpful
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(review_id, user_id)
);

-- Enhanced posts: NEXUS content types
-- Alter existing posts table to support new types
-- (We add columns via ALTER TABLE since posts already exists)
-- post_type now supports: build_log, tech_take, deep_dive, question, signal_post, launch, status, article
-- We add extra fields for rich content

CREATE TABLE IF NOT EXISTS post_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
    repo_url TEXT,                            -- for build_log posts
    project_url TEXT,                         -- for launch posts
    code_snippet TEXT,                        -- embedded code
    code_language TEXT,                       -- syntax highlight language
    tags TEXT DEFAULT '[]',                   -- JSON array of topic tags
    ai_substance_score REAL DEFAULT 0,       -- AI content quality score (0-100)
    ai_originality_score REAL DEFAULT 0,     -- AI originality detection
    is_engagement_bait INTEGER DEFAULT 0,    -- anti-cringe flag
    view_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_post_metadata_post ON post_metadata(post_id);
CREATE INDEX IF NOT EXISTS idx_post_metadata_substance ON post_metadata(ai_substance_score DESC);

-- Post bookmarks
CREATE TABLE IF NOT EXISTS post_bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(post_id, user_id)
);

-- ═══════════════════════════════════════════════════════════
-- COMPONENT 3: MATCHING ENGINE — Bidirectional + Freelance + Startup
-- ═══════════════════════════════════════════════════════════

-- Bidirectional match records
CREATE TABLE IF NOT EXISTS job_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    job_id INTEGER NOT NULL REFERENCES jobs(id),

    -- Candidate score for job
    technical_fit REAL DEFAULT 0,
    culture_fit REAL DEFAULT 0,
    comp_alignment REAL DEFAULT 0,
    growth_fit REAL DEFAULT 0,
    candidate_overall REAL DEFAULT 0,

    -- Job score for candidate
    company_health REAL DEFAULT 0,
    team_quality REAL DEFAULT 0,
    role_clarity REAL DEFAULT 0,
    interview_quality REAL DEFAULT 0,
    job_overall REAL DEFAULT 0,

    -- Combined
    match_confidence REAL DEFAULT 0,         -- average of both sides
    match_explanation TEXT,                   -- AI-generated human-readable explanation
    status TEXT DEFAULT 'discovered',        -- discovered, presented, interested, applied, interviewing, offered, hired, rejected
    presented_at TEXT,
    user_response TEXT,                      -- interested, not_interested, saved
    responded_at TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_job_matches_user ON job_matches(user_id, match_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_job_matches_job ON job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_status ON job_matches(status);

-- Freelance projects
CREATE TABLE IF NOT EXISTS freelance_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    scope TEXT,                              -- brief, project, ongoing
    budget_type TEXT DEFAULT 'fixed',        -- fixed, hourly, retainer
    budget_min REAL,
    budget_max REAL,
    currency TEXT DEFAULT 'USD',
    duration_days INTEGER,
    required_skills TEXT DEFAULT '[]',       -- JSON array of skill slugs
    experience_level TEXT DEFAULT 'mid',     -- junior, mid, senior, expert

    status TEXT DEFAULT 'open',              -- draft, open, in_progress, completed, cancelled
    visibility TEXT DEFAULT 'public',        -- public, invite_only
    applicant_count INTEGER DEFAULT 0,
    max_applicants INTEGER DEFAULT 50,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_freelance_projects_status ON freelance_projects(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_freelance_projects_client ON freelance_projects(client_id);

-- Freelance contracts
CREATE TABLE IF NOT EXISTS freelance_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES freelance_projects(id),
    freelancer_id INTEGER NOT NULL REFERENCES users(id),
    client_id INTEGER NOT NULL REFERENCES users(id),

    rate_type TEXT DEFAULT 'fixed',          -- fixed, hourly
    rate_amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    estimated_hours INTEGER,

    status TEXT DEFAULT 'pending',           -- pending, active, paused, completed, disputed, cancelled
    started_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT,

    -- Escrow
    escrow_amount REAL DEFAULT 0,
    escrow_released REAL DEFAULT 0,
    platform_fee_pct REAL DEFAULT 0.07,      -- 7% default take rate

    -- IP/NDA
    ip_assignment INTEGER DEFAULT 1,         -- IP transfers to client
    nda_signed INTEGER DEFAULT 0,

    -- Ratings (after completion)
    client_rating REAL,
    client_review TEXT,
    freelancer_rating REAL,
    freelancer_review TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_freelance_contracts_freelancer ON freelance_contracts(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelance_contracts_client ON freelance_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_freelance_contracts_status ON freelance_contracts(status);

-- Contract milestones
CREATE TABLE IF NOT EXISTS contract_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES freelance_contracts(id),
    title TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'pending',           -- pending, in_progress, submitted, approved, paid, disputed
    submitted_at TEXT,
    approved_at TEXT,
    paid_at TEXT,
    revision_notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_contract ON contract_milestones(contract_id);

-- Freelance applications
CREATE TABLE IF NOT EXISTS freelance_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES freelance_projects(id),
    freelancer_id INTEGER NOT NULL REFERENCES users(id),
    cover_letter TEXT,
    proposed_rate REAL,
    proposed_duration_days INTEGER,
    match_score REAL DEFAULT 0,              -- AI-computed match
    status TEXT DEFAULT 'pending',           -- pending, shortlisted, accepted, rejected, withdrawn
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, freelancer_id)
);

-- Startup profiles
CREATE TABLE IF NOT EXISTS startup_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id), -- founder who created the profile
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tagline TEXT,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    stage TEXT DEFAULT 'pre_seed',           -- idea, pre_seed, seed, series_a, series_b, growth, public
    industry TEXT,
    founded_date TEXT,
    team_size INTEGER DEFAULT 1,
    location TEXT,
    remote_friendly INTEGER DEFAULT 1,

    -- Funding
    funding_total REAL DEFAULT 0,
    last_round_amount REAL,
    last_round_date TEXT,
    investors TEXT DEFAULT '[]',             -- JSON array

    -- Traction
    revenue_range TEXT,                      -- pre-revenue, 0-10k, 10k-100k, 100k-1m, 1m+
    user_count_range TEXT,
    growth_rate_pct REAL,

    -- Team
    team_members TEXT DEFAULT '[]',          -- JSON array of {user_id, role, equity_pct}
    open_roles TEXT DEFAULT '[]',            -- JSON array of role descriptions
    looking_for_cofounder INTEGER DEFAULT 0,
    cofounder_skills_needed TEXT DEFAULT '[]', -- JSON array of skill slugs

    -- Equity calculator data
    total_shares INTEGER DEFAULT 10000000,
    option_pool_pct REAL DEFAULT 15.0,
    last_valuation REAL,

    status TEXT DEFAULT 'active',
    featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_startup_profiles_slug ON startup_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_startup_profiles_stage ON startup_profiles(stage);
CREATE INDEX IF NOT EXISTS idx_startup_profiles_cofounder ON startup_profiles(looking_for_cofounder)
    WHERE looking_for_cofounder = 1;

-- Co-founder match records
CREATE TABLE IF NOT EXISTS cofounder_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    startup_id INTEGER NOT NULL REFERENCES startup_profiles(id),
    match_score REAL DEFAULT 0,
    skill_complement_score REAL DEFAULT 0,   -- how well skills complement existing team
    culture_match_score REAL DEFAULT 0,
    match_explanation TEXT,
    status TEXT DEFAULT 'suggested',         -- suggested, interested, connected, passed
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, startup_id)
);

-- ═══════════════════════════════════════════════════════════
-- COMPONENT 4: TRANSACTION LAYER — Extended
-- ═══════════════════════════════════════════════════════════

-- Offer comparison records
CREATE TABLE IF NOT EXISTS offer_comparisons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    offers TEXT NOT NULL DEFAULT '[]',       -- JSON array of offer objects
    ai_analysis TEXT,                        -- AI-generated comparison
    recommended_offer_idx INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════
-- AI SUBSTRATE — Personal AI Agent + Enhanced Provider Config
-- ═══════════════════════════════════════════════════════════

-- Personal AI Agent configuration per user
CREATE TABLE IF NOT EXISTS ai_agent_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    is_active INTEGER DEFAULT 1,
    agent_mode TEXT DEFAULT 'monitor',       -- monitor, alert, autonomous

    -- Search parameters
    target_roles TEXT DEFAULT '[]',          -- JSON: ["Senior Backend", "Staff Engineer"]
    target_companies TEXT DEFAULT '[]',      -- JSON: ["Google", "Stripe"]
    excluded_companies TEXT DEFAULT '[]',
    min_salary INTEGER,
    max_commute_minutes INTEGER,
    remote_preference TEXT DEFAULT 'any',    -- remote_only, hybrid, onsite, any
    company_stage_prefs TEXT DEFAULT '[]',   -- JSON: ["startup", "growth", "enterprise"]
    culture_values TEXT DEFAULT '[]',        -- JSON: ["innovation", "wlb", "growth"]

    -- Alert settings
    alert_frequency TEXT DEFAULT 'daily',    -- instant, daily, weekly
    alert_min_match_score REAL DEFAULT 70,   -- only alert on matches above this
    email_alerts INTEGER DEFAULT 1,
    push_alerts INTEGER DEFAULT 0,

    -- Agent capabilities
    auto_apply INTEGER DEFAULT 0,            -- autonomous application
    auto_respond INTEGER DEFAULT 0,          -- respond to recruiter messages
    auto_negotiate INTEGER DEFAULT 0,        -- AI negotiation within parameters

    -- Stats
    total_matches_found INTEGER DEFAULT 0,
    total_alerts_sent INTEGER DEFAULT 0,
    last_scan_at TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_config_user ON ai_agent_config(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_agent_config_active ON ai_agent_config(is_active)
    WHERE is_active = 1;

-- Agent activity log
CREATE TABLE IF NOT EXISTS ai_agent_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action_type TEXT NOT NULL,               -- scan, match_found, alert_sent, applied, responded
    details TEXT,                            -- JSON with action details
    job_id INTEGER REFERENCES jobs(id),
    match_id INTEGER REFERENCES job_matches(id),
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_log_user ON ai_agent_log(user_id, created_at DESC);

-- Salary intelligence: verified data points
CREATE TABLE IF NOT EXISTS salary_data_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),    -- nullable for scraped data
    company_name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    level TEXT,                              -- junior, mid, senior, staff, principal, director, vp
    location TEXT,
    remote INTEGER DEFAULT 0,

    base_salary REAL,
    equity_value REAL,
    bonus REAL,
    total_comp REAL,
    currency TEXT DEFAULT 'USD',

    source TEXT DEFAULT 'self_report',       -- self_report, payroll_api, offer_letter, scraped
    verified INTEGER DEFAULT 0,
    year INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_salary_data_company ON salary_data_points(company_name);
CREATE INDEX IF NOT EXISTS idx_salary_data_role ON salary_data_points(role_title);

-- ═══════════════════════════════════════════════════════════
-- SEED: Initial skill taxonomy (top 200 skills)
-- ═══════════════════════════════════════════════════════════

-- Languages
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('JavaScript', 'javascript', 'language', 'Dynamic programming language for web development'),
('TypeScript', 'typescript', 'language', 'Typed superset of JavaScript'),
('Python', 'python', 'language', 'General-purpose programming language'),
('Rust', 'rust', 'language', 'Systems programming language focused on safety'),
('Go', 'go', 'language', 'Statically typed language by Google'),
('Java', 'java', 'language', 'Object-oriented programming language'),
('C++', 'cpp', 'language', 'High-performance systems language'),
('C', 'c', 'language', 'Low-level systems programming language'),
('C#', 'csharp', 'language', 'Microsoft .NET programming language'),
('Ruby', 'ruby', 'language', 'Dynamic programming language'),
('PHP', 'php', 'language', 'Server-side scripting language'),
('Swift', 'swift', 'language', 'Apple platform programming language'),
('Kotlin', 'kotlin', 'language', 'Modern JVM language by JetBrains'),
('Scala', 'scala', 'language', 'Functional/OOP language on JVM'),
('Elixir', 'elixir', 'language', 'Functional language on BEAM VM'),
('Haskell', 'haskell', 'language', 'Pure functional programming language'),
('Dart', 'dart', 'language', 'Client-optimized language by Google'),
('R', 'r', 'language', 'Statistical computing language'),
('SQL', 'sql', 'language', 'Structured Query Language for databases'),
('Shell', 'shell', 'language', 'Unix shell scripting'),
('Solidity', 'solidity', 'language', 'Smart contract programming language'),
('Lua', 'lua', 'language', 'Lightweight scripting language'),
('Zig', 'zig', 'language', 'Low-level systems programming language');

-- Frontend frameworks
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('React', 'react', 'framework', 'UI library by Meta'),
('Next.js', 'nextjs', 'framework', 'React framework with SSR'),
('Vue', 'vue', 'framework', 'Progressive JavaScript framework'),
('Angular', 'angular', 'framework', 'TypeScript-based web framework by Google'),
('Svelte', 'svelte', 'framework', 'Compile-time UI framework'),
('Solid.js', 'solidjs', 'framework', 'Reactive UI library'),
('Astro', 'astro', 'framework', 'Content-focused web framework'),
('Remix', 'remix', 'framework', 'Full-stack React framework'),
('Tailwind CSS', 'tailwindcss', 'framework', 'Utility-first CSS framework'),
('React Native', 'react-native', 'framework', 'Cross-platform mobile framework'),
('Flutter', 'flutter', 'framework', 'Cross-platform UI toolkit by Google'),
('Electron', 'electron', 'framework', 'Desktop app framework');

-- Backend frameworks
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('Node.js', 'nodejs', 'framework', 'JavaScript runtime'),
('Express', 'express', 'framework', 'Minimalist Node.js web framework'),
('FastAPI', 'fastapi', 'framework', 'Modern Python web framework'),
('Django', 'django', 'framework', 'Python web framework'),
('Flask', 'flask', 'framework', 'Lightweight Python web framework'),
('Spring Boot', 'spring-boot', 'framework', 'Java application framework'),
('Rails', 'rails', 'framework', 'Ruby web framework'),
('Laravel', 'laravel', 'framework', 'PHP web framework'),
('ASP.NET', 'aspnet', 'framework', '.NET web framework'),
('Phoenix', 'phoenix', 'framework', 'Elixir web framework'),
('Gin', 'gin', 'framework', 'Go HTTP web framework'),
('Actix', 'actix', 'framework', 'Rust web framework'),
('GraphQL', 'graphql', 'framework', 'Query language for APIs'),
('gRPC', 'grpc', 'framework', 'High-performance RPC framework'),
('tRPC', 'trpc', 'framework', 'End-to-end typesafe APIs');

-- Databases
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('PostgreSQL', 'postgresql', 'tool', 'Advanced open-source relational database'),
('MySQL', 'mysql', 'tool', 'Popular relational database'),
('MongoDB', 'mongodb', 'tool', 'Document-oriented NoSQL database'),
('Redis', 'redis', 'tool', 'In-memory data store'),
('Elasticsearch', 'elasticsearch', 'tool', 'Distributed search engine'),
('SQLite', 'sqlite', 'tool', 'Embedded relational database'),
('DynamoDB', 'dynamodb', 'tool', 'AWS managed NoSQL database'),
('Cassandra', 'cassandra', 'tool', 'Distributed wide-column store'),
('Neo4j', 'neo4j', 'tool', 'Graph database'),
('ClickHouse', 'clickhouse', 'tool', 'Column-oriented analytics database'),
('Supabase', 'supabase', 'tool', 'Open-source Firebase alternative');

-- Cloud & DevOps
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('AWS', 'aws', 'tool', 'Amazon Web Services cloud platform'),
('GCP', 'gcp', 'tool', 'Google Cloud Platform'),
('Azure', 'azure', 'tool', 'Microsoft cloud platform'),
('Docker', 'docker', 'tool', 'Containerization platform'),
('Kubernetes', 'kubernetes', 'tool', 'Container orchestration'),
('Terraform', 'terraform', 'tool', 'Infrastructure as Code'),
('CI/CD', 'ci-cd', 'concept', 'Continuous Integration/Deployment'),
('GitHub Actions', 'github-actions', 'tool', 'GitHub CI/CD'),
('Vercel', 'vercel', 'tool', 'Frontend deployment platform'),
('Nginx', 'nginx', 'tool', 'Web server and reverse proxy'),
('Linux', 'linux', 'tool', 'Open-source operating system'),
('Prometheus', 'prometheus', 'tool', 'Monitoring and alerting'),
('Grafana', 'grafana', 'tool', 'Observability platform');

-- AI/ML
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('Machine Learning', 'machine-learning', 'domain', 'ML algorithms and techniques'),
('Deep Learning', 'deep-learning', 'domain', 'Neural network architectures'),
('PyTorch', 'pytorch', 'framework', 'ML framework by Meta'),
('TensorFlow', 'tensorflow', 'framework', 'ML framework by Google'),
('NLP', 'nlp', 'domain', 'Natural Language Processing'),
('Computer Vision', 'computer-vision', 'domain', 'Image and video analysis'),
('LLMs', 'llms', 'domain', 'Large Language Models'),
('RAG', 'rag', 'concept', 'Retrieval-Augmented Generation'),
('MLOps', 'mlops', 'concept', 'ML operations and deployment'),
('Data Science', 'data-science', 'domain', 'Data analysis and modeling'),
('Pandas', 'pandas', 'framework', 'Python data analysis library'),
('Scikit-learn', 'scikit-learn', 'framework', 'Python ML library'),
('Hugging Face', 'hugging-face', 'tool', 'ML model hub and tools'),
('LangChain', 'langchain', 'framework', 'LLM application framework'),
('CUDA', 'cuda', 'tool', 'GPU parallel computing platform');

-- Concepts & Architecture
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('System Design', 'system-design', 'concept', 'Designing large-scale systems'),
('Distributed Systems', 'distributed-systems', 'concept', 'Multi-node computing'),
('Microservices', 'microservices', 'concept', 'Service-oriented architecture'),
('REST APIs', 'rest-apis', 'concept', 'RESTful API design'),
('Event-Driven Architecture', 'event-driven', 'concept', 'Asynchronous messaging patterns'),
('Testing', 'testing', 'concept', 'Software testing practices'),
('Security', 'security', 'domain', 'Application and infrastructure security'),
('DevOps', 'devops', 'concept', 'Development and operations practices'),
('Agile', 'agile', 'concept', 'Agile software development'),
('Data Structures', 'data-structures', 'concept', 'Fundamental data structures'),
('Algorithms', 'algorithms', 'concept', 'Algorithm design and analysis'),
('Design Patterns', 'design-patterns', 'concept', 'Software design patterns'),
('Clean Architecture', 'clean-architecture', 'concept', 'Architectural principles'),
('Domain-Driven Design', 'ddd', 'concept', 'Software modeling approach'),
('OAuth', 'oauth', 'concept', 'Authorization framework'),
('WebSockets', 'websockets', 'concept', 'Real-time bidirectional communication'),
('Message Queues', 'message-queues', 'concept', 'Async message processing');

-- Data tools
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('Kafka', 'kafka', 'tool', 'Distributed event streaming'),
('RabbitMQ', 'rabbitmq', 'tool', 'Message broker'),
('Airflow', 'airflow', 'tool', 'Workflow orchestration'),
('dbt', 'dbt', 'tool', 'Data transformation tool'),
('Spark', 'spark', 'tool', 'Distributed computing engine'),
('Snowflake', 'snowflake', 'tool', 'Cloud data warehouse'),
('BigQuery', 'bigquery', 'tool', 'Google analytics database');

-- Mobile
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('iOS Development', 'ios', 'domain', 'Apple mobile platform'),
('Android Development', 'android', 'domain', 'Google mobile platform'),
('SwiftUI', 'swiftui', 'framework', 'Apple declarative UI'),
('Jetpack Compose', 'jetpack-compose', 'framework', 'Android declarative UI');

-- Web3
INSERT OR IGNORE INTO skill_nodes (name, slug, category, description) VALUES
('Blockchain', 'blockchain', 'domain', 'Distributed ledger technology'),
('Web3', 'web3', 'domain', 'Decentralized web development'),
('Smart Contracts', 'smart-contracts', 'concept', 'Self-executing blockchain contracts'),
('Ethereum', 'ethereum', 'tool', 'Smart contract platform');

-- Seed key skill edges (requires relationships)
INSERT OR IGNORE INTO skill_edges (from_skill_id, to_skill_id, relationship)
SELECT f.id, t.id, 'requires' FROM skill_nodes f, skill_nodes t
WHERE (f.slug = 'typescript' AND t.slug = 'javascript')
   OR (f.slug = 'react' AND t.slug = 'javascript')
   OR (f.slug = 'nextjs' AND t.slug = 'react')
   OR (f.slug = 'vue' AND t.slug = 'javascript')
   OR (f.slug = 'angular' AND t.slug = 'typescript')
   OR (f.slug = 'remix' AND t.slug = 'react')
   OR (f.slug = 'express' AND t.slug = 'nodejs')
   OR (f.slug = 'nodejs' AND t.slug = 'javascript')
   OR (f.slug = 'fastapi' AND t.slug = 'python')
   OR (f.slug = 'django' AND t.slug = 'python')
   OR (f.slug = 'flask' AND t.slug = 'python')
   OR (f.slug = 'spring-boot' AND t.slug = 'java')
   OR (f.slug = 'rails' AND t.slug = 'ruby')
   OR (f.slug = 'laravel' AND t.slug = 'php')
   OR (f.slug = 'phoenix' AND t.slug = 'elixir')
   OR (f.slug = 'gin' AND t.slug = 'go')
   OR (f.slug = 'actix' AND t.slug = 'rust')
   OR (f.slug = 'react-native' AND t.slug = 'react')
   OR (f.slug = 'flutter' AND t.slug = 'dart')
   OR (f.slug = 'swiftui' AND t.slug = 'swift')
   OR (f.slug = 'jetpack-compose' AND t.slug = 'kotlin')
   OR (f.slug = 'deep-learning' AND t.slug = 'machine-learning')
   OR (f.slug = 'pytorch' AND t.slug = 'python')
   OR (f.slug = 'tensorflow' AND t.slug = 'python')
   OR (f.slug = 'pandas' AND t.slug = 'python')
   OR (f.slug = 'scikit-learn' AND t.slug = 'python')
   OR (f.slug = 'langchain' AND t.slug = 'python')
   OR (f.slug = 'llms' AND t.slug = 'deep-learning')
   OR (f.slug = 'rag' AND t.slug = 'llms')
   OR (f.slug = 'nlp' AND t.slug = 'machine-learning')
   OR (f.slug = 'computer-vision' AND t.slug = 'deep-learning')
   OR (f.slug = 'kubernetes' AND t.slug = 'docker')
   OR (f.slug = 'terraform' AND t.slug = 'aws')
   OR (f.slug = 'system-design' AND t.slug = 'distributed-systems')
   OR (f.slug = 'microservices' AND t.slug = 'rest-apis')
   OR (f.slug = 'smart-contracts' AND t.slug = 'solidity')
   OR (f.slug = 'ethereum' AND t.slug = 'blockchain');
