"""Free job API scrapers — no auth, no signup, no BS."""
import time
import re
import requests
from datetime import datetime
from typing import Optional
from rich.console import Console
from rich.progress import track

from src.scrapers.utils import (
    parse_salary as _parse_salary,
    detect_market as _detect_market,
    categorize as _categorize,
    compute_fingerprint,
)

console = Console()


class RemoteOKScraper:
    """RemoteOK.com — 100% free API, remote tech jobs."""

    API_URL = "https://remoteok.com/api"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self) -> list[dict]:
        console.print("\n[bold cyan]🌐 RemoteOK: Fetching remote tech jobs...[/bold cyan]")
        try:
            resp = self.session.get(self.API_URL)
            resp.raise_for_status()
            raw_jobs = resp.json()
            if raw_jobs and isinstance(raw_jobs[0], dict) and "legal" in str(raw_jobs[0]):
                raw_jobs = raw_jobs[1:]
            jobs = [j for j in (self._normalize(r) for r in raw_jobs) if j]
            console.print(f"[green]✅ RemoteOK: {len(jobs)} jobs[/green]")
            return jobs
        except Exception as e:
            console.print(f"[red]RemoteOK error: {e}[/red]")
            return []

    def _normalize(self, raw: dict) -> Optional[dict]:
        try:
            tags = raw.get("tags", [])
            category = _categorize(raw.get("position", ""), tags)
            desc = re.sub(r"<[^>]+>", " ", raw.get("description", ""))[:2000]
            salary_min, salary_max = _parse_salary(raw.get("salary", ""))
            return {
                "job_id": f"rok_{raw.get('id', '')}",
                "title": raw.get("position", ""),
                "company": raw.get("company", ""),
                "company_logo": raw.get("company_logo", ""),
                "location": raw.get("location", "Remote"),
                "country": "",
                "market_id": "remote",
                "search_category": category,
                "description": desc,
                "salary_min": salary_min,
                "salary_max": salary_max,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": "FULLTIME",
                "is_remote": True,
                "posted_at": raw.get("date", ""),
                "apply_link": raw.get("url", f"https://remoteok.com/remote-jobs/{raw.get('slug', '')}"),
                "source": "RemoteOK",
                "required_skills": ",".join(tags[:10]),
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except:
            return None


class ArbeitnowScraper:
    """Arbeitnow.com — free job board API."""

    API_URL = "https://www.arbeitnow.com/api/job-board-api"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self, pages: int = 30) -> list[dict]:
        console.print(f"\n[bold cyan]🇪🇺 Arbeitnow: Fetching tech jobs (up to {pages} pages)...[/bold cyan]")
        all_jobs = []
        for page in range(1, pages + 1):
            try:
                resp = self.session.get(self.API_URL, params={"page": page})
                resp.raise_for_status()
                raw_jobs = resp.json().get("data", [])
                if not raw_jobs:
                    break
                all_jobs.extend(j for j in (self._normalize(r) for r in raw_jobs) if j)
                console.print(f"[dim]  Page {page}: {len(raw_jobs)} jobs[/dim]")
                time.sleep(1)
            except Exception as e:
                console.print(f"[red]Arbeitnow page {page} error: {e}[/red]")
                break
        console.print(f"[green]✅ Arbeitnow: {len(all_jobs)} jobs[/green]")
        return all_jobs

    def _normalize(self, raw: dict) -> Optional[dict]:
        try:
            title = raw.get("title", "")
            tags = raw.get("tags", [])
            category = _categorize(title, tags)
            location = raw.get("location", "")
            market_id = _detect_market(location)
            desc = re.sub(r"<[^>]+>", " ", raw.get("description", ""))[:2000]
            return {
                "job_id": f"abn_{raw.get('slug', '')}",
                "title": title,
                "company": raw.get("company_name", ""),
                "company_logo": "",
                "location": location,
                "country": "",
                "market_id": market_id,
                "search_category": category,
                "description": desc,
                "salary_min": None,
                "salary_max": None,
                "salary_currency": "EUR",
                "salary_period": "",
                "employment_type": "FULLTIME",
                "is_remote": raw.get("remote", False),
                "posted_at": raw.get("created_at", ""),
                "apply_link": raw.get("url", ""),
                "source": "Arbeitnow",
                "required_skills": ",".join(tags[:10]) if tags else "",
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except:
            return None


ADZUNA_QUERIES = [
    "software engineer", "data scientist", "data engineer", "machine learning",
    "devops", "cloud engineer", "cybersecurity", "frontend developer",
    "backend developer", "full stack developer", "product manager",
    "AI engineer", "mobile developer", "QA engineer", "systems engineer",
    "network engineer", "database administrator", "site reliability",
    "blockchain developer", "embedded engineer",
]

ADZUNA_COUNTRY_MARKET_MAP = {
    "us": "us_other", "gb": "london", "ca": "canada", "au": "australia",
    "de": "europe", "fr": "europe", "nl": "europe", "in": "india",
    "sg": "singapore", "br": "other", "at": "europe", "nz": "australia",
    "pl": "europe", "za": "other", "it": "europe", "es": "europe",
}

ADZUNA_CURRENCY_MAP = {
    "us": "USD", "gb": "GBP", "ca": "CAD", "au": "AUD", "de": "EUR",
    "fr": "EUR", "nl": "EUR", "in": "INR", "sg": "SGD", "br": "BRL",
    "at": "EUR", "nz": "NZD", "pl": "PLN", "za": "ZAR", "it": "EUR",
    "es": "EUR",
}


class AdzunaScraper:
    """Adzuna.com — free job search API. Needs API key but free tier is generous."""

    def __init__(self, app_id: str = "", app_key: str = ""):
        self.app_id = app_id
        self.app_key = app_key
        self.session = requests.Session()

    def collect_all(self, countries: list = None, queries: list = None, pages: int = 10) -> list[dict]:
        if not self.app_id:
            return []
        countries = countries or [
            "us", "gb", "ca", "au", "de", "fr", "nl", "in",
            "sg", "br", "at", "nz", "pl", "za", "it", "es",
        ]
        queries = queries or ADZUNA_QUERIES
        all_jobs = []
        for country in countries:
            for query in queries:
                for page in range(1, pages + 1):
                    try:
                        resp = self.session.get(
                            f"https://api.adzuna.com/v1/api/jobs/{country}/search/{page}",
                            params={
                                "app_id": self.app_id, "app_key": self.app_key,
                                "results_per_page": 50, "what": query,
                                "max_days_old": 30,
                            }, timeout=15)
                        resp.raise_for_status()
                        results = resp.json().get("results", [])
                        if not results:
                            break
                        for r in results:
                            n = self._normalize(r, country)
                            if n:
                                all_jobs.append(n)
                        time.sleep(1)
                    except Exception:
                        break
        if all_jobs:
            console.print(f"[green]✅ Adzuna: {len(all_jobs)} jobs across {len(countries)} countries[/green]")
        return all_jobs

    def _normalize(self, raw: dict, country: str) -> Optional[dict]:
        try:
            title = raw.get("title", "")
            location = raw.get("location", {}).get("display_name", "")
            return {
                "job_id": f"adz_{raw.get('id', '')}",
                "title": title,
                "company": raw.get("company", {}).get("display_name", ""),
                "company_logo": "",
                "location": location,
                "country": country.upper(),
                "market_id": ADZUNA_COUNTRY_MARKET_MAP.get(country, "other"),
                "search_category": _categorize(title, []),
                "description": raw.get("description", "")[:2000],
                "salary_min": raw.get("salary_min"),
                "salary_max": raw.get("salary_max"),
                "salary_currency": ADZUNA_CURRENCY_MAP.get(country, "USD"),
                "salary_period": "YEAR",
                "employment_type": raw.get("contract_type", ""),
                "is_remote": "remote" in title.lower() or "remote" in raw.get("description", "").lower()[:200],
                "posted_at": raw.get("created", ""),
                "apply_link": raw.get("redirect_url", ""),
                "source": "Adzuna",
                "required_skills": "",
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except Exception:
            return None


class USAJobsScraper:
    """USAJobs.gov — completely free, no auth needed for basic search."""

    API_URL = "https://data.usajobs.gov/api/search"

    def __init__(self, api_key: str = "", email: str = ""):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": email or "jobintel@example.com",
            "Authorization-Key": api_key or "",
        })

    def collect_all(self, keywords: list = None, pages: int = 3) -> list[dict]:
        keywords = keywords or [
            "software engineer", "data scientist", "cybersecurity", "cloud engineer",
            "AI", "machine learning", "devops", "systems engineer", "network engineer",
            "database administrator", "information security", "web developer",
            "mobile developer", "data analyst", "IT specialist", "computer scientist",
            "program analyst", "electronics engineer", "biomedical engineer",
            "electrical engineer", "project manager IT", "telecommunications",
            "GIS specialist", "technical writer", "quality assurance",
        ]
        all_jobs = []
        console.print(f"\n[bold cyan]🇺🇸 USAJobs: Fetching government tech jobs ({len(keywords)} keywords)...[/bold cyan]")
        for kw in keywords:
            try:
                resp = self.session.get(self.API_URL, params={
                    "Keyword": kw, "ResultsPerPage": 100, "DatePosted": 30,
                }, timeout=10)
                if resp.status_code != 200:
                    continue
                data = resp.json()
                items = data.get("SearchResult", {}).get("SearchResultItems", [])
                for item in items:
                    n = self._normalize(item, kw)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except Exception:
                continue
        console.print(f"[green]✅ USAJobs: {len(all_jobs)} jobs[/green]")
        return all_jobs

    def _normalize(self, item: dict, keyword: str) -> Optional[dict]:
        try:
            mp = item.get("MatchedObjectDescriptor", {})
            pos = mp.get("PositionTitle", "")
            org = mp.get("OrganizationName", "")
            loc_list = mp.get("PositionLocation", [])
            location = loc_list[0].get("LocationName", "") if loc_list else ""
            sal_min = mp.get("PositionRemuneration", [{}])[0].get("MinimumRange") if mp.get("PositionRemuneration") else None
            sal_max = mp.get("PositionRemuneration", [{}])[0].get("MaximumRange") if mp.get("PositionRemuneration") else None
            try:
                sal_min = float(sal_min) if sal_min else None
                sal_max = float(sal_max) if sal_max else None
            except:
                sal_min, sal_max = None, None

            return {
                "job_id": f"usa_{mp.get('PositionID', '')}_{mp.get('PositionURI', '')[-8:]}",
                "title": pos,
                "company": org,
                "company_logo": "",
                "location": location,
                "country": "US",
                "market_id": _detect_market(location),
                "search_category": _categorize(pos, [keyword]),
                "description": mp.get("QualificationSummary", "")[:2000],
                "salary_min": sal_min,
                "salary_max": sal_max,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": "FULLTIME",
                "is_remote": "remote" in str(mp.get("PositionLocationDisplay", "")).lower(),
                "posted_at": mp.get("PublicationStartDate", ""),
                "apply_link": mp.get("ApplyURI", [""])[0] if mp.get("ApplyURI") else "",
                "source": "USAJobs",
                "required_skills": keyword,
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
            }
        except:
            return None


class ReedScraper:
    """Reed.co.uk — UK job board, free API with registration."""

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.session = requests.Session()

    def collect_all(self, keywords: list = None, pages: int = 3) -> list[dict]:
        if not self.api_key:
            return []
        keywords = keywords or ["software engineer", "data scientist", "devops"]
        all_jobs = []
        for kw in keywords:
            try:
                resp = self.session.get("https://www.reed.co.uk/api/1.0/search",
                    params={"keywords": kw, "resultsToTake": 100, "postedWithinDays": 7},
                    auth=(self.api_key, ""), timeout=10)
                if resp.status_code != 200:
                    continue
                for r in resp.json().get("results", []):
                    n = self._normalize(r, kw)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except:
                continue
        if all_jobs:
            console.print(f"[green]✅ Reed.co.uk: {len(all_jobs)} jobs[/green]")
        return all_jobs

    def _normalize(self, raw: dict, keyword: str) -> Optional[dict]:
        try:
            return {
                "job_id": f"reed_{raw.get('jobId', '')}",
                "title": raw.get("jobTitle", ""),
                "company": raw.get("employerName", ""),
                "company_logo": "",
                "location": raw.get("locationName", ""),
                "country": "GB",
                "market_id": "london" if "london" in raw.get("locationName", "").lower() else "europe",
                "search_category": _categorize(raw.get("jobTitle", ""), [keyword]),
                "description": raw.get("jobDescription", "")[:2000],
                "salary_min": raw.get("minimumSalary"),
                "salary_max": raw.get("maximumSalary"),
                "salary_currency": "GBP",
                "salary_period": "YEAR",
                "employment_type": "FULLTIME",
                "is_remote": "remote" in raw.get("jobTitle", "").lower(),
                "posted_at": raw.get("date", ""),
                "apply_link": raw.get("jobUrl", ""),
                "source": "Reed",
                "required_skills": keyword,
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "external_applicant_count": raw.get("applications"),
            }
        except:
            return None


# Utility functions are now in src.scrapers.utils — imported at top of file.
