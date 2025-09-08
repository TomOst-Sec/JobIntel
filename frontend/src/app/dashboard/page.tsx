"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TopNav } from "@/components/layout/top-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { LiveCounter } from "@/components/ui/live-counter";
import { IntelligenceCard } from "@/components/ui/intelligence-card";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface JobStats {
  total_jobs: number;
  unique_companies: number;
  markets: number;
  with_salary: number;
}

interface MarketData {
  market_id: string;
  total_jobs: number;
  unique_companies: number;
  categories_active: number;
  remote_jobs: number;
  remote_pct: number | null;
  avg_salary: number | null;
}

interface ScalingCompany {
  company: string;
  market_id: string;
  total_postings: number;
  unique_categories: number;
  categories: string;
}

interface Signal {
  id: number;
  signal_type: string;
  company: string;
  severity: string;
  title: string;
  description: string;
  detected_at: string;
}

interface GhostStats {
  total_analyzed: number;
  likely_ghost: number;
  suspicious: number;
  likely_real: number;
}

interface ApplicationStats {
  saved: number;
  applied: number;
  phone_screen: number;
  interview: number;
  offer: number;
  rejected: number;
  withdrawn: number;
  accepted: number;
}

type SignalType = "layoff" | "ipo" | "ghost" | "scaling" | "salary" | "market";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const SIGNAL_TYPE_MAP: Record<string, SignalType> = {
  layoff_risk: "layoff",
  ipo_signal: "ipo",
  ghost_detected: "ghost",
  salary_spike: "salary",
  scaling_detected: "scaling",
};

function mapSignalType(raw: string): SignalType {
  return SIGNAL_TYPE_MAP[raw] ?? "market";
}

function signalCta(type: SignalType): { label: string; href: string } {
  switch (type) {
    case "layoff":
      return { label: "View Radar", href: "/dashboard/radar" };
    case "ghost":
      return { label: "Ghost Analysis", href: "/dashboard/radar" };
    case "scaling":
      return { label: "View Companies", href: "/seeker/companies" };
    case "salary":
      return { label: "Salary Intel", href: "/seeker" };
    case "ipo":
      return { label: "Company Profile", href: "/seeker/companies" };
    default:
      return { label: "Explore", href: "/seeker" };
  }
}

function formatMarketName(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatCurrency(value: number): string {
  if (value >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${value.toLocaleString()}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function firstName(fullName: string): string {
  return fullName.split(" ")[0] || fullName;
}

/* -------------------------------------------------------------------------- */
/*  Skeleton Components                                                       */
/* -------------------------------------------------------------------------- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`shimmer rounded-lg ${className}`}
      style={{ backgroundColor: "var(--bg-surface)" }}
      aria-hidden="true"
    />
  );
}

function SkeletonCounterRow() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="card p-6"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
        >
          <SkeletonBlock className="h-8 w-24 mb-2" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

function SkeletonIntelFeed() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

function SkeletonRightColumn() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-64 w-full" />
      <SkeletonBlock className="h-48 w-full" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pipeline Visualization                                                    */
/* -------------------------------------------------------------------------- */

interface PipelineStage {
  label: string;
  key: keyof ApplicationStats;
  color: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { label: "Saved", key: "saved", color: "var(--text-secondary)" },
  { label: "Applied", key: "applied", color: "var(--cyan)" },
  { label: "Screening", key: "phone_screen", color: "var(--gold)" },
  { label: "Interview", key: "interview", color: "var(--purple)" },
  { label: "Offer", key: "offer", color: "var(--green)" },
];

function ApplicationPipeline({ stats }: { stats: ApplicationStats }) {
  const values = PIPELINE_STAGES.map((s) => stats[s.key]);
  const maxVal = Math.max(...values, 1);

  const totalActive =
    stats.saved + stats.applied + stats.phone_screen + stats.interview + stats.offer;

  return (
    <div
      className="card p-5"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          Application Pipeline
        </h3>
        <Link
          href="/dashboard/tracker"
          className="text-xs font-medium transition-colors duration-200"
          style={{ color: "var(--cyan)" }}
        >
          View Tracker
        </Link>
      </div>

      {totalActive === 0 ? (
        <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>
          No applications tracked yet. Save a job to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {PIPELINE_STAGES.map((stage) => {
            const val = stats[stage.key];
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span
                  className="text-xs font-medium w-20 shrink-0 text-right"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {stage.label}
                </span>
                <div
                  className="flex-1 h-6 rounded-md overflow-hidden relative"
                  style={{ backgroundColor: "var(--bg-deep)" }}
                >
                  <div
                    className="h-full rounded-md transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(pct, val > 0 ? 8 : 0)}%`,
                      backgroundColor: stage.color,
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span
                  className="text-sm font-semibold tabular-nums w-8 text-right"
                  style={{ color: stage.color }}
                >
                  {val}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(stats.rejected > 0 || stats.withdrawn > 0 || stats.accepted > 0) && (
        <div
          className="flex gap-4 mt-4 pt-3 text-xs"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          {stats.accepted > 0 && (
            <span style={{ color: "var(--green)" }}>
              {stats.accepted} accepted
            </span>
          )}
          {stats.rejected > 0 && (
            <span style={{ color: "var(--red)" }}>
              {stats.rejected} rejected
            </span>
          )}
          {stats.withdrawn > 0 && (
            <span style={{ color: "var(--text-muted)" }}>
              {stats.withdrawn} withdrawn
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Market Card                                                               */
/* -------------------------------------------------------------------------- */

function MarketCard({ market }: { market: MarketData }) {
  return (
    <Link
      href={`/seeker?market=${market.market_id}`}
      className="card p-4 block transition-all duration-200 hover:translate-y-[-2px] group"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <h4
        className="text-sm font-semibold mb-3 group-hover:text-[var(--cyan)] transition-colors duration-200"
        style={{ color: "var(--text-primary)" }}
      >
        {formatMarketName(market.market_id)}
      </h4>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p style={{ color: "var(--text-muted)" }}>Jobs</p>
          <p className="font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
            {market.total_jobs.toLocaleString()}
          </p>
        </div>
        <div>
          <p style={{ color: "var(--text-muted)" }}>Avg Salary</p>
          <p className="font-semibold mt-0.5" style={{ color: "var(--green)" }}>
            {market.avg_salary ? formatCurrency(market.avg_salary) : "N/A"}
          </p>
        </div>
        <div>
          <p style={{ color: "var(--text-muted)" }}>Remote</p>
          <p className="font-semibold mt-0.5" style={{ color: "var(--cyan)" }}>
            {market.remote_pct ?? 0}%
          </p>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Scaling Companies Table                                                   */
/* -------------------------------------------------------------------------- */

function ScalingTable({ companies }: { companies: ScalingCompany[] }) {
  return (
    <div
      className="card overflow-hidden"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <h3
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          Scaling Companies
        </h3>
        <Link
          href="/seeker/companies"
          className="text-xs font-medium transition-colors duration-200"
          style={{ color: "var(--cyan)" }}
        >
          View All
        </Link>
      </div>

      {companies.length === 0 ? (
        <p className="px-5 pb-5 text-sm" style={{ color: "var(--text-muted)" }}>
          No scaling data available yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <th
                  className="text-left px-5 py-2 text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Company
                </th>
                <th
                  className="text-right px-5 py-2 text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Postings
                </th>
                <th
                  className="text-left px-5 py-2 text-xs font-medium uppercase tracking-wider hidden sm:table-cell"
                  style={{ color: "var(--text-muted)" }}
                >
                  Categories
                </th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => (
                <tr
                  key={`${c.company}-${i}`}
                  className="transition-colors duration-150"
                  style={{
                    borderBottom:
                      i < companies.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/seeker/companies?q=${encodeURIComponent(c.company)}`}
                      className="font-medium hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {c.company}
                    </Link>
                  </td>
                  <td
                    className="px-5 py-3 text-right font-semibold tabular-nums"
                    style={{ color: "var(--green)" }}
                  >
                    {c.total_postings}
                  </td>
                  <td
                    className="px-5 py-3 hidden sm:table-cell truncate max-w-[200px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {c.categories}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pulsing Dot                                                               */
/* -------------------------------------------------------------------------- */

function PulsingDot() {
  return (
    <span className="relative flex items-center justify-center w-2.5 h-2.5">
      <span
        className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
        style={{ backgroundColor: "var(--green)" }}
      />
      <span
        className="relative inline-flex w-2 h-2 rounded-full"
        style={{ backgroundColor: "var(--green)" }}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page Component                                                       */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  /* ---- Data state ---- */
  const [stats, setStats] = useState<JobStats | null>(null);
  const [ghostStats, setGhostStats] = useState<GhostStats | null>(null);
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [scaling, setScaling] = useState<ScalingCompany[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [appStats, setAppStats] = useState<ApplicationStats | null>(null);

  /* ---- Loading state per section ---- */
  const [statsLoading, setStatsLoading] = useState(true);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [rightLoading, setRightLoading] = useState(true);

  /* ---- Auth guard ---- */
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  /* ---- Fetch public data ---- */
  const fetchPublicData = useCallback(async () => {
    setStatsLoading(true);
    try {
      const safeFetch = (url: string) =>
        fetch(url).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

      const [jobStats, ghostData, marketData] = await Promise.allSettled([
        safeFetch("/api/v1/jobs/stats") as Promise<JobStats>,
        safeFetch("/api/v1/intelligence/ghost/stats") as Promise<GhostStats>,
        safeFetch("/api/v1/jobs/markets") as Promise<MarketData[]>,
      ]);

      if (jobStats.status === "fulfilled" && jobStats.value?.total_jobs != null)
        setStats(jobStats.value);
      if (ghostData.status === "fulfilled" && ghostData.value?.total_analyzed != null)
        setGhostStats(ghostData.value);
      if (marketData.status === "fulfilled" && Array.isArray(marketData.value)) {
        const sorted = [...marketData.value].sort((a, b) => b.total_jobs - a.total_jobs);
        setMarkets(sorted);
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /* ---- Fetch authenticated data ---- */
  const fetchAuthData = useCallback(async () => {
    setSignalsLoading(true);
    setRightLoading(true);
    try {
      const [signalData, scalingData, appData] = await Promise.allSettled([
        api.get<Signal[]>("/intelligence/signals?limit=30"),
        api.get<ScalingCompany[]>("/jobs/scaling-companies?min_postings=3"),
        api.get<ApplicationStats>("/applications/stats"),
      ]);

      if (signalData.status === "fulfilled" && Array.isArray(signalData.value))
        setSignals(signalData.value);
      if (scalingData.status === "fulfilled" && Array.isArray(scalingData.value))
        setScaling(scalingData.value);
      if (appData.status === "fulfilled" && appData.value?.saved != null)
        setAppStats(appData.value);
    } finally {
      setSignalsLoading(false);
      setRightLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicData();
  }, [fetchPublicData]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchAuthData();
    }
  }, [authLoading, user, fetchAuthData]);

  /* ---- Auth guard render ---- */
  if (authLoading || !user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-void)" }}
      >
        <div className="shimmer w-8 h-8 rounded-full" />
      </div>
    );
  }

  const today = formatDate(new Date());
  const greeting = firstName(user.full_name || user.email);

  return (
    <div
      className="min-h-screen pb-20 md:pb-0"
      style={{ backgroundColor: "var(--bg-void)" }}
    >
      <TopNav showSearch />
      <MobileNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ---------------------------------------------------------------- */}
        {/*  Hero Section                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section className="relative mb-8 sm:mb-10">
          {/* Gradient glow background */}
          <div
            className="absolute -inset-x-4 -inset-y-4 rounded-2xl opacity-30 blur-3xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 30% 50%, var(--cyan-15), transparent 60%), radial-gradient(ellipse at 70% 50%, var(--purple-15, rgba(147,51,234,0.08)), transparent 60%)",
            }}
            aria-hidden="true"
          />

          <div className="relative">
            <h1
              className="font-display text-3xl sm:text-4xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Command Center
            </h1>
            <p className="mt-2 text-lg" style={{ color: "var(--text-secondary)" }}>
              Welcome back,{" "}
              <span style={{ color: "var(--cyan)" }}>{greeting}</span>
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Your intelligence briefing for {today}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  Live Stats Row                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className="mb-8 sm:mb-10" aria-label="Key metrics">
          {statsLoading ? (
            <SkeletonCounterRow />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                className="card p-5 sm:p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
              >
                <LiveCounter
                  value={stats?.total_jobs ?? 0}
                  label="Total Jobs Tracked"
                  trend="up"
                  trendValue="Live"
                />
              </div>
              <div
                className="card p-5 sm:p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
              >
                <LiveCounter
                  value={stats?.unique_companies ?? 0}
                  label="Companies Monitored"
                  trend="up"
                  trendValue="Active"
                />
              </div>
              <div
                className="card p-5 sm:p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
              >
                <LiveCounter
                  value={stats?.markets ?? 0}
                  label="Markets Active"
                  trend="neutral"
                  trendValue="Tracked"
                />
              </div>
              <div
                className="card p-5 sm:p-6"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-subtle)" }}
              >
                <LiveCounter
                  value={ghostStats?.likely_ghost ?? 0}
                  label="Ghost Jobs Detected"
                  trend="down"
                  trendValue={
                    ghostStats
                      ? `${ghostStats.suspicious} suspicious`
                      : "Scanning"
                  }
                />
              </div>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/*  Two-Column Grid                                                 */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* ---- Left Column: Intelligence Feed ---- */}
          <section
            className="lg:col-span-7 space-y-4"
            aria-label="Intelligence feed"
          >
            <div className="flex items-center gap-2.5 mb-1">
              <PulsingDot />
              <h2
                className="text-sm font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)" }}
              >
                Live Intelligence Feed
              </h2>
            </div>

            {signalsLoading ? (
              <SkeletonIntelFeed />
            ) : signals.length === 0 ? (
              <div
                className="card p-8 text-center"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <svg
                  className="w-12 h-12 mx-auto mb-4 opacity-40"
                  viewBox="0 0 48 48"
                  fill="none"
                  aria-hidden="true"
                  style={{ color: "var(--text-muted)" }}
                >
                  <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
                  <circle cx="24" cy="24" r="12" stroke="currentColor" strokeWidth="2" />
                  <circle cx="24" cy="24" r="4" stroke="currentColor" strokeWidth="2" />
                  <path d="M24 4v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: "var(--text-secondary)" }}
                >
                  No intelligence signals yet
                </p>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                  Run a radar scan to generate insights.
                </p>
                <Link
                  href="/dashboard/radar"
                  className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
                  style={{ color: "var(--cyan)" }}
                >
                  Launch Radar
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 3l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {signals.map((signal) => {
                    const cardType = mapSignalType(signal.signal_type);
                    const cta = signalCta(cardType);
                    return (
                      <IntelligenceCard
                        key={signal.id}
                        type={cardType}
                        title={signal.title}
                        body={signal.description}
                        company={signal.company}
                        timestamp={signal.detected_at}
                        cta={cta}
                      />
                    );
                  })}
                </div>

                <div className="pt-2">
                  <Link
                    href="/dashboard/signals"
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-200"
                    style={{ color: "var(--cyan)" }}
                  >
                    View All Signals
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 3l4 4-4 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </div>
              </>
            )}
          </section>

          {/* ---- Right Column ---- */}
          <aside className="lg:col-span-5 space-y-6" aria-label="Overview panels">
            {rightLoading ? (
              <SkeletonRightColumn />
            ) : (
              <>
                {/* -- Application Pipeline -- */}
                {appStats && <ApplicationPipeline stats={appStats} />}

                {/* -- Market Overview -- */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Market Overview
                    </h3>
                    <Link
                      href="/seeker"
                      className="text-xs font-medium transition-colors duration-200"
                      style={{ color: "var(--cyan)" }}
                    >
                      All Markets
                    </Link>
                  </div>
                  {markets.length === 0 ? (
                    <div
                      className="card p-6 text-center"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        No market data available yet.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                      {markets.slice(0, 6).map((m) => (
                        <MarketCard key={m.market_id} market={m} />
                      ))}
                    </div>
                  )}
                </div>

                {/* -- Scaling Companies -- */}
                <ScalingTable companies={scaling.slice(0, 8)} />
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
