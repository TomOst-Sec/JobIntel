"use client";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TopNav } from "@/components/layout/top-nav";

interface Participant {
    id: number;
    full_name: string;
    role: string;
    avatar_url: string | null;
    headline: string | null;
}

interface Conversation {
    id: number;
    participants: Participant[];
    last_message: { content: string; sender_id: number; created_at: string } | null;
    unread_count: number;
    updated_at: string | null;
}

interface Message {
    id: number;
    content: string;
    sender_id: number;
    sender_name: string;
    sender_avatar: string | null;
    created_at: string;
}

export default function InboxPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const preselectedConv = searchParams?.get("conv");

    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMsg, setNewMsg] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [unreadTotal, setUnreadTotal] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadConversations();
        loadUnread();
    }, []);

    useEffect(() => {
        if (preselectedConv && conversations.length) {
            setActiveConvId(Number(preselectedConv));
        }
    }, [preselectedConv, conversations]);

    useEffect(() => {
        if (activeConvId) {
            loadMessages(activeConvId);
            markRead(activeConvId);
        }
    }, [activeConvId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Poll for new messages
    useEffect(() => {
        if (!activeConvId) return;
        const interval = setInterval(() => {
            loadMessages(activeConvId);
        }, 5000);
        return () => clearInterval(interval);
    }, [activeConvId]);

    async function loadConversations() {
        try {
            const data = await api.get<{ conversations: Conversation[] }>("/messages/conversations");
            setConversations(data.conversations);
        } finally {
            setLoading(false);
        }
    }

    async function loadUnread() {
        const data = await api.get<{ unread_count: number }>("/messages/unread-count");
        setUnreadTotal(data.unread_count);
    }

    async function loadMessages(convId: number) {
        const data = await api.get<{ messages: Message[] }>(`/messages/conversations/${convId}`);
        setMessages(data.messages);
    }

    async function markRead(convId: number) {
        await api.put(`/messages/conversations/${convId}/read`);
        setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
        );
        loadUnread();
    }

    async function handleSend() {
        if (!newMsg.trim() || !activeConvId) return;
        setSending(true);
        try {
            const msg = await api.post<Message>(`/messages/conversations/${activeConvId}`, {
                content: newMsg.trim(),
            });
            setMessages((prev) => [...prev, msg]);
            setNewMsg("");
            loadConversations();
        } finally {
            setSending(false);
        }
    }

    const activeConv = conversations.find((c) => c.id === activeConvId);

    return (
        <>
            <TopNav />
            <main className="max-w-6xl mx-auto px-4 py-6">
                <h1 className="text-2xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                    💬 Inbox
                    {unreadTotal > 0 && (
                        <span
                            className="ml-2 px-2 py-0.5 text-xs rounded-full font-medium"
                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}
                        >
                            {unreadTotal}
                        </span>
                    )}
                </h1>

                <div
                    className="flex rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        height: "calc(100vh - 180px)",
                    }}
                >
                    {/* Conversation List */}
                    <div
                        className="w-80 shrink-0 overflow-y-auto"
                        style={{ borderRight: "1px solid var(--border-subtle)" }}
                    >
                        {loading ? (
                            <div className="p-4 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                                Loading...
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="p-6 text-center">
                                <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>No conversations yet</p>
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                    Visit a user&apos;s profile and click &quot;Send Message&quot; to get started
                                </p>
                            </div>
                        ) : (
                            conversations.map((conv) => {
                                const other = conv.participants[0];
                                const isActive = conv.id === activeConvId;
                                return (
                                    <button
                                        key={conv.id}
                                        onClick={() => setActiveConvId(conv.id)}
                                        className="w-full text-left px-4 py-3 transition-all"
                                        style={{
                                            backgroundColor: isActive ? "var(--cyan-08)" : "transparent",
                                            borderBottom: "1px solid var(--border-subtle)",
                                        }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                                                style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                                            >
                                                {other?.avatar_url ? (
                                                    <img src={other.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    other?.full_name?.charAt(0).toUpperCase() || "?"
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                                        {other?.full_name || "Unknown"}
                                                    </span>
                                                    {conv.unread_count > 0 && (
                                                        <span
                                                            className="ml-2 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shrink-0"
                                                            style={{ backgroundColor: "var(--cyan)", color: "var(--text-inverse)" }}
                                                        >
                                                            {conv.unread_count}
                                                        </span>
                                                    )}
                                                </div>
                                                <p
                                                    className="text-xs truncate mt-0.5"
                                                    style={{ color: conv.unread_count > 0 ? "var(--text-primary)" : "var(--text-muted)" }}
                                                >
                                                    {conv.last_message?.content || "No messages yet"}
                                                </p>
                                                {conv.updated_at && (
                                                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                                        {new Date(conv.updated_at).toLocaleDateString()}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Message Thread */}
                    <div className="flex-1 flex flex-col">
                        {!activeConvId ? (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <p className="text-4xl mb-3">💬</p>
                                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                                        Select a conversation to start chatting
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                {activeConv && (
                                    <div
                                        className="px-4 py-3 flex items-center gap-3 shrink-0"
                                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                                    >
                                        <div
                                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                                            style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
                                        >
                                            {activeConv.participants[0]?.full_name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <Link
                                                href={`/profile/${activeConv.participants[0]?.id}`}
                                                className="text-sm font-medium hover:underline"
                                                style={{ color: "var(--text-primary)" }}
                                            >
                                                {activeConv.participants[0]?.full_name}
                                            </Link>
                                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                {activeConv.participants[0]?.headline || activeConv.participants[0]?.role}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Messages */}
                                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                                    {messages.map((msg) => {
                                        const isMe = msg.sender_id === user?.id;
                                        return (
                                            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                                <div
                                                    className="max-w-[70%] px-4 py-2.5 rounded-2xl"
                                                    style={{
                                                        backgroundColor: isMe ? "var(--cyan)" : "var(--bg-elevated)",
                                                        color: isMe ? "var(--text-inverse)" : "var(--text-primary)",
                                                        borderBottomRightRadius: isMe ? "4px" : "16px",
                                                        borderBottomLeftRadius: isMe ? "16px" : "4px",
                                                    }}
                                                >
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                    <p
                                                        className="text-[10px] mt-1"
                                                        style={{ opacity: 0.6 }}
                                                    >
                                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Compose */}
                                <div
                                    className="px-4 py-3 shrink-0"
                                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                                >
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={newMsg}
                                            onChange={(e) => setNewMsg(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                                            placeholder="Type a message..."
                                            className="flex-1 px-4 py-2.5 rounded-full text-sm outline-none"
                                            style={{
                                                backgroundColor: "var(--bg-elevated)",
                                                border: "1px solid var(--border-default)",
                                                color: "var(--text-primary)",
                                            }}
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={!newMsg.trim() || sending}
                                            className="px-4 py-2.5 rounded-full text-sm font-medium transition-opacity"
                                            style={{
                                                backgroundColor: "var(--cyan)",
                                                color: "var(--text-inverse)",
                                                opacity: !newMsg.trim() ? 0.5 : 1,
                                            }}
                                        >
                                            {sending ? "..." : "Send"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}
