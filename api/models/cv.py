"""CV upload and analysis models."""
from pydantic import BaseModel


class CVUploadResponse(BaseModel):
    id: int
    filename: str
    file_size: int | None = None
    created_at: str


class CVAnalysis(BaseModel):
    id: int
    cv_id: int
    market_position_score: int | None = None
    skills_gap: list[str] | None = None
    salary_estimate_min: float | None = None
    salary_estimate_max: float | None = None
    recommended_roles: list[str] | None = None
    opportunity_map: dict | None = None
    ai_narrative: str | None = None
    created_at: str
