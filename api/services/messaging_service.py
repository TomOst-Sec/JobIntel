"""In-platform direct messaging service."""
import sqlite3


def get_or_create_conversation(
    user_id: int, other_user_id: int, conn: sqlite3.Connection
) -> dict:
    """Get an existing DM conversation between two users, or create one."""
    if user_id == other_user_id:
        raise ValueError("Cannot start a conversation with yourself")

    # Check both users exist
    for uid in (user_id, other_user_id):
        row = conn.execute("SELECT id FROM users WHERE id = ? AND is_active = 1", (uid,)).fetchone()
        if not row:
            raise ValueError(f"User {uid} not found")

    # Check if conversation already exists between these two users
    row = conn.execute(
        """SELECT dp1.conversation_id
           FROM dm_participants dp1
           JOIN dm_participants dp2 ON dp1.conversation_id = dp2.conversation_id
           WHERE dp1.user_id = ? AND dp2.user_id = ?""",
        (user_id, other_user_id),
    ).fetchone()

    if row:
        return get_conversation(row[0], user_id, conn)

    # Check if recipient is open to messages
    profile = conn.execute(
        "SELECT open_to_messages FROM user_profiles WHERE user_id = ?",
        (other_user_id,),
    ).fetchone()
    if profile and not profile[0]:
        raise ValueError("This user is not accepting messages")

    # Create new conversation
    cursor = conn.execute("INSERT INTO dm_conversations DEFAULT VALUES")
    conv_id = cursor.lastrowid

    conn.execute(
        "INSERT INTO dm_participants (conversation_id, user_id) VALUES (?, ?)",
        (conv_id, user_id),
    )
    conn.execute(
        "INSERT INTO dm_participants (conversation_id, user_id) VALUES (?, ?)",
        (conv_id, other_user_id),
    )
    conn.commit()

    return get_conversation(conv_id, user_id, conn)


def get_conversation(conv_id: int, user_id: int, conn: sqlite3.Connection) -> dict:
    """Get a conversation with metadata."""
    # Verify user is a participant
    participant = conn.execute(
        "SELECT * FROM dm_participants WHERE conversation_id = ? AND user_id = ?",
        (conv_id, user_id),
    ).fetchone()
    if not participant:
        raise ValueError("Conversation not found")

    # Get the other participant(s)
    others = conn.execute(
        """SELECT u.id, u.full_name, u.role, up.avatar_url, up.headline
           FROM dm_participants dp
           JOIN users u ON u.id = dp.user_id
           LEFT JOIN user_profiles up ON up.user_id = dp.user_id
           WHERE dp.conversation_id = ? AND dp.user_id != ?""",
        (conv_id, user_id),
    ).fetchall()

    # Get last message
    last_msg = conn.execute(
        """SELECT content, sender_id, created_at
           FROM dm_messages WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT 1""",
        (conv_id,),
    ).fetchone()

    # Count unread messages
    last_read = dict(participant).get("last_read_at", "1970-01-01")
    unread = conn.execute(
        """SELECT COUNT(*) FROM dm_messages
           WHERE conversation_id = ? AND sender_id != ?
           AND created_at > ?""",
        (conv_id, user_id, last_read),
    ).fetchone()[0]

    return {
        "id": conv_id,
        "participants": [dict(o) for o in others],
        "last_message": dict(last_msg) if last_msg else None,
        "unread_count": unread,
        "updated_at": dict(last_msg)["created_at"] if last_msg else None,
    }


def list_conversations(user_id: int, conn: sqlite3.Connection) -> list[dict]:
    """List all DM conversations for a user, sorted by most recent."""
    conv_ids = conn.execute(
        """SELECT conversation_id FROM dm_participants
           WHERE user_id = ?
           ORDER BY last_read_at DESC""",
        (user_id,),
    ).fetchall()

    conversations = []
    for row in conv_ids:
        try:
            conv = get_conversation(row[0], user_id, conn)
            conversations.append(conv)
        except ValueError:
            continue

    # Sort by last message time
    conversations.sort(
        key=lambda c: c.get("updated_at") or "1970-01-01", reverse=True
    )
    return conversations


def get_messages(
    conv_id: int, user_id: int, conn: sqlite3.Connection,
    limit: int = 50, before_id: int | None = None,
) -> list[dict]:
    """Get messages in a conversation."""
    # Verify participation
    p = conn.execute(
        "SELECT id FROM dm_participants WHERE conversation_id = ? AND user_id = ?",
        (conv_id, user_id),
    ).fetchone()
    if not p:
        raise ValueError("Conversation not found")

    params: list = [conv_id]
    extra = ""
    if before_id:
        extra = "AND m.id < ?"
        params.append(before_id)

    params.append(limit)

    rows = conn.execute(
        f"""SELECT m.id, m.content, m.sender_id, m.created_at,
                   u.full_name as sender_name, up.avatar_url as sender_avatar
            FROM dm_messages m
            JOIN users u ON u.id = m.sender_id
            LEFT JOIN user_profiles up ON up.user_id = m.sender_id
            WHERE m.conversation_id = ? {extra}
            ORDER BY m.created_at DESC
            LIMIT ?""",
        params,
    ).fetchall()

    return [dict(r) for r in reversed(rows)]  # Return in chronological order


def send_message(
    conv_id: int, sender_id: int, content: str, conn: sqlite3.Connection
) -> dict:
    """Send a message in a conversation."""
    if not content.strip():
        raise ValueError("Message cannot be empty")

    # Verify sender is a participant
    p = conn.execute(
        "SELECT id FROM dm_participants WHERE conversation_id = ? AND user_id = ?",
        (conv_id, sender_id),
    ).fetchone()
    if not p:
        raise ValueError("Conversation not found")

    cursor = conn.execute(
        "INSERT INTO dm_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)",
        (conv_id, sender_id, content.strip()),
    )
    msg_id = cursor.lastrowid

    # Update conversation timestamp
    conn.execute(
        "UPDATE dm_conversations SET updated_at = datetime('now') WHERE id = ?",
        (conv_id,),
    )

    # Update sender's last_read_at
    conn.execute(
        """UPDATE dm_participants SET last_read_at = datetime('now')
           WHERE conversation_id = ? AND user_id = ?""",
        (conv_id, sender_id),
    )
    conn.commit()

    row = conn.execute(
        """SELECT m.id, m.content, m.sender_id, m.created_at,
                  u.full_name as sender_name, up.avatar_url as sender_avatar
           FROM dm_messages m
           JOIN users u ON u.id = m.sender_id
           LEFT JOIN user_profiles up ON up.user_id = m.sender_id
           WHERE m.id = ?""",
        (msg_id,),
    ).fetchone()

    return dict(row)


def mark_read(conv_id: int, user_id: int, conn: sqlite3.Connection) -> dict:
    """Mark a conversation as read."""
    conn.execute(
        """UPDATE dm_participants SET last_read_at = datetime('now')
           WHERE conversation_id = ? AND user_id = ?""",
        (conv_id, user_id),
    )
    conn.commit()
    return {"status": "ok"}


def get_unread_count(user_id: int, conn: sqlite3.Connection) -> int:
    """Get total unread message count across all conversations."""
    rows = conn.execute(
        """SELECT dp.conversation_id, dp.last_read_at
           FROM dm_participants dp
           WHERE dp.user_id = ?""",
        (user_id,),
    ).fetchall()

    total = 0
    for row in rows:
        d = dict(row)
        count = conn.execute(
            """SELECT COUNT(*) FROM dm_messages
               WHERE conversation_id = ? AND sender_id != ?
               AND created_at > ?""",
            (d["conversation_id"], user_id, d["last_read_at"]),
        ).fetchone()[0]
        total += count

    return total
