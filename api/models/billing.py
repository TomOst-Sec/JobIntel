"""Billing models."""
from pydantic import BaseModel


class SubscriptionPlan(BaseModel):
    id: int
    name: str
    price_cents: int
    chat_limit_daily: int
    market_limit: int
    features: list[str]


class CheckoutSessionRequest(BaseModel):
    plan_id: int


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalSessionResponse(BaseModel):
    portal_url: str


class UserSubscriptionResponse(BaseModel):
    plan_name: str
    status: str
    current_period_end: str | None = None
    chat_used_today: int = 0
    chat_limit: int = 10
