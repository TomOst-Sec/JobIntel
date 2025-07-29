"""Alert models."""
from pydantic import BaseModel


class AlertCreate(BaseModel):
    alert_type: str
    conditions: dict
    delivery: str = "in_app"


class AlertUpdate(BaseModel):
    conditions: dict | None = None
    delivery: str | None = None
    is_active: bool | None = None


class AlertResponse(BaseModel):
    id: int
    alert_type: str
    conditions: dict
    delivery: str
    is_active: bool
    created_at: str


class AlertTriggerResponse(BaseModel):
    id: int
    alert_id: int
    payload: dict
    is_read: bool
    created_at: str
