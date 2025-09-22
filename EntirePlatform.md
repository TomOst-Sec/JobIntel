# JOBINTEL COMPLETE PLATFORM MAP

> Exhaustive audit of every endpoint, page, table, scraper, and component.
> Goal: Identify every weak spot blocking us from becoming the platform that replaces LinkedIn.

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [API Endpoints (150+)](#2-api-endpoints)
3. [Frontend Routes (40+)](#3-frontend-routes)
4. [Database Schema (70+ tables)](#4-database-schema)
5. [Scrapers & Data Pipeline](#5-scrapers--data-pipeline)
6. [UI Component Library](#6-ui-component-library)
7. [Background Jobs & Scheduler](#7-background-jobs)
8. [Configuration & Environment](#8-configuration)
9. [CRITICAL WEAKNESSES](#9-critical-weaknesses)
10. [APPLY FLOW PROBLEM](#10-apply-flow-problem)
11. [NEXUS GAP ANALYSIS](#11-nexus-gap-analysis)
12. [PRIORITY ROADMAP](#12-priority-roadmap)

---

## 1. ARCHITECTURE OVERVIEW

```
Frontend (Next.js 16, React 19, Tailwind 4)
  ↕ HTTP / SSE
Backend (FastAPI, Python 3.14, SQLite)
  ↕
SQLite DB (WAL mode, 70+ tables, 15 migrations)
  ↕
Scrapers → 8 sources → 1,400+ jobs
  ↕
AI Layer → Claude (Anthropic) + OpenRouter
  ↕
External APIs → Stripe, Resend, Twilio, OAuth (Google/GitHub)
```

**Stack:** Next.js 16 + FastAPI + SQLite + Claude AI
**Hosting:** localhost (not deployed)
**Auth:** JWT + refresh tokens + OAuth (Google/GitHub) + Phone OTP

---

## 2. API ENDPOINTS

### 2.1 Public (No Auth)

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/api/v1/health` | Health check + DB stats |
| 2 | POST | `/api/v1/public/ghost-check` | Free ghost job checker (10/hr rate limit) |
| 3 | POST | `/api/v1/public/salary-check` | Free salary benchmark tool (10/hr rate limit) |
| 4 | GET | `/api/v1/public/reports/weekly/latest` | Latest weekly report |
| 5 | GET | `/api/v1/public/reports/weekly/{slug}` | Report by slug |
| 6 | GET | `/api/v1/public/radar/preview` | Top 5 company radar |
| 7 | GET | `/api/v1/jobs/stats` | Total jobs, companies, markets |
| 8 | GET | `/api/v1/jobs/markets` | Market overview |
| 9 | GET | `/api/v1/billing/plans` | Pricing plans |
| 10 | GET | `/api/v1/intelligence/ghost/stats` | Aggregate ghost stats |
| 11 | GET | `/api/v1/intelligence/signals` | Market signals |
| 12 | GET | `/api/v1/market/signals/snapshot` | Full market intelligence |
| 13 | GET | `/api/v1/market/signals/velocity` | Hiring velocity |
| 14 | GET | `/api/v1/market/signals/salary-trends` | Salary spikes |
| 15 | GET | `/api/v1/market/signals/skills` | Emerging/declining skills |
| 16 | GET | `/api/v1/market/signals/ghost-epidemics` | Ghost job epidemics |
| 17 | GET | `/api/v1/market/signals/layoff-precursors` | Pre-layoff patterns |
| 18 | GET | `/api/v1/gamification/xp/events` | XP event types |
| 19 | GET | `/api/v1/gamification/leaderboard` | XP leaderboard |
| 20 | GET | `/api/v1/gamification/levels` | Level thresholds |
| 21 | GET | `/api/v1/enrichment/enrich/queue/stats` | Enrichment queue stats |
| 22 | GET | `/api/v1/enrichment/ghost-truth/stats` | Ghost type stats |
| 23 | GET | `/api/v1/intelligence/salary/h1b` | H1B salary data |
| 24 | GET | `/api/v1/intelligence/salary/transparency` | Salary transparency grades |
| 25 | GET | `/api/v1/content/seo/*` | SEO pages, sitemap, structured data |
| 26 | GET | `/api/v1/feed` | Public activity feed |

### 2.2 Auth (Registration/Login)

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 27 | POST | `/api/v1/auth/register` | Create account |
| 28 | POST | `/api/v1/auth/login` | Login |
| 29 | POST | `/api/v1/auth/refresh` | Rotate tokens |
| 30 | GET | `/api/v1/auth/me` | Current user profile |
| 31 | POST | `/api/v1/auth/waitlist` | Join waitlist |

### 2.3 OAuth

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 32 | GET | `/api/v1/auth/oauth/google/url` | Google OAuth URL |
| 33 | POST | `/api/v1/auth/oauth/google/callback` | Google code exchange |
| 34 | GET | `/api/v1/auth/oauth/github/url` | GitHub OAuth URL |
| 35 | POST | `/api/v1/auth/oauth/github/callback` | GitHub code exchange |
| 36 | POST | `/api/v1/auth/oauth/phone/send-otp` | Send SMS OTP |
| 37 | POST | `/api/v1/auth/oauth/phone/verify` | Verify OTP |
| 38 | POST | `/api/v1/auth/oauth/email/send-verification` | Send email code |
| 39 | POST | `/api/v1/auth/oauth/email/verify` | Verify email code |
| 40 | GET | `/api/v1/auth/oauth/ai-providers` | List AI providers |
| 41 | POST | `/api/v1/auth/oauth/ai-providers/connect` | Connect AI provider |
| 42 | POST | `/api/v1/auth/oauth/ai-providers/disconnect` | Disconnect provider |
| 43 | GET | `/api/v1/auth/oauth/linked-accounts` | Linked OAuth accounts |
| 44 | DELETE | `/api/v1/auth/oauth/linked-accounts/{provider}` | Unlink OAuth |

### 2.4 Jobs (Requires Auth for some)

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 45 | GET | `/api/v1/jobs` | Optional | Search/filter jobs (paginated) |
| 46 | POST | `/api/v1/jobs/{id}/report` | Yes | Report job (expired/ghost/broken) |
| 47 | GET | `/api/v1/jobs/salary-stats` | Yes | Salary stats by category |
| 48 | GET | `/api/v1/jobs/skill-demand` | Yes | Skill demand analysis |
| 49 | GET | `/api/v1/jobs/scaling-companies` | Yes | Rapidly hiring companies |

### 2.5 Companies

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 50 | GET | `/api/v1/companies/{name}` | Yes | Company deep dive |
| 51 | GET | `/api/v1/companies/{name}/jobs` | Optional | Company's jobs |
| 52 | GET | `/api/v1/companies/{name}/timeline` | Yes | 90-day posting timeline |

### 2.6 Applications

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 53 | POST | `/api/v1/applications` | Save/track application |
| 54 | GET | `/api/v1/applications` | List applications |
| 55 | GET | `/api/v1/applications/stats` | Count by status |
| 56 | PUT | `/api/v1/applications/{id}` | Update status/notes |
| 57 | DELETE | `/api/v1/applications/{id}` | Delete |
| 58 | POST | `/api/v1/applications/{id}/note` | Add timestamped note |

### 2.7 Chat (AI Career Coach)

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 59 | POST | `/api/v1/chat/conversations` | Create conversation |
| 60 | GET | `/api/v1/chat/conversations` | List conversations |
| 61 | POST | `/api/v1/chat/conversations/{id}/messages` | Send + stream response (SSE) |
| 62 | POST | `/api/v1/chat/quick-query` | One-shot query |

### 2.8 CV & CV Intelligence

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 63 | POST | `/api/v1/cv/upload` | Upload CV (PDF/DOCX) |
| 64 | POST | `/api/v1/cv/analyze/{cv_id}` | Trigger AI analysis |
| 65 | GET | `/api/v1/cv/analysis/{cv_id}` | Get analyses |
| 66 | GET | `/api/v1/cv/uploads` | List uploads |
| 67 | POST | `/api/v1/cv-intelligence/upload` | Upload + parse CV |
| 68 | POST | `/api/v1/cv-intelligence/parse-text` | Parse CV from text |
| 69 | GET | `/api/v1/cv-intelligence/dna` | Get CV DNA |
| 70 | POST | `/api/v1/cv-intelligence/enrich` | Enrich CV |
| 71 | POST | `/api/v1/cv-intelligence/tailor` | Tailor CV for job |
| 72 | GET | `/api/v1/cv-intelligence/tailored` | List tailored CVs |
| 73 | GET | `/api/v1/cv-intelligence/tailored/{id}` | Get tailored CV |
| 74 | POST | `/api/v1/cv-intelligence/cover-letter` | Generate cover letter |
| 75 | GET | `/api/v1/cv-intelligence/cover-letters` | List cover letters |
| 76 | GET | `/api/v1/cv-intelligence/match/{job_id}` | Score CV-job match |
| 77-80 | Various | `/api/v1/cv-intelligence/applications*` | Application tracking (v2) |

### 2.9 Intelligence & Enrichment

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 81 | GET | `/api/v1/intelligence/ghost/{job_id}` | Ghost analysis for job |
| 82 | POST | `/api/v1/intelligence/ghost/scan` | Batch ghost scan |
| 83 | GET | `/api/v1/intelligence/radar/layoff/{company}` | Layoff risk |
| 84 | GET | `/api/v1/intelligence/radar/layoff` | All company layoff scan |
| 85 | GET | `/api/v1/intelligence/radar/ipo/{company}` | IPO signals |
| 86 | GET | `/api/v1/intelligence/radar/ipo` | All IPO candidates |
| 87 | GET | `/api/v1/intelligence/company/{company}` | Deep company intel |
| 88 | GET | `/api/v1/intelligence/salary/reality/{job_id}` | Salary reality check |
| 89 | GET | `/api/v1/intelligence/salary/company/{company}` | Company salary data |
| 90 | GET | `/api/v1/intelligence/salary/benchmarks` | Role benchmarks |
| 91 | POST | `/api/v1/enrichment/enrich/{job_id}` | Enrich job (47 fields) |
| 92 | GET | `/api/v1/enrichment/enriched/{job_id}` | Get enriched data |
| 93 | POST | `/api/v1/enrichment/enrich/batch` | Batch enrich |
| 94 | GET | `/api/v1/enrichment/ghost-truth/{job_id}` | Ghost type classification |

### 2.10 Market Signals

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 95 | GET | `/api/v1/market/signals/company/{company}` | Company signals |
| 96 | GET | `/api/v1/market/signals/role/{role}` | Role signals |
| 97 | GET | `/api/v1/market/competitive/landscape` | Competitive hiring map |
| 98 | GET | `/api/v1/market/competitive/company/{company}` | Company competitors |

### 2.11 Career & Interview

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 99 | POST | `/api/v1/career/trajectory` | Predict career trajectory |
| 100 | GET | `/api/v1/career/trajectories` | List trajectories |
| 101 | POST | `/api/v1/career/future-self` | 3 future scenarios |
| 102 | POST | `/api/v1/career/gaps` | Career gaps analysis |
| 103 | POST | `/api/v1/career/alerts/generate` | Generate career alerts |
| 104 | GET | `/api/v1/career/notifications` | Career notifications |
| 105 | POST | `/api/v1/career/interview/prep` | Create interview prep |
| 106 | GET | `/api/v1/career/interview/preps` | List preps |
| 107 | POST | `/api/v1/career/interview/practice/{id}` | Practice Q&A |
| 108 | POST | `/api/v1/career/interview/report` | Submit interview report |
| 109 | GET | `/api/v1/career/interview/reports/{company}` | Community reports |

### 2.12 Roadmap & Negotiation

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 110 | POST | `/api/v1/roadmap` | Generate career roadmap |
| 111 | GET | `/api/v1/roadmap` | List roadmaps |
| 112 | GET | `/api/v1/roadmap/{id}` | Get specific roadmap |
| 113 | POST | `/api/v1/negotiate` | Start negotiation session |
| 114 | POST | `/api/v1/negotiate/{id}/message` | Continue negotiation |
| 115 | GET | `/api/v1/negotiate` | List sessions |
| 116 | GET | `/api/v1/negotiate/{id}` | Get session |

### 2.13 Alerts & Autopilot

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 117 | POST | `/api/v1/alerts` | Create alert |
| 118 | GET | `/api/v1/alerts` | List alerts |
| 119 | PUT | `/api/v1/alerts/{id}` | Update alert |
| 120 | DELETE | `/api/v1/alerts/{id}` | Delete alert |
| 121 | GET | `/api/v1/alerts/triggers` | Alert triggers |
| 122 | GET | `/api/v1/autopilot/settings` | Autopilot config |
| 123 | PUT | `/api/v1/autopilot/settings` | Update autopilot |
| 124 | POST | `/api/v1/autopilot/run` | Trigger autopilot run |
| 125 | GET | `/api/v1/autopilot/briefing` | Morning briefing |
| 126 | GET | `/api/v1/autopilot/history` | Run history |
| 127 | POST | `/api/v1/autopilot/approve` | Approve queued apps |
| 128 | GET | `/api/v1/autopilot/queued` | Queued applications |

### 2.14 Gamification

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 129 | GET | `/api/v1/gamification/profile` | Full gamification profile |
| 130 | POST | `/api/v1/gamification/xp` | Award XP |
| 131 | GET | `/api/v1/gamification/xp/history` | XP history |
| 132 | POST | `/api/v1/gamification/streak` | Update streak |
| 133 | GET | `/api/v1/gamification/quests` | Active quests |
| 134 | GET | `/api/v1/gamification/achievements` | Badges |
| 135 | POST | `/api/v1/gamification/reframe/{app_id}` | AI rejection reframe |

### 2.15 Social Platform

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 136 | GET | `/api/v1/profiles/me` | My profile |
| 137 | PUT | `/api/v1/profiles/me` | Update profile |
| 138 | GET | `/api/v1/profiles/search` | Search profiles |
| 139 | GET | `/api/v1/profiles/{id}` | View profile |
| 140 | GET | `/api/v1/feed/social` | Social feed |
| 141 | POST | `/api/v1/feed/posts` | Create post |
| 142 | GET | `/api/v1/feed/posts/{id}` | View post |
| 143 | DELETE | `/api/v1/feed/posts/{id}` | Delete post |
| 144 | POST | `/api/v1/feed/posts/{id}/like` | Like/unlike |
| 145 | POST | `/api/v1/feed/posts/{id}/comment` | Comment |
| 146 | GET | `/api/v1/feed/posts/{id}/comments` | Get comments |
| 147 | GET | `/api/v1/messages/conversations` | List DMs |
| 148 | POST | `/api/v1/messages/conversations` | Start DM |
| 149 | GET | `/api/v1/messages/conversations/{id}` | Get messages |
| 150 | POST | `/api/v1/messages/conversations/{id}` | Send message |
| 151 | GET | `/api/v1/messages/unread-count` | Unread count |

### 2.16 Recruiter

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 152 | POST | `/api/v1/recruiter/search` | AI candidate search |
| 153 | POST | `/api/v1/recruiter/search/{id}/refine` | Refine search |
| 154 | GET | `/api/v1/recruiter/searches` | List searches |
| 155 | POST | `/api/v1/recruiter/outreach/generate` | Generate outreach |
| 156 | GET | `/api/v1/recruiter/outreach` | List outreach |
| 157 | GET | `/api/v1/recruiter/outreach/stats` | Outreach analytics |
| 158 | POST | `/api/v1/recruiter/pipeline` | Add to pipeline |
| 159 | GET | `/api/v1/recruiter/pipeline` | Get pipeline |
| 160 | GET | `/api/v1/recruiter/pipeline/stats` | Pipeline stats |
| 161 | GET | `/api/v1/recruiter/briefing` | Daily briefing |

### 2.17 Billing & Admin

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 162 | POST | `/api/v1/billing/checkout` | Stripe checkout |
| 163 | POST | `/api/v1/billing/portal` | Stripe portal |
| 164 | GET | `/api/v1/billing/subscription` | Current subscription |
| 165 | POST | `/api/v1/webhooks/stripe` | Stripe webhooks |
| 166 | GET | `/api/v1/admin/scrapers/status` | Scraper health |
| 167 | GET | `/api/v1/admin/jobs/lifecycle-stats` | Lifecycle stats |
| 168 | POST | `/api/v1/admin/scrapers/run/{group}` | Trigger scrapers |
| 169 | POST | `/api/v1/admin/scrapers/run-all` | Run all scrapers |
| 170 | POST | `/api/v1/reports` | Generate report |
| 171 | GET | `/api/v1/reports` | List reports |

---

## 3. FRONTEND ROUTES

### Public (No Auth)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Hero, stats, features, pricing CTA |
| `/login` | Login | Email/password + Phone OTP + Google/GitHub OAuth |
| `/signup` | Signup | Registration with role selection |
| `/auth/[provider]/callback` | OAuth Callback | Token exchange handler |
| `/pricing` | Pricing | 5 plan cards from API |
| `/ghost-check` | Ghost Checker | Free tool: paste URL, get ghost analysis |
| `/salary-check` | Salary Check | Free tool: role + location = salary percentiles |
| `/reports/weekly` | Weekly Report | Public market intelligence report |
| `/reports/weekly/[slug]` | Report Detail | Specific report by slug |

### Seeker (Auth Required)

| Route | Page | Description |
|-------|------|-------------|
| `/seeker` | Job Search | 3-panel: filters, job feed (infinite scroll), preview |
| `/seeker/jobs/[id]` | Job Detail | Full job analysis page |
| `/seeker/companies` | Companies | Company list grouped by job count |
| `/seeker/companies/[name]` | Company Detail | Company deep dive |
| `/seeker/alerts` | Alerts | Create/manage job alerts |
| `/seeker/autopilot` | Autopilot | Automated application settings |
| `/seeker/career` | Career Path | AI career recommendations |
| `/seeker/chat` | AI Chat | Career coaching chat |
| `/seeker/competitive-map` | Competitive Map | Market visualization |
| `/seeker/cv` | CV Upload | CV management |
| `/seeker/cv-intelligence` | CV Intelligence | CV analysis, tailoring, cover letters |
| `/seeker/gamification` | Gamification | XP, levels, quests, achievements |
| `/seeker/ghost-truth` | Ghost Truth | Ghost job deep analysis |
| `/seeker/interview` | Interview Prep | Company-specific interview coaching |
| `/seeker/market-signals` | Market Signals | Hiring trends, layoff warnings |
| `/seeker/negotiate` | Negotiation | AI salary negotiation coach |
| `/seeker/roadmap` | Roadmap | Career development plan |
| `/seeker/salary-reality` | Salary Reality | Real salary expectations |

### Dashboard (Auth Required)

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Main Dashboard | Stats, signals, applications, markets |
| `/dashboard/admin` | Admin | Admin controls |
| `/dashboard/admin/scrapers` | Scrapers | Scraper management UI |
| `/dashboard/companies` | Companies | Company research |
| `/dashboard/inbox` | Inbox | Direct messages |
| `/dashboard/notifications` | Notifications | Notification center |
| `/dashboard/radar` | Radar | Market analysis radar |
| `/dashboard/reports` | Reports | Report management |
| `/dashboard/search` | Search | AI-powered search |
| `/dashboard/settings` | Settings | Profile, subscription, preferences |
| `/dashboard/signals` | Signals | All market signals |
| `/dashboard/tracker` | Tracker | Application pipeline (Kanban) |

### Recruiter (Auth Required, Recruiter Role)

| Route | Page | Description |
|-------|------|-------------|
| `/recruiter/dashboard` | Recruiter Home | Briefing, pipeline stats, outreach stats |
| `/recruiter/search` | Search | AI candidate search |
| `/recruiter/pipeline` | Pipeline | Kanban pipeline management |
| `/recruiter/outreach` | Outreach | Message management |

### Social (Auth Required)

| Route | Page | Description |
|-------|------|-------------|
| `/feed` | Community Feed | Posts, likes, comments |
| `/profile/[id]` | User Profile | Public profile view/edit |

---

## 4. DATABASE SCHEMA

### Table Count by Migration

| Migration | Tables Added | Category |
|-----------|-------------|----------|
| Base (database.py) | 3 | jobs, salary_estimates, company_signals |
| 001 | 2 | users, refresh_tokens |
| 002 | 2 | chat_conversations, chat_messages |
| 003 | 2 | cv_uploads, cv_analyses |
| 004 | 7 | alerts, alert_triggers, subscription_plans, user_subscriptions, billing_events, waitlist, generated_reports, scraper_runs |
| 006 | 4 | market_signals, roadmaps, search_queries, company_intel_cache, negotiation_sessions |
| 007 | 2 | job_lifecycle_events, tracked_boards |
| 008 | 1 | scraper_configs |
| 009 | 3 | public_ghost_checks, public_salary_checks (+ extended reports) |
| 010 | 2 | job_applications, activity_feed |
| 011 | 7 | candidates, recruiter_searches, recruiter_search_results, recruiter_outreach, recruiter_pipeline, recruiter_chat_messages, recruiter_briefings |
| 012 | 8 | enriched_jobs (47-field), enrichment_queue, h1b_salary_data, global_scraper_sources, translation_cache, seo_pages, salary_reality, competitive_landscape |
| 013 | 15 | user_oauth_accounts, email/phone_verifications, user_ai_providers, cv_dna, cv_tailored, cover_letters, application_tracker, autopilot_settings/runs, user_xp, user_levels, quests, user_quests, user_achievements, career_trajectories, interview_prep/practice, community_interview_reports, notification_queue |
| 014 | 0 | (ALTER TABLE: external_applicant_count + index) |
| 015 | 5 | user_profiles, dm_conversations, dm_participants, dm_messages, posts, post_likes, post_comments |

**Total: ~70+ tables**

---

## 5. SCRAPERS & DATA PIPELINE

### Active Scrapers

| Scraper | Source | Companies/Categories | Job ID Prefix | Schedule |
|---------|--------|---------------------|---------------|----------|
| JSearch | RapidAPI (LinkedIn, Indeed, etc.) | 12 categories x 7 markets | `jsearch_*` | Daily 6am |
| RemoteOK | remoteok.com API | All remote tech | `rok_*` | Every 2h |
| Arbeitnow | arbeitnow.com API | European jobs | `arb_*` | Every 4h |
| TheMuse | themuse.com API | 6 categories | `muse_*` | Every 4h |
| Jobicy | jobicy.com API | Remote jobs | `jby_*` | Every 2h |
| Remotive | remotive.com API | 7 categories | `rmt_*` | Every 2h |
| USAJobs | usajobs.gov API | US government | `usajobs_*` | Every 4h |
| Reed | reed.co.uk API | UK jobs (has applicant count!) | `reed_*` | Every 4h |
| Adzuna | adzuna.com API | Multi-country | `adz_*` | Every 4h |
| Greenhouse | ATS API | 48 companies (Stripe, Airbnb, OpenAI...) | `gh_*` | Every 6h |
| Lever | ATS API | 74 companies (Netflix, Spotify, DoorDash...) | `lev_*` | Every 6h |
| Ashby | GraphQL API | 23 companies (Notion, Ramp, Vercel...) | `ash_*` | Every 6h |
| HN Who's Hiring | HN Firebase API | Monthly thread | `hn_*` | Daily 2am |

### Deduplication
- **Fingerprint:** SHA-256 of `company|title|city|ISO_week`
- Cross-source dedup prevents same job from different scrapers

### 26 Registered Future Sources
Including: Naukri (India), Djinni (Ukraine), NoFluffJobs (Poland), WelcomeToTheJungle (EU), Bayt (MENA), Jobberman (Africa), AI Jobs, Web3 Career, etc.

---

## 6. UI COMPONENT LIBRARY

| Component | File | Purpose |
|-----------|------|---------|
| Button | `ui/button.tsx` | 4 variants (primary/secondary/ghost/danger), 3 sizes, loading state |
| GhostScore | `ui/ghost-score.tsx` | 0-100 score with color tiers, expandable evidence |
| SalaryRange | `ui/salary-range.tsx` | Salary bar with market comparison |
| LiveCounter | `ui/live-counter.tsx` | Animated counting with trend arrow |
| IntelligenceCard | `ui/intelligence-card.tsx` | Signal cards (6 types: layoff/ipo/ghost/scaling/salary/market) |
| StatusBadge | `ui/status-badge.tsx` | Application status (8 states, color-coded) |
| CompanyBadge | `ui/company-badge.tsx` | Trajectory badge (scaling/stable/contracting/risk) |
| StatCard | `ui/stat-card.tsx` | Dashboard metric card |
| JobCard | `job/job-card.tsx` | Full job listing card with ghost bar, salary, skills, actions |
| ApplyModal | `job/apply-modal.tsx` | Apply flow modal |
| TopNav | `layout/top-nav.tsx` | Sticky header with search, nav, user menu |
| MobileNav | `layout/mobile-nav.tsx` | Bottom tab bar (5 tabs per role) |
| DashboardShell | `layout/dashboard-shell.tsx` | Sidebar + content layout |

---

## 7. BACKGROUND JOBS

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Fast Scrapers | Every 2h | RemoteOK, Jobicy, Remotive |
| Standard Scrapers | Every 4h | Arbeitnow, TheMuse, USAJobs, Reed, Adzuna |
| Board Scrapers | Every 6h | Greenhouse, Lever |
| Ashby Scraper | Every 6h | Ashby ATS |
| HN Scraper | Daily 2am | Hacker News "Who is Hiring?" |
| JSearch Daily | Daily 6am | JSearch aggregator |
| Lifecycle Maintenance | Every 4h | URL checks, staleness, repost detection, auto-archive (90d) |
| Alert Evaluation | Every 30min | Check alerts against new jobs |
| Weekly Reports | Monday 7am | Generate market intelligence |

---

## 8. CONFIGURATION

### Required Environment Variables

| Variable | Purpose | Status |
|----------|---------|--------|
| RAPIDAPI_KEY | JSearch scraper | Set |
| ANTHROPIC_API_KEY | Claude AI | Empty |
| JWT_SECRET | Token signing | Default (insecure!) |
| STRIPE_SECRET_KEY | Billing | Empty |
| STRIPE_WEBHOOK_SECRET | Webhooks | Empty |
| RESEND_API_KEY | Emails | Empty |
| GOOGLE_CLIENT_ID/SECRET | OAuth | Empty |
| GITHUB_CLIENT_ID/SECRET | OAuth | Empty |
| TWILIO_ACCOUNT_SID/TOKEN | SMS OTP | Empty |
| OPENROUTER_API_KEY | Fallback LLM | Empty |
| REED_API_KEY | Reed scraper | Empty |
| ADZUNA_APP_ID/KEY | Adzuna scraper | Empty |
| THEMUSE_API_KEY | TheMuse scraper | Empty |
| ENCRYPTION_KEY | API key encryption | Default (insecure!) |

---

## 9. CRITICAL WEAKNESSES

### P0 - Platform Breaking

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **Apply redirects to external sites (LinkedIn, Indeed)** | Users leave platform forever. They see LinkedIn, they stay on LinkedIn. This is the #1 killer. | Build native apply flow (see Section 10) |
| 2 | **SQLite in production** | Single-writer lock, no concurrent writes, no replication, will crash at scale | Migrate to PostgreSQL |
| 3 | **JWT_SECRET = "change-me-in-production"** | Anyone can forge auth tokens | Generate proper secret |
| 4 | **ENCRYPTION_KEY = "change-me-in-production-32bytes!"** | User API keys are not encrypted | Generate proper key |
| 5 | **No deployment** | Running on localhost only | Deploy to cloud (Railway/Fly.io/AWS) |
| 6 | **ANTHROPIC_API_KEY empty** | All AI features (chat, enrichment, CV analysis, negotiation, interview prep) are broken | Set API key |
| 7 | **No real-time / WebSockets** | Chat is SSE-only, no live notifications, no live feed updates | Add WebSocket layer |

### P1 - Feature Gaps

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 8 | **Recruiter candidates are synthetic** | Bootstrapped from job data, not real people. Recruiter search is a simulation. | Build real candidate profiles from users |
| 9 | **No email delivery** | RESEND_API_KEY empty. No verification emails, no alerts, no reports delivered | Configure Resend |
| 10 | **No Stripe configured** | Billing is dead. No monetization possible. | Set up Stripe |
| 11 | **Two application trackers** | `job_applications` (migration 010) and `application_tracker` (migration 013) overlap | Consolidate to one |
| 12 | **No file storage service** | CVs stored locally in `data/uploads/`. Will be lost on deploy. | Use S3/R2/Cloudflare |
| 13 | **Landing page disconnect** | `landing/index.html` is separate from Next.js app. Different pricing ($199/$399/$499 vs actual DB plans) | Unify into Next.js |
| 14 | **Social feed is bare** | Posts + likes + comments exist but no rich content (no images, no code blocks, no job shares) | Enhance post types |
| 15 | **No search indexing** | Job search uses SQLite LIKE queries. Brutally slow at scale. | Add Elasticsearch/Meilisearch |

### P2 - Code Quality

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 16 | **Broad exception catching** | `except Exception: items = []` in jobs.py silently swallows errors | Log errors properly |
| 17 | **No tests** | Zero test files in the entire project | Add test suite |
| 18 | **No input sanitization** | SQL params are used, but no HTML sanitization on user content (posts, comments, notes) | Add sanitization |
| 19 | **VSCode errors** | 35+ Pyre2 import errors (IDE can't find venv packages) | Configure Python interpreter path |
| 20 | **Hardcoded scraper companies** | Greenhouse (48), Lever (74), Ashby (23) companies are hardcoded lists | Move to `tracked_boards` table |
| 21 | **daily_scrape.sh has Mac path** | `/Users/talperez/clawd/jobintel` - broken on this machine | Fix path |

---

## 10. APPLY FLOW PROBLEM

### Current Flow (Broken)
```
User sees job → Clicks "Apply" → Opens apply_link → Redirected to LinkedIn/Indeed/Company site → GONE FOREVER
```

### Why This Kills Us
- User leaves our platform the moment they take the most important action
- They see LinkedIn's UI, get LinkedIn suggestions, stay on LinkedIn
- We have ZERO data on whether they actually applied
- We can't track conversion, can't show recruiters real applicant data
- The "internal_applicant_count" we just built is meaningless if they leave

### Required: Native Apply Flow

**Phase 1 - Quick Apply (within platform)**
- User clicks "Apply" → Modal opens within JobIntel
- Pre-fills: name, email, phone from profile
- Attaches: tailored CV (from CV Intelligence) + cover letter
- User clicks "Submit" → We store the application AND forward it
- Forward methods: email to company HR, ATS API (Greenhouse/Lever have apply APIs), or queue for manual submission

**Phase 2 - ATS Integration**
- Greenhouse Apply API: `POST /boards/{board_token}/jobs/{job_id}/applications`
- Lever Apply API: `POST /postings/{posting_id}/apply`
- These are real, documented APIs that let us submit applications programmatically

**Phase 3 - Email Apply**
- For jobs without ATS API, extract company email from job description
- Send formatted application email on behalf of user
- Track delivery status

**Phase 4 - Apply Agent**
- AI agent that can fill out external application forms (Playwright/Puppeteer)
- User approves, agent submits
- Most advanced but highest impact

### Database Changes Needed
```sql
ALTER TABLE job_applications ADD COLUMN apply_method TEXT; -- 'native', 'ats_api', 'email', 'agent', 'external'
ALTER TABLE job_applications ADD COLUMN submission_status TEXT; -- 'pending', 'submitted', 'confirmed', 'failed'
ALTER TABLE job_applications ADD COLUMN submission_details TEXT; -- JSON: response from ATS, email delivery status
```

---

## 11. NEXUS GAP ANALYSIS

Comparing current JobIntel to the NEXUS vision:

### IDENTITY ENGINE

| NEXUS Feature | JobIntel Status | Gap |
|--------------|-----------------|-----|
| Proof-of-Work Profile (GitHub, Kaggle) | **Missing entirely** | No GitHub/GitLab integration, no code analysis |
| Skill Graph (DAG) | **Missing** | Skills are comma-separated text strings, not a graph |
| Build Score | **Missing** | No composite reputation metric |
| Portable Reputation (W3C VC) | **Missing** | No verifiable credentials |
| Credential Verification | **Partial** | OAuth exists but no employer/education verification |

### SIGNAL LAYER

| NEXUS Feature | JobIntel Status | Gap |
|--------------|-----------------|-----|
| Tech Feed | **Basic** | Posts + likes + comments exist, but no algorithm, no content types beyond text |
| Anti-Cringe Engine | **Missing** | No content quality scoring |
| Verified Reviews | **Missing entirely** | No company review system |
| Salary Intelligence | **Strong** | H1B data, market benchmarks, reality checks exist |
| Launch Feed | **Missing** | No product launch capability |

### MATCHING ENGINE

| NEXUS Feature | JobIntel Status | Gap |
|--------------|-----------------|-----|
| AI Job Matching | **Partial** | CV-job match scoring exists, but no bi-directional scoring or autonomous search |
| Personal AI Agent | **Partial** | Autopilot exists but is basic (rule-based, not agentic) |
| Job Board 3.0 | **Partial** | Jobs have ghost scores and salary, but no pipeline timeline, team scores, interview ratings |
| Built-in ATS | **Partial** | Recruiter pipeline exists, but not a full ATS replacement |
| Freelance Marketplace | **Missing** | No freelance/contract matching |
| Startup Hub | **Missing** | No co-founder matching, no equity calculator |

### TRANSACTION LAYER

| NEXUS Feature | JobIntel Status | Gap |
|--------------|-----------------|-----|
| Smart Escrow | **Missing** | No payment escrow |
| Offer Comparison | **Missing** | No side-by-side offer tool |
| Negotiation AI | **Exists** | Salary negotiation coaching works |
| Payments | **Missing** | No freelance payments |

### AI SUBSTRATE

| NEXUS Feature | JobIntel Status | Gap |
|--------------|-----------------|-----|
| Code Analyzer | **Missing** | No GitHub integration |
| Match Engine | **Partial** | Basic CV-job scoring |
| Feed Curator | **Missing** | No content ranking algorithm |
| Fraud Sentinel | **Missing** | No fake profile detection |
| Career Pathfinder | **Exists** | Career trajectory + roadmap |
| Agent Orchestrator | **Basic** | Autopilot is rule-based |

---

## 12. PRIORITY ROADMAP

### Immediate (This Week)

1. **Fix the Apply Flow** - Build native apply modal that submits within platform, not redirect
2. **Set ANTHROPIC_API_KEY** - All AI features are dead without it
3. **Fix JWT_SECRET and ENCRYPTION_KEY** - Security holes
4. **Configure Resend** for email delivery
5. **Consolidate application trackers** (010 vs 013)

### Short Term (This Month)

6. **Deploy to cloud** (Railway or Fly.io) - Get a real URL
7. **Migrate SQLite to PostgreSQL** - Required for any real traffic
8. **Greenhouse/Lever Apply API integration** - Native application submission
9. **Real user profiles** instead of synthetic recruiter candidates
10. **Add company reviews** - The Glassdoor killer feature

### Medium Term (Next 2 Months)

11. **GitHub/GitLab OAuth + code analysis** - The identity engine wedge
12. **Build Score** - Composite reputation from contributions
13. **WebSocket layer** for real-time notifications and chat
14. **Content algorithm** for the feed (reward substance, penalize fluff)
15. **Full-text search** (Meilisearch or Elasticsearch)

### Long Term (Next Quarter)

16. **Freelance marketplace** integration
17. **ATS replacement** for companies (Greenhouse/Lever competitor)
18. **Verifiable Credentials** for portable reputation
19. **API ecosystem** for third-party integrations
20. **Mobile app** (React Native)
