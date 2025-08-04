"""Social feed service: posts, likes, comments."""
import json
import sqlite3


def create_post(
    author_id: int, content: str, post_type: str = "status",
    media_urls: list | None = None, conn: sqlite3.Connection = None,
) -> dict:
    """Create a new post."""
    if not content.strip():
        raise ValueError("Post content cannot be empty")

    valid_types = ("status", "article", "job_update", "milestone",
                    "build_log", "tech_take", "deep_dive", "question", "signal_post", "launch")
    if post_type not in valid_types:
        post_type = "status"

    cursor = conn.execute(
        """INSERT INTO posts (author_id, content, post_type, media_urls)
           VALUES (?, ?, ?, ?)""",
        (author_id, content.strip(), post_type, json.dumps(media_urls or [])),
    )
    conn.commit()
    return get_post(cursor.lastrowid, author_id, conn)


def get_post(post_id: int, viewer_id: int | None, conn: sqlite3.Connection) -> dict:
    """Get a single post with author info."""
    row = conn.execute(
        """SELECT p.*, u.full_name as author_name, u.role as author_role,
                  up.avatar_url as author_avatar, up.headline as author_headline
           FROM posts p
           JOIN users u ON u.id = p.author_id
           LEFT JOIN user_profiles up ON up.user_id = p.author_id
           WHERE p.id = ?""",
        (post_id,),
    ).fetchone()

    if not row:
        raise ValueError("Post not found")

    post = dict(row)
    if post.get("media_urls"):
        try:
            post["media_urls"] = json.loads(post["media_urls"])
        except (json.JSONDecodeError, TypeError):
            post["media_urls"] = []

    # Check if viewer liked this post
    post["liked_by_me"] = False
    if viewer_id:
        liked = conn.execute(
            "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?",
            (post_id, viewer_id),
        ).fetchone()
        post["liked_by_me"] = liked is not None

    return post


def get_feed(
    viewer_id: int | None = None, limit: int = 20, offset: int = 0,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get the social feed (public posts, newest first)."""
    rows = conn.execute(
        """SELECT p.*, u.full_name as author_name, u.role as author_role,
                  up.avatar_url as author_avatar, up.headline as author_headline,
                  gp.build_score as build_score
           FROM posts p
           JOIN users u ON u.id = p.author_id
           LEFT JOIN user_profiles up ON up.user_id = p.author_id
           LEFT JOIN github_profiles gp ON gp.user_id = p.author_id
           WHERE p.is_public = 1
           ORDER BY p.created_at DESC
           LIMIT ? OFFSET ?""",
        (limit, offset),
    ).fetchall()

    posts = []
    for r in rows:
        post = dict(r)
        if post.get("media_urls"):
            try:
                post["media_urls"] = json.loads(post["media_urls"])
            except (json.JSONDecodeError, TypeError):
                post["media_urls"] = []

        post["liked_by_me"] = False
        if viewer_id:
            liked = conn.execute(
                "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?",
                (post["id"], viewer_id),
            ).fetchone()
            post["liked_by_me"] = liked is not None

        posts.append(post)

    return posts


def get_user_posts(
    user_id: int, viewer_id: int | None = None,
    limit: int = 20, offset: int = 0, conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get posts by a specific user."""
    rows = conn.execute(
        """SELECT p.*, u.full_name as author_name, u.role as author_role,
                  up.avatar_url as author_avatar, up.headline as author_headline
           FROM posts p
           JOIN users u ON u.id = p.author_id
           LEFT JOIN user_profiles up ON up.user_id = p.author_id
           WHERE p.author_id = ? AND p.is_public = 1
           ORDER BY p.created_at DESC
           LIMIT ? OFFSET ?""",
        (user_id, limit, offset),
    ).fetchall()

    posts = []
    for r in rows:
        post = dict(r)
        if post.get("media_urls"):
            try:
                post["media_urls"] = json.loads(post["media_urls"])
            except (json.JSONDecodeError, TypeError):
                post["media_urls"] = []
        post["liked_by_me"] = False
        if viewer_id:
            liked = conn.execute(
                "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?",
                (post["id"], viewer_id),
            ).fetchone()
            post["liked_by_me"] = liked is not None
        posts.append(post)

    return posts


def toggle_like(post_id: int, user_id: int, conn: sqlite3.Connection) -> dict:
    """Like or unlike a post. Returns the new like state."""
    # Verify post exists
    post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        raise ValueError("Post not found")

    existing = conn.execute(
        "SELECT id FROM post_likes WHERE post_id = ? AND user_id = ?",
        (post_id, user_id),
    ).fetchone()

    if existing:
        conn.execute("DELETE FROM post_likes WHERE id = ?", (existing[0],))
        conn.execute(
            "UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?",
            (post_id,),
        )
        liked = False
    else:
        conn.execute(
            "INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)",
            (post_id, user_id),
        )
        conn.execute(
            "UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?",
            (post_id,),
        )
        liked = True

    conn.commit()
    count = conn.execute(
        "SELECT likes_count FROM posts WHERE id = ?", (post_id,)
    ).fetchone()[0]

    return {"post_id": post_id, "liked": liked, "likes_count": count}


def add_comment(
    post_id: int, user_id: int, content: str,
    parent_comment_id: int | None = None, conn: sqlite3.Connection = None,
) -> dict:
    """Add a comment to a post."""
    if not content.strip():
        raise ValueError("Comment cannot be empty")

    post = conn.execute("SELECT id FROM posts WHERE id = ?", (post_id,)).fetchone()
    if not post:
        raise ValueError("Post not found")

    cursor = conn.execute(
        """INSERT INTO post_comments (post_id, user_id, content, parent_comment_id)
           VALUES (?, ?, ?, ?)""",
        (post_id, user_id, content.strip(), parent_comment_id),
    )
    conn.execute(
        "UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?",
        (post_id,),
    )
    conn.commit()

    comment_id = cursor.lastrowid
    row = conn.execute(
        """SELECT pc.*, u.full_name as author_name, up.avatar_url as author_avatar
           FROM post_comments pc
           JOIN users u ON u.id = pc.user_id
           LEFT JOIN user_profiles up ON up.user_id = pc.user_id
           WHERE pc.id = ?""",
        (comment_id,),
    ).fetchone()

    return dict(row)


def get_comments(
    post_id: int, limit: int = 50, offset: int = 0,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    """Get comments for a post."""
    rows = conn.execute(
        """SELECT pc.*, u.full_name as author_name, up.avatar_url as author_avatar
           FROM post_comments pc
           JOIN users u ON u.id = pc.user_id
           LEFT JOIN user_profiles up ON up.user_id = pc.user_id
           WHERE pc.post_id = ?
           ORDER BY pc.created_at ASC
           LIMIT ? OFFSET ?""",
        (post_id, limit, offset),
    ).fetchall()

    return [dict(r) for r in rows]


def delete_post(post_id: int, user_id: int, conn: sqlite3.Connection) -> dict:
    """Delete a post (only the author can delete)."""
    post = conn.execute(
        "SELECT author_id FROM posts WHERE id = ?", (post_id,)
    ).fetchone()
    if not post:
        raise ValueError("Post not found")
    if post[0] != user_id:
        raise PermissionError("You can only delete your own posts")

    conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    conn.commit()
    return {"deleted": True, "post_id": post_id}
