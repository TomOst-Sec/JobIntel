# JobIntel

AI-powered job market intelligence platform. Scrapes job postings from multiple sources, analyzes hiring patterns with Claude AI, and surfaces actionable signals through a web dashboard and CLI.

## What It Does

- **Multi-source scraping** -- Aggregates jobs from JSearch (LinkedIn, Indeed, Glassdoor, ZipRecruiter), RemoteOK, Arbeitnow, USAJobs, and more
- **Market intelligence** -- Detects scaling companies, salary trends, ghost postings, and hiring velocity
- **AI analysis** -- Claude-powered market reports with insights and predictions
- **Recruiter tools** -- Candidate search, outreach management, pipeline tracking
- **Job seeker tools** -- Application tracker, salary negotiation, career coaching chat, skill graph

## Architecture

```
Frontend (Next.js 16, React 19, Tailwind CSS 4)
  |
  | HTTP / SSE
  v
Backend (FastAPI, Python, SQLite)
  |
  |-- 150+ API endpoints across 40 routers
  |-- JWT + OAuth (Google, GitHub) authentication
  |-- Background scheduler (APScheduler)
  |-- Stripe billing integration
  v
Data Pipeline
  |-- JSearch API (RapidAPI)
  |-- RemoteOK, Arbeitnow, USAJobs (free, no auth)
  |-- LinkedIn Data API (RapidAPI)
  |-- Fingerprint deduplication across sources
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [RapidAPI](https://rapidapi.com) key (subscribe to JSearch API -- free tier available)

### Setup

```bash
# Clone
git clone https://github.com/TomOst-Sec/JobIntel.git
cd JobIntel

# Python dependencies
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your API keys

# Initialize database
python run.py stats

# Frontend
cd frontend
npm install
cd ..
```

### Run

```bash
# Start the API server
python run_api.py                # http://localhost:8000

# Start the frontend (separate terminal)
cd frontend && npm run dev       # http://localhost:3000
```

### CLI Usage

```bash
# Scrape jobs
python run.py scrape                          # all markets, past week
python run.py scrape --date-posted today      # just today's postings
python run.py scrape --market tel_aviv        # specific market
python run.py scrape --source free            # free APIs only (no key needed)

# Intelligence
python run.py signals                         # hiring signals
python run.py scaling                         # companies posting 3+ jobs
python run.py salaries                        # salary breakdown by role

# Reports
python run.py report                          # terminal report with AI
python run.py report --format markdown        # export to markdown
python run.py report --format json            # export to JSON
python run.py report --format all             # all formats

# Stats
python run.py stats                           # database overview
```

## Markets Tracked

| Market | Region |
|--------|--------|
| Silicon Valley / Bay Area | San Francisco, CA (50mi radius) |
| Tel Aviv | Israel (30mi) |
| London | UK (30mi) |
| Remote / Global | Worldwide |
| Europe | EU-wide |
| US (Other) | Rest of US |

## Job Categories

Software Engineer, Data Scientist, Product Manager, DevOps, ML Engineer, Frontend, Backend, Full Stack, AI Engineer, Cloud Engineer, Cybersecurity, Data Engineer

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, TanStack Query, Recharts |
| Backend | FastAPI, Pydantic, SQLite (WAL mode), APScheduler |
| AI | Anthropic Claude API, OpenRouter (free models) |
| Auth | JWT + bcrypt, Google & GitHub OAuth |
| Payments | Stripe (subscriptions + webhooks) |
| Email | Resend API |

## API Highlights

The backend exposes 150+ endpoints across these domains:

- **Jobs** -- Search, filter, report dead postings
- **Companies** -- Deep dives, timelines, reviews
- **Intelligence** -- Market signals, ghost job detection, salary trends
- **Chat** -- AI career coach with SSE streaming
- **CV Intelligence** -- Upload, parse, improvement suggestions
- **Applications** -- Track applications with notes and timeline
- **Recruiter** -- Candidate search, outreach, pipeline management
- **Alerts** -- Salary spikes, hiring velocity notifications
- **Billing** -- Stripe subscription management
- **Gamification** -- XP, leaderboards, badges

Full API docs available at `http://localhost:8000/docs` when running.

## Project Structure

```
.
├── api/                    # FastAPI backend
│   ├── routers/            # 40 route modules
│   ├── services/           # Business logic
│   ├── models/             # Pydantic schemas
│   ├── db/                 # Database layer + 19 migrations
│   ├── middleware/         # Rate limiting
│   ├── tasks/              # Background jobs
│   ├── config.py           # Settings (env-based)
│   └── main.py             # App entry point
├── src/                    # CLI + scraping layer
│   ├── scraper.py          # JSearch API client
│   ├── free_scraper.py     # Free API clients
│   ├── linkedin_scraper.py # LinkedIn scraper
│   ├── database.py         # SQLite ORM
│   ├── analyzer.py         # Claude AI analysis
│   ├── report.py           # Report generator
│   ├── cli.py              # Click CLI
│   └── config.py           # CLI config
├── frontend/               # Next.js app (40+ pages)
│   └── src/app/            # App router pages
├── landing/                # Static landing page
├── data/                   # SQLite database (gitignored)
├── reports/                # Generated reports (gitignored)
├── .env.example            # Environment template
├── requirements.txt        # Python dependencies
├── run.py                  # CLI entry point
├── run_api.py              # API server entry point
└── daily_scrape.sh         # Cron script
```

## License

MIT
