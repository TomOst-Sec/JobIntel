"""FastAPI dependency injection providers."""
import sqlite3
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from api.config import get_settings, Settings
from api.db.connection import get_db_connection

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[sqlite3.Connection, None, None]:
    """Yield a database connection, closing on teardown."""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


def get_current_user(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Decode JWT from cookie and return user dict. Raises 401/403 if invalid."""
    
    token = request.cookies.get("access_token")
    auth_header = request.headers.get("Authorization")
    
    is_cookie_auth = bool(token)

    if not token:
        # Fallback to authorization header for programmatic API access (e.g. mobile apps or scrapers)
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    # Check CSRF constraint for state-reversing methods IF using cookie auth
    if is_cookie_auth and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get("x-csrf-token")
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token validation failed",
            )

    import jwt

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(user_id)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    row = db.execute("SELECT * FROM users WHERE id = ? AND is_active = 1", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="User not found")

    return dict(row)


def get_optional_user(
    request: Request,
    db: sqlite3.Connection = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Optional[dict]:
    """Return user if token provided, None otherwise."""
    token = request.cookies.get("access_token")
    auth_header = request.headers.get("Authorization")
    if not token and not (auth_header and auth_header.startswith("Bearer ")):
        return None
        
    try:
        return get_current_user(request, db, settings)
    except HTTPException:
        return None


def require_admin(
    user: dict = Depends(get_current_user),
) -> dict:
    """Require the user to have admin or recruiter role."""
    if user.get("role") not in ("admin", "recruiter"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


def require_plan_feature(feature: str):
    """Dependency factory: checks the user's subscription includes a feature."""

    def checker(
        user: dict = Depends(get_current_user),
        db: sqlite3.Connection = Depends(get_db),
    ):
        row = db.execute("""
            SELECT sp.features FROM user_subscriptions us
            JOIN subscription_plans sp ON us.plan_id = sp.id
            WHERE us.user_id = ? AND us.status = 'active'
        """, (user["id"],)).fetchone()

        if row is None:
            # Default to Free plan features
            allowed = ["basic_search"]
        else:
            import json
            allowed = json.loads(row["features"])

        if feature not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your plan does not include '{feature}'. Please upgrade.",
            )
        return user

    return checker
