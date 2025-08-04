import os
import requests
import sqlite3
from datetime import datetime
from fastapi import HTTPException

# Need to set these in .env or environment
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
# Default placeholder logic
MOCK_GITHUB_AUTH = not GITHUB_CLIENT_ID or not GITHUB_CLIENT_SECRET

def exchange_code_for_token(code: str) -> str:
    """Exchange GitHub code for an access token."""
    if MOCK_GITHUB_AUTH:
        # Mocking access token for testing when credentials aren't set
        return f"mock_token_for_code_{code}"
        
    url = "https://github.com/login/oauth/access_token"
    headers = {"Accept": "application/json"}
    payload = {
        "client_id": GITHUB_CLIENT_ID,
        "client_secret": GITHUB_CLIENT_SECRET,
        "code": code
    }
    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code")
    data = resp.json()
    if "access_token" not in data:
        raise HTTPException(status_code=400, detail="Invalid GitHub callback code")
    return data["access_token"]


def fetch_github_user(access_token: str) -> dict:
    """Fetch user profile from GitHub API."""
    if MOCK_GITHUB_AUTH:
        return {
            "id": 12345678,
            "login": "mockuser",
            "avatar_url": "https://avatars.githubusercontent.com/u/12345678?v=4",
            "bio": "10x Mock Engineer",
            "public_repos": 42,
            "followers": 1337,
            "html_url": "https://github.com/mockuser"
        }

    url = "https://api.github.com/user"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub profile")
    return resp.json()


def fetch_github_emails(access_token: str) -> list:
    """Fetch user emails from GitHub."""
    if MOCK_GITHUB_AUTH:
        return [{"email": "mockuser@example.com", "primary": True, "verified": True}]
        
    url = "https://api.github.com/user/emails"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub emails")
    return resp.json()


def sync_github_profile(user_id: int, github_data: dict, db: sqlite3.Connection):
    """Upsert GitHub profile data into the database."""
    now = datetime.utcnow().isoformat()
    db.execute("""
        INSERT INTO github_profiles (
            user_id, github_username, github_id, avatar_url, bio, 
            public_repos, followers, profile_url, last_synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            github_username=excluded.github_username,
            avatar_url=excluded.avatar_url,
            bio=excluded.bio,
            public_repos=excluded.public_repos,
            followers=excluded.followers,
            profile_url=excluded.profile_url,
            last_synced_at=excluded.last_synced_at,
            updated_at=excluded.updated_at
    """, (
        user_id,
        github_data.get("login", ""),
        str(github_data.get("id", "")),
        github_data.get("avatar_url", ""),
        github_data.get("bio", ""),
        github_data.get("public_repos", 0),
        github_data.get("followers", 0),
        github_data.get("html_url", ""),
        now,
        now
    ))
    db.commit()

def ingest_github_oauth(code: str, db: sqlite3.Connection) -> dict:
    access_token = exchange_code_for_token(code)
    gh_user = fetch_github_user(access_token)
    gh_emails = fetch_github_emails(access_token)
    
    primary_email = None
    for item in gh_emails:
        if item.get("primary") and item.get("verified"):
            primary_email = item.get("email")
            break
            
    if not primary_email and gh_emails:
        primary_email = gh_emails[0].get("email")
        
    if not primary_email:
        raise HTTPException(status_code=400, detail="No verified email associated with GitHub account")

    # Check if a user already exists with this email
    user_row = db.execute("SELECT * FROM users WHERE email = ?", (primary_email,)).fetchone()
    
    if user_row:
        user_id = user_row["id"]
        role = user_row["role"]
    else:
        # Create a new user since they don't exist
        from api.services.auth_service import hash_password
        import secrets
        
        # We need a random password for OAuth users to satisfy the DB schema
        random_pwd = secrets.token_urlsafe(16)
        hashed_pwd = hash_password(random_pwd)
        role = "seeker"
        
        full_name = gh_user.get("name") or gh_user.get("login") or "GitHub User"
        
        cursor = db.execute(
            """INSERT INTO users (email, password_hash, full_name, role)
               VALUES (?, ?, ?, ?)""",
            (primary_email, hashed_pwd, full_name, role)
        )
        user_id = cursor.lastrowid
        db.commit()

    # Create or update github profile
    sync_github_profile(user_id, gh_user, db)
    
    return {"user_id": user_id, "role": role}
