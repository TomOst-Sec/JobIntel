"""OAuth & social login endpoints: Google, GitHub, phone OTP, email verification, AI providers."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from api.models.auth import MessageResponse
from api.routers.auth import set_auth_cookies

from api.dependencies import get_db, get_current_user
from api.services.oauth_service import (
    google_get_auth_url, google_exchange_code,
    github_get_auth_url, github_exchange_code,
    send_phone_otp, verify_phone_otp,
    send_email_verification, verify_email_code,
)
from api.services.ai_provider import (
    get_user_providers, PROVIDERS,
)

router = APIRouter()


# ─── Request/Response Models ────────────────────────

class OAuthCodeRequest(BaseModel):
    code: str

class PhoneOtpRequest(BaseModel):
    phone_number: str

class PhoneVerifyRequest(BaseModel):
    phone_number: str
    code: str

class EmailVerifyRequest(BaseModel):
    email: str

class EmailCodeRequest(BaseModel):
    code: str


# ─── Google OAuth ───────────────────────────────────

@router.get("/google/url")
def get_google_url():
    """Get Google OAuth authorization URL."""
    return {"url": google_get_auth_url()}


@router.post("/google/callback", response_model=MessageResponse)
def google_callback(body: OAuthCodeRequest, response: Response, db: sqlite3.Connection = Depends(get_db)):
    """Exchange Google OAuth code for tokens."""
    try:
        result = google_exchange_code(body.code, db)
        set_auth_cookies(response, result["access_token"], result["refresh_token"], result["expires_in"])
        return MessageResponse(message="Google login successful")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Google OAuth failed: {str(e)}")


# ─── GitHub OAuth ───────────────────────────────────

@router.get("/github/url")
def get_github_url():
    """Get GitHub OAuth authorization URL."""
    return {"url": github_get_auth_url()}


@router.post("/github/callback", response_model=MessageResponse)
def github_callback(body: OAuthCodeRequest, response: Response, db: sqlite3.Connection = Depends(get_db)):
    """Exchange GitHub OAuth code for tokens."""
    try:
        result = github_exchange_code(body.code, db)
        set_auth_cookies(response, result["access_token"], result["refresh_token"], result["expires_in"])
        return MessageResponse(message="GitHub login successful")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth failed: {str(e)}")


# ─── Phone OTP ──────────────────────────────────────

@router.post("/phone/send-otp")
def send_otp(body: PhoneOtpRequest, db: sqlite3.Connection = Depends(get_db)):
    """Send OTP to phone number."""
    return send_phone_otp(body.phone_number, db)


@router.post("/phone/verify", response_model=MessageResponse)
def verify_otp(body: PhoneVerifyRequest, response: Response, db: sqlite3.Connection = Depends(get_db)):
    """Verify phone OTP and authenticate."""
    try:
        result = verify_phone_otp(body.phone_number, body.code, db)
        set_auth_cookies(response, result["access_token"], result["refresh_token"], result["expires_in"])
        return MessageResponse(message="Phone login successful")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Email Verification ────────────────────────────

@router.post("/email/send-verification")
def send_verification(
    body: EmailVerifyRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Send email verification code to current user."""
    return send_email_verification(user["id"], body.email, db)


@router.post("/email/verify")
def verify_email(
    body: EmailCodeRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Verify email with code."""
    try:
        return verify_email_code(user["id"], body.code, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── AI Provider Management ────────────────────────

@router.get("/ai-providers")
def list_providers(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get user's connected AI providers."""
    connected = get_user_providers(user["id"], db)
    available = [
        {"provider": k, "label": v["label"], "models": v["models"]}
        for k, v in PROVIDERS.items()
    ]
    return {"connected": connected, "available": available}



# ─── OAuth Account Management ──────────────────────

@router.get("/linked-accounts")
def get_linked_accounts(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get user's linked OAuth accounts."""
    rows = db.execute(
        """SELECT provider, provider_email, provider_name, provider_avatar_url, created_at
           FROM user_oauth_accounts WHERE user_id = ?""",
        (user["id"],),
    ).fetchall()
    return {"accounts": [dict(r) for r in rows]}


@router.delete("/linked-accounts/{provider}")
def unlink_account(
    provider: str,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Unlink an OAuth account."""
    # Prevent unlinking if it's the only auth method (no password set)
    has_password = user.get("password_hash") and not user["password_hash"].startswith("0" * 10)
    oauth_count = db.execute(
        "SELECT COUNT(*) FROM user_oauth_accounts WHERE user_id = ?",
        (user["id"],),
    ).fetchone()[0]

    if not has_password and oauth_count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink your only authentication method. Set a password first.",
        )

    db.execute(
        "DELETE FROM user_oauth_accounts WHERE user_id = ? AND provider = ?",
        (user["id"], provider),
    )
    db.commit()
    return {"unlinked": provider}
