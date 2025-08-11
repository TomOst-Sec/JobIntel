"""Social feed endpoints: posts, likes, comments."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_db, get_current_user, get_optional_user
from api.services.social_service import (
    create_post, get_post, get_feed, get_user_posts,
    toggle_like, add_comment, get_comments, delete_post,
)

router = APIRouter()


class CreatePost(BaseModel):
    content: str
    post_type: str = "status"
    media_urls: list[str] | None = None


class CreateComment(BaseModel):
    content: str
    parent_comment_id: int | None = None


# ─── Feed ───────────────────────────────────────────

@router.get("/social")
def social_feed(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    user: dict | None = Depends(get_optional_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get the social feed with user posts."""
    offset = (page - 1) * per_page
    viewer_id = user["id"] if user else None
    posts = get_feed(viewer_id=viewer_id, limit=per_page, offset=offset, conn=db)
    return {"posts": posts, "page": page, "per_page": per_page}


# ─── Posts ──────────────────────────────────────────

@router.post("/posts", status_code=201)
def new_post(
    body: CreatePost,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Create a new post."""
    try:
        return create_post(
            author_id=user["id"], content=body.content,
            post_type=body.post_type, media_urls=body.media_urls, conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/posts/{post_id}")
def view_post(
    post_id: int,
    user: dict | None = Depends(get_optional_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get a single post with details."""
    try:
        viewer_id = user["id"] if user else None
        post = get_post(post_id, viewer_id, db)
        comments = get_comments(post_id, conn=db)
        return {**post, "comments": comments}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/users/{user_id}/posts")
def user_posts(
    user_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    viewer: dict | None = Depends(get_optional_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get posts by a specific user."""
    offset = (page - 1) * per_page
    viewer_id = viewer["id"] if viewer else None
    posts = get_user_posts(user_id, viewer_id=viewer_id, limit=per_page, offset=offset, conn=db)
    return {"posts": posts, "page": page}


@router.delete("/posts/{post_id}")
def remove_post(
    post_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Delete your own post."""
    try:
        return delete_post(post_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ─── Likes ──────────────────────────────────────────

@router.post("/posts/{post_id}/like")
def like_post(
    post_id: int,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Like or unlike a post (toggle)."""
    try:
        return toggle_like(post_id, user["id"], db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Comments ───────────────────────────────────────

@router.post("/posts/{post_id}/comment", status_code=201)
def comment_on_post(
    post_id: int,
    body: CreateComment,
    user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Add a comment to a post."""
    try:
        return add_comment(
            post_id, user["id"], body.content,
            parent_comment_id=body.parent_comment_id, conn=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/posts/{post_id}/comments")
def list_comments(
    post_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get comments for a post."""
    offset = (page - 1) * per_page
    comments = get_comments(post_id, limit=per_page, offset=offset, conn=db)
    return {"comments": comments}
