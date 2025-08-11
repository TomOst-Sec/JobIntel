"""Stripe webhook handler."""
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request

from api.dependencies import get_db
from api.services.billing_service import (
    handle_webhook_event, provision_subscription,
    handle_subscription_update, handle_subscription_deleted,
)

router = APIRouter()


@router.post("/stripe")
async def stripe_webhook(request: Request, db: sqlite3.Connection = Depends(get_db)):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        result = handle_webhook_event(payload, sig_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    event = result["event"]
    event_type = result["event_type"]

    # Log the event
    try:
        db.execute(
            "INSERT OR IGNORE INTO billing_events (stripe_event_id, event_type, payload) VALUES (?, ?, ?)",
            (event.id, event_type, json.dumps(event.data.object, default=str)),
        )
        db.commit()
    except Exception:
        pass

    # Handle specific events
    if event_type == "checkout.session.completed":
        provision_subscription(event.data.object, db)
    elif event_type == "customer.subscription.updated":
        handle_subscription_update(event.data.object, db)
    elif event_type == "customer.subscription.deleted":
        handle_subscription_deleted(event.data.object, db)
    elif event_type == "invoice.paid":
        pass  # Could log payment confirmation

    return {"status": "ok"}
