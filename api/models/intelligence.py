"""Pydantic models for intelligence features."""
from pydantic import BaseModel


# --- Ghost Jobs ---

class GhostAnalysisResponse(BaseModel):
    job_id: str
    title: str | None = None
    company: str | None = None
    ghost_score: float
    signals: list[dict]
    repost_count: int
    verdict: str  # likely_ghost, suspicious, likely_real


class GhostStatsResponse(BaseModel):
    total_analyzed: int
    likely_ghost: int
    suspicious: int
    likely_real: int
    top_ghost_companies: list[dict]


# --- Layoff Radar ---

class LayoffRiskResponse(BaseModel):
    company: str
    risk_score: float
    risk_level: str  # critical, high, medium, low
    signals: list[dict]
    weekly_trend: list[dict]
    total_historical_postings: int
    recent_14d_postings: int
    ai_assessment: str | None = None


# --- IPO Radar ---

class IpoSignalResponse(BaseModel):
    company: str
    ipo_probability: float
    confidence: str
    signals: list[dict]
    ipo_related_roles: list[dict]
    hiring_velocity: dict
    category_diversity: int
    ai_assessment: str | None = None


# --- Roadmap ---

class RoadmapRequest(BaseModel):
    target_role: str
    user_skills: list[str]
    experience_years: int = 0


class RoadmapResponse(BaseModel):
    id: int | None = None
    target_role: str
    current_match_score: float | None = None
    projected_match_score: float | None = None
    timeline_weeks: int | None = None
    honest_assessment: str | None = None
    skill_gaps: list[dict] = []
    phases: list[dict] = []
    recommended_roles_progression: list[str] = []
    salary_trajectory: dict = {}


# --- Negotiation ---

class NegotiationStartRequest(BaseModel):
    job_title: str
    company: str
    offered_salary: float
    offered_equity: str | None = None
    location: str | None = None


class NegotiationMessageRequest(BaseModel):
    message: str


class NegotiationSessionResponse(BaseModel):
    session_id: int
    initial_analysis: str | None = None
    response: str | None = None
    market_context: dict = {}
    message_count: int = 0


class NegotiationListItem(BaseModel):
    id: int
    job_title: str
    company: str
    offered_salary: float | None = None
    created_at: str
    updated_at: str


# --- Market Signals ---

class MarketSignalResponse(BaseModel):
    id: int
    signal_type: str
    company: str | None = None
    severity: str
    title: str
    description: str | None = None
    data_points: dict = {}
    detected_at: str


# --- Company Intel ---

class CompanyIntelReport(BaseModel):
    company: str
    total_postings: int = 0
    markets: list[str] = []
    categories: list[str] = []
    salary_intel: dict = {}
    remote_percentage: float = 0
    weekly_trend: list[dict] = []
    top_skills: dict = {}
    department_breakdown: dict = {}
    ghost_analysis: dict = {}
    risk_scores: dict = {}
    trajectory: str = "unknown"
    ai_narrative: str | None = None
    error: str | None = None
