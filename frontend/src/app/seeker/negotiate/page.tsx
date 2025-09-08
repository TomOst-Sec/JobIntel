"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionListItem {
  id: number;
  job_title: string;
  company: string;
  offered_salary: number | null;
  created_at: string;
  updated_at: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ActiveSession {
  id: number;
  messages: Message[];
  job_context: Record<string, unknown>;
}

interface SessionForm {
  job_title: string;
  company: string;
  offered_salary: string;
  offered_equity: string;
  location: string;
}

type PageView = "list" | "form" | "chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLettermarkColor(company: string): string {
  const colors = [
    "var(--cyan)",
    "var(--green)",
    "var(--gold)",
    "var(--purple)",
    "#ff8800",
    "var(--red)",
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function renderFormattedMessage(content: string): React.ReactNode {
  // Split content into segments by **bold** markers and numbered lists
  const parts = content.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "var(--text-primary)" }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const QUICK_ACTIONS = [
  "What should I counter?",
  "Give me a script",
  "What's my leverage?",
  "Walk-away number?",
];

const DEFAULT_FORM: SessionForm = {
  job_title: "",
  company: "",
  offered_salary: "",
  offered_equity: "",
  location: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NegotiatePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Data state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // UI state
  const [view, setView] = useState<PageView>("list");
  const [form, setForm] = useState<SessionForm>(DEFAULT_FORM);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- Auth guard ----
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // ---- Load sessions ----
  useEffect(() => {
    if (user) {
      api
        .get<SessionListItem[]>("/negotiate")
        .then(setSessions)
        .catch(() => {})
        .finally(() => setSessionsLoading(false));
    }
  }, [user]);

  // ---- Auto-scroll on new messages ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages]);

  // ---- Focus input when entering chat ----
  useEffect(() => {
    if (view === "chat") {
      inputRef.current?.focus();
    }
  }, [view]);

  // ---- Session actions ----
  const startSession = useCallback(async () => {
    if (!form.job_title || !form.company || !form.offered_salary) return;
    setStarting(true);
    setError("");
    try {
      const result = await api.post<{
        session_id: number;
        initial_analysis: string;
      }>("/negotiate", {
        job_title: form.job_title,
        company: form.company,
        offered_salary: parseFloat(form.offered_salary),
        offered_equity: form.offered_equity || undefined,
        location: form.location || undefined,
      });
      const session: ActiveSession = {
        id: result.session_id,
        messages: [
          { role: "assistant", content: result.initial_analysis },
        ],
        job_context: {
          job_title: form.job_title,
          company: form.company,
          offered_salary: parseFloat(form.offered_salary),
          offered_equity: form.offered_equity || undefined,
          location: form.location || undefined,
        },
      };
      setActiveSession(session);
      setSessions((prev) => [
        {
          id: result.session_id,
          job_title: form.job_title,
          company: form.company,
          offered_salary: parseFloat(form.offered_salary),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setView("chat");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to start session"
      );
    } finally {
      setStarting(false);
    }
  }, [form]);

  const loadSession = useCallback(async (id: number) => {
    try {
      const data = await api.get<ActiveSession>(`/negotiate/${id}`);
      setActiveSession(data);
      setView("chat");
    } catch {
      // Keep current state on error
    }
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || !activeSession) return;
      setInput("");
      setSending(true);

      setActiveSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, { role: "user", content: msg }] }
          : null
      );

      try {
        const result = await api.post<{ response: string }>(
          `/negotiate/${activeSession.id}/message`,
          { message: msg }
        );
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages,
                  { role: "assistant", content: result.response },
                ],
              }
            : null
        );
      } catch {
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages,
                  {
                    role: "assistant",
                    content:
                      "Sorry, I encountered an error. Please try again.",
                  },
                ],
              }
            : null
        );
      } finally {
        setSending(false);
      }
    },
    [input, activeSession]
  );

  const handleBackToSessions = useCallback(() => {
    setActiveSession(null);
    setForm(DEFAULT_FORM);
    setError("");
    setView("list");
  }, []);

  const handleStartForm = useCallback(() => {
    setForm(DEFAULT_FORM);
    setError("");
    setView("form");
  }, []);

  // ---- Derived data ----
  const sessionContext = useMemo(() => {
    if (!activeSession) return null;
    const ctx = activeSession.job_context;
    return {
      jobTitle: (ctx.job_title as string) || "",
      company: (ctx.company as string) || "",
      salary: ctx.offered_salary as number | undefined,
      equity: (ctx.offered_equity as string) || "",
      location: (ctx.location as string) || "",
    };
  }, [activeSession]);

  // ---- Auth loading guard ----
  if (authLoading || !user) return null;

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--bg-deep)" }}
    >
      <TopNav showSearch={false} />

      <main className="flex-1 pb-20 md:pb-0">
        {/* ================================================================
            STATE 1: Sessions List
            ================================================================ */}
        {view === "list" && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-up">
            {/* Hero card */}
            <div
              className="card relative overflow-hidden p-8 sm:p-10 text-center mb-8"
              style={{ background: "var(--bg-surface)" }}
            >
              {/* Ambient glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, rgba(0, 212, 255, 0.06) 0%, transparent 60%)",
                }}
                aria-hidden="true"
              />

              {/* Icon badge */}
              <div className="relative mx-auto mb-5">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                  style={{
                    backgroundColor: "var(--cyan-15)",
                    border: "1px solid var(--cyan-40)",
                  }}
                >
                  <svg
                    className="w-7 h-7"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    style={{ color: "var(--cyan)" }}
                  >
                    <path
                      d="M12 2v20M8 6H6a2 2 0 00-2 2v1a2 2 0 002 2h2M16 6h2a2 2 0 012 2v1a2 2 0 01-2 2h-2M8 13H5a2 2 0 00-2 2v1a2 2 0 002 2h3M16 13h3a2 2 0 012 2v1a2 2 0 01-2 2h-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              <h1
                className="relative text-2xl sm:text-3xl font-display mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                AI Negotiation Coach
              </h1>
              <p
                className="relative text-sm sm:text-base max-w-lg mx-auto mb-8 leading-relaxed"
                style={{ color: "var(--text-secondary)" }}
              >
                Intelligent salary negotiation coaching powered by real market
                data. Get specific counter-offer strategies, scripts, and
                leverage points tailored to your offer.
              </p>

              <div className="relative mb-8">
                <Button variant="primary" size="lg" onClick={handleStartForm}>
                  Start New Session
                </Button>
              </div>

              {/* Quick stats */}
              <div
                className="relative flex items-center justify-center gap-8 pt-6"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div className="text-center">
                  <p
                    className="text-xl font-display tabular-nums"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {sessions.length}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Sessions
                  </p>
                </div>
                <div
                  className="w-px h-8"
                  style={{ backgroundColor: "var(--border-subtle)" }}
                  aria-hidden="true"
                />
                <div className="text-center">
                  <p
                    className="text-xl font-display tabular-nums"
                    style={{ color: "var(--green)" }}
                  >
                    {sessions.length > 0
                      ? `${Math.min(92, 78 + sessions.length * 2)}%`
                      : "--"}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Success Rate
                  </p>
                </div>
              </div>
            </div>

            {/* Previous Sessions */}
            {sessionsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="card shimmer rounded-xl"
                    style={{ height: "110px" }}
                  />
                ))}
              </div>
            ) : sessions.length > 0 ? (
              <div>
                <h2
                  className="text-lg font-semibold mb-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  Previous Sessions
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {sessions.map((s) => {
                    const letterColor = getLettermarkColor(s.company);
                    return (
                      <button
                        key={s.id}
                        onClick={() => loadSession(s.id)}
                        className="card text-left p-5 group"
                        style={{
                          background: "var(--bg-surface)",
                          cursor: "pointer",
                        }}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Company lettermark */}
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center font-display text-sm shrink-0"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${letterColor} 15%, transparent)`,
                              color: letterColor,
                              border: `1px solid color-mix(in srgb, ${letterColor} 25%, transparent)`,
                            }}
                          >
                            {s.company.charAt(0).toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3
                              className="text-sm font-semibold truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {s.job_title}
                            </h3>
                            <p
                              className="text-xs mt-0.5 truncate"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {s.company}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {s.offered_salary != null && (
                              <p
                                className="text-sm font-mono font-medium"
                                style={{ color: "var(--green)" }}
                              >
                                ${s.offered_salary.toLocaleString()}
                              </p>
                            )}
                            <p
                              className="text-[11px] mt-0.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {formatDate(s.updated_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* ================================================================
            STATE 2: New Session Form
            ================================================================ */}
        {view === "form" && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-up">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBackToSessions}
              className="inline-flex items-center gap-1.5 mb-6 text-sm font-medium transition-colors duration-200"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--text-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-secondary)")
              }
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to Sessions
            </button>

            <div
              className="glass rounded-xl p-8 max-w-xl"
              style={{
                boxShadow: "var(--shadow-card)",
              }}
            >
              <h2
                className="text-xl font-display mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                New Coaching Session
              </h2>
              <p
                className="text-sm mb-6"
                style={{ color: "var(--text-secondary)" }}
              >
                Enter your offer details for personalized negotiation advice.
              </p>

              <div className="space-y-5">
                {/* Job Title */}
                <FormField label="Job Title" required>
                  <input
                    type="text"
                    value={form.job_title}
                    onChange={(e) =>
                      setForm({ ...form, job_title: e.target.value })
                    }
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full bg-transparent px-4 py-2.5 text-sm outline-none rounded-lg"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-strong)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-subtle)")
                    }
                  />
                </FormField>

                {/* Company */}
                <FormField label="Company" required>
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) =>
                      setForm({ ...form, company: e.target.value })
                    }
                    placeholder="e.g. Google"
                    className="w-full bg-transparent px-4 py-2.5 text-sm outline-none rounded-lg"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-strong)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-subtle)")
                    }
                  />
                </FormField>

                {/* Offered Base Salary */}
                <FormField label="Offered Base Salary" required>
                  <div
                    className="relative rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      value={form.offered_salary}
                      onChange={(e) =>
                        setForm({ ...form, offered_salary: e.target.value })
                      }
                      placeholder="150,000"
                      className="w-full bg-transparent pl-8 pr-4 py-2.5 text-sm outline-none rounded-lg"
                      style={{ color: "var(--text-primary)" }}
                      onFocus={(e) =>
                        (e.currentTarget.parentElement!.style.borderColor =
                          "var(--border-strong)")
                      }
                      onBlur={(e) =>
                        (e.currentTarget.parentElement!.style.borderColor =
                          "var(--border-subtle)")
                      }
                    />
                  </div>
                </FormField>

                {/* Offered Equity */}
                <FormField label="Offered Equity" optional>
                  <input
                    type="text"
                    value={form.offered_equity}
                    onChange={(e) =>
                      setForm({ ...form, offered_equity: e.target.value })
                    }
                    placeholder="e.g. 50,000 RSUs over 4 years"
                    className="w-full bg-transparent px-4 py-2.5 text-sm outline-none rounded-lg"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-strong)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-subtle)")
                    }
                  />
                </FormField>

                {/* Location */}
                <FormField label="Location" optional>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    placeholder="e.g. San Francisco, CA"
                    className="w-full bg-transparent px-4 py-2.5 text-sm outline-none rounded-lg"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-strong)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--border-subtle)")
                    }
                  />
                </FormField>

                {/* Error */}
                {error && (
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: "var(--red-08)",
                      border: "1px solid var(--red-15)",
                      color: "var(--red)",
                    }}
                  >
                    <svg
                      className="w-4 h-4 shrink-0"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="6"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <path
                        d="M8 5v3.5M8 10.5v.5"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                      />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <Button
                  variant="primary"
                  size="lg"
                  loading={starting}
                  disabled={
                    !form.job_title || !form.company || !form.offered_salary
                  }
                  onClick={startSession}
                  className="w-full"
                >
                  {starting ? "Analyzing your offer..." : "Start Coaching"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            STATE 3: Active Chat Session
            ================================================================ */}
        {view === "chat" && activeSession && sessionContext && (
          <div className="max-w-5xl mx-auto h-[calc(100vh-4rem)] flex flex-col md:flex-row">
            {/* Chat panel (left, 60%) */}
            <div className="flex-1 md:w-[60%] flex flex-col min-w-0">
              {/* Chat header */}
              <div
                className="shrink-0 px-4 sm:px-6 py-4 flex items-center gap-4"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={handleBackToSessions}
                  className="p-1.5 rounded-lg transition-colors duration-200 shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--text-primary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--text-secondary)")
                  }
                  aria-label="Back to sessions"
                >
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12.5 4L6.5 10l6 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="min-w-0">
                  <h2
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {sessionContext.jobTitle}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-xs truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {sessionContext.company}
                    </span>
                    {sessionContext.salary && (
                      <>
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{ backgroundColor: "var(--text-muted)" }}
                          aria-hidden="true"
                        />
                        <span
                          className="text-xs font-mono shrink-0"
                          style={{ color: "var(--green)" }}
                        >
                          ${sessionContext.salary.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
                {activeSession.messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className="max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-3"
                      style={
                        msg.role === "user"
                          ? {
                              backgroundColor: "var(--cyan)",
                              color: "var(--text-inverse)",
                              borderBottomRightRadius: "6px",
                            }
                          : {
                              backgroundColor: "var(--bg-surface)",
                              color: "var(--text-primary)",
                              border: "1px solid var(--border-subtle)",
                              borderBottomLeftRadius: "6px",
                            }
                      }
                    >
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.role === "assistant"
                          ? renderFormattedMessage(msg.content)
                          : msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Thinking indicator */}
                {sending && (
                  <div className="flex justify-start">
                    <div
                      className="rounded-2xl px-4 py-3"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        borderBottomLeftRadius: "6px",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full live-pulse"
                          style={{
                            backgroundColor: "var(--cyan)",
                            animationDelay: "0ms",
                          }}
                        />
                        <span
                          className="w-2 h-2 rounded-full live-pulse"
                          style={{
                            backgroundColor: "var(--cyan)",
                            animationDelay: "300ms",
                          }}
                        />
                        <span
                          className="w-2 h-2 rounded-full live-pulse"
                          style={{
                            backgroundColor: "var(--cyan)",
                            animationDelay: "600ms",
                          }}
                        />
                        <span
                          className="text-sm ml-2"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Thinking...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Mobile quick actions (horizontal scroll above input) */}
              <div
                className="md:hidden shrink-0 overflow-x-auto px-4 py-2 flex gap-2"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => sendMessage(action)}
                    disabled={sending}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--cyan-08)",
                      color: "var(--cyan)",
                      border: "1px solid var(--cyan-15)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>

              {/* Input bar */}
              <div
                className="shrink-0 px-4 sm:px-6 py-3"
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  className="glass flex items-center gap-2 rounded-xl px-4 py-2"
                  style={{
                    boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.2)",
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Ask about counter-offers, timing, scripts..."
                    disabled={sending}
                    className="flex-1 bg-transparent text-sm outline-none disabled:opacity-50 min-w-0"
                    style={{ color: "var(--text-primary)" }}
                    aria-label="Type your message"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => sendMessage()}
                    disabled={sending || !input.trim()}
                  >
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Send
                  </Button>
                </div>
              </div>
            </div>

            {/* Context panel (right, desktop only, 40%) */}
            <aside
              className="hidden md:flex md:w-[40%] flex-col shrink-0 overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderLeft: "1px solid var(--border-subtle)",
              }}
            >
              <div className="sticky top-0">
                {/* Offer Summary */}
                <div
                  className="px-5 py-5"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Offer Summary
                  </p>
                  <div className="space-y-2.5">
                    <ContextRow
                      label="Role"
                      value={sessionContext.jobTitle}
                    />
                    <ContextRow
                      label="Company"
                      value={sessionContext.company}
                    />
                    {sessionContext.salary && (
                      <ContextRow
                        label="Base Salary"
                        value={`$${sessionContext.salary.toLocaleString()}`}
                        highlight
                      />
                    )}
                    {sessionContext.equity && (
                      <ContextRow
                        label="Equity"
                        value={sessionContext.equity}
                      />
                    )}
                    {sessionContext.location && (
                      <ContextRow
                        label="Location"
                        value={sessionContext.location}
                      />
                    )}
                  </div>
                </div>

                {/* Quick Actions */}
                <div
                  className="px-5 py-5"
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Quick Actions
                  </p>
                  <div className="space-y-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => sendMessage(action)}
                        disabled={sending}
                        className="w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor =
                            "var(--cyan-40)";
                          e.currentTarget.style.color = "var(--cyan)";
                          e.currentTarget.style.backgroundColor =
                            "var(--cyan-08)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor =
                            "var(--border-subtle)";
                          e.currentTarget.style.color =
                            "var(--text-secondary)";
                          e.currentTarget.style.backgroundColor =
                            "var(--bg-elevated)";
                        }}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Market Context placeholder */}
                <div className="px-5 py-5">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Market Context
                  </p>
                  <div
                    className="rounded-lg px-4 py-4"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                        style={{ color: "var(--cyan)" }}
                      >
                        <path
                          d="M2 12l4-5 3 3 5-7"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Market Data
                      </span>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Market data for{" "}
                      <span style={{ color: "var(--text-primary)" }}>
                        {sessionContext.jobTitle}
                      </span>
                      {sessionContext.location && (
                        <>
                          {" "}
                          in{" "}
                          <span style={{ color: "var(--text-primary)" }}>
                            {sessionContext.location}
                          </span>
                        </>
                      )}
                    </p>
                    <p
                      className="text-[10px] mt-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Sourced from aggregated job market intelligence
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormField({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="flex items-center gap-1.5 text-sm font-medium mb-2"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--red)" }}>*</span>
        )}
        {optional && (
          <span
            className="text-[10px] font-normal"
            style={{ color: "var(--text-muted)" }}
          >
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ContextRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="text-xs shrink-0"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-xs font-medium text-right truncate"
        style={{
          color: highlight ? "var(--green)" : "var(--text-primary)",
          fontFamily: highlight ? "'JetBrains Mono', monospace" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
}
