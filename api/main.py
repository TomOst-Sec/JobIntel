"""FastAPI application entry point."""
import logging
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.config import get_settings

logger = logging.getLogger(__name__)
from api.db.connection import get_db_connection
from api.db.migrations import run_migrations
from api.routers import auth, jobs, companies, chat, cv, alerts, billing, reports, webhooks
from api.routers import intelligence, roadmap, negotiate, admin, admin_scrapers, public
from api.routers import applications, feed
from api.routers import recruiter_search, recruiter_outreach, recruiter_pipeline
from api.routers import enrichment, salary_intelligence, market_signals, seo
from api.routers import oauth, cv_intelligence, gamification, autopilot, career
from api.routers import profiles, messaging, social_feed
from api.routers import skill_graph, reviews, matching, freelance, startups, ai_agent, byok, api_keys
from api.middleware.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run migrations on startup, cleanup on shutdown."""
    settings = get_settings()

    # Run database migrations
    conn = get_db_connection()
    try:
        run_migrations(conn)
    finally:
        conn.close()

    # Start background scheduler
    from api.tasks.scheduler import start_scheduler, shutdown_scheduler
    start_scheduler()

    yield

    shutdown_scheduler()


settings = get_settings()

app = FastAPI(
    title="NEXUS API",
    description="The operating system for tech careers — AI-powered hiring intelligence, Proof-of-Work profiles, bidirectional matching, freelance marketplace, and startup hub.",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting
app.add_middleware(RateLimitMiddleware)

# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["Jobs"])
app.include_router(companies.router, prefix="/api/v1/companies", tags=["Companies"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(cv.router, prefix="/api/v1/cv", tags=["CV"])
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["Alerts"])
app.include_router(billing.router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["Intelligence"])
app.include_router(roadmap.router, prefix="/api/v1/roadmap", tags=["Roadmap"])
app.include_router(negotiate.router, prefix="/api/v1/negotiate", tags=["Negotiation"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(admin_scrapers.router, prefix="/api/v1/admin", tags=["Admin Scrapers"])
app.include_router(public.router, prefix="/api/v1/public", tags=["Public"])
app.include_router(applications.router, prefix="/api/v1/applications", tags=["Applications"])
app.include_router(feed.router, prefix="/api/v1/feed", tags=["Feed"])
app.include_router(recruiter_search.router, prefix="/api/v1/recruiter", tags=["Recruiter Search"])
app.include_router(recruiter_outreach.router, prefix="/api/v1/recruiter", tags=["Recruiter Outreach"])
app.include_router(recruiter_pipeline.router, prefix="/api/v1/recruiter", tags=["Recruiter Pipeline"])
app.include_router(enrichment.router, prefix="/api/v1/enrichment", tags=["Enrichment"])
app.include_router(salary_intelligence.router, prefix="/api/v1/intelligence", tags=["Salary Intelligence"])
app.include_router(market_signals.router, prefix="/api/v1/market", tags=["Market Signals"])
app.include_router(seo.router, prefix="/api/v1/content", tags=["SEO & Content"])
app.include_router(oauth.router, prefix="/api/v1/auth/oauth", tags=["OAuth"])
app.include_router(cv_intelligence.router, prefix="/api/v1/cv-intelligence", tags=["CV Intelligence"])
app.include_router(gamification.router, prefix="/api/v1/gamification", tags=["Gamification"])
app.include_router(autopilot.router, prefix="/api/v1/autopilot", tags=["Autopilot"])
app.include_router(career.router, prefix="/api/v1/career", tags=["Career & Interview"])
app.include_router(profiles.router, prefix="/api/v1/profiles", tags=["Profiles"])
app.include_router(messaging.router, prefix="/api/v1/messages", tags=["Messages"])
app.include_router(social_feed.router, prefix="/api/v1/feed", tags=["Social Feed"])

# NEXUS Platform routers
app.include_router(skill_graph.router, prefix="/api/v1/skills", tags=["Skill Graph"])
app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["Company Reviews"])
app.include_router(matching.router, prefix="/api/v1/matching", tags=["Bidirectional Matching"])
app.include_router(freelance.router, prefix="/api/v1/freelance", tags=["Freelance Marketplace"])
app.include_router(startups.router, prefix="/api/v1/startups", tags=["Startup Hub"])
app.include_router(ai_agent.router, prefix="/api/v1/agent", tags=["AI Agent"])
app.include_router(byok.router, prefix="/api/v1/ai", tags=["BYOK AI Providers"])
app.include_router(api_keys.router, prefix="/api/v1/keys", tags=["API Keys"])


# Global exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions — return JSON instead of crashing."""
    logger.error("Unhandled error on %s: %s", request.url.path, exc)
    logger.error(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "path": str(request.url.path),
        },
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={"detail": f"Not found: {request.url.path}"},
    )


@app.get("/api/v1/health")
def health_check():
    """Health check returning DB stats and scraper status."""
    conn = get_db_connection()
    try:
        stats = {}
        stats["total_jobs"] = conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        stats["unique_companies"] = conn.execute("SELECT COUNT(DISTINCT company) FROM jobs").fetchone()[0]
        stats["markets"] = conn.execute("SELECT COUNT(DISTINCT market_id) FROM jobs").fetchone()[0]
        stats["with_salary"] = conn.execute("SELECT COUNT(*) FROM jobs WHERE salary_min > 0").fetchone()[0]

        last_scrape = conn.execute(
            "SELECT MAX(scraped_at) FROM jobs"
        ).fetchone()[0]
        stats["last_scrape"] = last_scrape
        stats["status"] = "healthy"
        return stats
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return JSONResponse(
            status_code=500,
            content={"status": "unhealthy", "error": str(e)},
        )
    finally:
        conn.close()
