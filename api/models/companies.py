"""Company-related models."""
from pydantic import BaseModel


class CompanyIntel(BaseModel):
    company: str
    total_jobs: int
    markets: list[str]
    categories: list[str]
    avg_salary_min: float | None = None
    avg_salary_max: float | None = None
    remote_pct: float | None = None
    earliest_post: str | None = None
    latest_post: str | None = None
    hiring_velocity: str | None = None  # 'accelerating', 'steady', 'slowing'


class CompanyTimeline(BaseModel):
    date: str
    postings: int
