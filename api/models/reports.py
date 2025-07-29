"""Report models."""
from pydantic import BaseModel


class ReportMeta(BaseModel):
    id: int
    report_type: str
    market_id: str | None = None
    created_at: str
    emailed_at: str | None = None


class ReportContent(BaseModel):
    id: int
    report_type: str
    market_id: str | None = None
    content: dict | str
    created_at: str
