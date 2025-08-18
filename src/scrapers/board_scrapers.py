"""Board and thread scrapers — Greenhouse, Lever, HN Who's Hiring."""
import logging
import re
import time
import requests
from datetime import datetime
from typing import Optional

from src.scrapers.utils import categorize, detect_market, compute_fingerprint

logger = logging.getLogger(__name__)

# Seed lists — companies known to use each ATS.
GREENHOUSE_COMPANIES = [
    # Original
    "stripe", "airbnb", "cloudflare", "figma", "notion", "discord",
    "coinbase", "databricks", "gitlab", "shopify", "plaid", "gusto",
    "brex", "airtable", "snyk", "hashicorp", "webflow", "retool",
    "vercel", "dbt-labs", "cockroachlabs", "benchling", "lattice",
    "deel", "ramp", "anduril", "faire", "navan", "watershed",
    "ironclad", "vanta", "census", "postman", "grammarly",
    "mux", "linear", "loom", "replit", "netlify", "launchdarkly",
    "supabase", "prisma", "doppler", "stytch", "modal", "deepgram",
    "warp", "zamp", "ashbyhq", "runway",
    # Big tech
    "meta", "pinterest", "twilio", "elastic", "pagerduty", "datadog",
    "mongo", "snowflake",
    # AI/ML
    "openai", "anthropic", "huggingface", "cohere", "stability-ai",
    "midjourney", "perplexity-ai", "mistral", "together-ai", "anyscale",
    # Fintech
    "affirm", "sofi", "betterment", "mercury", "column", "tally",
    "pipe", "carta", "clearco", "moderntreasury",
    # Dev tools
    "github", "sourcegraph", "sentry", "render", "railway", "fly",
    "temporal", "neon", "turso", "planetscale",
    # Security
    "crowdstrike", "sentinelone", "lacework", "wiz", "orca-security",
    # Health/Bio
    "tempus", "flatiron-health", "color", "grail", "recursion",
    "insitro", "ginkgo-bioworks",
    # Enterprise
    "monday", "asana", "canva", "miro", "calendly", "zapier",
    # Infrastructure
    "fastly", "tailscale", "teleport", "pulumi", "spacelift",
    # Growth/Commerce
    "instacart", "doordash", "rappi", "gopuff", "getir", "whatnot",
]

LEVER_COMPANIES = [
    # Original
    "netflix", "twitch", "github", "spotify", "lyft", "doordash",
    "instacart", "palantir", "robinhood", "rivian", "flexport",
    "scale", "wealthfront", "chime", "marqeta", "plaid",
    "relativity", "liftoff", "fleetsmith", "envoy",
    "checkr", "iterable", "attentive", "persona",
    "readme", "pave", "pilot", "rho", "empower",
    "samsara", "verkada",
    # Dev tools / Data
    "figma", "linear", "notion", "vercel", "supabase", "planetscale",
    "airbyte", "dbt-labs", "hex", "retool", "temporal", "materialize",
    "starburst", "preset", "dagster", "prefect",
    # AI / ML
    "weights-and-biases", "comet", "deepmind", "waymo",
    # Autonomous / Aerospace
    "aurora", "nuro", "cruise", "zoox", "applied-intuition",
    "shield-ai", "joby-aviation", "boom-supersonic",
    "relativity-space", "astra", "rocket-lab",
    # Space / Geo
    "capella-space", "planet", "spire", "hawkeye-360",
    # Defense / Gov
    "anduril", "maxar", "l3harris", "leidos", "caci",
    "booz-allen-hamilton",
]


class GreenhouseScraper:
    """Greenhouse ATS — public board API for tracked companies."""

    API_TEMPLATE = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"

    def __init__(self, companies: list[str] | None = None):
        self.companies = companies or GREENHOUSE_COMPANIES
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self) -> list[dict]:
        logger.info("Greenhouse: scraping %d companies", len(self.companies))
        all_jobs = []
        for slug in self.companies:
            try:
                url = self.API_TEMPLATE.format(slug=slug)
                resp = self.session.get(url, params={"content": "true"}, timeout=15)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
                jobs_raw = data.get("jobs", [])
                for raw in jobs_raw:
                    n = self._normalize(raw, slug)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except Exception as e:
                logger.warning("Greenhouse %s error: %s", slug, e)
                continue
        logger.info("Greenhouse: collected %d jobs from %d companies", len(all_jobs), len(self.companies))
        return all_jobs

    def _normalize(self, raw: dict, company_slug: str) -> Optional[dict]:
        try:
            title = raw.get("title", "")
            location_obj = raw.get("location", {})
            location = location_obj.get("name", "") if isinstance(location_obj, dict) else str(location_obj)

            # Departments as tags
            depts = raw.get("departments", [])
            tags = [d.get("name", "") for d in depts if isinstance(d, dict)]

            desc = ""
            content = raw.get("content", "")
            if content:
                desc = re.sub(r"<[^>]+>", " ", content)[:2000]

            # Company name: capitalize the slug
            company = company_slug.replace("-", " ").title()
            city = location.split(",")[0].strip() if location else ""

            return {
                "job_id": f"gh_{raw.get('id', '')}",
                "title": title,
                "company": company,
                "company_logo": "",
                "location": location,
                "country": "",
                "market_id": detect_market(location),
                "search_category": categorize(title, tags),
                "description": desc,
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": "FULLTIME",
                "is_remote": "remote" in location.lower(),
                "posted_at": raw.get("updated_at", raw.get("created_at", "")),
                "apply_link": raw.get("absolute_url", ""),
                "source": "Greenhouse",
                "required_skills": ",".join(tags[:10]),
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None


class LeverScraper:
    """Lever ATS — public postings API for tracked companies."""

    API_TEMPLATE = "https://api.lever.co/v0/postings/{company}"

    def __init__(self, companies: list[str] | None = None):
        self.companies = companies or LEVER_COMPANIES
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self) -> list[dict]:
        logger.info("Lever: scraping %d companies", len(self.companies))
        all_jobs = []
        for slug in self.companies:
            try:
                url = self.API_TEMPLATE.format(company=slug)
                resp = self.session.get(url, timeout=15)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                postings = resp.json()
                if not isinstance(postings, list):
                    continue
                for raw in postings:
                    n = self._normalize(raw, slug)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except Exception as e:
                logger.warning("Lever %s error: %s", slug, e)
                continue
        logger.info("Lever: collected %d jobs from %d companies", len(all_jobs), len(self.companies))
        return all_jobs

    def _normalize(self, raw: dict, company_slug: str) -> Optional[dict]:
        try:
            title = raw.get("text", "")
            categories = raw.get("categories", {})
            location = categories.get("location", "") if isinstance(categories, dict) else ""
            team = categories.get("team", "") if isinstance(categories, dict) else ""
            commitment = categories.get("commitment", "") if isinstance(categories, dict) else ""
            tags = [t for t in [team, commitment] if t]

            desc_parts = raw.get("descriptionPlain", raw.get("description", ""))
            desc = desc_parts[:2000] if desc_parts else ""

            company = company_slug.replace("-", " ").title()
            city = location.split(",")[0].strip() if location else ""
            created_at = raw.get("createdAt")
            posted = ""
            if created_at:
                try:
                    posted = datetime.fromtimestamp(created_at / 1000).isoformat()
                except (ValueError, TypeError, OSError):
                    pass

            return {
                "job_id": f"lev_{raw.get('id', '')}",
                "title": title,
                "company": company,
                "company_logo": "",
                "location": location,
                "country": "",
                "market_id": detect_market(location),
                "search_category": categorize(title, tags),
                "description": desc,
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": commitment.upper() if commitment else "FULLTIME",
                "is_remote": "remote" in location.lower(),
                "posted_at": posted,
                "apply_link": raw.get("hostedUrl", raw.get("applyUrl", "")),
                "source": "Lever",
                "required_skills": ",".join(tags[:10]),
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None


class HNWhoIsHiringScraper:
    """Hacker News 'Who is Hiring?' monthly threads — regex-parsed."""

    HN_API = "https://hacker-news.firebaseio.com/v0"
    HN_USER = "whoishiring"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self, max_comments: int = 500) -> list[dict]:
        logger.info("HN Who's Hiring: starting collection")
        all_jobs = []

        # Find the latest "Who is Hiring?" thread
        thread_id = self._find_latest_thread()
        if not thread_id:
            logger.warning("HN: Could not find latest Who is Hiring thread")
            return []

        # Fetch thread to get comment IDs
        try:
            resp = self.session.get(f"{self.HN_API}/item/{thread_id}.json", timeout=15)
            resp.raise_for_status()
            thread = resp.json()
            kids = thread.get("kids", [])[:max_comments]
        except Exception as e:
            logger.warning("HN thread fetch error: %s", e)
            return []

        # Parse each top-level comment as a job posting
        for comment_id in kids:
            try:
                resp = self.session.get(f"{self.HN_API}/item/{comment_id}.json", timeout=10)
                if resp.status_code != 200:
                    continue
                comment = resp.json()
                if not comment or comment.get("deleted") or comment.get("dead"):
                    continue
                n = self._parse_comment(comment, thread_id)
                if n:
                    all_jobs.append(n)
                time.sleep(0.2)
            except Exception:
                continue

        logger.info("HN Who's Hiring: collected %d jobs", len(all_jobs))
        return all_jobs

    def _find_latest_thread(self) -> int | None:
        """Find the most recent 'Who is Hiring?' story by whoishiring user."""
        try:
            resp = self.session.get(f"{self.HN_API}/user/{self.HN_USER}.json", timeout=10)
            resp.raise_for_status()
            user_data = resp.json()
            submitted = user_data.get("submitted", [])

            for story_id in submitted[:10]:
                resp = self.session.get(f"{self.HN_API}/item/{story_id}.json", timeout=10)
                if resp.status_code != 200:
                    continue
                story = resp.json()
                title = story.get("title", "")
                if "who is hiring" in title.lower() and story.get("type") == "story":
                    return story_id
                time.sleep(0.2)
        except Exception as e:
            logger.warning("HN thread search error: %s", e)
        return None

    def _parse_comment(self, comment: dict, thread_id: int) -> Optional[dict]:
        """Parse an HN comment into a job posting using regex.

        Common format: Company | Role | Location | Remote | Salary | URL
        """
        text = comment.get("text", "")
        if not text:
            return None

        # Strip HTML
        text_clean = re.sub(r"<[^>]+>", "\n", text)
        text_clean = text_clean.replace("&amp;", "&").replace("&gt;", ">").replace("&lt;", "<")
        text_clean = text_clean.replace("&#x27;", "'").replace("&quot;", '"')

        lines = [l.strip() for l in text_clean.split("\n") if l.strip()]
        if not lines:
            return None

        # Parse the first line (pipe-delimited header)
        first_line = lines[0]
        parts = [p.strip() for p in first_line.split("|")]

        # Need at least company | role
        if len(parts) < 2:
            # Try parsing as "Company (Location) - Role"
            match = re.match(r"^(.+?)\s*[\(\-]\s*(.+?)[\)\s]*[-|]\s*(.+)", first_line)
            if not match:
                return None
            company = match.group(1).strip()
            location = match.group(2).strip()
            title = match.group(3).strip()
        else:
            company = parts[0]
            title = parts[1] if len(parts) > 1 else ""
            location = parts[2] if len(parts) > 2 else ""

        if not company or not title:
            return None

        # Detect remote/onsite from parts
        is_remote = False
        for part in parts:
            if "remote" in part.lower():
                is_remote = True

        # Extract URL
        url_match = re.search(r'https?://\S+', text_clean)
        apply_link = url_match.group(0).rstrip(").,;") if url_match else ""

        # Description = rest of comment
        desc = "\n".join(lines[1:])[:2000] if len(lines) > 1 else first_line[:2000]

        city = location.split(",")[0].strip() if location else ""

        return {
            "job_id": f"hn_{comment.get('id', '')}",
            "title": title,
            "company": company,
            "company_logo": "",
            "location": location or ("Remote" if is_remote else ""),
            "country": "",
            "market_id": detect_market(location) if location else ("remote" if is_remote else "other"),
            "search_category": categorize(title, []),
            "description": desc,
            "salary_min": None,
            "salary_max": None,
            "salary_currency": "USD",
            "salary_period": "YEAR",
            "employment_type": "FULLTIME",
            "is_remote": is_remote,
            "posted_at": datetime.fromtimestamp(comment.get("time", 0)).isoformat() if comment.get("time") else "",
            "apply_link": apply_link,
            "source": "HNWhoIsHiring",
            "required_skills": "",
            "experience_required": None,
            "scraped_at": datetime.utcnow().isoformat(),
            "fingerprint": compute_fingerprint(company, title, city),
        }
