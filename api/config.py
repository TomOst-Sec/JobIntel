"""API configuration via Pydantic BaseSettings."""
import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Existing keys (shared with CLI)
    rapidapi_key: str = ""
    anthropic_api_key: str = ""

    # Database & Cache
    db_path: str = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "data", "jobintel.db"
    )
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_publishable_key: str = ""

    # Email (Resend)
    resend_api_key: str = ""
    from_email: str = "noreply@jobintel.ai"

    # App
    app_name: str = "JobIntel"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"
    debug: bool = False
    cors_origins: str = "http://localhost:3000"

    # Scraper API keys
    themuse_api_key: str = ""
    adzuna_app_id: str = ""
    adzuna_app_key: str = ""
    reed_api_key: str = ""
    usajobs_api_key: str = ""
    usajobs_email: str = ""

    # OpenRouter (free models for first month)
    openrouter_api_key: str = ""
    openrouter_default_model: str = "stepfun/step-3.5-flash:free"

    # OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""

    # SMS (Twilio)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # Encryption key for user API keys
    encryption_key: str = "change-me-in-production-32bytes!"

    # CV uploads
    upload_dir: str = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "data", "uploads"
    )
    max_upload_size_mb: int = 10

    model_config = {"env_file": os.path.join(
        os.path.dirname(os.path.dirname(__file__)), ".env"
    )}


@lru_cache
def get_settings() -> Settings:
    return Settings()
