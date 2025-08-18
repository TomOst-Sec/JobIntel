"""LinkedIn Data API scraper for richer job + company intelligence."""
import time
import requests
from datetime import datetime
from typing import Optional
from rich.console import Console
from rich.progress import track

from .config import RAPIDAPI_KEY, LINKEDIN_BASE_URL, LINKEDIN_HOST, MARKETS, CATEGORIES

console = Console()


class LinkedInScraper:
    """Collects job postings and company data from LinkedIn via RapidAPI."""

    def __init__(self):
        self.headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": LINKEDIN_HOST,
        }
        self.session = requests.Session()
        self.session.headers.update(self.headers)

    def search_jobs(
        self,
        keywords: str,
        location: str,
        date_posted: str = "pastWeek",
        sort: str = "mostRecent",
        start: int = 0,
        max_retries: int = 3,
    ) -> list[dict]:
        """Search LinkedIn jobs.
        
        Args:
            keywords: Job title or keyword
            location: Location string (e.g., "San Francisco, CA")
            date_posted: pastWeek, past24Hours, pastMonth
            sort: mostRecent or mostRelevant
            start: Pagination offset
            max_retries: Retry count on rate limit
        
        Returns:
            List of job dicts
        """
        params = {
            "keywords": keywords,
            "locationId": "",
            "datePosted": date_posted,
            "sort": sort,
            "start": str(start),
        }
        # LinkedIn API uses geo IDs or location strings
        # Try with plain location text
        if location:
            params["location"] = location

        for attempt in range(max_retries):
            try:
                resp = self.session.get(f"{LINKEDIN_BASE_URL}/search-jobs", params=params)
                if resp.status_code == 429:
                    wait = 5 * (attempt + 1)
                    console.print(f"[yellow]  Rate limited, waiting {wait}s (attempt {attempt+1}/{max_retries})...[/yellow]")
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", data) if isinstance(data, dict) else data
            except requests.exceptions.RequestException as e:
                if "429" in str(e) and attempt < max_retries - 1:
                    wait = 5 * (attempt + 1)
                    console.print(f"[yellow]  Rate limited, waiting {wait}s...[/yellow]")
                    time.sleep(wait)
                    continue
                console.print(f"[red]LinkedIn API error for {keywords} in {location}: {e}[/red]")
                return []
        return []

    def get_job_details(self, job_id: str) -> Optional[dict]:
        """Get detailed info about a specific LinkedIn job posting."""
        params = {"id": job_id}
        try:
            resp = self.session.get(f"{LINKEDIN_BASE_URL}/get-job-details", params=params)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            console.print(f"[red]Job details error: {e}[/red]")
            return None

    def get_company_details(self, username: str) -> Optional[dict]:
        """Get company details by LinkedIn username/slug."""
        params = {"username": username}
        try:
            resp = self.session.get(f"{LINKEDIN_BASE_URL}/get-company-details", params=params)
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.RequestException as e:
            console.print(f"[red]Company details error for {username}: {e}[/red]")
            return None

    def search_companies(self, keywords: str, max_retries: int = 3) -> list[dict]:
        """Search for companies on LinkedIn."""
        params = {"keywords": keywords}
        for attempt in range(max_retries):
            try:
                resp = self.session.get(f"{LINKEDIN_BASE_URL}/search-companies", params=params)
                if resp.status_code == 429:
                    wait = 5 * (attempt + 1)
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", data) if isinstance(data, dict) else data
            except requests.exceptions.RequestException as e:
                if "429" in str(e) and attempt < max_retries - 1:
                    time.sleep(5 * (attempt + 1))
                    continue
                console.print(f"[red]Company search error: {e}[/red]")
                return []
        return []

    def collect_all(self, date_posted: str = "pastWeek") -> list[dict]:
        """Collect jobs across all markets and categories from LinkedIn.
        
        Returns:
            List of normalized job dicts
        """
        all_jobs = []
        total_queries = len(MARKETS) * len(CATEGORIES)

        console.print(f"\n[bold cyan]🔗 LinkedIn: Collecting jobs across {len(MARKETS)} markets, {len(CATEGORIES)} categories[/bold cyan]")
        console.print(f"[dim]Total API calls: ~{total_queries}[/dim]\n")

        for market_id, market in MARKETS.items():
            console.print(f"\n[bold blue]📍 {market['name']} (LinkedIn)[/bold blue]")

            for category in track(CATEGORIES, description=f"  LinkedIn {market['name']}"):
                raw_jobs = self.search_jobs(
                    keywords=category,
                    location=market["query_location"],
                    date_posted=date_posted,
                )

                if isinstance(raw_jobs, list):
                    for job in raw_jobs:
                        normalized = self._normalize_job(job, market_id, category)
                        if normalized:
                            all_jobs.append(normalized)

                # Rate limiting: be conservative
                time.sleep(3)

        console.print(f"\n[bold green]✅ LinkedIn: Collected {len(all_jobs)} job postings[/bold green]")
        return all_jobs

    def _normalize_job(self, raw: dict, market_id: str, search_category: str) -> Optional[dict]:
        """Normalize a LinkedIn job into our schema."""
        try:
            # LinkedIn API response format varies — handle common structures
            job_id = raw.get("id", raw.get("jobId", raw.get("trackingUrn", "")))
            title = raw.get("title", raw.get("jobTitle", ""))
            company = raw.get("company", raw.get("companyName", ""))
            if isinstance(company, dict):
                company = company.get("name", company.get("companyName", str(company)))
            location = raw.get("location", raw.get("formattedLocation", ""))

            if not title or not company:
                return None

            return {
                "job_id": f"li_{job_id}" if job_id else f"li_{hash(f'{title}{company}')}",
                "title": title,
                "company": company,
                "company_logo": raw.get("companyLogo", raw.get("logo", "")),
                "location": location,
                "country": "",
                "market_id": market_id,
                "search_category": search_category,
                "description": str(raw.get("description", ""))[:2000],
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "USD",
                "salary_period": "",
                "employment_type": raw.get("type", raw.get("employmentType", "")),
                "is_remote": "remote" in str(raw.get("location", "")).lower(),
                "posted_at": raw.get("postedAt", raw.get("listedAt", "")),
                "apply_link": raw.get("url", raw.get("jobUrl", "")),
                "source": "LinkedIn",
                "required_skills": "",
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            console.print(f"[dim red]  LinkedIn normalize error: {e}[/dim red]")
            return None
