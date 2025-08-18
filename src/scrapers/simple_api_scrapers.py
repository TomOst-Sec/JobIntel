"""Simple free-API scrapers — TheMuse, Jobicy, Remotive."""
import logging
import re
import time
import requests
from datetime import datetime
from typing import Optional

from src.scrapers.utils import categorize, detect_market, parse_salary, compute_fingerprint

logger = logging.getLogger(__name__)


MUSE_CATEGORIES = [
    "Software Engineering", "Data Science", "Design and UX",
    "IT", "Project Management", "Marketing",
]


class TheMuseScraper:
    """TheMuse.com — free public API for curated tech jobs."""

    API_URL = "https://www.themuse.com/api/public/jobs"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self, pages: int = 50, categories: list = None) -> list[dict]:
        categories = categories or MUSE_CATEGORIES
        logger.info("TheMuse: starting collection (%d categories, up to %d pages each)", len(categories), pages)
        all_jobs = []
        for cat in categories:
            for page in range(pages):
                try:
                    params = {"page": page, "descending": "true", "category": cat}
                    if self.api_key:
                        params["api_key"] = self.api_key
                    resp = self.session.get(self.API_URL, params=params, timeout=15)
                    resp.raise_for_status()
                    data = resp.json()
                    results = data.get("results", [])
                    if not results:
                        break
                    for raw in results:
                        n = self._normalize(raw)
                        if n:
                            all_jobs.append(n)
                    time.sleep(1)
                except Exception as e:
                    logger.warning("TheMuse %s page %d error: %s", cat, page, e)
                    break
        logger.info("TheMuse: collected %d jobs", len(all_jobs))
        return all_jobs

    def _normalize(self, raw: dict) -> Optional[dict]:
        try:
            title = raw.get("name", "")
            company_obj = raw.get("company", {})
            company = company_obj.get("name", "") if isinstance(company_obj, dict) else ""
            locations = raw.get("locations", [])
            location = locations[0].get("name", "") if locations else "Remote"
            categories_raw = raw.get("categories", [])
            tags = [c.get("name", "") for c in categories_raw] if categories_raw else []
            levels = raw.get("levels", [])
            level_name = levels[0].get("name", "") if levels else None

            desc_parts = raw.get("contents", "")
            desc = re.sub(r"<[^>]+>", " ", desc_parts)[:2000]

            city = location.split(",")[0].strip() if location else ""

            return {
                "job_id": f"muse_{raw.get('id', '')}",
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
                "is_remote": "remote" in location.lower() or "flexible" in location.lower(),
                "posted_at": raw.get("publication_date", ""),
                "apply_link": raw.get("refs", {}).get("landing_page", ""),
                "source": "TheMuse",
                "required_skills": ",".join(tags[:10]),
                "experience_required": level_name,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None


class JobicyScraper:
    """Jobicy.com — free remote job API, no auth needed."""

    API_URL = "https://jobicy.com/api/v2/remote-jobs"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self, count: int = 200) -> list[dict]:
        logger.info("Jobicy: starting collection")
        all_jobs = []
        try:
            resp = self.session.get(self.API_URL, params={"count": count}, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            jobs_raw = data.get("jobs", [])
            for raw in jobs_raw:
                n = self._normalize(raw)
                if n:
                    all_jobs.append(n)
        except Exception as e:
            logger.warning("Jobicy error: %s", e)
        logger.info("Jobicy: collected %d jobs", len(all_jobs))
        return all_jobs

    def _normalize(self, raw: dict) -> Optional[dict]:
        try:
            title = raw.get("jobTitle", "")
            company = raw.get("companyName", "")
            location = raw.get("jobGeo", "Remote")
            desc = re.sub(r"<[^>]+>", " ", raw.get("jobExcerpt", ""))[:2000]
            job_type = raw.get("jobType", "")
            tags = raw.get("jobIndustry", [])
            if isinstance(tags, str):
                tags = [tags]

            sal_min, sal_max = None, None
            sal_str = raw.get("annualSalaryMin", "")
            if sal_str:
                try:
                    sal_min = float(sal_str)
                except (ValueError, TypeError):
                    pass
            sal_str = raw.get("annualSalaryMax", "")
            if sal_str:
                try:
                    sal_max = float(sal_str)
                except (ValueError, TypeError):
                    pass

            city = location.split(",")[0].strip() if location else ""

            return {
                "job_id": f"jby_{raw.get('id', '')}",
                "title": title,
                "company": company,
                "company_logo": raw.get("companyLogo", ""),
                "location": location,
                "country": "",
                "market_id": detect_market(location),
                "search_category": categorize(title, tags),
                "description": desc,
                "salary_min": sal_min,
                "salary_max": sal_max,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": job_type.upper() if job_type else "FULLTIME",
                "is_remote": True,
                "posted_at": raw.get("pubDate", ""),
                "apply_link": raw.get("url", ""),
                "source": "Jobicy",
                "required_skills": ",".join(tags[:10]) if tags else "",
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None


REMOTIVE_CATEGORIES = [
    "software-dev", "data", "devops-sysadmin", "product",
    "design", "qa", "cyber-security",
]


class RemotiveScraper:
    """Remotive.com — free remote job API, no auth."""

    API_URL = "https://remotive.com/api/remote-jobs"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "JobIntel/1.0"})

    def collect_all(self, categories: list = None) -> list[dict]:
        categories = categories or REMOTIVE_CATEGORIES
        logger.info("Remotive: starting collection (%d categories)", len(categories))
        all_jobs = []
        for cat in categories:
            try:
                resp = self.session.get(self.API_URL, params={"category": cat}, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                jobs_raw = data.get("jobs", [])
                for raw in jobs_raw:
                    n = self._normalize(raw)
                    if n:
                        all_jobs.append(n)
                time.sleep(1)
            except Exception as e:
                logger.warning("Remotive %s error: %s", cat, e)
                continue
        logger.info("Remotive: collected %d jobs", len(all_jobs))
        return all_jobs

    def _normalize(self, raw: dict) -> Optional[dict]:
        try:
            title = raw.get("title", "")
            company = raw.get("company_name", "")
            location = raw.get("candidate_required_location", "Worldwide")
            desc = re.sub(r"<[^>]+>", " ", raw.get("description", ""))[:2000]
            category = raw.get("category", "")
            tags = [category] if category else []
            tags.extend(raw.get("tags", []))

            sal_str = raw.get("salary", "")
            sal_min, sal_max = parse_salary(sal_str)

            city = location.split(",")[0].strip() if location else ""

            return {
                "job_id": f"rmt_{raw.get('id', '')}",
                "title": title,
                "company": company,
                "company_logo": raw.get("company_logo_url", raw.get("company_logo", "")),
                "location": location,
                "country": "",
                "market_id": detect_market(location) if location and location != "Worldwide" else "remote",
                "search_category": categorize(title, tags),
                "description": desc,
                "salary_min": sal_min,
                "salary_max": sal_max,
                "salary_currency": "USD",
                "salary_period": "YEAR",
                "employment_type": raw.get("job_type", "").upper() or "FULLTIME",
                "is_remote": True,
                "posted_at": raw.get("publication_date", ""),
                "apply_link": raw.get("url", ""),
                "source": "Remotive",
                "required_skills": ",".join(tags[:10]),
                "experience_required": None,
                "scraped_at": datetime.utcnow().isoformat(),
                "fingerprint": compute_fingerprint(company, title, city),
            }
        except Exception:
            return None
