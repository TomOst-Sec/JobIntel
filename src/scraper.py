"""Job data collection from JSearch API."""
import time
import requests
from datetime import datetime, timedelta
from typing import Optional
from rich.console import Console
from rich.progress import track

from .config import RAPIDAPI_KEY, JSEARCH_BASE_URL, JSEARCH_HOST, MARKETS, CATEGORIES

console = Console()


class JobScraper:
    """Collects job postings from JSearch API (aggregates LinkedIn, Indeed, Glassdoor, etc.)."""

    def __init__(self):
        self.headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": JSEARCH_HOST,
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def search_jobs(
        self,
        query: str,
        location: str,
        radius: int = 50,
        page: int = 1,
        num_pages: int = 1,
        date_posted: str = "week",
        max_retries: int = 3,
    ) -> list[dict]:
        """Search for jobs using JSearch API.
        
        Args:
            query: Job title or keyword
            location: City/region
            radius: Search radius in miles
            page: Page number
            num_pages: Number of pages to fetch
            date_posted: Filter by date (all, today, 3days, week, month)
            max_retries: Number of retries on rate limit
        
        Returns:
            List of job posting dicts
        """
        params = {
            "query": f"{query} in {location}",
            "page": str(page),
            "num_pages": str(num_pages),
            "date_posted": date_posted,
            "remote_jobs_only": "false",
        }

        for attempt in range(max_retries):
            try:
                resp = self.session.get(f"{JSEARCH_BASE_URL}/search", params=params)
                if resp.status_code == 429:
                    wait = 5 * (attempt + 1)
                    console.print(f"[yellow]  Rate limited, waiting {wait}s (attempt {attempt+1}/{max_retries})...[/yellow]")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", [])
            except requests.exceptions.RequestException as e:
                if "429" in str(e) and attempt < max_retries - 1:
                    wait = 5 * (attempt + 1)
                    console.print(f"[yellow]  Rate limited, waiting {wait}s...[/yellow]")
                    time.sleep(wait)
                    continue
                console.print(f"[red]API error for {query} in {location}: {e}[/red]")
                return []
        return []

    def get_estimated_salary(
        self, title: str, location: str, radius: int = 100
    ) -> Optional[dict]:
        """Get estimated salary for a job title in a location."""
        params = {
            "job_title": title,
            "location": location,
            "radius": str(radius),
        }

        try:
            resp = self.session.get(f"{JSEARCH_BASE_URL}/estimated-salary", params=params)
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", [])
        except requests.exceptions.RequestException as e:
            console.print(f"[red]Salary API error for {title} in {location}: {e}[/red]")
            return None

    def collect_all(self, date_posted: str = "week") -> list[dict]:
        """Collect jobs across all markets and categories.
        
        Returns:
            List of normalized job dicts
        """
        all_jobs = []
        total_queries = len(MARKETS) * len(CATEGORIES)

        console.print(f"\n[bold cyan]🔍 Collecting jobs across {len(MARKETS)} markets, {len(CATEGORIES)} categories[/bold cyan]")
        console.print(f"[dim]Total API calls: ~{total_queries}[/dim]\n")

        query_count = 0
        for market_id, market in MARKETS.items():
            console.print(f"\n[bold yellow]📍 {market['name']}[/bold yellow]")

            for category in track(CATEGORIES, description=f"  Scraping {market['name']}"):
                raw_jobs = self.search_jobs(
                    query=category,
                    location=market["query_location"],
                    radius=market["radius"],
                    date_posted=date_posted,
                )

                for job in raw_jobs:
                    normalized = self._normalize_job(job, market_id, category)
                    if normalized:
                        all_jobs.append(normalized)

                query_count += 1
                # Rate limiting: JSearch free tier needs breathing room
                time.sleep(3)

        console.print(f"\n[bold green]✅ Collected {len(all_jobs)} job postings from {query_count} queries[/bold green]")
        return all_jobs

    def collect_market(self, market_id: str, market: dict, date_posted: str = "week") -> list[dict]:
        """Collect jobs for a single market. Returns normalized jobs."""
        jobs = []
        console.print(f"\n[bold yellow]📍 {market['name']}[/bold yellow]")
        for category in track(CATEGORIES, description=f"  Scraping {market['name']}"):
            raw_jobs = self.search_jobs(
                query=category,
                location=market["query_location"],
                radius=market["radius"],
                date_posted=date_posted,
            )
            for job in raw_jobs:
                normalized = self._normalize_job(job, market_id, category)
                if normalized:
                    jobs.append(normalized)
            time.sleep(3)
        return jobs

    def _normalize_job(self, raw: dict, market_id: str, search_category: str) -> Optional[dict]:
        """Normalize a raw JSearch job into our schema."""
        try:
            return {
                "job_id": raw.get("job_id", ""),
                "title": raw.get("job_title", ""),
                "company": raw.get("employer_name", ""),
                "company_logo": raw.get("employer_logo", ""),
                "location": raw.get("job_city", "") or raw.get("job_state", ""),
                "country": raw.get("job_country", ""),
                "market_id": market_id,
                "search_category": search_category,
                "description": raw.get("job_description", "")[:2000],  # truncate
                "salary_min": raw.get("job_min_salary"),
                "salary_max": raw.get("job_max_salary"),
                "salary_currency": raw.get("job_salary_currency", "USD"),
                "salary_period": raw.get("job_salary_period", ""),
                "employment_type": raw.get("job_employment_type", ""),
                "is_remote": raw.get("job_is_remote", False),
                "posted_at": raw.get("job_posted_at_datetime_utc", ""),
                "apply_link": raw.get("job_apply_link", ""),
                "source": raw.get("job_publisher", ""),
                "required_skills": ",".join(raw.get("job_required_skills") or []),
                "experience_required": raw.get("job_required_experience", {}).get("required_experience_in_months"),
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            console.print(f"[dim red]  Normalize error: {e}[/dim red]")
            return None
