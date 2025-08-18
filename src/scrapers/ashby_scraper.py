"""Ashby ATS scraper — GraphQL API for tracked companies."""
import logging
import time
import requests
from datetime import datetime
from typing import Optional

from src.scrapers.utils import categorize, detect_market, compute_fingerprint

logger = logging.getLogger(__name__)

ASHBY_COMPANIES = [
    "notion", "ramp", "retool", "linear", "vercel", "mercury", "loom",
    "lattice", "deel", "rippling", "brex", "gusto", "vanta", "ironclad",
    "ashby", "watershed", "census", "hightouch", "airbyte", "fivetran",
    "dbt-labs", "prefect", "dagster", "hex", "mode", "sigma", "lightdash",
    "cube", "metabase", "preset", "starburst", "clickhouse", "neon",
    "turso", "planetscale", "cockroach-labs", "singlestore", "timescale",
    "questdb", "influxdata", "grafana", "datadog-labs", "chronosphere",
    "lightstep", "honeycomb", "observe-inc", "coralogix", "logdna",
    "cribl", "mezmo", "edge-delta", "groundcover", "komodor",
    "loft-labs", "kubecost", "cast-ai", "spot-by-netapp", "env0",
]

ASHBY_GQL_URL = "https://jobs.ashbyhq.com/api/non-user-graphql"
ASHBY_GQL_QUERY = """
query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: jobBoardWithTeams(
    organizationHostedJobsPageName: $organizationHostedJobsPageName
  ) {
    teams {
      id
      name
    }
    jobPostings {
      id
      title
      teamId
      locationId
      locationName
      isRemote
      compensationTierSummary
      publishedDate
      departmentName
    }
  }
}
""".strip()


class AshbyScraper:
    """Ashby ATS — GraphQL API for tracked companies."""

    def __init__(self, companies: list[str] | None = None):
        self.companies = companies or ASHBY_COMPANIES
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "JobIntel/1.0",
            "Content-Type": "application/json",
        })

    def collect_all(self) -> list[dict]:
        logger.info("Ashby: scraping %d companies", len(self.companies))
        all_jobs = []
        for slug in self.companies:
            try:
                payload = {
                    "operationName": "ApiJobBoardWithTeams",
                    "variables": {"organizationHostedJobsPageName": slug},
                    "query": ASHBY_GQL_QUERY,
                }
                resp = self.session.post(ASHBY_GQL_URL, json=payload, timeout=15)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                data = resp.json()
                board = data.get("data", {}).get("jobBoard")
                if not board:
                    continue
                postings = board.get("jobPostings", [])
                teams = {t["id"]: t["name"] for t in board.get("teams", []) if "id" in t}
                for raw in postings:
                    n = self._normalize(raw, slug, teams)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except Exception as e:
                logger.warning("Ashby %s error: %s", slug, e)
                continue
        logger.info("Ashby: collected %d jobs from %d companies", len(all_jobs), len(self.companies))
        return all_jobs

    def _normalize(self, raw: dict, company_slug: str, teams: dict) -> Optional[dict]:
        try:
            title = raw.get("title", "")
            location = raw.get("locationName", "")
            is_remote = raw.get("isRemote", False)
            department = raw.get("departmentName", "")
            team_id = raw.get("teamId")
            team_name = teams.get(team_id, "") if team_id else ""
            tags = [t for t in [department, team_name] if t]

            company = company_slug.replace("-", " ").title()
            city = location.split(",")[0].strip() if location else ""

            return {
                "job_id": f"ash_{raw.get('id', '')}",
                "title": title,
                "company": company,
                "company_logo": "",
                "location": location or ("Remote" if is_remote else ""),
                "country": "",
                "market_id": detect_market(location) if location else ("remote" if is_remote else "other"),
                "search_category": categorize(title, tags),
                "description": raw.get("compensationTierSummary", "") or "",
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": "FULLTIME",
                "is_remote": is_remote or "remote" in location.lower(),
                "posted_at": raw.get("publishedDate", ""),
                "apply_link": f"https://jobs.ashbyhq.com/{company_slug}/{raw.get('id', '')}",
                "source": "Ashby",
                "required_skills": ",".join(tags[:10]),
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None
