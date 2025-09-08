"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";
import { BuildScore } from "@/components/ui/build-score";

interface Post {
    id: number;
    author_id: number;
    author_name: string;
    author_role: string;
    author_avatar: string | null;
    author_headline: string | null;
    build_score: number | null;
    content: string;
    post_type: string;
    likes_count: number;
    comments_count: number;
    liked_by_me: boolean;
    created_at: string;
    comments?: Comment[];
}

interface Comment {
    id: number;
    user_id: number;
    author_name: string;
    author_avatar: string | null;
    content: string;
    created_at: string;
}

export default function FeedPage() {
    const { user } = useAuth();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [newPost, setNewPost] = useState("");
    const [postType, setPostType] = useState("status");
    const [posting, setPosting] = useState(false);
    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
    const [postComments, setPostComments] = useState<Record<number, Comment[]>>({});

    useEffect(() => {
        loadFeed();
    }, []);

    async function loadFeed() {
        try {
            const data = await api.get<{ posts: Post[] }>("/feed/social");
            setPosts(data.posts);
        } finally {
            setLoading(false);
        }
    }

    async function handlePost() {
        if (!newPost.trim()) return;
        setPosting(true);
        try {
            const post = await api.post<Post>("/feed/posts", {
                content: newPost.trim(),
                post_type: postType,
            });
            setPosts([post, ...posts]);
            setNewPost("");
        } finally {
            setPosting(false);
        }
    }

    async function handleLike(postId: number) {
        const result = await api.post<{ liked: boolean; likes_count: number }>(`/feed/posts/${postId}/like`);
        setPosts((prev) =>
            prev.map((p) =>
                p.id === postId ? { ...p, liked_by_me: result.liked, likes_count: result.likes_count } : p
            )
        );
    }

    async function handleComment(postId: number) {
        const content = commentInputs[postId]?.trim();
        if (!content) return;
        const comment = await api.post<Comment>(`/feed/posts/${postId}/comment`, { content });
        setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p))
        );
        setPostComments((prev) => ({
            ...prev,
            [postId]: [...(prev[postId] || []), comment],
        }));
        setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
        if (!expandedComments.has(postId)) {
            setExpandedComments(new Set([...expandedComments, postId]));
        }
    }

    async function toggleComments(postId: number) {
        if (expandedComments.has(postId)) {
            const next = new Set(expandedComments);
            next.delete(postId);
            setExpandedComments(next);
        } else {
            if (!postComments[postId]) {
                const data = await api.get<{ comments: Comment[] }>(`/feed/posts/${postId}/comments`);
                setPostComments((prev) => ({ ...prev, [postId]: data.comments }));
            }
            setExpandedComments(new Set([...expandedComments, postId]));
        }
    }

    async function handleDelete(postId: number) {
        if (!confirm("Delete this post?")) return;
        await api.delete(`/feed/posts/${postId}`);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
    }

    function timeAgo(date: string) {
        const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    }

    return (
        <>
            <TopNav />
            <main className="max-w-2xl mx-auto px-4 py-6">
                <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                    Community Feed
                </h1>

                {/* Composer */}
                {user && (
                    <div
                        className="rounded-2xl p-4 mb-6"
                        style={{
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                        }}
                    >
                        <div className="flex gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                                style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                            >
                                {user.full_name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <textarea
                                    value={newPost}
                                    onChange={(e) => setNewPost(e.target.value)}
                                    placeholder="What's on your mind? Share an update, ask a question..."
                                    rows={3}
                                    className="w-full px-0 py-1 text-sm outline-none resize-none bg-transparent"
                                    style={{ color: "var(--text-primary)" }}
                                />
                                <div className="flex justify-between items-center mt-2">
                                    <div className="flex gap-1 text-xs flex-wrap">
                                        {[
                                            { type: "status", label: "Status" },
                                            { type: "build_log", label: "Build Log" },
                                            { type: "tech_take", label: "Tech Take" },
                                            { type: "question", label: "Question" },
                                            { type: "deep_dive", label: "Deep Dive" },
                                            { type: "launch", label: "Launch" },
                                        ].map((pt) => (
                                            <button
                                                key={pt.type}
                                                onClick={() => setPostType(pt.type)}
                                                className="px-2 py-0.5 rounded transition-colors"
                                                style={{
                                                    backgroundColor: postType === pt.type ? "var(--cyan-15)" : "transparent",
                                                    color: postType === pt.type ? "var(--cyan)" : "var(--text-muted)",
                                                    border: `1px solid ${postType === pt.type ? "var(--cyan-30)" : "transparent"}`,
                                                }}
                                            >
                                                {pt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handlePost}
                                        disabled={!newPost.trim() || posting}
                                        className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                                        style={{
                                            backgroundColor: "var(--cyan)",
                                            color: "var(--text-inverse)",
                                            opacity: !newPost.trim() ? 0.5 : 1,
                                        }}
                                    >
                                        {posting ? "Posting..." : "Post"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Feed */}
                {loading ? (
                    <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                        Loading feed...
                    </div>
                ) : posts.length === 0 ? (
                    <div
                        className="rounded-2xl p-8 text-center"
                        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
                    >
                        <p className="text-4xl mb-3">📝</p>
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                            No posts yet. Be the first to share something!
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {posts.map((post) => (
                            <article
                                key={post.id}
                                className="rounded-2xl p-4"
                                style={{
                                    backgroundColor: "var(--bg-surface)",
                                    border: "1px solid var(--border-subtle)",
                                }}
                            >
                                {/* Author */}
                                <div className="flex items-start gap-3">
                                    <Link href={`/profile/${post.author_id}`}>
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                                            style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                                        >
                                            {post.author_avatar ? (
                                                <img src={post.author_avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                post.author_name?.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/profile/${post.author_id}`}
                                                    className="text-sm font-semibold hover:underline"
                                                    style={{ color: "var(--text-primary)" }}
                                                >
                                                    {post.author_name}
                                                </Link>
                                                {post.build_score != null && post.build_score > 0 && (
                                                    <BuildScore score={post.build_score} size="sm" />
                                                )}
                                            </div>
                                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                {timeAgo(post.created_at)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                {post.author_headline || post.author_role}
                                            </p>
                                            {post.post_type && post.post_type !== "status" && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                                    style={{
                                                        backgroundColor: "var(--cyan-08)",
                                                        color: "var(--cyan)",
                                                    }}
                                                >
                                                    {post.post_type.replace("_", " ")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {user?.id === post.author_id && (
                                        <button
                                            onClick={() => handleDelete(post.id)}
                                            className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 transition-opacity"
                                            style={{ color: "var(--red)" }}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Content */}
                                <p
                                    className="mt-3 text-sm whitespace-pre-wrap"
                                    style={{ color: "var(--text-primary)" }}
                                >
                                    {post.content}
                                </p>

                                {/* Interactions */}
                                <div
                                    className="flex items-center gap-4 mt-3 pt-3"
                                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                                >
                                    <button
                                        onClick={() => handleLike(post.id)}
                                        className="flex items-center gap-1.5 text-sm transition-colors"
                                        style={{ color: post.liked_by_me ? "var(--cyan)" : "var(--text-muted)" }}
                                    >
                                        {post.liked_by_me ? "❤️" : "🤍"} {post.likes_count}
                                    </button>
                                    <button
                                        onClick={() => toggleComments(post.id)}
                                        className="flex items-center gap-1.5 text-sm"
                                        style={{ color: "var(--text-muted)" }}
                                    >
                                        💬 {post.comments_count}
                                    </button>
                                </div>

                                {/* Comments */}
                                {expandedComments.has(post.id) && (
                                    <div className="mt-3 space-y-2">
                                        {(postComments[post.id] || []).map((c) => (
                                            <div key={c.id} className="flex gap-2 pl-2">
                                                <div
                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                                    style={{ backgroundColor: "var(--cyan-08)", color: "var(--cyan)" }}
                                                >
                                                    {c.author_name?.charAt(0).toUpperCase()}
                                                </div>
                                                <div
                                                    className="px-3 py-2 rounded-xl flex-1"
                                                    style={{ backgroundColor: "var(--bg-elevated)" }}
                                                >
                                                    <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                                        {c.author_name}
                                                    </p>
                                                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                                        {c.content}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Add comment */}
                                        {user && (
                                            <div className="flex gap-2 pl-2 pt-1">
                                                <input
                                                    value={commentInputs[post.id] || ""}
                                                    onChange={(e) =>
                                                        setCommentInputs({ ...commentInputs, [post.id]: e.target.value })
                                                    }
                                                    onKeyDown={(e) => e.key === "Enter" && handleComment(post.id)}
                                                    placeholder="Write a comment..."
                                                    className="flex-1 px-3 py-2 rounded-full text-xs outline-none"
                                                    style={{
                                                        backgroundColor: "var(--bg-elevated)",
                                                        border: "1px solid var(--border-default)",
                                                        color: "var(--text-primary)",
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </main>
        </>
    );
}
