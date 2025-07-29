from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class APIKeyCreate(BaseModel):
    provider: str = Field(..., description="The LLM Provider (openai, anthropic, google)")
    api_key: str = Field(..., description="The plaintext API key to validate and store")

class APIKeyResponse(BaseModel):
    id: int
    provider: str
    last_four: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
