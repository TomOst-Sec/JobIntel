"""OAuth Service — Google, GitHub, and Phone authentication.

Handles OAuth flows, phone OTP verification, and email verification.
Links OAuth accounts to existing users or creates new ones.
"""
import hashlib
import random
import secrets
import sqlite3
import string
from datetime import datetime, timedelta

import httpx

from api.config import get_settings
from api.services.auth_service import create_access_token, create_refresh_token


# ═══════════════════════════════════════════════════
# GOOGLE OAUTH
# ═══════════════════════════════════════════════════

def google_get_auth_url() -> str:
    """Get Google OAuth authorization URL."""
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.app_url}/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://accounts.google.com/o/oauth2/v2/auth?{qs}"


def google_exchange_code(code: str, db: sqlite3.Connection) -> dict:
    """Exchange Google OAuth code for tokens and create/link user."""
    settings = get_settings()

    # Exchange code for tokens
    token_resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": f"{settings.app_url}/auth/google/callback",
        },
    )
    token_resp.raise_for_status()
    tokens = token_resp.json()

    # Get user info
    userinfo_resp = httpx.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    userinfo_resp.raise_for_status()
    info = userinfo_resp.json()

    return _link_or_create_oauth_user(
        provider="google",
        provider_user_id=info["id"],
        email=info.get("email"),
        name=info.get("name", info.get("email", "").split("@")[0]),
        avatar_url=info.get("picture"),
        access_token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        db=db,
    )


# ═══════════════════════════════════════════════════
# GITHUB OAUTH
# ═══════════════════════════════════════════════════

def github_get_auth_url() -> str:
    """Get GitHub OAuth authorization URL."""
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": f"{settings.app_url}/auth/github/callback",
        "scope": "user:email read:user public_repo read:org",
    }
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return f"https://github.com/login/oauth/authorize?{qs}"


def github_exchange_code(code: str, db: sqlite3.Connection) -> dict:
    """Exchange GitHub OAuth code for tokens and create/link user."""
    settings = get_settings()

    # Exchange code for access token
    token_resp = httpx.post(
        "https://github.com/login/oauth/access_token",
        headers={"Accept": "application/json"},
        data={
            "client_id": settings.github_client_id,
            "client_secret": settings.github_client_secret,
            "code": code,
        },
    )
    token_resp.raise_for_status()
    tokens = token_resp.json()
    access_token = tokens.get("access_token")

    # Get user info
    user_resp = httpx.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    user_resp.raise_for_status()
    info = user_resp.json()

    # Get email if not public
    email = info.get("email")
    if not email:
        emails_resp = httpx.get(
            "https://api.github.com/user/emails",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if emails_resp.status_code == 200:
            emails = emails_resp.json()
            primary = next((e for e in emails if e.get("primary")), None)
            if primary:
                email = primary["email"]

    return _link_or_create_oauth_user(
        provider="github",
        provider_user_id=str(info["id"]),
        email=email,
        name=info.get("name") or info.get("login", ""),
        avatar_url=info.get("avatar_url"),
        access_token=access_token,
        refresh_token=None,
        db=db,
    )


# ═══════════════════════════════════════════════════
# PHONE AUTH (OTP)
# ═══════════════════════════════════════════════════

def send_phone_otp(phone_number: str, db: sqlite3.Connection) -> dict:
    """Send OTP to phone number via SMS."""
    settings = get_settings()

    # Generate 6-digit code
    code = "".join(random.choices(string.digits, k=6))
    expires_at = (datetime.utcnow() + timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")

    # Store verification record
    db.execute(
        """INSERT INTO phone_verifications (phone_number, code, expires_at)
           VALUES (?, ?, ?)""",
        (phone_number, code, expires_at),
    )
    db.commit()

    # Send SMS via Twilio (if configured)
    if settings.twilio_account_sid and settings.twilio_auth_token:
        try:
            httpx.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json",
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                data={
                    "From": settings.twilio_phone_number,
                    "To": phone_number,
                    "Body": f"Your JobIntel verification code is: {code}. Expires in 10 minutes.",
                },
            )
        except Exception:
            pass  # Log but don't fail — code is in DB for testing

    return {"phone_number": phone_number, "sent": True, "expires_in_minutes": 10}


def verify_phone_otp(phone_number: str, code: str, db: sqlite3.Connection) -> dict:
    """Verify phone OTP and create/link user."""
    row = db.execute(
        """SELECT * FROM phone_verifications
           WHERE phone_number = ? AND code = ?
             AND verified_at IS NULL
             AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1""",
        (phone_number, code),
    ).fetchone()

    if not row:
        # Check attempts
        db.execute(
            """UPDATE phone_verifications SET attempts = attempts + 1
               WHERE phone_number = ? AND verified_at IS NULL""",
            (phone_number,),
        )
        db.commit()
        raise ValueError("Invalid or expired verification code")

    # Mark as verified
    db.execute(
        "UPDATE phone_verifications SET verified_at = datetime('now') WHERE id = ?",
        (row["id"],),
    )
    db.commit()

    return _link_or_create_oauth_user(
        provider="phone",
        provider_user_id=phone_number,
        email=None,
        name=f"User {phone_number[-4:]}",
        avatar_url=None,
        access_token=None,
        refresh_token=None,
        db=db,
    )


# ═══════════════════════════════════════════════════
# EMAIL VERIFICATION
# ═══════════════════════════════════════════════════

def send_email_verification(user_id: int, email: str, db: sqlite3.Connection) -> dict:
    """Send email verification code."""
    settings = get_settings()
    code = "".join(random.choices(string.digits, k=6))
    expires_at = (datetime.utcnow() + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

    db.execute(
        """INSERT INTO email_verifications (user_id, email, code, expires_at)
           VALUES (?, ?, ?, ?)""",
        (user_id, email, code, expires_at),
    )
    db.commit()

    # Send email via Resend (if configured)
    if settings.resend_api_key:
        try:
            httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.from_email,
                    "to": email,
                    "subject": "Verify your JobIntel email",
                    "html": f"""
                        <h2>Verify your email</h2>
                        <p>Your verification code is: <strong>{code}</strong></p>
                        <p>This code expires in 24 hours.</p>
                    """,
                },
            )
        except Exception:
            pass

    return {"email": email, "sent": True}


def verify_email_code(user_id: int, code: str, db: sqlite3.Connection) -> dict:
    """Verify email with code."""
    row = db.execute(
        """SELECT * FROM email_verifications
           WHERE user_id = ? AND code = ?
             AND verified_at IS NULL
             AND expires_at > datetime('now')
           ORDER BY created_at DESC LIMIT 1""",
        (user_id, code),
    ).fetchone()

    if not row:
        raise ValueError("Invalid or expired verification code")

    db.execute(
        "UPDATE email_verifications SET verified_at = datetime('now') WHERE id = ?",
        (row["id"],),
    )
    db.commit()

    return {"verified": True, "email": row["email"]}


# ═══════════════════════════════════════════════════
# SHARED HELPERS
# ═══════════════════════════════════════════════════

def _link_or_create_oauth_user(
    provider: str,
    provider_user_id: str,
    email: str | None,
    name: str,
    avatar_url: str | None,
    access_token: str | None,
    refresh_token: str | None,
    db: sqlite3.Connection,
) -> dict:
    """Link OAuth account to existing user or create new user."""

    # Check if OAuth account already linked
    existing_oauth = db.execute(
        "SELECT user_id FROM user_oauth_accounts WHERE provider = ? AND provider_user_id = ?",
        (provider, provider_user_id),
    ).fetchone()

    if existing_oauth:
        user_id = existing_oauth["user_id"]
        # Update tokens
        db.execute(
            """UPDATE user_oauth_accounts
               SET access_token_encrypted = ?, refresh_token_encrypted = ?, updated_at = datetime('now')
               WHERE provider = ? AND provider_user_id = ?""",
            (access_token, refresh_token, provider, provider_user_id),
        )
        db.commit()
    else:
        # Check if user exists with this email
        user_row = None
        if email:
            user_row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()

        if user_row:
            user_id = user_row["id"]
        else:
            # Create new user (no password — OAuth-only)
            placeholder_email = email or f"{provider}_{provider_user_id}@oauth.jobintel.ai"
            dummy_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
            db.execute(
                """INSERT INTO users (email, password_hash, full_name, role)
                   VALUES (?, ?, ?, 'seeker')""",
                (placeholder_email, dummy_hash, name),
            )
            db.commit()
            user_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]

            # Initialize user level for gamification
            db.execute(
                "INSERT OR IGNORE INTO user_levels (user_id) VALUES (?)",
                (user_id,),
            )
            db.commit()

        # Link OAuth account
        db.execute(
            """INSERT INTO user_oauth_accounts
               (user_id, provider, provider_user_id, provider_email,
                provider_name, provider_avatar_url,
                access_token_encrypted, refresh_token_encrypted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, provider, provider_user_id, email, name,
             avatar_url, access_token, refresh_token),
        )
        db.commit()

    # Generate tokens
    user_row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    access_token, expires_in = create_access_token(user_id, user_row["role"])
    refresh_token_new = create_refresh_token(user_id, db)

    return {
        "user_id": user_id,
        "email": user_row["email"],
        "full_name": user_row["full_name"],
        "role": user_row["role"],
        "provider": provider,
        "access_token": access_token,
        "expires_in": expires_in,
        "refresh_token": refresh_token_new,
        "is_new_user": existing_oauth is None,
    }
