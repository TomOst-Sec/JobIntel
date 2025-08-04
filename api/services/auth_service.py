"""Authentication service: password hashing and JWT management."""
import hashlib
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from api.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(user_id: int, role: str) -> tuple[str, int]:
    """Create a short-lived JWT access token. Returns (token, expires_in_seconds)."""
    settings = get_settings()
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": expire,
        "type": "access",
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int(expires_delta.total_seconds())


def create_refresh_token(user_id: int, db: sqlite3.Connection) -> str:
    """Create a long-lived refresh token stored in DB."""
    settings = get_settings()
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    db.execute(
        "INSERT INTO refresh_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash, user_id, expires_at.isoformat()),
    )
    db.commit()
    return raw_token


def verify_refresh_token(raw_token: str, db: sqlite3.Connection) -> dict | None:
    """Verify a refresh token and return the user row, or None."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    row = db.execute("""
        SELECT rt.*, u.* FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token_hash = ?
          AND rt.revoked_at IS NULL
          AND rt.expires_at > datetime('now')
          AND u.is_active = 1
    """, (token_hash,)).fetchone()

    if row is None:
        return None
    return dict(row)


def revoke_refresh_token(raw_token: str, db: sqlite3.Connection):
    """Revoke a refresh token."""
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    db.execute(
        "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ?",
        (token_hash,),
    )
    db.commit()


def register_user(email: str, password: str, full_name: str, role: str, db: sqlite3.Connection) -> dict:
    """Create a new user. Raises ValueError if email taken."""
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        raise ValueError("Email already registered")

    pw_hash = hash_password(password)
    cursor = db.execute(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
        (email, pw_hash, full_name, role),
    )
    db.commit()
    user_id = cursor.lastrowid

    # Assign Free plan
    free_plan = db.execute("SELECT id FROM subscription_plans WHERE name = 'Free'").fetchone()
    if free_plan:
        db.execute(
            "INSERT INTO user_subscriptions (user_id, plan_id, status) VALUES (?, ?, 'active')",
            (user_id, free_plan["id"]),
        )
        db.commit()

    # Check if email was on waitlist
    db.execute(
        "UPDATE waitlist SET converted_user_id = ? WHERE email = ?",
        (user_id, email),
    )
    db.commit()

    return dict(db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def authenticate_user(email: str, password: str, db: sqlite3.Connection) -> dict | None:
    """Verify credentials and return user dict, or None."""
    row = db.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", (email,)).fetchone()
    if row is None:
        return None
    user = dict(row)
    if not verify_password(password, user["password_hash"]):
        return None
    return user
