"""Billing endpoints."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db, get_current_user
from api.models.billing import (
    SubscriptionPlan, CheckoutSessionRequest, CheckoutSessionResponse,
    PortalSessionResponse, UserSubscriptionResponse,
)
from api.services.billing_service import get_plans, create_checkout_session, create_portal_session

router = APIRouter()


@router.get("/plans", response_model=list[SubscriptionPlan])
def list_plans(db: sqlite3.Connection = Depends(get_db)):
    """List available subscription plans (public)."""
    return get_plans(db)


@router.post("/checkout", response_model=CheckoutSessionResponse)
def checkout(
    body: CheckoutSessionRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a Stripe Checkout session."""
    try:
        return create_checkout_session(user["id"], body.plan_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/portal", response_model=PortalSessionResponse)
def portal(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a Stripe Customer Portal session."""
    try:
        return create_portal_session(user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/subscription", response_model=UserSubscriptionResponse)
def get_subscription(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get current user's subscription info."""
    row = db.execute("""
        SELECT sp.name as plan_name, sp.chat_limit_daily as chat_limit,
            us.status, us.current_period_end
        FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ?
    """, (user["id"],)).fetchone()

    if row is None:
        return UserSubscriptionResponse(
            plan_name="Free", status="active", chat_limit=10, chat_used_today=0,
        )

    data = dict(row)
    # Count today's chat messages
    chat_count = db.execute("""
        SELECT COUNT(*) FROM chat_messages
        WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)
          AND role = 'user' AND created_at >= date('now')
    """, (user["id"],)).fetchone()[0]

    return UserSubscriptionResponse(
        plan_name=data["plan_name"],
        status=data["status"],
        current_period_end=data.get("current_period_end"),
        chat_used_today=chat_count,
        chat_limit=data["chat_limit"],
    )
