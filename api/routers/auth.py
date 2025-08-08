"""Auth endpoints: register, login, refresh, me, waitlist."""
import sqlite3
import secrets

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response

from api.dependencies import get_db, get_current_user
from api.models.auth import (
    UserCreate, LoginRequest, MessageResponse,
    UserResponse, WaitlistRequest, WaitlistResponse,
)
from api.services.auth_service import (
    register_user, authenticate_user,
    create_access_token, create_refresh_token,
    verify_refresh_token, revoke_refresh_token,
)
from api.models.nexus_profile import GitHubOAuthCallback
from api.services.github_ingestion import ingest_github_oauth, GITHUB_CLIENT_ID
from api.db.redis import get_redis

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_TIME_SECONDS = 300  # 5 minutes

router = APIRouter()


def set_auth_cookies(response: Response, access_token: str, refresh_token: str, expires_in: int):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=expires_in,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=30 * 24 * 60 * 60,
    )
    # Double-submit CSRF cookie (not HttpOnly so JS can read it to set X-CSRF-Token header)
    csrf = secrets.token_hex(32)
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=True,
        samesite="strict",
    )


def clear_auth_cookies(response: Response):
    response.delete_cookie(key="access_token", secure=True, httponly=True, samesite="strict")
    response.delete_cookie(key="refresh_token", secure=True, httponly=True, samesite="strict")
    response.delete_cookie(key="csrf_token", secure=True, httponly=False, samesite="strict")


@router.post("/register", response_model=MessageResponse, status_code=201)
def register(body: UserCreate, response: Response, db: sqlite3.Connection = Depends(get_db)):
    try:
        user = register_user(body.email, body.password, body.full_name, body.role, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    access_token, expires_in = create_access_token(user["id"], user["role"])
    refresh_token = create_refresh_token(user["id"], db)
    set_auth_cookies(response, access_token, refresh_token, expires_in)
    return MessageResponse(message="Registration successful")


@router.post("/login", response_model=MessageResponse)
def login(body: LoginRequest, request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    lock_key = f"bf:login:{client_ip}:{body.email}"
    
    # 1. Check if user is locked out
    try:
        r = get_redis()
        attempts = r.get(lock_key)
        if attempts and int(attempts) >= MAX_FAILED_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Please try again later."
            )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Redis unavailable for brute force check: {e}")
        r = None # Gracefully fail open if Redis is down

    # 2. Attempt authentication
    user = authenticate_user(body.email, body.password, db)
    
    # 3. Handle failure
    if user is None:
        if r is not None:
            try:
                r.incr(lock_key)
                if r.ttl(lock_key) == -1:
                    r.expire(lock_key, LOCKOUT_TIME_SECONDS)
            except Exception:
                pass
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # 4. Handle success (clear failed attempts)
    if r is not None:
        try:
            r.delete(lock_key)
        except Exception:
            pass

    access_token, expires_in = create_access_token(user["id"], user["role"])
    refresh_token = create_refresh_token(user["id"], db)
    set_auth_cookies(response, access_token, refresh_token, expires_in)
    return MessageResponse(message="Login successful")


@router.post("/refresh", response_model=MessageResponse)
def refresh(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    refresh_token_cookie = request.cookies.get("refresh_token")
    if not refresh_token_cookie:
        raise HTTPException(status_code=401, detail="No refresh token cookie")

    data = verify_refresh_token(refresh_token_cookie, db)
    if data is None:
        clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Rotate: revoke old, issue new
    revoke_refresh_token(refresh_token_cookie, db)
    user_id = data["user_id"]
    access_token, expires_in = create_access_token(user_id, data["role"])
    new_refresh = create_refresh_token(user_id, db)
    set_auth_cookies(response, access_token, new_refresh, expires_in)
    return MessageResponse(message="Token refreshed")


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        try:
            revoke_refresh_token(refresh_token, db)
        except Exception:
            pass
    clear_auth_cookies(response)
    # also try to get an access_token? (not strictly needed, just clear the cookies)
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user), db: sqlite3.Connection = Depends(get_db)):
    plan_row = db.execute("""
        SELECT sp.name FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
    """, (user["id"],)).fetchone()
    plan_name = plan_row["name"] if plan_row else "Free"

    return UserResponse(
        id=user["id"],
        email=user["email"],
        full_name=user["full_name"],
        role=user["role"],
        is_active=user["is_active"],
        created_at=user["created_at"],
        plan_name=plan_name,
    )


@router.post("/waitlist", response_model=WaitlistResponse, status_code=201)
def join_waitlist(body: WaitlistRequest, db: sqlite3.Connection = Depends(get_db)):
    try:
        db.execute(
            "INSERT INTO waitlist (email, source) VALUES (?, ?)",
            (body.email, body.source),
        )
        db.commit()
    except sqlite3.IntegrityError:
        pass  # Already on waitlist — that's fine
    return WaitlistResponse(message="You're on the list!", email=body.email)


@router.get("/github/login")
def github_login():
    """Redirect to GitHub OAuth login."""
    if not GITHUB_CLIENT_ID:
        return {"redirect_url": "oauth_mock_mode"}
    url = f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&scope=user:email read:user repo"
    return {"redirect_url": url}


@router.post("/github/callback", response_model=MessageResponse)
def github_callback(body: GitHubOAuthCallback, response: Response, db: sqlite3.Connection = Depends(get_db)):
    try:
        user_info = ingest_github_oauth(body.code, db)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    access_token, expires_in = create_access_token(user_info["user_id"], user_info["role"])
    refresh_token = create_refresh_token(user_info["user_id"], db)
    set_auth_cookies(response, access_token, refresh_token, expires_in)
    return MessageResponse(message="GitHub login successful")
