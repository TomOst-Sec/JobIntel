"""In-platform direct messaging endpoints."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user
from api.services.messaging_service import (
    get_or_create_conversation, list_conversations,
    get_messages, send_message, mark_read, get_unread_count,
)

router = APIRouter()


class StartConversation(BaseModel):
    user_id: int


class SendMessage(BaseModel):
    content: str


# ─── Conversations ──────────────────────────────────

@router.get("/conversations")
def my_conversations(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all DM conversations."""
    return {"conversations": list_conversations(user["id"], db)}


@router.post("/conversations", status_code=201)
def start_conversation(
    body: StartConversation,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Start or get a DM conversation with another user."""
    try:
        return get_or_create_conversation(user["id"], body.user_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Messages ───────────────────────────────────────

@router.get("/conversations/{conv_id}")
def conversation_messages(
    conv_id: int,
    before: int | None = Query(None, description="Get messages before this ID"),
    limit: int = Query(50, ge=1, le=100),
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get messages in a conversation."""
    try:
        messages = get_messages(conv_id, user["id"], db, limit=limit, before_id=before)
        return {"messages": messages, "conversation_id": conv_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/conversations/{conv_id}")
def post_message(
    conv_id: int,
    body: SendMessage,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Send a message in a conversation."""
    try:
        return send_message(conv_id, user["id"], body.content, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Read Tracking ──────────────────────────────────

@router.put("/conversations/{conv_id}/read")
def mark_conversation_read(
    conv_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Mark all messages in a conversation as read."""
    try:
        return mark_read(conv_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/unread-count")
def unread_message_count(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get total unread message count."""
    return {"unread_count": get_unread_count(user["id"], db)}
