"""BYOK (Bring Your Own Key) API — manage AI provider connections.

Users can connect their own LLM API keys (Claude, GPT, Gemini, OpenRouter)
so the platform doesn't have to buy credits for them. This is the key
cost-saving architecture that makes NEXUS viable at scale.
"""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.ai_provider import (
    PROVIDERS, ai_complete,
)

router = APIRouter()


class TestProviderBody(BaseModel):
    prompt: str = "Say hello in one sentence."


# ─── Provider Management ──────────────────────────

@router.get("/providers")
def list_available_providers():
    """List all supported AI providers and their available models."""
    return {
        "providers": [
            {
                "id": pid,
                "label": p["label"],
                "models": p["models"],
                "base_url": p["base_url"],
            }
            for pid, p in PROVIDERS.items()
        ]
    }


@router.post("/test")
def test_provider(
    body: TestProviderBody,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Test your connected AI provider with a simple prompt."""
    try:
        response = ai_complete(
            system_prompt="You are a helpful assistant. Be brief.",
            user_prompt=body.prompt,
            user_id=user["id"],
            conn=db,
            max_tokens=100,
        )
        return {"success": True, "response": response}
    except Exception as e:
        return {"success": False, "error": str(e)}
