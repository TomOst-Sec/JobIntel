"""Chat request/response models."""
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str
    metadata: dict | None = None
    created_at: str | None = None


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    message: str
    metadata: dict | None = None


class ConversationCreate(BaseModel):
    title: str = "New Conversation"


class ConversationResponse(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0


class QuickQueryRequest(BaseModel):
    query: str
