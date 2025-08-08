"""Chat endpoints with SSE streaming."""
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from api.dependencies import get_db, get_current_user
from api.models.chat import (
    ChatRequest, ChatResponse, ConversationCreate,
    ConversationResponse, QuickQueryRequest,
)
from api.services.chat_service import ChatService

router = APIRouter()


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
def create_conversation(
    body: ConversationCreate,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    cursor = db.execute(
        "INSERT INTO chat_conversations (user_id, title) VALUES (?, ?)",
        (user["id"], body.title),
    )
    db.commit()
    conv_id = cursor.lastrowid
    row = db.execute("SELECT * FROM chat_conversations WHERE id = ?", (conv_id,)).fetchone()
    return {**dict(row), "message_count": 0}


@router.get("/conversations", response_model=list[ConversationResponse])
def list_conversations(
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    rows = db.execute("""
        SELECT c.*, COUNT(m.id) as message_count
        FROM chat_conversations c
        LEFT JOIN chat_messages m ON m.conversation_id = c.id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    """, (user["id"],)).fetchall()
    return [dict(r) for r in rows]


@router.post("/conversations/{conv_id}/messages")
async def send_message(
    conv_id: int,
    body: ChatRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Send a message and get a streamed AI response via SSE."""
    # Verify conversation belongs to user
    conv = db.execute(
        "SELECT * FROM chat_conversations WHERE id = ? AND user_id = ?",
        (conv_id, user["id"]),
    ).fetchone()
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Check daily chat limit
    chat_count = db.execute("""
        SELECT COUNT(*) FROM chat_messages
        WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ?)
          AND role = 'user'
          AND created_at >= date('now')
    """, (user["id"],)).fetchone()[0]

    limit_row = db.execute("""
        SELECT sp.chat_limit_daily FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = ? AND us.status = 'active'
    """, (user["id"],)).fetchone()
    daily_limit = limit_row["chat_limit_daily"] if limit_row else 10

    if chat_count >= daily_limit:
        raise HTTPException(status_code=429, detail="Daily chat limit reached. Please upgrade your plan.")

    # Save user message
    db.execute(
        "INSERT INTO chat_messages (conversation_id, role, content) VALUES (?, 'user', ?)",
        (conv_id, body.message),
    )
    db.execute(
        "UPDATE chat_conversations SET updated_at = datetime('now') WHERE id = ?",
        (conv_id,),
    )
    db.commit()

    # Get conversation history
    history_rows = db.execute(
        "SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at",
        (conv_id,),
    ).fetchall()
    history = [dict(r) for r in history_rows]

    # Run 3-phase pipeline
    chat_service = ChatService(db)

    try:
        # Phase 1: Classify intent
        classification = chat_service.classify_intent(body.message)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        # AI unavailable — fall back to echo
        classification = {"intents": [{"intent": "general", "params": {}}], "summary": body.message}

    intents = classification.get("intents", [])

    # Phase 2: Retrieve data
    data = chat_service.retrieve_data(intents)

    # Phase 3: Stream response
    metadata = json.dumps({"intents": intents, "data_sources": list(data.keys())})

    async def event_stream():
        full_response = []
        try:
            async for chunk in chat_service.synthesize_stream(body.message, data, history, user_role=user.get("role", "seeker")):
                full_response.append(chunk)
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return
        except Exception:
            yield f"data: {json.dumps({'error': 'AI service temporarily unavailable. Please try again later.'})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
            return

        # Save assistant response
        full_text = "".join(full_response)
        db.execute(
            "INSERT INTO chat_messages (conversation_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)",
            (conv_id, full_text, metadata),
        )
        db.commit()
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/quick-query", response_model=ChatResponse)
def quick_query(
    body: QuickQueryRequest,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """One-shot query without conversation context."""
    chat_service = ChatService(db)
    try:
        classification = chat_service.classify_intent(body.query)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        classification = {"intents": [{"intent": "general", "params": {}}], "summary": body.query}
    intents = classification.get("intents", [])
    data = chat_service.retrieve_data(intents)
    try:
        response_text = chat_service.synthesize_sync(body.query, data, [], user_role=user.get("role", "seeker"))
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable. Please try again later.")
    return ChatResponse(
        message=response_text,
        metadata={"intents": intents, "data_sources": list(data.keys())},
    )
