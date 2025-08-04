"""Ghost job detection — identifies likely fake or stale job postings."""
import json
import re
import sqlite3
from datetime import datetime

import anthropic

from api.config import get_settings


GHOST_SIGNALS = {
    "reposted_frequently":       {"weight": 0.20, "desc": "Posted 3+ times in 60 days"},
    "no_salary":                  {"weight": 0.08, "desc": "No salary information"},
    "vague_requirements":         {"weight": 0.12, "desc": "Generic/copy-pasted requirements"},
    "long_open":                  {"weight": 0.15, "desc": "Open 60+ days without update"},
    "hiring_freeze_signals":      {"weight": 0.12, "desc": "Company shows freeze signals"},
    "unrealistic_requirements":   {"weight": 0.12, "desc": "Impossible requirement combos"},
    "apply_link_dead":            {"weight": 0.15, "desc": "Application URL returns 404"},
    "company_layoff_news":        {"weight": 0.08, "desc": "Company has layoff risk signals"},
    "suspiciously_broad_title":   {"weight": 0.05, "desc": "Title too generic to be a real role"},
    "no_department_specifics":    {"weight": 0.05, "desc": "No team/department mentioned"},
}

MITIGATING_FACTORS = {
    "has_salary_range":      -0.10,
    "specific_tech_stack":   -0.08,
    "named_hiring_manager":  -0.12,
    "recent_post":           -0.05,
    "company_is_scaling":    -0.08,
}

BROAD_TITLES = [
    "developer", "engineer", "manager", "analyst", "designer",
    "consultant", "coordinator", "specialist", "associate", "administrator",
]

DEPARTMENT_PATTERNS = re.compile(
    r"\b(team|department|division|group|org|squad|unit|reporting to|reports to|"
    r"engineering team|product team|marketing team|sales team|data team)\b",
    re.IGNORECASE,
)

TECH_STACK_PATTERNS = re.compile(
    r"\b(python|java|javascript|typescript|react|angular|vue|node|go|rust|"
    r"kubernetes|docker|aws|gcp|azure|terraform|postgres|mysql|mongodb|redis|"
    r"kafka|graphql|swift|kotlin)\b",
    re.IGNORECASE,
)

HIRING_MANAGER_PATTERNS = re.compile(
    r"(hiring manager|reports to|reporting to|managed by|team lead|"
    r"contact:\s*\w+|reach out to \w+)",
    re.IGNORECASE,
)


def analyze_ghost_job(job_id: str, db: sqlite3.Connection) -> dict:
    """Compute a ghost score (0-100) for a specific job posting."""
    job = db.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if job is None:
        raise ValueError("Job not found")

    job = dict(job)
    signals = []
    mitigations = []
    score = 0.0

    description = job.get("description", "") or ""
    title = job.get("title", "") or ""

    # --- Signal checks ---

    # Check repost count
    similar = db.execute("""
        SELECT COUNT(*) FROM jobs
        WHERE company = ? AND title = ? AND job_id != ?
        AND posted_at >= datetime('now', '-60 days')
    """, (job["company"], job["title"], job_id)).fetchone()[0]

    if similar >= 2:
        signals.append("reposted_frequently")
        score += GHOST_SIGNALS["reposted_frequently"]["weight"] * 100
        repost_count = similar + 1
    else:
        repost_count = 1

    # No salary
    if not job.get("salary_min") or job["salary_min"] == 0:
        signals.append("no_salary")
        score += GHOST_SIGNALS["no_salary"]["weight"] * 100

    # Long open (posted > 60 days ago)
    days_open = 0
    if job.get("posted_at"):
        try:
            posted = datetime.fromisoformat(job["posted_at"].replace("Z", "+00:00"))
            days_open = (datetime.now(posted.tzinfo) - posted).days if posted.tzinfo else (datetime.now() - posted).days
            if days_open > 60:
                signals.append("long_open")
                score += GHOST_SIGNALS["long_open"]["weight"] * 100
        except (ValueError, TypeError):
            pass

    # Company hiring freeze signals
    recent_count = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company = ?
        AND posted_at >= datetime('now', '-14 days')
    """, (job["company"],)).fetchone()[0]
    older_count = db.execute("""
        SELECT COUNT(*) FROM jobs WHERE company = ?
        AND posted_at >= datetime('now', '-60 days')
        AND posted_at < datetime('now', '-14 days')
    """, (job["company"],)).fetchone()[0]

    if older_count > 5 and recent_count <= 1:
        signals.append("hiring_freeze_signals")
        score += GHOST_SIGNALS["hiring_freeze_signals"]["weight"] * 100

    # Apply link dead — check via HEAD request
    apply_link = job.get("apply_link") or job.get("url") or ""
    if apply_link:
        try:
            import urllib.request
            req = urllib.request.Request(apply_link, method="HEAD")
            req.add_header("User-Agent", "JobIntel/1.0")
            resp = urllib.request.urlopen(req, timeout=5)
            if resp.status >= 400:
                signals.append("apply_link_dead")
                score += GHOST_SIGNALS["apply_link_dead"]["weight"] * 100
        except Exception:
            # Timeout or connection error — could indicate dead link
            if apply_link.startswith("http"):
                signals.append("apply_link_dead")
                score += GHOST_SIGNALS["apply_link_dead"]["weight"] * 100

    # Company layoff signals from cache
    cached = db.execute("""
        SELECT layoff_risk_score FROM company_intel_cache
        WHERE company = ? AND computed_at >= datetime('now', '-7 days')
    """, (job["company"],)).fetchone()
    if cached and cached[0] and cached[0] > 50:
        signals.append("company_layoff_news")
        score += GHOST_SIGNALS["company_layoff_news"]["weight"] * 100

    # Suspiciously broad title
    title_lower = title.lower().strip()
    title_words = title_lower.split()
    if len(title_words) <= 1 and title_lower in BROAD_TITLES:
        signals.append("suspiciously_broad_title")
        score += GHOST_SIGNALS["suspiciously_broad_title"]["weight"] * 100

    # No department specifics
    if len(description) > 100 and not DEPARTMENT_PATTERNS.search(description):
        signals.append("no_department_specifics")
        score += GHOST_SIGNALS["no_department_specifics"]["weight"] * 100

    # AI analysis for vague/unrealistic requirements
    if len(description) > 50:
        ai_signals = _ai_analyze_ghost_signals(description, title)
        if ai_signals.get("vague_requirements"):
            signals.append("vague_requirements")
            score += GHOST_SIGNALS["vague_requirements"]["weight"] * 100
        if ai_signals.get("unrealistic_requirements"):
            signals.append("unrealistic_requirements")
            score += GHOST_SIGNALS["unrealistic_requirements"]["weight"] * 100

    # --- Mitigating factors ---

    # Has salary range
    if job.get("salary_min") and job.get("salary_max") and job["salary_min"] > 0:
        mitigations.append("has_salary_range")
        score += MITIGATING_FACTORS["has_salary_range"] * 100

    # Specific tech stack in description
    if TECH_STACK_PATTERNS.search(description):
        mitigations.append("specific_tech_stack")
        score += MITIGATING_FACTORS["specific_tech_stack"] * 100

    # Named hiring manager
    if HIRING_MANAGER_PATTERNS.search(description):
        mitigations.append("named_hiring_manager")
        score += MITIGATING_FACTORS["named_hiring_manager"] * 100

    # Recent post (< 7 days)
    if days_open < 7 and days_open >= 0:
        mitigations.append("recent_post")
        score += MITIGATING_FACTORS["recent_post"] * 100

    # Company is scaling (many recent postings)
    if recent_count >= 5:
        mitigations.append("company_is_scaling")
        score += MITIGATING_FACTORS["company_is_scaling"] * 100

    score = max(0.0, min(round(score, 1), 100.0))

    # Update the job record
    db.execute("""
        UPDATE jobs SET ghost_score = ?, ghost_signals = ?, repost_count = ?
        WHERE job_id = ?
    """, (score, json.dumps(signals), repost_count, job_id))
    db.commit()

    return {
        "job_id": job_id,
        "title": job.get("title"),
        "company": job.get("company"),
        "ghost_score": score,
        "signals": [{"signal": s, **GHOST_SIGNALS[s]} for s in signals],
        "mitigating_factors": [
            {"factor": m, "adjustment": MITIGATING_FACTORS[m]}
            for m in mitigations
        ],
        "repost_count": repost_count,
        "verdict": "likely_ghost" if score >= 50 else "suspicious" if score >= 25 else "likely_real",
        "confidence": "high" if len(signals) >= 4 else "medium" if len(signals) >= 2 else "low",
    }


def batch_analyze_ghosts(db: sqlite3.Connection, limit: int = 100) -> list[dict]:
    """Scan recent jobs and score them for ghost likelihood."""
    rows = db.execute("""
        SELECT job_id FROM jobs
        WHERE ghost_score IS NULL OR ghost_score = 0
        ORDER BY posted_at DESC LIMIT ?
    """, (limit,)).fetchall()

    results = []
    for row in rows:
        try:
            result = analyze_ghost_job(row["job_id"], db)
            results.append(result)
        except Exception:
            continue
    return results


def get_ghost_stats(db: sqlite3.Connection) -> dict:
    """Get aggregate ghost job statistics."""
    stats = {}
    stats["total_analyzed"] = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE ghost_score > 0"
    ).fetchone()[0]
    stats["likely_ghost"] = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE ghost_score >= 50"
    ).fetchone()[0]
    stats["suspicious"] = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE ghost_score >= 25 AND ghost_score < 50"
    ).fetchone()[0]
    stats["likely_real"] = db.execute(
        "SELECT COUNT(*) FROM jobs WHERE ghost_score > 0 AND ghost_score < 25"
    ).fetchone()[0]

    top_ghost_companies = db.execute("""
        SELECT company, COUNT(*) as ghost_count,
            ROUND(AVG(ghost_score), 1) as avg_ghost_score
        FROM jobs WHERE ghost_score >= 50
        GROUP BY company ORDER BY ghost_count DESC LIMIT 10
    """).fetchall()
    stats["top_ghost_companies"] = [dict(r) for r in top_ghost_companies]
    return stats


def public_ghost_check(job_url: str, db: sqlite3.Connection) -> dict:
    """Public ghost check for the viral tool — no auth required.

    Checks if the URL matches a known job, otherwise does lightweight analysis.
    """
    # Try to match URL to an existing job in the DB
    existing = db.execute(
        "SELECT * FROM jobs WHERE apply_link = ? LIMIT 1",
        (job_url,),
    ).fetchone()

    if existing:
        existing = dict(existing)
        # Run full ghost analysis if we have the job
        try:
            result = analyze_ghost_job(existing["job_id"], db)
        except Exception:
            result = {
                "ghost_score": existing.get("ghost_score", 0) or 0,
                "signals": [],
                "verdict": "unknown",
            }

        verdict_data = {
            "job_url": job_url,
            "company": existing.get("company"),
            "title": existing.get("title"),
            "ghost_score": result["ghost_score"],
            "signals": result.get("signals", []),
            "verdict": result.get("verdict", "unknown"),
            "confidence": result.get("confidence", "low"),
            "source": "database_match",
        }
    else:
        # Lightweight analysis: scrape basic info from URL
        title, company, description = _scrape_job_url(job_url)

        signals = []
        score = 0.0

        if not title and not company:
            verdict_data = {
                "job_url": job_url,
                "company": None,
                "title": None,
                "ghost_score": 0,
                "signals": [],
                "verdict": "unable_to_check",
                "confidence": "low",
                "source": "url_scrape_failed",
            }
            _cache_public_ghost_check(db, job_url, verdict_data)
            return verdict_data

        # Check broad title
        if title:
            title_lower = title.lower().strip()
            if len(title_lower.split()) <= 1 and title_lower in BROAD_TITLES:
                signals.append({"signal": "suspiciously_broad_title", **GHOST_SIGNALS["suspiciously_broad_title"]})
                score += GHOST_SIGNALS["suspiciously_broad_title"]["weight"] * 100

        # Check department specifics
        if description and len(description) > 100:
            if not DEPARTMENT_PATTERNS.search(description):
                signals.append({"signal": "no_department_specifics", **GHOST_SIGNALS["no_department_specifics"]})
                score += GHOST_SIGNALS["no_department_specifics"]["weight"] * 100

            # Check for tech stack (mitigating)
            if TECH_STACK_PATTERNS.search(description):
                score += MITIGATING_FACTORS["specific_tech_stack"] * 100

        # Check if company exists in our DB with ghost patterns
        if company:
            ghost_count = db.execute("""
                SELECT COUNT(*) FROM jobs WHERE company LIKE ? AND ghost_score >= 50
            """, (f"%{company}%",)).fetchone()[0]
            total_company = db.execute(
                "SELECT COUNT(*) FROM jobs WHERE company LIKE ?", (f"%{company}%",)
            ).fetchone()[0]

            if total_company > 0 and ghost_count / total_company > 0.3:
                signals.append({"signal": "company_layoff_news",
                                "weight": 0.08,
                                "desc": f"{ghost_count}/{total_company} of {company}'s postings flagged as ghosts"})
                score += 8

        score = max(0.0, min(round(score, 1), 100.0))

        verdict_data = {
            "job_url": job_url,
            "company": company,
            "title": title,
            "ghost_score": score,
            "signals": signals,
            "verdict": "likely_ghost" if score >= 50 else "suspicious" if score >= 25 else "likely_real",
            "confidence": "low",
            "source": "url_scrape",
        }

    _cache_public_ghost_check(db, job_url, verdict_data)
    return verdict_data


def _cache_public_ghost_check(db: sqlite3.Connection, job_url: str, data: dict):
    """Cache the public ghost check result."""
    try:
        db.execute("""
            INSERT INTO public_ghost_checks (job_url, company, title, ghost_score, signals, verdict)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            job_url,
            data.get("company"),
            data.get("title"),
            data.get("ghost_score"),
            json.dumps(data.get("signals", [])),
            data.get("verdict"),
        ))
        db.commit()
    except Exception:
        pass


def _scrape_job_url(url: str) -> tuple[str | None, str | None, str | None]:
    """Lightweight scrape of a job URL to extract basic info."""
    try:
        import urllib.request
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "JobIntel/1.0 (Ghost Job Checker)")
        resp = urllib.request.urlopen(req, timeout=10)
        html = resp.read().decode("utf-8", errors="ignore")[:50000]

        # Extract title from <title> tag
        title = None
        title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
        if title_match:
            title = title_match.group(1).strip()
            # Clean common suffixes
            for sep in [" | ", " - ", " :: ", " — "]:
                if sep in title:
                    title = title.split(sep)[0].strip()

        # Try to find company from meta tags or common patterns
        company = None
        og_site = re.search(r'property="og:site_name"\s+content="([^"]+)"', html, re.IGNORECASE)
        if og_site:
            company = og_site.group(1).strip()

        # Extract description from body text (simplified)
        description = None
        body_match = re.search(r"<body[^>]*>(.*)</body>", html, re.IGNORECASE | re.DOTALL)
        if body_match:
            body_text = re.sub(r"<[^>]+>", " ", body_match.group(1))
            body_text = re.sub(r"\s+", " ", body_text).strip()
            description = body_text[:3000]

        return title, company, description
    except Exception:
        return None, None, None


def _ai_analyze_ghost_signals(description: str, title: str) -> dict:
    """Use Claude to detect vague, unrealistic, or suspicious requirements."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        return {}

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": f"""You are a ghost job detection expert. Analyze this job posting for signals that it may be fake, stale, or not tied to a real open position.

Title: {title}
Description (first 1500 chars): {description[:1500]}

Evaluate each signal:
1. vague_requirements: Are the requirements generic/copy-pasted with no specifics? Would this description fit 100 different companies?
2. unrealistic_requirements: Does it demand impossible combos (e.g., 10 years in a 3-year-old technology, entry-level with 8+ years, contradictory skill sets)?
3. suspiciously_broad_title: Is the title so generic it could mean anything? (e.g., just "Developer" or "Manager" with no qualifier)
4. no_department_specifics: Is there zero mention of which team, department, or manager this role reports to?

Return ONLY valid JSON:
{{"vague_requirements": true/false, "unrealistic_requirements": true/false, "suspiciously_broad_title": true/false, "no_department_specifics": true/false, "confidence": 0.0-1.0, "reasoning": "one sentence explanation"}}""",
            }],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text)
    except Exception:
        return {}
