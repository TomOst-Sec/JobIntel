"""Admin dashboard request/response models."""
from pydantic import BaseModel
from typing import Optional


class ScraperStatus(BaseModel):
    scraper_name: str
    is_enabled: bool = True
    interval_hours: float = 4
    schedule_group: str = "standard_scrapers"
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    last_jobs_found: int = 0


class LifecycleStats(BaseModel):
    active: int = 0
    stale: int = 0
    expired: int = 0
    ghost: int = 0
    archived: int = 0
    total: int = 0


class ScraperTriggerResponse(BaseModel):
    message: str
    group: str
