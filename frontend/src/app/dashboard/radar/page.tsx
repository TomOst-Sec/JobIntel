"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { GhostScore } from "@/components/ui/ghost-score";
import { LiveCounter } from "@/components/ui/live-counter";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* ── Types ───────────────────────────────────────────── */

interface LayoffSignal {
  signal: string;
  severity: string;
  detail: string;
}

interface LayoffResult {
  company: string;
  risk_score: number;
  risk_level: string;
  signals: LayoffSignal[];
  recent_14d_postings: number;
  total_historical_postings: number;
  ai_assessment?: string;
}

interface IpoSignal {
  signal: string;
  severity: string;
  detail: string;
}

interface IpoResult {
  company: string;
  ipo_probability: number;
  confidence: string;
  signals: IpoSignal[];
  ipo_related_roles: { title: string; pattern: string }[];
  ai_assessment?: string;
}

interface GhostSignalEvidence {
  signal: string;
  weight: number;
  desc: string;
}

interface GhostResult {
  job_id?: number;
  title: string;
  company: string;
  location?: string;
  ghost_score: number;
  verdict: string;
  signals: GhostSignalEvidence[];
}

interface GhostStats {
  total_analyzed: number;
  likely_ghost: number;
  suspicious: number;
  ghost_rate: number;
}

interface GhostScanResponse {
  scanned: number;
  likely_ghost: number;
  suspicious: number;
  results: GhostResult[];
}

type TabId = "layoff" | "ipo" | "ghost";

/* ── Helpers ─────────────────────────────────────────── */

function severityColor(s: string): { color: string; bg: string } {
  switch (s) {
    case "critical":
      return { color: "var(--red)", bg: "var(--red-15)" };
    case "high":
      return { color: "#ff8800", bg: "rgba(255,136,0,0.15)" };
    case "medium":
      return { color: "var(--gold)", bg: "var(--gold-15)" };
    default:
      return { color: "var(--green)", bg: "var(--green-15)" };
  }
}

function riskScoreColor(score: number): string {
  if (score >= 75) return "var(--red)";
  if (score >= 50) return "#ff8800";
  if (score >= 25) return "var(--gold)";
  return "var(--green)";
}

function ipoProbColor(prob: number): string {
  if (prob >= 0.4) return "var(--green)";
  if (prob >= 0.2) return "var(--gold)";
  return "var(--text-muted)";
}

/* ── Icons ───────────────────────────────────────────── */

function SearchIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="10" cy="10" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3L18 17H2L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8v4M10 14h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrendUpIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 15l5-6 3 3 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 4h5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GhostIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 17V10a6 6 0 0112 0v7l-2.5-2-2 2L10 15.5 8.5 17l-2-2L4 17z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="10" r="1" fill="currentColor" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg className="w-12 h-12" viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M24 4v8M24 36v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function MapPinIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="6" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/* ── Skeleton card ───────────────────────────────────── */

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-6"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="shimmer h-5 w-36 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="shimmer h-10 w-16 rounded-lg" style={{ backgroundColor: "var(--bg-elevated)" }} />
      </div>
      <div className="space-y-3">
        <div className="shimmer h-4 w-full rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="shimmer h-4 w-3/4 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="shimmer h-4 w-1/2 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
      </div>
      <div className="flex gap-4 mt-4">
        <div className="shimmer h-3 w-24 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
        <div className="shimmer h-3 w-24 rounded" style={{ backgroundColor: "var(--bg-elevated)" }} />
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

/* ── Search input ────────────────────────────────────── */

function CompanySearchInput({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  placeholder: string;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 glass"
      style={{
        border: "1px solid var(--border-subtle)",
      }}
    >
      <SearchIcon className="w-4 h-4 shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch();
        }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none"
        style={{ color: "var(--text-primary)" }}
        aria-label={placeholder}
      />
    </div>
  );
}

/* ── Pulse progress indicator ────────────────────────── */

function ScanProgress({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg"
      style={{
        backgroundColor: "var(--cyan-08)",
        border: "1px solid var(--cyan-15)",
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="w-2.5 h-2.5 rounded-full live-pulse shrink-0"
        style={{ backgroundColor: "var(--cyan)" }}
        aria-hidden="true"
      />
      <span className="text-sm font-medium" style={{ color: "var(--cyan)" }}>
        {label}
      </span>
    </div>
  );
}

/* ── Main page component ─────────────────────────────── */

export default function RadarPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("layoff");

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Layoff state
  const [layoffResults, setLayoffResults] = useState<LayoffResult[]>([]);
  const [layoffLoading, setLayoffLoading] = useState(false);
  const [layoffScanned, setLayoffScanned] = useState(0);
  const [layoffSearch, setLayoffSearch] = useState("");
  const [expandedLayoff, setExpandedLayoff] = useState<string | null>(null);
  const layoffFetchedRef = useRef(false);

  // IPO state
  const [ipoResults, setIpoResults] = useState<IpoResult[]>([]);
  const [ipoLoading, setIpoLoading] = useState(false);
  const [ipoScanned, setIpoScanned] = useState(0);
  const [ipoSearch, setIpoSearch] = useState("");
  const [expandedIpo, setExpandedIpo] = useState<string | null>(null);
  const ipoFetchedRef = useRef(false);

  // Ghost state
  const [ghostStats, setGhostStats] = useState<GhostStats | null>(null);
  const [ghostResults, setGhostResults] = useState<GhostResult[]>([]);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostStatsLoading, setGhostStatsLoading] = useState(false);
  const [ghostScanning, setGhostScanning] = useState(false);
  const ghostStatsFetchedRef = useRef(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Fetch ghost stats on first tab visit
  useEffect(() => {
    if (activeTab === "ghost" && !ghostStatsFetchedRef.current && user) {
      ghostStatsFetchedRef.current = true;
      setGhostStatsLoading(true);
      api
        .get<GhostStats>("/intelligence/ghost/stats")
        .then(setGhostStats)
        .catch((err) => setError(err.message || "Failed to load ghost stats"))
        .finally(() => setGhostStatsLoading(false));
    }
  }, [activeTab, user]);

  // Summary stats
  const totalSignals =
    layoffResults.reduce((acc, r) => acc + r.signals.length, 0) +
    ipoResults.reduce((acc, r) => acc + r.signals.length, 0);
  const companiesAnalyzed = new Set([
    ...layoffResults.map((r) => r.company),
    ...ipoResults.map((r) => r.company),
  ]).size;

  /* ── Layoff handlers ───────────────────────────────── */

  const scanAllLayoff = useCallback(async () => {
    setLayoffLoading(true);
    try {
      const data = await api.get<{ companies_scanned: number; results: LayoffResult[] }>(
        "/intelligence/radar/layoff"
      );
      setLayoffResults(data.results || []);
      setLayoffScanned(data.companies_scanned || 0);
      layoffFetchedRef.current = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Layoff scan failed";
      setError(msg);
    } finally {
      setLayoffLoading(false);
    }
  }, []);

  const searchLayoffCompany = useCallback(async () => {
    const q = layoffSearch.trim();
    if (!q) return;
    setLayoffLoading(true);
    try {
      const data = await api.get<LayoffResult>(
        `/intelligence/radar/layoff/${encodeURIComponent(q)}`
      );
      setLayoffResults([data]);
      setLayoffScanned(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Company search failed";
      setError(msg);
    } finally {
      setLayoffLoading(false);
    }
  }, [layoffSearch]);

  /* ── IPO handlers ──────────────────────────────────── */

  const scanAllIpo = useCallback(async () => {
    setIpoLoading(true);
    try {
      const data = await api.get<{ companies_scanned: number; results: IpoResult[] }>(
        "/intelligence/radar/ipo"
      );
      setIpoResults(data.results || []);
      setIpoScanned(data.companies_scanned || 0);
      ipoFetchedRef.current = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "IPO scan failed";
      setError(msg);
    } finally {
      setIpoLoading(false);
    }
  }, []);

  const searchIpoCompany = useCallback(async () => {
    const q = ipoSearch.trim();
    if (!q) return;
    setIpoLoading(true);
    try {
      const data = await api.get<IpoResult>(
        `/intelligence/radar/ipo/${encodeURIComponent(q)}`
      );
      setIpoResults([data]);
      setIpoScanned(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Company search failed";
      setError(msg);
    } finally {
      setIpoLoading(false);
    }
  }, [ipoSearch]);

  /* ── Ghost handlers ────────────────────────────────── */

  const runGhostScan = useCallback(async () => {
    setGhostScanning(true);
    setGhostLoading(true);
    try {
      const data = await api.post<GhostScanResponse>("/intelligence/ghost/scan?limit=50");
      setGhostResults(data.results || []);
      // Refresh stats after scan
      setGhostStats({
        total_analyzed: data.scanned,
        likely_ghost: data.likely_ghost,
        suspicious: data.suspicious,
        ghost_rate: data.scanned > 0 ? Math.round((data.likely_ghost / data.scanned) * 100) : 0,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ghost scan failed";
      setError(msg);
    } finally {
      setGhostScanning(false);
      setGhostLoading(false);
    }
  }, []);

  /* ── Tab config ────────────────────────────────────── */

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "layoff", label: "Layoff Radar", icon: <AlertTriangleIcon /> },
    { id: "ipo", label: "IPO Watch", icon: <TrendUpIcon /> },
    { id: "ghost", label: "Ghost Detector", icon: <GhostIcon /> },
  ];

  /* ── Auth guard render ─────────────────────────────── */

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
              <RadarIcon />
            </div>
            <div>
              <h1
                className="text-2xl font-display font-bold tracking-tight"
                style={{ color: "var(--text-primary)" }}
              >
                Intelligence Radar
              </h1>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Real-time company risk and opportunity analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-lg font-display font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {totalSignals}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Signals
              </p>
            </div>
            <div
              className="w-px h-8"
              style={{ backgroundColor: "var(--border-subtle)" }}
              aria-hidden="true"
            />
            <div className="text-right">
              <p className="text-lg font-display font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                {companiesAnalyzed}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Companies
              </p>
            </div>
          </div>
        </div>

        {/* ── Tab buttons ──────────────────────────────── */}
        <div
          className="inline-flex items-center gap-1 rounded-xl p-1 mb-8"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
          role="tablist"
          aria-label="Radar views"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
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

        {/* ── Tab panels ───────────────────────────────── */}

        {/* Layoff Radar */}
        {activeTab === "layoff" && (
          <section id="panel-layoff" role="tabpanel" aria-label="Layoff Radar">
            {/* Search + scan */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <CompanySearchInput
                value={layoffSearch}
                onChange={setLayoffSearch}
                onSearch={searchLayoffCompany}
                placeholder="Search company for layoff risk..."
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="md"
                  loading={layoffLoading && layoffSearch.trim().length > 0}
                  onClick={searchLayoffCompany}
                  disabled={!layoffSearch.trim()}
                >
                  Analyze
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  loading={layoffLoading && layoffSearch.trim().length === 0}
                  onClick={scanAllLayoff}
                >
                  Scan All Companies
                </Button>
              </div>
            </div>

            {/* Scanning progress */}
            {layoffLoading && (
              <div className="mb-6">
                <ScanProgress label="Scanning companies for layoff risk signals..." />
              </div>
            )}

            {/* Loading skeleton */}
            {layoffLoading && layoffResults.length === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Results grid */}
            {!layoffLoading && layoffResults.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {layoffResults.map((r) => {
                  const isExpanded = expandedLayoff === r.company;
                  return (
                    <article
                      key={r.company}
                      className="rounded-xl p-5 transition-all duration-200 hover:translate-y-[-1px] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: `1px solid ${isExpanded ? "var(--border-default)" : "var(--border-subtle)"}`,
                        boxShadow: "var(--shadow-card)",
                      }}
                      onClick={() => setExpandedLayoff(isExpanded ? null : r.company)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedLayoff(isExpanded ? null : r.company);
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3
                            className="font-semibold text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {r.company}
                          </h3>
                          <ChevronDownIcon
                            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                        <div className="text-right">
                          <p
                            className="text-3xl font-display font-bold tabular-nums leading-none"
                            style={{ color: riskScoreColor(r.risk_score) }}
                          >
                            {r.risk_score}
                          </p>
                          <span
                            className="text-[10px] font-semibold tracking-wider uppercase mt-1 inline-block px-2 py-0.5 rounded-full"
                            style={{
                              color: riskScoreColor(r.risk_score),
                              backgroundColor: r.risk_score >= 75
                                ? "var(--red-15)"
                                : r.risk_score >= 50
                                  ? "rgba(255,136,0,0.15)"
                                  : r.risk_score >= 25
                                    ? "var(--gold-15)"
                                    : "var(--green-15)",
                            }}
                          >
                            {r.risk_level}
                          </span>
                        </div>
                      </div>

                      {/* Signals */}
                      {r.signals.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {r.signals.slice(0, isExpanded ? undefined : 3).map((s, i) => {
                            const sc = severityColor(s.severity);
                            return (
                              <div key={i} className="flex items-start gap-2">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 mt-0.5"
                                  style={{ color: sc.color, backgroundColor: sc.bg }}
                                >
                                  {s.severity}
                                </span>
                                <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                                  {s.detail}
                                </p>
                              </div>
                            );
                          })}
                          {!isExpanded && r.signals.length > 3 && (
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                              +{r.signals.length - 3} more signals
                            </p>
                          )}
                        </div>
                      )}

                      {/* AI Assessment (expanded) */}
                      {isExpanded && r.ai_assessment && (
                        <div
                          className="rounded-lg p-3 mb-3 animate-fade-up"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                            AI Assessment
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                            {r.ai_assessment}
                          </p>
                        </div>
                      )}

                      {/* Stats footer */}
                      <div
                        className="flex items-center gap-4 pt-3 mt-auto"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {r.total_historical_postings.toLocaleString()} historical
                        </span>
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {r.recent_14d_postings} last 14d
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!layoffLoading && layoffResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <EmptyIcon />
                <div className="text-center">
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No layoff risk data yet
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Search a company or scan all to detect layoff risk signals
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* IPO Watch */}
        {activeTab === "ipo" && (
          <section id="panel-ipo" role="tabpanel" aria-label="IPO Watch">
            {/* Search + scan */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <CompanySearchInput
                value={ipoSearch}
                onChange={setIpoSearch}
                onSearch={searchIpoCompany}
                placeholder="Search company for IPO signals..."
              />
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="md"
                  loading={ipoLoading && ipoSearch.trim().length > 0}
                  onClick={searchIpoCompany}
                  disabled={!ipoSearch.trim()}
                >
                  Analyze
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  loading={ipoLoading && ipoSearch.trim().length === 0}
                  onClick={scanAllIpo}
                >
                  Scan All Companies
                </Button>
              </div>
            </div>

            {/* Scanning progress */}
            {ipoLoading && (
              <div className="mb-6">
                <ScanProgress label="Scanning companies for pre-IPO hiring patterns..." />
              </div>
            )}

            {/* Loading skeleton */}
            {ipoLoading && ipoResults.length === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Results grid */}
            {!ipoLoading && ipoResults.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {ipoResults.map((r) => {
                  const isExpanded = expandedIpo === r.company;
                  const probPct = Math.round(r.ipo_probability * 100);
                  return (
                    <article
                      key={r.company}
                      className="rounded-xl p-5 transition-all duration-200 hover:translate-y-[-1px] cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        border: `1px solid ${isExpanded ? "var(--border-default)" : "var(--border-subtle)"}`,
                        boxShadow: "var(--shadow-card)",
                      }}
                      onClick={() => setExpandedIpo(isExpanded ? null : r.company)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedIpo(isExpanded ? null : r.company);
                        }
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h3
                            className="font-semibold text-base"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {r.company}
                          </h3>
                          <ChevronDownIcon
                            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                        <div className="text-right">
                          <p
                            className="text-3xl font-display font-bold tabular-nums leading-none"
                            style={{ color: ipoProbColor(r.ipo_probability) }}
                          >
                            {probPct}%
                          </p>
                          <span
                            className="text-[10px] font-semibold tracking-wider uppercase mt-1 inline-block px-2 py-0.5 rounded-full"
                            style={{
                              color: "var(--text-secondary)",
                              backgroundColor: "var(--bg-elevated)",
                            }}
                          >
                            {r.confidence}
                          </span>
                        </div>
                      </div>

                      {/* Signals */}
                      {r.signals.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {r.signals.slice(0, isExpanded ? undefined : 3).map((s, i) => {
                            const sc = severityColor(s.severity);
                            return (
                              <div key={i} className="flex items-start gap-2">
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 mt-0.5"
                                  style={{ color: sc.color, backgroundColor: sc.bg }}
                                >
                                  {s.severity}
                                </span>
                                <p className="text-sm leading-snug" style={{ color: "var(--text-secondary)" }}>
                                  {s.detail}
                                </p>
                              </div>
                            );
                          })}
                          {!isExpanded && r.signals.length > 3 && (
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                              +{r.signals.length - 3} more signals
                            </p>
                          )}
                        </div>
                      )}

                      {/* IPO-related roles */}
                      {r.ipo_related_roles.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-semibold tracking-wider uppercase mb-1.5" style={{ color: "var(--text-muted)" }}>
                            IPO-Related Roles
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {r.ipo_related_roles.map((role, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  color: "var(--cyan)",
                                  backgroundColor: "var(--cyan-15)",
                                }}
                              >
                                {role.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Assessment (expanded) */}
                      {isExpanded && r.ai_assessment && (
                        <div
                          className="rounded-lg p-3 mb-3 animate-fade-up"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
                            AI Assessment
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                            {r.ai_assessment}
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!ipoLoading && ipoResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <EmptyIcon />
                <div className="text-center">
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No IPO watch data yet
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Search a company or scan all to detect pre-IPO hiring patterns
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Ghost Detector */}
        {activeTab === "ghost" && (
          <section id="panel-ghost" role="tabpanel" aria-label="Ghost Detector">
            {/* Ghost stats summary */}
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl p-5 mb-6"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <LiveCounter
                value={ghostStats?.total_analyzed ?? 0}
                label="Total Analyzed"
              />
              <LiveCounter
                value={ghostStats?.likely_ghost ?? 0}
                label="Likely Ghost"
                trend={ghostStats && ghostStats.likely_ghost > 0 ? "up" : undefined}
              />
              <LiveCounter
                value={ghostStats?.suspicious ?? 0}
                label="Suspicious"
              />
              <LiveCounter
                value={ghostStats?.ghost_rate ?? 0}
                label="Ghost Rate"
                suffix="%"
              />
            </div>

            {/* Scan button */}
            <div className="mb-6">
              <Button
                variant="primary"
                size="md"
                loading={ghostScanning}
                onClick={runGhostScan}
              >
                {ghostScanning ? "Scanning..." : "Run Ghost Scan"}
              </Button>
            </div>

            {/* Scan progress */}
            {ghostScanning && (
              <div className="mb-6">
                <ScanProgress label="Scanning job listings for ghost postings..." />
              </div>
            )}

            {/* Loading skeleton */}
            {ghostLoading && ghostResults.length === 0 && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            )}

            {/* Results */}
            {!ghostLoading && ghostResults.length > 0 && (
              <div className="space-y-3">
                {ghostResults.map((r, idx) => (
                  <article
                    key={r.job_id ?? idx}
                    className="rounded-xl p-5 transition-all duration-200"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3
                          className="font-semibold text-base truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {r.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                            {r.company}
                          </span>
                          {r.location && (
                            <span
                              className="inline-flex items-center gap-1 text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <MapPinIcon />
                              {r.location}
                            </span>
                          )}
                        </div>

                        {/* Verdict badge */}
                        <div className="mt-2">
                          <span
                            className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full"
                            style={{
                              color: r.ghost_score >= 50 ? "var(--red)" : r.ghost_score >= 25 ? "var(--gold)" : "var(--green)",
                              backgroundColor: r.ghost_score >= 50 ? "var(--red-15)" : r.ghost_score >= 25 ? "var(--gold-15)" : "var(--green-15)",
                            }}
                          >
                            {r.verdict}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <GhostScore
                          score={r.ghost_score}
                          showLabel
                          size="md"
                          showEvidence
                          signals={r.signals}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!ghostLoading && !ghostScanning && ghostResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <EmptyIcon />
                <div className="text-center">
                  <p className="font-medium" style={{ color: "var(--text-secondary)" }}>
                    No ghost scan results yet
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                    Run a ghost scan to analyze job listings for phantom postings
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
