"""AI Provider Service — configurable AI backend with OpenRouter + user API keys.

Supports:
- OpenRouter free models (default for first month)
- User-provided API keys for Claude, GPT, Gemini
- Automatic fallback: user key → platform OpenRouter → error

The platform saves money when users connect their own AI accounts.
"""
import base64
import hashlib
import json
import sqlite3
from datetime import datetime

import httpx

from api.config import get_settings


# ═══════════════════════════════════════════════════
# PROVIDER CONFIGS
# ═══════════════════════════════════════════════════

PROVIDERS = {
    "openrouter": {
        "label": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "models": {
            "free": "stepfun/step-3.5-flash:free",
            "fast": "meta-llama/llama-3.3-8b-instruct:free",
            "smart": "deepseek/deepseek-chat-v3-0324:free",
        },
    },
    "anthropic": {
        "label": "Claude (Anthropic)",
        "base_url": "https://api.anthropic.com",
        "models": {
            "fast": "claude-haiku-4-5-20251001",
            "smart": "claude-sonnet-4-6-20250415",
        },
    },
    "openai": {
        "label": "ChatGPT (OpenAI)",
        "base_url": "https://api.openai.com/v1",
        "models": {
            "fast": "gpt-4o-mini",
            "smart": "gpt-4o",
        },
    },
    "google": {
        "label": "Gemini (Google)",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "models": {
            "fast": "gemini-2.0-flash",
            "smart": "gemini-2.0-flash",
        },
    },
}


from api.services.crypto import decrypt_api_key

# ═══════════════════════════════════════════════════
# USER AI PROVIDER MANAGEMENT



def get_user_providers(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """Get user's connected AI providers."""
    rows = conn.execute(
        """SELECT provider, last_four, created_at, updated_at
           FROM user_api_keys WHERE user_id = ?""",
        (user_id,),
    ).fetchall()
    return [
        {
            **dict(r),
            "label": PROVIDERS.get(r["provider"], {}).get("label", r["provider"]),
        }
        for r in rows
    ]


def _get_active_provider(user_id: int | None, conn: sqlite3.Connection | None) -> tuple[str, str, str]:
    """Get the best available AI provider for a user.

    Priority: user's own key → platform OpenRouter
    Returns: (provider, api_key, model)
    """
    settings = get_settings()

    # Check if user has their own provider connected
    if user_id and conn:
        row = conn.execute(
            """SELECT provider, key_ciphertext, auth_tag, nonce
               FROM user_api_keys
               WHERE user_id = ?
               ORDER BY updated_at DESC LIMIT 1""",
            (user_id,),
        ).fetchone()
        if row:
            provider = row["provider"]
            api_key = decrypt_api_key(row["key_ciphertext"], row["auth_tag"], row["nonce"])
            model = PROVIDERS[provider]["models"]["smart"]
            return provider, api_key, model

    # Fall back to platform OpenRouter
    api_key = settings.openrouter_api_key
    if not api_key:
        # Fall back to Anthropic if OpenRouter not configured
        api_key = settings.anthropic_api_key
        if api_key:
            return "anthropic", api_key, "claude-haiku-4-5-20251001"
        raise RuntimeError("No AI provider configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY.")

    return "openrouter", api_key, settings.openrouter_default_model


# ═══════════════════════════════════════════════════
# UNIFIED AI COMPLETION API
# ═══════════════════════════════════════════════════

def ai_complete(
    system_prompt: str,
    user_prompt: str,
    user_id: int | None = None,
    conn: sqlite3.Connection | None = None,
    temperature: float = 0.7,
    max_tokens: int = 2000,
    prefer_smart: bool = False,
) -> str:
    """Universal AI completion — routes to the best available provider.

    Works with OpenRouter (free models), Anthropic, OpenAI, Google.
    Falls back gracefully.
    """
    provider, api_key, model = _get_active_provider(user_id, conn)

    if prefer_smart and provider in PROVIDERS:
        model = PROVIDERS[provider]["models"].get("smart", model)

    if provider == "openrouter":
        return _call_openrouter(api_key, model, system_prompt, user_prompt, temperature, max_tokens)
    elif provider == "anthropic":
        return _call_anthropic(api_key, model, system_prompt, user_prompt, temperature, max_tokens)
    elif provider == "openai":
        return _call_openai(api_key, model, system_prompt, user_prompt, temperature, max_tokens)
    elif provider == "google":
        return _call_google(api_key, model, system_prompt, user_prompt, temperature, max_tokens)
    else:
        raise ValueError(f"Unsupported provider: {provider}")


def ai_complete_json(
    system_prompt: str,
    user_prompt: str,
    user_id: int | None = None,
    conn: sqlite3.Connection | None = None,
    prefer_smart: bool = False,
) -> dict:
    """AI completion that returns parsed JSON."""
    raw = ai_complete(
        system_prompt + "\n\nReturn valid JSON only. No markdown formatting.",
        user_prompt,
        user_id=user_id,
        conn=conn,
        prefer_smart=prefer_smart,
    )
    # Strip markdown code blocks if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    return json.loads(text)


# ═══════════════════════════════════════════════════
# PROVIDER-SPECIFIC IMPLEMENTATIONS
# ═══════════════════════════════════════════════════

def _call_openrouter(
    api_key: str, model: str, system_prompt: str, user_prompt: str,
    temperature: float, max_tokens: int,
) -> str:
    """Call OpenRouter API (OpenAI-compatible format)."""
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://jobintel.ai",
            "X-Title": "JobIntel",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def _call_anthropic(
    api_key: str, model: str, system_prompt: str, user_prompt: str,
    temperature: float, max_tokens: int,
) -> str:
    """Call Anthropic Claude API."""
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=temperature,
    )
    return response.content[0].text


def _call_openai(
    api_key: str, model: str, system_prompt: str, user_prompt: str,
    temperature: float, max_tokens: int,
) -> str:
    """Call OpenAI API."""
    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def _call_google(
    api_key: str, model: str, system_prompt: str, user_prompt: str,
    temperature: float, max_tokens: int,
) -> str:
    """Call Google Gemini API."""
    response = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        },
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]
