"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { IntelligenceCard } from "@/components/ui/intelligence-card";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface Alert {
  id: number;
  alert_type: string;
  conditions: Record<string, unknown>;
  delivery: string;
  is_active: boolean;
}

interface PersonalFeedItem {
  id: number;
  source: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: string;
}

interface PublicFeedItem {
  id: number;
  event_type: string;
  company: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_public: boolean;
  created_at: string;
}

type MainTab = "feed" | "alerts";
type FeedSubTab = "personal" | "public";

type AlertTypeKey =
  | "company_scaling"
  | "new_role"
  | "salary_change"
  | "skill_trending"
  | "ghost_detected"
  | "layoff_risk";

type DeliveryMethod = "in_app" | "email" | "both";

/* ── Constants ───────────────────────────────────────── */

const ALERT_TYPES: { value: AlertTypeKey; label: string; color: string; bg: string }[] = [
  { value: "company_scaling", label: "Company Scaling", color: "var(--green)", bg: "var(--green-15)" },
  { value: "new_role", label: "New Role Posted", color: "var(--cyan)", bg: "var(--cyan-15)" },
  { value: "salary_change", label: "Salary Change", color: "var(--gold)", bg: "var(--gold-15)" },
  { value: "skill_trending", label: "Skill Trending", color: "var(--purple)", bg: "var(--purple-15)" },
  { value: "ghost_detected", label: "Ghost Detected", color: "var(--red)", bg: "var(--red-15)" },
  { value: "layoff_risk", label: "Layoff Risk", color: "var(--red)", bg: "var(--red-15)" },
];

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
];

const EVENT_TYPE_MAP: Record<string, "layoff" | "ipo" | "ghost" | "scaling" | "salary" | "market"> = {
  layoff: "layoff",
  layoff_risk: "layoff",
  ipo: "ipo",
  ipo_signal: "ipo",
  ghost: "ghost",
  ghost_detected: "ghost",
  scaling: "scaling",
  company_scaling: "scaling",
  salary: "salary",
  salary_change: "salary",
  market: "market",
  new_role: "market",
  skill_trending: "market",
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

function formatConditions(conditions: Record<string, unknown>): string {
  const parts: string[] = [];
  if (conditions.company) parts.push(`Company: ${conditions.company}`);
  if (conditions.keyword) parts.push(`Keyword: ${conditions.keyword}`);
  if (conditions.min_postings) parts.push(`Min postings: ${conditions.min_postings}`);
  if (conditions.role) parts.push(`Role: ${conditions.role}`);
  if (conditions.skill) parts.push(`Skill: ${conditions.skill}`);
  if (conditions.location) parts.push(`Location: ${conditions.location}`);
  if (conditions.threshold) parts.push(`Threshold: ${conditions.threshold}`);
  if (parts.length === 0) return "All matching events";
  return parts.join(" / ");
}

function alertTypeConfig(type: string): { label: string; color: string; bg: string } {
  const found = ALERT_TYPES.find((t) => t.value === type);
  if (found) return found;
  return { label: type.replace(/_/g, " "), color: "var(--text-secondary)", bg: "var(--bg-overlay)" };
}

/* ── Icons ───────────────────────────────────────────── */

function IntelIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2a8 8 0 018 8c0 3.5-1.5 5.5-2 6H4c-.5-.5-2-2.5-2-6a8 8 0 018-8z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 18h4M10 2v3M14.5 5.5l-2 2M5.5 5.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5a5 5 0 015 5c0 2.9 1.2 4.5 1.6 5H1.4c.4-.5 1.6-2.1 1.6-5a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="5" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 5V3.5A1.5 1.5 0 016.5 2h3A1.5 1.5 0 0111 3.5V5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 8.5h12" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 4h14M3 8h14M3 12h10M3 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AlertsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2a6 6 0 016 6c0 3.5 1.5 5.5 2 6H2c.5-.5 2-2.5 2-6a6 6 0 016-6z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 16.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function EmptyIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
      <circle cx="24" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M24 8v4M24 28v4M12 20h4M32 20h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 38h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 42h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Skeleton ────────────────────────────────────────── */

function SkeletonItem() {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="shimmer w-8 h-8 rounded-lg shrink-0" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="flex-1 space-y-3">
          <div className="shimmer h-4 w-48 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="shimmer h-3 w-full rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
          <div className="shimmer h-3 w-32 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        </div>
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

/* ── Toggle switch ───────────────────────────────────── */

function ToggleSwitch({
  active,
  onToggle,
  disabled,
}: {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      disabled={disabled}
      className="relative inline-flex items-center h-6 w-11 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cyan)] disabled:opacity-50"
      style={{
        backgroundColor: active ? "var(--cyan)" : "var(--bg-overlay)",
      }}
    >
      <span
        className="inline-block w-4 h-4 rounded-full transition-transform duration-200"
        style={{
          backgroundColor: active ? "var(--text-inverse)" : "var(--text-muted)",
          transform: active ? "translateX(24px)" : "translateX(4px)",
        }}
        aria-hidden="true"
      />
    </button>
  );
}

/* ── Main page component ─────────────────────────────── */

export default function AlertsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Main tab state
  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const [feedSubTab, setFeedSubTab] = useState<FeedSubTab>("personal");

  // Feed state
  const [personalFeed, setPersonalFeed] = useState<PersonalFeedItem[]>([]);
  const [publicFeed, setPublicFeed] = useState<PublicFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const personalFetchedRef = useRef(false);
  const publicFetchedRef = useRef(false);

  // Alerts state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const alertsFetchedRef = useRef(false);

  // Alert creation form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formType, setFormType] = useState<AlertTypeKey>("company_scaling");
  const [formKeyword, setFormKeyword] = useState("");
  const [formDelivery, setFormDelivery] = useState<DeliveryMethod>("both");
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Toggling state
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch personal feed
  useEffect(() => {
    if (mainTab === "feed" && feedSubTab === "personal" && !personalFetchedRef.current && user) {
      personalFetchedRef.current = true;
      setFeedLoading(true);
      api
        .get<PersonalFeedItem[]>("/feed/personal")
        .then(setPersonalFeed)
        .catch((err) => setError(err.message || "Failed to load personal feed"))
        .finally(() => setFeedLoading(false));
    }
  }, [mainTab, feedSubTab, user]);

  // Fetch public feed
  useEffect(() => {
    if (mainTab === "feed" && feedSubTab === "public" && !publicFetchedRef.current && user) {
      publicFetchedRef.current = true;
      setFeedLoading(true);
      api
        .get<PublicFeedItem[]>("/feed")
        .then(setPublicFeed)
        .catch((err) => setError(err.message || "Failed to load public feed"))
        .finally(() => setFeedLoading(false));
    }
  }, [mainTab, feedSubTab, user]);

  // Fetch alerts
  useEffect(() => {
    if (mainTab === "alerts" && !alertsFetchedRef.current && user) {
      alertsFetchedRef.current = true;
      setAlertsLoading(true);
      api
        .get<Alert[]>("/alerts")
        .then(setAlerts)
        .catch((err) => setError(err.message || "Failed to load alerts"))
        .finally(() => setAlertsLoading(false));
    }
  }, [mainTab, user]);

  // Create alert
  const createAlert = useCallback(async () => {
    setCreating(true);
    try {
      const conditions: Record<string, unknown> = {};
      if (formKeyword.trim()) {
        if (["company_scaling", "ghost_detected", "layoff_risk"].includes(formType)) {
          conditions.company = formKeyword.trim();
        } else if (formType === "skill_trending") {
          conditions.skill = formKeyword.trim();
        } else {
          conditions.keyword = formKeyword.trim();
        }
      }
      if (formType === "company_scaling") {
        conditions.min_postings = 3;
      }

      const alert = await api.post<Alert>("/alerts", {
        alert_type: formType,
        conditions,
        delivery: formDelivery,
      });
      setAlerts((prev) => [alert, ...prev]);
      setShowCreateForm(false);
      setFormKeyword("");
      setFormType("company_scaling");
      setFormDelivery("both");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create alert";
      setError(msg);
    } finally {
      setCreating(false);
    }
  }, [formType, formKeyword, formDelivery]);

  // Toggle alert active/inactive
  const toggleAlert = useCallback(
    async (id: number) => {
      const alert = alerts.find((a) => a.id === id);
      if (!alert) return;

      setTogglingId(id);
      // Optimistic update
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !a.is_active } : a))
      );

      try {
        await api.put(`/alerts/${id}`, { is_active: !alert.is_active });
      } catch (err: unknown) {
        // Revert
        setAlerts((prev) =>
          prev.map((a) => (a.id === id ? alert : a))
        );
        const msg = err instanceof Error ? err.message : "Failed to update alert";
        setError(msg);
      } finally {
        setTogglingId(null);
      }
    },
    [alerts]
  );

  // Delete alert
  const deleteAlert = useCallback(
    async (id: number) => {
      try {
        await api.delete(`/alerts/${id}`);
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setDeleteConfirmId(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to delete alert";
        setError(msg);
      }
    },
    []
  );

  // Map event_type to IntelligenceCard type
  function mapEventType(eventType: string): "layoff" | "ipo" | "ghost" | "scaling" | "salary" | "market" {
    return EVENT_TYPE_MAP[eventType] || "market";
  }

  // Source icon + accent for personal feed
  function sourceConfig(source: string): { icon: React.ReactNode; color: string; bg: string } {
    if (source === "alert") {
      return {
        icon: <BellIcon className="w-4 h-4" />,
        color: "var(--cyan)",
        bg: "var(--cyan-15)",
      };
    }
    if (source === "application") {
      return {
        icon: <BriefcaseIcon className="w-4 h-4" />,
        color: "var(--green)",
        bg: "var(--green-15)",
      };
    }
    return {
      icon: <BellIcon className="w-4 h-4" />,
      color: "var(--text-secondary)",
      bg: "var(--bg-overlay)",
    };
  }

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
              <IntelIcon />
            </div>
            <div>
              <h1
                className="text-2xl font-display font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Intelligence Hub
              </h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Activity feed and smart alert management
              </p>
            </div>
          </div>
        </div>

        {/* ── Main tab buttons ─────────────────────────── */}
        <div
          className="inline-flex items-center gap-1 rounded-xl p-1 mb-8"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
          role="tablist"
          aria-label="Intelligence views"
        >
          {[
            { id: "feed" as MainTab, label: "Activity Feed", icon: <FeedIcon /> },
            { id: "alerts" as MainTab, label: "Smart Alerts", icon: <AlertsIcon /> },
          ].map((tab) => {
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setMainTab(tab.id)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  backgroundColor: isActive ? "var(--cyan)" : "transparent",
                  color: isActive ? "var(--text-inverse)" : "var(--text-secondary)",
                  boxShadow: isActive ? "var(--shadow-glow-cyan)" : "none",
                }}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Activity Feed tab ────────────────────────── */}
        {mainTab === "feed" && (
          <section id="panel-feed" role="tabpanel" aria-label="Activity Feed">
            {/* Sub-tabs: Personal / Public */}
            <div className="mb-6">
              <div
                className="inline-flex items-center gap-1 rounded-lg p-0.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
                role="tablist"
                aria-label="Feed type"
              >
                {[
                  { id: "personal" as FeedSubTab, label: "Personal" },
                  { id: "public" as FeedSubTab, label: "Public" },
                ].map((sub) => {
                  const isActive = feedSubTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setFeedSubTab(sub.id)}
                      className="px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-200"
                      style={{
                        backgroundColor: isActive ? "var(--bg-elevated)" : "transparent",
                        color: isActive ? "var(--cyan)" : "var(--text-secondary)",
                      }}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Loading skeleton */}
            {feedLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonItem key={i} />
                ))}
              </div>
            )}

            {/* Personal feed */}
            {!feedLoading && feedSubTab === "personal" && (
              <>
                {personalFeed.length > 0 ? (
                  <div className="space-y-3">
                    {personalFeed.map((item) => {
                      const src = sourceConfig(item.source);
                      return (
                        <article
                          key={item.id}
                          className="rounded-xl p-4 transition-all duration-200 hover:translate-y-[-1px]"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderLeft: `3px solid ${src.color}`,
                            boxShadow: "var(--shadow-card)",
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                              style={{ backgroundColor: src.bg, color: src.color }}
                            >
                              {src.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3
                                  className="text-sm font-semibold leading-snug truncate"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {item.title}
                                </h3>
                                <span
                                  className="text-xs shrink-0"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {relativeTime(item.created_at)}
                                </span>
                              </div>
                              <p
                                className="text-sm mt-1 leading-relaxed"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {item.body}
                              </p>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <EmptyIcon />
                    <div className="text-center">
                      <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                        No activity yet
                      </p>
                      <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                        Personal feed items will appear here as alerts trigger and applications update.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Public feed */}
            {!feedLoading && feedSubTab === "public" && (
              <>
                {publicFeed.length > 0 ? (
                  <div className="space-y-3">
                    {publicFeed.map((item) => (
                      <IntelligenceCard
                        key={item.id}
                        type={mapEventType(item.event_type)}
                        title={item.title}
                        body={item.body}
                        timestamp={item.created_at}
                        company={item.company}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <EmptyIcon />
                    <div className="text-center">
                      <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                        No activity yet
                      </p>
                      <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                        Public market events will appear here as they are detected.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Smart Alerts tab ─────────────────────────── */}
        {mainTab === "alerts" && (
          <section id="panel-alerts" role="tabpanel" aria-label="Smart Alerts">
            {/* Create alert button */}
            <div className="mb-6">
              <Button
                variant={showCreateForm ? "secondary" : "primary"}
                size="md"
                onClick={() => setShowCreateForm(!showCreateForm)}
              >
                {showCreateForm ? (
                  "Cancel"
                ) : (
                  <>
                    <PlusIcon />
                    Create Alert
                  </>
                )}
              </Button>
            </div>

            {/* Alert creation form */}
            {showCreateForm && (
              <div
                className="rounded-xl p-6 mb-6 animate-fade-up"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <h3
                  className="text-base font-semibold mb-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  New Smart Alert
                </h3>

                <div className="space-y-4">
                  {/* Alert type */}
                  <div>
                    <label
                      className="block text-sm font-medium mb-1.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Alert Type
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value as AlertTypeKey)}
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors duration-200"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {ALERT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Company / keyword input */}
                  <div>
                    <label
                      className="block text-sm font-medium mb-1.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {["company_scaling", "ghost_detected", "layoff_risk"].includes(formType)
                        ? "Company"
                        : formType === "skill_trending"
                          ? "Skill"
                          : "Keyword"}
                    </label>
                    <input
                      type="text"
                      value={formKeyword}
                      onChange={(e) => setFormKeyword(e.target.value)}
                      placeholder={
                        ["company_scaling", "ghost_detected", "layoff_risk"].includes(formType)
                          ? "e.g., OpenAI"
                          : formType === "skill_trending"
                            ? "e.g., Rust"
                            : "e.g., Senior Engineer"
                      }
                      className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors duration-200"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  {/* Delivery method */}
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Delivery
                    </label>
                    <div className="flex items-center gap-3" role="radiogroup" aria-label="Delivery method">
                      {DELIVERY_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className="inline-flex items-center gap-2 cursor-pointer"
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-200"
                            style={{
                              border: `2px solid ${formDelivery === opt.value ? "var(--cyan)" : "var(--border-default)"}`,
                              backgroundColor: formDelivery === opt.value ? "var(--cyan)" : "transparent",
                            }}
                            aria-hidden="true"
                          >
                            {formDelivery === opt.value && (
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: "var(--text-inverse)" }}
                              />
                            )}
                          </span>
                          <input
                            type="radio"
                            name="delivery"
                            value={opt.value}
                            checked={formDelivery === opt.value}
                            onChange={() => setFormDelivery(opt.value)}
                            className="sr-only"
                          />
                          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="pt-2">
                    <Button
                      variant="primary"
                      size="md"
                      loading={creating}
                      onClick={createAlert}
                    >
                      Create Alert
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {alertsLoading && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonItem key={i} />
                ))}
              </div>
            )}

            {/* Alerts list */}
            {!alertsLoading && alerts.length > 0 && (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const cfg = alertTypeConfig(alert.alert_type);
                  const isDeleteConfirm = deleteConfirmId === alert.id;

                  return (
                    <article
                      key={alert.id}
                      className="rounded-xl p-5 transition-all duration-200"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: `1px solid ${alert.is_active ? "var(--border-subtle)" : "var(--border-subtle)"}`,
                        boxShadow: "var(--shadow-card)",
                        opacity: alert.is_active ? 1 : 0.65,
                      }}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        {/* Alert info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span
                              className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: "var(--bg-overlay)",
                                color: "var(--text-muted)",
                              }}
                            >
                              {alert.delivery === "both"
                                ? "In-app + Email"
                                : alert.delivery === "email"
                                  ? "Email"
                                  : "In-app"}
                            </span>
                          </div>
                          <p
                            className="text-sm"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {formatConditions(alert.conditions)}
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center gap-3 shrink-0">
                          <ToggleSwitch
                            active={alert.is_active}
                            onToggle={() => toggleAlert(alert.id)}
                            disabled={togglingId === alert.id}
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirmId(isDeleteConfirm ? null : alert.id)
                            }
                            className="p-2 rounded-lg transition-colors duration-200"
                            style={{
                              color: "var(--text-muted)",
                              backgroundColor: "transparent",
                            }}
                            aria-label="Delete alert"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>

                      {/* Delete confirmation */}
                      {isDeleteConfirm && (
                        <div
                          className="flex items-center gap-2 px-3 py-2 rounded-lg mt-3 animate-fade-up"
                          style={{
                            backgroundColor: "var(--red-08)",
                            border: "1px solid var(--red-15)",
                          }}
                        >
                          <p
                            className="text-xs flex-1"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Remove this alert?
                          </p>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => deleteAlert(alert.id)}
                          >
                            Remove
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!alertsLoading && alerts.length === 0 && !showCreateForm && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <EmptyIcon />
                <div className="text-center">
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No alerts configured
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Create a smart alert to get notified about market changes, new roles, and more.
                  </p>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
