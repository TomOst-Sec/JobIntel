"""Stripe billing integration."""
import json
import sqlite3

import stripe

from api.config import get_settings


def _init_stripe():
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key


def get_plans(db: sqlite3.Connection) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM subscription_plans WHERE is_active = 1 ORDER BY price_cents"
    ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        d["features"] = json.loads(d["features"]) if d["features"] else []
        results.append(d)
    return results


def create_checkout_session(user_id: int, plan_id: int, db: sqlite3.Connection) -> dict:
    """Create a Stripe Checkout session for the given plan."""
    _init_stripe()
    settings = get_settings()

    plan = db.execute("SELECT * FROM subscription_plans WHERE id = ?", (plan_id,)).fetchone()
    if plan is None:
        raise ValueError("Plan not found")

    plan_dict = dict(plan)
    if plan_dict["price_cents"] == 0:
        raise ValueError("Cannot checkout for free plan")

    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    user_dict = dict(user)

    # Get or create Stripe customer
    sub = db.execute(
        "SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?", (user_id,)
    ).fetchone()

    if sub and dict(sub).get("stripe_customer_id"):
        customer_id = dict(sub)["stripe_customer_id"]
    else:
        customer = stripe.Customer.create(
            email=user_dict["email"],
            name=user_dict["full_name"],
            metadata={"jobintel_user_id": str(user_id)},
        )
        customer_id = customer.id

    # Create checkout session
    if plan_dict.get("stripe_price_id"):
        price = plan_dict["stripe_price_id"]
    else:
        # Create a price on the fly (for dev)
        price_obj = stripe.Price.create(
            unit_amount=plan_dict["price_cents"],
            currency="usd",
            recurring={"interval": "month"},
            product_data={"name": f"JobIntel {plan_dict['name']}"},
        )
        price = price_obj.id

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": price, "quantity": 1}],
        mode="subscription",
        success_url=f"{settings.app_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{settings.app_url}/pricing",
        metadata={"user_id": str(user_id), "plan_id": str(plan_id)},
    )

    return {"checkout_url": session.url, "session_id": session.id}


def create_portal_session(user_id: int, db: sqlite3.Connection) -> dict:
    """Create a Stripe Customer Portal session for self-service billing."""
    _init_stripe()
    settings = get_settings()

    sub = db.execute(
        "SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ?", (user_id,)
    ).fetchone()
    if sub is None or not dict(sub).get("stripe_customer_id"):
        raise ValueError("No active subscription found")

    session = stripe.billing_portal.Session.create(
        customer=dict(sub)["stripe_customer_id"],
        return_url=f"{settings.app_url}/dashboard/settings",
    )
    return {"portal_url": session.url}


def handle_webhook_event(payload: bytes, sig_header: str) -> dict:
    """Process a Stripe webhook event."""
    _init_stripe()
    settings = get_settings()

    event = stripe.Webhook.construct_event(
        payload, sig_header, settings.stripe_webhook_secret,
    )
    return {"event_type": event.type, "event": event}


def provision_subscription(event_data: dict, db: sqlite3.Connection):
    """Called after checkout.session.completed — provision the plan."""
    session = event_data
    user_id = int(session["metadata"]["user_id"])
    plan_id = int(session["metadata"]["plan_id"])
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    # Update or insert subscription
    existing = db.execute(
        "SELECT id FROM user_subscriptions WHERE user_id = ?", (user_id,)
    ).fetchone()

    if existing:
        db.execute("""
            UPDATE user_subscriptions
            SET plan_id = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
                status = 'active', updated_at = datetime('now')
            WHERE user_id = ?
        """, (plan_id, customer_id, subscription_id, user_id))
    else:
        db.execute("""
            INSERT INTO user_subscriptions (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status)
            VALUES (?, ?, ?, ?, 'active')
        """, (user_id, plan_id, customer_id, subscription_id))

    db.commit()


def handle_subscription_update(subscription_data: dict, db: sqlite3.Connection):
    """Handle subscription status changes."""
    stripe_sub_id = subscription_data.get("id")
    status = subscription_data.get("status", "active")

    db.execute(
        "UPDATE user_subscriptions SET status = ?, updated_at = datetime('now') WHERE stripe_subscription_id = ?",
        (status, stripe_sub_id),
    )
    db.commit()


def handle_subscription_deleted(subscription_data: dict, db: sqlite3.Connection):
    """Handle subscription cancellation — revert to Free plan."""
    stripe_sub_id = subscription_data.get("id")

    # Find user and revert to Free
    sub = db.execute(
        "SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id = ?",
        (stripe_sub_id,),
    ).fetchone()
    if sub:
        free_plan = db.execute("SELECT id FROM subscription_plans WHERE name = 'Free'").fetchone()
        if free_plan:
            db.execute("""
                UPDATE user_subscriptions
                SET plan_id = ?, status = 'canceled', stripe_subscription_id = NULL, updated_at = datetime('now')
                WHERE user_id = ?
            """, (free_plan["id"], dict(sub)["user_id"]))
            db.commit()
