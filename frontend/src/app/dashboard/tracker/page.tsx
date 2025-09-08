"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { GhostScore } from "@/components/ui/ghost-score";
import { SalaryRange } from "@/components/ui/salary-range";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

type ApplicationStatus =
  | "saved"
  | "applied"
  | "phone_screen"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "accepted";

interface Application {
  id: number;
  user_id: number;
  job_id: number;
  external_url: string;
  job_title: string;
  company: string;
  location: string;
  salary_min: number | null;
  salary_max: number | null;
  status: ApplicationStatus;
  ghost_score: number | null;
  company_trajectory: string | null;
  notes: string | null;
  applied_at: string | null;
  updated_at: string;
  created_at: string;
}

interface ApplicationStats {
  total: number;
  by_status: Record<string, number>;
}

type FilterTab = "all" | ApplicationStatus;

/* ── Constants ───────────────────────────────────────── */

const STATUSES: ApplicationStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "accepted",
];

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  phone_screen: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  accepted: "Accepted",
};

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "phone_screen", label: "Screening" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
];

const PIPELINE_STAGES: {
  status: ApplicationStatus;
  label: string;
  color: string;
  bg: string;
}[] = [
  { status: "saved", label: "Saved", color: "var(--text-muted)", bg: "rgba(58, 80, 112, 0.25)" },
  { status: "applied", label: "Applied", color: "var(--cyan)", bg: "var(--cyan-15)" },
  { status: "phone_screen", label: "Screen", color: "var(--cyan)", bg: "var(--cyan-15)" },
  { status: "interview", label: "Interview", color: "var(--green)", bg: "var(--green-15)" },
  { status: "offer", label: "Offer", color: "var(--gold)", bg: "var(--gold-15)" },
  { status: "rejected", label: "Rejected", color: "var(--red)", bg: "var(--red-15)" },
  { status: "withdrawn", label: "Withdrawn", color: "var(--text-muted)", bg: "rgba(58, 80, 112, 0.25)" },
  { status: "accepted", label: "Accepted", color: "var(--green)", bg: "var(--green-15)" },
];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  saved: "var(--text-muted)",
  applied: "var(--cyan)",
  phone_screen: "var(--cyan)",
  interview: "var(--green)",
  offer: "var(--gold)",
  rejected: "var(--red)",
  withdrawn: "var(--text-muted)",
  accepted: "var(--green)",
};

/* ── Helpers ─────────────────────────────────────────── */

function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

function companyLettermark(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function lettermarkColor(name: string): { bg: string; color: string } {
  const colors = [
    { bg: "var(--cyan-15)", color: "var(--cyan)" },
    { bg: "var(--green-15)", color: "var(--green)" },
    { bg: "var(--gold-15)", color: "var(--gold)" },
    { bg: "var(--purple-15)", color: "var(--purple)" },
    { bg: "var(--red-15)", color: "var(--red)" },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/* ── Icons ───────────────────────────────────────────── */

function TrackerIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="3" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="12" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="12" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5h6M5 8h6M5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M3.5 4l.75 9.5a1 1 0 001 .5h5.5a1 1 0 001-.5L12.5 4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ChevronDownIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
      <rect x="8" y="8" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="8" y="26" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="26" y="8" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="26" y="26" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}

/* ── Skeleton card ───────────────────────────────────── */

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start gap-4">
        <div className="shimmer w-10 h-10 rounded-lg shrink-0" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="flex-1 space-y-3">
          <div className="shimmer h-4 w-48 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="shimmer h-3 w-32 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="shimmer h-3 w-24 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        </div>
        <div className="shimmer h-6 w-20 rounded-full" style={{ backgroundColor: "var(--bg-elevated)" }} />
      </div>
    </div>
  );
}

/* ── Error toast ─────────────────────────────────────── */

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg animate-fade-up max-w-sm"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--red)",
        boxShadow: "var(--shadow-glow-red)",
      }}
      role="alert"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: "var(--red)" }}>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 rounded transition-colors"
        style={{ color: "var(--text-muted)" }}
        aria-label="Dismiss error"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ── Status dropdown ─────────────────────────────────── */

function StatusDropdown({
  currentStatus,
  onSelect,
}: {
  currentStatus: ApplicationStatus;
  onSelect: (status: ApplicationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-secondary)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change status"
      >
        Move to
        <ChevronDownIcon className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1 w-44 rounded-lg py-1 z-50 animate-fade-up"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-card)",
          }}
          role="listbox"
          aria-label="Select status"
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={s === currentStatus}
              className="w-full text-left px-3 py-2 text-sm transition-colors duration-150 flex items-center gap-2"
              style={{
                color: s === currentStatus ? STATUS_COLORS[s] : "var(--text-secondary)",
                backgroundColor: s === currentStatus ? "var(--bg-overlay)" : "transparent",
              }}
              onClick={() => {
                if (s !== currentStatus) onSelect(s);
                setOpen(false);
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_COLORS[s] }}
                aria-hidden="true"
              />
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Delete confirmation ─────────────────────────────── */

function DeleteConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-up"
      style={{
        backgroundColor: "var(--red-08)",
        border: "1px solid var(--red-15)",
      }}
    >
      <p className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
        Remove this application?
      </p>
      <Button variant="danger" size="sm" onClick={onConfirm}>
        Remove
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/* ── Main page component ─────────────────────────────── */

export default function TrackerPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Data state
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch applications and stats
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, appStats] = await Promise.all([
        api.get<Application[]>("/applications"),
        api.get<ApplicationStats>("/applications/stats"),
      ]);
      setApplications(apps);
      setStats(appStats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load applications";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // Optimistic status update
  const updateStatus = useCallback(
    async (id: number, newStatus: ApplicationStatus) => {
      const prev = applications.find((a) => a.id === id);
      if (!prev) return;

      // Optimistic update
      setApplications((apps) =>
        apps.map((a) =>
          a.id === id ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a
        )
      );

      // Update stats optimistically
      if (stats) {
        const newByStatus = { ...stats.by_status };
        newByStatus[prev.status] = Math.max(0, (newByStatus[prev.status] || 0) - 1);
        newByStatus[newStatus] = (newByStatus[newStatus] || 0) + 1;
        setStats({ ...stats, by_status: newByStatus });
      }

      try {
        await api.put<Application>(`/applications/${id}`, { status: newStatus });
      } catch (err: unknown) {
        // Revert on error
        setApplications((apps) =>
          apps.map((a) => (a.id === id ? prev : a))
        );
        if (stats) {
          setStats(stats);
        }
        const msg = err instanceof Error ? err.message : "Failed to update status";
        setError(msg);
      }
    },
    [applications, stats]
  );

  // Add note
  const submitNote = useCallback(
    async (id: number) => {
      if (!noteText.trim()) return;
      setNoteSubmitting(true);
      try {
        const updated = await api.post<Application>(`/applications/${id}/note`, {
          note: noteText.trim(),
        });
        setApplications((apps) =>
          apps.map((a) => (a.id === id ? updated : a))
        );
        setNoteText("");
        setExpandedNote(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to add note";
        setError(msg);
      } finally {
        setNoteSubmitting(false);
      }
    },
    [noteText]
  );

  // Delete application
  const deleteApplication = useCallback(
    async (id: number) => {
      setDeletingId(id);
      try {
        await api.delete(`/applications/${id}`);
        setApplications((apps) => apps.filter((a) => a.id !== id));
        if (stats) {
          const removed = applications.find((a) => a.id === id);
          if (removed) {
            const newByStatus = { ...stats.by_status };
            newByStatus[removed.status] = Math.max(0, (newByStatus[removed.status] || 0) - 1);
            setStats({ total: stats.total - 1, by_status: newByStatus });
          }
        }
        setDeleteConfirmId(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to delete application";
        setError(msg);
      } finally {
        setDeletingId(null);
      }
    },
    [applications, stats]
  );

  // Filtered applications
  const filtered =
    activeFilter === "all"
      ? applications
      : applications.filter((a) => a.status === activeFilter);

  // Auth guard render
  if (authLoading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-void)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="w-8 h-8 rounded-full live-pulse"
            style={{ backgroundColor: "var(--cyan)" }}
          />
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading...
          </span>
        </div>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────── */

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-void)" }}>
      <TopNav />

      {/* Error toast */}
      {error && <ErrorToast message={error} onDismiss={() => setError(null)} />}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24 md:pb-12">
        {/* ── Page header ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--cyan-15)", color: "var(--cyan)" }}
            >
              <TrackerIcon />
            </div>
            <div>
              <h1
                className="text-2xl font-display font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Application Tracker
              </h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Track and manage your job application pipeline
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-mono"
                style={{ color: "var(--text-muted)" }}
              >
                {stats.total} total
              </span>
            </div>
          )}
        </div>

        {/* ── Pipeline stats bar ───────────────────────── */}
        {stats && stats.total > 0 && (
          <div
            className="rounded-xl p-4 mb-6"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-lg font-display font-bold tabular-nums"
                style={{ color: "var(--text-primary)" }}
              >
                {stats.total}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Applications
              </span>
            </div>

            {/* Progress bar segments */}
            <div className="flex rounded-full h-2.5 overflow-hidden gap-0.5">
              {PIPELINE_STAGES.map((stage) => {
                const count = stats.by_status[stage.status] || 0;
                if (count === 0) return null;
                const pct = (count / stats.total) * 100;
                return (
                  <div
                    key={stage.status}
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: stage.color,
                      opacity: 0.8,
                    }}
                    title={`${stage.label}: ${count}`}
                    aria-label={`${stage.label}: ${count}`}
                  />
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {PIPELINE_STAGES.map((stage) => {
                const count = stats.by_status[stage.status] || 0;
                if (count === 0) return null;
                return (
                  <div key={stage.status} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: stage.color }}
                      aria-hidden="true"
                    />
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {stage.label}
                    </span>
                    <span
                      className="text-xs font-mono font-medium"
                      style={{ color: stage.color }}
                    >
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Filter tabs ──────────────────────────────── */}
        <div className="mb-6 -mx-4 px-4 overflow-x-auto scrollbar-none">
          <div
            className="inline-flex items-center gap-1 rounded-xl p-1 min-w-max"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
            }}
            role="tablist"
            aria-label="Filter by status"
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.id;
              const count =
                tab.id === "all"
                  ? stats?.total || 0
                  : stats?.by_status[tab.id] || 0;
              const tabColor =
                tab.id === "all" ? "var(--cyan)" : STATUS_COLORS[tab.id as ApplicationStatus];

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveFilter(tab.id)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap"
                  style={{
                    backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
                    color: isActive ? tabColor : "var(--text-secondary)",
                    borderBottom: isActive ? `2px solid ${tabColor}` : "2px solid transparent",
                  }}
                >
                  {tab.label}
                  {count > 0 && (() => {
                    const badgeBg = isActive
                      ? tab.id === "all"
                        ? "var(--cyan-15)"
                        : "var(--bg-overlay)"
                      : "var(--bg-overlay)";
                    return (
                      <span
                        className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: badgeBg,
                          color: isActive ? tabColor : "var(--text-muted)",
                        }}
                      >
                        {count}
                      </span>
                    );
                  })()}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Loading skeleton ─────────────────────────── */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* ── Applications list ────────────────────────── */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((app) => {
              const lm = lettermarkColor(app.company);
              const isDeleting = deletingId === app.id;
              const showDeleteConfirm = deleteConfirmId === app.id;
              const showNoteForm = expandedNote === app.id;

              return (
                <article
                  key={app.id}
                  className="rounded-xl p-5 transition-all duration-200 hover:translate-y-[-1px]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-card)",
                    opacity: isDeleting ? 0.5 : 1,
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Company lettermark */}
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0"
                      style={{ backgroundColor: lm.bg, color: lm.color }}
                      aria-hidden="true"
                    >
                      {companyLettermark(app.company)}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <h3
                            className="font-semibold text-base truncate"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {app.job_title}
                          </h3>
                          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            {app.company}
                          </p>
                        </div>
                        <div className="shrink-0">
                          <StatusBadge status={app.status} />
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        {app.location && (
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <MapPinIcon />
                            {app.location}
                          </span>
                        )}

                        {(app.salary_min || app.salary_max) && (
                          <SalaryRange min={app.salary_min} max={app.salary_max} />
                        )}

                        {app.ghost_score != null && (
                          <GhostScore score={app.ghost_score} showLabel size="sm" />
                        )}

                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {app.applied_at
                            ? `Applied ${relativeTime(app.applied_at)}`
                            : `Updated ${relativeTime(app.updated_at)}`}
                        </span>
                      </div>

                      {/* Notes preview */}
                      {app.notes && !showNoteForm && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <NoteIcon />
                          <p
                            className="text-xs truncate flex-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {app.notes.split("\n")[0]}
                          </p>
                        </div>
                      )}

                      {/* Action bar */}
                      <div
                        className="flex items-center gap-2 mt-3 pt-3 flex-wrap"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <StatusDropdown
                          currentStatus={app.status}
                          onSelect={(s) => updateStatus(app.id, s)}
                        />

                        <button
                          type="button"
                          onClick={() => {
                            if (showNoteForm) {
                              setExpandedNote(null);
                              setNoteText("");
                            } else {
                              setExpandedNote(app.id);
                              setNoteText("");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
                          style={{
                            backgroundColor: showNoteForm ? "var(--cyan-08)" : "var(--bg-elevated)",
                            border: `1px solid ${showNoteForm ? "var(--cyan-15)" : "var(--border-subtle)"}`,
                            color: showNoteForm ? "var(--cyan)" : "var(--text-secondary)",
                          }}
                          aria-label="Add note"
                        >
                          <NoteIcon />
                          Add Note
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(showDeleteConfirm ? null : app.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ml-auto"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                          aria-label="Delete application"
                        >
                          <TrashIcon />
                        </button>

                        {app.external_url && (
                          <a
                            href={app.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium transition-colors duration-200"
                            style={{ color: "var(--cyan)" }}
                          >
                            View listing
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                              <path d="M3 1h6v6M9 1L4 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </a>
                        )}
                      </div>

                      {/* Delete confirmation */}
                      {showDeleteConfirm && (
                        <div className="mt-3">
                          <DeleteConfirm
                            onConfirm={() => deleteApplication(app.id)}
                            onCancel={() => setDeleteConfirmId(null)}
                          />
                        </div>
                      )}

                      {/* Note form */}
                      {showNoteForm && (
                        <div className="mt-3 animate-fade-up">
                          <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={3}
                            placeholder="Add a note about this application..."
                            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-primary)",
                            }}
                            autoFocus
                          />
                          <div className="flex items-center gap-2 mt-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setExpandedNote(null);
                                setNoteText("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              loading={noteSubmitting}
                              onClick={() => submitNote(app.id)}
                              disabled={!noteText.trim()}
                            >
                              Save Note
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <EmptyIcon />
            <div className="text-center">
              {activeFilter === "all" ? (
                <>
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No applications tracked yet
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Browse jobs to start tracking your applications.
                  </p>
                  <Link
                    href="/seeker"
                    className="inline-flex items-center gap-1 text-sm font-medium mt-4 transition-colors duration-200"
                    style={{ color: "var(--cyan)" }}
                  >
                    Browse jobs
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </>
              ) : (
                <>
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No {STATUS_LABELS[activeFilter as ApplicationStatus].toLowerCase()} applications
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Applications with this status will appear here.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
