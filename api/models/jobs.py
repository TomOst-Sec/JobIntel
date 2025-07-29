"""Job-related request/response models."""
from pydantic import BaseModel
from typing import Optional


class JobResponse(BaseModel):
    job_id: str
    title: str
    company: str
    company_logo: str | None = None
    location: str | None = None
    country: str | None = None
    market_id: str | None = None
    search_category: str | None = None
    description: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = None
    salary_period: str | None = None
    employment_type: str | None = None
    is_remote: bool = False
    posted_at: str | None = None
    apply_link: str | None = None
    source: str | None = None
    required_skills: str | None = None
    experience_required: int | None = None
    scraped_at: str | None = None
    # Intelligence fields
    ghost_score: float | None = None
    ghost_signals: str | None = None
    repost_count: int | None = None
    # Lifecycle fields
    fingerprint: str | None = None
    status: str | None = "ACTIVE"
    last_confirmed_live: str | None = None
    stale_score: float | None = None
    user_reports: int | None = 0
    # Applicant counts
    external_applicant_count: int | None = None
    internal_applicant_count: int = 0


class PaginatedJobsResponse(BaseModel):
    items: list[JobResponse]
    total: int
    page: int
    per_page: int
    pages: int


class JobSearchParams(BaseModel):
    market_id: Optional[str] = None
    category: Optional[str] = None
    company: Optional[str] = None
    is_remote: Optional[bool] = None
    min_salary: Optional[float] = None
    query: Optional[str] = None
    page: int = 1
    per_page: int = 50


class MarketOverview(BaseModel):
    market_id: str
    total_jobs: int
    unique_companies: int
    categories_active: int
    remote_jobs: int
    remote_pct: float | None = None
    avg_salary: float | None = None


class SalaryStat(BaseModel):
    search_category: str
    market_id: str
    job_count: int
    avg_min_salary: float | None = None
    avg_max_salary: float | None = None
    avg_midpoint: float | None = None
    lowest_salary: float | None = None
    highest_salary: float | None = None


class SkillDemand(BaseModel):
    search_category: str
    market_id: str
    demand_count: int
    remote_count: int
    avg_salary: float | None = None


class ScalingCompany(BaseModel):
    company: str
    market_id: str
    total_postings: int
    unique_categories: int
    categories: str | None = None
    earliest_post: str | None = None
    latest_post: str | None = None


class StatsResponse(BaseModel):
    total_jobs: int
    unique_companies: int
    markets: int
    with_salary: int
