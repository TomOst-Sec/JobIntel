"""Pydantic models for the Recruiter AI Command Center."""
from pydantic import BaseModel, Field
from typing import Optional


# --- Candidate ---

class CandidateResponse(BaseModel):
    candidate_id: str
    full_name: str
    headline: str | None = None
    skills: list[str] = []
    experience_years: int | None = None
    current_company: str | None = None
    current_title: str | None = None
    location: str | None = None
    country: str | None = None
    is_remote_ok: bool = True
    salary_min: float | None = None
    salary_max: float | None = None
    availability: str = "active"
    summary: str | None = None
    email: str | None = None


# --- Search ---

class SearchFilters(BaseModel):
    location: str | None = None
    min_experience: int | None = None
    skills: list[str] | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    remote_ok: bool | None = None


class SearchRequest(BaseModel):
    brief: str = Field(min_length=5)
    filters: SearchFilters | None = None


class CandidateMatch(BaseModel):
    candidate: CandidateResponse
    match_score: float
    score_breakdown: dict
    explanation: str | None = None


class SearchResponse(BaseModel):
    search_id: str
    candidates: list[CandidateMatch] = []
    clarifying_questions: list[str] | None = None
    parsed_brief: dict | None = None


class RefineRequest(BaseModel):
    message: str = Field(min_length=1)


class ChatMessageResponse(BaseModel):
    role: str
    content: str
    metadata: dict | None = None
    created_at: str | None = None


class SearchListItem(BaseModel):
    search_id: str
    brief: str
    status: str
    created_at: str
    updated_at: str


# --- Outreach ---

class OutreachRequest(BaseModel):
    candidate_id: str
    search_id: str | None = None
    channel: str = "email"
    tone: str = "professional"
    custom_notes: str | None = None


class OutreachResponse(BaseModel):
    outreach_id: str
    candidate_id: str
    subject: str | None = None
    body: str
    sequence_number: int
    channel: str
    tone: str
    status: str = "draft"
    created_at: str | None = None


class OutreachStatusUpdate(BaseModel):
    status: str = Field(pattern="^(sent|opened|replied)$")


class OutreachStats(BaseModel):
    total: int = 0
    drafts: int = 0
    sent: int = 0
    opened: int = 0
    replied: int = 0
    open_rate: float = 0.0
    reply_rate: float = 0.0


# --- Pipeline ---

class PipelineCreateRequest(BaseModel):
    candidate_id: str
    search_id: str | None = None
    job_title: str | None = None


class PipelineEntry(BaseModel):
    pipeline_id: str
    candidate: CandidateResponse
    stage: str
    notes: str | None = None
    rating: int | None = None
    search_id: str | None = None
    job_title: str | None = None
    updated_at: str | None = None
    created_at: str | None = None


class PipelineUpdate(BaseModel):
    stage: str | None = None
    notes: str | None = None
    rating: int | None = Field(None, ge=1, le=5)


class PipelineStats(BaseModel):
    sourced: int = 0
    contacted: int = 0
    responded: int = 0
    interview: int = 0
    offer: int = 0
    hired: int = 0
    rejected: int = 0
    withdrawn: int = 0
    total: int = 0


# --- Briefing ---

class BriefingResponse(BaseModel):
    date: str
    sections: list[dict] = []
    pipeline_summary: dict = {}
    action_items: list[str] = []
