import sqlite3
from fastapi import APIRouter, Depends, HTTPException, status
import httpx
from typing import List

from api.dependencies import get_db
from api.models.api_keys import APIKeyCreate, APIKeyResponse
from api.dependencies import get_current_user
from api.services.crypto import encrypt_api_key

router = APIRouter(prefix="/v1/keys", tags=["API Keys"])

VALID_PROVIDERS = {"openai", "anthropic", "google"}

async def validate_openai_key(api_key: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=5.0
            )
            return resp.status_code == 200
    except Exception:
        return False

async def validate_anthropic_key(api_key: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                timeout=5.0
            )
            # Anthropic /v1/models returns 200 with valid keys typically.
            # We treat 200 or 400 (bad Request format but authenticated) as valid vs 401 Unauthorized.
            return resp.status_code != 401
    except Exception:
        return False

async def validate_google_key(api_key: str) -> bool:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
                timeout=5.0
            )
            return resp.status_code == 200
    except Exception:
        return False


@router.post("/", response_model=APIKeyResponse)
async def add_api_key(
    payload: APIKeyCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    provider = payload.provider.lower()
    if provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}"
        )
    
    api_key_clean = payload.api_key.strip()
    
    # 1. Validate the API key with the provider
    is_valid = False
    if provider == "openai":
        is_valid = await validate_openai_key(api_key_clean)
    elif provider == "anthropic":
        is_valid = await validate_anthropic_key(api_key_clean)
    elif provider == "google":
        is_valid = await validate_google_key(api_key_clean)
        
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key or insufficient permissions for validation."
        )

    # 2. Encrypt the key
    ciphertext, auth_tag, nonce = encrypt_api_key(api_key_clean)
    last_four = api_key_clean[-4:] if len(api_key_clean) >= 4 else "****"

    # 3. Store in database (UPSERT per provider logic)
    try:
        cursor = db.execute(
            """
            INSERT INTO user_api_keys (user_id, provider, key_ciphertext, auth_tag, nonce, last_four)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                key_ciphertext=excluded.key_ciphertext,
                auth_tag=excluded.auth_tag,
                nonce=excluded.nonce,
                last_four=excluded.last_four,
                updated_at=CURRENT_TIMESTAMP
            """,
            (current_user["id"], provider, ciphertext, auth_tag, nonce, last_four)
        )
        db.commit()
        
        # Fetch the newly inserted/updated row
        row = db.execute("SELECT * FROM user_api_keys WHERE user_id = ? AND provider = ?", (current_user["id"], provider)).fetchone()
        
        return {
            "id": row["id"],
            "provider": row["provider"],
            "last_four": row["last_four"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store API Key securely."
        )


@router.get("/", response_model=List[APIKeyResponse])
def list_api_keys(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    rows = db.execute("SELECT * FROM user_api_keys WHERE user_id = ?", (current_user["id"],)).fetchall()
    return [
        {
            "id": r["id"],
            "provider": r["provider"],
            "last_four": r["last_four"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"]
        }
        for r in rows
    ]


@router.delete("/{provider}")
def delete_api_key(
    provider: str,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    provider = provider.lower()
    cursor = db.execute("DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?", (current_user["id"], provider))
    db.commit()
    
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="API key not found")
        
    return {"status": "success", "message": f"{provider} API key deleted successfully."}
